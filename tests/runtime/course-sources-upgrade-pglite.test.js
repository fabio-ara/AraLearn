import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../../supabase/migrations/20260905101903_contextual_course_sources.sql", import.meta.url);

async function previousDatabase() {
  const database = new PGlite();
  // This scaffold exercises the complete migration and its data assertions. RPC
  // behavior/authorization is exercised on real Postgres by SQL019 and local E2E.
  await database.exec(`
    set check_function_bodies=off;
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema extensions; create schema auth;
    create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql as
      $$select '{"schemaRevision":"20260905095110","features":[]}'::jsonb$$;
    create function private.valid_course_source_publication_date_v1(text) returns boolean language sql as $$select true$$;
    create table public.courses(id uuid primary key,revision bigint not null default 1);
    create table private.course_sources(course_id uuid,source_id text,revision bigint,status text,kind text,
      source_role text,title text not null,authorship text,publication_date text,identifier text,language text,
      citation_text text,url text,edition_or_version text,origin text,availability text,verification_status text,
      study_visibility text,created_at timestamptz,public_file_access text,
      primary key(course_id,source_id),
      constraint course_sources_metadata_v2 check(true), constraint course_sources_status_v2 check(true),
      constraint course_sources_role_v1 check(true));
    create table private.course_source_anchors(course_id uuid,anchor_id text,source_id text,source_revision bigint,
      revision bigint,status text,selector jsonb,human_locator text,verification_excerpt text,created_at timestamptz,
      primary key(course_id,anchor_id));
    create table private.course_source_attributions(course_id uuid,id uuid,target_kind text,target_id text,
      target_version bigint,target_hash text,created_at timestamptz,primary key(course_id,id));
    create table private.course_source_attribution_sources(course_id uuid,attribution_id uuid,source_ordinal integer,
      source_id text,relation text,primary key(course_id,attribution_id,source_ordinal));
    create table private.course_source_attribution_anchors(course_id uuid,attribution_id uuid,source_ordinal integer,
      anchor_ordinal integer,source_id text,anchor_id text);
    create table private.course_source_attachments(course_id uuid,source_id text,source_revision bigint,content_hash text,
      status text,byte_size bigint,media_type text,storage_path text,created_at timestamptz,public_file_access text);
    create table private.course_source_pdf_upload_intents(course_id uuid,source_id text,source_revision bigint,expires_at timestamptz);
    create table private.course_anchored_annotations(course_id uuid,owner_response_source_links jsonb);
    create table private.course_change_receipts(actor_id uuid);
    create table private.course_entities(course_id uuid,entity_type text,entity_id text);
    insert into public.courses values('a0000000-0000-4000-8000-000000000001',7);
    insert into private.course_sources values('a0000000-0000-4000-8000-000000000001','source',3,'active','article',
      'curricular_scope','Título conhecido','Autoria literal; sem divisão','2026-09','DOI não inferido','pt-BR',
      E'  Referência manual preservada.\\n','https://example.test/source',null,'author_provided','restricted','unverified','citation',
      '2026-09-01T00:00:00Z','restricted');
    insert into private.course_source_anchors values('a0000000-0000-4000-8000-000000000001','anchor','source',3,2,'active',
      '{"kind":"page_range","startPage":2,"endPage":4}','Capítulo conhecido','Trecho privado de teste','2026-09-01T00:00:00Z');
    insert into private.course_source_attributions values('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','study_unit','unit',1,repeat('a',64),'2026-09-01T00:00:00Z');
    insert into private.course_source_attribution_sources values('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',0,'source','supported_by');
    insert into private.course_source_attribution_anchors values('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',0,0,'source','anchor');
    insert into private.course_source_attachments values('a0000000-0000-4000-8000-000000000001','source',3,repeat('b',64),'removed',512,'application/pdf','private-test-path','2026-09-01T00:00:00Z','restricted'),
      ('a0000000-0000-4000-8000-000000000001','source',3,repeat('c',64),'active',1024,'application/pdf','second-private-test-path','2026-09-02T00:00:00Z','available');
    insert into private.course_anchored_annotations values('a0000000-0000-4000-8000-000000000001','[{"sourceId":"source","relation":"supported_by","anchors":[{"anchorId":"anchor"}]}]');
  `);
  return database;
}

test("upgrade bibliográfico conserva textos, vínculo, âncora e PDFs ativos/retirados", async () => {
  const database = await previousDatabase();
  try {
    const attachments = (await database.query("select to_jsonb(a) value from private.course_source_attachments a order by content_hash")).rows;
    await database.exec(await readFile(migrationUrl, "utf8"));
    const source = (await database.query("select * from private.course_sources")).rows[0];
    assert.equal(source.citation_mode, "manual");
    assert.equal(source.citation_text, "  Referência manual preservada.\n");
    assert.deepEqual(source.authors, [{ literal: "Autoria literal; sem divisão" }]);
    assert.deepEqual(source.default_roles, ["curricular_scope"]);
    assert.equal(source.identifier, "DOI não inferido");
    assert.equal(source.bibliographic.doi, null);
    assert.equal(Object.hasOwn(source, "authorship"), false);
    assert.equal(Object.hasOwn(source, "source_role"), false);
    const links = (await database.query("select link_id,roles,occurrences from private.course_source_attribution_sources")).rows;
    assert.equal(links.length, 1);
    assert.match(links[0].link_id, /^[a-f0-9-]{36}$/u);
    assert.deepEqual(links[0].roles, ["curricular_scope"]);
    assert.deepEqual(links[0].occurrences, []);
    const anchor = (await database.query("select selector,content_hash from private.course_source_anchors")).rows[0];
    assert.deepEqual(anchor.selector, { kind: "page_range", startPage: 2, endPage: 4 });
    assert.equal(anchor.content_hash, null);
    assert.deepEqual((await database.query("select to_jsonb(a) value from private.course_source_attachments a order by content_hash")).rows, attachments);
    const response = (await database.query("select owner_response_source_links from private.course_anchored_annotations")).rows[0].owner_response_source_links[0];
    assert.deepEqual(response.roles, ["curricular_scope"]);
    assert.deepEqual(response.anchors, [{ anchorId: "anchor" }]);
  } finally { await database.close(); }
});

test("upgrade recusa intenção bibliográfica em andamento sem alterar o estado anterior", async () => {
  const database = await previousDatabase();
  try {
    await database.exec("insert into private.course_source_pdf_upload_intents values('a0000000-0000-4000-8000-000000000001','new-source',1,now()+interval '10 minutes')");
    await assert.rejects(database.exec(await readFile(migrationUrl, "utf8")), /ingestão de fonte em andamento/u);
    await database.exec("rollback");
    assert.equal((await database.query("select count(*)::integer n from information_schema.columns where table_schema='private' and table_name='course_sources' and column_name='authorship'")).rows[0].n, 1);
    assert.equal((await database.query("select citation_text from private.course_sources")).rows[0].citation_text, "  Referência manual preservada.\n");
  } finally { await database.close(); }
});
