import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CourseSupabaseAdapter } from '../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js';

export const PREPARED_READ_TABLES = [
  'course_instructional_plans','course_instructional_plan_items','course_entities',
  'course_authoring_parts','course_authoring_part_didactic_microsequences','course_design_target_plan_items',
  'course_design_parameter_assignments','course_source_attributions','course_source_attribution_sources',
  'course_source_attribution_anchors','course_sources','course_source_anchors',
  'course_source_attachments','course_media','course_anchored_annotations',
  'course_observation_targets','course_observation_bases','course_anchored_annotation_viewer_versions'
];

export async function preparedReadDatabase({ courseId, actorId, revision = 7 }) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema extensions; create schema cron;
    create table auth.users(id uuid primary key);
    create table public.courses(id uuid primary key,owner_id uuid,revision bigint,
      annotation_set_version bigint not null default 1,title text not null default 'Curso de teste',payload text);
    insert into auth.users values('${actorId}');
    insert into public.courses(id,owner_id,revision) values('${courseId}','${actorId}',${revision});
    create table private.course_design_parameter_definitions(payload text);
    create function private.require_service_role() returns void language plpgsql as $f$
      begin if current_setting('test.denied',true)='service' then
        raise exception 'service required' using errcode='42501'; end if; end $f$;
    create function private.require_course_access_v1(uuid,uuid,boolean) returns void language plpgsql stable as $f$
      begin if not exists(select 1 from public.courses where id=$1 and owner_id=$2) then
        raise exception 'course inaccessible' using errcode='42501'; end if; end $f$;
    create function extensions.digest(bytea,text) returns bytea language sql immutable as $f$
      select case when $2='sha256' then sha256($1) end $f$;
    create function public.get_aralearn_runtime_manifest() returns jsonb language sql stable as $f$
      select '{"schemaRevision":"20261019232352","features":[]}'::jsonb $f$;
    create table cron.job(jobname text,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $f$
      insert into cron.job values($1,$2,$3) returning 1::bigint $f$;
    ${PREPARED_READ_TABLES.map(name => `create table private.${name}(course_id uuid references public.courses(id) on delete cascade,payload text);`).join('\n')}
  `);
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261020005726_durable_prepared_human_reads.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261020045119_optimize_prepared_read_utf16_count.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261020081444_reduce_prepared_read_spill.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261020090110_bound_prepared_read_upload_batches.sql', import.meta.url), 'utf8'));
  const calls = [];
  const adapter = () => {
    const value = new CourseSupabaseAdapter({ supabaseUrl: 'https://fixture.example',
      serverApiKey: 'sb_secret_fixture', publishableKey: 'sb_publishable_fixture', publicAppUrl: 'https://app.example',
      fetchImpl: () => { throw Error('No network in the SQL fixture'); } });
    value.rpc = async (name, args) => {
      assert.match(name, /^[a-z0-9_]+$/u);
      const entries = Object.entries(args);
      entries.forEach(([key]) => assert.match(key, /^p_[a-z0-9_]+$/u));
      const result = (await db.query(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) as value`,
        entries.map(([, item]) => item && typeof item === 'object' ? JSON.stringify(item) : item))).rows[0].value;
      calls.push({ name, bytes: Buffer.byteLength(JSON.stringify(result)) });
      return result;
    };
    return value;
  };
  return { db, calls, adapter };
}
