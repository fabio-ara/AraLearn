import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { composeCourseDocument, flattenCourseDocument } from "../../src/domain/courseEntities.js";

const read = name => fs.readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
function definition(source, name) {
  const start = source.search(new RegExp(`create (?:or replace )?function ${name.replaceAll(".", "\\.")}\\(`, "u"));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("$function$;", start) + "$function$;".length);
}
const COURSE = "10000000-0000-4000-8000-000000000001";
const reconciliation = { contract: "aralearn.explanation-reconciliation.v1", contentBasis: "a".repeat(64), entries: [{
  resourceId: "body", path: "text", quote: "Uma relação.", prefix: null, suffix: null, role: "introduced",
  analysisUnitIds: ["idea"], evidenceRequirementIds: [], destinationMicrosequenceId: null, reason: "Introduz a relação." }] };
const explanation = { title: "Base", content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0",
  data: { text: "Uma relação." } }], reconciliation };
const guide = { goal: "Reconhecer a relação", include: [], exclude: [], notation: [], avoid: [] };
const fixture = () => ({ contract: "aralearn.course.v1", courses: [{ id: COURSE, title: "Curso sintético", goal: "Reconhecer",
  modules: [{ id: "module", title: "Módulo", guide, lessons: [{ id: "lesson", title: "Lição", guide, topics: [],
    microsequences: [{ id: "micro", title: "Relação", goal: "Reconhecer", role: "explain", dependsOn: [], covers: [],
      checks: [], errors: [], explanation, studyUnits: [{ id: "unit", position: 1, title: "Relação", role: "theory",
        content: explanation.content, response: null, feedback: [], topics: [] }] }] }] }] }] });

test("o DTO de estudo retira só a reconciliação e conserva paginação, autoria e documento atual", async () => {
  const db = new PGlite();
  const flat = flattenCourseDocument(fixture());
  try {
    // Actual SQL reader and public/owner wrappers over explicit relational data.
    // Access is a narrow stub; this case does not replace the RLS/hosted proofs.
    await db.exec(`create schema private; create schema auth; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$select '${COURSE}'::uuid$$;
      create function private.require_course_access_v1(uuid,uuid,boolean) returns void language plpgsql as $$begin
        if $1<>'${COURSE}'::uuid then raise exception 'access denied' using errcode='42501'; end if; end$$;
      create table public.courses(id uuid primary key,revision bigint);
      insert into public.courses values('${COURSE}',1);
      create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_type text,parent_id text,
        position integer,content jsonb,version bigint,created_at timestamptz,updated_at timestamptz);`);
    for (const row of flat.rows) {
      await db.query("insert into private.course_entities values($1,$2,$3,$4,$5,$6,$7,1,now(),now())",
        [COURSE, row.entityType, row.entityId, row.parentType, row.parentId, row.position, row.content]);
    }
    const precursor = await read("20260817140000_course_identity_cutover.sql");
    await db.exec(definition(precursor, "private.list_course_entities_for_actor_v1"));
    await db.exec(definition(precursor, "public.list_course_entities_v1"));
    const owned = await read("20260817150000_course_profiles_access.sql");
    await db.exec(definition(owned, "public.list_owned_course_entities_for_actor_v1"));
    await db.exec(definition(owned, "public.list_owned_course_entities_v1"));
    await db.exec("revoke all on function public.list_course_entities_v1(uuid,bigint,integer,text,text) from public; grant execute on function public.list_course_entities_v1(uuid,bigint,integer,text,text) to anon,authenticated");
    const query = async (name, args = [COURSE, 1, 500, null, null]) =>
      (await db.query(`select public.${name}($1,$2,$3,$4,$5) value`, args)).rows[0].value;
    const before = await query("list_course_entities_v1");
    await db.exec(definition(await read("20260916031133_incremental_materialization.sql"), "public.list_course_entities_v1"));
    const publicPage = await query("list_course_entities_v1");
    const expected = structuredClone(before);
    delete expected.items.find(row => row.entityType === "microsequence").content.explanation.reconciliation;
    assert.deepEqual(publicPage, expected);
    assert.deepEqual(await query("list_owned_course_entities_v1"), before);
    const stored = (await db.query("select content from private.course_entities where entity_type='microsequence'")).rows[0].content;
    assert.deepEqual(stored.explanation, explanation);
    const restored = composeCourseDocument(flat.course, publicPage.items);
    assert.deepEqual(restored.courses[0].modules[0].lessons[0].microsequences[0].explanation,
      { title: explanation.title, content: explanation.content });
    const authoring = composeCourseDocument(flat.course, before.items);
    assert.deepEqual(authoring.courses[0].modules[0].lessons[0].microsequences[0].explanation, explanation);
    const first = await query("list_course_entities_v1", [COURSE, 1, 2, null, null]);
    const second = await query("list_course_entities_v1", [COURSE, 1, 2, first.nextCursor.entityType, first.nextCursor.entityId]);
    assert.deepEqual([...first.items, ...second.items], publicPage.items);
    assert.equal(second.hasMore, false);
    assert.deepEqual((await db.query("select has_function_privilege('anon','public.list_course_entities_v1(uuid,bigint,integer,text,text)','EXECUTE') a,has_function_privilege('authenticated','public.list_course_entities_v1(uuid,bigint,integer,text,text)','EXECUTE') b")).rows[0], { a: true, b: true });
    await assert.rejects(query("list_course_entities_v1", [COURSE, 2, 500, null, null]), /releia/u);
    await assert.rejects(query("list_course_entities_v1", ["20000000-0000-4000-8000-000000000001", 1, 500, null, null]), /access denied/u);
    // Legacy explanations and missing explanations stay byte-for-byte unchanged.
    await db.exec("update private.course_entities set content=content #- '{explanation,reconciliation}' where entity_type='microsequence'");
    assert.deepEqual(await query("list_course_entities_v1"), await query("list_owned_course_entities_v1"));
    await db.exec("update private.course_entities set content=content-'explanation' where entity_type='microsequence'");
    assert.deepEqual(await query("list_course_entities_v1"), await query("list_owned_course_entities_v1"));
    await db.exec("delete from private.course_entities");
    assert.deepEqual((await query("list_course_entities_v1")).items, []);
  } finally { await db.close(); }
});
