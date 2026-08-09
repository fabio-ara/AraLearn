import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

import {
  EDUCATIONAL_WORKSPACE_ROLES,
  educationalWorkspaceCan,
  educationalWorkspaceRoleLabel,
  normalizeEducationalWorkspaceRole
} from "../../src/domain/educationalWorkspace.js";
import {
  authoringMcpToolDefinition,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const membershipMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260801210000_educational_workspaces.sql"
), "utf8");
const enforcementMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260801213000_workspace_capability_enforcement.sql"
), "utf8");
const projectionMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260801220000_workspace_current_state.sql"
), "utf8");
const courseProjectionMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260801233000_workspace_course_state_projection.sql"
), "utf8");
const composedMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260730140000_composed_authoring_and_catalog_review.sql"
), "utf8");
const reuseMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260731160000_skip_unchanged_workspace_publication.sql"
), "utf8");
const centralMigration = fs.readFileSync(path.join(
  root, "supabase", "migrations", "20260801120000_current_state_central.sql"
), "utf8");

const OWNER = "10000000-0000-4000-8000-000000000001";
const LEARNER = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";

test("papéis educacionais expõem somente capacidades contextuais previstas", () => {
  assert.deepEqual(EDUCATIONAL_WORKSPACE_ROLES, [
    "owner", "admin", "author", "reviewer", "learner", "reader"
  ]);
  assert.equal(educationalWorkspaceCan("owner", "transfer"), true);
  assert.equal(educationalWorkspaceCan("admin", "transfer"), false);
  assert.equal(educationalWorkspaceCan("author", "publish"), true);
  assert.equal(educationalWorkspaceCan("reviewer", "author"), false);
  assert.equal(educationalWorkspaceCan("learner", "comment"), true);
  assert.equal(educationalWorkspaceCan("reader", "comment"), false);
  assert.equal(educationalWorkspaceRoleLabel("author"), "Professor/Autor");
  assert.equal(normalizeEducationalWorkspaceRole(" LEARNER "), "learner");
  assert.throws(
    () => normalizeEducationalWorkspaceRole("owner", { allowOwner: false }),
    /inválido/u
  );
});

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function extensions.gen_random_uuid() returns uuid language sql volatile as $$
      select pg_catalog.gen_random_uuid()
    $$;
    create function extensions.gen_random_bytes(p_length integer)
      returns bytea language sql volatile as $$
        select decode(repeat('ab', p_length), 'hex')
      $$;
    create function extensions.digest(p_value bytea, p_algorithm text)
      returns bytea language sql immutable as $$
        select convert_to(repeat('h', 32), 'UTF8')
      $$;
    create table auth.users(id uuid primary key, email text);
    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null,
      revision bigint not null default 1,
      source_course_id uuid,
      source_revision_hash text,
      source_submission_id uuid,
      brief text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id, entity_type, entity_id)
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
      workspace_course_id text not null,
      target text not null,
      course_id uuid not null,
      content_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id, workspace_course_id, target)
    );
    insert into auth.users values
      ('${OWNER}', 'owner@example.test'),
      ('${LEARNER}', 'learner@example.test');
  `);
  await db.exec(membershipMigration);
  return db;
}

async function command(db, actor, requestId, operation, payload) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor]);
  return db.query(
    "select public.manage_current_educational_workspace_v1($1, $2, $3::jsonb) as value",
    [requestId, operation, JSON.stringify(payload)]
  );
}

function functionBlock(source, qualifiedName) {
  const create = source.indexOf(`create function ${qualifiedName}(`);
  const replace = source.indexOf(`create or replace function ${qualifiedName}(`);
  const start = [create, replace].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  assert.notEqual(start, undefined, qualifiedName);
  const end = source.indexOf("$function$;", start);
  assert.notEqual(end, -1, qualifiedName);
  return source.slice(start, end + "$function$;".length);
}

test("workspace é criado uma vez e convite concede papel local sem copiar conteúdo", async () => {
  const db = await database();
  try {
    const create = await command(db, OWNER, "workspace:create:0001", "create", {
      workspaceId: WORKSPACE,
      title: "Formação em equipe",
      purpose: "Aprender e revisar em conjunto.",
      kind: "team",
      visibility: "members"
    });
    assert.equal(create.rows[0].value.role, "owner");
    const replay = await command(db, OWNER, "workspace:create:0001", "create", {
      workspaceId: WORKSPACE,
      title: "Formação em equipe",
      purpose: "Aprender e revisar em conjunto.",
      kind: "team",
      visibility: "members"
    });
    assert.equal(replay.rows[0].value.idempotent, true);

    const invitation = await command(db, OWNER, "workspace:invite:0001", "invite", {
      workspaceId: WORKSPACE,
      email: "LEARNER@example.test",
      role: "learner"
    });
    const code = invitation.rows[0].value.code;
    assert.match(code, /^[A-Za-z0-9_-]{32,128}$/u);

    const accepted = await command(db, LEARNER, "workspace:accept:0001", "accept_invite", {
      code
    });
    assert.equal(accepted.rows[0].value.role, "learner");
    const detail = await db.query(
      "select public.get_current_educational_workspace_v1($1) as value",
      [WORKSPACE]
    );
    assert.equal(detail.rows[0].value.role, "learner");
    assert.equal(detail.rows[0].value.capabilities.comment, true);
    assert.equal(detail.rows[0].value.capabilities.manage, false);
    assert.equal(detail.rows[0].value.members.length, 2);
    assert.equal(detail.rows[0].value.members[0].email, null);
    assert.equal(detail.rows[0].value.members[1].email, "learner@example.test");

    await assert.rejects(
      () => command(db, LEARNER, "workspace:update:0001", "update", {
        workspaceId: WORKSPACE,
        title: "Tentativa",
        purpose: "",
        kind: "team",
        visibility: "members"
      }),
      /não permitida/u
    );
    const roots = await db.query(`
      select count(*)::integer as count
      from private.authoring_workspace_entities
      where workspace_id = $1
    `, [WORKSPACE]);
    assert.equal(roots.rows[0].count, 1, "governança não duplica a árvore do curso");
  } finally {
    await db.close();
  }
});

test("transferência distingue propriedade primária de copropriedade", async () => {
  const db = await database();
  try {
    await command(db, OWNER, "workspace:create:transfer", "create", {
      workspaceId: WORKSPACE,
      title: "Equipe",
      purpose: "Transferir responsabilidade.",
      kind: "team",
      visibility: "members"
    });
    const invitation = await command(db, OWNER, "workspace:invite:transfer", "invite", {
      workspaceId: WORKSPACE,
      email: "learner@example.test",
      role: "admin"
    });
    await command(db, LEARNER, "workspace:accept:transfer", "accept_invite", {
      code: invitation.rows[0].value.code
    });
    await command(db, OWNER, "workspace:owner:transfer", "transfer_owner", {
      workspaceId: WORKSPACE,
      userId: LEARNER
    });

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [OWNER]);
    const former = await db.query(
      "select public.get_current_educational_workspace_v1($1) as value",
      [WORKSPACE]
    );
    assert.equal(former.rows[0].value.role, "owner");
    assert.equal(former.rows[0].value.capabilities.manage, true);
    assert.equal(former.rows[0].value.capabilities.transfer, false);
    await assert.rejects(
      () => command(db, OWNER, "workspace:owner:retry", "transfer_owner", {
        workspaceId: WORKSPACE,
        userId: LEARNER
      }),
      /não permitida/u
    );

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [LEARNER]);
    const primary = await db.query(
      "select public.get_current_educational_workspace_v1($1) as value",
      [WORKSPACE]
    );
    assert.equal(primary.rows[0].value.capabilities.transfer, true);
  } finally {
    await db.close();
  }
});

test("detalhe deriva cursos, planejamento e destinos sem duplicar a composição", async () => {
  const db = await database();
  try {
    await command(db, OWNER, "workspace:create:courses", "create", {
      workspaceId: WORKSPACE,
      title: "Composição corrente",
      purpose: "Acompanhar a construção.",
      kind: "team",
      visibility: "members"
    });
    await db.exec(courseProjectionMigration);
    await db.query(`
      insert into private.authoring_workspace_entities(
        workspace_id, entity_type, entity_id, parent_type, parent_id, position, content
      ) values
        ($1, 'course', 'course-a', 'project', 'project', 0,
          '{"title":"Curso A","goal":"Aprender."}'::jsonb),
        ($1, 'module', 'module-a', 'course', 'course-a', 0,
          '{"title":"Módulo"}'::jsonb),
        ($1, 'lesson', 'lesson-a', 'module', 'module-a', 0,
          '{"title":"Lição"}'::jsonb),
        ($1, 'microsequence', 'micro-ready', 'lesson', 'lesson-a', 0,
          '{"title":"Pronta","status":"ready"}'::jsonb),
        ($1, 'microsequence', 'micro-planned', 'lesson', 'lesson-a', 1,
          '{"title":"Planejada","status":"planned"}'::jsonb),
        ($1, 'card', 'card-a', 'microsequence', 'micro-ready', 1,
          '{"title":"Card"}'::jsonb)
    `, [WORKSPACE]);
    await db.query(`
      insert into private.authoring_workspace_publications(
        workspace_id, workspace_course_id, target, course_id, content_hash
      ) values ($1, 'course-a', 'private', $2, $3)
    `, [WORKSPACE, "30000000-0000-4000-8000-000000000001", "a".repeat(64)]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [OWNER]);
    const detail = await db.query(
      "select public.get_current_educational_workspace_v1($1) as value",
      [WORKSPACE]
    );
    assert.deepEqual(detail.rows[0].value.courses, [{
      courseKey: "course-a",
      title: "Curso A",
      goal: "Aprender.",
      position: 0,
      moduleCount: 1,
      lessonCount: 1,
      microsequenceCount: 2,
      readyMicrosequenceCount: 1,
      cardCount: 1,
      publicationTargets: ["private"],
      updatedAt: detail.rows[0].value.courses[0].updatedAt
    }]);
    const entities = await db.query(`
      select count(*)::integer as count
      from private.authoring_workspace_entities where workspace_id = $1
    `, [WORKSPACE]);
    assert.equal(entities.rows[0].count, 7, "a projeção não cria partes adicionais");
  } finally {
    await db.close();
  }
});

test("migrações de capacidade e projeção executam sobre as funções vigentes", async () => {
  const db = await database();
  try {
    await db.exec(`
      create table public.courses(
        id uuid primary key, owner_id uuid, title text not null default '',
        goal text not null default '', module_count integer not null default 0,
        lesson_count integer not null default 0, completion_state text not null default 'partial',
        status text not null default 'published', deleted_at timestamptz,
        document_storage_enabled boolean not null default true,
        current_revision_hash text, revision_artifact_hash text
      );
      create table public.user_course_selections(
        id uuid primary key default gen_random_uuid(), user_id uuid not null,
        course_id uuid not null, position integer not null,
        unique(user_id, course_id)
      );
      create table public.lesson_progress(selection_id uuid, last_activity_at timestamptz);
      create table public.card_progress(selection_id uuid, last_activity_at timestamptz);
      create table private.course_revision_sync_changes(
        user_id uuid not null, scope text not null, entity_id uuid not null,
        operation text not null, revision_hash text
      );
      create table private.authoring_workspace_events(
        workspace_id uuid not null, revision bigint not null default 1,
        event_type text, payload jsonb, created_at timestamptz not null default now()
      );
      create table private.authoring_workspace_requests(
        workspace_id uuid not null, request_id text, payload_hash text, response jsonb
      );
      create table private.catalog_review_submissions(
        id uuid primary key, author_id uuid not null, source_course_id uuid not null,
        title text not null, status text not null, completion_state text not null,
        reviewer_id uuid, claim_expires_at timestamptz, submitted_at timestamptz not null,
        updated_at timestamptz not null
      );
      create function private.require_workspace_actor_v5(p_actor_id uuid, p_scope text)
        returns void language plpgsql as $$ begin return; end $$;
      create function private.can_review_catalog_v5(p_actor_id uuid)
        returns boolean language sql stable as $$ select false $$;
      create function private.can_publish_catalog_v5(p_actor_id uuid)
        returns boolean language sql stable as $$ select false $$;
    `);
    for (const name of [
      "public.commit_authoring_workspace_changes_v5",
      "public.update_authoring_workspace_brief_v5",
      "public.get_authoring_workspace_v5",
      "public.list_authoring_workspaces_v5",
      "public.list_authoring_workspace_events_v5",
      "public.list_authoring_workspace_microsequence_cards_v5",
      "public.delete_authoring_workspace_v5",
      "public.publish_authoring_workspace_course_v5"
    ]) {
      await db.exec(functionBlock(composedMigration, name));
    }
    await db.exec(functionBlock(reuseMigration, "public.reuse_unchanged_authoring_publication_v5"));
    await db.exec(centralMigration);
    await db.exec(enforcementMigration);
    await db.exec(projectionMigration);

    const definitions = await db.query(`
      select pg_get_functiondef('public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)'::regprocedure)
        as workspace_definition,
        pg_get_functiondef('public.list_current_state_central_v1(text,integer,timestamptz,uuid,integer,uuid,text)'::regprocedure)
        as central_definition
    `);
    assert.match(definitions.rows[0].workspace_definition, /educational_workspace_can_v1/u);
    assert.match(definitions.rows[0].workspace_definition, /'workspaceKind'/u);
    assert.match(definitions.rows[0].central_definition, /educational_workspace_role_v1/u);
    const capabilityDefinitions = await db.query(`
      select signature, pg_get_functiondef(signature::regprocedure) as definition
      from unnest(array[
        'public.commit_authoring_workspace_changes_v5(uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
        'public.update_authoring_workspace_brief_v5(uuid,uuid,text,text,bigint,text)',
        'public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)',
        'public.list_authoring_workspaces_v5(uuid,integer,timestamptz,uuid)',
        'public.list_authoring_workspace_events_v5(uuid,uuid,integer,bigint)',
        'public.list_authoring_workspace_microsequence_cards_v5(uuid,uuid,text[],integer,integer,text)',
        'public.delete_authoring_workspace_v5(uuid,uuid,text,text)',
        'public.publish_authoring_workspace_course_v5(uuid,uuid,text,text,bigint,text,text,uuid,text,uuid,uuid,jsonb,jsonb)',
        'public.reuse_unchanged_authoring_publication_v5(uuid,uuid,text,text,bigint,text,text,text,text,uuid,text,uuid)'
      ]) signature
    `);
    assert.equal(capabilityDefinitions.rows.length, 9);
    for (const row of capabilityDefinitions.rows) {
      assert.match(
        row.definition,
        /private\.educational_workspace_can_v1/u,
        `${row.signature} deve aplicar a capacidade contextual corrente`
      );
    }

    await command(db, OWNER, "workspace:create:integration", "create", {
      workspaceId: WORKSPACE,
      title: "Turma integrada",
      purpose: "Validar acesso sem cópias.",
      kind: "class",
      visibility: "members"
    });
    await db.query(`
      insert into public.courses(id, owner_id, title) values ($1, $2, 'Curso privado')
    `, ["30000000-0000-4000-8000-000000000001", OWNER]);
    await db.query(`
      insert into private.authoring_workspace_publications(
        workspace_id, workspace_course_id, target, course_id, content_hash
      ) values ($1, 'course-root', 'private', $2, $3)
    `, [WORKSPACE, "30000000-0000-4000-8000-000000000001", "a".repeat(64)]);
    await db.query(`
      insert into private.educational_workspace_members(workspace_id, user_id, role, granted_by)
      values ($1, $2, 'learner', $3)
    `, [WORKSPACE, LEARNER, OWNER]);
    const selections = await db.query(`
      select count(*)::integer as count from public.user_course_selections
      where user_id = $1 and course_id = $2
    `, [LEARNER, "30000000-0000-4000-8000-000000000001"]);
    assert.equal(selections.rows[0].count, 1);
    await command(db, OWNER, "workspace:remove:integration", "remove_member", {
      workspaceId: WORKSPACE,
      userId: LEARNER
    });
    const revoked = await db.query(`
      select count(*)::integer as count from public.user_course_selections
      where user_id = $1 and course_id = $2
    `, [LEARNER, "30000000-0000-4000-8000-000000000001"]);
    assert.equal(revoked.rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("migration separa governança, autorização e projeção corrente", () => {
  assert.match(membershipMigration, /educational_workspace_members/u);
  assert.match(membershipMigration, /educational_workspace_invitations/u);
  assert.match(membershipMigration, /expires_at[^;]+7 days/su);
  assert.doesNotMatch(membershipMigration, /workspace_revisions|snapshot/u);
  assert.match(enforcementMigration, /educational_workspace_can_v1/u);
  assert.match(enforcementMigration, /workspace-member-course-access-v1/u);
  assert.match(projectionMigration, /educational_workspace_role_v1/u);
  assert.match(projectionMigration, /'schemaRevision', '20260801220000'/u);
  assert.match(courseProjectionMigration, /workspace-course-state-projection-v1/u);
  assert.doesNotMatch(courseProjectionMigration, /create table/iu);
});

test("MCP usa um contrato discriminado para leitura e governança", () => {
  const definition = authoringMcpToolDefinition("gerirWorkspaceEducacional");
  assert.ok(definition);
  const commentListOutput = definition.outputSchema.oneOf[0].properties.data.anyOf
    .find((variant) => variant.properties?.items?.items?.properties?.trailItemId);
  assert.ok(commentListOutput);
  const commentOutput = commentListOutput.properties.items.items;
  assert.equal(commentOutput.required.includes("trailItemId"), true);
  assert.deepEqual(commentOutput.properties.courseId.anyOf.map((value) =>
    value.type), ["string", "null"]);
  assert.equal(commentOutput.properties.cardId.format, undefined);
  assert.equal(commentOutput.properties.cardId.maxLength, 240);
  assert.deepEqual(
    definition.inputSchema.oneOf.map((variant) => variant.properties.operation.const),
    [
      "read",
      "create",
      "update",
      "invite",
      "accept_invite",
      "cancel_invite",
      "set_role",
      "remove_member",
      "transfer_owner",
      "leave",
      "list_comments",
      "respond_comment",
      "set_comment_status",
      "link_comment_correction",
      "list_observations",
      "create_observation",
      "delete_observation"
    ]
  );
  assert.deepEqual(mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
    operation: "read",
    workspaceId: WORKSPACE
  }), {
    method: "GET",
    path: `/v1/educational-workspaces/${WORKSPACE}`,
    body: null,
    requestId: null
  });
  assert.deepEqual(mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
    requestId: "workspace:invite:0002",
    operation: "invite",
    workspaceId: WORKSPACE,
    email: "learner@example.test",
    role: "learner"
  }), {
    method: "POST",
    path: "/v1/educational-workspaces/actions",
    body: {
      requestId: "workspace:invite:0002",
      operation: "invite",
      payload: {
        workspaceId: WORKSPACE,
        email: "learner@example.test",
        role: "learner"
      }
    },
    requestId: "workspace:invite:0002"
  });
  assert.deepEqual(mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
    operation: "list_comments",
    workspaceId: WORKSPACE,
    limit: 12,
    categories: ["question"],
    statuses: ["open", "considered"]
  }), {
    method: "GET",
    path: `/v1/educational-workspaces/${WORKSPACE}/comments` +
      "?limit=12&categories=%5B%22question%22%5D&statuses=%5B%22open%22%2C%22considered%22%5D",
    body: null,
    requestId: null
  });
  assert.deepEqual(mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
    requestId: "comment:response:0001",
    operation: "respond_comment",
    workspaceId: WORKSPACE,
    commentId: "30000000-0000-4000-8000-000000000001",
    response: "O exemplo será revisto."
  }), {
    method: "POST",
    path: `/v1/educational-workspaces/${WORKSPACE}/comments/` +
      "30000000-0000-4000-8000-000000000001/actions",
    body: {
      requestId: "comment:response:0001",
      operation: "respond_comment",
      payload: { response: "O exemplo será revisto." }
    },
    requestId: "comment:response:0001"
  });
  assert.throws(
    () => mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
      requestId: "comment:status:0001",
      operation: "set_comment_status",
      workspaceId: WORKSPACE,
      commentId: "30000000-0000-4000-8000-000000000001",
      status: "incorporated"
    }),
    ({ status, code }) => status === 422 && code === "invalid_tool_arguments"
  );
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirWorkspaceEducacional",
    {
      ok: true,
      requestId: "comment:link:0001",
      data: {
        workspaceId: WORKSPACE,
        commentId: "30000000-0000-4000-8000-000000000001",
        operation: "link_comment_correction",
        status: "incorporated",
        updatedAt: "2026-08-09T12:00:00.000Z",
        idempotent: false,
        resultingRevision: 18
      }
    }
  ));
  assert.throws(
    () => mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
      requestId: "workspace:invite:0003",
      operation: "invite",
      workspaceId: WORKSPACE,
      email: "learner@example.test",
      role: "owner"
    }),
    /valor permitido|variante permitida/u
  );
});
