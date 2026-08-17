import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260817160000_course_authoring_plan.sql",
  import.meta.url
);

const OWNER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-000000000002";
const COURSE = "10000000-0000-4000-8000-000000000001";
const PLAN_ITEM = "20000000-0000-4000-8000-000000000001";
const MATERIALIZATION = "30000000-0000-4000-8000-000000000001";
const STEPS = [
  "40000000-0000-4000-8000-000000000001",
  "40000000-0000-4000-8000-000000000002",
  "40000000-0000-4000-8000-000000000003"
];

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function actor(database, actorId, role = "authenticated") {
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actorId]);
  await database.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
}

async function databaseFixture({
  decisions = [],
  mandate = null,
  microsequenceIds = ["micro-a"],
  authoringParts = null,
  brief = "Usar exemplos contrastivos."
} = {}) {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;
    create schema storage;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function private.request_role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'')
    $$;
    create function private.require_service_role() returns void
      language plpgsql stable security definer as $$
    begin
      if private.request_role() is distinct from 'service_role' then
        raise exception 'service role obrigatório' using errcode='42501';
      end if;
    end $$;
    create function extensions.digest(bytea,text) returns bytea
      language sql immutable as $$
      select decode(md5(convert_from($1,'UTF8')) || md5(convert_from($1,'UTF8')),'hex')
    $$;
    create function extensions.gen_random_uuid() returns uuid
      language sql volatile as $$ select pg_catalog.gen_random_uuid() $$;

    create table auth.users(id uuid primary key, email text unique);
    insert into auth.users values
      ('${OWNER}','owner@example.test'),
      ('${LEARNER}','learner@example.test');

    create table storage.objects(
      id uuid primary key default pg_catalog.gen_random_uuid(),
      bucket_id text not null,
      name text not null
    );

    create table public.courses(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null,
      goal text not null,
      brief text not null default '',
      revision bigint not null default 1,
      authoring_state jsonb not null default
        '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint courses_title_v1 check(
        nullif(btrim(title),'') is not null and char_length(title)<=300
      ),
      constraint courses_goal_v1 check(
        nullif(btrim(goal),'') is not null and char_length(goal)<=2000
      ),
      constraint courses_brief_v1 check(char_length(brief)<=16384),
      constraint courses_revision_v1 check(revision>0),
      constraint courses_authoring_state_v1 check(
        jsonb_typeof(authoring_state)='object'
      )
    );

    create table private.course_entities(
      course_id uuid not null references public.courses(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(course_id,entity_type,entity_id),
      constraint course_entities_type_v1 check(entity_type in(
        'module','lesson','topic','microsequence','card'
      )),
      constraint course_entities_parent_v1 check(
        (entity_type='module' and parent_type is null and parent_id is null)
        or (entity_type='lesson' and parent_type='module' and parent_id is not null)
        or (entity_type='topic' and parent_type='lesson' and parent_id is not null)
        or (entity_type='microsequence' and parent_type='lesson' and parent_id is not null)
        or (entity_type='card' and parent_type='microsequence' and parent_id is not null)
      ),
      constraint course_entities_position_v1 check(
        (entity_type='card' and position>0)
        or (entity_type<>'card' and position>=0)
      ),
      constraint course_entities_content_v1 check(
        jsonb_typeof(content)='object' and pg_column_size(content)<=1048576
      ),
      constraint course_entities_sibling_position_v1 unique nulls not distinct(
        course_id,parent_type,parent_id,entity_type,position
      ) deferrable initially deferred,
      constraint course_entities_parent_fk_v1 foreign key(
        course_id,parent_type,parent_id
      ) references private.course_entities(course_id,entity_type,entity_id)
        on delete cascade deferrable initially deferred
    );

    create table public.course_access(
      course_id uuid not null references public.courses(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      granted_by uuid not null references auth.users(id),
      primary key(course_id,user_id)
    );
    create table public.course_personal_states(
      user_id uuid not null references auth.users(id) on delete cascade,
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null default 1,
      state jsonb not null,
      updated_at timestamptz not null default now(),
      primary key(user_id,course_id)
    );
    create table private.course_events(
      id bigint generated by default as identity primary key,
      course_id uuid not null references public.courses(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      constraint course_events_operation_v2 check(operation in(
        'create_course','update_course_metadata','replace_course_composition',
        'grant_course_access','revoke_course_access'
      )),
      constraint course_events_summary_v2 check(
        jsonb_typeof(summary)='object' and pg_column_size(summary)<=32768
      )
    );
    create table private.course_change_receipts(
      actor_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      request_hash text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now()+interval '14 days',
      primary key(actor_id,request_id),
      constraint course_change_receipts_operation_v2 check(operation in(
        'create','update_metadata','commit_entities','grant_access','revoke_access'
      ))
    );

    create function private.course_ownership_v1(p_course_id uuid,p_actor_id uuid)
      returns text language sql stable security definer
      set search_path=pg_catalog,public as $$
      select case when course.owner_id=p_actor_id then 'owned' else 'shared' end
      from public.courses course
      left join public.course_access access_value
        on access_value.course_id=course.id and access_value.user_id=p_actor_id
      where course.id=p_course_id and p_actor_id is not null
        and (course.owner_id=p_actor_id or access_value.user_id is not null)
    $$;
    create function private.require_course_access_v1(
      p_course_id uuid,p_actor_id uuid,p_require_owner boolean default false
    ) returns text language plpgsql stable security definer
      set search_path=pg_catalog,private as $$
    declare ownership text;
    begin
      ownership:=private.course_ownership_v1(p_course_id,p_actor_id);
      if ownership is null then raise exception 'Curso inexistente' using errcode='PT404'; end if;
      if p_require_owner and ownership<>'owned' then
        raise exception 'Edição não autorizada' using errcode='42501';
      end if;
      return ownership;
    end $$;

    create function private.list_courses_for_actor_v1(
      uuid,text,integer,timestamptz,uuid
    ) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function private.get_course_for_actor_v1(uuid,uuid,boolean)
      returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function public.list_owned_courses_for_actor_v1(
      uuid,text,integer,timestamptz,uuid
    ) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function public.create_course_for_actor_v1(
      uuid,text,text,text,text
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.commit_course_changes_for_actor_v1(
      uuid,uuid,bigint,text,text,text,text,jsonb,jsonb,jsonb,text
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.get_aralearn_runtime_manifest() returns jsonb
      language sql stable security definer set search_path=pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260817150000',
        'contractVersion',1,
        'features',jsonb_build_array(
          'flat-runtime-manifest-v1','single-live-course-identity-v1',
          'course-cas-idempotency-v1','study-only-course-access-v1'
        )
      )
    $$;
  `);
  const legacyParts = authoringParts || [
    { id: "part-a", title: "Fundamentos", microsequenceIds }
  ];
  await database.query(`
    insert into public.courses(
      id,owner_id,title,goal,brief,revision,authoring_state
    ) values($1,$2,'Curso de relações','Analisar relações.',
      $3,4,$4::jsonb)
  `, [COURSE, OWNER, brief, JSON.stringify({
    version: 1,
    parts: legacyParts,
    decisions,
    mandate
  })]);
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ($1,'module','module-a',null,null,0,'{"title":"Módulo A"}'),
      ($1,'lesson','lesson-a','module','module-a',0,'{"title":"Lição A"}'),
      ($1,'microsequence','micro-a','lesson','lesson-a',0,'{"title":"Micro A"}'),
      ($1,'card','card-a','microsequence','micro-a',1,'{"title":"Unidade A"}')
  `, [COURSE]);
  return database;
}

async function applyMigration(database) {
  await database.exec(await fs.readFile(migrationUrl, "utf8"));
}

function planTarget(planId, partId) {
  return {
    id: planId,
    title: "Curso de relações",
    objective: "Analisar relações e aplicações.",
    audience: "Graduação.",
    scope: "Relações fundamentais.",
    authoringGuidance: "Usar exemplos contrastivos.",
    preferredPartCount: { minimum: 8, maximum: 10, origin: "author" },
    intendedLearningOutcomes: [{
      id: PLAN_ITEM,
      position: 0,
      statement: "Comparar relações em um caso novo."
    }],
    instructionalAnalysisUnits: [],
    evidenceRequirements: [],
    parts: [{
      id: partId,
      position: 0,
      title: "Fundamentos",
      intent: "Preparar definição e aplicação.",
      microsequenceIds: ["micro-a"]
    }]
  };
}

async function startMinimalMaterialization(database, requestId) {
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const result = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'application',$6
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: STEPS[0],
      position: 0,
      kind: "context_load",
      targetDidacticMicrosequenceId: null,
      productionPosition: null
    }]
  }, requestId]);
  return { partId, result };
}

test("converte orientação e Parte sem manter brief ou authoring_state", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  assert.equal(await scalar(database, `
    select not exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='courses'
        and column_name in('brief','authoring_state')
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select authoring_guidance as value
    from private.course_instructional_plans where course_id=$1
  `, [COURSE]), "Usar exemplos contrastivos.");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  assert.match(partId, /^[0-9a-f-]{36}$/u);
  assert.equal(await scalar(database, `
    select didactic_microsequence_id as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1
  `, [COURSE]), "micro-a");
  await database.close();
});

test("aborta mais de 64 Partes legadas e recusa posição fora do contrato", async () => {
  const overflowDatabase = await databaseFixture({
    authoringParts: Array.from({ length: 65 }, (_, index) => ({
      id: `part-${index}`,
      title: `Parte ${index + 1}`,
      microsequenceIds: []
    }))
  });
  await assert.rejects(
    applyMigration(overflowDatabase),
    /excede o limite de 64 Partes/u
  );
  await overflowDatabase.close();

  const database = await databaseFixture();
  await applyMigration(database);
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  await assert.rejects(
    database.query(`
      insert into private.course_authoring_parts(
        id,course_id,instructional_plan_id,position,title,intent
      ) values($1,$2,$3,64,'Fora do contrato','')
    `, ["90000000-0000-4000-8000-000000000009", COURSE, planId]),
    /course_authoring_parts_position_v1/u
  );
  await database.close();
});

test("aborta mais de 192 vínculos legados antes de criar projeção ilegível", async () => {
  const database = await databaseFixture({
    authoringParts: Array.from({ length: 4 }, (_, partIndex) => ({
      id: `part-${partIndex}`,
      title: `Parte ${partIndex + 1}`,
      microsequenceIds: Array.from(
        { length: partIndex === 0 ? 49 : 48 },
        (_, microIndex) => `micro-${partIndex}-${microIndex}`
      )
    }))
  });
  await assert.rejects(
    applyMigration(database),
    /excede 192 vínculos de microssequência/u
  );
  await database.close();
});

test("materialização rejeita o 193º vínculo e reverte etapa e revisão", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const firstPartId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const secondPartId = "90000000-0000-4000-8000-000000000002";
  const thirdPartId = "90000000-0000-4000-8000-000000000003";
  const targetPartId = "90000000-0000-4000-8000-000000000004";
  const materializationId = "91000000-0000-4000-8000-000000000001";
  const stepId = "92000000-0000-4000-8000-000000000001";
  await database.query(`
    insert into private.course_entities(
      course_id,entity_type,entity_id,parent_type,parent_id,position,content
    )
    select $1,'microsequence','micro-overflow-'||value,
      'lesson','lesson-a',value,
      jsonb_build_object('title','Micro '||value)
    from generate_series(1,192) as series(value)
  `, [COURSE]);
  await database.query(`
    insert into private.course_authoring_parts(
      id,course_id,instructional_plan_id,position,title,intent
    ) values
      ($1,$4,$5,1,'Parte 2',''),
      ($2,$4,$5,2,'Parte 3',''),
      ($3,$4,$5,3,'Parte alvo','')
  `, [secondPartId, thirdPartId, targetPartId, COURSE, planId]);
  await database.query(`
    insert into private.course_authoring_part_didactic_microsequences(
      course_id,authoring_part_id,didactic_microsequence_id,production_position
    )
    select $1::uuid,$2::uuid,'micro-overflow-'||value,value
    from generate_series(1,63) as series(value)
    union all
    select $1::uuid,$3::uuid,'micro-overflow-'||value,value-64
    from generate_series(64,127) as series(value)
    union all
    select $1::uuid,$4::uuid,'micro-overflow-'||value,value-128
    from generate_series(128,191) as series(value)
  `, [COURSE, firstPartId, secondPartId, thirdPartId]);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1
  `, [COURSE]), 192);
  const revision = await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,0,'start',$6,'mcp','request-overflow-start'
    ) as value
  `, [OWNER, COURSE, targetPartId, materializationId, revision, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: stepId,
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-overflow-192",
      productionPosition: 0
    }]
  }]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-overflow-step'
    ) as value
  `, [
    OWNER,
    COURSE,
    targetPartId,
    materializationId,
    started.courseRevision,
    started.materialization.version,
    {
      stepId,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: { upserts: [], deletes: [] }
    }
  ]), /excede 192 vínculos de microssequência/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1
  `, [COURSE]), 192);
  assert.equal(await scalar(database, `
    select status='pending' and version=1 as value
    from private.course_authoring_part_materialization_steps where id=$1
  `, [stepId]), true);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), started.courseRevision);
  await database.close();
});

test("rejeita controles e texto só de layout sem proibir layout interno", async () => {
  const invalidHeaderDatabase = await databaseFixture();
  await invalidHeaderDatabase.query(
    "update public.courses set title=$1 where id=$2",
    ["Curso\u0001inválido", COURSE]
  );
  await assert.rejects(
    applyMigration(invalidHeaderDatabase),
    /Cabeçalho anterior contém caractere de controle inválido/u
  );
  await invalidHeaderDatabase.close();

  const blankHeaderDatabase = await databaseFixture();
  await blankHeaderDatabase.query(
    "update public.courses set title=$1 where id=$2",
    ["\n\t", COURSE]
  );
  await assert.rejects(
    applyMigration(blankHeaderDatabase),
    /Cabeçalho|constraint|viola/iu
  );
  await blankHeaderDatabase.close();

  for (const title of [
    "M".repeat(301),
    "Micro\u0001inválida",
    "Micro\u0085inválida",
    "\n\t",
    `${" ".repeat(300)}M`
  ]) {
    const invalidEntityDatabase = await databaseFixture();
    await invalidEntityDatabase.query(`
      update private.course_entities
      set content=jsonb_build_object('title',$1::text)
      where course_id=$2::uuid and entity_type='microsequence'
    `, [title, COURSE]);
    await assert.rejects(
      applyMigration(invalidEntityDatabase),
      /Título didático anterior não satisfaz o contrato canônico/u
    );
    await invalidEntityDatabase.close();
  }

  for (const title of ["Parte\u007finválida", "\n\t"]) {
    const invalidPartDatabase = await databaseFixture({
      authoringParts: [{
        id: "part-a",
        title,
        microsequenceIds: ["micro-a"]
      }]
    });
    await assert.rejects(
      applyMigration(invalidPartDatabase),
      /Parte anterior não possui conversão inequívoca/u
    );
    await invalidPartDatabase.close();
  }

  const database = await databaseFixture({
    brief: "Linha inicial.\n\tLinha complementar."
  });
  await applyMigration(database);
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const invalidWrites = [
    [
      "update private.course_instructional_plans set audience=$1 where id=$2",
      ["Público\u0085inválido", planId]
    ],
    [
      "update private.course_instructional_plans set instructional_scope=$1 where id=$2",
      ["Escopo\u007finválido", planId]
    ],
    [
      "update private.course_instructional_plans set authoring_guidance=$1 where id=$2",
      ["Orientação\u0001inválida", planId]
    ],
    [
      "update private.course_authoring_parts set intent=$1 where id=$2",
      ["Intenção\u007finválida", partId]
    ],
    [
      "update private.course_authoring_parts set title=$1 where id=$2",
      ["Parte\u0001inválida", partId]
    ],
    [
      "update private.course_authoring_parts set title=$1 where id=$2",
      ["\n\t", partId]
    ],
    [
      "update public.courses set goal=$1 where id=$2",
      ["Objetivo\u007finválido", COURSE]
    ],
    [
      "update public.courses set goal=$1 where id=$2",
      ["\n\t", COURSE]
    ]
  ];
  for (const [sql, parameters] of invalidWrites) {
    await assert.rejects(
      () => database.query(sql, parameters),
      /constraint|viola/iu
    );
  }
  for (const content of [
    { title: "M".repeat(301) },
    { title: "Módulo\u0001inválido" },
    { title: "\n\t" },
    { title: "Módulo válido", id: "id-duplicado" },
    { title: "Módulo válido", lessons: [] }
  ]) {
    await assert.rejects(() => database.query(`
      update private.course_entities set content=$1::jsonb
      where course_id=$2::uuid and entity_type='module' and entity_id='module-a'
    `, [content, COURSE]), /course_entities_content_v1|constraint|viola/iu);
  }
  await database.query(`
    update private.course_entities set content=$1::jsonb
    where course_id=$2::uuid and entity_type='module' and entity_id='module-a'
  `, [{ title: "Módulo\n\tválido" }, COURSE]);
  await assert.rejects(() => database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,$4)
  `, [PLAN_ITEM, COURSE, planId, "Resultado\u0001inválido"]), /constraint|viola/iu);
  await assert.rejects(() => database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,$4)
  `, [PLAN_ITEM, COURSE, planId, "\n\t"]), /constraint|viola/iu);

  await database.query(`
    update private.course_instructional_plans
    set audience=$1, instructional_scope=$2, authoring_guidance=$3
    where id=$4
  `, [
    "Público\n\tprioritário",
    "Escopo\n\toperacional",
    "Orientação\n\tcomplementar",
    planId
  ]);
  await database.query(`
    update private.course_authoring_parts set intent=$1 where id=$2
  `, ["Intenção\n\tdetalhada", partId]);
  await database.query(`
    insert into private.course_instructional_plan_items(
      id,course_id,instructional_plan_id,item_kind,position,statement
    ) values($1,$2,$3,'intended_learning_outcome',0,$4)
  `, [PLAN_ITEM, COURSE, planId, "Resultado\n\tobservável"]);
  assert.equal(await scalar(database, `
    select audience=$1 and instructional_scope=$2
      and authoring_guidance=$3 as value
    from private.course_instructional_plans where id=$4
  `, [
    "Público\n\tprioritário",
    "Escopo\n\toperacional",
    "Orientação\n\tcomplementar",
    planId
  ]), true);
  assert.equal(await scalar(database, `
    select intent=$1 as value from private.course_authoring_parts where id=$2
  `, ["Intenção\n\tdetalhada", partId]), true);
  assert.equal(await scalar(database, `
    select statement=$1 as value
    from private.course_instructional_plan_items where id=$2
  `, ["Resultado\n\tobservável", PLAN_ITEM]), true);

  await actor(database, OWNER, "service_role");
  await assert.rejects(
    scalar(database, `
      select public.create_course_for_actor_v1(
        $1,$2,$3,'request-create-control-0001'
      ) as value
    `, [OWNER, "Curso\u0001inválido", "Objetivo válido."]),
    /Criação de Curso inválida/u
  );
  await assert.rejects(
    scalar(database, `
      select public.create_course_for_actor_v1(
        $1,$2,$3,'request-create-layout-only'
      ) as value
    `, [OWNER, "\n\t", "Objetivo válido."]),
    /Criação de Curso inválida/u
  );
  const created = await scalar(database, `
    select public.create_course_for_actor_v1(
      $1,$2,$3,'request-create-layout-0001'
    ) as value
  `, [OWNER, "Curso válido", "Objetivo em duas linhas.\n\tCom detalhe."]);
  assert.equal(created.title, "Curso válido");
  assert.equal(created.goal, "Objetivo em duas linhas.\n\tCom detalhe.");
  await database.close();
});

test("commit integral usa CAS, comando no receipt e não apaga composição", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const target = planTarget(planId, partId);
  const command = {
    type: "add_plan_item",
    kind: "intended_learning_outcome",
    id: PLAN_ITEM,
    position: 0,
    statement: target.intendedLearningOutcomes[0].statement
  };
  const result = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'mcp','request-plan-0001'
    ) as value
  `, [OWNER, COURSE, command, target]);
  assert.equal(result.courseRevision, 5);
  assert.equal(result.planVersion, 2);
  assert.equal(result.channel, "mcp");
  assert.equal(result.counts.intendedLearningOutcomeCount, 1);
  assert.equal(await scalar(database, `
    select summary->>'instructionalPlanItemId' as value
    from private.course_events
    where course_id=$1 and operation='update_course_instructional_plan'
    order by id desc limit 1
  `, [COURSE]), PLAN_ITEM);
  const planAfterCommit = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(
    planAfterCommit.recentActivity[0].instructionalPlanItemId,
    PLAN_ITEM
  );
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1
  `, [COURSE]), 4);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,5,$3,'[]'::jsonb,'request-composition-blank-title'
    ) as value
  `, [OWNER, COURSE, [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: { title: "\n\t" }
  }]]), /Entidade da composição inválida/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), 5);
  const composition = await scalar(database, `
    select public.commit_course_composition_for_actor_v1(
      $1,$2,5,$3,'[]'::jsonb,'request-composition-0001'
    ) as value
  `, [OWNER, COURSE, [{
    entityType: "card",
    entityId: "card-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    content: { title: "Unidade A revista" }
  }]]);
  assert.equal(composition.revision, 6);
  const replay = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,'{}'::jsonb,'mcp','request-plan-0001'
    ) as value
  `, [OWNER, COURSE, command]);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 5);
  const eventCount = await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [COURSE]);
  const noOp = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,6,2,$3,$4,'application','request-plan-noop'
    ) as value
  `, [OWNER, COURSE, { type: "reorder_parts", orderedIds: [partId] }, target]);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.courseRevision, 6);
  assert.equal(noOp.planVersion, 2);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_events where course_id=$1
  `, [COURSE]), eventCount);
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'mcp','request-plan-stale'
    ) as value
  `, [OWNER, COURSE, command, target]), /mudou/iu);
  await database.close();
});

test("materialização retoma por etapas e salva lote e vínculo atomicamente", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'mcp','request-start-0001'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: { focus: "aplicação" },
    steps: [
      { id: STEPS[0], position: 0, kind: "context_load", targetDidacticMicrosequenceId: null, productionPosition: null },
      { id: STEPS[1], position: 1, kind: "didactic_microsequence_materialization", targetDidacticMicrosequenceId: "micro-b", productionPosition: 1 },
      { id: STEPS[2], position: 2, kind: "validation", targetDidacticMicrosequenceId: null, productionPosition: null }
    ]
  }]);
  assert.equal(started.materialization.nextPendingStep.id, STEPS[0]);
  await actor(database, OWNER, "authenticated");
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]), /service role/iu);
  await actor(database, OWNER, "service_role");
  await database.query(`
    insert into public.course_access(course_id,user_id,granted_by)
    values($1,$2,$3)
  `, [COURSE, LEARNER, OWNER]);
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [LEARNER, COURSE, partId, MATERIALIZATION]), /não autorizada/iu);
  let revision = started.courseRevision;
  let version = started.materialization.version;
  await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-context'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[0], expectedStepVersion: 1, status: "completed",
    resultFacts: { loaded: true }, entityChanges: { upserts: [], deletes: [] }
  }]);
  const resumed = await scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]);
  assert.equal(
    resumed.contract,
    "aralearn.course-authoring-part-materialization.v1"
  );
  assert.deepEqual(Object.keys(resumed).sort(), [
    "authoringPartId", "contract", "courseId", "courseRevision", "materialization"
  ]);
  assert.deepEqual(Object.keys(resumed.materialization).sort(), [
    "authoringPartVersion", "channel", "completedAt", "designContext", "id",
    "nextPendingStep", "resultFacts", "startedAt", "status", "steps",
    "updatedAt", "version"
  ]);
  assert.deepEqual(resumed.materialization.designContext, { focus: "aplicação" });
  assert.deepEqual(resumed.materialization.resultFacts, {});
  assert.equal(resumed.materialization.steps.length, 3);
  assert.deepEqual(resumed.materialization.steps[0].resultFacts, { loaded: true });
  assert.equal(resumed.materialization.steps[0].status, "completed");
  assert.deepEqual(Object.keys(resumed.materialization.steps[0]).sort(), [
    "completedAt", "id", "kind", "position", "productionPosition",
    "resultFacts", "status", "targetDidacticMicrosequenceId", "updatedAt",
    "version"
  ]);
  assert.equal(resumed.materialization.nextPendingStep.id, STEPS[1]);
  assert.equal(resumed.materialization.nextPendingStep.version, 1);
  revision = resumed.courseRevision;
  version = resumed.materialization.version;
  const moduleContent = await scalar(database, `
    select content as value from private.course_entities
    where course_id=$1 and entity_type='module' and entity_id='module-a'
  `, [COURSE]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-blank-title'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: [{
        entityType: "microsequence",
        entityId: "micro-b",
        parentType: "lesson",
        parentId: "lesson-a",
        position: 1,
        content: { title: "\n\t" }
      }],
      deletes: []
    }
  }]), /Lote de entidades da etapa inválido/iu);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-ancestor'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: [{
        entityType: "module",
        entityId: "module-a",
        parentType: null,
        parentId: null,
        position: 0,
        content: { title: "Módulo indevidamente alterado" }
      }],
      deletes: []
    }
  }]), /fora da microssequência alvo/iu);
  assert.deepEqual(await scalar(database, `
    select content as value from private.course_entities
    where course_id=$1 and entity_type='module' and entity_id='module-a'
  `, [COURSE]), moduleContent);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-invalid'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: {},
    entityChanges: {
      upserts: [{
        entityType: "microsequence",
        entityId: "micro-b",
        parentType: "lesson",
        parentId: "lesson-missing",
        position: 1,
        content: { title: "Micro inválida" }
      }],
      deletes: []
    }
  }]), /composição|estrutura|pai|alvo/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_id='micro-b'
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select status='pending' and version=1 as value
    from private.course_authoring_part_materialization_steps where id=$1
  `, [STEPS[1]]), true);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), revision);
  const materialized = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-content'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
    resultFacts: { studyUnitCount: 1 },
    entityChanges: {
      upserts: [
        { entityType: "microsequence", entityId: "micro-b", parentType: "lesson", parentId: "lesson-a", position: 1, content: { title: "Micro B" } },
        { entityType: "card", entityId: "card-b", parentType: "microsequence", parentId: "micro-b", position: 1, content: { title: "Unidade B" } }
      ],
      deletes: []
    }
  }]);
  assert.equal(materialized.entities.createdCount, 2);
  assert.equal(materialized.entities.linkedDidacticMicrosequenceId, "micro-b");
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1 and authoring_part_id=$2
  `, [COURSE, partId]), 2);
  revision = materialized.courseRevision;
  version = materialized.materialization.version;
  const validation = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-step-validation'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, revision, version, {
    stepId: STEPS[2], expectedStepVersion: 1, status: "completed",
    resultFacts: { valid: true }, entityChanges: { upserts: [], deletes: [] }
  }]);
  const finished = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'finish',$7,'mcp','request-finish-0001'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    validation.courseRevision, validation.materialization.version,
    { status: "completed", resultFacts: { produced: 1 } }]);
  assert.equal(finished.materialization.status, "completed");
  const projection = await scalar(database, `
    select public.get_owned_course_instructional_plan_for_actor_v1(
      $1,$2,20
    ) as value
  `, [OWNER, COURSE]);
  assert.equal(projection.plan.parts[0].progress.state, "materialized");
  assert.equal(projection.plan.parts[0].microsequences.length, 2);
  assert.equal(projection.recentActivity[0].kind, "materialization_finished");
  const completedRead = await scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]);
  assert.equal(completedRead.materialization.status, "completed");
  assert.deepEqual(completedRead.materialization.resultFacts, { produced: 1 });
  assert.equal(completedRead.materialization.nextPendingStep, null);
  await database.query(`
    insert into private.course_authoring_part_materialization_steps(
      id,course_id,materialization_id,position,step_kind,
      target_didactic_microsequence_id,production_position
    )
    select extensions.gen_random_uuid(),$1,$2,position,'context_load',null,null
    from generate_series(3,64) position
  `, [COURSE, MATERIALIZATION]);
  await assert.rejects(() => scalar(database, `
    select public.get_owned_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION]), /limite consultável de etapas/iu);
  await database.close();
});

test("materialização exige a primeira etapa pendente e para após falha", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'application','request-order-start'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [
      { id: STEPS[0], position: 0, kind: "context_load", targetDidacticMicrosequenceId: null, productionPosition: null },
      { id: STEPS[1], position: 1, kind: "didactic_microsequence_materialization", targetDidacticMicrosequenceId: "micro-b", productionPosition: 1 }
    ]
  }]);
  const emptyChanges = { upserts: [], deletes: [] };
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'application','request-order-skip'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    started.courseRevision, started.materialization.version, {
      stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
      resultFacts: {}, entityChanges: emptyChanges
    }]), /próxima pendente/iu);
  const failed = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'application','request-order-fail'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    started.courseRevision, started.materialization.version, {
      stepId: STEPS[0], expectedStepVersion: 1, status: "failed",
      resultFacts: { reason: "context_unavailable" }, entityChanges: emptyChanges
    }]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'application','request-order-after-fail'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    failed.courseRevision, failed.materialization.version, {
      stepId: STEPS[1], expectedStepVersion: 1, status: "completed",
      resultFacts: {}, entityChanges: emptyChanges
    }]), /já falhou/iu);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), failed.courseRevision);
  await database.close();
});

test("record_step reverte entidades e vínculo quando a ordem de produção cria lacuna", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'mcp','request-gap-start'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: STEPS[0],
      position: 0,
      kind: "didactic_microsequence_materialization",
      targetDidacticMicrosequenceId: "micro-b",
      productionPosition: 2
    }]
  }]);
  await assert.rejects(() => scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'record_step',$7,'mcp','request-gap-step'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION,
    started.courseRevision, started.materialization.version, {
      stepId: STEPS[0],
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: {
        upserts: [
          { entityType: "microsequence", entityId: "micro-b", parentType: "lesson", parentId: "lesson-a", position: 1, content: { title: "Micro B" } },
          { entityType: "card", entityId: "card-b", parentType: "microsequence", parentId: "micro-b", position: 1, content: { title: "Unidade B" } }
        ],
        deletes: []
      }
    }]), /ordem de produção.*contígua/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value from private.course_entities
    where course_id=$1 and entity_id in('micro-b','card-b')
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1 and authoring_part_id=$2
  `, [COURSE, partId]), 1);
  assert.equal(await scalar(database, `
    select status='pending' and version=1 as value
    from private.course_authoring_part_materialization_steps where id=$1
  `, [STEPS[0]]), true);
  assert.equal(await scalar(database, `
    select revision as value from public.courses where id=$1
  `, [COURSE]), started.courseRevision);
  await database.close();
});

test("service role rejeita productionPosition 64/65 e mais de 64 vínculos", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const planId = await scalar(database, `
    select id as value from private.course_instructional_plans where course_id=$1
  `, [COURSE]);
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  for (const productionPosition of [64, 65]) {
    const suffix = String(productionPosition).padStart(12, "0");
    await assert.rejects(() => scalar(database, `
      select public.advance_course_authoring_part_materialization_for_actor_v1(
        $1,$2,$3,$4,4,0,'start',$5,'mcp',$6
      ) as value
    `, [
      OWNER,
      COURSE,
      partId,
      `30000000-0000-4000-8000-${suffix}`,
      {
        authoringPartVersion: 1,
        designContext: {},
        steps: [{
          id: `40000000-0000-4000-8000-${suffix}`,
          position: 0,
          kind: "didactic_microsequence_materialization",
          targetDidacticMicrosequenceId: `micro-${productionPosition}`,
          productionPosition
        }]
      },
      `request-position-${productionPosition}`
    ]), /etapas iniciais.*inválidas/iu);
  }
  const tooManyLinks = planTarget(planId, partId);
  tooManyLinks.parts[0].microsequenceIds = Array.from(
    { length: 65 },
    (_, index) => `micro-${index}`
  );
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,4,1,$3,$4,'mcp','request-links-over-limit'
    ) as value
  `, [
    OWNER,
    COURSE,
    { type: "update_part", id: partId },
    tooManyLinks
  ]), /Parte do plano instrucional inválida/iu);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_materializations where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(database, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences
    where course_id=$1 and authoring_part_id=$2
  `, [COURSE, partId]), 1);
  await database.close();
});

test("commit permite cabeçalho e itens, mas bloqueia a Parte em materialização", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  await actor(database, OWNER, "service_role");
  const partId = await scalar(database, `
    select id as value from private.course_authoring_parts where course_id=$1
  `, [COURSE]);
  const started = await scalar(database, `
    select public.advance_course_authoring_part_materialization_for_actor_v1(
      $1,$2,$3,$4,4,0,'start',$5,'mcp','request-running-start'
    ) as value
  `, [OWNER, COURSE, partId, MATERIALIZATION, {
    authoringPartVersion: 1,
    designContext: {},
    steps: [{
      id: STEPS[0], position: 0, kind: "context_load",
      targetDidacticMicrosequenceId: null, productionPosition: null
    }]
  }]);
  const current = await scalar(database, `
    select private.course_instructional_plan_command_document_v1($1) as value
  `, [COURSE]);
  const headerTarget = structuredClone(current);
  headerTarget.audience = "Professores em formação.";
  const headerChanged = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,1,$4,$5,'application','request-running-header'
    ) as value
  `, [
    OWNER,
    COURSE,
    started.courseRevision,
    { type: "update_plan" },
    headerTarget
  ]);
  assert.equal(headerChanged.changed, true);
  const itemTarget = structuredClone(headerTarget);
  itemTarget.intendedLearningOutcomes.push({
    id: PLAN_ITEM,
    position: 0,
    statement: "Comparar relações."
  });
  const itemChanged = await scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application','request-running-item'
    ) as value
  `, [
    OWNER,
    COURSE,
    headerChanged.courseRevision,
    headerChanged.planVersion,
    {
      type: "add_plan_item",
      kind: "intended_learning_outcome",
      id: PLAN_ITEM,
      position: 0,
      statement: "Comparar relações."
    },
    itemTarget
  ]);
  const partTarget = structuredClone(itemTarget);
  partTarget.parts[0].intent = "Intenção alterada durante execução.";
  await assert.rejects(() => scalar(database, `
    select public.commit_course_instructional_plan_for_actor_v1(
      $1,$2,$3,$4,$5,$6,'application','request-running-part'
    ) as value
  `, [
    OWNER,
    COURSE,
    itemChanged.courseRevision,
    itemChanged.planVersion,
    { type: "update_part", id: partId },
    partTarget
  ]), /Parte em materialização mudou/iu);
  assert.equal(await scalar(database, `
    select intent as value from private.course_authoring_parts where id=$1
  `, [partId]), "");
  assert.equal(await scalar(database, `
    select version=1 as value
    from private.course_authoring_part_materializations where id=$1
  `, [MATERIALIZATION]), true);
  await database.close();
});

test("exclusão de Curso e conta remove vínculo e materialização sem afrouxar entidade isolada", async () => {
  const directDatabase = await databaseFixture();
  await applyMigration(directDatabase);
  await startMinimalMaterialization(directDatabase, "request-delete-course-start");
  await assert.rejects(() => directDatabase.query(`
    delete from private.course_entities
    where course_id=$1 and entity_type='microsequence' and entity_id='micro-a'
  `, [COURSE]), /foreign key|viola/iu);
  await directDatabase.query("delete from public.courses where id=$1", [COURSE]);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_materializations where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(directDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_materialization_steps where course_id=$1
  `, [COURSE]), 0);
  await directDatabase.close();

  const accountDatabase = await databaseFixture();
  await applyMigration(accountDatabase);
  await startMinimalMaterialization(accountDatabase, "request-delete-account-start");
  await actor(accountDatabase, OWNER, "authenticated");
  const deleted = await scalar(accountDatabase, `
    select public.delete_my_account_v1('EXCLUIR MINHA CONTA') as value
  `);
  assert.equal(deleted.status, "deleted");
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from auth.users where id=$1
  `, [OWNER]), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value from public.courses where id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_didactic_microsequences where course_id=$1
  `, [COURSE]), 0);
  assert.equal(await scalar(accountDatabase, `
    select count(*)::integer as value
    from private.course_authoring_part_materializations where course_id=$1
  `, [COURSE]), 0);
  await accountDatabase.close();
});

test("aborta mandato, decisão e referência sem conversor", async () => {
  const withDecision = await databaseFixture({ decisions: [{ id: "d1" }] });
  await assert.rejects(() => applyMigration(withDecision), /conversor explícito/iu);
  await withDecision.close();
  const withMandate = await databaseFixture({ mandate: { id: "m1" } });
  await assert.rejects(() => applyMigration(withMandate), /conversor explícito/iu);
  await withMandate.close();
  const missing = await databaseFixture({ microsequenceIds: ["missing"] });
  await assert.rejects(() => applyMigration(missing), /inexistente/iu);
  await missing.close();
});

test("aborta brief legado com controles C0 ou C1 antes da conversão", async () => {
  for (const brief of [
    "Orientação\u0001inválida",
    "Orientação\u007finválida",
    "Orientação\u0085inválida"
  ]) {
    const database = await databaseFixture({ brief });
    await assert.rejects(
      () => applyMigration(database),
      /caractere de controle/iu
    );
    await database.close();
  }
});

test("expõe somente leitura ao browser e remove assinaturas substituídas", async () => {
  const database = await databaseFixture();
  await applyMigration(database);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.get_owned_course_instructional_plan_v1(uuid,integer)',
      'EXECUTE'
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)',
      'EXECUTE'
    ) as value
  `), false);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'service_role',
      'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    ) as value
  `), true);
  assert.equal(await scalar(database, `
    select has_function_privilege(
      'authenticated',
      'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    ) as value
  `), false);
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.commit_course_changes_for_actor_v1(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb,jsonb,text)'
    ) is null as value
  `), true);
  assert.equal(await scalar(database, `
    select to_regprocedure(
      'public.create_course_for_actor_v1(uuid,text,text,text,text)'
    ) is null as value
  `), true);
  assert.equal(await scalar(database, `
    select public.get_aralearn_runtime_manifest()->>'schemaRevision' as value
  `), "20260817160000");
  await database.close();
});
