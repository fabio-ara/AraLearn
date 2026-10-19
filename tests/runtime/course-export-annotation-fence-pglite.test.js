import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COURSE = "20000000-0000-4000-8000-000000000001";
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const load = name => fs.readFile(new URL(name, migrations), "utf8");

function functionSql(source, name) {
  const marker = `create or replace function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `migration defines ${name}`);
  const end = source.indexOf("$function$;", start);
  assert.notEqual(end, -1, `${name} has a complete function body`);
  return source.slice(start, end + "$function$;".length);
}

test("upgrade do reader de curso preserva policy, fence de anotações e ACL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema private;
      create table public.courses(
        id uuid primary key, owner_id uuid not null, revision bigint not null,
        title text not null, content_review_policy text not null,
        annotation_set_version bigint not null default 0
      );
      create function private.require_course_access_v1(uuid,uuid,boolean)
      returns void language plpgsql stable as $acl$
      begin
        if not exists(select 1 from public.courses where id=$1 and owner_id=$2) then
          raise exception 'course inaccessible' using errcode='42501';
        end if;
      end
      $acl$;
      create function private.get_course_for_actor_v1(uuid,uuid,boolean)
      returns jsonb language sql stable as $course$
        select jsonb_build_object('contract','aralearn.course.v1','courseId',course.id,
          'revision',course.revision,'title',course.title,'outlineIncluded',$3)
        from public.courses course where course.id=$2
      $course$;
      create function public.get_aralearn_runtime_manifest()
      returns jsonb language sql stable as $manifest$
        select '{"schemaRevision":"20260909063859","requiredFeatures":["human-content-review-v1"]}'::jsonb
      $manifest$;
      insert into public.courses(id,owner_id,revision,title,content_review_policy,annotation_set_version)
      values('${COURSE}','${OWNER}',19,'Curso protegido','reviewed_only',4);
    `);

    const accessMigration = await load("20260909063859_contextual_access_policy_read.sql");
    await db.exec(functionSql(accessMigration, "public.get_owned_course_for_actor_v1"));
    const before = (await db.query(
      "select public.get_owned_course_for_actor_v1($1,$2,false) as value", [OWNER, COURSE]
    )).rows[0].value;
    assert.equal(before.reviewPolicy, "reviewed_only");

    await db.exec(await load("20261019153000_course_export_annotation_fence.sql"));
    const after = (await db.query(
      "select public.get_owned_course_for_actor_v1($1,$2,false) as value", [OWNER, COURSE]
    )).rows[0].value;
    assert.equal(after.reviewPolicy, "reviewed_only");
    assert.equal(after.annotationSetVersion, 4);
    assert.deepEqual({ contract: after.contract, courseId: after.courseId, revision: after.revision,
      title: after.title, outlineIncluded: after.outlineIncluded },
    { contract: before.contract, courseId: before.courseId, revision: before.revision,
      title: before.title, outlineIncluded: before.outlineIncluded });

    await db.exec("update public.courses set content_review_policy='saved',annotation_set_version=9 where id='" + COURSE + "'");
    const updated = (await db.query(
      "select public.get_owned_course_for_actor_v1($1,$2,false) as value", [OWNER, COURSE]
    )).rows[0].value;
    assert.equal(updated.reviewPolicy, "saved");
    assert.equal(updated.annotationSetVersion, 9);
    await assert.rejects(db.query("select public.get_owned_course_for_actor_v1($1,$2,false)", [OTHER, COURSE]),
      error => error.code === "42501");

    const definition = (await db.query(`select procedure.prosecdef,procedure.proconfig
      from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public' and procedure.proname='get_owned_course_for_actor_v1'`)).rows[0];
    assert.equal(definition.prosecdef, true);
    assert.ok(definition.proconfig.some(value => value.includes("search_path=pg_catalog, public, private")));
    const manifest = (await db.query("select public.get_aralearn_runtime_manifest() as value")).rows[0].value;
    assert.equal(manifest.schemaRevision, "20261019153000");
    assert.ok(manifest.requiredFeatures.includes("human-content-review-v1"));
    assert.ok(manifest.requiredFeatures.includes("course-export-annotation-version-fence-v1"));
  } finally {
    await db.close();
  }
});
