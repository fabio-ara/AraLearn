#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  assertLegacyCleanupCatalogSnapshot,
  buildLegacyCleanupSnapshotSql,
  canonicalJson,
  COURSE_SOURCE_PDF_BUCKET,
  LEGACY_CLEANUP_CONTRACTS,
  LEGACY_STORAGE_BUCKETS,
  scanLegacyRuntimeConsumers,
  sha256Canonical,
  validateFinalRuntimeManifest
} from "./legacyCleanupPlan.mjs";

const MAX_PROCESS_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_STORAGE_OBJECTS = 200_000;
const BACKUP_MANIFEST_FILE = "backup-manifest.json";
const STORAGE_CATALOG_CONTRACT = "aralearn.course-legacy-cleanup-storage-catalog.v1";
const DATABASE_RESTORE_CATALOG_CONTRACT =
  "aralearn.course-legacy-cleanup-database-restore-catalog.v1";
const SUPABASE_CLI_PACKAGE = "supabase@2.115.0";
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const RESTORED_DATABASE_SCHEMAS = Object.freeze([
  "auth",
  "private",
  "public",
  "storage",
  "supabase_migrations"
]);
const DATABASE_DUMP_FILES = Object.freeze([
  "database/roles.sql",
  "database/platform-schema.sql",
  "database/schema.sql",
  "database/platform-data.sql",
  "database/data.sql"
]);
const RESTORE_PLACEHOLDER_MARKER = "aralearn_restore_placeholder_v1";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") ||
      normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("unsafe_backup_path", `Caminho inseguro no backup: ${value}.`);
  }
  return normalized;
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    fail("invalid_cleanup_json", `Não foi possível ler ${filePath}: ${error.message}`);
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    byteSize += chunk.length;
  }
  return { sha256: hash.digest("hex"), byteSize };
}

export async function runProcess(command, argumentsList, options = {}) {
  return new Promise((resolve, reject) => {
    const inputParts = Array.isArray(options.inputParts) ? options.inputParts : null;
    const child = spawn(command, argumentsList, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: [inputParts ? "pipe" : "ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let inputError = null;
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROCESS_OUTPUT_BYTES) child.kill();
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_PROCESS_OUTPUT_BYTES) child.kill();
      else stderr.push(chunk);
    });
    if (inputParts) {
      async function* inputChunks() {
        for (const part of inputParts) {
          if (typeof part === "string") yield part;
          else if (isRecord(part) && text(part.file)) {
            for await (const chunk of createReadStream(part.file)) yield chunk;
          } else fail("invalid_cleanup_process_input", "A entrada do processo é inválida.");
        }
      }
      pipeline(Readable.from(inputChunks()), child.stdin).catch((error) => {
        inputError = error;
        child.kill();
      });
    }
    child.once("error", reject);
    child.once("close", (code) => {
      if (inputError) {
        reject(inputError);
        return;
      }
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };
      if (code !== 0) {
        const error = new Error(`Comando de backup falhou (${command}, código ${code}).`);
        error.code = "cleanup_backup_command_failed";
        error.result = result;
        reject(error);
      } else resolve(result);
    });
  });
}

function normalizeSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("invalid_cleanup_supabase_url", "A URL do Supabase é inválida.");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username ||
      parsed.password || parsed.search || parsed.hash) {
    fail("invalid_cleanup_supabase_url", "A URL do Supabase deve conter apenas a origem.");
  }
  return parsed.origin;
}

function storageHeaders(serviceRoleKey, extra = {}) {
  const key = text(serviceRoleKey);
  if (!key) fail("missing_cleanup_service_role", "A chave administrativa do Storage está ausente.");
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...extra
  };
}

async function storageRequest({
  fetchImpl,
  supabaseUrl,
  serviceRoleKey,
  pathname,
  method = "GET",
  body,
  headers = {},
  expected = [200]
}) {
  const response = await fetchImpl(`${supabaseUrl}/storage/v1${pathname}`, {
    method,
    headers: storageHeaders(serviceRoleKey, headers),
    body
  });
  if (!expected.includes(response.status)) {
    const detail = (await response.text()).slice(0, 500);
    fail(
      "cleanup_storage_request_failed",
      `Storage respondeu ${response.status} em ${method} ${pathname}: ${detail}`
    );
  }
  return response;
}

function encodedStoragePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function requiredStorageBuckets() {
  return [...LEGACY_STORAGE_BUCKETS, COURSE_SOURCE_PDF_BUCKET];
}

function validateProjectRef(projectRef) {
  const normalized = text(projectRef);
  if (!PROJECT_REF_PATTERN.test(normalized)) {
    fail("invalid_cleanup_project_ref", "O identificador do projeto Supabase é inválido.");
  }
  return normalized;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildDatabaseRestoreCatalogSql(projectRef) {
  const normalizedProjectRef = validateProjectRef(projectRef);
  const schemasSql = RESTORED_DATABASE_SCHEMAS.map(sqlLiteral).join(",");
  return `set timezone='UTC';
set search_path=pg_catalog;
create temporary table aralearn_restore_table_profiles(
  schema_name text not null,
  table_name text not null,
  row_count bigint not null,
  row_fingerprint text not null,
  primary key(schema_name,table_name)
);
do $capture_aralearn_restore_profiles$
declare relation_value record; v_count bigint; v_fingerprint text;
begin
  for relation_value in
    select namespace_value.nspname schema_name,relation_table.relname table_name
    from pg_class relation_table
    join pg_namespace namespace_value on namespace_value.oid=relation_table.relnamespace
    where namespace_value.nspname in (${schemasSql})
      and relation_table.relkind in ('r','p')
    order by namespace_value.nspname,relation_table.relname
  loop
    execute format(
$table_fingerprint$
select count(*)::bigint,
  md5(coalesce(string_agg(row_hash,'' order by row_hash),''))
from (select md5(to_jsonb(row_value)::text) row_hash from %I.%I row_value) fingerprints
$table_fingerprint$,
      relation_value.schema_name,relation_value.table_name
    ) into v_count,v_fingerprint;
    insert into aralearn_restore_table_profiles values(
      relation_value.schema_name,relation_value.table_name,v_count,v_fingerprint
    );
  end loop;
end;
$capture_aralearn_restore_profiles$;
select jsonb_build_object(
  'contract',${sqlLiteral(DATABASE_RESTORE_CATALOG_CONTRACT)},
  'projectRef',${sqlLiteral(normalizedProjectRef)},
  'schemas',to_jsonb(array[${schemasSql}]::text[]),
  'tables',(select coalesce(jsonb_agg(jsonb_build_object(
    'schema',profile_value.schema_name,
    'name',profile_value.table_name,
    'rowCount',profile_value.row_count,
    'rowFingerprint',profile_value.row_fingerprint
  ) order by profile_value.schema_name,profile_value.table_name),'[]'::jsonb)
  from aralearn_restore_table_profiles profile_value),
  'foreignKeys',(select coalesce(jsonb_agg(jsonb_build_object(
    'schema',child_namespace.nspname,
    'table',child_table.relname,
    'name',constraint_value.conname,
    'referencedSchema',parent_namespace.nspname,
    'referencedTable',parent_table.relname,
    'definition',pg_get_constraintdef(constraint_value.oid,true),
    'validated',constraint_value.convalidated
  ) order by child_namespace.nspname,child_table.relname,constraint_value.conname),'[]'::jsonb)
  from pg_constraint constraint_value
  join pg_class child_table on child_table.oid=constraint_value.conrelid
  join pg_namespace child_namespace on child_namespace.oid=child_table.relnamespace
  join pg_class parent_table on parent_table.oid=constraint_value.confrelid
  join pg_namespace parent_namespace on parent_namespace.oid=parent_table.relnamespace
  where constraint_value.contype='f' and child_namespace.nspname in (${schemasSql}))
) as database_restore_catalog;`;
}

function validateDatabaseRestoreCatalog(catalog, projectRef) {
  const expectedSchemas = [...RESTORED_DATABASE_SCHEMAS];
  if (!isRecord(catalog) || catalog.contract !== DATABASE_RESTORE_CATALOG_CONTRACT ||
      catalog.projectRef !== projectRef || !Array.isArray(catalog.schemas) ||
      canonicalJson(catalog.schemas) !== canonicalJson(expectedSchemas) ||
      !Array.isArray(catalog.tables) || !Array.isArray(catalog.foreignKeys)) {
    fail("invalid_cleanup_database_catalog", "O catálogo de restauração do banco é inválido.");
  }
  const tableIdentities = new Set();
  for (const profile of catalog.tables) {
    if (!isRecord(profile)) {
      fail("invalid_cleanup_database_catalog", "O catálogo contém uma tabela inválida.");
    }
    const schema = text(profile?.schema);
    const name = text(profile?.name);
    if (!expectedSchemas.includes(schema) || !name || name.includes("\0") ||
        !Number.isSafeInteger(profile.rowCount) || profile.rowCount < 0 ||
        !/^[0-9a-f]{32}$/u.test(profile.rowFingerprint || "")) {
      fail("invalid_cleanup_database_catalog", "O catálogo contém uma tabela inválida.");
    }
    const identity = `${schema}.${name}`;
    if (tableIdentities.has(identity)) {
      fail("invalid_cleanup_database_catalog", "O catálogo contém tabelas repetidas.");
    }
    tableIdentities.add(identity);
  }
  if (expectedSchemas.some((schema) =>
    !catalog.tables.some((profile) => profile.schema === schema))) {
    fail(
      "invalid_cleanup_database_catalog",
      "O catálogo não contém tabelas de todos os esquemas restaurados."
    );
  }
  const foreignKeyIdentities = new Set();
  for (const foreignKey of catalog.foreignKeys) {
    if (!isRecord(foreignKey)) {
      fail("invalid_cleanup_database_catalog", "O catálogo contém uma chave estrangeira inválida.");
    }
    const schema = text(foreignKey?.schema);
    const table = text(foreignKey?.table);
    const name = text(foreignKey?.name);
    if (!expectedSchemas.includes(schema) || !table || !name ||
        !text(foreignKey?.referencedSchema) || !text(foreignKey?.referencedTable) ||
        !text(foreignKey?.definition) || typeof foreignKey?.validated !== "boolean") {
      fail("invalid_cleanup_database_catalog", "O catálogo contém uma chave estrangeira inválida.");
    }
    const identity = `${schema}.${table}/${name}`;
    if (foreignKeyIdentities.has(identity)) {
      fail("invalid_cleanup_database_catalog", "O catálogo contém chaves estrangeiras repetidas.");
    }
    foreignKeyIdentities.add(identity);
  }
  const sortedTables = [...catalog.tables].sort((left, right) =>
    `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`));
  const sortedForeignKeys = [...catalog.foreignKeys].sort((left, right) =>
    `${left.schema}.${left.table}/${left.name}`.localeCompare(
      `${right.schema}.${right.table}/${right.name}`
    ));
  return {
    ...catalog,
    schemas: expectedSchemas,
    tables: sortedTables,
    foreignKeys: sortedForeignKeys
  };
}

function buildStorageCatalogSql(projectRef) {
  const bucketIds = requiredStorageBuckets().map(sqlLiteral).join(",");
  return `select jsonb_build_object(
  'contract',${sqlLiteral(STORAGE_CATALOG_CONTRACT)},
  'projectRef',${sqlLiteral(projectRef)},
  'buckets',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',bucket_value.id,'name',bucket_value.name,'public',bucket_value.public,
    'fileSizeLimit',bucket_value.file_size_limit,
    'allowedMimeTypes',bucket_value.allowed_mime_types,
    'createdAt',bucket_value.created_at,'updatedAt',bucket_value.updated_at
  ) order by bucket_value.id),'[]'::jsonb)
  from storage.buckets bucket_value where bucket_value.id in (${bucketIds})),
  'objects',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',object_value.id,'bucketId',object_value.bucket_id,'name',object_value.name,
    'metadata',object_value.metadata,'userMetadata',object_value.user_metadata,
    'createdAt',object_value.created_at,'updatedAt',object_value.updated_at,
    'lastAccessedAt',object_value.last_accessed_at
  ) order by object_value.bucket_id,object_value.name),'[]'::jsonb)
  from storage.objects object_value where object_value.bucket_id in (${bucketIds}))
) as storage_catalog;`;
}

function snapshotSqlForManagementApi(snapshotSql) {
  const match = /^\\set ON_ERROR_STOP on\r?\nbegin transaction isolation level repeatable read read only;\r?\n([\s\S]+)\r?\nrollback;\s*$/u
    .exec(snapshotSql);
  if (!match) {
    fail("invalid_cleanup_snapshot_sql", "A consulta canônica não tem o formato esperado.");
  }
  return match[1];
}

function powershellCommand() {
  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

async function readManagementResult(filePath, property) {
  const response = await readJson(filePath);
  if (!Array.isArray(response) || response.length !== 1 ||
      !isRecord(response[0]) || !(property in response[0])) {
    fail("invalid_cleanup_management_response", "A consulta administrativa devolveu um resultado inválido.");
  }
  const value = response[0][property];
  if (!isRecord(value)) {
    fail("invalid_cleanup_management_response", "O resultado administrativo não contém um objeto JSON.");
  }
  return value;
}

async function managementReadOnlyQuery({
  managementHelperPath,
  projectRef,
  sqlPath,
  responsePath,
  property,
  processRunner
}) {
  await fs.access(managementHelperPath);
  try {
    await fs.access(responsePath);
    fail("cleanup_backup_file_exists", `O arquivo de resposta já existe: ${responsePath}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await processRunner(powershellCommand(), [
    "-NoProfile", "-NonInteractive", "-File", managementHelperPath,
    "-ProjectRef", projectRef, "-SqlFile", sqlPath, "-ReadOnly",
    "-OutputFile", responsePath
  ]);
  return readManagementResult(responsePath, property);
}

function validateStorageCatalog(catalog, projectRef) {
  if (!isRecord(catalog) || catalog.contract !== STORAGE_CATALOG_CONTRACT ||
      catalog.projectRef !== projectRef || !Array.isArray(catalog.buckets) ||
      !Array.isArray(catalog.objects)) {
    fail("invalid_cleanup_storage_catalog", "O catálogo do Storage é inválido.");
  }
  const expectedBuckets = requiredStorageBuckets().sort();
  const actualBuckets = catalog.buckets.map(({ id }) => text(id)).sort();
  if (canonicalJson(actualBuckets) !== canonicalJson(expectedBuckets)) {
    fail(
      "cleanup_storage_bucket_missing",
      "O backup pós-cutover exige todos os buckets correntes e legados."
    );
  }
  if (new Set(actualBuckets).size !== actualBuckets.length ||
      catalog.objects.length > MAX_STORAGE_OBJECTS) {
    fail("invalid_cleanup_storage_catalog", "O catálogo do Storage excede seus limites.");
  }
  const identities = new Set();
  for (const object of catalog.objects) {
    if (!isRecord(object) || !expectedBuckets.includes(text(object.bucketId))) {
      fail("invalid_cleanup_storage_catalog", "O catálogo contém um objeto de bucket inesperado.");
    }
    safeRelativePath(object.name);
    const identity = `${object.bucketId}/${object.name}`;
    if (identities.has(identity)) {
      fail("invalid_cleanup_storage_catalog", "O catálogo contém objetos repetidos.");
    }
    identities.add(identity);
  }
  return catalog;
}

export function parseStorageCliListing(stdout, bucketId) {
  const prefix = `/${bucketId}/`;
  const names = text(stdout) ? stdout.split(/\r?\n/u).map((line) => line.trim())
    .filter(Boolean).map((line) => {
      if (line === prefix || !line.startsWith(prefix)) {
        fail("invalid_cleanup_storage_listing", `Listagem inválida no bucket ${bucketId}.`);
      }
      return safeRelativePath(line.slice(prefix.length));
    }) : [];
  names.sort((left, right) => left.localeCompare(right));
  if (new Set(names).size !== names.length || names.length > MAX_STORAGE_OBJECTS) {
    fail("invalid_cleanup_storage_listing", `Listagem inválida no bucket ${bucketId}.`);
  }
  return names;
}

async function listStorageObjectsWithCli({ projectRef, bucketId, processRunner }) {
  const result = await processRunner(npxCommand(), [
    "--yes", SUPABASE_CLI_PACKAGE, "storage", "ls", `ss:///${bucketId}/`,
    "--recursive", "--project-ref", projectRef, "--experimental"
  ]);
  return parseStorageCliListing(result.stdout, bucketId);
}

async function backupStorageBucketWithCli({
  projectRef,
  bucket,
  catalogObjects,
  outputDirectory,
  processRunner
}) {
  const bucketId = bucket.id;
  const listedBefore = await listStorageObjectsWithCli({ projectRef, bucketId, processRunner });
  const catalogNames = catalogObjects.map(({ name }) => name).sort();
  if (canonicalJson(listedBefore) !== canonicalJson(catalogNames)) {
    fail("cleanup_storage_catalog_drift", `A listagem do bucket ${bucketId} diverge do catálogo.`);
  }
  const objects = [];
  for (const object of catalogObjects) {
    const localName = `${createHash("sha256").update(object.name, "utf8").digest("hex")}.blob`;
    const relativePath = safeRelativePath(`storage/${bucketId}/${localName}`);
    const targetPath = path.join(outputDirectory, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await processRunner(npxCommand(), [
      "--yes", SUPABASE_CLI_PACKAGE, "storage", "cp",
      `ss:///${bucketId}/${object.name}`, targetPath,
      "--project-ref", projectRef, "--experimental"
    ]);
    const fingerprint = await sha256File(targetPath);
    objects.push({
      ...object,
      localPath: relativePath,
      ...fingerprint,
      responseContentType: metadataType(object.metadata) || null
    });
  }
  const listedAfter = await listStorageObjectsWithCli({ projectRef, bucketId, processRunner });
  if (canonicalJson(listedAfter) !== canonicalJson(listedBefore)) {
    fail("cleanup_storage_catalog_drift", `O bucket ${bucketId} mudou durante o backup.`);
  }
  return {
    id: bucketId,
    metadata: {
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      file_size_limit: bucket.fileSizeLimit,
      allowed_mime_types: bucket.allowedMimeTypes,
      created_at: bucket.createdAt,
      updated_at: bucket.updatedAt
    },
    objects,
    verified: true
  };
}

function attachmentValue(attachment, camel, snake) {
  return attachment?.[camel] ?? attachment?.[snake] ?? null;
}

function metadataSize(metadata) {
  const value = metadata?.size;
  return Number.isSafeInteger(value) ? value : Number.parseInt(String(value ?? ""), 10);
}

function metadataType(metadata) {
  return text(metadata?.mimetype ?? metadata?.contentType ?? metadata?.content_type);
}

export function classifyCourseSourcePdfObjects({ snapshot, storageBucket }) {
  const attachments = Array.isArray(snapshot.courseSourcePdfAttachments) ?
    snapshot.courseSourcePdfAttachments : [];
  const databaseObjects = new Map((Array.isArray(snapshot.courseSourcePdfObjects) ?
    snapshot.courseSourcePdfObjects : []).map((object) => [object.name, object]));
  const storageObjects = new Map(storageBucket.objects.map((object) => [object.name, object]));
  const links = new Map();
  for (const attachment of attachments) {
    const storagePath = text(attachmentValue(attachment, "storagePath", "storage_path"));
    if (!storagePath) continue;
    const values = links.get(storagePath) || [];
    values.push(attachment);
    links.set(storagePath, values);
  }
  const result = [];
  for (const object of storageBucket.objects) {
    const databaseObject = databaseObjects.get(object.name);
    const objectLinks = links.get(object.name) || [];
    const pathMatch = /^([0-9a-f-]{36})\/([0-9a-f]{64})\.pdf$/iu.exec(object.name);
    let classification = "linked";
    if (!databaseObject || !isRecord(databaseObject.metadata)) {
      classification = "orphan_missing_metadata";
    } else if (!objectLinks.length) {
      classification = "orphan_missing_link";
    } else if (!pathMatch || pathMatch[2].toLowerCase() !== object.sha256) {
      classification = "divergent_content";
    } else if (objectLinks.some((attachment) =>
      attachmentValue(attachment, "contentHash", "content_hash") !== object.sha256 ||
      attachmentValue(attachment, "byteSize", "byte_size") !== object.byteSize ||
      attachmentValue(attachment, "mediaType", "media_type") !== "application/pdf") ||
      metadataSize(databaseObject.metadata) !== object.byteSize ||
      metadataType(databaseObject.metadata) !== "application/pdf") {
      classification = "divergent_metadata";
    }
    result.push({
      name: object.name,
      sha256: object.sha256,
      byteSize: object.byteSize,
      classification,
      linkCount: objectLinks.length,
      localPath: object.localPath
    });
  }
  for (const [storagePath, objectLinks] of links) {
    if (storageObjects.has(storagePath)) continue;
    result.push({
      name: storagePath,
      sha256: null,
      byteSize: null,
      classification: "attachment_missing_object",
      linkCount: objectLinks.length,
      localPath: null
    });
  }
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail("unsafe_backup_symlink", `Link simbólico no backup: ${relativePath}.`);
    if (entry.isDirectory()) result.push(...await listFiles(fullPath, relativePath));
    else if (entry.isFile()) result.push(relativePath);
  }
  return result.sort();
}

async function fileRecords(outputDirectory, excluded = new Set()) {
  const files = (await listFiles(outputDirectory)).filter((file) => !excluded.has(file));
  const result = [];
  for (const relativePath of files) {
    const fingerprint = await sha256File(path.join(outputDirectory, ...relativePath.split("/")));
    result.push({ path: relativePath, ...fingerprint });
  }
  return result;
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

async function dumpDatabase({ projectRef, outputDirectory, processRunner }) {
  const platformSchemas = ["auth", "storage", "supabase_migrations"].join(",");
  const files = [
    { name: "database/roles.sql", flags: ["--role-only"] },
    { name: "database/platform-schema.sql", flags: ["--schema", platformSchemas] },
    { name: "database/schema.sql", flags: [] },
    { name: "database/platform-data.sql", flags: [
      "--data-only", "--use-copy", "--schema", platformSchemas
    ] },
    { name: "database/data.sql", flags: ["--data-only", "--use-copy"] }
  ];
  for (const file of files) {
    const targetPath = path.join(outputDirectory, ...file.name.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await processRunner(npxCommand(), [
      "--yes", SUPABASE_CLI_PACKAGE, "db", "dump",
      "--project-ref", projectRef,
      "--file", targetPath,
      ...file.flags
    ]);
  }
}

export async function verifyCleanupBackup(outputDirectory) {
  const manifestPath = path.join(outputDirectory, BACKUP_MANIFEST_FILE);
  const manifest = await readJson(manifestPath);
  const evidenceHashes = [
    "finalManifestHash", "parityInventoryHash", "legacyTargetsHash", "catalogSnapshotHash",
    "runtimeConsumerEvidenceHash", "storageCatalogHash", "databaseRestoreCatalogHash"
  ];
  if (manifest.contract !== LEGACY_CLEANUP_CONTRACTS.backup || !Array.isArray(manifest.files) ||
      !Array.isArray(manifest.tableProfiles) ||
      !PROJECT_REF_PATTERN.test(manifest.sourceProjectRef || "") ||
      !/^[0-9a-f]{64}$/u.test(manifest.sourceDatabaseFingerprint || "") ||
      evidenceHashes.some((property) => !/^[0-9a-f]{64}$/u.test(manifest[property] || ""))) {
    fail("invalid_cleanup_backup", "O manifesto de backup é inválido.");
  }
  const actualFiles = await listFiles(outputDirectory);
  const expectedFiles = manifest.files.map((file) => safeRelativePath(file.path)).sort();
  const withoutManifest = actualFiles.filter((file) => file !== BACKUP_MANIFEST_FILE);
  if (canonicalJson(withoutManifest) !== canonicalJson(expectedFiles)) {
    fail("cleanup_backup_file_drift", "Os arquivos do backup divergem do manifesto.");
  }
  for (const record of manifest.files) {
    if (!/^[0-9a-f]{64}$/u.test(record.sha256 || "") ||
        !Number.isSafeInteger(record.byteSize) || record.byteSize < 0) {
      fail("invalid_cleanup_backup", `Hash inválido em ${record.path}.`);
    }
    const actual = await sha256File(path.join(outputDirectory, ...record.path.split("/")));
    if (actual.sha256 !== record.sha256 || actual.byteSize !== record.byteSize) {
      fail("cleanup_backup_hash_mismatch", `O arquivo ${record.path} foi alterado.`);
    }
  }
  const fileMap = new Map(manifest.files.map((file) => [file.path, file]));
  for (const relativePath of DATABASE_DUMP_FILES) {
    if (!fileMap.has(relativePath)) {
      fail("invalid_cleanup_backup", `O dump ${relativePath} está ausente.`);
    }
  }
  const evidenceFiles = [
    ["finalManifestHash", "inputs/final-runtime-manifest.json"],
    ["parityInventoryHash", "inputs/database-inventory.json"],
    ["legacyTargetsHash", "inputs/legacy-cleanup-targets.json"],
    ["catalogSnapshotHash", "inputs/catalog-snapshot.json"],
    ["runtimeConsumerEvidenceHash", "inputs/runtime-consumers.json"],
    ["storageCatalogHash", "inputs/storage-catalog-before.json"],
    ["databaseRestoreCatalogHash", "inputs/database-restore-catalog-before.json"]
  ];
  for (const [property, relativePath] of evidenceFiles) {
    if (!fileMap.has(relativePath)) {
      fail("invalid_cleanup_backup", `A evidência ${relativePath} está ausente.`);
    }
    const value = await readJson(path.join(outputDirectory, ...relativePath.split("/")));
    if (sha256Canonical(value) !== manifest[property]) {
      fail("cleanup_backup_evidence_mismatch", `A evidência ${relativePath} diverge.`);
    }
  }
  if (!fileMap.has("inputs/database-restore-catalog-after.json")) {
    fail("invalid_cleanup_backup", "O catálogo posterior ao dump está ausente.");
  }
  const databaseRestoreCatalog = validateDatabaseRestoreCatalog(await readJson(path.join(
    outputDirectory, "inputs", "database-restore-catalog-before.json"
  )), manifest.sourceProjectRef);
  const databaseRestoreCatalogAfter = validateDatabaseRestoreCatalog(await readJson(path.join(
    outputDirectory, "inputs", "database-restore-catalog-after.json"
  )), manifest.sourceProjectRef);
  if (canonicalJson(databaseRestoreCatalogAfter) !== canonicalJson(databaseRestoreCatalog) ||
      manifest.sourceDatabaseFingerprint !== sha256Canonical(databaseRestoreCatalog)) {
    fail("cleanup_backup_database_drift", "O banco mudou durante o backup.");
  }
  const restoreProfiles = new Map(databaseRestoreCatalog.tables.map((profile) => [
    `${profile.schema}.${profile.name}`,
    profile
  ]));
  for (const legacyProfile of manifest.tableProfiles) {
    if (!isRecord(legacyProfile) || !text(legacyProfile.table) ||
        !Number.isSafeInteger(legacyProfile.rowCount) || legacyProfile.rowCount < 0 ||
        !/^[0-9a-f]{32}$/u.test(legacyProfile.rowFingerprint || "")) {
      fail("invalid_cleanup_backup", "O manifesto contém uma impressão digital legada inválida.");
    }
    const restored = restoreProfiles.get(legacyProfile.table);
    if (!restored || restored.rowCount !== legacyProfile.rowCount ||
        restored.rowFingerprint !== legacyProfile.rowFingerprint) {
      fail(
        "cleanup_backup_database_profile_mismatch",
        `A tabela legada ${legacyProfile.table || "desconhecida"} diverge do dump integral.`
      );
    }
  }
  const actualBuckets = (manifest.storageBuckets || []).map(({ id }) => id).sort();
  if (canonicalJson(actualBuckets) !== canonicalJson(requiredStorageBuckets().sort())) {
    fail("invalid_cleanup_backup", "O manifesto não contém todos os buckets esperados.");
  }
  for (const bucket of manifest.storageBuckets || []) {
    if (!bucket.verified || !Array.isArray(bucket.objects)) {
      fail("invalid_cleanup_backup", `O bucket ${bucket.id} não foi verificado.`);
    }
    for (const object of bucket.objects || []) {
      const record = fileMap.get(object.localPath);
      if (!record || record.sha256 !== object.sha256 || record.byteSize !== object.byteSize) {
        fail("cleanup_backup_storage_mismatch", `O objeto ${bucket.id}/${object.name} diverge.`);
      }
    }
  }
  return manifest;
}

export async function createCleanupBackup({
  repositoryRoot,
  outputDirectory,
  finalManifestPath,
  parityInventoryPath,
  legacyTargetsPath,
  projectRef,
  managementHelperPath,
  processRunner = runProcess,
  now = () => new Date()
}) {
  const resolvedRoot = path.resolve(repositoryRoot);
  const resolvedOutput = path.resolve(outputDirectory);
  const normalizedProjectRef = validateProjectRef(projectRef);
  const resolvedHelper = path.resolve(managementHelperPath || "");
  if (isInside(resolvedRoot, resolvedOutput) || resolvedOutput === path.parse(resolvedOutput).root) {
    fail("unsafe_cleanup_backup_location", "O backup deve ficar fora do repositório público.");
  }
  if (!managementHelperPath || isInside(resolvedRoot, resolvedHelper) ||
      path.extname(resolvedHelper).toLowerCase() !== ".ps1") {
    fail(
      "unsafe_cleanup_management_helper",
      "O auxiliar administrativo deve ser um arquivo PowerShell fora do repositório público."
    );
  }
  try {
    await fs.mkdir(resolvedOutput, { recursive: false, mode: 0o700 });
  } catch (error) {
    fail("cleanup_backup_directory_exists", `O diretório de backup precisa ser novo: ${error.message}`);
  }
  const finalManifest = validateFinalRuntimeManifest(await readJson(finalManifestPath));
  const parityInventory = await readJson(parityInventoryPath);
  const legacyTargets = await readJson(legacyTargetsPath);
  const runtimeConsumers = await scanLegacyRuntimeConsumers({
    repositoryRoot: resolvedRoot,
    parityInventory,
    legacyTargets,
    finalManifest
  });
  if (runtimeConsumers.matches.length) {
    fail("legacy_runtime_consumer_found", "O runtime corrente ainda menciona um objeto legado.");
  }
  const snapshotSql = buildLegacyCleanupSnapshotSql({
    parityInventory,
    legacyTargets,
    finalManifest
  });
  const queryPath = path.join(resolvedOutput, "inputs", "catalog-snapshot.sql");
  await fs.mkdir(path.dirname(queryPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(queryPath, snapshotSqlForManagementApi(snapshotSql), {
    encoding: "utf8", mode: 0o600, flag: "wx"
  });
  const snapshotResponsePath = path.join(
    resolvedOutput, "inputs", "catalog-snapshot.response.json"
  );
  const catalogSnapshot = await managementReadOnlyQuery({
    managementHelperPath: resolvedHelper,
    projectRef: normalizedProjectRef,
    sqlPath: queryPath,
    responsePath: snapshotResponsePath,
    property: "jsonb_build_object",
    processRunner
  });
  assertLegacyCleanupCatalogSnapshot({
    snapshot: catalogSnapshot,
    parityInventory,
    legacyTargets,
    finalManifest
  });
  await writeJson(path.join(resolvedOutput, "inputs", "final-runtime-manifest.json"), finalManifest);
  await writeJson(path.join(resolvedOutput, "inputs", "database-inventory.json"), parityInventory);
  await writeJson(path.join(resolvedOutput, "inputs", "legacy-cleanup-targets.json"), legacyTargets);
  await writeJson(path.join(resolvedOutput, "inputs", "runtime-consumers.json"), runtimeConsumers);
  await writeJson(path.join(resolvedOutput, "inputs", "catalog-snapshot.json"), catalogSnapshot);
  const storageCatalogSqlPath = path.join(resolvedOutput, "inputs", "storage-catalog.sql");
  await fs.writeFile(storageCatalogSqlPath, buildStorageCatalogSql(normalizedProjectRef), {
    encoding: "utf8", mode: 0o600, flag: "wx"
  });
  const storageCatalogBefore = validateStorageCatalog(await managementReadOnlyQuery({
    managementHelperPath: resolvedHelper,
    projectRef: normalizedProjectRef,
    sqlPath: storageCatalogSqlPath,
    responsePath: path.join(resolvedOutput, "inputs", "storage-catalog-before.response.json"),
    property: "storage_catalog",
    processRunner
  }), normalizedProjectRef);
  await writeJson(
    path.join(resolvedOutput, "inputs", "storage-catalog-before.json"),
    storageCatalogBefore
  );
  const snapshotPdfObjects = [...catalogSnapshot.courseSourcePdfObjects]
    .sort((left, right) => left.name.localeCompare(right.name));
  const catalogPdfObjects = storageCatalogBefore.objects
    .filter(({ bucketId }) => bucketId === COURSE_SOURCE_PDF_BUCKET)
    .map(({ name, metadata, userMetadata, createdAt, updatedAt }) => ({
      name, metadata, userMetadata, createdAt, updatedAt
    })).sort((left, right) => left.name.localeCompare(right.name));
  if (canonicalJson(snapshotPdfObjects) !== canonicalJson(catalogPdfObjects)) {
    fail("cleanup_storage_catalog_drift", "O catálogo de PDFs mudou depois do snapshot.");
  }
  const databaseRestoreCatalogSqlPath = path.join(
    resolvedOutput, "inputs", "database-restore-catalog.sql"
  );
  await fs.writeFile(
    databaseRestoreCatalogSqlPath,
    buildDatabaseRestoreCatalogSql(normalizedProjectRef),
    { encoding: "utf8", mode: 0o600, flag: "wx" }
  );
  const databaseRestoreCatalogBefore = validateDatabaseRestoreCatalog(
    await managementReadOnlyQuery({
      managementHelperPath: resolvedHelper,
      projectRef: normalizedProjectRef,
      sqlPath: databaseRestoreCatalogSqlPath,
      responsePath: path.join(
        resolvedOutput, "inputs", "database-restore-catalog-before.response.json"
      ),
      property: "database_restore_catalog",
      processRunner
    }),
    normalizedProjectRef
  );
  await writeJson(
    path.join(resolvedOutput, "inputs", "database-restore-catalog-before.json"),
    databaseRestoreCatalogBefore
  );
  await dumpDatabase({
    projectRef: normalizedProjectRef,
    outputDirectory: resolvedOutput,
    processRunner
  });
  const storageBuckets = [];
  for (const bucket of storageCatalogBefore.buckets) {
    storageBuckets.push(await backupStorageBucketWithCli({
      projectRef: normalizedProjectRef,
      bucket,
      catalogObjects: storageCatalogBefore.objects.filter(({ bucketId }) =>
        bucketId === bucket.id),
      outputDirectory: resolvedOutput,
      processRunner
    }));
  }
  const storageCatalogAfter = validateStorageCatalog(await managementReadOnlyQuery({
    managementHelperPath: resolvedHelper,
    projectRef: normalizedProjectRef,
    sqlPath: storageCatalogSqlPath,
    responsePath: path.join(resolvedOutput, "inputs", "storage-catalog-after.response.json"),
    property: "storage_catalog",
    processRunner
  }), normalizedProjectRef);
  await writeJson(
    path.join(resolvedOutput, "inputs", "storage-catalog-after.json"),
    storageCatalogAfter
  );
  if (canonicalJson(storageCatalogAfter) !== canonicalJson(storageCatalogBefore)) {
    fail("cleanup_storage_catalog_drift", "O catálogo do Storage mudou durante o backup.");
  }
  const databaseRestoreCatalogAfter = validateDatabaseRestoreCatalog(
    await managementReadOnlyQuery({
      managementHelperPath: resolvedHelper,
      projectRef: normalizedProjectRef,
      sqlPath: databaseRestoreCatalogSqlPath,
      responsePath: path.join(
        resolvedOutput, "inputs", "database-restore-catalog-after.response.json"
      ),
      property: "database_restore_catalog",
      processRunner
    }),
    normalizedProjectRef
  );
  await writeJson(
    path.join(resolvedOutput, "inputs", "database-restore-catalog-after.json"),
    databaseRestoreCatalogAfter
  );
  if (canonicalJson(databaseRestoreCatalogAfter) !==
      canonicalJson(databaseRestoreCatalogBefore)) {
    fail("cleanup_backup_database_drift", "O banco mudou durante o backup.");
  }
  const pdfBucket = storageBuckets.find(({ id }) => id === COURSE_SOURCE_PDF_BUCKET);
  const courseSourcePdfObjects = classifyCourseSourcePdfObjects({
    snapshot: catalogSnapshot,
    storageBucket: pdfBucket
  });
  const files = await fileRecords(resolvedOutput, new Set([BACKUP_MANIFEST_FILE]));
  const preparedAt = now().toISOString();
  const manifest = {
    contract: LEGACY_CLEANUP_CONTRACTS.backup,
    preparedAt,
    sourceProjectRef: normalizedProjectRef,
    sourceDatabaseFingerprint: sha256Canonical(databaseRestoreCatalogBefore),
    finalManifestHash: sha256Canonical(finalManifest),
    parityInventoryHash: sha256Canonical(parityInventory),
    legacyTargetsHash: sha256Canonical(legacyTargets),
    catalogSnapshotHash: sha256Canonical(catalogSnapshot),
    storageCatalogHash: sha256Canonical(storageCatalogBefore),
    databaseRestoreCatalogHash: sha256Canonical(databaseRestoreCatalogBefore),
    runtimeConsumerEvidenceHash: sha256Canonical(runtimeConsumers),
    tableProfiles: catalogSnapshot.tables,
    legacyCatalogCourses: catalogSnapshot.legacyCatalogCourses,
    storageBuckets,
    courseSourcePdfObjects,
    files,
    verification: { status: "verified", verifiedAt: preparedAt }
  };
  await writeJson(path.join(resolvedOutput, BACKUP_MANIFEST_FILE), manifest);
  await verifyCleanupBackup(resolvedOutput);
  return manifest;
}

export function buildLegacyStorageRemovalPlan({ backupManifest, finalManifest }) {
  validateFinalRuntimeManifest(finalManifest);
  if (backupManifest?.contract !== LEGACY_CLEANUP_CONTRACTS.backup ||
      backupManifest.finalManifestHash !== sha256Canonical(finalManifest) ||
      backupManifest.verification?.status !== "verified") {
    fail("unverified_cleanup_backup", "A remoção do Storage exige o backup verificado.");
  }
  const buckets = LEGACY_STORAGE_BUCKETS.map((id) => {
    const bucket = backupManifest.storageBuckets.find((candidate) => candidate.id === id);
    if (!bucket?.verified) fail("unverified_cleanup_backup", `O bucket ${id} não foi verificado.`);
    return {
      id,
      objects: bucket.objects.map(({ name, sha256, byteSize }) => ({ name, sha256, byteSize }))
    };
  });
  const preliminary = {
    contract: "aralearn.course-legacy-storage-removal-plan.v1",
    finalManifestHash: sha256Canonical(finalManifest),
    backupManifestHash: sha256Canonical(backupManifest),
    buckets
  };
  const planHash = sha256Canonical(preliminary);
  return {
    ...preliminary,
    planHash,
    confirmationToken: `REMOVE-ARALEARN-LEGACY-STORAGE-${planHash.slice(0, 20).toUpperCase()}`
  };
}

async function assertDisposableDatabaseTarget({ targetContainer, targetDatabase, processRunner }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(targetContainer || "") ||
      !/^aralearn_restore_[a-z0-9_]{8,48}$/u.test(targetDatabase || "")) {
    fail(
      "unsafe_restore_target",
      "O ensaio aceita apenas um banco aralearn_restore_* em um contêiner local explícito."
    );
  }
  const endpoint = await processRunner("docker", [
    "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"
  ]);
  if (!/^(npipe|unix):\/\//u.test(text(endpoint.stdout))) {
    fail("unsafe_restore_target", "O contexto Docker do ensaio não é local.");
  }
  const inspected = await processRunner("docker", [
    "inspect", "--format", "{{.Id}} {{.Config.Image}}", targetContainer
  ]);
  const match = /^([0-9a-f]{64})\s+(\S+)$/u.exec(text(inspected.stdout));
  if (!match || !match[2].toLowerCase().includes("supabase/postgres:")) {
    fail("unsafe_restore_target", "O destino não é um contêiner PostgreSQL local do Supabase.");
  }
  return sha256Canonical({ containerId: match[1], database: targetDatabase });
}

function dockerPsqlArguments(targetContainer, targetDatabase, argumentsList) {
  return [
    "exec", "-i", targetContainer, "psql", "--username", "supabase_admin",
    "--dbname", targetDatabase, ...argumentsList
  ];
}

export function buildDatabaseRestoreBootstrapSql() {
  const marker = sqlLiteral(RESTORE_PLACEHOLDER_MARKER);
  return `create schema if not exists extensions authorization postgres;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create schema if not exists private authorization postgres;
create or replace function private.anonymize_owned_experiment_courses_v1()
returns trigger
language plpgsql
set search_path=pg_catalog
as $aralearn_restore_placeholder$
begin
  raise exception using message=${marker};
end;
$aralearn_restore_placeholder$;
create or replace function private.cleanup_authoring_experiment_selection_tokens_v1()
returns trigger
language plpgsql
set search_path=pg_catalog
as $aralearn_restore_placeholder$
begin
  raise exception using message=${marker};
end;
$aralearn_restore_placeholder$;`;
}

function restorePlaceholderVerificationSql() {
  return `do $verify_aralearn_restore_placeholders$
begin
  if exists(
    select 1
    from pg_proc function_value
    join pg_namespace namespace_value on namespace_value.oid=function_value.pronamespace
    where namespace_value.nspname='private'
      and function_value.proname in (
        'anonymize_owned_experiment_courses_v1',
        'cleanup_authoring_experiment_selection_tokens_v1'
      )
      and pg_get_functiondef(function_value.oid) like
        ${sqlLiteral(`%${RESTORE_PLACEHOLDER_MARKER}%`)}
  ) then
    raise exception 'as funções temporárias dos gatilhos de Auth não foram substituídas';
  end if;
end;
$verify_aralearn_restore_placeholders$;`;
}

export function buildRestoredForeignKeyVerificationSql() {
  const schemasSql = RESTORED_DATABASE_SCHEMAS.map(sqlLiteral).join(",");
  return `do $aralearn_restore$
declare
  constraint_value record;
  join_condition text;
  relevant_condition text;
  violation_count bigint;
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'session_replication_role was not restored';
  end if;
  for constraint_value in
    select constraint_oid.oid,constraint_oid.conname,constraint_oid.conrelid,
      constraint_oid.confrelid,constraint_oid.conkey,constraint_oid.confkey,
      constraint_oid.confmatchtype
    from pg_constraint constraint_oid
    join pg_class relation_value on relation_value.oid=constraint_oid.conrelid
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where constraint_oid.contype='f' and namespace_value.nspname in (${schemasSql})
    order by constraint_oid.oid
  loop
    if constraint_value.confmatchtype not in ('s','f') then
      raise exception 'unsupported foreign key match type: %',constraint_value.conname;
    end if;
    select string_agg(format('child.%I = parent.%I',child_attribute.attname,
        parent_attribute.attname),' and ' order by key_value.position),
      case when constraint_value.confmatchtype='s'
        then string_agg(format('child.%I is not null',child_attribute.attname),
          ' and ' order by key_value.position)
        else string_agg(format('child.%I is not null',child_attribute.attname),
          ' or ' order by key_value.position) end
    into join_condition,relevant_condition
    from unnest(constraint_value.conkey,constraint_value.confkey)
      with ordinality key_value(child_number,parent_number,position)
    join pg_attribute child_attribute on child_attribute.attrelid=constraint_value.conrelid
      and child_attribute.attnum=key_value.child_number
    join pg_attribute parent_attribute on parent_attribute.attrelid=constraint_value.confrelid
      and parent_attribute.attnum=key_value.parent_number;
    execute format(
      'select count(*) from %s child where (%s) and not exists (select 1 from %s parent where %s)',
      constraint_value.conrelid::regclass,relevant_condition,
      constraint_value.confrelid::regclass,join_condition
    ) into violation_count;
    if violation_count <> 0 then
      raise exception 'foreign key % has % violations',constraint_value.conname,violation_count;
    end if;
  end loop;
end
$aralearn_restore$;
select jsonb_build_object(
  'sessionReplicationRole',current_setting('session_replication_role'),
  'foreignKeyCount',(select count(*) from pg_constraint constraint_value
    join pg_class relation_value on relation_value.oid=constraint_value.conrelid
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where constraint_value.contype='f' and namespace_value.nspname in (${schemasSql})),
  'schemas',to_jsonb(array[${schemasSql}]::text[])
)::text;`;
}

function parseLastJsonObject(stdout, errorCode, message) {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith("{")) continue;
    try {
      const parsed = JSON.parse(lines[index]);
      if (isRecord(parsed)) return parsed;
    } catch {
      // A saída do cliente pode conter confirmações antes do resultado.
    }
  }
  fail(errorCode, message);
}

export async function rehearseDatabaseRestore({
  backupDirectory,
  targetContainer,
  targetDatabase,
  confirmationToken,
  processRunner = runProcess,
  now = () => new Date()
}) {
  const backupManifest = await verifyCleanupBackup(backupDirectory);
  const targetDatabaseFingerprint = await assertDisposableDatabaseTarget({
    targetContainer,
    targetDatabase,
    processRunner
  });
  const expectedToken = `RESTORE-DISPOSABLE-${sha256Canonical(backupManifest)
    .slice(0, 20).toUpperCase()}`;
  if (confirmationToken !== expectedToken) {
    fail("invalid_restore_confirmation", "O token não confirma este backup e destino descartável.");
  }
  const empty = await processRunner("docker", dockerPsqlArguments(
    targetContainer, targetDatabase, [
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--command", `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in (${RESTORED_DATABASE_SCHEMAS.map(sqlLiteral).join(",")})
  and c.relkind in ('r','p','v','m');`
    ]
  ));
  if (text(empty.stdout) !== "0") {
    fail("restore_target_not_empty", "O banco de ensaio já contém relações da aplicação.");
  }
  const restoreFiles = new Map(DATABASE_DUMP_FILES.map((file) => [
    file,
    path.join(backupDirectory, ...file.split("/"))
  ]));
  await processRunner("docker", dockerPsqlArguments(targetContainer, targetDatabase, [
    "--no-psqlrc", "--quiet", "--single-transaction", "--set", "ON_ERROR_STOP=1",
    "--file", "-"
  ]), {
    inputParts: [
      "\\set ON_ERROR_STOP on\n",
      { file: restoreFiles.get("database/roles.sql") }, "\n",
      buildDatabaseRestoreBootstrapSql(), "\n",
      { file: restoreFiles.get("database/platform-schema.sql") }, "\n",
      { file: restoreFiles.get("database/schema.sql") },
      "\nset local session_replication_role=replica;\n",
      { file: restoreFiles.get("database/platform-data.sql") }, "\n",
      { file: restoreFiles.get("database/data.sql") },
      "\nset local session_replication_role=origin;\n",
      restorePlaceholderVerificationSql(), "\n"
    ]
  });
  const foreignKeyResult = await processRunner("docker", dockerPsqlArguments(
    targetContainer, targetDatabase, [
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--command", buildRestoredForeignKeyVerificationSql()
    ]
  ));
  const foreignKeys = parseLastJsonObject(
    foreignKeyResult.stdout,
    "invalid_restore_verification",
    "O ensaio não comprovou as chaves estrangeiras restauradas."
  );
  if (foreignKeys.sessionReplicationRole !== "origin" ||
      !Number.isSafeInteger(foreignKeys.foreignKeyCount) || foreignKeys.foreignKeyCount < 0 ||
      canonicalJson(foreignKeys.schemas) !== canonicalJson(RESTORED_DATABASE_SCHEMAS)) {
    fail("invalid_restore_verification", "A verificação das chaves estrangeiras é inválida.");
  }
  const expectedDatabaseRestoreCatalog = validateDatabaseRestoreCatalog(await readJson(path.join(
    backupDirectory, "inputs", "database-restore-catalog-before.json"
  )), backupManifest.sourceProjectRef);
  const catalogResult = await processRunner("docker", dockerPsqlArguments(
    targetContainer, targetDatabase, [
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--command", buildDatabaseRestoreCatalogSql(backupManifest.sourceProjectRef)
    ]
  ));
  const actualDatabaseRestoreCatalog = validateDatabaseRestoreCatalog(parseLastJsonObject(
    catalogResult.stdout,
    "invalid_restore_verification",
    "O ensaio não devolveu as impressões digitais restauradas."
  ), backupManifest.sourceProjectRef);
  if (canonicalJson(actualDatabaseRestoreCatalog) !==
      canonicalJson(expectedDatabaseRestoreCatalog)) {
    fail("restore_data_mismatch", "A restauração não recompôs o banco exatamente.");
  }
  if (foreignKeys.foreignKeyCount !== actualDatabaseRestoreCatalog.foreignKeys.length) {
    fail("invalid_restore_verification", "A contagem das chaves estrangeiras restauradas diverge.");
  }
  return {
    contract: "aralearn.course-legacy-cleanup-restore-rehearsal.v1",
    backupManifestHash: sha256Canonical(backupManifest),
    targetDatabaseFingerprint,
    verifiedAt: now().toISOString(),
    databaseCatalogHash: sha256Canonical(actualDatabaseRestoreCatalog),
    foreignKeys: {
      ...foreignKeys,
      catalogHash: sha256Canonical(actualDatabaseRestoreCatalog.foreignKeys)
    },
    tableProfiles: actualDatabaseRestoreCatalog.tables
  };
}

export async function rehearseStorageRestore({
  backupDirectory,
  targetSupabaseUrl,
  targetServiceRoleKey,
  confirmationToken,
  fetchImpl = fetch
}) {
  const parsed = new URL(normalizeSupabaseUrl(targetSupabaseUrl));
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname.toLowerCase())) {
    fail("unsafe_restore_target", "O ensaio do Storage aceita apenas uma instância local descartável.");
  }
  const backupManifest = await verifyCleanupBackup(backupDirectory);
  const expectedToken = `RESTORE-DISPOSABLE-STORAGE-${sha256Canonical(backupManifest)
    .slice(0, 20).toUpperCase()}`;
  if (confirmationToken !== expectedToken) {
    fail("invalid_restore_confirmation", "O token não confirma este ensaio do Storage.");
  }
  const restored = [];
  for (const bucket of backupManifest.storageBuckets) {
    const metadata = bucket.metadata || {};
    await storageRequest({
      fetchImpl,
      supabaseUrl: parsed.origin,
      serviceRoleKey: targetServiceRoleKey,
      pathname: "/bucket",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: bucket.id,
        name: bucket.id,
        public: Boolean(metadata.public),
        file_size_limit: metadata.file_size_limit ?? null,
        allowed_mime_types: metadata.allowed_mime_types ?? null
      })
    });
    for (const object of bucket.objects) {
      const body = await fs.readFile(path.join(backupDirectory, ...object.localPath.split("/")));
      await storageRequest({
        fetchImpl,
        supabaseUrl: parsed.origin,
        serviceRoleKey: targetServiceRoleKey,
        pathname: `/object/${encodeURIComponent(bucket.id)}/${encodedStoragePath(object.name)}`,
        method: "POST",
        headers: {
          "content-type": object.responseContentType || "application/octet-stream",
          "x-upsert": "false"
        },
        body
      });
      const response = await storageRequest({
        fetchImpl,
        supabaseUrl: parsed.origin,
        serviceRoleKey: targetServiceRoleKey,
        pathname: `/object/${encodeURIComponent(bucket.id)}/${encodedStoragePath(object.name)}`
      });
      const restoredHash = createHash("sha256").update(Buffer.from(
        await response.arrayBuffer()
      )).digest("hex");
      if (restoredHash !== object.sha256) {
        fail("restore_storage_mismatch", `O objeto ${bucket.id}/${object.name} divergiu.`);
      }
      restored.push({ bucketId: bucket.id, name: object.name, sha256: restoredHash });
    }
  }
  return {
    contract: "aralearn.course-legacy-storage-restore-rehearsal.v1",
    backupManifestHash: sha256Canonical(backupManifest),
    objects: restored
  };
}
