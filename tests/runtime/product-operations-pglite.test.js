import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260824120000_product_operations_and_maintenance.sql",
  import.meta.url
);

const OWNER = "10000000-0000-4000-8000-000000000001";
const MEMBER = "10000000-0000-4000-8000-000000000002";
const ADMIN = "10000000-0000-4000-8000-000000000003";
const OWNED_COURSE = "20000000-0000-4000-8000-000000000001";
const SHARED_COURSE = "20000000-0000-4000-8000-000000000002";

async function productOperationsDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema storage;
    create schema cron;

    create table auth.users(
      id uuid primary key,
      deleted_at timestamptz,
      is_anonymous boolean not null default false,
      banned_until timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
    create table public.person_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade,
      avatar_object_key text
    );
    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null default 'Curso'
    );
    create table public.course_access(
      course_id uuid not null references public.courses(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      primary key(course_id,user_id)
    );
    create table storage.objects(
      bucket_id text not null,
      name text not null,
      primary key(bucket_id,name)
    );
    create table private.course_source_attachments(
      storage_path text primary key
    );
    create table cron.job(
      jobid bigint generated always as identity primary key,
      jobname text not null,
      command text not null,
      schedule text not null
    );

    create function private.require_service_role()
    returns void language plpgsql as $$
    begin
      if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
        raise exception 'service role required' using errcode='42501';
      end if;
    end $$;
    create function private.inventory_current_data_orphans_v1(p_limit integer)
    returns jsonb language sql stable as $$
      select jsonb_build_object(
        'contract','aralearn.current-data-orphans.v1',
        'items','[]'::jsonb,
        'limit',p_limit
      )
    $$;
    create function private.run_current_data_retention_v1(p_limit integer)
    returns jsonb language sql as $$
      select jsonb_build_object(
        'contract','aralearn.current-data-retention.v1',
        'processed',0,
        'limit',p_limit
      )
    $$;

    insert into auth.users(id,raw_app_meta_data) values
      ('${OWNER}','{}'),
      ('${MEMBER}','{}'),
      ('${ADMIN}','{"aralearn_role":"administrator"}');
    insert into public.person_profiles(user_id) values
      ('${OWNER}'),('${MEMBER}'),('${ADMIN}');
    insert into public.courses(id,owner_id,title) values
      ('${OWNED_COURSE}','${OWNER}','Descartável'),
      ('${SHARED_COURSE}','${OWNER}','Compartilhado');
    insert into public.course_access(course_id,user_id)
    values('${SHARED_COURSE}','${MEMBER}');
    insert into cron.job(jobname,command,schedule) values(
      'aralearn-current-data-retention-v1',
      'select private.run_current_data_retention_v1(512);',
      '17 3 * * *'
    );
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
  return database;
}

test("ciclo de vida exclui Curso próprio, permite sair do compartilhado e é repetível", async () => {
  const database = await productOperationsDatabase();
  const removeOwned = () => database.query(`
    select public.maintain_course_for_actor_v1(
      $1,$2,'delete_owned_course',true,'request-delete-0001'
    ) value
  `, [OWNER, OWNED_COURSE]);
  const first = (await removeOwned()).rows[0].value;
  assert.equal(first.status, "completed");
  assert.equal(first.changed, true);
  const repeated = (await removeOwned()).rows[0].value;
  assert.equal(repeated.status, "already_absent");
  assert.equal(repeated.changed, false);

  const left = await database.query(`
    select public.maintain_course_for_actor_v1(
      $1,$2,'leave_shared_course',true,'request-leave-0001'
    ) value
  `, [MEMBER, SHARED_COURSE]);
  assert.equal(left.rows[0].value.status, "completed");
  assert.equal((await database.query(
    "select count(*)::integer value from public.course_access where course_id=$1 and user_id=$2",
    [SHARED_COURSE, MEMBER]
  )).rows[0].value, 0);

  await assert.rejects(
    database.query(`select public.maintain_course_for_actor_v1(
      $1,$2,'delete_owned_course',true,'request-delete-0002'
    )`, [MEMBER, SHARED_COURSE]),
    /Somente o propriet/u
  );
});

test("Manutenção exige administrador vivo e mantém funções fora da Data API comum", async () => {
  const database = await productOperationsDatabase();
  const state = await database.query(
    "select public.get_current_maintenance_for_actor_v1($1,40) value",
    [ADMIN]
  );
  assert.equal(state.rows[0].value.contract, "aralearn.current-maintenance.v1");
  assert.equal(state.rows[0].value.retention.scheduled, true);
  assert.deepEqual(state.rows[0].value.inventory.items, []);

  await assert.rejects(
    database.query("select public.get_current_maintenance_for_actor_v1($1,40)", [OWNER]),
    /administrador autorizado/u
  );
  const privileges = await database.query(`
    select
      has_function_privilege(
        'service_role','public.maintain_course_for_actor_v1(uuid,uuid,text,boolean,text)','EXECUTE'
      ) service_can_execute,
      has_function_privilege(
        'authenticated','public.maintain_course_for_actor_v1(uuid,uuid,text,boolean,text)','EXECUTE'
      ) authenticated_can_execute,
      has_function_privilege(
        'anon','public.get_current_maintenance_for_actor_v1(uuid,integer)','EXECUTE'
      ) anon_can_inspect
  `);
  assert.deepEqual(privileges.rows[0], {
    service_can_execute: true,
    authenticated_can_execute: false,
    anon_can_inspect: false
  });
});

test("remoção administrativa revalida exatamente a classe e o objeto", async () => {
  const database = await productOperationsDatabase();
  const orphanPath = "40000000-0000-4000-8000-000000000004/avatar.png";
  await database.query(
    "insert into storage.objects(bucket_id,name) values('person-avatars',$1)",
    [orphanPath]
  );
  const authorized = await database.query(`
    select public.authorize_current_orphan_removal_for_actor_v1(
      $1,'avatar_owner_missing',$2,true
    ) value
  `, [ADMIN, orphanPath]);
  assert.deepEqual(authorized.rows[0].value, {
    contract: "aralearn.current-maintenance-removal.v1",
    classification: "avatar_owner_missing",
    bucketId: "person-avatars",
    objectPath: orphanPath,
    authorized: true
  });
  await assert.rejects(
    database.query(`select public.authorize_current_orphan_removal_for_actor_v1(
      $1,'avatar_profile_unlinked',$2,true
    )`, [ADMIN, orphanPath]),
    /não pertence mais/u
  );
});
