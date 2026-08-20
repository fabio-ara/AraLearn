#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const LEGACY_DATABASE_CASE_ID = "pre-course-database-removal";
export const LEGACY_DATABASE_OBJECT_COUNT = 1_595;
export const LEGACY_STORAGE_BUCKETS = Object.freeze([
  "aralearn-authoring-artifacts",
  "aralearn-course-revisions"
]);
export const COURSE_SOURCE_PDF_BUCKET = "course-source-pdfs";

const INVENTORY_CONTRACT = "aralearn.vertical-parity.database-inventory.v1";
const TARGETS_CONTRACT = "aralearn.course-legacy-cleanup-targets.v1";
const SNAPSHOT_CONTRACT = "aralearn.course-legacy-cleanup-snapshot.v1";
const BACKUP_CONTRACT = "aralearn.course-legacy-cleanup-backup.v1";
const SMOKE_CONTRACT = "aralearn.course-runtime-smoke-attestation.v1";
const RUNTIME_SCAN_CONTRACT = "aralearn.course-legacy-runtime-consumers.v1";
const PLAN_CONTRACT = "aralearn.course-legacy-cleanup-plan.v1";
const PDF_PLAN_CONTRACT = "aralearn.course-source-pdf-orphan-removal-plan.v1";

const LEGACY_CATEGORY_COUNTS = Object.freeze({
  bucket: 2,
  constraint: 655,
  function: 333,
  index: 254,
  policy: 9,
  rls: 110,
  table: 110,
  trigger: 117,
  view: 5
});

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

function orderedUnique(values, code, label) {
  if (!Array.isArray(values) || values.some((value) => !text(value))) {
    fail(code, `${label} deve ser uma lista de textos não vazios.`);
  }
  const normalized = values.map((value) => text(value));
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${label} contém valores repetidos.`);
  }
  const ordered = [...normalized].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(ordered)) {
    fail(code, `${label} precisa estar em ordem canônica.`);
  }
  return normalized;
}

function uniqueTexts(values, code, label) {
  if (!Array.isArray(values) || values.some((value) => !text(value))) {
    fail(code, `${label} deve ser uma lista de textos não vazios.`);
  }
  const normalized = values.map((value) => text(value));
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${label} contém valores repetidos.`);
  }
  return normalized;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseRelationObject(object) {
  const match = /^(table|view|materialized_view):([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/u
    .exec(object);
  if (!match) fail("invalid_cleanup_relation", `Relação inválida no inventário: ${object}.`);
  return {
    kind: match[1],
    schema: match[2],
    name: match[3],
    qualified: `${sqlIdentifier(match[2])}.${sqlIdentifier(match[3])}`,
    plain: `${match[2]}.${match[3]}`
  };
}

function parseFunctionObject(object) {
  const signature = object.replace(/^function:/u, "");
  if (signature === object || !/^(?:public|private)\.[a-z_][a-z0-9_]*\(.*\)$/u.test(signature)) {
    fail("invalid_cleanup_function", `Função inválida no inventário: ${object}.`);
  }
  return {
    signature,
    qualifiedName: signature.slice(0, signature.indexOf("(")),
    sql: signature.split(".").map((part, index) =>
      index === 0 ? sqlIdentifier(part) : part
    ).join(".")
  };
}

function manifestForDatabase(finalManifest) {
  const features = finalManifest.requiredFeatures;
  return {
    schemaRevision: finalManifest.schemaRevision,
    contractVersion: finalManifest.contractVersion,
    features
  };
}

export function validateFinalRuntimeManifest(finalManifest) {
  if (!isRecord(finalManifest) || !/^\d{14}$/u.test(text(finalManifest.schemaRevision)) ||
      !Number.isSafeInteger(finalManifest.contractVersion) || finalManifest.contractVersion < 1) {
    fail("invalid_final_runtime_manifest", "O manifesto final do runtime é inválido.");
  }
  uniqueTexts(
    finalManifest.requiredFeatures,
    "invalid_final_runtime_manifest",
    "requiredFeatures do manifesto final"
  );
  return finalManifest;
}

export function legacyObjectsFromParity(parityInventory, legacyTargets = null) {
  if (!isRecord(parityInventory) || parityInventory.contract !== INVENTORY_CONTRACT ||
      !Array.isArray(parityInventory.objects)) {
    fail("invalid_cleanup_parity_inventory", "O inventário exato do banco é inválido.");
  }
  const objects = parityInventory.objects.map((entry) => {
    if (!isRecord(entry) || !text(entry.object) || !text(entry.caseId)) {
      fail("invalid_cleanup_parity_inventory", "O inventário exato contém uma entrada inválida.");
    }
    return { object: text(entry.object), caseId: text(entry.caseId) };
  });
  const names = objects.map(({ object }) => object);
  orderedUnique(names, "invalid_cleanup_parity_inventory", "Objetos do inventário exato");
  const embeddedLegacy = objects.filter(({ caseId }) => caseId === LEGACY_DATABASE_CASE_ID);
  let legacy = embeddedLegacy;
  let current = objects.filter(({ caseId }) => caseId !== LEGACY_DATABASE_CASE_ID);
  if (legacyTargets !== null) {
    if (!isRecord(legacyTargets) || legacyTargets.contract !== TARGETS_CONTRACT ||
        legacyTargets.objectCount !== LEGACY_DATABASE_OBJECT_COUNT ||
        !/^[0-9a-f]{64}$/u.test(legacyTargets.sourceInventoryHash || "") ||
        canonicalJson(legacyTargets.categoryCounts) !== canonicalJson(
          LEGACY_CATEGORY_COUNTS
        )) {
      fail("invalid_cleanup_targets", "O inventário fixo dos alvos legados é inválido.");
    }
    const targetNames = orderedUnique(
      legacyTargets.objects,
      "invalid_cleanup_targets",
      "Objetos do inventário fixo de limpeza"
    );
    legacy = targetNames.map((object) => ({ object, caseId: LEGACY_DATABASE_CASE_ID }));
    if (embeddedLegacy.length && canonicalJson(embeddedLegacy.map(({ object }) => object)) !==
        canonicalJson(targetNames)) {
      fail(
        "cleanup_targets_drift",
        "A classificação legada do inventário vivo diverge do inventário fixo."
      );
    }
    const currentNames = new Set(current.map(({ object }) => object));
    if (targetNames.some((object) => currentNames.has(object))) {
      fail("cleanup_target_is_current", "Um alvo legado foi classificado como objeto corrente.");
    }
  }
  if (legacy.length !== LEGACY_DATABASE_OBJECT_COUNT) {
    fail(
      "unexpected_legacy_object_count",
      `A remoção exige ${LEGACY_DATABASE_OBJECT_COUNT} objetos legados; foram encontrados ${legacy.length}.`
    );
  }
  const counts = {};
  for (const { object } of legacy) {
    const category = object.slice(0, object.indexOf(":"));
    counts[category] = (counts[category] || 0) + 1;
  }
  if (canonicalJson(counts) !== canonicalJson(LEGACY_CATEGORY_COUNTS)) {
    fail(
      "unexpected_legacy_object_shape",
      "A distribuição dos objetos legados mudou e precisa de nova revisão."
    );
  }
  for (const bucket of LEGACY_STORAGE_BUCKETS) {
    if (!legacy.some(({ object }) => object === `bucket:storage.${bucket}`)) {
      fail("missing_legacy_bucket", `O bucket legado ${bucket} não consta no inventário final.`);
    }
  }
  const combined = current.concat(legacy).sort((left, right) =>
    left.object < right.object ? -1 : left.object > right.object ? 1 : 0
  );
  return { objects: combined, legacy, current };
}

function rootObjects(legacy) {
  const relations = legacy
    .filter(({ object }) => /^(?:table|view|materialized_view):/u.test(object))
    .map(({ object }) => parseRelationObject(object));
  const functions = legacy
    .filter(({ object }) => object.startsWith("function:"))
    .map(({ object }) => parseFunctionObject(object));
  return {
    tables: relations.filter(({ kind }) => kind === "table"),
    views: relations.filter(({ kind }) => kind === "view"),
    materializedViews: relations.filter(({ kind }) => kind === "materialized_view"),
    functions
  };
}

function valuesSql(values, columns) {
  if (!values.length) return `select ${columns.map(({ empty }) => empty).join(",")} where false`;
  return `values\n${values.map((row) => `  (${row.map(sqlLiteral).join(",")})`).join(",\n")}`;
}

function actualDatabaseObjectsSql() {
  return `
select case
    when relation_value.relkind in ('r','p') then 'table:'
    when relation_value.relkind='v' then 'view:'
    when relation_value.relkind='m' then 'materialized_view:'
  end || namespace_value.nspname || '.' || relation_value.relname as object
from pg_class relation_value
join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
where namespace_value.nspname in ('public','private')
  and relation_value.relkind in ('r','p','v','m')
union all
select 'function:' || namespace_value.nspname || '.' || procedure_value.proname || '(' ||
  pg_get_function_identity_arguments(procedure_value.oid) || ')'
from pg_proc procedure_value
join pg_namespace namespace_value on namespace_value.oid=procedure_value.pronamespace
where namespace_value.nspname in ('public','private')
union all
select 'index:' || namespace_value.nspname || '.' || table_value.relname || '/' ||
  index_value.relname
from pg_index index_link
join pg_class table_value on table_value.oid=index_link.indrelid
join pg_class index_value on index_value.oid=index_link.indexrelid
join pg_namespace namespace_value on namespace_value.oid=table_value.relnamespace
where namespace_value.nspname in ('public','private')
union all
select 'constraint:' || namespace_value.nspname || '.' || relation_value.relname || '/' ||
  constraint_value.conname || '[' || case constraint_value.contype
    when 'c' then 'check' when 'f' then 'foreign_key' when 'p' then 'primary_key'
    when 'u' then 'unique' when 'x' then 'exclusion' when 'n' then 'not_null'
    else constraint_value.contype::text end || ']'
from pg_constraint constraint_value
join pg_class relation_value on relation_value.oid=constraint_value.conrelid
join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
where namespace_value.nspname in ('public','private')
union all
select 'trigger:' || namespace_value.nspname || '.' || relation_value.relname || '/' ||
  trigger_value.tgname
from pg_trigger trigger_value
join pg_class relation_value on relation_value.oid=trigger_value.tgrelid
join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
where namespace_value.nspname in ('public','private') and not trigger_value.tgisinternal
union all
select 'policy:' || namespace_value.nspname || '.' || relation_value.relname || '/' ||
  policy_value.polname
from pg_policy policy_value
join pg_class relation_value on relation_value.oid=policy_value.polrelid
join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
where namespace_value.nspname in ('public','private')
union all
select 'rls:' || namespace_value.nspname || '.' || relation_value.relname || '=' ||
  case when relation_value.relforcerowsecurity then 'forced'
    when relation_value.relrowsecurity then 'enabled' else 'disabled' end
from pg_class relation_value
join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
where namespace_value.nspname in ('public','private')
  and relation_value.relkind in ('r','p')
union all
select 'bucket:storage.' || bucket_value.id from storage.buckets bucket_value`;
}

function consumerBoundarySql(roots) {
  const relations = roots.tables.concat(roots.views, roots.materializedViews);
  const relationValues = valuesSql(
    relations.map(({ plain }) => [plain]),
    [{ empty: "null::text as object_name" }]
  );
  const functionValues = valuesSql(
    roots.functions.map(({ signature, qualifiedName }) => [signature, qualifiedName]),
    [{ empty: "null::text as signature" }, { empty: "null::text as qualified_name" }]
  );
  return `
with legacy_relation_names(object_name) as (${relationValues}),
legacy_function_names(signature,qualified_name) as (${functionValues}),
legacy_relations as (
  select object_name,to_regclass(object_name) as object_oid from legacy_relation_names
), legacy_functions as (
  select function_name.signature,function_name.qualified_name,
    procedure_value.oid as object_oid
  from legacy_function_names function_name
  left join pg_proc procedure_value on function_name.signature=(
    (select namespace_value.nspname from pg_namespace namespace_value
      where namespace_value.oid=procedure_value.pronamespace)
    || '.' || procedure_value.proname || '('
    || pg_get_function_identity_arguments(procedure_value.oid) || ')'
  )
), legacy_relation_oids as (
  select object_oid from legacy_relations where object_oid is not null
), legacy_function_oids as (
  select object_oid from legacy_functions where object_oid is not null
), consumers as (
  select 'foreign_key'::text as dependency_kind,
    namespace_value.nspname || '.' || relation_value.relname || '/' ||
      constraint_value.conname as dependent,
    constraint_value.confrelid::regclass::text as referenced
  from pg_constraint constraint_value
  join pg_class relation_value on relation_value.oid=constraint_value.conrelid
  join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
  where constraint_value.contype='f'
    and constraint_value.confrelid in (select object_oid from legacy_relation_oids)
    and constraint_value.conrelid not in (select object_oid from legacy_relation_oids)
  union all
  select 'view_dependency',namespace_value.nspname || '.' || relation_value.relname,
    dependency_value.refobjid::regclass::text
  from pg_depend dependency_value
  join pg_rewrite rewrite_value on rewrite_value.oid=dependency_value.objid
  join pg_class relation_value on relation_value.oid=rewrite_value.ev_class
  join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
  where dependency_value.classid='pg_rewrite'::regclass
    and dependency_value.refclassid='pg_class'::regclass
    and dependency_value.refobjid in (select object_oid from legacy_relation_oids)
    and relation_value.oid not in (select object_oid from legacy_relation_oids)
  union all
  select 'trigger_function',namespace_value.nspname || '.' || relation_value.relname || '/' ||
      trigger_value.tgname,trigger_value.tgfoid::regprocedure::text
  from pg_trigger trigger_value
  join pg_class relation_value on relation_value.oid=trigger_value.tgrelid
  join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
  where trigger_value.tgfoid in (select object_oid from legacy_function_oids)
    and trigger_value.tgrelid not in (select object_oid from legacy_relation_oids)
  union all
  select 'function_dependency',namespace_value.nspname || '.' || procedure_value.proname ||
      '(' || pg_get_function_identity_arguments(procedure_value.oid) || ')',
    case dependency_value.refclassid
      when 'pg_class'::regclass then dependency_value.refobjid::regclass::text
      when 'pg_proc'::regclass then dependency_value.refobjid::regprocedure::text
      else dependency_value.refobjid::text end
  from pg_depend dependency_value
  join pg_proc procedure_value on dependency_value.classid='pg_proc'::regclass
    and procedure_value.oid=dependency_value.objid
  join pg_namespace namespace_value on namespace_value.oid=procedure_value.pronamespace
  where procedure_value.oid not in (select object_oid from legacy_function_oids)
    and ((dependency_value.refclassid='pg_class'::regclass and
          dependency_value.refobjid in (select object_oid from legacy_relation_oids))
      or (dependency_value.refclassid='pg_proc'::regclass and
          dependency_value.refobjid in (select object_oid from legacy_function_oids)))
  union all
  select 'function_body_reference',namespace_value.nspname || '.' || procedure_value.proname ||
      '(' || pg_get_function_identity_arguments(procedure_value.oid) || ')',target_value.target
  from pg_proc procedure_value
  join pg_namespace namespace_value on namespace_value.oid=procedure_value.pronamespace
  cross join lateral (
    select relation_value.object_name as target from legacy_relations relation_value
    where pg_get_functiondef(procedure_value.oid) ilike '%' || relation_value.object_name || '%'
    union all
    select function_value.qualified_name from legacy_functions function_value
    where pg_get_functiondef(procedure_value.oid) ilike '%' || function_value.qualified_name || '%'
  ) target_value
  where procedure_value.oid not in (select object_oid from legacy_function_oids)
    and procedure_value.prokind in ('f','p')
    and namespace_value.nspname !~ '^pg_'
  union all
  select 'constraint_function',namespace_value.nspname || '.' || relation_value.relname || '/' ||
      constraint_value.conname,dependency_value.refobjid::regprocedure::text
  from pg_depend dependency_value
  join pg_constraint constraint_value on dependency_value.classid='pg_constraint'::regclass
    and constraint_value.oid=dependency_value.objid
  join pg_class relation_value on relation_value.oid=constraint_value.conrelid
  join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
  where dependency_value.refclassid='pg_proc'::regclass
    and dependency_value.refobjid in (select object_oid from legacy_function_oids)
    and constraint_value.conrelid not in (select object_oid from legacy_relation_oids)
  union all
  select 'default_function',namespace_value.nspname || '.' || relation_value.relname || '/' ||
      attribute_value.attname,dependency_value.refobjid::regprocedure::text
  from pg_depend dependency_value
  join pg_attrdef default_value on dependency_value.classid='pg_attrdef'::regclass
    and default_value.oid=dependency_value.objid
  join pg_class relation_value on relation_value.oid=default_value.adrelid
  join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
  join pg_attribute attribute_value on attribute_value.attrelid=relation_value.oid
    and attribute_value.attnum=default_value.adnum
  where dependency_value.refclassid='pg_proc'::regclass
    and dependency_value.refobjid in (select object_oid from legacy_function_oids)
    and relation_value.oid not in (select object_oid from legacy_relation_oids)
  union all
  select 'policy_function',namespace_value.nspname || '.' || relation_value.relname || '/' ||
      policy_value.polname,dependency_value.refobjid::regprocedure::text
  from pg_depend dependency_value
  join pg_policy policy_value on dependency_value.classid='pg_policy'::regclass
    and policy_value.oid=dependency_value.objid
  join pg_class relation_value on relation_value.oid=policy_value.polrelid
  join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
  where dependency_value.refclassid='pg_proc'::regclass
    and dependency_value.refobjid in (select object_oid from legacy_function_oids)
    and relation_value.oid not in (select object_oid from legacy_relation_oids)
)
select dependency_kind,dependent,referenced from consumers
order by dependency_kind,dependent,referenced`;
}

function targetDependencySql(roots) {
  const relations = roots.tables.concat(roots.views, roots.materializedViews);
  const relationValues = valuesSql(
    relations.map(({ plain }) => [plain]),
    [{ empty: "null::text as object_name" }]
  );
  const functionValues = valuesSql(
    roots.functions.map(({ signature, qualifiedName }) => [signature, qualifiedName]),
    [{ empty: "null::text as signature" }, { empty: "null::text as qualified_name" }]
  );
  return `
with legacy_relation_names(object_name) as (${relationValues}),
legacy_function_names(signature,qualified_name) as (${functionValues}),
legacy_relations as (
  select relation_name.object_name,to_regclass(relation_name.object_name) as object_oid
  from legacy_relation_names relation_name
), legacy_functions as (
  select function_name.signature,function_name.qualified_name,
    procedure_value.oid as object_oid
  from legacy_function_names function_name
  left join pg_proc procedure_value on function_name.signature=(
    (select namespace_value.nspname from pg_namespace namespace_value
      where namespace_value.oid=procedure_value.pronamespace)
    || '.' || procedure_value.proname || '('
    || pg_get_function_identity_arguments(procedure_value.oid) || ')'
  )
), relation_oids as (
  select object_oid from legacy_relations where object_oid is not null
), function_oids as (
  select object_oid from legacy_functions where object_oid is not null
), dependencies as (
  select 'foreign_key'::text as dependency_kind,
    constraint_value.conrelid::regclass::text || '/' || constraint_value.conname as dependent,
    constraint_value.confrelid::regclass::text as referenced
  from pg_constraint constraint_value
  where constraint_value.contype='f'
    and constraint_value.conrelid in (select object_oid from relation_oids)
    and constraint_value.confrelid in (select object_oid from relation_oids)
  union all
  select 'view_dependency',rewrite_value.ev_class::regclass::text,
    dependency_value.refobjid::regclass::text
  from pg_depend dependency_value
  join pg_rewrite rewrite_value on rewrite_value.oid=dependency_value.objid
  where dependency_value.classid='pg_rewrite'::regclass
    and dependency_value.refclassid='pg_class'::regclass
    and rewrite_value.ev_class in (select object_oid from relation_oids)
    and dependency_value.refobjid in (select object_oid from relation_oids)
  union all
  select 'trigger_function',trigger_value.tgrelid::regclass::text || '/' ||
      trigger_value.tgname,trigger_value.tgfoid::regprocedure::text
  from pg_trigger trigger_value
  where not trigger_value.tgisinternal
    and trigger_value.tgrelid in (select object_oid from relation_oids)
    and trigger_value.tgfoid in (select object_oid from function_oids)
  union all
  select 'function_dependency',procedure_value.oid::regprocedure::text,
    case dependency_value.refclassid
      when 'pg_class'::regclass then dependency_value.refobjid::regclass::text
      when 'pg_proc'::regclass then dependency_value.refobjid::regprocedure::text
      else dependency_value.refobjid::text end
  from pg_depend dependency_value
  join pg_proc procedure_value on dependency_value.classid='pg_proc'::regclass
    and procedure_value.oid=dependency_value.objid
  where procedure_value.oid in (select object_oid from function_oids)
    and ((dependency_value.refclassid='pg_class'::regclass and
          dependency_value.refobjid in (select object_oid from relation_oids))
      or (dependency_value.refclassid='pg_proc'::regclass and
          dependency_value.refobjid in (select object_oid from function_oids)))
)
select dependency_kind,dependent,referenced from dependencies
order by dependency_kind,dependent,referenced`;
}

function tableProfileBlock(tables) {
  const rows = tables.map(({ plain }) => [plain]);
  return `
create temporary table aralearn_cleanup_table_profiles(
  table_name text primary key,row_count bigint not null,row_fingerprint text not null
) on commit drop;
do $capture_legacy_table_profiles$
declare table_value record; v_count bigint; v_fingerprint text;
begin
  for table_value in select table_name from (${valuesSql(rows, [
    { empty: "null::text as table_name" }
  ])}) expected(table_name)
  loop
    execute format(
$table_fingerprint$
select count(*)::bigint,
  md5(coalesce(string_agg(row_hash,'' order by row_hash),''))
from (select md5(to_jsonb(row_value)::text) row_hash from %s row_value) fingerprints
$table_fingerprint$,
      table_value.table_name
    ) into v_count,v_fingerprint;
    insert into aralearn_cleanup_table_profiles values(
      table_value.table_name,v_count,v_fingerprint
    );
  end loop;
end;
$capture_legacy_table_profiles$;`;
}

function tableProfilesSql(tables) {
  if (!tables.length) {
    return "select null::text table_name,0::bigint row_count,''::text row_fingerprint where false";
  }
  return tables.map(({ plain }) => `select ${sqlLiteral(plain)} as table_name,
  count(*)::bigint as row_count,
  md5(coalesce(string_agg(row_hash,'' order by row_hash),'')) as row_fingerprint
from (select md5(to_jsonb(row_value)::text) row_hash from ${plain} row_value) rows_value`)
    .join("\nunion all\n");
}

export function buildLegacyCleanupSnapshotSql({
  parityInventory,
  legacyTargets,
  finalManifest
}) {
  validateFinalRuntimeManifest(finalManifest);
  const { legacy } = legacyObjectsFromParity(parityInventory, legacyTargets);
  const roots = rootObjects(legacy);
  const expectedRevision = finalManifest.schemaRevision;
  return `\\set ON_ERROR_STOP on
begin transaction isolation level repeatable read read only;
with aralearn_cleanup_actual_objects as (${actualDatabaseObjectsSql()}),
aralearn_cleanup_table_profiles as (${tableProfilesSql(roots.tables)}),
aralearn_cleanup_consumers as (${consumerBoundarySql(roots)}),
aralearn_cleanup_dependencies as (${targetDependencySql(roots)})
select jsonb_build_object(
  'contract',${sqlLiteral(SNAPSHOT_CONTRACT)},
  'schemaRevision',${sqlLiteral(expectedRevision)},
  'databaseManifest',public.get_aralearn_runtime_manifest(),
  'objects',(select coalesce(jsonb_agg(object order by object),'[]'::jsonb)
    from aralearn_cleanup_actual_objects),
  'tables',(select coalesce(jsonb_agg(jsonb_build_object(
      'table',table_name,'rowCount',row_count,'rowFingerprint',row_fingerprint
    ) order by table_name),'[]'::jsonb) from aralearn_cleanup_table_profiles),
  'consumers',(select coalesce(jsonb_agg(jsonb_build_object(
      'kind',dependency_kind,'dependent',dependent,'referenced',referenced
    ) order by dependency_kind,dependent,referenced),'[]'::jsonb)
    from aralearn_cleanup_consumers),
  'dependencies',(select coalesce(jsonb_agg(jsonb_build_object(
      'kind',dependency_kind,'dependent',dependent,'referenced',referenced
    ) order by dependency_kind,dependent,referenced),'[]'::jsonb)
    from aralearn_cleanup_dependencies),
  'legacyCatalogCourses',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',course_value.id,'classification','deleted_unlinked_tombstone',
      'deletedAt',course_value.deleted_at,
      'rowFingerprint',md5(to_jsonb(course_value)::text)
    ) order by course_value.id),'[]'::jsonb)
    from public.legacy_catalog_courses course_value
    where course_value.deleted_at is not null and not exists(
      select 1 from private.legacy_trail_items item_value
      where item_value.course_id=course_value.id
    )),
  'courseSourcePdfAttachments',(select coalesce(jsonb_agg(to_jsonb(attachment_value)
      order by attachment_value.storage_path,attachment_value.source_id,
        attachment_value.source_revision),'[]'::jsonb)
    from private.course_source_attachments attachment_value),
  'courseSourcePdfObjects',(select coalesce(jsonb_agg(jsonb_build_object(
      'name',object_value.name,'metadata',object_value.metadata,
      'userMetadata',object_value.user_metadata,'createdAt',object_value.created_at,
      'updatedAt',object_value.updated_at
    ) order by object_value.name),'[]'::jsonb)
    from storage.objects object_value where object_value.bucket_id=${sqlLiteral(COURSE_SOURCE_PDF_BUCKET)})
)::text;
rollback;`;
}

function validateCatalogSnapshot({
  snapshot,
  expectedObjects,
  finalManifest,
  legacy
}) {
  if (!isRecord(snapshot) || snapshot.contract !== SNAPSHOT_CONTRACT ||
      snapshot.schemaRevision !== finalManifest.schemaRevision ||
      canonicalJson(snapshot.databaseManifest) !== canonicalJson(manifestForDatabase(finalManifest))) {
    fail("invalid_cleanup_snapshot", "O snapshot foi produzido para outro manifesto do runtime.");
  }
  const expectedObjectNames = expectedObjects.map(({ object }) => object);
  const actualObjects = orderedUnique(
    snapshot.objects,
    "invalid_cleanup_snapshot",
    "Objetos do snapshot"
  );
  if (canonicalJson(actualObjects) !== canonicalJson(expectedObjectNames)) {
    fail("cleanup_database_inventory_drift", "O banco diverge do inventário final informado.");
  }
  if (!Array.isArray(snapshot.consumers) || snapshot.consumers.length !== 0) {
    fail("legacy_database_consumer_found", "Um objeto corrente ainda depende da arquitetura legada.");
  }
  if (!Array.isArray(snapshot.dependencies) || snapshot.dependencies.some((dependency) =>
    !isRecord(dependency) || !text(dependency.kind) || !text(dependency.dependent) ||
    !text(dependency.referenced))) {
    fail("invalid_cleanup_snapshot", "O inventário de dependências legadas é inválido.");
  }
  const orderedDependencies = [...snapshot.dependencies].sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.dependent.localeCompare(right.dependent) ||
    left.referenced.localeCompare(right.referenced)
  );
  if (canonicalJson(orderedDependencies) !== canonicalJson(snapshot.dependencies)) {
    fail("invalid_cleanup_snapshot", "As dependências legadas estão fora da ordem canônica.");
  }
  const expectedTables = legacy
    .filter(({ object }) => object.startsWith("table:"))
    .map(({ object }) => object.replace(/^table:/u, ""));
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length !== expectedTables.length) {
    fail("invalid_cleanup_snapshot", "O snapshot não cobre todas as tabelas legadas.");
  }
  const tableNames = snapshot.tables.map((profile) => profile?.table);
  orderedUnique(tableNames, "invalid_cleanup_snapshot", "Tabelas do snapshot");
  if (canonicalJson(tableNames) !== canonicalJson(expectedTables)) {
    fail("invalid_cleanup_snapshot", "As tabelas do snapshot divergem do inventário legado.");
  }
  if (snapshot.tables.some((profile) => !Number.isSafeInteger(profile.rowCount) ||
      profile.rowCount < 0 || !/^[0-9a-f]{32}$/u.test(profile.rowFingerprint || ""))) {
    fail("invalid_cleanup_snapshot", "O snapshot contém uma contagem ou impressão digital inválida.");
  }
  if (!Array.isArray(snapshot.legacyCatalogCourses) ||
      snapshot.legacyCatalogCourses.length !== 4 ||
      snapshot.legacyCatalogCourses.some((course) =>
        course?.classification !== "deleted_unlinked_tombstone" ||
        !/^[0-9a-f-]{36}$/iu.test(course.id || "") ||
        !/^[0-9a-f]{32}$/u.test(course.rowFingerprint || "") ||
        !Number.isFinite(Date.parse(course.deletedAt || "")))) {
    fail(
      "unclassified_legacy_catalog_courses",
      "Os quatro Cursos tombstonados precisam estar classificados e identificados por hash."
    );
  }
  const catalogProfile = snapshot.tables.find(({ table }) =>
    table === "public.legacy_catalog_courses"
  );
  if (!catalogProfile || catalogProfile.rowCount < snapshot.legacyCatalogCourses.length) {
    fail(
      "unexpected_legacy_catalog_course_count",
      "O perfil de public.legacy_catalog_courses não cobre os Cursos classificados."
    );
  }
  return snapshot;
}

export function assertLegacyCleanupCatalogSnapshot({
  snapshot,
  parityInventory,
  legacyTargets,
  finalManifest
}) {
  validateFinalRuntimeManifest(finalManifest);
  const { objects, legacy } = legacyObjectsFromParity(parityInventory, legacyTargets);
  return validateCatalogSnapshot({
    snapshot,
    expectedObjects: objects,
    finalManifest,
    legacy
  });
}

function validateRuntimeConsumers(
  runtimeConsumers,
  finalManifest,
  parityInventory,
  legacyTargets
) {
  if (!isRecord(runtimeConsumers) || runtimeConsumers.contract !== RUNTIME_SCAN_CONTRACT ||
      runtimeConsumers.finalManifestHash !== sha256Canonical(finalManifest) ||
      runtimeConsumers.parityInventoryHash !== sha256Canonical(parityInventory) ||
      runtimeConsumers.legacyTargetsHash !== sha256Canonical(legacyTargets) ||
      !Array.isArray(runtimeConsumers.matches)) {
    fail("invalid_runtime_consumer_evidence", "A varredura de consumidores correntes é inválida.");
  }
  if (runtimeConsumers.matches.length) {
    fail("legacy_runtime_consumer_found", "O runtime corrente ainda menciona um objeto legado.");
  }
  return runtimeConsumers;
}

function sameProfiles(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function validateBackup({
  backup,
  finalManifest,
  parityInventory,
  legacyTargets,
  snapshot,
  runtimeConsumers
}) {
  if (!isRecord(backup) || backup.contract !== BACKUP_CONTRACT ||
      backup.finalManifestHash !== sha256Canonical(finalManifest) ||
      backup.parityInventoryHash !== sha256Canonical(parityInventory) ||
      backup.legacyTargetsHash !== sha256Canonical(legacyTargets) ||
      backup.catalogSnapshotHash !== sha256Canonical(snapshot) ||
      backup.runtimeConsumerEvidenceHash !== sha256Canonical(runtimeConsumers) ||
      !/^[0-9a-f]{64}$/u.test(backup.databaseRestoreCatalogHash || "") ||
      !/^[0-9a-f]{64}$/u.test(backup.sourceDatabaseFingerprint || "") ||
      backup.verification?.status !== "verified" ||
      !Number.isFinite(Date.parse(backup.verification?.verifiedAt || "")) ||
      !sameProfiles(backup.tableProfiles, snapshot.tables)) {
    fail("unverified_cleanup_backup", "O backup verificado não corresponde ao estado preparado.");
  }
  const buckets = Array.isArray(backup.storageBuckets) ? backup.storageBuckets : [];
  for (const bucketId of LEGACY_STORAGE_BUCKETS) {
    const bucket = buckets.find((candidate) => candidate?.id === bucketId);
    if (!bucket || bucket.verified !== true || !Array.isArray(bucket.objects)) {
      fail("unverified_cleanup_backup", `O backup do bucket ${bucketId} não foi verificado.`);
    }
  }
  if (!Array.isArray(backup.courseSourcePdfObjects)) {
    fail("missing_pdf_orphan_inventory", "O backup não contém o inventário dos PDFs de Fontes.");
  }
  return backup;
}

function validateSmokeAttestation(smoke, finalManifest) {
  if (!isRecord(smoke) || smoke.contract !== SMOKE_CONTRACT || smoke.status !== "passed" ||
      smoke.finalManifestHash !== sha256Canonical(finalManifest) ||
      !Number.isFinite(Date.parse(smoke.testedAt || "")) ||
      !Array.isArray(smoke.checks) || smoke.checks.length < 1 ||
      smoke.checks.some((check) => !text(check))) {
    fail("invalid_post_smoke_attestation", "A limpeza exige uma validação pós-corte aprovada.");
  }
  return smoke;
}

export function buildLegacyCleanupPlan({
  parityInventory,
  legacyTargets,
  finalManifest,
  catalogSnapshot,
  runtimeConsumers,
  backupManifest,
  smokeAttestation
}) {
  validateFinalRuntimeManifest(finalManifest);
  const { objects, legacy, current } = legacyObjectsFromParity(
    parityInventory,
    legacyTargets
  );
  validateCatalogSnapshot({
    snapshot: catalogSnapshot,
    expectedObjects: objects,
    finalManifest,
    legacy
  });
  validateRuntimeConsumers(
    runtimeConsumers,
    finalManifest,
    parityInventory,
    legacyTargets
  );
  validateBackup({
    backup: backupManifest,
    finalManifest,
    parityInventory,
    legacyTargets,
    snapshot: catalogSnapshot,
    runtimeConsumers
  });
  validateSmokeAttestation(smokeAttestation, finalManifest);
  const roots = rootObjects(legacy);
  const preliminary = {
    contract: PLAN_CONTRACT,
    schemaRevision: finalManifest.schemaRevision,
    finalManifestHash: sha256Canonical(finalManifest),
    parityInventoryHash: sha256Canonical(parityInventory),
    legacyTargetsHash: sha256Canonical(legacyTargets),
    catalogSnapshotHash: sha256Canonical(catalogSnapshot),
    runtimeConsumerEvidenceHash: sha256Canonical(runtimeConsumers),
    backupManifestHash: sha256Canonical(backupManifest),
    smokeAttestationHash: sha256Canonical(smokeAttestation),
    expectedObjectCount: objects.length,
    removalObjectCount: legacy.length,
    removalCategoryCounts: LEGACY_CATEGORY_COUNTS,
    allObjects: objects.map(({ object }) => object),
    databaseRoots: {
      tables: roots.tables.map(({ plain }) => plain),
      views: roots.views.map(({ plain }) => plain),
      materializedViews: roots.materializedViews.map(({ plain }) => plain),
      functions: roots.functions.map(({ signature }) => signature)
    },
    storageBuckets: LEGACY_STORAGE_BUCKETS,
    tableProfiles: catalogSnapshot.tables,
    legacyCatalogCourses: catalogSnapshot.legacyCatalogCourses,
    dependencies: catalogSnapshot.dependencies,
    retainedObjects: current.map(({ object }) => object)
      .concat(LEGACY_STORAGE_BUCKETS.map((bucket) => `bucket:storage.${bucket}`))
      .sort(),
    finalObjectsAfterStorageRemoval: current.map(({ object }) => object)
  };
  const planHash = sha256Canonical(preliminary);
  return Object.freeze({
    ...preliminary,
    planHash,
    confirmationToken: `REMOVE-ARALEARN-LEGACY-${planHash.slice(0, 20).toUpperCase()}`
  });
}

function expectedObjectsBlock(objects, tableName = "aralearn_cleanup_expected_objects") {
  return `create temporary table ${tableName}(
  object text primary key
) on commit drop;
insert into ${tableName}(object) values
${objects.map((object) => `  (${sqlLiteral(object)})`).join(",\n")};`;
}

function expectedProfilesBlock(profiles) {
  return `create temporary table aralearn_cleanup_expected_profiles(
  table_name text primary key,row_count bigint not null,row_fingerprint text not null
) on commit drop;
insert into aralearn_cleanup_expected_profiles values
${profiles.map((profile) => `  (${sqlLiteral(profile.table)},${profile.rowCount},${sqlLiteral(
    profile.rowFingerprint
  )})`).join(",\n")};`;
}

function expectedDependenciesBlock(dependencies) {
  const insert = dependencies.length ? `
insert into aralearn_cleanup_expected_dependencies values
${dependencies.map((dependency) => `  (${sqlLiteral(dependency.kind)},${sqlLiteral(
    dependency.dependent
  )},${sqlLiteral(dependency.referenced)})`).join(",\n")};` : "";
  return `create temporary table aralearn_cleanup_expected_dependencies(
  dependency_kind text,dependent text,referenced text
) on commit drop;${insert}`;
}

function dropSql(kind, values) {
  if (!values.length) return "";
  const keyword = kind === "materializedViews" ? "materialized view" :
    kind === "views" ? "view" : kind === "tables" ? "table" : "function";
  const names = kind === "functions" ? values.map((value) => parseFunctionObject(
    `function:${value}`
  ).sql) : values.map((value) => {
    const [schema, name] = value.split(".");
    return `${sqlIdentifier(schema)}.${sqlIdentifier(name)}`;
  });
  return `drop ${keyword} if exists\n  ${names.join(",\n  ")} cascade;`;
}

export function generateLegacyCleanupSql({ plan, confirmationToken }) {
  if (!isRecord(plan) || plan.contract !== PLAN_CONTRACT ||
      plan.planHash !== sha256Canonical(Object.fromEntries(
        Object.entries(plan).filter(([key]) => !["planHash", "confirmationToken"].includes(key))
      )) || confirmationToken !== plan.confirmationToken) {
    fail("invalid_cleanup_confirmation", "O token não confirma exatamente este plano de limpeza.");
  }
  const roots = {
    tables: plan.databaseRoots.tables.map((plain) => parseRelationObject(`table:${plain}`)),
    views: plan.databaseRoots.views.map((plain) => parseRelationObject(`view:${plain}`)),
    materializedViews: plan.databaseRoots.materializedViews.map((plain) =>
      parseRelationObject(`materialized_view:${plain}`)
    ),
    functions: plan.databaseRoots.functions.map((signature) =>
      parseFunctionObject(`function:${signature}`)
    )
  };
  const courseValues = plan.legacyCatalogCourses.map((course) =>
    `  (${sqlLiteral(course.id)}::uuid,${sqlLiteral(course.rowFingerprint)})`
  ).join(",\n");
  const lockTables = roots.tables.map(({ qualified }) => qualified).join(",\n  ");
  const rootNames = {
    tables: roots.tables.map(({ plain }) => plain),
    views: roots.views.map(({ plain }) => plain),
    materializedViews: roots.materializedViews.map(({ plain }) => plain),
    functions: roots.functions.map(({ signature }) => signature)
  };
  if (!Array.isArray(plan.allObjects) || plan.allObjects.length !== plan.expectedObjectCount) {
    fail("invalid_cleanup_plan", "O plano não conserva o inventário completo do preflight.");
  }
  return `-- Gerado para ${plan.contract}; plano ${plan.planHash}.
-- Execute somente depois do smoke e do backup registrados no plano.
\\set ON_ERROR_STOP on
\\if :{?aralearn_cleanup_confirmation}
\\else
  \\echo 'Defina aralearn_cleanup_confirmation com o token exato do plano.'
  \\quit 3
\\endif
begin;
set local lock_timeout='10s';
set local statement_timeout='15min';
set local idle_in_transaction_session_timeout='16min';
select pg_advisory_xact_lock(hashtextextended('aralearn.course-legacy-cleanup.v1',0));
select set_config(
  'aralearn.cleanup_confirmation',:'aralearn_cleanup_confirmation',true
);
do $confirm_cleanup_plan$
begin
  if current_setting('aralearn.cleanup_confirmation',true) <> ${sqlLiteral(
    plan.confirmationToken
  )} then
    raise exception 'Token de confirmação não corresponde ao plano.' using errcode='55000';
  end if;
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> ${sqlLiteral(
    plan.schemaRevision
  )} then
    raise exception 'O manifesto do runtime mudou depois da preparação.' using errcode='55000';
  end if;
end;
$confirm_cleanup_plan$;
${expectedObjectsBlock(plan.allObjects)}
${expectedObjectsBlock(plan.retainedObjects, "aralearn_cleanup_retained_objects")}
create temporary table aralearn_cleanup_actual_objects(object text primary key) on commit drop;
insert into aralearn_cleanup_actual_objects(object)
select object from (${actualDatabaseObjectsSql()}) actual where object is not null;
do $verify_exact_preflight_inventory$
begin
  if exists(
    select object from aralearn_cleanup_expected_objects
    except select object from aralearn_cleanup_actual_objects
  ) or exists(
    select object from aralearn_cleanup_actual_objects
    except select object from aralearn_cleanup_expected_objects
  ) then
    raise exception 'O inventário do banco mudou depois da preparação.' using errcode='55000';
  end if;
end;
$verify_exact_preflight_inventory$;
create temporary table aralearn_cleanup_consumers(
  dependency_kind text,dependent text,referenced text
) on commit drop;
insert into aralearn_cleanup_consumers
${consumerBoundarySql(roots)};
do $verify_no_current_consumers$
begin
  if exists(select 1 from aralearn_cleanup_consumers) then
    raise exception 'Um objeto corrente ainda depende da arquitetura legada: %',(
      select string_agg(dependency_kind || ':' || dependent || '->' || referenced,', '
        order by dependency_kind,dependent,referenced)
      from aralearn_cleanup_consumers
    ) using errcode='55000';
  end if;
end;
$verify_no_current_consumers$;
${expectedDependenciesBlock(plan.dependencies)}
create temporary table aralearn_cleanup_dependencies(
  dependency_kind text,dependent text,referenced text
) on commit drop;
insert into aralearn_cleanup_dependencies
${targetDependencySql(roots)};
do $verify_dependency_inventory$
begin
  if exists(
    select * from aralearn_cleanup_expected_dependencies
    except select * from aralearn_cleanup_dependencies
  ) or exists(
    select * from aralearn_cleanup_dependencies
    except select * from aralearn_cleanup_expected_dependencies
  ) then
    raise exception 'As dependências internas mudaram depois da preparação.' using errcode='55000';
  end if;
end;
$verify_dependency_inventory$;
lock table
  ${lockTables}
in access exclusive mode;
${expectedProfilesBlock(plan.tableProfiles)}
${tableProfileBlock(roots.tables)}
do $verify_legacy_data_fingerprints$
begin
  if exists(
    select * from aralearn_cleanup_expected_profiles
    except select * from aralearn_cleanup_table_profiles
  ) or exists(
    select * from aralearn_cleanup_table_profiles
    except select * from aralearn_cleanup_expected_profiles
  ) then
    raise exception 'Contagem ou impressão digital dos dados legados mudou.' using errcode='55000';
  end if;
end;
$verify_legacy_data_fingerprints$;
create temporary table aralearn_cleanup_expected_tombstones(
  id uuid primary key,row_fingerprint text not null
) on commit drop;
insert into aralearn_cleanup_expected_tombstones values
${courseValues};
create temporary table aralearn_cleanup_actual_tombstones on commit drop as
select course_value.id,md5(to_jsonb(course_value)::text) as row_fingerprint
from public.legacy_catalog_courses course_value
where course_value.deleted_at is not null and not exists(
  select 1 from private.legacy_trail_items item_value
  where item_value.course_id=course_value.id
);
do $verify_classified_legacy_courses$
begin
  if exists(
       select * from aralearn_cleanup_expected_tombstones
       except select * from aralearn_cleanup_actual_tombstones
     ) or exists(
       select * from aralearn_cleanup_actual_tombstones
       except select * from aralearn_cleanup_expected_tombstones
     ) then
    raise exception 'Os quatro Cursos tombstonados mudaram ou perderam classificação.'
      using errcode='55000';
  end if;
end;
$verify_classified_legacy_courses$;
${dropSql("views", rootNames.views)}
${dropSql("materializedViews", rootNames.materializedViews)}
${dropSql("tables", rootNames.tables)}
${dropSql("functions", rootNames.functions)}
truncate aralearn_cleanup_actual_objects;
insert into aralearn_cleanup_actual_objects(object)
select object from (${actualDatabaseObjectsSql()}) actual where object is not null;
do $verify_exact_postflight_inventory$
begin
  if exists(
    select object from aralearn_cleanup_retained_objects
    except select object from aralearn_cleanup_actual_objects
  ) or exists(
    select object from aralearn_cleanup_actual_objects
    except select object from aralearn_cleanup_retained_objects
  ) then
    raise exception 'O drop alcançou objeto corrente ou deixou resíduo legado.' using errcode='55000';
  end if;
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> ${sqlLiteral(
    plan.schemaRevision
  )} then
    raise exception 'O manifesto corrente foi alterado durante a limpeza.' using errcode='55000';
  end if;
end;
$verify_exact_postflight_inventory$;
commit;
-- Os buckets ${LEGACY_STORAGE_BUCKETS.join(" e ")} continuam intactos.
-- Remova-os somente pelo Storage API, usando o plano e o backup verificado.
`;
}

export function buildPdfOrphanRemovalPlan({ backupManifest, finalManifest }) {
  validateFinalRuntimeManifest(finalManifest);
  if (!isRecord(backupManifest) || backupManifest.contract !== BACKUP_CONTRACT ||
      backupManifest.finalManifestHash !== sha256Canonical(finalManifest) ||
      backupManifest.verification?.status !== "verified" ||
      !Array.isArray(backupManifest.courseSourcePdfObjects)) {
    fail("unverified_cleanup_backup", "O inventário de PDFs precisa vir do backup verificado.");
  }
  const candidates = backupManifest.courseSourcePdfObjects
    .filter(({ classification }) => [
      "orphan_missing_link", "orphan_missing_metadata"
    ].includes(classification))
    .map(({ name, sha256, byteSize, classification }) => ({
      name, sha256, byteSize, classification
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const preliminary = {
    contract: PDF_PLAN_CONTRACT,
    bucketId: COURSE_SOURCE_PDF_BUCKET,
    finalManifestHash: sha256Canonical(finalManifest),
    backupManifestHash: sha256Canonical(backupManifest),
    candidates
  };
  const planHash = sha256Canonical(preliminary);
  return {
    ...preliminary,
    planHash,
    confirmationToken: `REMOVE-ARALEARN-PDF-ORPHANS-${planHash.slice(0, 20).toUpperCase()}`
  };
}

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function consumerPatterns(legacy) {
  const relations = legacy.filter(({ object }) => object.startsWith("table:") ||
    object.startsWith("view:") || object.startsWith("materialized_view:"))
    .map(({ object }) => object.slice(object.indexOf(":") + 1));
  const functions = legacy.filter(({ object }) => object.startsWith("function:"))
    .map(({ object }) => parseFunctionObject(object).qualifiedName);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const descriptors = relations.concat(functions).map((object) => ({
    object,
    expression: new RegExp(escape(object), "gu")
  }));
  for (const object of relations) {
    const base = object.slice(object.indexOf(".") + 1);
    descriptors.push({
      object,
      expression: new RegExp(`["']${escape(base)}["']`, "gu")
    });
  }
  for (const object of functions.filter((value) => value.startsWith("public."))) {
    const base = object.slice("public.".length);
    descriptors.push({
      object,
      expression: new RegExp(`["']${escape(base)}["']`, "gu")
    });
  }
  return descriptors.sort((left, right) => left.object.localeCompare(right.object) ||
    left.expression.source.localeCompare(right.expression.source));
}

export async function scanLegacyRuntimeConsumers({
  repositoryRoot,
  parityInventory,
  legacyTargets,
  finalManifest
}) {
  validateFinalRuntimeManifest(finalManifest);
  const { legacy } = legacyObjectsFromParity(parityInventory, legacyTargets);
  const patterns = consumerPatterns(legacy);
  const roots = ["public", "src", path.join("supabase", "functions")];
  const files = [];
  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(repositoryRoot, relativeRoot);
    try {
      files.push(...await walkFiles(absoluteRoot));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const matches = [];
  const fileHashes = [];
  for (const filePath of files.sort()) {
    if (!/\.(?:js|mjs|html)$/iu.test(filePath)) continue;
    const source = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(repositoryRoot, filePath).split(path.sep).join("/");
    fileHashes.push({ path: relativePath, sha256: createHash("sha256").update(source).digest("hex") });
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern.expression)) {
        const before = source.slice(0, match.index);
        matches.push({
          path: relativePath,
          line: before.split("\n").length,
          object: pattern.object
        });
      }
    }
  }
  matches.sort((left, right) => left.path.localeCompare(right.path) ||
    left.line - right.line || left.object.localeCompare(right.object));
  return {
    contract: RUNTIME_SCAN_CONTRACT,
    finalManifestHash: sha256Canonical(finalManifest),
    parityInventoryHash: sha256Canonical(parityInventory),
    legacyTargetsHash: sha256Canonical(legacyTargets),
    filesHash: sha256Canonical(fileHashes),
    matches
  };
}

export const LEGACY_CLEANUP_CONTRACTS = Object.freeze({
  snapshot: SNAPSHOT_CONTRACT,
  targets: TARGETS_CONTRACT,
  backup: BACKUP_CONTRACT,
  smoke: SMOKE_CONTRACT,
  runtimeConsumers: RUNTIME_SCAN_CONTRACT,
  plan: PLAN_CONTRACT,
  pdfPlan: PDF_PLAN_CONTRACT
});
