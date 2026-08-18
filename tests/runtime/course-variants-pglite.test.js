import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260818042341_course_variant_comparisons.sql",
  import.meta.url
);
const OWNER = "11111111-1111-4111-8111-111111111111";
const COURSE = "22222222-2222-4222-8222-222222222222";
const CHECKPOINT = "33333333-3333-4333-8333-333333333333";
const SET = "44444444-4444-4444-8444-444444444444";

async function databaseWithVariantAuthorities() {
  const migration = await fs.readFile(migrationUrl, "utf8");
  const tablesStart = migration.indexOf("create table private.course_variant_plan_checkpoints");
  const indexesStart = migration.indexOf("create index course_variant_sets_owner_recent_v1_idx", tablesStart);
  const guardStart = migration.indexOf("create function private.reject_course_variant_history_change_v1()");
  const cloneStart = migration.indexOf("create function private.clone_course_variant_from_source_v1(", guardStart);
  assert.ok(tablesStart >= 0 && indexesStart > tablesStart && guardStart > indexesStart && cloneStart > guardStart);

  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;
    create schema extensions;
    create table auth.users(id uuid primary key);
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade
    );
    create function private.course_variant_plan_snapshot_hash_v1(jsonb)
    returns text language sql immutable as $$select repeat('a',64)$$;
    create function extensions.gen_random_uuid()
    returns uuid language sql volatile as $$select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;
  `);
  await database.exec(migration.slice(tablesStart, indexesStart));
  await database.exec(migration.slice(guardStart, cloneStart));
  return database;
}

async function seed(database) {
  await database.query("insert into auth.users(id) values($1)", [OWNER]);
  await database.query("insert into public.courses(id,owner_id) values($1,$2)", [COURSE, OWNER]);
  await database.query(`
    insert into private.course_variant_plan_checkpoints(
      id,owner_id,source_course_id,source_course_revision,source_plan_version,
      plan_snapshot,snapshot_hash
    ) values($1,$2,$3,1,1,'{}'::jsonb,repeat('a',64))
  `, [CHECKPOINT, OWNER, COURSE]);
  await database.query(`
    insert into private.course_variant_comparison_sets(
      id,owner_id,checkpoint_id,source_course_id,source_course_revision
    ) values($1,$2,$3,$4,1)
  `, [SET, OWNER, CHECKPOINT, COURSE]);
  await database.query(`
    insert into private.course_variant_comparison_members(
      comparison_set_id,course_id,label,attached_course_revision
    ) values($1,$2,'A',1)
  `, [SET, COURSE]);
}

test("checkpoint é imutável manualmente e Course remove apenas os vínculos comparativos", async () => {
  const database = await databaseWithVariantAuthorities();
  await seed(database);

  await assert.rejects(
    database.query("delete from private.course_variant_plan_checkpoints where id=$1", [CHECKPOINT]),
    (error) => error.code === "55000"
  );

  await database.query("delete from public.courses where id=$1", [COURSE]);
  for (const relation of [
    "private.course_variant_plan_checkpoints",
    "private.course_variant_comparison_sets",
    "private.course_variant_comparison_members"
  ]) {
    const result = await database.query(`select count(*)::integer count from ${relation}`);
    assert.equal(result.rows[0].count, 0, relation);
  }
  await database.close();
});
