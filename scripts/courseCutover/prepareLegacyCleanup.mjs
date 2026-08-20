#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLegacyCleanupPlan,
  buildLegacyCleanupSnapshotSql,
  buildPdfOrphanRemovalPlan,
  generateLegacyCleanupSql,
  scanLegacyRuntimeConsumers,
  sha256Canonical
} from "./legacyCleanupPlan.mjs";
import {
  buildLegacyStorageRemovalPlan,
  createCleanupBackup,
  rehearseDatabaseRestore,
  rehearseStorageRestore,
  verifyCleanupBackup
} from "./legacyCleanupBackup.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  const parsed = {
    action: argv[0] === "--help" ? "" : argv[0] || "",
    values: {},
    secretsStdin: false,
    help: argv[0] === "--help"
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") parsed.help = true;
    else if (argument === "--secrets-stdin") parsed.secretsStdin = true;
    else if (argument.startsWith("--")) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        fail("missing_cleanup_argument_value", `Valor ausente para ${argument}.`);
      }
      parsed.values[argument.slice(2)] = value;
      index += 1;
    } else fail("invalid_cleanup_argument", `Argumento desconhecido: ${argument}.`);
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}

async function writeNew(filePath, value) {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, value, { encoding: "utf8", flag: "wx" });
}

function required(values, name) {
  const value = values[name];
  if (!value) fail("missing_cleanup_argument", `Informe --${name}.`);
  return value;
}

async function readStdinSecrets() {
  if (process.stdin.isTTY) {
    fail("missing_cleanup_secrets", "Os segredos devem chegar pela entrada padrão.");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 64 * 1024) fail("cleanup_secrets_too_large", "A entrada excede 64 KiB.");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_cleanup_secrets", "A entrada de segredos é inválida.");
  }
  return value;
}

function help() {
  return `Uso:
  node scripts/courseCutover/prepareLegacyCleanup.mjs snapshot-sql \\
    --final-manifest ARQUIVO --parity-inventory ARQUIVO --legacy-targets ARQUIVO \\
    --output ARQUIVO

  node scripts/courseCutover/prepareLegacyCleanup.mjs backup \\
    --project-ref IDENTIFICADOR --management-helper ARQUIVO_PRIVADO \\
    --final-manifest ARQUIVO --parity-inventory ARQUIVO --legacy-targets ARQUIVO \\
    --output DIRETORIO_PRIVADO_NOVO

  node scripts/courseCutover/prepareLegacyCleanup.mjs plan \\
    --final-manifest ARQUIVO --parity-inventory ARQUIVO --legacy-targets ARQUIVO \\
    --snapshot ARQUIVO \\
    --runtime-consumers ARQUIVO --backup-dir DIRETORIO --smoke ARQUIVO --output ARQUIVO

  node scripts/courseCutover/prepareLegacyCleanup.mjs sql \\
    --plan ARQUIVO --confirmation-token TOKEN --output ARQUIVO

  node scripts/courseCutover/prepareLegacyCleanup.mjs pdf-plan \\
    --final-manifest ARQUIVO --backup-dir DIRETORIO --output ARQUIVO

  node scripts/courseCutover/prepareLegacyCleanup.mjs storage-plan \\
    --final-manifest ARQUIVO --backup-dir DIRETORIO --output ARQUIVO

  node scripts/courseCutover/prepareLegacyCleanup.mjs verify-backup --backup-dir DIRETORIO

  node scripts/courseCutover/prepareLegacyCleanup.mjs restore-database \\
    --backup-dir DIRETORIO --target-container CONTEINER_SUPABASE \\
    --target-database BANCO_ARALEARN_RESTORE --confirmation-token TOKEN --output ARQUIVO

  JSON_COM_DESTINO_LOCAL | node scripts/courseCutover/prepareLegacyCleanup.mjs restore-storage \\
    --secrets-stdin --backup-dir DIRETORIO --confirmation-token TOKEN --output ARQUIVO

O backup usa a sessão autenticada do Supabase CLI e inclui a aplicação, Auth, Storage e o
histórico de migrações. O auxiliar administrativo deve ficar fora do repositório público e
consulta o catálogo somente pelo endpoint de leitura.
A restauração do banco aceita somente um banco aralearn_restore_* em um contêiner Supabase
local e confere dados e chaves estrangeiras de todos esses esquemas. O ensaio do Storage aceita
apenas uma instância local descartável.`;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help || !parsed.action) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const { action, values } = parsed;
  if (action === "snapshot-sql") {
    const finalManifest = await readJson(required(values, "final-manifest"));
    const parityInventory = await readJson(required(values, "parity-inventory"));
    const legacyTargets = await readJson(required(values, "legacy-targets"));
    await writeNew(required(values, "output"), buildLegacyCleanupSnapshotSql({
      finalManifest,
      parityInventory,
      legacyTargets
    }));
    return;
  }
  if (action === "runtime-scan") {
    const finalManifest = await readJson(required(values, "final-manifest"));
    const parityInventory = await readJson(required(values, "parity-inventory"));
    const legacyTargets = await readJson(required(values, "legacy-targets"));
    const evidence = await scanLegacyRuntimeConsumers({
      repositoryRoot: REPOSITORY_ROOT,
      finalManifest,
      parityInventory,
      legacyTargets
    });
    await writeNew(required(values, "output"), `${JSON.stringify(evidence, null, 2)}\n`);
    return;
  }
  if (action === "backup") {
    if (parsed.secretsStdin) {
      fail("invalid_cleanup_argument", "O backup não recebe segredos pela entrada padrão.");
    }
    const manifest = await createCleanupBackup({
      repositoryRoot: REPOSITORY_ROOT,
      outputDirectory: required(values, "output"),
      finalManifestPath: required(values, "final-manifest"),
      parityInventoryPath: required(values, "parity-inventory"),
      legacyTargetsPath: required(values, "legacy-targets"),
      projectRef: required(values, "project-ref"),
      managementHelperPath: required(values, "management-helper")
    });
    const backupHash = sha256Canonical(manifest);
    process.stdout.write(`${JSON.stringify({
      status: "verified",
      preparedAt: manifest.preparedAt,
      backupHash,
      databaseRestoreToken: `RESTORE-DISPOSABLE-${backupHash.slice(0, 20).toUpperCase()}`,
      storageRestoreToken:
        `RESTORE-DISPOSABLE-STORAGE-${backupHash.slice(0, 20).toUpperCase()}`
    })}\n`);
    return;
  }
  if (action === "verify-backup") {
    const manifest = await verifyCleanupBackup(required(values, "backup-dir"));
    process.stdout.write(`${JSON.stringify({ status: "verified", verifiedAt:
      manifest.verification.verifiedAt })}\n`);
    return;
  }
  if (action === "plan") {
    const finalManifest = await readJson(required(values, "final-manifest"));
    const parityInventory = await readJson(required(values, "parity-inventory"));
    const legacyTargets = await readJson(required(values, "legacy-targets"));
    const catalogSnapshot = await readJson(required(values, "snapshot"));
    const runtimeConsumers = await readJson(required(values, "runtime-consumers"));
    const backupManifest = await verifyCleanupBackup(required(values, "backup-dir"));
    const smokeAttestation = await readJson(required(values, "smoke"));
    const plan = buildLegacyCleanupPlan({
      finalManifest,
      parityInventory,
      legacyTargets,
      catalogSnapshot,
      runtimeConsumers,
      backupManifest,
      smokeAttestation
    });
    await writeNew(required(values, "output"), `${JSON.stringify(plan, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      planHash: plan.planHash,
      confirmationToken: plan.confirmationToken
    })}\n`);
    return;
  }
  if (action === "sql") {
    const plan = await readJson(required(values, "plan"));
    const sql = generateLegacyCleanupSql({
      plan,
      confirmationToken: required(values, "confirmation-token")
    });
    await writeNew(required(values, "output"), sql);
    return;
  }
  if (action === "pdf-plan" || action === "storage-plan") {
    const finalManifest = await readJson(required(values, "final-manifest"));
    const backupManifest = await verifyCleanupBackup(required(values, "backup-dir"));
    const plan = action === "pdf-plan" ?
      buildPdfOrphanRemovalPlan({ backupManifest, finalManifest }) :
      buildLegacyStorageRemovalPlan({ backupManifest, finalManifest });
    await writeNew(required(values, "output"), `${JSON.stringify(plan, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      planHash: plan.planHash,
      confirmationToken: plan.confirmationToken
    })}\n`);
    return;
  }
  if (action === "restore-database") {
    if (parsed.secretsStdin) {
      fail("invalid_cleanup_argument", "O ensaio do banco não recebe segredos.");
    }
    const report = await rehearseDatabaseRestore({
      backupDirectory: required(values, "backup-dir"),
      targetContainer: required(values, "target-container"),
      targetDatabase: required(values, "target-database"),
      confirmationToken: required(values, "confirmation-token")
    });
    await writeNew(required(values, "output"), `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (action === "restore-storage") {
    if (!parsed.secretsStdin) fail("missing_cleanup_secrets", "Use --secrets-stdin no ensaio.");
    const secrets = await readStdinSecrets();
    const report = await rehearseStorageRestore({
      backupDirectory: required(values, "backup-dir"),
      targetSupabaseUrl: secrets.targetSupabaseUrl,
      targetServiceRoleKey: secrets.targetServiceRoleKey,
      confirmationToken: required(values, "confirmation-token")
    });
    await writeNew(required(values, "output"), `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  fail("invalid_cleanup_action", `Ação ${action} não existe.`);
}

main().catch((error) => {
  process.stderr.write(`${error.code || "legacy_cleanup_failed"}: ${error.message}\n`);
  process.exitCode = 1;
});
