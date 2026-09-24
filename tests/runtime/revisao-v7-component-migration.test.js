import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const migration = await fs.readFile(new URL("../../supabase/migrations/20260924172159_revisao_v7_component_removal.sql", import.meta.url), "utf8");
const sourceMigration = await fs.readFile(new URL("../../supabase/migrations/20260905101903_contextual_course_sources.sql", import.meta.url), "utf8");
const start = sourceMigration.indexOf("CREATE OR REPLACE FUNCTION private.apply_course_source_attribution_v2(");
const finish = sourceMigration.indexOf("$function$", sourceMigration.indexOf("$function$", start) + 10);
const sourceWriter = sourceMigration.slice(start, finish + 10).replace("('plan_item','study_unit')", "('plan_item','study_unit','microsequence_explanation')") + ";";
const course = "10000000-0000-4000-8000-000000000001";
const paragraph = text => ({ id: "feedback", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });

test("corte migra conteúdo, links, PDF e políticas, conserva eventos e elimina admissão de resposta removida", async () => {
  const db = new PGlite();
  try {
    // Real migration and attribution writer; source hash/auth are local stubs.
    // Complete triggers and permissions are exercised by the database upgrade gate.
    await db.exec(`create schema private; create schema extensions;
      create role anon; create role authenticated; create role service_role;
      create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$;
      create table public.courses(id uuid primary key,revision bigint,updated_at timestamptz);
      create table private.course_entities(course_id uuid,entity_type text,entity_id text,parent_id text,content jsonb,version bigint default 1,updated_at timestamptz, primary key(course_id,entity_type,entity_id));
      create table private.course_sources(course_id uuid,source_id text,revision bigint,status text,kind text,title text,citation_text text,url text,origin text,availability text,verification_status text,study_visibility text,default_roles jsonb,primary key(course_id,source_id));
      create table private.course_source_attachments(course_id uuid,source_id text,content_hash text);
      create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,status text);
      create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text,target_version bigint,target_hash text,created_at timestamptz);
      create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_ordinal int,source_id text,relation text,link_id text,roles jsonb,occurrences jsonb);
      create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,source_ordinal int,anchor_ordinal int,source_id text,anchor_id text);
      create function private.valid_course_source_links_shape_v2(p jsonb) returns boolean language sql as $$select jsonb_typeof(p)='array' and jsonb_array_length(p)<=32$$;
      create function private.course_source_links_v1(c uuid,a uuid) returns jsonb language sql as $$select coalesce(jsonb_agg(jsonb_build_object('linkId',link_id,'sourceId',source_id,'relation',relation,'roles',roles,'occurrences',occurrences,'anchors','[]'::jsonb)),'[]'::jsonb) from private.course_source_attribution_sources where course_id=c and attribution_id=a$$;
      create function private.course_source_target_state_v1(c uuid,k text,i text) returns jsonb language sql as $$select jsonb_build_object('version',version,'hash',repeat('a',64)) from private.course_entities where course_id=c and entity_id=i$$;
      create function private.valid_course_component_policy_v1(p jsonb) returns boolean language sql as $$select jsonb_typeof(p)='object'$$;
      create table private.course_component_policy_assignments(policy jsonb,origin text,reason text, constraint course_component_policy_assignments_policy_v1 check(private.valid_course_component_policy_v1(policy)));
      create table private.test_historic_answers(answer jsonb);
      ${sourceWriter}
      insert into public.courses values('${course}',8,now());
      insert into private.test_historic_answers values('{"text":"Minha explicação preservada","complete":true}');
      insert into private.course_sources(course_id,source_id,status) values('${course}','pdf','active');
      insert into private.course_source_attachments values('${course}','pdf',repeat('b',64));
      insert into private.course_component_policy_assignments values('{"catalogVersion":"old","availability":"allow_only","allowedRefs":["aralearn.response.open@1.0.0"],"excludedRefs":[],"preferredRefs":[]}','author','Escolha explícita');`);
    const content = {
      title: "Causalidade", role: "practice", content: [
        { id: "table", package: "aralearn.resource.table", version: "1.0.0", data: { prompt: "Compare os casos.", caption: "Amostra limitada.", layout: "wide", columns: ["Caso", "Efeito"], rows: [["A", "B"]] } },
        { id: "consult", package: "aralearn.resource.dictionary", version: "1.0.0", data: { title: "Sentidos no contexto", prompt: "Observe os usos.", items: [
          { id: "web", label: "Obra lexical", description: "Compare as acepções.", target: { kind: "url", url: "https://example.org/lexico" } },
          { id: "pdf", label: "Leitura do curso", target: { kind: "source_attachment", sourceId: "pdf", sourceRevision: 2, contentHash: "b".repeat(64) } }
        ] } }
      ], response: { id: "answer", package: "aralearn.response.open", version: "1.0.0", data: { prompt: "Explique a causa.", placeholder: "Relacione os casos." } },
      feedback: [paragraph("A mudança decorre da causa comum.")], topics: []
    };
    await db.query("insert into private.course_entities(course_id,entity_type,entity_id,parent_id,content) values($1,'study_unit','unit','micro',$2)", [course, content]);
    const oldOccurrences = [
      ["content", "table", "prompt", "Compare os casos."],
      ["content", "table", "caption", "Amostra limitada."],
      ["content", "consult", "title", "Sentidos no contexto"],
      ["content", "consult", "items[0].description", "Compare as acepções."],
      ["response", "answer", "prompt", "Explique a causa."],
      ["response", "answer", "placeholder", "Relacione os casos."],
      ["feedback", "feedback", "text", "A mudança decorre da causa comum."]
    ].map(([slot, resourceId, path, quote], i) => ({ occurrenceId: `old-${i}`, slot, resourceId, path, quote, prefix: null, suffix: null }));
    await db.query("select private.apply_course_source_attribution_v2($1,'study_unit','unit',1,$2)", [course, [
      { linkId: "original-link", sourceId: "pdf", relation: "informed_by", roles: ["recommended_reading"], anchors: [], occurrences: oldOccurrences }
    ]]);
    await db.exec(migration);
    const converted = (await db.query("select content,version from private.course_entities")).rows[0];
    assert.equal(converted.version, 2);
    assert.equal(converted.content.role, "theory");
    assert.equal(converted.content.response, null);
    assert.deepEqual(converted.content.feedback, []);
    for (const instance of converted.content.content) {
      const validation = RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "content");
      assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    }
    const text = JSON.stringify(converted.content);
    for (const expected of ["Compare os casos.", "Amostra limitada.", "Compare as acepções.", "Explique a causa.", "Relacione os casos.", "causa comum"]) assert.ok(text.includes(expected));
    assert.doesNotMatch(text, /response\.open|resource\.dictionary|"layout"|"caption"/u);
    const links = (await db.query("select * from private.course_source_attribution_sources order by source_ordinal")).rows;
    assert.equal(links.length, 3);
    for (const { occurrences, roles, relation } of links) {
      for (const occurrence of occurrences) {
        assert.equal(occurrence.slot, "content");
        assert.equal(converted.content.content.find(item => item.id === occurrence.resourceId).data[occurrence.path], occurrence.quote);
      }
      assert.deepEqual(roles, ["recommended_reading"]);
      assert.equal(relation, "informed_by");
    }
    assert.equal((await db.query("select count(*)::int n from private.course_source_attachments")).rows[0].n, 1);
    assert.equal((await db.query("select answer->>'text' value from private.test_historic_answers")).rows[0].value, "Minha explicação preservada");
    const assignment = (await db.query("select * from private.course_component_policy_assignments")).rows[0];
    assert.deepEqual(assignment.policy.allowedRefs, ["aralearn.resource.paragraph@1.0.0"]);
    assert.equal(assignment.origin, "author");
    assert.equal((await db.query("select revision from public.courses")).rows[0].revision, 9);
    await assert.rejects(db.query("select private.assert_course_practice_authoring_v1($1,$2)", [course, [{ entityType: "study_unit", entityId: "new", content }]]), /unknown_response_component/u);
  } finally { await db.close(); }
});
