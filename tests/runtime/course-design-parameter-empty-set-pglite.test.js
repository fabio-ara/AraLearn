import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const read = async (name) => (await fs.readFile(
  new URL("../../supabase/migrations/" + name, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const migration = await read("20260928120000_allow_empty_practice_variation_dimensions.sql");
const previousCatalog = await read("20260905162000_parameter_settings_groups.sql");
const scopedProfiles = await read("20260905080544_scoped_authoring_preferences_and_profiles.sql");
const cutover = await read("20260902044404_cut_legacy_authoring_runtime.sql");
const catalogBlock = (source) => source.slice(source.indexOf("-- COURSE_DESIGN_CATALOG_BEGIN"),
  source.indexOf("-- COURSE_DESIGN_CATALOG_END") + "-- COURSE_DESIGN_CATALOG_END".length);
const definition = (source, name) => {
  const start = source.search(new RegExp("create (?:or replace )?function " + name.replaceAll(".", "\\.") + "\\(", "iu"));
  assert.ok(start >= 0, name);
  const delimiter = /\bas\s+(\$\w*\$)/iu.exec(source.slice(start));
  const body = start + delimiter.index + delimiter[0].length;
  return source.slice(start, source.indexOf(delimiter[1] + ";", body) + delimiter[1].length + 1);
};

// Fixture focal, não integração Supabase inteira: carrega o bloco de catálogo
// real da migração anterior, a definição real da guarda de imutabilidade, a
// definição real do validador de valor e a migração sob prova, sobre as tabelas
// mínimas que elas tocam. O manifesto é um stub local.
async function fixture(mutate) {
  const db = new PGlite();
  await db.exec("create schema private; create table private.course_design_parameter_definitions(" +
    "parameter_id text primary key,ordinal integer,catalog_version text,value_kind text," +
    "supported_scopes text[],definition jsonb,default_value jsonb);" +
    "create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable " +
    "as $manifest$ select '{\"schemaRevision\":\"test\",\"features\":[]}'::jsonb $manifest$;");
  await db.exec(catalogBlock(previousCatalog));
  await db.exec(definition(cutover, "private.reject_course_design_parameter_definition_change_v1"));
  await db.exec("create trigger course_design_parameter_definitions_immutable_v1 before update or delete on " +
    "private.course_design_parameter_definitions for each row execute function " +
    "private.reject_course_design_parameter_definition_change_v1();");
  await db.exec(definition(scopedProfiles, "private.valid_course_design_parameter_value_v1"));
  if (mutate) await mutate(db);
  await db.exec(migration);
  return db;
}

const valid = async (db, parameterId, value) => (await db.query(
  "select private.valid_course_design_parameter_value_v1($1,$2::jsonb) as ok",
  [parameterId, value])).rows[0].ok;

test("catálogo aceita conjunto vazio apenas na variação requerida e preserva as demais guardas", async () => {
  const db = await fixture();
  const variation = "required_practice_variation_dimensions";
  assert.equal(await valid(db, variation, "[]"), true);
  assert.equal(await valid(db, variation, '["support_level"]'), true);
  assert.equal(await valid(db, variation, '["case_or_data","support_level"]'), true);
  assert.equal(await valid(db, variation, "null"), false);
  assert.equal(await valid(db, variation, '["inventado"]'), false);
  assert.equal(await valid(db, variation, '["case_or_data","case_or_data"]'), false);
  assert.equal(await valid(db, "required_explanation_forms", "[]"), false);
  assert.equal(await valid(db, "required_explanation_forms", '["plain_definition"]'), true);
  assert.equal((await db.query("select definition#>>'{valueSchema,minimumItems}' as value " +
    "from private.course_design_parameter_definitions where parameter_id=$1", [variation]))
    .rows[0].value, "0");
  assert.equal((await db.query("select count(*)::int as total from private.course_design_parameter_definitions"))
    .rows[0].total, 12);
  await assert.rejects(() => db.query(
    "update private.course_design_parameter_definitions set definition=definition where parameter_id=$1",
    [variation]));
});

test("migração recusa alteração da composição do catálogo", async () => {
  await assert.rejects(() => fixture(async (db) => {
    await db.exec("alter table private.course_design_parameter_definitions disable trigger " +
      "course_design_parameter_definitions_immutable_v1;" +
      "delete from private.course_design_parameter_definitions where parameter_id='practice_position';" +
      "insert into private.course_design_parameter_definitions" +
      "(parameter_id,ordinal,catalog_version,value_kind,supported_scopes,definition,default_value) " +
      "select 'parametro_estranho',9,catalog_version,value_kind,supported_scopes,definition,default_value " +
      "from private.course_design_parameter_definitions where parameter_id='practice_distribution';" +
      "alter table private.course_design_parameter_definitions enable trigger " +
      "course_design_parameter_definitions_immutable_v1;");
  }), /composição de parâmetros/u);
});
