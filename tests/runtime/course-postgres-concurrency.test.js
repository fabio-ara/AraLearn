import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import { runPsql } from "../../scripts/courseCutover/courseCutoverSource.mjs";

const databaseUrl = String(process.env.ARALEARN_TEST_DATABASE_URL || "").trim();
const nativePsqlAvailable = spawnSync("psql", ["--version"], {
  encoding: "utf8",
  windowsHide: true
}).status === 0;
const localDatabase = (() => {
  try {
    return new Set(["127.0.0.1", "localhost"]).has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
})();
const localDockerPsqlAvailable = !nativePsqlAvailable && localDatabase &&
  spawnSync("docker", ["inspect", "supabase_db_aralearn"], {
    encoding: "utf8",
    windowsHide: true,
    stdio: "ignore"
  }).status === 0;

function psql(sql) {
  const commands = Array.isArray(sql) ? sql : [sql];
  const executable = localDockerPsqlAvailable ? "docker" : "psql";
  const connection = localDockerPsqlAvailable
    ? ["exec", "-i", "supabase_db_aralearn", "psql", "-U", "postgres", "-d", "postgres"]
    : ["--dbname", databaseUrl];
  return spawn(executable, [
    ...connection,
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-Atq",
    ...commands.flatMap((command) => ["--command", command])
  ], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function result(processValue) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    processValue.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    processValue.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    processValue.once("error", reject);
    processValue.once("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `psql terminou com código ${code}.`));
    });
  });
}

function marker(processValue, expected) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    processValue.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes(expected)) resolve();
    });
    processValue.once("error", reject);
    processValue.once("exit", (code) => {
      if (!stdout.includes(expected)) {
        reject(new Error(`psql terminou com código ${code} antes de emitir ${expected}.`));
      }
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDatabaseCondition(sql, {
  intervalMilliseconds = 50,
  timeoutMilliseconds = 4_000
} = {}) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await result(psql(sql)) === "1") return;
    await delay(intervalMilliseconds);
  }
  throw new Error("A condição concorrencial do PostgreSQL não ocorreu dentro do prazo.");
}

async function createUser(userId, email) {
  await result(psql(`
    insert into auth.users(
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '${userId}', 'authenticated', 'authenticated', '${email}', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    ) on conflict (id) do nothing;
  `));
}

function cleanupUser(userId, email) {
  return result(psql(`
    delete from auth.users where id='${userId}' and email='${email}';
  `));
}

const postgresGate = !databaseUrl || (!nativePsqlAvailable && !localDockerPsqlAvailable)
  ? "defina ARALEARN_TEST_DATABASE_URL e disponibilize psql ou a stack Docker local"
  : false;
const parsedDatabaseUrl = (() => {
  try {
    return new URL(databaseUrl);
  } catch {
    return null;
  }
})();
const runnerPassword = parsedDatabaseUrl
  ? decodeURIComponent(parsedDatabaseUrl.password || "")
  : "";
const localCutoverGate = postgresGate || !localDatabase || !runnerPassword
  ? "o gate do corte exige PostgreSQL local com senha na URL"
  : false;

test("PostgreSQL aplica e relê o contrato de desenho #122 com replay idempotente", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000001222";
  const email = "course-design-122@aralearn.invalid";
  await createUser(ownerId, email);
  try {
    const courseOutput = await result(psql(`
      select set_config('request.jwt.claim.role','service_role',false);
      select (public.create_course_for_actor_v1(
        '${ownerId}',
        'Curso PostgreSQL #122',
        'Validar o desenho parametrizado no PostgreSQL.',
        'course-122-create'
      )->>'courseId');
    `));
    const courseId = courseOutput.split(/\r?\n/u).at(-1);
    assert.match(courseId, /^[0-9a-f-]{36}$/u);
    const command = `jsonb_build_object(
      'type','set_parameter',
      'scope',jsonb_build_object('kind','course','ref','${courseId}'),
      'parameterId','new_analysis_unit_ceiling_per_expository_study_unit',
      'value',3,
      'origin','author',
      'reason','Decisão validada no PostgreSQL.'
    )`;
    const firstOutput = await result(psql(`
      select set_config('request.jwt.claim.role','service_role',false);
      select concat(
        change->>'contract','|',change->>'courseRevision','|',
        change->>'idempotent','|',change->>'changed'
      ) from (
        select public.apply_course_design_command_for_actor_v1(
          '${ownerId}','${courseId}',1,${command},
          'application','course-122-design-1'
        ) as change
      ) applied;
    `));
    const first = firstOutput.split(/\r?\n/u).at(-1);
    assert.equal(first, "aralearn.course-design-change.v1|2|false|true");
    const replayOutput = await result(psql(`
      select set_config('request.jwt.claim.role','service_role',false);
      select concat(change->>'courseRevision','|',change->>'idempotent')
      from (
        select public.apply_course_design_command_for_actor_v1(
          '${ownerId}','${courseId}',1,${command},
          'application','course-122-design-1'
        ) as change
      ) applied;
    `));
    const replay = replayOutput.split(/\r?\n/u).at(-1);
    assert.equal(replay, "2|true");
    const readOutput = await result(psql(`
      select set_config('request.jwt.claim.role','service_role',false);
      select concat(
        design->>'contract','|',jsonb_array_length(design->'definitions'),'|',
        design#>>'{componentCatalog,version}','|',
        design#>>'{parameters,0,effectiveAssignment,value}'
      ) from (
        select public.get_owned_course_design_for_actor_v1(
          '${ownerId}','${courseId}','course','${courseId}',32,null
        ) as design
      ) loaded;
    `));
    const read = readOutput.split(/\r?\n/u).at(-1);
    assert.equal(read, "aralearn.course-design.v1|4|1-3e5629f8|3");
  } finally {
    await cleanupUser(ownerId, email);
  }
});

test("PostgreSQL mantém a ordem pessoa antes de Curso entre anotação e exclusão de conta", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000001240";
  const learnerId = "00000000-0000-4000-8000-000000001241";
  const courseId = "10000000-0000-4000-8000-000000001240";
  const annotationId = "20000000-0000-4000-8000-000000001240";
  const ownerEmail = "annotation-lock-owner@aralearn.invalid";
  const learnerEmail = "annotation-lock-learner@aralearn.invalid";
  await createUser(ownerId, ownerEmail);
  await createUser(learnerId, learnerEmail);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values('${courseId}','${ownerId}','Curso de locks','Excluir conta sem deadlock');
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ('${courseId}','module','module-lock',null,null,0,
          '{"title":"Módulo"}'::jsonb),
        ('${courseId}','lesson','lesson-lock','module','module-lock',0,
          '{"title":"Lição"}'::jsonb),
        ('${courseId}','microsequence','micro-lock','lesson','lesson-lock',0,
          '{"title":"Microssequência","dependsOn":[]}'::jsonb),
        ('${courseId}','study_unit','unit-lock','microsequence','micro-lock',1,
          '{"title":"Unidade","topics":[]}'::jsonb);
      insert into public.course_access(course_id,user_id,granted_by)
      values('${courseId}','${learnerId}','${ownerId}');
      begin;
      select set_config('request.jwt.claim.sub','${learnerId}',true);
      select set_config('request.jwt.claim.role','authenticated',true);
      select public.execute_my_course_anchored_annotation_command_v1(
        '${courseId}',1,jsonb_build_object(
          'type','create_anchored_annotation',
          'annotationId','${annotationId}',
          'target',jsonb_build_object('kind','study_unit','id','unit-lock'),
          'rawText','Texto inicial','category',null,
          'capturedAt',null,'briefSummary',null
        ),'annotation-lock-create'
      );
      commit;
    `));

    const courseBlocker = psql([
      `begin;
       select 1 from public.courses where id='${courseId}' for update;`,
      "select 'annotation-course-locked';",
      "select pg_sleep(6); commit;"
    ]);
    await marker(courseBlocker, "annotation-course-locked");

    const mutation = psql(`
      set application_name='aralearn-annotation-mutation-lock-probe';
      begin;
      set local deadlock_timeout='250ms';
      select set_config('request.jwt.claim.sub','${learnerId}',true);
      select set_config('request.jwt.claim.role','authenticated',true);
      select public.execute_my_course_anchored_annotation_command_v1(
        '${courseId}',null,jsonb_build_object(
          'type','revise_anchored_annotation',
          'annotationId','${annotationId}',
          'expectedAnnotationVersion',1,
          'rawText','Texto revisto','category',null,'briefSummary',null
        ),'annotation-lock-revise'
      );
      commit;
    `);
    await waitForDatabaseCondition(`
      select (count(*) = 1)::integer
      from pg_stat_activity
      where application_name='aralearn-annotation-mutation-lock-probe'
        and state='active'
        and wait_event_type='Lock';
    `);
    const accountDeletion = psql(`
      begin;
      set local deadlock_timeout='250ms';
      delete from auth.users where id='${learnerId}';
      commit;
    `);

    await Promise.all([
      result(courseBlocker), result(mutation), result(accountDeletion)
    ]);
    assert.equal(await result(psql(`
      select state || '|' || version || '|' || (actor_id is null)::text || '|' ||
        (raw_text is null)::text
      from private.course_anchored_annotations where id='${annotationId}';
    `)), "withdrawn|3|true|true");
    assert.equal(await result(psql(`
      select count(*) from private.course_anchored_annotation_events
      where annotation_id='${annotationId}';
    `)), "3");
  } finally {
    await cleanupUser(learnerId, learnerEmail);
    await cleanupUser(ownerId, ownerEmail);
  }
});

test("PostgreSQL serializa Storage sensível e exclusão da conta pelo mesmo lock", {
  skip: postgresGate
}, async () => {
  const avatarOwnerId = "00000000-0000-4000-8000-000000001500";
  const avatarSessionId = "00000000-0000-4000-8000-000000001501";
  const avatarObjectId = "00000000-0000-4000-8000-000000001502";
  const avatarObjectName =
    `${avatarOwnerId}/00000000-0000-4000-8000-000000001503.webp`;
  const avatarEmail = "storage-lock-avatar-150@aralearn.invalid";
  const pdfOwnerId = "00000000-0000-4000-8000-000000001510";
  const pdfSessionId = "00000000-0000-4000-8000-000000001511";
  const pdfObjectId = "00000000-0000-4000-8000-000000001512";
  const pdfCourseId = "10000000-0000-4000-8000-000000001510";
  const pdfHash = "a".repeat(64);
  const pdfObjectName = `${pdfCourseId}/${pdfHash}.pdf`;
  const pdfEmail = "storage-lock-pdf-150@aralearn.invalid";
  const authenticatedContext = (userId, sessionId) => `
    select set_config('request.jwt.claim.sub','${userId}',true);
    select set_config('request.jwt.claim.role','authenticated',true);
    select set_config(
      'request.jwt.claims',
      '{"sub":"${userId}","role":"authenticated","session_id":"${sessionId}"}',
      true
    );
  `;

  await createUser(avatarOwnerId, avatarEmail);
  await createUser(pdfOwnerId, pdfEmail);
  try {
    await result(psql(`
      insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
      values
        ('${avatarSessionId}','${avatarOwnerId}',now(),now(),now()+interval '1 hour'),
        ('${pdfSessionId}','${pdfOwnerId}',now(),now(),now()+interval '1 hour');
      insert into public.courses(id,owner_id,title,goal)
      values(
        '${pdfCourseId}','${pdfOwnerId}',
        'Curso do lock de PDF','Serializar upload e exclusão de conta'
      );
      insert into private.course_source_pdf_upload_intents(
        actor_id,course_id,storage_path,content_hash,byte_size,media_type,
        source_id,source_revision,course_revision
      ) values(
        '${pdfOwnerId}','${pdfCourseId}','${pdfObjectName}','${pdfHash}',512,
        'application/pdf','source-lock',1,1
      );
    `));

    const avatarWriter = psql([
      `set application_name='aralearn-avatar-write-lock-probe';
       begin;
       set local role authenticated;
       ${authenticatedContext(avatarOwnerId, avatarSessionId)}
       insert into storage.objects(
         id,bucket_id,name,owner,owner_id,metadata
       ) values(
         '${avatarObjectId}','person-avatars','${avatarObjectName}',
         '${avatarOwnerId}','${avatarOwnerId}',
         '{"size":9,"mimetype":"image/webp"}'::jsonb
       );`,
      "select 'avatar-storage-lock-held';",
      "select pg_sleep(3); commit;"
    ]);
    await marker(avatarWriter, "avatar-storage-lock-held");

    const avatarAccountDeletion = psql(`
      set application_name='aralearn-avatar-account-delete-lock-probe';
      begin;
      set local role authenticated;
      ${authenticatedContext(avatarOwnerId, avatarSessionId)}
      select public.delete_my_account_v1('EXCLUIR MINHA CONTA');
      commit;
    `);
    await waitForDatabaseCondition(`
      select (count(*)=1)::integer
      from pg_stat_activity
      where application_name='aralearn-avatar-account-delete-lock-probe'
        and state='active' and wait_event_type='Lock';
    `);
    await Promise.all([
      result(avatarWriter),
      assert.rejects(
        result(avatarAccountDeletion),
        /Remova os objetos privados de avatar/iu
      )
    ]);
    assert.equal(await result(psql(`
      select (exists(select 1 from auth.users where id='${avatarOwnerId}'))::text
        ||'|'||(exists(
          select 1 from storage.objects
          where bucket_id='person-avatars' and name='${avatarObjectName}'
        ))::text;
    `)), "true|true");
    await result(psql(`
      begin;
      set local session_replication_role='replica';
      delete from storage.objects
      where bucket_id='person-avatars' and name='${avatarObjectName}';
      commit;
    `));

    const pdfAccountDeletion = psql([
      `set application_name='aralearn-pdf-account-delete-lock-holder';
       begin;
       set local role authenticated;
       ${authenticatedContext(pdfOwnerId, pdfSessionId)}
       select public.delete_my_account_v1('EXCLUIR MINHA CONTA');`,
      "select 'pdf-account-delete-lock-held';",
      "select pg_sleep(3); commit;"
    ]);
    await marker(pdfAccountDeletion, "pdf-account-delete-lock-held");

    const pdfWriter = psql(`
      set application_name='aralearn-pdf-write-lock-probe';
      begin;
      set local role authenticated;
      ${authenticatedContext(pdfOwnerId, pdfSessionId)}
      insert into storage.objects(
        id,bucket_id,name,owner,owner_id,metadata
      ) values(
        '${pdfObjectId}','course-source-pdfs','${pdfObjectName}',
        '${pdfOwnerId}','${pdfOwnerId}',
        '{"size":512,"mimetype":"application/pdf"}'::jsonb
      );
      commit;
    `);
    await waitForDatabaseCondition(`
      select (count(*)=1)::integer
      from pg_stat_activity
      where application_name='aralearn-pdf-write-lock-probe'
        and state='active' and wait_event_type='Lock';
    `);
    await Promise.all([
      result(pdfAccountDeletion),
      assert.rejects(
        result(pdfWriter),
        /row-level security|nova linha viola|new row violates/iu
      )
    ]);
    assert.equal(await result(psql(`
      select (exists(select 1 from auth.users where id='${pdfOwnerId}'))::text
        ||'|'||(exists(
          select 1 from storage.objects
          where bucket_id='course-source-pdfs' and name='${pdfObjectName}'
        ))::text;
    `)), "false|false");
  } finally {
    await result(psql(`
      begin;
      set local session_replication_role='replica';
      delete from storage.objects
      where bucket_id='person-avatars' and name='${avatarObjectName}';
      delete from storage.objects
      where bucket_id='course-source-pdfs' and name='${pdfObjectName}';
      commit;
    `));
    await cleanupUser(avatarOwnerId, avatarEmail);
    await cleanupUser(pdfOwnerId, pdfEmail);
  }
});

test("PostgreSQL serializa intents simultâneos contra a mesma cota física de PDF", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000001540";
  const courseId = "10000000-0000-4000-8000-000000001540";
  const email = "pdf-quota-lock-150@aralearn.invalid";
  const hashes = Object.fromEntries(
    ["a", "b", "c", "d", "e"].map((digit) => [digit, digit.repeat(64)])
  );
  const objectIds = [
    "00000000-0000-4000-8000-000000001541",
    "00000000-0000-4000-8000-000000001542",
    "00000000-0000-4000-8000-000000001543"
  ];
  const twentyMiB = 20 * 1024 * 1024;
  const fourMiB = 4 * 1024 * 1024;

  await createUser(ownerId, email);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values(
        '${courseId}','${ownerId}',
        'Curso da cota concorrente de PDF','Reservar bytes físicos e intents vivos'
      );
      insert into private.course_source_revisions(
        course_id,source_id,revision,status,kind,title,origin,availability,
        verification_status,study_visibility,actor_id
      ) values
        ('${courseId}','source-quota-first',1,'active','document','Fonte A',
          'author_provided','private','author_verified','hidden','${ownerId}'),
        ('${courseId}','source-quota-second',1,'active','document','Fonte B',
          'author_provided','private','author_verified','hidden','${ownerId}');
      insert into storage.objects(id,bucket_id,name,owner,owner_id,metadata) values
        ('${objectIds[0]}','course-source-pdfs','${courseId}/${hashes.a}.pdf',
          '${ownerId}','${ownerId}',
          '{"size":${twentyMiB},"mimetype":"application/pdf"}'::jsonb),
        ('${objectIds[1]}','course-source-pdfs','${courseId}/${hashes.b}.pdf',
          '${ownerId}','${ownerId}',
          '{"size":${twentyMiB},"mimetype":"application/pdf"}'::jsonb),
        ('${objectIds[2]}','course-source-pdfs','${courseId}/${hashes.c}.pdf',
          '${ownerId}','${ownerId}',
          '{"size":${twentyMiB},"mimetype":"application/pdf"}'::jsonb);
    `));

    const firstReservation = psql([
      `set application_name='aralearn-pdf-quota-first-reservation';
       begin;
       select set_config('request.jwt.claim.role','service_role',true);
       select public.get_course_source_attachment_access_for_actor_v1(
         '${ownerId}','${courseId}',1,'prepare_upload','source-quota-first',1,
         '${hashes.d}',${fourMiB},'application/pdf'
       );`,
      "select 'pdf-quota-first-reserved';",
      "select pg_sleep(3); commit;"
    ]);
    await marker(firstReservation, "pdf-quota-first-reserved");

    const secondReservation = psql(`
      set application_name='aralearn-pdf-quota-second-reservation';
      begin;
      select set_config('request.jwt.claim.role','service_role',true);
      select public.get_course_source_attachment_access_for_actor_v1(
        '${ownerId}','${courseId}',1,'prepare_upload','source-quota-second',1,
        '${hashes.e}',1,'application/pdf'
      );
      commit;
    `);
    await waitForDatabaseCondition(`
      select (count(*)=1)::integer
      from pg_stat_activity
      where application_name='aralearn-pdf-quota-second-reservation'
        and state='active' and wait_event_type='Lock';
    `);
    await Promise.all([
      result(firstReservation),
      assert.rejects(result(secondReservation), /cota de 64 MiB/iu)
    ]);
    assert.equal(await result(psql(`
      select private.course_source_pdf_reserved_bytes_v1('${courseId}')::text
        ||'|'||(select count(*)::text
          from private.course_source_pdf_upload_intents intent
          where intent.course_id='${courseId}'
            and intent.content_hash in('${hashes.d}','${hashes.e}'));
    `)), "67108864|1");
  } finally {
    await result(psql(`
      begin;
      set local session_replication_role='replica';
      delete from storage.objects
      where bucket_id='course-source-pdfs'
        and name like '${courseId}/%';
      commit;
    `));
    await cleanupUser(ownerId, email);
  }
});

test("PostgreSQL não recria acesso quando concessão ou revogação perde para a exclusão", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000001520";
  const grantTargetId = "00000000-0000-4000-8000-000000001521";
  const grantSessionId = "00000000-0000-4000-8000-000000001522";
  const revokeTargetId = "00000000-0000-4000-8000-000000001523";
  const revokeSessionId = "00000000-0000-4000-8000-000000001524";
  const courseId = "10000000-0000-4000-8000-000000001520";
  const ownerEmail = "access-lock-owner-150@aralearn.invalid";
  const grantEmail = "access-lock-grant-150@aralearn.invalid";
  const revokeEmail = "access-lock-revoke-150@aralearn.invalid";
  const grantRequestId = "privacy:access-lock:grant:150";
  const revokeRequestId = "privacy:access-lock:revoke:150";
  const authenticatedContext = (userId, sessionId) => `
    select set_config('request.jwt.claim.sub','${userId}',true);
    select set_config('request.jwt.claim.role','authenticated',true);
    select set_config(
      'request.jwt.claims',
      '{"sub":"${userId}","role":"authenticated","session_id":"${sessionId}"}',
      true
    );
  `;

  await createUser(ownerId, ownerEmail);
  await createUser(grantTargetId, grantEmail);
  await createUser(revokeTargetId, revokeEmail);
  try {
    await result(psql(`
      insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
      values
        ('${grantSessionId}','${grantTargetId}',now(),now(),now()+interval '1 hour'),
        ('${revokeSessionId}','${revokeTargetId}',now(),now(),now()+interval '1 hour');
      insert into public.courses(id,owner_id,title,goal)
      values(
        '${courseId}','${ownerId}',
        'Curso do lock de acesso','Serializar acesso e exclusão de conta'
      );
      insert into public.course_access(course_id,user_id,granted_by)
      values('${courseId}','${revokeTargetId}','${ownerId}');
    `));

    const grantTargetDeletion = psql([
      `set application_name='aralearn-grant-target-delete-lock-holder';
       begin;
       set local role authenticated;
       ${authenticatedContext(grantTargetId, grantSessionId)}
       select public.delete_my_account_v1('EXCLUIR MINHA CONTA');`,
      "select 'grant-target-delete-lock-held';",
      "select pg_sleep(3); commit;"
    ]);
    await marker(grantTargetDeletion, "grant-target-delete-lock-held");
    const concurrentGrant = psql(`
      set application_name='aralearn-concurrent-grant-lock-probe';
      begin;
      set local role service_role;
      select set_config('request.jwt.claim.role','service_role',true);
      select public.manage_course_access_for_actor_v1(
        '${ownerId}','${courseId}','grant_access','${grantEmail}',null,true,
        '${grantRequestId}'
      );
      commit;
    `);
    await waitForDatabaseCondition(`
      select (count(*)=1)::integer
      from pg_stat_activity
      where application_name='aralearn-concurrent-grant-lock-probe'
        and state='active' and wait_event_type='Lock';
    `);
    const [, grantOutput] = await Promise.all([
      result(grantTargetDeletion),
      result(concurrentGrant)
    ]);
    const grantResult = JSON.parse(grantOutput.split(/\r?\n/u).at(-1));
    assert.deepEqual(grantResult, {
      contract: "aralearn.course-access-grant-request.v1",
      courseId,
      operation: "grant_access",
      accepted: true,
      idempotent: false
    });
    assert.equal(await result(psql(`
      select
        (exists(select 1 from auth.users where id='${grantTargetId}'))::text
        ||'|'||(exists(
          select 1 from public.course_access
          where course_id='${courseId}' and user_id='${grantTargetId}'
        ))::text
        ||'|'||(exists(
          select 1 from private.course_events
          where course_id='${courseId}'
            and summary::text like '%${grantTargetId}%'
        ))::text
        ||'|'||(exists(
          select 1 from private.course_change_receipts
          where actor_id='${ownerId}' and request_id='${grantRequestId}'
            and result::text like '%${grantTargetId}%'
        ))::text;
    `)), "false|false|false|false");

    const revokeTargetDeletion = psql([
      `set application_name='aralearn-revoke-target-delete-lock-holder';
       begin;
       set local role authenticated;
       ${authenticatedContext(revokeTargetId, revokeSessionId)}
       select public.delete_my_account_v1('EXCLUIR MINHA CONTA');`,
      "select 'revoke-target-delete-lock-held';",
      "select pg_sleep(3); commit;"
    ]);
    await marker(revokeTargetDeletion, "revoke-target-delete-lock-held");
    const concurrentRevoke = psql(`
      set application_name='aralearn-concurrent-revoke-lock-probe';
      begin;
      set local role service_role;
      select set_config('request.jwt.claim.role','service_role',true);
      select public.manage_course_access_for_actor_v1(
        '${ownerId}','${courseId}','revoke_access',null,'${revokeTargetId}',true,
        '${revokeRequestId}'
      );
      commit;
    `);
    await waitForDatabaseCondition(`
      select (count(*)=1)::integer
      from pg_stat_activity
      where application_name='aralearn-concurrent-revoke-lock-probe'
        and state='active' and wait_event_type='Lock';
    `);
    await Promise.all([
      result(revokeTargetDeletion),
      assert.rejects(result(concurrentRevoke), /Perfil inexistente/iu)
    ]);
    assert.equal(await result(psql(`
      select
        (exists(select 1 from auth.users where id='${revokeTargetId}'))::text
        ||'|'||(exists(
          select 1 from public.course_access
          where course_id='${courseId}' and user_id='${revokeTargetId}'
        ))::text
        ||'|'||(exists(
          select 1 from private.course_events
          where course_id='${courseId}'
            and summary::text like '%${revokeTargetId}%'
        ))::text
        ||'|'||(exists(
          select 1 from private.course_change_receipts
          where actor_id='${ownerId}' and request_id='${revokeRequestId}'
        ))::text;
    `)), "false|false|false|false");
  } finally {
    await cleanupUser(grantTargetId, grantEmail);
    await cleanupUser(revokeTargetId, revokeEmail);
    await cleanupUser(ownerId, ownerEmail);
  }
});

test("PostgreSQL serializa a criação idempotente do mesmo Curso", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000091";
  const requestId = "concurrency:course:v1:0001";
  await result(psql(`
    insert into auth.users(
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '${ownerId}',
      'authenticated',
      'authenticated',
      'course-concurrency-v1@aralearn.invalid',
      '',
      now(),
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ) on conflict (id) do nothing;
  `));

  try {
    const first = psql([
      `begin;
       select set_config('request.jwt.claim.role','service_role',true);
       select pg_advisory_xact_lock(hashtextextended(
         'course-change-request:${ownerId}:${requestId}', 0
       ));`,
      "select 'first-locked';",
      `select pg_sleep(1.2);
       select public.create_course_for_actor_v1(
         '${ownerId}',
         'Curso concorrente',
         'Provar serialização idempotente',
         '${requestId}'
       );
       commit;`
    ]);
    await marker(first, "first-locked");

    const startedAt = Date.now();
    const second = psql(`
      begin;
      select set_config('request.jwt.claim.role','service_role',true);
      select public.create_course_for_actor_v1(
        '${ownerId}',
        'Curso concorrente',
        'Provar serialização idempotente',
        '${requestId}'
      );
      commit;
    `);
    const [firstResult, secondResult] = await Promise.all([result(first), result(second)]);
    assert.ok(
      Date.now() - startedAt >= 800,
      "a segunda transação deveria aguardar o lock do mesmo requestId"
    );
    const firstCourseId = firstResult.match(/[0-9a-f]{8}-[0-9a-f-]{27}/iu)?.[0];
    const secondCourseId = secondResult.match(/[0-9a-f]{8}-[0-9a-f-]{27}/iu)?.[0];
    assert.ok(firstCourseId, "a primeira criação deve devolver o UUID do Curso");
    assert.equal(secondCourseId, firstCourseId);

    const verification = await result(psql(`
      select count(*) || '|' || count(distinct receipt.course_id)
      from private.course_change_receipts receipt
      join public.courses course on course.id=receipt.course_id
      where receipt.actor_id='${ownerId}'
        and receipt.request_id='${requestId}'
        and receipt.operation='create_course'
        and course.title='Curso concorrente';
    `));
    assert.equal(verification, "1|1");
  } finally {
    await result(psql(`
      delete from auth.users
      where id='${ownerId}'
        and email='course-concurrency-v1@aralearn.invalid';
    `));
  }
});

test("PostgreSQL confirma hierarquia fora de ordem somente ao fechar a transação", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000092";
  const courseId = "10000000-0000-4000-8000-000000000092";
  const email = "course-deferred-v1@aralearn.invalid";
  await createUser(ownerId, email);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values('${courseId}','${ownerId}','Curso diferido','Validar integridade transacional');
      begin;
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ('${courseId}','study_unit','u','microsequence','s',1,'{"title":"U"}'::jsonb),
        ('${courseId}','microsequence','s','lesson','l',0,'{"title":"S"}'::jsonb),
        ('${courseId}','lesson','l','module','m',0,'{"title":"L"}'::jsonb),
        ('${courseId}','module','m',null,null,0,'{"title":"M"}'::jsonb);
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values(
        '${courseId}','study_unit','u2','microsequence','s',2,'{"title":"U2"}'::jsonb
      );
      commit;
    `));
    assert.equal(await result(psql(`
      select count(*) from private.course_entities where course_id='${courseId}';
    `)), "5");
    await result(psql(`
      begin;
      set constraints private.course_entities_sibling_position_v1 deferred;
      update private.course_entities set position=2
      where course_id='${courseId}' and entity_type='study_unit' and entity_id='u';
      update private.course_entities set position=1
      where course_id='${courseId}' and entity_type='study_unit' and entity_id='u2';
      commit;
    `));
    assert.equal(await result(psql(`
      select string_agg(entity_id || ':' || position, ',' order by position)
      from private.course_entities
      where course_id='${courseId}' and entity_type='study_unit';
    `)), "u2:1,u:2");
    await assert.rejects(() => result(psql(`
      begin;
      set constraints private.course_entities_sibling_position_v1 deferred;
      update private.course_entities set position=2
      where course_id='${courseId}' and entity_type='study_unit' and entity_id='u2';
      commit;
    `)), /course_entities_sibling_position_v1|duplicate key/iu);
    assert.equal(await result(psql(`
      select string_agg(entity_id || ':' || position, ',' order by position)
      from private.course_entities
      where course_id='${courseId}' and entity_type='study_unit';
    `)), "u2:1,u:2");
    await assert.rejects(() => result(psql(`
      begin;
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values(
        '${courseId}','lesson','orphan','module','missing',1,
        '{"title":"Lição órfã"}'::jsonb
      );
      commit;
    `)), /course_entities_parent_fk_v1|foreign key/iu);
    assert.equal(await result(psql(`
      select count(*) from private.course_entities
      where course_id='${courseId}' and entity_id='orphan';
    `)), "0");
  } finally {
    await cleanupUser(ownerId, email);
  }
});

test("PostgreSQL aceita apenas uma composição concorrente na mesma versão", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000093";
  const courseId = "10000000-0000-4000-8000-000000000093";
  const email = "course-cas-v1@aralearn.invalid";
  await createUser(ownerId, email);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values('${courseId}','${ownerId}','Curso CAS','Validar concorrência');
    `));
    const mutation = (suffix) => result(psql(`
      begin;
      select set_config('request.jwt.claim.role','service_role',true);
      select public.commit_course_composition_for_actor_v1(
        '${ownerId}','${courseId}',1,
        jsonb_build_array(
          jsonb_build_object('entityType','module','entityId','m-${suffix}',
            'parentType',null,'parentId',null,'position',0,
            'content',jsonb_build_object('title','Módulo ${suffix}')),
          jsonb_build_object('entityType','lesson','entityId','l-${suffix}',
            'parentType','module','parentId','m-${suffix}','position',0,
            'content',jsonb_build_object('title','Lição ${suffix}')),
          jsonb_build_object('entityType','microsequence','entityId','s-${suffix}',
            'parentType','lesson','parentId','l-${suffix}','position',0,
            'content',jsonb_build_object(
              'title','Microssequência ${suffix}','dependsOn',jsonb_build_array()
            )),
          jsonb_build_object('entityType','study_unit','entityId','u-${suffix}',
            'parentType','microsequence','parentId','s-${suffix}','position',1,
            'content',jsonb_build_object('title','Unidade ${suffix}'))
        ), '[]'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'studyUnitId','u-${suffix}','sourceLinks',jsonb_build_array()
        )),
        'concurrency:composition:${suffix}'
      );
      commit;
    `));
    const attempts = await Promise.allSettled([mutation("a"), mutation("b")]);
    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(attempts.filter(({ status }) => status === "rejected").length, 1);
    assert.match(attempts.find(({ status }) => status === "rejected").reason.message, /mudou/iu);
    assert.equal(await result(psql(`
      select revision || '|' || (
        select count(*) from private.course_entities entity
        where entity.course_id=course.id
      ) from public.courses course where id='${courseId}';
    `)), "2|4");
  } finally {
    await cleanupUser(ownerId, email);
  }
});

test("PostgreSQL aceita apenas uma alteração concorrente do estado pessoal", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000094";
  const courseId = "10000000-0000-4000-8000-000000000094";
  const email = "personal-cas-v1@aralearn.invalid";
  await createUser(ownerId, email);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values('${courseId}','${ownerId}','Estado concorrente','Validar CAS pessoal');
    `));
    const mutation = (suffix, requestId) => result(psql(`
      begin;
      select set_config('request.jwt.claim.sub','${ownerId}',true);
      select set_config('request.jwt.claim.role','authenticated',true);
      select public.mutate_course_personal_state_v2(
        '${courseId}',0,
        jsonb_build_array(jsonb_build_object(
          'kind','set','collection','reviewMarks','path','unit-${suffix}',
          'value','2026-08-17T12:00:00Z'
        )), '${requestId}'
      );
      commit;
    `));
    const attempts = await Promise.allSettled([
      mutation("a", "20000000-0000-4000-8000-000000000094"),
      mutation("b", "30000000-0000-4000-8000-000000000094")
    ]);
    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(attempts.filter(({ status }) => status === "rejected").length, 1);
    assert.match(attempts.find(({ status }) => status === "rejected").reason.message, /mudou/iu);
    assert.equal(await result(psql(`
      select revision || '|' || (
        select count(*) from jsonb_object_keys(state_row.state->'reviewMarks')
      ) || '|' || (
        select count(*) from private.course_personal_state_receipts receipt
        where receipt.course_id=state_row.course_id and receipt.user_id=state_row.user_id
      ) from public.course_personal_states state_row
      where user_id='${ownerId}' and course_id='${courseId}';
    `)), "1|1|1");
  } finally {
    await cleanupUser(ownerId, email);
  }
});

test("PostgreSQL serializa duas primeiras edições sobre a mesma origem compartilhada", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000001490";
  const learnerId = "00000000-0000-4000-8000-000000001491";
  const ownerEmail = "course-copy-owner-149@aralearn.invalid";
  const learnerEmail = "course-copy-learner-149@aralearn.invalid";
  const sourceCourseId = "14900000-0000-4000-8000-000000000001";
  await createUser(ownerId, ownerEmail);
  await createUser(learnerId, learnerEmail);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal,revision)
      values(
        '${sourceCourseId}','${ownerId}','Curso concorrente #149',
        'Validar a primeira cópia pessoal.',1
      );
      insert into private.course_instructional_plans(
        course_id,audience,instructional_scope,
        preferred_authoring_part_min,preferred_authoring_part_max,
        part_count_origin,version
      ) values('${sourceCourseId}','','',7,12,'automatic',1);
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ('${sourceCourseId}','module','module-149',null,null,0,
          '{"title":"Módulo 149"}'::jsonb),
        ('${sourceCourseId}','lesson','lesson-149','module','module-149',0,
          '{"title":"Lição 149"}'::jsonb),
        ('${sourceCourseId}','microsequence','micro-149','lesson','lesson-149',0,
          '{"title":"Microssequência 149","dependsOn":[]}'::jsonb),
        ('${sourceCourseId}','study_unit','unit-149','microsequence','micro-149',1,
          '{"title":"Unidade original"}'::jsonb);
      insert into private.course_events(
        course_id,revision,operation,summary,actor_id
      ) values(
        '${sourceCourseId}',1,'create_course',
        '{"changeKind":"course_initialized","createdCount":4,"updatedCount":0,"deletedCount":0}'::jsonb,
        '${ownerId}'
      );
      insert into public.course_access(course_id,user_id,granted_by)
      values('${sourceCourseId}','${learnerId}','${ownerId}');
    `));
    const first = psql([
      "begin;",
      "select set_config('request.jwt.claim.role','service_role',false);",
      `select public.commit_personal_course_copy_edit_for_actor_v1(
        '${learnerId}','${sourceCourseId}',1,1,
        '{"entityType":"study_unit","entityId":"unit-149","parentType":"microsequence","parentId":"micro-149","position":1,"content":{"title":"Primeira edição"}}'::jsonb,
        'manual','personal-copy-concurrent-149-a'
      )->>'targetCourseId';`,
      "select 'personal-copy-lock-held';",
      "select pg_sleep(1);",
      "commit;"
    ]);
    const firstResult = result(first);
    await marker(first, "personal-copy-lock-held");
    const second = psql(`
      select set_config('request.jwt.claim.role','service_role',false);
      select public.commit_personal_course_copy_edit_for_actor_v1(
        '${learnerId}','${sourceCourseId}',1,1,
        '{"entityType":"study_unit","entityId":"unit-149","parentType":"microsequence","parentId":"micro-149","position":1,"content":{"title":"Segunda edição"}}'::jsonb,
        'provider_assistance','personal-copy-concurrent-149-b'
      );
    `);
    await assert.rejects(result(second), /Já existe uma cópia pessoal|P1490/iu);
    await firstResult;
    assert.equal(await result(psql(`
      select count(*) from private.course_personal_copies
      where actor_id='${learnerId}' and source_course_ref='${sourceCourseId}';
    `)), "1");
    assert.equal(await result(psql(`
      select concat(course.revision,'|',unit.version,'|',unit.content->>'title')
      from private.course_personal_copies copy_value
      join public.courses course on course.id=copy_value.target_course_id
      join private.course_entities unit
        on unit.course_id=course.id
       and unit.entity_type='study_unit'
       and unit.entity_id='unit-149'
      where copy_value.actor_id='${learnerId}'
        and copy_value.source_course_ref='${sourceCourseId}';
    `)), "2|2|Primeira edição");
    assert.equal(await result(psql(`
      select concat(revision,'|',content->>'title')
      from public.courses course
      join private.course_entities unit on unit.course_id=course.id
      where course.id='${sourceCourseId}'
        and unit.entity_type='study_unit' and unit.entity_id='unit-149';
    `)), "1|Unidade original");
  } finally {
    await cleanupUser(learnerId, learnerEmail);
    await cleanupUser(ownerId, ownerEmail);
  }
});

test("PostgreSQL mantém consultas de Curso dentro do orçamento local", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000095";
  const courseId = "10000000-0000-4000-8000-000000000095";
  const email = "course-budget-v1@aralearn.invalid";
  await createUser(ownerId, email);
  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values('${courseId}','${ownerId}','Curso de medição','Medir consultas canônicas');
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) select '${courseId}','module','m-'||m,null,null,m,
        jsonb_build_object('title','Módulo '||m) from generate_series(0,19) m;
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) select '${courseId}','lesson','l-'||m||'-'||l,'module','m-'||m,l,
        jsonb_build_object('title','Lição '||m||'-'||l)
        from generate_series(0,19) m cross join generate_series(0,4) l;
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) select '${courseId}','microsequence','s-'||m||'-'||l||'-'||s,
        'lesson','l-'||m||'-'||l,s,
        jsonb_build_object('title','Microssequência '||m||'-'||l||'-'||s)
        from generate_series(0,19) m cross join generate_series(0,4) l
        cross join generate_series(0,4) s;
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) select '${courseId}','study_unit','u-'||m||'-'||l||'-'||s||'-'||u,
        'microsequence','s-'||m||'-'||l||'-'||s,u,
        jsonb_build_object('title','Unidade '||m||'-'||l||'-'||s||'-'||u)
        from generate_series(0,19) m cross join generate_series(0,4) l
        cross join generate_series(0,4) s cross join generate_series(1,2) u;
    `));
    const listPlan = JSON.parse(await result(psql(`
      set request.jwt.claim.role='service_role';
      explain(analyze,buffers,format json)
      select public.list_courses_for_actor_v1('${ownerId}',null,50,null,null);
    `)))[0].Plan;
    const entitiesPlan = JSON.parse(await result(psql(`
      set request.jwt.claim.role='service_role';
      explain(analyze,buffers,format json)
      select public.list_course_entities_for_actor_v1(
        '${ownerId}','${courseId}',1,500,null,null
      );
    `)))[0].Plan;
    assert.ok(listPlan["Actual Total Time"] < 2_000);
    assert.ok(entitiesPlan["Actual Total Time"] < 2_000);
    const payloads = await result(psql(`
      set request.jwt.claim.role='service_role';
      select octet_length(public.list_courses_for_actor_v1(
        '${ownerId}',null,50,null,null
      )::text) || '|' || octet_length(public.list_course_entities_for_actor_v1(
        '${ownerId}','${courseId}',1,500,null,null
      )::text);
    `));
    assert.equal(payloads.split("|").every((value) => Number(value) < 2_000_000), true);
    assert.equal(await result(psql(`
      select count(*) from pg_indexes where schemaname in ('public','private')
      and indexname in (
        'courses_owner_updated_v1_idx','course_entities_parent_v1_idx',
        'course_personal_states_user_updated_v1_idx'
      );
    `)), "3");
  } finally {
    await cleanupUser(ownerId, email);
  }
});

test("PostgreSQL inspeciona Unidades com cursores, bytes e índice curricular", {
  skip: postgresGate
}, async () => {
  const ownerId = "00000000-0000-4000-8000-000000000096";
  const sharedId = "00000000-0000-4000-8000-000000000196";
  const outsiderId = "00000000-0000-4000-8000-000000000296";
  const courseId = "10000000-0000-4000-8000-000000000096";
  const planId = "20000000-0000-4000-8000-000000000096";
  const partId = "30000000-0000-4000-8000-000000000096";
  const ownerEmail = "course-inspection-owner-v1@aralearn.invalid";
  const sharedEmail = "course-inspection-shared-v1@aralearn.invalid";
  const outsiderEmail = "course-inspection-outsider-v1@aralearn.invalid";
  await createUser(ownerId, ownerEmail);
  await createUser(sharedId, sharedEmail);
  await createUser(outsiderId, outsiderEmail);
  const pageQuery = ({
    actorId = ownerId,
    anchor = null,
    cursor = null,
    direction = "forward",
    limit = 24,
    maxBytes = 1_500_000
  } = {}) => `
    select public.list_owned_course_study_units_for_actor_v1(
      '${actorId}','${courseId}',1,'course',null,
      ${anchor === null ? "null" : `'${anchor}'`},
      ${cursor === null ? "null" : `'${cursor}'`},
      '${direction}',${limit},${maxBytes}
    );
  `;
  const servicePage = async (options) => JSON.parse(await result(psql(`
    begin;
    set local role service_role;
    ${pageQuery(options)}
    commit;
  `)));

  try {
    await result(psql(`
      insert into public.courses(id,owner_id,title,goal)
      values(
        '${courseId}','${ownerId}',
        'Curso de inspeção','Inspecionar Unidades em ordem curricular'
      );
      insert into private.course_instructional_plans(id,course_id)
      values('${planId}','${courseId}');
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ('${courseId}','module','module-0',null,null,0,
          '{"title":"Módulo 0"}'::jsonb),
        ('${courseId}','lesson','lesson-0','module','module-0',0,
          '{"title":"Lição 0"}'::jsonb),
        ('${courseId}','microsequence','micro-0','lesson','lesson-0',0,
          '{"title":"Microssequência 0"}'::jsonb);
      insert into private.course_entities(
        course_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) select '${courseId}','study_unit',
        'unit-'||lpad(unit_value::text,3,'0'),
        'microsequence','micro-0',unit_value,
        case when unit_value=1 then jsonb_build_object(
          'title','Unidade 001','body',repeat('x',70000)
        ) else jsonb_build_object(
          'title','Unidade '||lpad(unit_value::text,3,'0')
        ) end
      from generate_series(1,60) unit_value;
      insert into private.course_authoring_parts(
        id,course_id,instructional_plan_id,position,title,intent
      ) values(
        '${partId}','${courseId}','${planId}',0,
        'Parte única','Produzir todas as Unidades'
      );
      insert into private.course_authoring_part_didactic_microsequences(
        course_id,authoring_part_id,didactic_microsequence_id,
        production_position
      ) values('${courseId}','${partId}','micro-0',0);
      insert into public.course_access(course_id,user_id,granted_by)
      values('${courseId}','${sharedId}','${ownerId}');
      analyze private.course_entities;
    `));

    assert.equal(await result(psql(`
      select has_function_privilege(
        'service_role',
        'public.list_owned_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)',
        'EXECUTE'
      ) || '|' || has_function_privilege(
        'authenticated',
        'public.list_owned_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)',
        'EXECUTE'
      );
    `)), "true|false");

    const first = await servicePage();
    assert.deepEqual(Object.keys(first).sort(), [
      "contract", "courseId", "courseRevision", "scope", "totalCount",
      "scopeOptions", "items", "hasPrevious", "hasMore",
      "previousCursor", "nextCursor", "pageBytes"
    ].sort());
    assert.equal(first.contract, "aralearn.course-study-unit-inspection-page.v1");
    assert.equal(first.totalCount, 60);
    assert.equal(first.items.length, 24);
    assert.equal(first.items[0].studyUnit.id, "unit-001");
    assert.equal(first.items.at(-1).studyUnit.id, "unit-024");
    assert.deepEqual(first.items[0].curriculumPath, {
      module: { id: "module-0", position: 0, title: "Módulo 0" },
      lesson: { id: "lesson-0", position: 0, title: "Lição 0" },
      didacticMicrosequence: {
        id: "micro-0", position: 0, title: "Microssequência 0"
      }
    });
    assert.deepEqual(first.items[0].authoringPart, {
      id: partId,
      position: 0,
      title: "Parte única",
      state: "partially_materialized"
    });
    assert.deepEqual(first.scopeOptions, {
      authoringParts: [{
        id: partId,
        position: 0,
        title: "Parte única",
        state: "partially_materialized"
      }],
      unassignedStudyUnitCount: 0
    });
    assert.deepEqual(first.nextCursor, { studyUnitId: "unit-024" });
    assert.equal(first.pageBytes < 1_500_000, true);

    const second = await servicePage({ cursor: "unit-024" });
    assert.equal(second.items[0].studyUnit.id, "unit-025");
    assert.equal(second.items.at(-1).studyUnit.id, "unit-048");
    const backward = await servicePage({
      cursor: "unit-025", direction: "backward", limit: 12
    });
    assert.deepEqual(backward.items.map(({ studyUnit }) => studyUnit.id),
      Array.from({ length: 12 }, (_, index) =>
        `unit-${String(index + 13).padStart(3, "0")}`));
    const byteBounded = await servicePage({ maxBytes: 65_536 });
    assert.equal(byteBounded.items.length, 1);
    assert.equal(byteBounded.pageBytes > 65_536, true);
    assert.equal(byteBounded.hasMore, true);

    await assert.rejects(() => servicePage({ actorId: sharedId }),
      /não autorizada|não autorizado/iu);
    await assert.rejects(() => servicePage({ actorId: outsiderId }),
      /inexistente|inacessível/iu);
    await assert.rejects(() => result(psql(`
      begin;
      set local role authenticated;
      ${pageQuery()}
      commit;
    `)), /permission denied|permissão negada/iu);

    const rpcPlan = JSON.parse(await result(psql(`
      set role service_role;
      explain(analyze,buffers,format json)
      ${pageQuery()}
      reset role;
    `)))[0].Plan;
    assert.ok(rpcPlan["Actual Total Time"] < 2_000);
    const entityPlan = await result(psql(`
      set enable_seqscan=off;
      explain(format json)
      select entity_id from private.course_entities
      where course_id='${courseId}'
        and parent_type='microsequence'
        and parent_id='micro-0'
        and entity_type='study_unit'
      order by position,entity_id limit 24;
    `));
    assert.match(entityPlan, /"Node Type": "Index(?: Only)? Scan"/u);
    assert.match(entityPlan,
      /course_entities_(?:parent_v1_idx|sibling_position_v1)/u);
    assert.equal(await result(psql(`
      select count(*) from pg_indexes where schemaname='private'
        and indexname in (
          'course_entities_parent_v1_idx',
          'course_authoring_part_microsequences_course_unique_v1',
          'course_authoring_part_microsequences_order_v1'
        );
    `)), "3");
  } finally {
    await cleanupUser(sharedId, sharedEmail);
    await cleanupUser(ownerId, ownerEmail);
    await cleanupUser(outsiderId, outsiderEmail);
  }
});

test("runner limita lock, instrução e processo sem confirmar escrita parcial", {
  skip: localCutoverGate
}, async () => {
  const probe = "private.course_cutover_timeout_probe_v1";
  const runnerOptions = {
    databaseUrl,
    password: runnerPassword,
    dockerContainer: localDockerPsqlAvailable ? "supabase_db_aralearn" : null
  };
  await result(psql(`
    drop table if exists ${probe};
    create table ${probe}(id text primary key);
  `));
  try {
    const holder = psql([
      "begin; lock table public.courses in access exclusive mode;",
      "select 'cutover-lock-held';",
      "select pg_sleep(2); rollback;"
    ]);
    await marker(holder, "cutover-lock-held");
    await assert.rejects(runPsql(`
      \\set ON_ERROR_STOP on
      begin;
      set local lock_timeout = '250ms';
      set local statement_timeout = '2s';
      insert into ${probe}(id) values('lock');
      lock table public.courses in access exclusive mode;
      commit;
    `, { ...runnerOptions, processTimeoutMs: 3_000 }),
    (error) => error.code === "database_command_failed");
    await result(holder);
    assert.equal(await result(psql(`select count(*) from ${probe};`)), "0");

    await assert.rejects(runPsql(`
      \\set ON_ERROR_STOP on
      begin;
      set local statement_timeout = '250ms';
      insert into ${probe}(id) values('statement');
      select pg_sleep(2);
      commit;
    `, { ...runnerOptions, processTimeoutMs: 3_000 }),
    (error) => error.code === "database_command_failed");
    assert.equal(await result(psql(`select count(*) from ${probe};`)), "0");

    await assert.rejects(runPsql(`
      \\set ON_ERROR_STOP on
      begin;
      insert into ${probe}(id) values('process');
      select pg_sleep(2);
      commit;
    `, {
      ...runnerOptions,
      processTimeoutMs: 250,
      killGraceMs: 250
    }), (error) => error.code === "database_process_timeout");
    assert.equal(await result(psql(`select count(*) from ${probe};`)), "0");
  } finally {
    await result(psql(`drop table if exists ${probe};`));
  }
});
