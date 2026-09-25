import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { inspectCourseAudioReadiness } from "../../src/domain/courseMedia.js";

const course = "20000000-0000-4000-8000-000000000002";
const media = { contentHash: "a".repeat(64), byteSize: 24044, mediaType: "audio/wav" };
const content = kind => ({ content: [{ id: "voice", package: "aralearn.resource.audio", version: "1.0.0",
  data: { tracks: [{ id: "a", label: "Escuta", locale: "pt-BR", kind, ...(kind === "file" ? { media } : { text: "Olá." }),
    alternative: { text: "Olá.", visibility: "after_response" } }] } }] });

test("autoria detecta voz sem gravação e referência não guardada antes da materialização", () => {
  assert.equal(inspectCourseAudioReadiness(content("native"), [media])[0].code, "audio_recording_required");
  assert.equal(inspectCourseAudioReadiness(content("file"), [])[0].code, "audio_file_unavailable");
  assert.equal(inspectCourseAudioReadiness(content("file"), [{ ...media, byteSize: 1 }])[0].code, "audio_file_unavailable");
  assert.deepEqual(inspectCourseAudioReadiness(content("file"), [media]), []);
});

test("banco recusa áudio inviável ao publicar, compartilhar ou editar conteúdo já oferecido", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private; create schema storage;
      create role anon; create role authenticated; create role service_role;
      create table public.courses(id uuid primary key,visibility text default 'private',public_file_access text default 'restricted');
      create table public.course_access(course_id uuid,user_id uuid);
      create table private.course_entities(course_id uuid,entity_id text,entity_type text,content jsonb);
      create table private.course_media(course_id uuid,content_hash text,byte_size bigint,media_type text,storage_path text,status text,updated_at timestamptz);
      create table storage.objects(bucket_id text,name text);
      -- Contorno mínimo do comando já existente; o pgTAP e o cliente real exercitam
      -- sua implementação completa, com autenticação, revisão e limpeza de arquivos.
      create function public.execute_course_media_for_actor_v1(p_actor_id uuid,p_course_id uuid,p_expected_revision bigint,p_command jsonb,p_request_id text)
      returns jsonb language plpgsql as $f$
      declare v_media private.course_media%rowtype;
      begin
        select * into v_media from private.course_media where course_id=p_course_id and content_hash=p_command->>'contentHash';
        update private.course_media set status='removed',updated_at=statement_timestamp() where course_id=p_course_id and content_hash=v_media.content_hash returning * into v_media;
        return to_jsonb(v_media);
      end $f$;
      insert into public.courses(id) values('${course}');`);
    await db.exec(await fs.readFile(new URL("../../supabase/migrations/20260924182348_revisao_v7_audio_readiness.sql", import.meta.url), "utf8"));
    await db.query("insert into private.course_entities values($1,'u','study_unit',$2)", [course, JSON.stringify(content("native"))]);
    const publish = () => db.exec("update public.courses set visibility='public',public_file_access='available'");
    const share = () => db.query("insert into public.course_access values($1,$2)", [course, "30000000-0000-4000-8000-000000000003"]);
    await assert.rejects(publish(), { code: "PT422" });
    await assert.rejects(share(), { code: "PT422" });
    await db.query("update private.course_entities set content=$1", [JSON.stringify(content("file"))]);
    await assert.rejects(publish(), { code: "PT422" });
    await db.query("insert into private.course_media(course_id,content_hash,byte_size,media_type,storage_path,status) values($1,$2,$3,$4,'file.wav','active')", [course, media.contentHash, media.byteSize, media.mediaType]);
    await assert.rejects(publish(), { code: "PT422" });
    await db.exec("insert into storage.objects values('course-media','file.wav')");
    await assert.rejects(db.exec("update public.courses set visibility='public'"), { code: "PT422" });
    await publish();
    await share();
    const retire = () => db.query("select public.execute_course_media_for_actor_v1(null,$1,1,$2,'readiness-test')", [course, JSON.stringify({ type: "remove_media", contentHash: media.contentHash })]);
    await assert.rejects(retire(), { code: "PT409" });
    await assert.rejects(db.query("update private.course_entities set content=$1", [JSON.stringify(content("native"))]), { code: "PT422" });
    await db.exec("update public.courses set visibility='private'");
    await assert.rejects(db.query("update private.course_entities set content=$1", [JSON.stringify(content("native"))]), { code: "PT422" });
    await db.exec("delete from public.course_access");
    await db.query("update private.course_entities set content=$1", [JSON.stringify(content("native"))]);
    await retire();
    assert.equal((await db.query("select visibility from public.courses")).rows[0].visibility, "private");
  } finally { await db.close(); }
});
