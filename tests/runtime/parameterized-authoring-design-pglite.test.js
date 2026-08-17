import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import testRunner from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import {
  canonicalJsonStringify
} from "../../supabase/functions/_shared/aralearn-authoring/canonicalJson.js";
import {
  DESIGN_PARAMETER_CATALOG
} from "../../src/authoring/instructionalDesignContracts.js";
import {
  aggregatePartConformanceAudits
} from "../../src/authoring/instructionalConformanceAudit.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260815193000_parameterized_authoring_design.sql",
  import.meta.url
);
const blueprintArtifactMigrationUrl = new URL(
  "../../supabase/migrations/20260815230000_authoring_blueprint_artifact_receipt.sql",
  import.meta.url
);
const auditMigrationUrl = new URL(
  "../../supabase/migrations/20260815235900_authoring_design_conformance_audit.sql",
  import.meta.url
);
const experimentMigrationUrl = new URL(
  "../../supabase/migrations/20260816120000_parameterized_authoring_experiments.sql",
  import.meta.url
);
const taskOperationMigrationUrl = new URL(
  "../../supabase/migrations/20260817130000_task_operation_terminology.sql",
  import.meta.url
);

const ACTOR = "10000000-0000-4000-8000-000000000001";
const AUTHOR_ONLY = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const LEGACY_EVIDENCE_OPERATION_KEY = ["oper", "ation"].join("");
const LEGACY_TASK_OPERATION_KEY = ["cognitive", "Operation"].join("");
const LEGACY_TASK_OPERATIONS_KEY = ["cognitive", "Operations"].join("");
const LEGACY_TASK_OPERATION_ID_PREFIX = ["oper", "ation."].join("");
const UNRELATED_TECHNICAL_OPERATION_ID = ["oper", "ation.start"].join("");
const test = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  ? testRunner
  : () => {};

function hash(character) {
  return character.repeat(64);
}

export async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

export async function mutationHash(_database, operation, payload) {
  return createHash("sha256")
    .update(canonicalJsonStringify({ operation, payload }))
    .digest("hex");
}

export function analysisPayload(revision = 1, overrides = {}) {
  return {
    contract: "InstructionalAnalysis@1",
    modelVersion: "1.0.0",
    id: "analysis-a",
    version: "1.0.0",
    scope: { kind: "microsequence", ref: "micro-a" },
    objective: "Distinguir relações causais de associações.",
    sourceRefs: [],
    derivedFrom: { workspaceRevision: revision, scopeEntityVersion: 1 },
    learnerContext: {
      audience: "Pessoa autodidata iniciante.",
      conditions: [],
      uncertainties: ["Conhecimento prévio não observado diretamente."]
    },
    units: [{
      id: "unit:a",
      label: "Relação causal",
      kind: "concept",
      priorKnowledge: {
        state: "unknown",
        basis: "inference",
        evidenceRefs: [],
        note: "O conhecimento prévio ainda não foi observado."
      },
      knowledgeFormHypothesis: {
        conditions: [],
        responses: [],
        expression: "verbal",
        rationaleAvailability: "unknown",
        basisRefs: [],
        note: "Hipótese operacional sujeita a revisão."
      }
    }],
    relations: [],
    coordinationRequirements: [],
    explanationRequirements: [{
      id: "explanation:a",
      targetUnitRefs: ["unit:a"],
      features: ["contrast"],
      applicabilityRationale: "A distinção precisa ser desenvolvida explicitamente."
    }],
    evidenceRequirements: [{
      id: "evidence:a",
      targetUnitRefs: ["unit:a"],
      taskOperation: "compare",
      claim: "A pessoa distingue causalidade de associação.",
      acceptablePerformanceForms: ["explanation_with_example"],
      taskFeatures: ["paired_cases"],
      criterion: {
        observable: "Escolha e justificativa.",
        successCondition: "A justificativa usa a relação pertinente."
      },
      fidelityRequirementRef: null
    }],
    practiceVariationRequirements: [],
    fidelityRequirements: [],
    representationRequirements: [],
    assumptions: [],
    limitations: [],
    ...overrides
  };
}

export function pedagogicalBlueprintV2() {
  return {
    goal: "Distinguir relações causais de associações.",
    learnerSituation: "Pessoa autodidata iniciante.",
    learningConditions: [],
    contentDemands: [{
      id: "demand:a",
      description: "Comparar relações e justificar a distinção.",
      taskOperations: ["compare"]
    }],
    anticipatedDifficulties: [],
    designResponses: [],
    prerequisiteEvidence: [],
    conceptualLayers: [{
      id: "layer:a",
      plainLanguageReferent: "Relações entre acontecimentos.",
      formalTerms: ["causalidade"],
      requiresLayerIds: []
    }],
    theorySteps: [{
      id: "theory:a",
      layerIds: ["layer:a"],
      purpose: "Desenvolver a distinção antes da prática.",
      taskOperation: "compare",
      packageCandidateIds: ["concept-map"]
    }],
    practiceSteps: [{
      id: "practice:a",
      targetLayerIds: ["layer:a"],
      decision: "Classificar a relação apresentada.",
      taskOperation: "compare",
      packageCandidateIds: ["concept-map"],
      feedback: "Retomar a evidência necessária para afirmar causalidade."
    }],
    feedbackPlan: "Explicitar a relação usada na decisão.",
    termLedger: [{
      term: "causalidade",
      introducedInLayerId: "layer:a",
      plainMeaning: "Relação em que uma mudança produz outra."
    }],
    packageCandidates: [{
      id: "concept-map",
      packageId: "aralearn.resource.concept_map",
      version: "1.0.0",
      reason: "Representar relações explicitamente."
    }]
  };
}

export function pedagogicalBlueprintBinding() {
  return {
    contract: "PedagogicalBlueprintBinding@1",
    id: "binding-a",
    version: "1.0.0",
    scope: { kind: "microsequence", ref: "micro-a" },
    blueprintRef: { id: "blueprint-a", version: "1.0.0" },
    blueprintContractVersion: 2,
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
    mappings: {
      conceptualLayers: [{ layerId: "layer:a", unitRefs: ["unit:a"] }],
      contentDemands: [{
        contentDemandId: "demand:a",
        unitRefs: ["unit:a"],
        evidenceRequirementRefs: ["evidence:a"]
      }],
      designResponses: [],
      theorySteps: [{
        stepId: "theory:a",
        unitRefs: ["unit:a"],
        explanationRequirementRefs: ["explanation:a"]
      }],
      practiceSteps: [{
        stepId: "practice:a",
        unitRefs: ["unit:a"],
        evidenceRequirementRefs: ["evidence:a"]
      }]
    }
  };
}

export async function setupDatabase({ applyTaskOperationCutover = true } = {}) {
  const database = new PGlite();
  await database.exec(`
    create schema private;
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role;

    create table auth.users(id uuid primary key);
    create function extensions.digest(bytea,text)
    returns bytea language sql immutable
    as $$ select decode(md5($1) || md5($1), 'hex') $$;

    create function private.valid_authoring_continuity_v1(p_state jsonb)
    returns boolean language sql immutable as $$
      select jsonb_typeof(p_state) = 'object'
        and jsonb_typeof(p_state->'decisions') = 'array'
        and not exists (
          select 1 from jsonb_array_elements(p_state->'decisions') decision
          where jsonb_typeof(decision) <> 'object'
            or not (decision ?& array['id','summary','entityType','entityId'])
            or exists (
              select 1 from jsonb_object_keys(decision) field_name
              where field_name not in ('id','summary','entityType','entityId')
            )
        )
    $$;

    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      title text not null,
      revision bigint not null default 1,
      brief text not null default '',
      authoring_state jsonb not null default '{"decisions":[]}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      constraint authoring_workspaces_continuity_v1 check (
        private.valid_authoring_continuity_v1(authoring_state)
      )
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null default '{}'::jsonb,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id, entity_type, entity_id)
    );
    create table private.authoring_workspace_requests(
      owner_id uuid not null references auth.users(id) on delete cascade,
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '14 days',
      primary key(owner_id,request_id),
      constraint authoring_workspace_requests_operation_v5 check(operation in (
        'create','create_structure','update_metadata','save_microsequence_cards',
        'save_card','update_brief','copy_entity','rename_entity','move_entity',
        'delete_entity','merge_microsequences','split_microsequence',
        'promote_module','demote_course','import_course','replace_catalog_document',
        'publish_private_preview','publish_private_complete',
        'publish_catalog_complete','delete_workspace'
      )),
      check(payload_hash ~ '^[a-f0-9]{64}$'),
      check(jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536)
    );
    create table private.authoring_workspace_events(
      id bigint generated always as identity primary key,
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      unique(workspace_id,revision),
      constraint authoring_workspace_events_operation_v5 check(operation in (
        'create','create_structure','update_metadata','save_microsequence_cards',
        'save_card','update_brief','copy_entity','rename_entity','move_entity',
        'delete_entity','merge_microsequences','split_microsequence',
        'promote_module','demote_course','import_course'
      )),
      check(jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 32768)
    );
    create function private.require_educational_workspace_capability_v1(
      uuid,uuid,text
    ) returns text language plpgsql as $$
      begin
         if $2 not in ('${ACTOR}'::uuid,'${AUTHOR_ONLY}'::uuid) then
           raise exception 'Capability ausente.' using errcode='42501';
         end if;
         if $2 = '${AUTHOR_ONLY}'::uuid and $3 = 'manage' then
           raise exception 'Capability manage ausente.' using errcode='42501';
         end if;
        return $3;
      end
    $$;
    create function private.prune_authoring_workspace_state_v5(uuid,text)
    returns void language sql as $$ select $$;
    create function public.replay_authoring_workspace_request_v5(
      p_owner_id uuid,p_request_id text,p_payload_hash text,p_operation text
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,private as $$
      declare v_request private.authoring_workspace_requests%rowtype;
      begin
        select * into v_request from private.authoring_workspace_requests request
        where request.owner_id=p_owner_id and request.request_id=p_request_id;
        if not found then return null; end if;
        if v_request.payload_hash<>p_payload_hash
           or v_request.operation<>p_operation then
          raise exception 'requestId reutilizado com dados diferentes.'
            using errcode='23505';
        end if;
        return v_request.result || jsonb_build_object('idempotent',true);
      end
    $$;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path = pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260812164000',
        'contractVersion',1,
        'features','["flat-runtime-manifest-v1"]'::jsonb
      )
    $$;

    insert into auth.users(id) values('${ACTOR}'),('${AUTHOR_ONLY}');
    insert into private.authoring_workspaces(id,owner_id,title)
    values('${WORKSPACE}','${ACTOR}','Workspace legado');
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ('${WORKSPACE}','project','project-a',null,null,0,'{}'),
      ('${WORKSPACE}','course','course-a','project','project-a',0,'{}'),
      ('${WORKSPACE}','module','module-a','course','course-a',0,'{}'),
      ('${WORKSPACE}','lesson','lesson-a','module','module-a',0,'{}'),
      ('${WORKSPACE}','microsequence','micro-a','lesson','lesson-a',0,'{}'),
      ('${WORKSPACE}','microsequence','micro-legacy','lesson','lesson-a',1,'{}'),
      ('${WORKSPACE}','card','card-legacy','microsequence','micro-legacy',0,
       '{"kind":"theory","text":"Conteúdo anterior à parametrização."}');
  `);
  const migration = await fs.readFile(migrationUrl, "utf8");
  await database.exec(migration);
  const blueprintArtifactMigration = await fs.readFile(
    blueprintArtifactMigrationUrl,
    "utf8"
  );
  await database.exec(blueprintArtifactMigration);
  await database.exec(`
    create table private.authoring_workspace_observations(
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      author_id uuid references auth.users(id) on delete set null,
      entity_type text not null,
      entity_path text[] not null default '{}',
      resource_target_id text,
      body text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      kind text not null default 'note',
      category text,
      severity text,
      status text,
      proposed_repair text,
      audit_revision bigint,
      audit_part_id text,
      pending_correction_request_id text,
      pending_revision bigint,
      correction_request_id text,
      resulting_revision bigint,
      verification text,
      verified_revision bigint,
      constraint authoring_workspace_observations_lifecycle_v1 check(true)
    );
    create function private.prune_authoring_workspace_terminal_findings_v1(uuid)
    returns void language sql as $$ select $$;
    create function private.authoring_audit_target_in_part_v1(
      uuid,jsonb,text,text[]
    ) returns boolean language sql stable as $$ select true $$;
    create function private.authoring_observation_target_exists_v1(
      p_workspace_id uuid,p_entity_type text,p_entity_path text[],
      p_resource_target_id text
    ) returns boolean language sql stable as $$
      select case when p_entity_type='workspace' then cardinality(p_entity_path)=0
        else exists (
          select 1 from private.authoring_workspace_entities entity
          where entity.workspace_id=p_workspace_id
            and entity.entity_type=case when p_entity_type='resource'
              then 'card' else p_entity_type end
            and entity.entity_id=p_entity_path[cardinality(p_entity_path)]
        ) end
    $$;
    create function private.current_authoring_observation_path_v1(
      uuid,text,text[]
    ) returns text[] language sql stable as $$ select $3 $$;
    create function private.authoring_observation_target_available_v1(
      p_workspace_id uuid,p_entity_type text,p_entity_path text[],
      p_resource_target_id text
    ) returns boolean language sql stable as $$
      select case when p_entity_type='workspace' then exists (
          select 1 from private.authoring_workspaces workspace
          where workspace.id=p_workspace_id and workspace.deleted_at is null
        ) else exists (
          select 1 from private.authoring_workspace_entities entity
          where entity.workspace_id=p_workspace_id
            and entity.entity_type=case when p_entity_type='resource'
              then 'card' else p_entity_type end
            and entity.entity_id=p_entity_path[cardinality(p_entity_path)]
        ) end
    $$;
    create function private.educational_workspace_can_v1(
      uuid,uuid,text
    ) returns boolean language sql stable as $$ select true $$;
    create function private.discard_authoring_workspace_v1(
      p_workspace_id uuid
    ) returns void language plpgsql security definer as $$
      begin
        delete from private.authoring_workspace_observations
        where workspace_id=p_workspace_id;
        update private.authoring_workspaces
        set deleted_at=now(),authoring_state='{"decisions":[]}'::jsonb
        where id=p_workspace_id;
      end
    $$;
    create function public.update_authoring_workspace_continuity_v1(
      p_actor_id uuid,p_workspace_id uuid,p_request_id text,p_payload_hash text,
      p_expected_revision bigint,p_operation text,p_state jsonb
    ) returns jsonb language plpgsql security definer as $$
      begin
        update private.authoring_workspaces
        set authoring_state=p_state,revision=p_expected_revision+1
        where id=p_workspace_id and revision=p_expected_revision;
        if not found then
          raise exception 'Revisão base desatualizada.' using errcode='40001';
        end if;
        insert into private.authoring_workspace_requests(
          owner_id,request_id,operation,payload_hash,workspace_id,result
        ) values(
          p_actor_id,p_request_id,'update_continuity',p_payload_hash,
          p_workspace_id,jsonb_build_object(
            'workspaceId',p_workspace_id,'revision',p_expected_revision+1,
            'continuityOperation',p_operation,'idempotent',false
          )
        );
        return jsonb_build_object(
          'workspaceId',p_workspace_id,'revision',p_expected_revision+1,
          'continuityOperation',p_operation,'idempotent',false
        );
      end
    $$;
    create function public.manage_authoring_workspace_finding_v1(
      p_actor_id uuid,p_workspace_id uuid,p_request_id text,p_payload_hash text,
      p_expected_revision bigint,p_operation text,p_payload jsonb
    ) returns jsonb language plpgsql security definer as $$
      declare v_result jsonb;
      begin
        if p_operation='delete' then
          delete from private.authoring_workspace_observations
          where workspace_id=p_workspace_id
            and id=(p_payload->>'findingId')::uuid;
        elsif p_operation='decide' then
          update private.authoring_workspace_observations
          set status=case when p_payload->>'decision'='approve'
                then 'approved' else 'rejected' end,
              verification=null,verified_revision=null,updated_at=now()
          where workspace_id=p_workspace_id
            and id=(p_payload->>'findingId')::uuid;
        end if;
        update private.authoring_workspaces
        set revision=p_expected_revision+1
        where id=p_workspace_id;
        v_result := jsonb_build_object(
          'workspaceId',p_workspace_id,'revision',p_expected_revision + 1,
          'findingOperation',p_operation
        );
        insert into private.authoring_workspace_requests(
          owner_id,request_id,operation,payload_hash,workspace_id,result
        ) values(
          p_actor_id,p_request_id,case p_operation
            when 'create' then 'create_finding'
            when 'decide' then 'decide_finding'
            when 'link_correction' then 'link_finding_correction'
            when 'verify' then 'verify_finding'
            when 'delete' then 'delete_finding'
          end,p_payload_hash,p_workspace_id,v_result
        );
        return v_result;
      end
    $$;
    create function private.list_authoring_workspace_observations_v1(
      p_actor_id uuid,p_workspace_id uuid,p_limit integer default 20,
      p_before_updated_at timestamptz default null,p_before_id uuid default null,
      p_entity_types text[] default null,p_kinds text[] default null,
      p_statuses text[] default null
    ) returns jsonb language sql security definer as $$
      select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
        'observationId', page.id,
        'proposedRepair', page.proposed_repair,
        'canDelete', page.author_id = p_actor_id
          or private.educational_workspace_can_v1(
            p_workspace_id, p_actor_id, 'review'
          ),
        'updatedAt', page.updated_at
      )), '[]'::jsonb))
      from (
        select * from private.authoring_workspace_observations observation
        where observation.workspace_id=p_workspace_id
        order by observation.updated_at desc,observation.id desc
        limit p_limit
      ) page
    $$;
    create function public.get_authoring_workspace_continuity_v1(
      p_actor_id uuid,p_workspace_id uuid
    ) returns jsonb language sql security definer as $$
      select jsonb_build_object(
        'workspaceId',p_workspace_id,
        'activeFindings',coalesce(jsonb_agg(jsonb_build_object(
          'findingId',page.id,
          'proposedRepair',page.proposed_repair,
          'updatedAt',page.updated_at
        )), '[]'::jsonb)
      )
      from (
        select * from private.authoring_workspace_observations observation
        where observation.workspace_id=p_workspace_id
          and observation.kind='audit_finding'
          and observation.status in ('open','approved','repaired')
        order by observation.updated_at desc,observation.id desc
        limit 10
      ) page
    $$;
    create or replace function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260815233000',
        'contractVersion',1,
        'features','["flat-runtime-manifest-v1","parameterized-authoring-design-v1","authoring-blueprint-artifact-receipt-v1","authoring-product-state-projection-v1"]'::jsonb
      )
    $$;
  `);
  await database.exec(await fs.readFile(auditMigrationUrl, "utf8"));
  if (applyTaskOperationCutover) {
    await database.exec(await fs.readFile(taskOperationMigrationUrl, "utf8"));
  }
  return database;
}

export async function saveAnalysis(database, revision = 1, overrides = {}) {
  const analysis = analysisPayload(revision, overrides);
  const payloadHash = await mutationHash(
    database, "save_instructional_analysis", analysis
  );
  return scalar(database, `
    select public.save_authoring_instructional_analysis_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR,
    WORKSPACE,
    `analysis:request:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(analysis)
  ]);
}

export async function saveResourceSet(database, revision, {
  id = "resource-set-a",
  version = "1.0.0",
  scope = { kind: "workspace", ref: WORKSPACE },
  packages = [{
    packageId: "aralearn.resource.concept_map",
    version: "1.0.0"
  }],
  allowedFits = ["canonical", "versatile", "substitute"],
  noAdequateRepresentation = "block"
} = {}) {
  const resourceSet = {
    contract: "ResourceSet@1",
    modelVersion: "1.0.0",
    id,
    version,
    scope,
    packages,
    resolvedCatalogVersion: "1.0.0",
    facetBasis: {
      catalogVersion: "1.0.0",
      families: ["relationships"],
      disciplines: [],
      structures: ["network"],
      taskOperations: ["compare"],
      practiceModalities: []
    },
    selectionConstraints: {
      allowedFits,
      allowEmbeddedPractice: false,
      allowResponsePackages: false,
      onNoAdequateRepresentation: noAdequateRepresentation
    },
    provenanceRefs: ["condition:a"]
  };
  const payloadHash = await mutationHash(database, "save_resource_set", resourceSet);
  return scalar(database, `
    select public.save_authoring_resource_set_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR,
    WORKSPACE,
    `resource-set:${id}:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(resourceSet)
  ]);
}

export async function setAssignment(database, revision, {
  id,
  version = "1.0.0",
  parameterId,
  scope,
  mode = "auto",
  value,
  requestSuffix = id,
  actor = ACTOR
}) {
  const authority = mode === "research_lock"
    ? { kind: "research_protocol", actorRef: "protocol:a", locked: true }
    : mode === "manual_override"
      ? { kind: "author", actorRef: actor, locked: false }
      : { kind: "gpt", actorRef: null, locked: false };
  const assignment = {
    contract: "DesignParameterAssignment@1",
    modelVersion: "1.0.0",
    id,
    version,
    definitionRef: { id: parameterId, version: "1.0.0" },
    scope,
    mode,
    value,
    authority,
    rationale: `Valor ${mode} para ${parameterId}.`,
    provenanceRefs: [`test:${requestSuffix}`]
  };
  const payloadHash = await mutationHash(
    database, "set_design_parameter", assignment
  );
  return scalar(database, `
    select public.manage_authoring_design_parameter_assignment_v1(
      $1,$2,$3,$4,$5,'set',$6::jsonb
    ) value
  `, [
    actor,
    WORKSPACE,
    `parameter:set:${requestSuffix}:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(assignment)
  ]);
}

async function removeAssignment(database, revision, {
  id,
  version,
  parameterId,
  scope,
  requestSuffix = id
}) {
  const assignment = {
    id,
    version,
    definitionRef: { id: parameterId, version: "1.0.0" },
    scope,
    rationale: "Restaurar herança.",
    provenanceRefs: ["author:restore-auto"]
  };
  const payloadHash = await mutationHash(
    database, "remove_design_parameter", assignment
  );
  return scalar(database, `
    select public.manage_authoring_design_parameter_assignment_v1(
      $1,$2,$3,$4,$5,'remove',$6::jsonb
    ) value
  `, [
    ACTOR,
    WORKSPACE,
    `parameter:remove:${requestSuffix}:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(assignment)
  ]);
}

export const MICRO_SCOPE = Object.freeze({ kind: "microsequence", ref: "micro-a" });
export const PARAMETER_VALUES = Object.freeze([
  ["new_units_per_theory_step_ceiling", { kind: "integer", value: 2 }],
  ["simultaneous_new_units_per_coordination_set_ceiling", { kind: "integer", value: 2 }],
  ["applicable_explanation_requirement_refs", {
    kind: "set", values: ["explanation:b", "explanation:a"]
  }],
  ["evidence_alignment_relation", {
    kind: "relation",
    nodes: ["unit:a", "evidence:a"],
    edges: [{ from: "unit:a", to: "evidence:a", kind: "supports" }]
  }],
  ["distinct_practice_opportunities_per_evidence_requirement", {
    kind: "range", minimum: 1, maximum: 2
  }],
  ["practice_variation_dimensions", {
    kind: "vector",
    components: [{ dimension: "context", value: "varied", unit: "category" }]
  }],
  ["accepted_performance_forms", {
    kind: "set", values: ["explanation_with_example"]
  }]
]);

test("corte de operações-alvo converte dados existentes sem leitura dupla", async () => {
  const database = await setupDatabase({ applyTaskOperationCutover: false });
  try {
    const currentAnalysis = analysisPayload(1, {
      objective: UNRELATED_TECHNICAL_OPERATION_ID,
      representationRequirements: [{
        id: "representation:a",
        targetUnitRefs: ["unit:a"],
        structures: ["prose"],
        taskOperations: ["task_operation.compare"],
        acceptableFits: ["canonical"],
        rationale: "A comparação precisa permanecer observável na tarefa."
      }]
    });
    const legacyAnalysis = structuredClone(currentAnalysis);
    for (const requirement of legacyAnalysis.evidenceRequirements) {
      requirement[LEGACY_EVIDENCE_OPERATION_KEY] = requirement.taskOperation;
      delete requirement.taskOperation;
    }
    for (const requirement of legacyAnalysis.representationRequirements) {
      requirement[LEGACY_TASK_OPERATIONS_KEY] = requirement.taskOperations.map((value) => (
        value.replace(/^task_operation\./u, LEGACY_TASK_OPERATION_ID_PREFIX)
      ));
      delete requirement.taskOperations;
    }
    await scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,$3,$4,1,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      "legacy-analysis-request",
      await mutationHash(database, "save_instructional_analysis", legacyAnalysis),
      JSON.stringify(legacyAnalysis)
    ]);

    const legacyResourceSet = {
      contract: "ResourceSet@1",
      modelVersion: "1.0.0",
      id: "legacy-resource-set",
      version: "1.0.0",
      scope: { kind: "workspace", ref: WORKSPACE },
      packages: [{
        packageId: "aralearn.resource.concept_map",
        version: "1.0.0"
      }],
      resolvedCatalogVersion: "legacy-catalog",
      facetBasis: {
        catalogVersion: "legacy-catalog",
        families: ["relationships"],
        disciplines: [],
        structures: ["network"],
        [LEGACY_TASK_OPERATIONS_KEY]: [`${LEGACY_TASK_OPERATION_ID_PREFIX}compare`],
        practiceModalities: []
      },
      selectionConstraints: {
        allowedFits: ["canonical"],
        allowEmbeddedPractice: false,
        allowResponsePackages: false,
        onNoAdequateRepresentation: "block"
      },
      provenanceRefs: [UNRELATED_TECHNICAL_OPERATION_ID]
    };
    await scalar(database, `
      select public.save_authoring_resource_set_v1(
        $1,$2,$3,$4,2,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      "legacy-resource-set-request",
      await mutationHash(database, "save_resource_set", legacyResourceSet),
      JSON.stringify(legacyResourceSet)
    ]);

    const legacyBlueprint = pedagogicalBlueprintV2();
    legacyBlueprint.contentDemands[0].description = UNRELATED_TECHNICAL_OPERATION_ID;
    for (const demand of legacyBlueprint.contentDemands) {
      demand[LEGACY_TASK_OPERATIONS_KEY] = demand.taskOperations;
      delete demand.taskOperations;
    }
    for (const step of [
      ...legacyBlueprint.theorySteps,
      ...legacyBlueprint.practiceSteps
    ]) {
      step[LEGACY_TASK_OPERATION_KEY] = step.taskOperation;
      delete step.taskOperation;
    }
    const legacyBlueprintHash = await scalar(database, `
      select private.authoring_design_json_hash_v1($1::jsonb) value
    `, [JSON.stringify(legacyBlueprint)]);
    await database.query(`
      insert into private.authoring_effective_design_snapshots(
        workspace_id,snapshot_id,snapshot_version,model_version,
        scope_kind,scope_ref,scope_path,scope_entity_version,
        analysis_id,analysis_version,parameter_catalog_version,
        resolution_version,based_on_workspace_revision,created_revision,
        payload_hash,frozen_at,created_by
      ) values(
        $1,'legacy-snapshot','1.0.0','1.0.0',
        'microsequence','micro-a',array['course-a','module-a','lesson-a','micro-a'],1,
        'analysis-a','1.0.0','1.0.0','1.0.0',3,4,$2,now(),$3
      )
    `, [WORKSPACE, hash("d"), ACTOR]);
    await database.query(`
      insert into private.authoring_pedagogical_blueprints(
        workspace_id,blueprint_id,blueprint_version,contract_version,
        model_version,microsequence_ref,scope_path,scope_entity_version,
        analysis_id,analysis_version,snapshot_id,snapshot_version,
        based_on_workspace_revision,created_revision,payload,payload_hash,
        created_by
      ) values(
        $1,'legacy-blueprint','1.0.0',2,'1.0.0','micro-a',
        array['course-a','module-a','lesson-a','micro-a'],1,
        'analysis-a','1.0.0','legacy-snapshot','1.0.0',3,4,$2::jsonb,$3,$4
      )
    `, [WORKSPACE, JSON.stringify(legacyBlueprint), legacyBlueprintHash, ACTOR]);
    const legacyManifest = {
      contract: "MaterializationManifest@1",
      id: "legacy-manifest",
      version: "1.0.0",
      blueprintHash: legacyBlueprintHash,
      resourceSelections: [{
        rationale: UNRELATED_TECHNICAL_OPERATION_ID
      }]
    };
    const legacyManifestHash = await scalar(database, `
      select private.authoring_design_json_hash_v1($1::jsonb) value
    `, [JSON.stringify(legacyManifest)]);
    await database.query(`
      insert into private.authoring_materialization_manifests(
        workspace_id,manifest_id,manifest_version,model_version,
        scope_kind,scope_ref,scope_path,scope_entity_version,
        analysis_id,analysis_version,snapshot_id,snapshot_version,
        blueprint_id,blueprint_version,materialized_workspace_revision,
        materialization_state_revision,created_revision,content_hash,
        blueprint_hash,payload,payload_hash,declared_created_at,created_by
      ) values(
        $1,'legacy-manifest','1.0.0','1.0.0','microsequence','micro-a',
        array['course-a','module-a','lesson-a','micro-a'],1,
        'analysis-a','1.0.0','legacy-snapshot','1.0.0',
        'legacy-blueprint','1.0.0',4,0,5,$2,$3,$4::jsonb,$5,now(),$6
      )
    `, [
      WORKSPACE,
      hash("c"),
      legacyBlueprintHash,
      JSON.stringify(legacyManifest),
      legacyManifestHash,
      ACTOR
    ]);
    await database.query(`
      insert into private.authoring_workspace_requests(
        owner_id,request_id,operation,payload_hash,workspace_id,result
      ) values
        ($1,'legacy-blueprint-request','save_pedagogical_blueprint',$2,$3,$4::jsonb),
        ($1,'legacy-manifest-request','register_materialization_manifest',$5,$3,$6::jsonb)
    `, [
      ACTOR,
      hash("b"),
      WORKSPACE,
      JSON.stringify({
        blueprintRef: { id: "legacy-blueprint", version: "1.0.0" },
        blueprintHash: legacyBlueprintHash
      }),
      hash("e"),
      JSON.stringify({
        manifestRef: { id: "legacy-manifest", version: "1.0.0" },
        payloadHash: legacyManifestHash
      })
    ]);
    const unrelatedTechnicalText = [
      "A documentação de um sistema alheio usa",
      `${UNRELATED_TECHNICAL_OPERATION_ID}.`
    ].join(" ");
    await database.query(`
      update private.authoring_workspace_entities
      set content=jsonb_build_object('note',$2::text)
      where workspace_id=$1 and entity_type='project' and entity_id='project-a'
    `, [WORKSPACE, unrelatedTechnicalText]);

    await database.exec(await fs.readFile(taskOperationMigrationUrl, "utf8"));

    const convertedAnalysis = await scalar(database, `
      select payload value
      from private.authoring_instructional_analyses
      where workspace_id=$1 and analysis_id='analysis-a'
    `, [WORKSPACE]);
    assert.equal(
      convertedAnalysis.evidenceRequirements[0].taskOperation,
      "compare"
    );
    assert.deepEqual(
      convertedAnalysis.representationRequirements[0].taskOperations,
      ["task_operation.compare"]
    );
    assert.equal(
      convertedAnalysis.objective,
      UNRELATED_TECHNICAL_OPERATION_ID
    );
    assert.equal(
      Object.hasOwn(convertedAnalysis.evidenceRequirements[0], "operation"),
      false
    );
    assert.equal(
      Object.hasOwn(
        convertedAnalysis.representationRequirements[0],
        LEGACY_TASK_OPERATIONS_KEY
      ),
      false
    );
    assert.equal(await scalar(database, `
      select payload_hash=private.authoring_design_json_hash_v1(payload) value
      from private.authoring_instructional_analyses
      where workspace_id=$1 and analysis_id='analysis-a'
    `, [WORKSPACE]), true);

    const convertedResourceSet = await scalar(database, `
      select public.get_authoring_resource_set_v1(
        $1,$2,'legacy-resource-set','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.deepEqual(
      convertedResourceSet.facetBasis.taskOperations,
      ["task_operation.compare"]
    );
    assert.deepEqual(
      convertedResourceSet.provenanceRefs,
      [UNRELATED_TECHNICAL_OPERATION_ID]
    );
    assert.equal(
      Object.hasOwn(convertedResourceSet.facetBasis, LEGACY_TASK_OPERATIONS_KEY),
      false
    );
    assert.equal(await scalar(database, `
      select payload_hash=private.authoring_design_json_hash_v1($3::jsonb) value
      from private.authoring_resource_sets
      where workspace_id=$1 and resource_set_id=$2
    `, [WORKSPACE, "legacy-resource-set", JSON.stringify(convertedResourceSet)]), true);
    assert.equal(await scalar(database, `
      select request.result->>'payloadHash'=analysis.payload_hash value
      from private.authoring_workspace_requests request
      join private.authoring_instructional_analyses analysis
        on analysis.workspace_id=request.workspace_id
      where request.owner_id=$1
        and request.request_id='legacy-analysis-request'
        and analysis.analysis_id='analysis-a'
    `, [ACTOR]), true);
    assert.equal(await scalar(database, `
      select request.result->>'payloadHash'=resource_set.payload_hash value
      from private.authoring_workspace_requests request
      join private.authoring_resource_sets resource_set
        on resource_set.workspace_id=request.workspace_id
      where request.owner_id=$1
        and request.request_id='legacy-resource-set-request'
        and resource_set.resource_set_id='legacy-resource-set'
    `, [ACTOR]), true);

    const convertedBlueprint = await scalar(database, `
      select payload value
      from private.authoring_pedagogical_blueprints
      where workspace_id=$1 and blueprint_id='legacy-blueprint'
    `, [WORKSPACE]);
    assert.deepEqual(convertedBlueprint.contentDemands[0].taskOperations, ["compare"]);
    assert.equal(
      convertedBlueprint.contentDemands[0].description,
      UNRELATED_TECHNICAL_OPERATION_ID
    );
    assert.equal(convertedBlueprint.theorySteps[0].taskOperation, "compare");
    assert.equal(convertedBlueprint.practiceSteps[0].taskOperation, "compare");
    assert.equal(
      Object.hasOwn(convertedBlueprint.contentDemands[0], LEGACY_TASK_OPERATIONS_KEY),
      false
    );
    assert.equal(
      Object.hasOwn(convertedBlueprint.theorySteps[0], LEGACY_TASK_OPERATION_KEY),
      false
    );
    const convertedBlueprintHash = await scalar(database, `
      select payload_hash value
      from private.authoring_pedagogical_blueprints
      where workspace_id=$1 and blueprint_id='legacy-blueprint'
        and payload_hash=private.authoring_design_json_hash_v1(payload)
    `, [WORKSPACE]);
    assert.match(convertedBlueprintHash, /^[a-f0-9]{64}$/u);
    assert.notEqual(convertedBlueprintHash, legacyBlueprintHash);
    assert.equal(await scalar(database, `
      select blueprint_hash=$2
        and payload->>'blueprintHash'=$2
        and payload#>>'{resourceSelections,0,rationale}'=$3
        and payload_hash=private.authoring_design_json_hash_v1(payload) value
      from private.authoring_materialization_manifests
      where workspace_id=$1 and manifest_id='legacy-manifest'
    `, [
      WORKSPACE,
      convertedBlueprintHash,
      UNRELATED_TECHNICAL_OPERATION_ID
    ]), true);
    assert.equal(await scalar(database, `
      select result->>'blueprintHash'=$2 value
      from private.authoring_workspace_requests
      where owner_id=$1 and request_id='legacy-blueprint-request'
    `, [ACTOR, convertedBlueprintHash]), true);
    assert.equal(await scalar(database, `
      select request.result->>'payloadHash'=manifest.payload_hash value
      from private.authoring_workspace_requests request
      join private.authoring_materialization_manifests manifest
        on manifest.workspace_id=request.workspace_id
      where request.owner_id=$1
        and request.request_id='legacy-manifest-request'
        and manifest.manifest_id='legacy-manifest'
    `, [ACTOR]), true);
    assert.equal(await scalar(database, `
      select bool_and(operation in (
        'save_instructional_analysis','save_resource_set',
        'save_pedagogical_blueprint','register_materialization_manifest'
      )) value
      from private.authoring_workspace_requests
      where owner_id=$1 and request_id like 'legacy-%-request'
    `, [ACTOR]), true);
    assert.equal(await scalar(database, `
      select to_regprocedure(
        'private.authoring_task_operation_cutover_json_v1(jsonb)'
      ) is null value
    `), true);
    assert.equal(await scalar(database, `
      select content->>'note' value
      from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='project' and entity_id='project-a'
    `, [WORKSPACE]), unrelatedTechnicalText);

    assert.equal(await scalar(database, `
      select private.valid_authoring_instructional_analysis_v1($1::jsonb) value
    `, [JSON.stringify(convertedAnalysis)]), true);
    assert.equal(await scalar(database, `
      select private.valid_authoring_instructional_analysis_v1($1::jsonb) value
    `, [JSON.stringify(legacyAnalysis)]), false);
    const manifest = await scalar(database, `
      select public.get_aralearn_runtime_manifest() value
    `);
    assert.equal(manifest.schemaRevision, "20260817130000");
    assert.equal(manifest.features.includes("task-operation-terminology-v1"), true);
    await assert.rejects(database.exec(`
      update private.authoring_instructional_analyses set payload=payload
    `), /versionados de desenho são imutáveis/iu);
    await assert.rejects(
      database.exec(await fs.readFile(taskOperationMigrationUrl, "utf8")),
      /já foi aplicado/iu
    );
  } finally {
    await database.close();
  }
});

test("migration instala desenho parametrizado aditivo e preserva dados existentes", async () => {
  const database = await setupDatabase();
  try {
    const catalogCount = await scalar(database, `
      select count(*)::integer value
      from private.authoring_design_parameter_definitions
    `);
    assert.equal(catalogCount, 9);
    const storedCatalog = await database.query(`
      select definition
      from private.authoring_design_parameter_definitions
      order by parameter_id
    `);
    assert.deepEqual(
      storedCatalog.rows.map(({ definition }) => definition),
      [...DESIGN_PARAMETER_CATALOG].sort((left, right) => (
        left.id.localeCompare(right.id, "en")
      ))
    );
    const manifest = await scalar(database, `
      select public.get_aralearn_runtime_manifest() value
    `);
    assert.equal(manifest.schemaRevision, "20260817130000");
    assert.equal(manifest.features.includes("flat-runtime-manifest-v1"), true);
    assert.equal(
      manifest.features.includes("parameterized-authoring-design-v1"),
      true
    );
    assert.equal(
      manifest.features.includes("authoring-blueprint-artifact-receipt-v1"),
      true
    );
    assert.equal(
      manifest.features.includes("authoring-design-conformance-audit-v1"),
      true
    );
    assert.equal(
      manifest.features.includes("task-operation-terminology-v1"),
      true
    );
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'private.canonical_authoring_parameter_value_v1(jsonb)',
        'EXECUTE'
      ) value
    `), false);
    const state = await scalar(database, `
      select public.get_authoring_design_state_v1($1,$2,'microsequence','micro-a') value
    `, [ACTOR, WORKSPACE]);
    assert.equal(state.analysisState, "unresolved");
    assert.equal(state.effectiveDesignState, "unresolved");
    assert.equal(state.materializationState, "unresolved");
    assert.equal(state.resourceAvailabilityState, "unresolved");
    const legacyState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-legacy'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(legacyState.materializationState, "legacy_untracked");
    assert.equal(legacyState.resourceAvailabilityState, "legacy_unrestricted");
    await database.exec(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ('${WORKSPACE}','microsequence','micro-post-cutover',
         'lesson','lesson-a',2,'{}'),
        ('${WORKSPACE}','card','card-post-cutover',
         'microsequence','micro-post-cutover',0,
         '{"kind":"theory","text":"Conteúdo ainda sem manifesto."}')
    `);
    const postCutoverUntracked = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-post-cutover'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(postCutoverUntracked.materializationState, "legacy_untracked");
    assert.equal(
      postCutoverUntracked.resourceAvailabilityState,
      "legacy_unrestricted"
    );
    await assert.rejects(scalar(database, `
      select public.get_authoring_design_state_v1(
        '10000000-0000-4000-8000-000000000099',$1,
        'microsequence','micro-a'
      ) value
    `, [WORKSPACE]), (error) => error.code === "42501");

    const operations = await database.query(`
      select conname, pg_get_constraintdef(oid) definition
      from pg_constraint
      where conname in (
        'authoring_workspace_requests_operation_v5',
        'authoring_workspace_events_operation_v5'
      )
      order by conname
    `);
    assert.equal(operations.rows.length, 2);
    for (const { definition } of operations.rows) {
      for (const operation of [
        "replace_catalog_document",
        "update_continuity",
        "save_instructional_analysis",
        "register_materialization_manifest",
        "run_authoring_audit",
        "record_authoring_semantic_audit"
      ]) {
        assert.match(definition, new RegExp(operation));
      }
    }
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'public.manage_authoring_workspace_finding_before_audit_runs_v1(uuid,uuid,text,text,bigint,text,jsonb)',
        'EXECUTE'
      ) value
    `), false);
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'public.register_authoring_audit_run_v1(uuid,uuid,text,text,bigint,jsonb)',
        'EXECUTE'
      ) value
    `), true);
  } finally {
    await database.close();
  }
});

test("continuidade aceita extensões normativas e rejeita vínculos incompletos", async () => {
  const database = await setupDatabase();
  try {
    const valid = {
      decisions: [{
        id: "decision-a",
        summary: "Usar representação canônica.",
        entityType: "microsequence",
        entityId: "micro-a",
        representationSelection: {
          intent: "Comparar relações.",
          chosen: {
            packageId: "aralearn.resource.concept_map",
            version: "1.0.0"
          },
          fit: "canonical",
          catalogVersion: "1.0.0",
          limitations: []
        },
        pedagogicalDiagnosis: {
          difficultyResponses: [{
            difficulty: "Confundir direção.",
            response: "Contrastar exemplos."
          }]
        }
      }]
    };
    await database.query(`
      update private.authoring_workspaces set authoring_state=$2::jsonb where id=$1
    `, [WORKSPACE, JSON.stringify(valid)]);
    const invalid = structuredClone(valid);
    delete invalid.decisions[0].entityId;
    await assert.rejects(database.query(`
      update private.authoring_workspaces set authoring_state=$2::jsonb where id=$1
    `, [WORKSPACE, JSON.stringify(invalid)]), (error) => error.code === "23514");
  } finally {
    await database.close();
  }
});

test("análise usa capability, CAS, receipt idempotente e bloqueia CoT", async () => {
  const database = await setupDatabase();
  try {
    const analysis = analysisPayload();
    const analysisHash = await mutationHash(
      database, "save_instructional_analysis", analysis
    );
    const result = await scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0001',$3,1,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, analysisHash, JSON.stringify(analysis)]);
    assert.equal(result.revision, 2);
    assert.equal(result.idempotent, false);
    const preflightReplay = await scalar(database, `
      select public.replay_authoring_workspace_request_v5(
        $1,'analysis:request:0001',$2,'save_instructional_analysis'
      ) value
    `, [ACTOR, analysisHash]);
    assert.equal(preflightReplay.idempotent, true);
    assert.equal(preflightReplay.revision, 2);
    const replay = await scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0001',$3,1,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, analysisHash, JSON.stringify(analysis)]);
    assert.equal(replay.idempotent, true);
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0001',$3,2,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, analysisHash, JSON.stringify({
      ...analysis,
      objective: "Payload diferente não pode reaproveitar receipt."
    })]), (error) => error.code === "23505");
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:hash-mismatch',$3,2,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, "invalid", JSON.stringify({
      ...analysis,
      id: "analysis-hash-mismatch"
    })]), (error) => error.code === "22023");
    const cotAnalysis = {
      ...analysis,
      id: "analysis-cot",
      chainOfThought: "raciocínio privado"
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0002',$3,2,$4::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_instructional_analysis", cotAnalysis),
      JSON.stringify(cotAnalysis)
    ]), (error) => error.code === "22023");
    const promptAnalysis = {
      ...analysis,
      id: "analysis-prompt",
      provenance: { System_Prompt: "não persistir" },
      CHAT_messages: ["não persistir"]
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0003',$3,2,$4::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_instructional_analysis", promptAnalysis),
      JSON.stringify(promptAnalysis)
    ]), (error) => error.code === "22023");
    const missingContract = structuredClone(analysis);
    delete missingContract.contract;
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:missing-contract',$3,2,$4::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_instructional_analysis", missingContract),
      JSON.stringify(missingContract)
    ]), (error) => error.code === "22023");
    const receiptSize = await scalar(database, `
      select pg_column_size(result)::integer value
      from private.authoring_workspace_requests
      where owner_id=$1 and request_id='analysis:request:0001'
    `, [ACTOR]);
    assert.ok(receiptSize < 2_048);
  } finally {
    await database.close();
  }
});

test("override manual restaura Auto e locks redundantes preservam o bloqueador aplicável", async () => {
  const database = await setupDatabase();
  try {
    let revision = 1;
    await setAssignment(database, revision++, {
      id: "fallback-auto-micro",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE,
      value: { kind: "enum", value: "block" }
    });
    for (const [parameterId, value] of PARAMETER_VALUES) {
      await setAssignment(database, revision++, {
        id: `lock-test-${parameterId}`,
        parameterId,
        scope: MICRO_SCOPE,
        value
      });
    }
    await setAssignment(database, revision++, {
      id: "lock-test-available-resource-sets",
      parameterId: "available_resource_set_refs",
      scope: MICRO_SCOPE,
      value: { kind: "set", values: [] }
    });
    await setAssignment(database, revision++, {
      id: "fallback-manual-micro",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE,
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const overridden = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(overridden.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    )).resolution.assignmentRef.id, "fallback-manual-micro");
    await removeAssignment(database, revision++, {
      id: "fallback-manual-micro",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE
    });
    const restored = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(restored.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    )).resolution.assignmentRef.id, "fallback-auto-micro");
    await setAssignment(database, revision++, {
      id: "fallback-manual-course-priority",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const inheritedManual = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const inheritedFallback = inheritedManual.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    ));
    assert.equal(inheritedFallback.resolution.assignmentRef.id, (
      "fallback-manual-course-priority"
    ));
    assert.equal(inheritedFallback.resolution.inheritance, "inherited");
    await removeAssignment(database, revision++, {
      id: "fallback-manual-course-priority",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" }
    });

    await setAssignment(database, revision++, {
      id: "explanations-lock-micro",
      parameterId: "applicable_explanation_requirement_refs",
      scope: MICRO_SCOPE,
      mode: "research_lock",
      value: { kind: "set", values: ["explanation:b", "explanation:a"] }
    });
    await setAssignment(database, revision++, {
      id: "explanations-lock-micro",
      version: "2.0.0",
      parameterId: "applicable_explanation_requirement_refs",
      scope: MICRO_SCOPE,
      mode: "research_lock",
      value: { kind: "set", values: ["explanation:a", "explanation:b"] },
      requestSuffix: "explanations-lock-micro-v2"
    });
    const canonicalLocks = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(canonicalLocks.status, "resolved");
    assert.deepEqual(canonicalLocks.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "applicable_explanation_requirement_refs"
    )).value.values, ["explanation:a", "explanation:b"]);

    await setAssignment(database, revision++, {
      id: "fallback-lock-workspace",
      parameterId: "representation_fallback_policy",
      scope: { kind: "workspace", ref: WORKSPACE },
      mode: "research_lock",
      value: { kind: "enum", value: "block" }
    });
    await assert.rejects(setAssignment(database, revision, {
      id: "fallback-lock-workspace",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: { kind: "workspace", ref: WORKSPACE },
      mode: "manual_override",
      value: { kind: "enum", value: "block" },
      actor: AUTHOR_ONLY,
      requestSuffix: "lock-author-downgrade"
    }), (error) => error.code === "42501");
    await assert.rejects(setAssignment(database, revision, {
      id: "fallback-lock-workspace",
      version: "2.0.1",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "block" },
      actor: AUTHOR_ONLY,
      requestSuffix: "lock-author-move"
    }), (error) => error.code === "42501");
    await assert.rejects(setAssignment(database, revision, {
      id: "fallback-lock-workspace",
      version: "2.0.2",
      parameterId: "available_resource_set_refs",
      scope: { kind: "workspace", ref: WORKSPACE },
      mode: "manual_override",
      value: { kind: "set", values: [] },
      actor: AUTHOR_ONLY,
      requestSuffix: "lock-author-definition"
    }), (error) => error.code === "42501");
    await setAssignment(database, revision++, {
      id: "fallback-lock-lesson",
      parameterId: "representation_fallback_policy",
      scope: { kind: "lesson", ref: "lesson-a" },
      mode: "research_lock",
      value: { kind: "enum", value: "block" }
    });
    await setAssignment(database, revision++, {
      id: "fallback-manual-course",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const nestedLocks = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const courseConflict = nestedLocks.conflicts.find((conflict) => (
      conflict.code === "research_lock_blocks_lower_assignment"
      && conflict.blockedAssignmentRef.id === "fallback-manual-course"
    ));
    assert.equal(nestedLocks.status, "conflict");
    assert.equal(courseConflict.lockAssignmentRef.id, "fallback-lock-workspace");
  } finally {
    await database.close();
  }
});

test("marco #106 integra ResourceSet, materialização, auditoria, reparo e reauditoria", async () => {
  const database = await setupDatabase();
  try {
    await saveAnalysis(database, 1);

    await assert.rejects(saveResourceSet(database, 2, {
      id: "resource-set-duplicate",
      packages: [
        { packageId: "aralearn.resource.concept_map", version: "1.0.0" },
        { packageId: "aralearn.resource.concept_map", version: "1.0.0" }
      ]
    }), (error) => error.code === "22023");
    await saveResourceSet(database, 2, {
      scope: { kind: "lesson", ref: "lesson-a" },
      packages: [{
        packageId: "aralearn.resource.concept_map",
        version: "1.0.0"
      }, {
        packageId: "aralearn.response.choice",
        version: "1.0.0"
      }]
    });
    await saveResourceSet(database, 3, {
      id: "resource-set-record",
      scope: { kind: "lesson", ref: "lesson-a" },
      noAdequateRepresentation: "record_limitation"
    });
    const storedResourceSet = await scalar(database, `
      select public.get_authoring_resource_set_v1(
        $1,$2,'resource-set-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(storedResourceSet.scope.kind, "lesson");
    assert.equal(storedResourceSet.packages.length, 2);
    assert.equal(
      storedResourceSet.selectionConstraints.onNoAdequateRepresentation,
      "block"
    );
    await assert.rejects(database.query(`
      update private.authoring_resource_sets
      set resolved_catalog_version='2.0.0'
      where workspace_id=$1 and resource_set_id='resource-set-a'
    `, [WORKSPACE]), (error) => error.code === "55000");

    let revision = 4;
    await setAssignment(database, revision++, {
      id: "fallback-workspace",
      parameterId: "representation_fallback_policy",
      scope: { kind: "workspace", ref: WORKSPACE },
      value: { kind: "enum", value: "block" }
    });
    await assert.rejects(setAssignment(database, 3, {
      id: "fallback-cas-stale",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      value: { kind: "enum", value: "allow_versatile_with_limitation" }
    }), (error) => error.code === "40001");
    await setAssignment(database, revision++, {
      id: "fallback-course",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    await setAssignment(database, revision++, {
      id: "fallback-lesson",
      parameterId: "representation_fallback_policy",
      scope: { kind: "lesson", ref: "lesson-a" },
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    await setAssignment(database, revision++, {
      id: "fallback-micro",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE,
      mode: "manual_override",
      value: { kind: "enum", value: "block" }
    });
    await setAssignment(database, revision++, {
      id: "available-lesson",
      parameterId: "available_resource_set_refs",
      scope: { kind: "lesson", ref: "lesson-a" },
      value: {
        kind: "set",
        values: ["resource-set-record@1.0.0", "resource-set-a@1.0.0"]
      }
    });
    await assert.rejects(setAssignment(database, revision, {
      id: "invalid-duplicate-set",
      parameterId: "applicable_explanation_requirement_refs",
      scope: MICRO_SCOPE,
      value: { kind: "set", values: ["explanation:a", "explanation:a"] }
    }), (error) => error.code === "22023");
    await assert.rejects(setAssignment(database, revision, {
      id: "invalid-integer-string",
      parameterId: "new_units_per_theory_step_ceiling",
      scope: { kind: "lesson", ref: "lesson-a" },
      value: { kind: "integer", value: "2" }
    }), (error) => error.code === "22023");
    await assert.rejects(setAssignment(database, revision, {
      id: "invalid-relation-kind",
      parameterId: "evidence_alignment_relation",
      scope: MICRO_SCOPE,
      value: {
        kind: "relation",
        nodes: ["unit:a", "evidence:a"],
        edges: [{ from: "unit:a", to: "evidence:a", kind: "causes" }]
      }
    }), (error) => error.code === "22023");
    for (const [parameterId, value] of PARAMETER_VALUES) {
      await setAssignment(database, revision++, {
        id: `parameter-${parameterId}`,
        parameterId,
        scope: MICRO_SCOPE,
        value
      });
    }
    assert.equal(revision, 16);
    const nearest = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(nearest.status, "resolved");
    assert.deepEqual(
      nearest.resolutionPath.map(({ kind }) => kind),
      ["workspace", "course", "module", "lesson", "microsequence"]
    );
    assert.equal(nearest.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    )).resolution.assignmentRef.id, "fallback-micro");
    assert.equal(nearest.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "available_resource_set_refs"
    )).resolution.inheritance, "inherited");

    await setAssignment(database, revision++, {
      id: "fallback-protocol-lock",
      parameterId: "representation_fallback_policy",
      scope: { kind: "module", ref: "module-a" },
      mode: "research_lock",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const blocked = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(blocked.status, "conflict");
    assert.equal(blocked.conflicts.some(({ code }) => (
      code === "research_lock_blocks_lower_assignment"
    )), true);

    await removeAssignment(database, revision++, {
      id: "fallback-micro",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE
    });
    const locked = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(locked.status, "resolved");
    const fallback = locked.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    ));
    assert.equal(fallback.resolution.assignmentMode, "research_lock");
    assert.equal(fallback.resolution.sourceScope.kind, "module");
    await setAssignment(database, revision++, {
      id: "fallback-module-redundant",
      parameterId: "representation_fallback_policy",
      scope: { kind: "module", ref: "module-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const redundantUnderLock = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const redundantFallback = redundantUnderLock.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    ));
    assert.equal(redundantUnderLock.status, "resolved");
    assert.equal(redundantFallback.resolution.assignmentMode, "research_lock");

    const snapshotInput = {
      contract: "EffectiveDesignSnapshot@1",
      modelVersion: "1.0.0",
      id: "snapshot-a",
      version: "1.0.0",
      scope: MICRO_SCOPE,
      analysisRef: { id: "analysis-a", version: "1.0.0" }
    };
    const snapshotReceipt = await scalar(database, `
      select public.resolve_authoring_effective_design_v1(
        $1,$2,'snapshot:resolve:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "resolve_effective_design", snapshotInput),
      revision,
      JSON.stringify(snapshotInput)
    ]);
    assert.equal(snapshotReceipt.snapshotRef.id, "snapshot-a");
    assert.equal(Object.hasOwn(snapshotReceipt, "snapshot"), false);
    revision += 1;
    const snapshot = await scalar(database, `
      select public.get_authoring_effective_design_snapshot_v1(
        $1,$2,'snapshot-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(snapshot.basedOnWorkspaceRevision, revision - 1);
    assert.equal(snapshot.scopeEntityVersion, 1);
    assert.equal(snapshot.resolvedValues.length, 9);
    assert.deepEqual(snapshot.resourceSetRefs, [{
      id: "resource-set-a", version: "1.0.0"
    }, {
      id: "resource-set-record", version: "1.0.0"
    }]);
    await assert.rejects(database.query(`
      update private.authoring_effective_design_snapshots
      set resolution_version='2.0.0'
      where workspace_id=$1 and snapshot_id='snapshot-a'
    `, [WORKSPACE]), (error) => error.code === "55000");

    const blueprintInput = {
      id: "blueprint-a",
      version: "1.0.0",
      modelVersion: "1.0.0",
      contractVersion: 2,
      scope: MICRO_SCOPE,
      analysisRef: { id: "analysis-a", version: "1.0.0" },
      effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
      blueprint: pedagogicalBlueprintV2(),
      binding: pedagogicalBlueprintBinding()
    };
    const invalidBlueprintInput = {
      ...blueprintInput,
      id: "blueprint-invalid",
      blueprint: { sequence: [] },
      binding: {
        ...pedagogicalBlueprintBinding(),
        id: "binding-invalid",
        blueprintRef: { id: "blueprint-invalid", version: "1.0.0" }
      }
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_pedagogical_blueprint_v1(
        $1,$2,'blueprint:save:invalid',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "save_pedagogical_blueprint", invalidBlueprintInput
      ),
      revision,
      JSON.stringify(invalidBlueprintInput)
    ]), (error) => error.code === "22023");
    const invalidBindingInput = {
      ...blueprintInput,
      id: "blueprint-invalid-binding",
      binding: {
        ...pedagogicalBlueprintBinding(),
        id: "binding-invalid-shape",
        blueprintRef: { id: "blueprint-invalid-binding", version: "1.0.0" },
        mappings: {
          ...pedagogicalBlueprintBinding().mappings,
          practiceSteps: [{
            stepId: "practice:a",
            unitRefs: ["unit:unknown"],
            evidenceRequirementRefs: ["evidence:a"]
          }]
        }
      }
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_pedagogical_blueprint_v1(
        $1,$2,'blueprint:save:invalid-binding',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "save_pedagogical_blueprint", invalidBindingInput
      ),
      revision,
      JSON.stringify(invalidBindingInput)
    ]), (error) => error.code === "22023");
    const blueprintReceipt = await scalar(database, `
      select public.save_authoring_pedagogical_blueprint_v1(
        $1,$2,'blueprint:save:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_pedagogical_blueprint", blueprintInput),
      revision,
      JSON.stringify(blueprintInput)
    ]);
    revision += 1;
    assert.match(blueprintReceipt.blueprintHash, /^[a-f0-9]{64}$/u);
    assert.equal(blueprintReceipt.bindingRef.id, "binding-a");
    const resumedDesign = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.deepEqual(resumedDesign.blueprintRef, {
      id: "blueprint-a", version: "1.0.0", contractVersion: 2
    });
    assert.deepEqual(resumedDesign.blueprintBindingRef, {
      id: "binding-a",
      version: "1.0.0",
      contract: "PedagogicalBlueprintBinding@1"
    });
    assert.deepEqual(resumedDesign.blueprintBinding, blueprintInput.binding);
    assert.deepEqual(
      resumedDesign.blueprintBinding.mappings.practiceSteps[0].evidenceRequirementRefs,
      ["evidence:a"]
    );
    const resumedArtifact = await scalar(database, `
      select public.get_authoring_pedagogical_blueprint_artifact_v1(
        $1,$2,'blueprint-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.deepEqual(resumedArtifact.blueprintRef, {
      id: "blueprint-a", version: "1.0.0"
    });
    assert.deepEqual(resumedArtifact.bindingRef, {
      id: "binding-a", version: "1.0.0"
    });
    assert.equal(resumedArtifact.blueprintHash, blueprintReceipt.blueprintHash);
    assert.equal(resumedArtifact.bindingHash, blueprintReceipt.bindingHash);
    assert.equal(resumedArtifact.scopeEntityVersion, 1);
    await assert.rejects(database.query(`
      update private.authoring_pedagogical_blueprint_bindings
      set payload='{}'::jsonb
      where workspace_id=$1 and binding_id='binding-a'
    `, [WORKSPACE]), (error) => error.code === "55000");
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card:a','microsequence','micro-a',0,$2::jsonb)
    `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Conteúdo A." })]);
    const materializationBasis = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.match(materializationBasis.materializationContentHash, /^[a-f0-9]{64}$/u);

    const manifest = {
      contract: "MaterializationManifest@1",
      modelVersion: "1.0.0",
      id: "manifest-a",
      version: "1.0.0",
      scope: MICRO_SCOPE,
      analysisRef: { id: "analysis-a", version: "1.0.0" },
      effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
      blueprintRef: { id: "blueprint-a", version: "1.0.0" },
      materializedWorkspaceRevision: revision,
      scopeEntityVersion: 1,
      contentHash: materializationBasis.materializationContentHash,
      blueprintHash: blueprintReceipt.blueprintHash,
      createdAt: "2026-08-15T20:00:00.000Z",
      resourceSetRefs: [
        { id: "resource-set-a", version: "1.0.0" },
        { id: "resource-set-record", version: "1.0.0" }
      ],
      plannedSteps: [
        { stepRef: "theory:a", kind: "theory", unitRefs: ["unit:a"] },
        { stepRef: "practice:a", kind: "practice", unitRefs: ["unit:a"] }
      ],
      materializedSteps: [{
        stepRef: "theory:a",
        kind: "theory",
        unitRefs: ["unit:a"],
        artifactRefs: ["card:a"]
      }],
      explanationCoverage: [],
      evidenceCoverage: [],
      practiceOpportunities: [],
      resourceSelections: [{
        id: "selection:a",
        stepRef: "theory:a",
        package: {
          packageId: "aralearn.resource.concept_map",
          version: "1.0.0"
        },
        authorizedByResourceSetRef: {
          id: "resource-set-record",
          version: "1.0.0"
        },
        role: "exposition",
        fit: "substitute",
        rationale: "A estrutura é uma rede de relações.",
        limitations: ["Representação substituta registrada explicitamente."]
      }],
      materializedResources: [{
        id: "resource:a",
        selectionRef: "selection:a",
        artifactRef: "card:a:resource:a",
        package: {
          packageId: "aralearn.resource.concept_map",
          version: "1.0.0"
        },
        role: "exposition"
      }],
      derivedMetrics: [],
      assumptions: [],
      limitations: []
    };
    const forgedContentManifest = {
      ...manifest,
      id: "manifest-forged-content",
      contentHash: hash("f")
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:forged-content:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", forgedContentManifest
      ),
      revision,
      JSON.stringify(forgedContentManifest)
    ]), (error) => error.code === "23514");
    const ghostArtifactManifest = {
      ...manifest,
      id: "manifest-ghost-artifact",
      materializedSteps: [{
        ...manifest.materializedSteps[0],
        artifactRefs: ["card:ghost"]
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:ghost-artifact:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", ghostArtifactManifest
      ),
      revision,
      JSON.stringify(ghostArtifactManifest)
    ]), (error) => error.code === "23514");
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card:extra','microsequence','micro-a',1,$2::jsonb)
    `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Card extra." })]);
    const extraCardState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const omittedExtraManifest = {
      ...manifest,
      id: "manifest-omitted-extra",
      contentHash: extraCardState.materializationContentHash
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:omitted-extra:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", omittedExtraManifest
      ),
      revision,
      JSON.stringify(omittedExtraManifest)
    ]), (error) => error.code === "23514");
    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card:extra'
    `, [WORKSPACE]);
    const restoredCardSetState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(restoredCardSetState.materializationContentHash, manifest.contentHash);
    const incompletePlanManifest = {
      ...manifest,
      id: "manifest-incomplete-plan",
      plannedSteps: [manifest.plannedSteps[0]]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:incomplete-plan:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", incompletePlanManifest
      ),
      revision,
      JSON.stringify(incompletePlanManifest)
    ]), (error) => error.code === "23514");
    const responseBypassManifest = {
      ...manifest,
      id: "manifest-response-role-bypass",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        id: "selection:response-bypass",
        package: {
          packageId: "aralearn.response.choice",
          version: "1.0.0"
        },
        authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
        role: "exposition"
      }],
      materializedResources: [{
        ...manifest.materializedResources[0],
        id: "resource:response-bypass",
        selectionRef: "selection:response-bypass",
        package: {
          packageId: "aralearn.response.choice",
          version: "1.0.0"
        },
        role: "exposition"
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:response-role-bypass:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", responseBypassManifest
      ),
      revision,
      JSON.stringify(responseBypassManifest)
    ]), (error) => error.code === "23514");
    const versatileWithoutLimitationManifest = {
      ...manifest,
      id: "manifest-versatile-without-limitation",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        fit: "versatile",
        limitations: []
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:versatile:no-limitation',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database,
        "register_materialization_manifest",
        versatileWithoutLimitationManifest
      ),
      revision,
      JSON.stringify(versatileWithoutLimitationManifest)
    ]), (error) => error.code === "23514");
    const canonicalWithLimitationManifest = {
      ...manifest,
      id: "manifest-canonical-with-limitation",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        fit: "canonical"
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:canonical:limitation',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", canonicalWithLimitationManifest
      ),
      revision,
      JSON.stringify(canonicalWithLimitationManifest)
    ]), (error) => error.code === "23514");
    const blockedVersatileManifest = {
      ...manifest,
      id: "manifest-blocked-versatile",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
        fit: "versatile",
        limitations: ["Representação não canônica declarada."]
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:versatile:blocked',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", blockedVersatileManifest
      ),
      revision,
      JSON.stringify(blockedVersatileManifest)
    ]), (error) => error.code === "23514");
    const blockedSubstituteManifest = {
      ...manifest,
      id: "manifest-blocked-substitute",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
        fit: "substitute",
        limitations: ["Não equivale à representação requerida."]
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:blocked:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", blockedSubstituteManifest
      ),
      revision,
      JSON.stringify(blockedSubstituteManifest)
    ]), (error) => error.code === "23514");
    const manifestReceipt = await scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:register:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "register_materialization_manifest", manifest),
      revision,
      JSON.stringify(manifest)
    ]);
    revision += 1;
    assert.equal(manifestReceipt.manifestRef.id, "manifest-a");
    const currentState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(currentState.analysisState, "current");
    assert.equal(currentState.effectiveDesignState, "resolved");
    assert.equal(currentState.blueprintState, "current");
    assert.equal(currentState.materializationState, "tracked");
    assert.equal(currentState.resourceAvailabilityState, "resolved");

    await database.query(`
      update private.authoring_workspaces
      set authoring_state=authoring_state || $2::jsonb
      where id=$1
    `, [WORKSPACE, JSON.stringify({
      mandate: {
        id: "mandate-audit-micro",
        kind: "audit",
        decidedAtRevision: revision
      }
    })]);
    const auditMaterializationRevision = await scalar(database, `
      select materialization_revision::integer value
      from private.authoring_materialization_states
      where workspace_id=$1 and microsequence_ref='micro-a'
    `, [WORKSPACE]);
    const auditPath = ["course-a", "module-a", "lesson-a", "micro-a"];
    const auditScope = { kind: "microsequence", ref: "micro-a" };
    const auditAlgorithm = {
      id: "aralearn.instructional-conformance",
      version: "1.0.0"
    };
    const auditReport = {
      contract: "AuthoringConformanceAudit@1",
      algorithm: auditAlgorithm,
      scope: auditScope,
      auditedRevision: revision,
      refs: {
        analysisRef: { id: "analysis-a", version: "1.0.0" },
        effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
        blueprintRef: { id: "blueprint-a", version: "1.0.0" },
        bindingRef: { id: "binding-a", version: "1.0.0" },
        manifestRef: { id: "manifest-a", version: "1.0.0" },
        resourceSetRefs: snapshot.resourceSetRefs
      },
      checks: [{
        code: "manifest_tracks_current_materialization",
        category: "structure",
        status: "failed"
      }],
      metrics: [],
      summary: {
        structure: "conformant",
        design: "conformant",
        practice: "not_checked",
        resources: "conformant",
        deterministicFindingCount: 1,
        checkCounts: { passed: 0, failed: 1, notApplicable: 0 }
      }
    };
    const auditCommand = {
      contract: "AuthoringConformanceAudit@1",
      kind: "audit",
      scope: auditScope,
      algorithm: auditAlgorithm,
      microsequences: [{
        path: auditPath,
        scopeEntityVersion: 1,
        materializationStateRevision: auditMaterializationRevision,
        contentHash: manifest.contentHash,
        refs: auditReport.refs
      }],
      report: auditReport,
      findings: [{
        code: "manifest_tracks_current_materialization",
        origin: "deterministic",
        category: "structure",
        severity: "high",
        target: {
          entityType: "card",
          entityPath: [...auditPath, "card:a"]
        },
        ruleRef: {
          kind: "materialization",
          id: "current-content-fingerprint",
          version: "1.0.0"
        },
        publicEvidence: "O manifesto precisa acompanhar a materialização corrente.",
        proposedRepair: null
      }]
    };
    const auditPayloadHash = await mutationHash(
      database, "run_authoring_audit", auditCommand
    );
    const auditReceipt = await scalar(database, `
      select public.register_authoring_audit_run_v1(
        $1,$2,'audit:run:micro:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, auditPayloadHash, revision, JSON.stringify(auditCommand)
    ]);
    revision += 1;
    assert.equal(auditReceipt.status, "semantic_pending");
    assert.equal(auditReceipt.findingCount, 1);
    assert.match(auditReceipt.auditRunRef.id, /^[0-9a-f-]{36}$/u);
    const deterministicFindingId = await scalar(database, `
      select id value
      from private.authoring_workspace_observations
      where audit_run_id=$1 and finding_origin='deterministic'
    `, [auditReceipt.auditRunRef.id]);
    await assert.rejects(scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:pending',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("a"), revision,
      JSON.stringify({ findingId: deterministicFindingId, decision: "approve" })
    ]), (error) => error.code === "23514");
    await assert.rejects(scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:delete:structured',$3,$4,'delete',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("b"), revision,
      JSON.stringify({ findingId: deterministicFindingId })
    ]), (error) => error.code === "23514");
    await database.query(`
      delete from private.authoring_workspace_observations where id=$1
    `, [deterministicFindingId]);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observations where id=$1
    `, [deterministicFindingId]), 1);
    await assert.rejects(database.query(`
      update private.authoring_audit_runs set kind='reaudit'
      where id=$1
    `, [auditReceipt.auditRunRef.id]), (error) => error.code === "55000");

    const cardPage = await scalar(database, `
      select public.list_authoring_audit_cards_v1(
        $1,$2,$3::text[],$4,1,null,null
      ) value
    `, [ACTOR, WORKSPACE, auditPath, revision]);
    assert.equal(cardPage.items.length, 1);
    assert.equal(cardPage.items[0].id, "card:a");
    assert.equal(cardPage.contentHash, manifest.contentHash);
    await assert.rejects(scalar(database, `
      select public.list_authoring_audit_cards_v1(
        $1,$2,$3::text[],$4,1,null,null
      ) value
    `, [ACTOR, WORKSPACE, auditPath, revision - 1]), (error) => error.code === "40001");

    const semanticPayload = {
      auditRunRef: auditReceipt.auditRunRef,
      findings: [{
        code: "semantic_explanation_underdeveloped",
        category: "design",
        severity: "high",
        target: {
          entityType: "microsequence",
          entityPath: auditPath
        },
        ruleRef: {
          kind: "semantic_rubric",
          id: "explanation-development",
          version: "1.0.0"
        },
        publicEvidence: "A teoria menciona a distinção sem desenvolver o contraste.",
        proposedRepair: null
      }],
      verifications: []
    };
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:oversized',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      hash("d"),
      revision,
      JSON.stringify({
        ...semanticPayload,
        findings: Array.from({ length: 101 }, () => semanticPayload.findings[0])
      })
    ]), (error) => error.code === "22023");
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:invalid-category',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      hash("2"),
      revision,
      JSON.stringify({
        ...semanticPayload,
        findings: [{ ...semanticPayload.findings[0], category: "quality_score" }]
      })
    ]), (error) => error.code === "22023");
    const semanticPayloadHash = await mutationHash(
      database, "record_authoring_semantic_audit", semanticPayload
    );
    const semanticReceipt = await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, semanticPayloadHash, revision,
      JSON.stringify(semanticPayload)
    ]);
    revision += 1;
    assert.equal(semanticReceipt.status, "complete");
    assert.equal(semanticReceipt.recordedCount, 1);
    const semanticReplay = await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, semanticPayloadHash, revision - 1,
      JSON.stringify(semanticPayload)
    ]);
    assert.equal(semanticReplay.idempotent, true);
    const completedAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,20,null
      ) value
    `, [
      ACTOR, WORKSPACE, auditReceipt.auditRunRef.id,
      auditReceipt.auditRunRef.version
    ]);
    assert.equal(completedAudit.audit.latestAuditRun.status, "complete");
    assert.equal(completedAudit.audit.summary.findings.semantic, 1);
    assert.deepEqual(completedAudit.audit.summary.dimensions.design, {
      status: "finding",
      findingCount: 1
    });
    assert.equal(completedAudit.audit.findings[0].proposedRepair, null);
    assert.equal(completedAudit.audit.findings.some(({ origin }) => (
      origin === "semantic_audit"
    )), true);
    const deterministicAuditFinding = completedAudit.audit.findings.find(({ origin }) => (
      origin === "deterministic"
    ));
    assert.deepEqual(deterministicAuditFinding.artifactRefs.resourceSetRefs, {
      items: snapshot.resourceSetRefs,
      count: snapshot.resourceSetRefs.length,
      truncated: false
    });
    assert.deepEqual(deterministicAuditFinding.artifactRefs.microsequenceRefs, {
      items: ["micro-a"],
      count: 1,
      truncated: false
    });
    const listedFindings = await scalar(database, `
      select private.list_authoring_workspace_observations_v1(
        $1,$2,20,null,null,null,array['audit_finding'],null
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(listedFindings.items.every(({ canDelete }) => canDelete === false), true);
    assert.equal(listedFindings.items.some(({ findingCode }) => (
      findingCode === deterministicAuditFinding.code
    )), true);
    assert.equal(listedFindings.items.some(({ artifactRefs }) => (
      artifactRefs != null
    )), false);
    const freshContinuity = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE]);
    const resumedFinding = freshContinuity.activeFindings.find(({ findingId }) => (
      findingId === deterministicFindingId
    ));
    assert.equal(resumedFinding.findingCode, deterministicAuditFinding.code);
    assert.equal(resumedFinding.findingOrigin, "deterministic");
    assert.deepEqual(resumedFinding.auditRunRef, auditReceipt.auditRunRef);
    assert.equal(resumedFinding.publicEvidence.length > 0, true);
    assert.equal(Object.hasOwn(resumedFinding, "artifactRefs"), false);
    const semanticFindingId = completedAudit.audit.findings.find(({ origin }) => (
      origin === "semantic_audit"
    )).findingId;

    await scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:approved',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("c"), revision,
      JSON.stringify({ findingId: deterministicFindingId, decision: "approve" })
    ]);
    revision += 1;
    await scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:semantic-approved',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("2"), revision,
      JSON.stringify({ findingId: semanticFindingId, decision: "approve" })
    ]);
    revision += 1;
    const repairedRevision = revision + 1;
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired',correction_request_id='repair:deterministic:0001',
          resulting_revision=$2,updated_at=now()
      where id = any($1::uuid[])
    `, [[deterministicFindingId, semanticFindingId], repairedRevision]);
    await database.query(`
      update private.authoring_workspaces set revision=$1 where id=$2
    `, [repairedRevision, WORKSPACE]);
    revision = repairedRevision;
    const reauditReport = {
      ...auditReport,
      auditedRevision: revision
    };
    const reauditCommand = {
      ...auditCommand,
      kind: "reaudit",
      report: reauditReport,
      findings: auditCommand.findings.map((finding) => ({
        ...finding,
        target: { ...finding.target, resourceTargetId: null },
        ruleRef: {
          ...finding.ruleRef,
          kind: ` ${finding.ruleRef.kind} `,
          id: ` ${finding.ruleRef.id} `
        }
      }))
    };
    const reauditHash = await mutationHash(
      database, "run_authoring_audit", reauditCommand
    );
    const reauditReceipt = await scalar(database, `
      select public.register_authoring_audit_run_v1(
        $1,$2,'audit:run:micro:reaudit',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, reauditHash, revision, JSON.stringify(reauditCommand)
    ]);
    revision += 1;
    const resolvedRecurrence = {
      auditRunRef: reauditReceipt.auditRunRef,
      findings: [],
      verifications: [{
        findingId: deterministicFindingId,
        outcome: "resolved",
        publicEvidence: "A reauditoria releu o conteúdo corrente."
      }]
    };
    const emptyReaudit = {
      auditRunRef: reauditReceipt.auditRunRef,
      findings: [],
      verifications: []
    };
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:empty-reaudit',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "record_authoring_semantic_audit", emptyReaudit
      ),
      revision,
      JSON.stringify(emptyReaudit)
    ]), (error) => error.code === "23514");
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:recurrence-resolved',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("e"), revision,
      JSON.stringify(resolvedRecurrence)
    ]), (error) => error.code === "23514");
    const stillOpenRecurrence = {
      ...resolvedRecurrence,
      findings: [structuredClone(semanticPayload.findings[0])],
      verifications: [
        {
          ...resolvedRecurrence.verifications[0],
          outcome: "still_open",
          publicEvidence: "O mesmo problema reapareceu no snapshot reauditado."
        },
        {
          findingId: semanticFindingId,
          outcome: "still_open",
          publicEvidence: "A explicação continuou insuficiente após o reparo."
        }
      ]
    };
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:duplicate-verification',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("3"), revision,
      JSON.stringify({
        ...stillOpenRecurrence,
        verifications: [
          stillOpenRecurrence.verifications[0],
          stillOpenRecurrence.verifications[0]
        ]
      })
    ]), (error) => error.code === "22023");
    await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:recurrence-open',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("f"), revision,
      JSON.stringify(stillOpenRecurrence)
    ]);
    revision += 1;
    const recurrentAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,20,null
      ) value
    `, [
      ACTOR, WORKSPACE, reauditReceipt.auditRunRef.id,
      reauditReceipt.auditRunRef.version
    ]);
    assert.equal(recurrentAudit.audit.total, 2);
    assert.equal(recurrentAudit.audit.findings.length, 2);
    assert.equal(recurrentAudit.audit.summary.findings.total, 2);
    assert.equal(recurrentAudit.audit.summary.dimensions.structure.status, "finding");
    assert.equal(recurrentAudit.audit.findings.some(({ findingId }) => (
      findingId === deterministicFindingId
    )), false);
    assert.equal(recurrentAudit.audit.findings.some(({ findingId }) => (
      findingId === semanticFindingId
    )), false);
    const recurrentSemanticFinding = recurrentAudit.audit.findings.find(({ code }) => (
      code === semanticPayload.findings[0].code
    ));
    assert.equal(recurrentSemanticFinding.status, "open");
    assert.notEqual(recurrentSemanticFinding.findingId, semanticFindingId);
    const recurrentSemanticFindingId = recurrentSemanticFinding.findingId;
    const recurrentSemanticSnapshot = structuredClone(
      recurrentSemanticFinding
    );
    const recurrenceContinuity = await scalar(database, `
      select public.get_authoring_workspace_continuity_v1($1,$2) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(recurrenceContinuity.activeFindings.some(({ findingId }) => (
      findingId === deterministicFindingId
    )), false);
    const supersededOccurrence = await database.query(`
      select status,verification,verified_by_audit_run_id
      from private.authoring_workspace_observations where id=$1
    `, [deterministicFindingId]);
    assert.equal(supersededOccurrence.rows[0].status, "repaired");
    assert.equal(
      supersededOccurrence.rows[0].verified_by_audit_run_id,
      reauditReceipt.auditRunRef.id
    );
    await scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:reapproved',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("1"), revision,
      JSON.stringify({ findingId: recurrentSemanticFindingId, decision: "approve" })
    ]);
    revision += 1;
    const reapproved = await database.query(`
      select status,verification,verified_revision,verified_by_audit_run_id
      from private.authoring_workspace_observations where id=$1
    `, [recurrentSemanticFindingId]);
    assert.deepEqual(reapproved.rows[0], {
      status: "approved",
      verification: null,
      verified_revision: null,
      verified_by_audit_run_id: null
    });
    const semanticRepairedRevision = revision + 1;
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired',correction_request_id='repair:semantic:0002',
          resulting_revision=$2,updated_at=now()
      where id=$1
    `, [recurrentSemanticFindingId, semanticRepairedRevision]);
    await database.query(`
      update private.authoring_workspaces set revision=$1 where id=$2
    `, [semanticRepairedRevision, WORKSPACE]);
    revision = semanticRepairedRevision;
    const thirdReauditCommand = {
      ...auditCommand,
      kind: "reaudit",
      report: { ...auditReport, auditedRevision: revision }
    };
    const thirdReauditReceipt = await scalar(database, `
      select public.register_authoring_audit_run_v1(
        $1,$2,'audit:run:micro:reaudit:third',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "run_authoring_audit", thirdReauditCommand),
      revision,
      JSON.stringify(thirdReauditCommand)
    ]);
    revision += 1;
    const thirdSemanticPayload = {
      auditRunRef: thirdReauditReceipt.auditRunRef,
      findings: [structuredClone(semanticPayload.findings[0])],
      verifications: [{
        findingId: recurrentSemanticFindingId,
        outcome: "still_open",
        publicEvidence: "A terceira rodada confirmou a permanência do achado."
      }]
    };
    await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:third',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "record_authoring_semantic_audit", thirdSemanticPayload
      ),
      revision,
      JSON.stringify(thirdSemanticPayload)
    ]);
    revision += 1;
    const immutablePriorReaudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,20,null
      ) value
    `, [
      ACTOR, WORKSPACE, reauditReceipt.auditRunRef.id,
      reauditReceipt.auditRunRef.version
    ]);
    assert.equal(immutablePriorReaudit.audit.total, 2);
    assert.equal(immutablePriorReaudit.audit.findings.some(({ findingId }) => (
      findingId === recurrentSemanticFindingId
    )), true);
    assert.deepEqual(
      immutablePriorReaudit.audit.findings.find(({ findingId }) => (
        findingId === recurrentSemanticFindingId
      )).verificationAuditRunRef,
      thirdReauditReceipt.auditRunRef
    );
    const immutableSemanticSnapshot = immutablePriorReaudit.audit.findings.find(
      ({ findingId }) => findingId === recurrentSemanticFindingId
    );
    assert.equal(immutableSemanticSnapshot.status, "repaired");
    assert.equal(
      immutableSemanticSnapshot.publicEvidence,
      recurrentSemanticSnapshot.publicEvidence
    );
    assert.deepEqual(immutableSemanticSnapshot.auditRunRef, reauditReceipt.auditRunRef);

    await database.query(`
      update private.authoring_workspaces
      set authoring_state=authoring_state || $2::jsonb
      where id=$1
    `, [WORKSPACE, JSON.stringify({
      parts: [{
        id: "part-a",
        title: "Parte A",
        status: "active",
        microsequenceIds: ["micro-a"]
      }],
      mandate: {
        id: "mandate-audit-part",
        kind: "audit",
        targetPartId: "part-a",
        decidedAtRevision: revision
      }
    })]);
    const partScope = { kind: "part", ref: "part-a" };
    const pendingPartComponents = await scalar(database, `
      select public.list_authoring_part_audit_components_v1(
        $1,$2,'part-a',10,null
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(pendingPartComponents.total, 1);
    assert.equal(pendingPartComponents.pageReadyCount, 0);
    assert.equal(pendingPartComponents.items[0].ready, false);
    const componentAuditedRevision = revision;
    const componentReport = {
      ...auditReport,
      auditedRevision: componentAuditedRevision,
      materializationStateRevision: auditMaterializationRevision,
      contentHash: manifest.contentHash
    };
    const componentCommand = {
      ...auditCommand,
      kind: "reaudit",
      report: componentReport
    };
    const componentReceipt = await scalar(database, `
      select public.register_authoring_audit_run_v1(
        $1,$2,'audit:run:part:component',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "run_authoring_audit", componentCommand),
      revision,
      JSON.stringify(componentCommand)
    ]);
    revision += 1;
    const componentSemanticPayload = {
      auditRunRef: componentReceipt.auditRunRef,
      findings: [],
      verifications: []
    };
    await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:part:component',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "record_authoring_semantic_audit", componentSemanticPayload
      ),
      revision,
      JSON.stringify(componentSemanticPayload)
    ]);
    revision += 1;
    const readyPartComponents = await scalar(database, `
      select public.list_authoring_part_audit_components_v1(
        $1,$2,'part-a',10,null
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(readyPartComponents.pageReadyCount, 1);
    assert.deepEqual(
      readyPartComponents.items[0].auditRunRef,
      componentReceipt.auditRunRef
    );
    const partReportWithFindings = aggregatePartConformanceAudits({
      part: { id: "part-a", microsequenceIds: ["micro-a"] },
      audits: [{
        contract: componentReport.contract,
        algorithm: componentReport.algorithm,
        scope: componentReport.scope,
        auditedRevision: componentAuditedRevision,
        materializationStateRevision: componentReport.materializationStateRevision,
        contentHash: componentReport.contentHash,
        summary: componentReport.summary,
        auditRunRef: componentReceipt.auditRunRef,
        findingSummary: {
          total: readyPartComponents.items[0].findingCount,
          byCategory: readyPartComponents.items[0].findingsByCategory,
          byOrigin: readyPartComponents.items[0].findingsByOrigin
        }
      }],
      auditedRevision: revision
    });
    const partReport = structuredClone(partReportWithFindings);
    delete partReport.findings;
    const partCommand = {
      contract: partReport.contract,
      kind: "audit",
      scope: partScope,
      algorithm: partReport.algorithm,
      microsequences: [],
      components: readyPartComponents.items.map((component) => ({
        ordinal: component.ordinal,
        microsequenceRef: component.microsequenceRef,
        targetAvailable: component.targetAvailable,
        auditRunRef: component.auditRunRef
      })),
      report: partReport,
      findings: structuredClone(partReportWithFindings.findings)
    };
    const partPayloadHash = await mutationHash(
      database, "run_authoring_audit", partCommand
    );
    const partReceipt = await scalar(database, `
      select public.register_authoring_audit_run_v1(
        $1,$2,'audit:run:part:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, partPayloadHash, revision, JSON.stringify(partCommand)
    ]);
    revision += 1;
    const partSemanticPayload = {
      auditRunRef: partReceipt.auditRunRef,
      findings: [{
        code: "semantic_part_coherence_gap",
        category: "coherence",
        severity: "medium",
        target: { entityType: "workspace", entityPath: [] },
        ruleRef: {
          kind: "semantic_rubric",
          id: "part-coherence",
          version: "1.0.0"
        },
        publicEvidence: "A transição entre as microssequências requer explicitação.",
        proposedRepair: "Explicitar a transição no fechamento da Parte."
      }],
      verifications: []
    };
    const partSemanticHash = await mutationHash(
      database, "record_authoring_semantic_audit", partSemanticPayload
    );
    await database.query(`
      update private.authoring_workspaces
      set authoring_state=jsonb_set(
        authoring_state,'{parts,0,microsequenceIds}',
        '["micro-a","micro-missing"]'::jsonb
      ) where id=$1
    `, [WORKSPACE]);
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:part:reordered',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, partSemanticHash, revision,
      JSON.stringify(partSemanticPayload)
    ]), (error) => error.code === "40001");
    await database.query(`
      update private.authoring_workspaces
      set authoring_state=jsonb_set(
        authoring_state,'{parts,0,microsequenceIds}',
        '["micro-a"]'::jsonb
      ) where id=$1
    `, [WORKSPACE]);
    await database.query(`
      update private.authoring_workspaces
      set authoring_state=jsonb_set(
        authoring_state,'{mandate,id}','"mandate-replaced"'::jsonb
      ) where id=$1
    `, [WORKSPACE]);
    await assert.rejects(scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:part:mandate-changed',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, partSemanticHash, revision,
      JSON.stringify(partSemanticPayload)
    ]), (error) => error.code === "40001");
    await database.query(`
      update private.authoring_workspaces
      set authoring_state=jsonb_set(
        authoring_state,'{mandate,id}','"mandate-audit-part"'::jsonb
      ) where id=$1
    `, [WORKSPACE]);
    await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:part:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, partSemanticHash, revision,
      JSON.stringify(partSemanticPayload)
    ]);
    revision += 1;
    const completedPartAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,null,null,'part','part-a',20,null
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(completedPartAudit.audit.latestAuditRun.status, "complete");
    assert.equal(completedPartAudit.audit.latestAuditRun.current, true);
    assert.equal(completedPartAudit.audit.components.count, 1);
    assert.deepEqual(
      completedPartAudit.audit.components.items[0].childAuditRunRef,
      componentReceipt.auditRunRef
    );
    assert.equal(completedPartAudit.audit.components.items[0].targetAvailable, true);
    assert.equal(completedPartAudit.audit.summary.findings.total, 2);
    assert.deepEqual(completedPartAudit.audit.summary.dimensions.coverage, {
      status: "conformant",
      findingCount: 0
    });
    assert.deepEqual(completedPartAudit.audit.summary.dimensions.coherence, {
      status: "finding",
      findingCount: 1
    });
    for (const dimension of ["dependencies", "redundancy", "integration"]) {
      assert.deepEqual(completedPartAudit.audit.summary.dimensions[dimension], {
        status: "not_checked",
        findingCount: 0
      });
    }
    const historicalPartFindingId = completedPartAudit.audit.findings.find(({ code }) => (
      code === "semantic_part_coherence_gap"
    )).findingId;
    const newerPartCommand = {
      ...partCommand,
      kind: "reaudit",
      report: { ...partCommand.report, auditedRevision: revision }
    };
    const newerPartReceipt = await scalar(database, `
      select public.register_authoring_audit_run_v1(
        $1,$2,'audit:run:part:0002',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "run_authoring_audit", newerPartCommand),
      revision,
      JSON.stringify(newerPartCommand)
    ]);
    revision += 1;
    const newerPartSemanticPayload = {
      ...partSemanticPayload,
      auditRunRef: newerPartReceipt.auditRunRef,
      findings: partSemanticPayload.findings.map((finding) => ({
        ...finding,
        code: "semantic_part_coherence_gap_current"
      }))
    };
    await scalar(database, `
      select public.record_authoring_semantic_audit_v1(
        $1,$2,'audit:semantic:part:0002',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "record_authoring_semantic_audit", newerPartSemanticPayload
      ),
      revision,
      JSON.stringify(newerPartSemanticPayload)
    ]);
    revision += 1;
    const completedAuditState = await scalar(database, `
      select authoring_state value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE]);
    completedAuditState.mandate = null;
    await scalar(database, `
      select public.update_authoring_workspace_continuity_v1(
        $1,$2,'continuity:audit:clear-complete',$3,$4,'clear_mandate',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("e"), revision,
      JSON.stringify(completedAuditState)
    ]);
    revision += 1;
    const supersededPartAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,20,null
      ) value
    `, [
      ACTOR, WORKSPACE, partReceipt.auditRunRef.id, partReceipt.auditRunRef.version
    ]);
    assert.equal(supersededPartAudit.audit.latestAuditRun.current, false);
    await assert.rejects(scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:part-superseded',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("7"), revision,
      JSON.stringify({ findingId: historicalPartFindingId, decision: "approve" })
    ]), (error) => error.code === "40001");
    const currentPartAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,null,null,'part','part-a',20,null
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.deepEqual(
      currentPartAudit.audit.latestAuditRun.ref,
      newerPartReceipt.auditRunRef
    );
    assert.equal(currentPartAudit.audit.latestAuditRun.current, true);
    const partFindingId = currentPartAudit.audit.findings.find(({ code }) => (
      code === "semantic_part_coherence_gap_current"
    )).findingId;
    const partDecisionPayload = {
      findingId: partFindingId,
      decision: "approve"
    };
    const partDecisionExpectedRevision = revision;
    const partDecisionPayloadHash = hash("4");
    const partDecisionReceipt = await scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:part-approved',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, partDecisionPayloadHash, partDecisionExpectedRevision,
      JSON.stringify(partDecisionPayload)
    ]);
    assert.equal(partDecisionReceipt.findingOperation, "decide");
    revision += 1;

    const activeRepairState = await scalar(database, `
      select authoring_state value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE]);
    activeRepairState.mandate = {
      id: "mandate-repair-active-part",
      kind: "repair_findings",
      findingIds: [partFindingId],
      decidedAtRevision: revision
    };
    await scalar(database, `
      select public.update_authoring_workspace_continuity_v1(
        $1,$2,'continuity:repair:active',$3,$4,'set_mandate',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("b"), revision, JSON.stringify(activeRepairState)
    ]);
    revision += 1;
    const prematureAuditState = structuredClone(activeRepairState);
    prematureAuditState.mandate = {
      id: "mandate-audit-premature",
      kind: "audit",
      targetPartId: "part-a",
      decidedAtRevision: revision
    };
    await assert.rejects(scalar(database, `
      select public.update_authoring_workspace_continuity_v1(
        $1,$2,'continuity:audit:premature',$3,$4,'set_mandate',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("c"), revision,
      JSON.stringify(prematureAuditState)
    ]), (error) => error.code === "23514");
    await database.query(`
      update private.authoring_workspace_observations
      set status='repaired',correction_request_id='repair:part:complete',
          resulting_revision=$2,updated_at=now()
      where id=$1
    `, [partFindingId, revision + 1]);
    await scalar(database, `
      select public.update_authoring_workspace_continuity_v1(
        $1,$2,'continuity:audit:after-repair',$3,$4,'set_mandate',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("d"), revision,
      JSON.stringify(prematureAuditState)
    ]);
    revision += 1;
    const replacedMandatePartAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,2,null
      ) value
    `, [
      ACTOR, WORKSPACE,
      newerPartReceipt.auditRunRef.id,
      newerPartReceipt.auditRunRef.version
    ]);
    assert.equal(replacedMandatePartAudit.audit.latestAuditRun.current, false);

    await database.query(`
      update private.authoring_workspace_entities
      set content=$2::jsonb,version=version+1
      where workspace_id=$1 and entity_type='card' and entity_id='card:a'
    `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Conteúdo B." })]);
    const changedContentState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(changedContentState.materializationState, "stale");
    assert.equal(changedContentState.blueprintState, "current");
    assert.notEqual(
      changedContentState.materializationContentHash,
      manifest.contentHash
    );
    const staleHistoricalPartAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,2,null,10,null,'micro-a'
      ) value
    `, [
      ACTOR, WORKSPACE,
      newerPartReceipt.auditRunRef.id,
      newerPartReceipt.auditRunRef.version
    ]);
    assert.equal(staleHistoricalPartAudit.audit.latestAuditRun.current, false);
    const staleDecisionReplay = await scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:part-approved',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, partDecisionPayloadHash, partDecisionExpectedRevision,
      JSON.stringify(partDecisionPayload)
    ]);
    assert.equal(staleDecisionReplay.idempotent, true);
    assert.equal(staleDecisionReplay.findingOperation, "decide");
    assert.equal(staleDecisionReplay.status, partDecisionReceipt.status);
    await assert.rejects(scalar(database, `
      select public.manage_authoring_workspace_finding_v1(
        $1,$2,'audit:decision:part-approved',$3,$4,'decide',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("6"), partDecisionExpectedRevision,
      JSON.stringify(partDecisionPayload)
    ]), (error) => error.code === "23505");
    const repairState = await scalar(database, `
      select authoring_state value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE]);
    repairState.mandate = {
      id: "mandate-repair-stale-part",
      kind: "repair_findings",
      findingIds: [partFindingId],
      decidedAtRevision: revision
    };
    await assert.rejects(scalar(database, `
      select public.update_authoring_workspace_continuity_v1(
        $1,$2,'continuity:repair:stale',$3,$4,'set_mandate',$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, hash("5"), revision, JSON.stringify(repairState)
    ]), (error) => error.code === "40001");

    const wrongSnapshotManifest = {
      ...manifest,
      id: "manifest-wrong-snapshot",
      materializedWorkspaceRevision: revision,
      contentHash: changedContentState.materializationContentHash,
      effectiveSnapshotRef: { id: "snapshot-missing", version: "1.0.0" }
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:register:0002',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", wrongSnapshotManifest
      ),
      revision,
      JSON.stringify(wrongSnapshotManifest)
    ]), (error) => error.code === "23503");

    await database.query(`
      update private.authoring_workspace_entities
      set version=2
      where workspace_id=$1 and entity_type='lesson' and entity_id='lesson-a'
    `, [WORKSPACE]);
    const staleResourceState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(staleResourceState.analysisState, "current");
    assert.equal(staleResourceState.effectiveDesignState, "stale");
    assert.equal(staleResourceState.resourceAvailabilityState, "stale");
    assert.equal(staleResourceState.resolution.conflicts.some(({ code }) => (
      code === "stale_resource_set"
    )), true);
    await database.query(`
      update private.authoring_workspace_entities
      set version=2
      where workspace_id=$1 and entity_type='microsequence' and entity_id='micro-a'
    `, [WORKSPACE]);
    const staleAnalysisRead = await scalar(database, `
      select public.get_authoring_instructional_analysis_v1(
        $1,$2,'microsequence','micro-a','analysis-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(staleAnalysisRead.status, "stale");
    const staleState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(staleState.analysisState, "stale");
    assert.equal(staleState.effectiveDesignState, "stale");
    assert.equal(staleState.blueprintState, "stale");
    assert.equal(staleState.materializationState, "stale");
    assert.equal(staleState.resourceAvailabilityState, "stale");
    const staleSnapshotInput = { ...snapshotInput, id: "snapshot-stale" };
    await assert.rejects(scalar(database, `
      select public.resolve_authoring_effective_design_v1(
        $1,$2,'snapshot:resolve:stale',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "resolve_effective_design", staleSnapshotInput),
      revision,
      JSON.stringify(staleSnapshotInput)
    ]), (error) => error.code === "40001");
    const retention = await scalar(database, `
      select private.prune_authoring_design_state_v1(
        $1,now()+interval '1 day',256
      ) value
    `, [WORKSPACE]);
    assert.equal(retention.manifests, 0);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_effective_design_snapshots
      where workspace_id=$1 and snapshot_id='snapshot-a'
    `, [WORKSPACE]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_materialization_manifests
      where workspace_id=$1 and manifest_id='manifest-a'
    `, [WORKSPACE]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_pedagogical_blueprint_bindings
      where workspace_id=$1 and binding_id='binding-a'
    `, [WORKSPACE]), 1);
    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card:a'
    `, [WORKSPACE]);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_workspace_observations
      where workspace_id=$1 and audit_run_id is not null
    `, [WORKSPACE]) > 0, true);
    const detachedTargetAudit = await scalar(database, `
      select public.get_authoring_audit_run_v1(
        $1,$2,$3::uuid,$4,null,null,2,null
      ) value
    `, [
      ACTOR, WORKSPACE, auditReceipt.auditRunRef.id,
      auditReceipt.auditRunRef.version
    ]);
    assert.equal(detachedTargetAudit.audit.findings.some((finding) => (
      finding.findingId === deterministicFindingId
        && finding.targetAvailable === false
    )), true);

    await database.query(`select private.discard_authoring_workspace_v1($1)`, [
      WORKSPACE
    ]);
    for (const tableName of [
      "authoring_workspace_observations",
      "authoring_audit_runs",
      "authoring_microsequence_design_bindings",
      "authoring_materialization_manifests",
      "authoring_pedagogical_blueprint_bindings",
      "authoring_pedagogical_blueprints",
      "authoring_effective_design_snapshots",
      "authoring_design_parameter_assignments",
      "authoring_resource_sets",
      "authoring_instructional_analyses",
      "authoring_materialization_states"
    ]) {
      assert.equal(await scalar(database, `
        select count(*)::integer value
        from private.${tableName} where workspace_id=$1
      `, [WORKSPACE]), 0, `descarte: ${tableName}`);
    }
    assert.equal(await scalar(database, `
      select deleted_at is not null value
      from private.authoring_workspaces where id=$1
    `, [WORKSPACE]), true);
  } finally {
    await database.close();
  }
});

test("excluir colaborador anonimiza proveniência sem apagar histórico", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_design_parameter_assignments(
        workspace_id,assignment_id,assignment_version,model_version,action,
        parameter_id,parameter_version,scope_kind,scope_ref,scope_path,
        mode,value,authority_kind,authority_actor_id,authority_ref,locked,
        rationale,provenance_refs,based_on_workspace_revision,created_revision,
        created_by
      ) values(
        $1,'actor-removal-assignment','1.0.0','1.0.0','set',
        'representation_fallback_policy','1.0.0','microsequence','micro-a',
        array['course-a','module-a','lesson-a','micro-a'],
        'manual_override','{"kind":"enum","value":"block"}'::jsonb,
        'author',$2,$3,false,'Decisão humana registrada.','{}',1,2,$2
      )
    `, [WORKSPACE, AUTHOR_ONLY, AUTHOR_ONLY]);
    const auditRunId = await scalar(database, `
      insert into private.authoring_audit_runs(
        workspace_id,kind,scope_kind,scope_ref,audited_workspace_revision,
        algorithm_id,algorithm_version,deterministic_result,mandate_snapshot,
        result_hash,deterministic_finding_count,created_by
      ) values(
        $1,'audit','microsequence','micro-a',1,
        'actor-removal-test','1.0.0','{}'::jsonb,
        '{"id":"mandate-actor-removal","kind":"audit"}'::jsonb,
        $2,0,$3
      ) returning id value
    `, [WORKSPACE, hash("8"), AUTHOR_ONLY]);
    await database.query(`
      insert into private.authoring_audit_run_completions(
        audit_run_id,workspace_id,completed_revision,semantic_result,
        result_hash,semantic_finding_count,verification_count,completed_by
      ) values(
        $1,$2,2,'{"findings":[],"verifications":[]}'::jsonb,
        $3,0,0,$4
      )
    `, [auditRunId, WORKSPACE, hash("9"), AUTHOR_ONLY]);
    const findingId = await scalar(database, `
      insert into private.authoring_workspace_observations(
        workspace_id,author_id,kind,entity_type,entity_path,body,
        category,severity,status,proposed_repair,audit_revision,audit_part_id,
        audit_run_id,audit_finding_ordinal,finding_code,finding_origin,
        rule_kind,rule_id,rule_version,public_evidence,finding_fingerprint
      ) values(
        $1,$2,'audit_finding','workspace','{}','Evidência pública preservada.',
        'design','medium','open',null,1,null,$3,1,
        'actor_removal_history','semantic_audit','semantic_rubric',
        'actor-removal',null,'Evidência pública preservada.',$4
      ) returning id value
    `, [WORKSPACE, AUTHOR_ONLY, auditRunId, hash("a")]);

    await database.query(`delete from auth.users where id=$1`, [AUTHOR_ONLY]);

    assert.equal(await scalar(database, `
      select count(*)::integer value from auth.users where id=$1
    `, [AUTHOR_ONLY]), 0);
    const assignment = await database.query(`
      select created_by,authority_actor_id,authority_ref
      from private.authoring_design_parameter_assignments
      where workspace_id=$1 and assignment_id='actor-removal-assignment'
    `, [WORKSPACE]);
    assert.deepEqual(assignment.rows[0], {
      created_by: null,
      authority_actor_id: null,
      authority_ref: null
    });
    const auditAuthors = await database.query(`
      select run.created_by,completion.completed_by
      from private.authoring_audit_runs run
      join private.authoring_audit_run_completions completion
        on completion.audit_run_id=run.id
      where run.id=$1
    `, [auditRunId]);
    assert.deepEqual(auditAuthors.rows[0], {
      created_by: null,
      completed_by: null
    });
    assert.equal(await scalar(database, `
      select author_id is null value
      from private.authoring_workspace_observations where id=$1
    `, [findingId]), true);
  } finally {
    await database.close();
  }
});

test("GC é limitado, preserva referências e o resolver atende curso grande", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_design_parameter_assignments(
        workspace_id,assignment_id,assignment_version,model_version,action,
        parameter_id,parameter_version,scope_kind,scope_ref,scope_path,
        mode,value,authority_kind,authority_ref,locked,rationale,
        provenance_refs,based_on_workspace_revision,created_revision,created_by,
        created_at
      ) values
      ($1,'gc-assignment','1.0.0','1.0.0','set',
       'representation_fallback_policy','1.0.0','microsequence','micro-a',
       array['course-a','module-a','lesson-a','micro-a'],
       'auto','{"kind":"enum","value":"block"}','gpt',null,false,
       'Versão antiga.','{}',1,2,$2,now()-interval '400 days'),
      ($1,'gc-assignment','2.0.0','1.0.0','remove',
       'representation_fallback_policy','1.0.0','microsequence','micro-a',
       array['course-a','module-a','lesson-a','micro-a'],
       null,null,'gpt',null,false,'Tombstone.','{}',2,3,$2,
       now()-interval '399 days')
    `, [WORKSPACE, ACTOR]);
    await database.query(`
      insert into private.authoring_resource_sets(
        workspace_id,resource_set_id,resource_set_version,model_version,
        scope_kind,scope_ref,scope_path,resolved_catalog_version,facet_basis,
        allowed_fits,allow_embedded_practice,allow_response_packages,
        no_adequate_representation,provenance_refs,payload_hash,
        based_on_workspace_revision,created_revision,created_by,created_at
      ) values
      ($1::uuid,'gc-resource-set','1.0.0','1.0.0','workspace',($1::uuid)::text,'{}',
       '1.0.0','{"catalogVersion":"1.0.0","families":[],"disciplines":[],
       "structures":[],"taskOperations":[],"practiceModalities":[]}',
       array['canonical'],false,false,'block','{}',$2,1,2,$3,
       now()-interval '400 days'),
      ($1::uuid,'gc-resource-set','2.0.0','1.0.0','workspace',($1::uuid)::text,'{}',
       '1.0.0','{"catalogVersion":"1.0.0","families":[],"disciplines":[],
       "structures":[],"taskOperations":[],"practiceModalities":[]}',
       array['canonical'],false,false,'block','{}',$2,2,3,$3,
       now()-interval '399 days')
    `, [WORKSPACE, hash("a"), ACTOR]);
    const pruned = await scalar(database, `
      select private.prune_authoring_design_state_v1(
        $1,now()-interval '30 days',64
      ) value
    `, [WORKSPACE]);
    assert.equal(pruned.assignments, 1);
    assert.equal(pruned.resourceSets, 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_design_parameter_assignments
      where workspace_id=$1 and assignment_id='gc-assignment'
    `, [WORKSPACE]), 1);

    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      )
      select $1,'microsequence','micro-large-'||value,'lesson','lesson-a',
        value,'{}'::jsonb
      from generate_series(1,500) value
    `, [WORKSPACE]);
    const largeState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-large-500'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(largeState.analysisState, "unresolved");
    assert.equal(largeState.resourceAvailabilityState, "unresolved");
  } finally {
    await database.close();
  }
});

test("migration #107 instala o control plane experimental sobre #106", async () => {
  const database = await setupDatabase();
  try {
    await database.exec(`
      alter table private.authoring_workspaces
        add column if not exists purpose text not null default 'authoring',
        add column if not exists workspace_kind text not null default 'course_authoring',
        add column if not exists visibility text not null default 'private',
        add column if not exists source_course_id uuid;

      create table if not exists private.educational_workspace_members(
        workspace_id uuid not null references private.authoring_workspaces(id),
        user_id uuid not null references auth.users(id),
        role text not null,
        granted_by uuid references auth.users(id),
        joined_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key(workspace_id,user_id)
      );
      insert into private.educational_workspace_members(
        workspace_id,user_id,role,granted_by
      ) values('${WORKSPACE}','${ACTOR}','owner','${ACTOR}')
      on conflict do nothing;

      create table if not exists private.artifact_refs(
        hash text primary key,
        created_at timestamptz not null default now()
      );
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select null::uuid $$;
      create or replace function extensions.gen_random_uuid()
      returns uuid language sql volatile as $$ select gen_random_uuid() $$;
      create table public.courses(
        id uuid primary key,
        owner_id uuid references auth.users(id),
        status text not null,
        contract_key text not null,
        title text not null,
        goal text not null default '',
        contract_scope text,
        project_id uuid,
        position integer not null default 0,
        content_hash text,
        current_revision_hash text,
        revision_artifact_hash text,
        module_count integer not null default 0,
        lesson_count integer not null default 0,
        microsequence_count integer not null default 0,
        card_count integer not null default 0,
        document_storage_enabled boolean not null default true,
        completion_state text not null default 'complete',
        deleted_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create table private.course_revisions(
        course_id uuid not null references public.courses(id),
        revision_hash text not null,
        artifact_hash text not null references private.artifact_refs(hash),
        base_revision_hash text,
        validation_status text not null,
        validated_at timestamptz,
        published_at timestamptz,
        created_by uuid references auth.users(id),
        primary key(course_id,revision_hash)
      );
      create table private.authoring_workspace_publications(
        workspace_id uuid not null references private.authoring_workspaces(id),
        workspace_course_id text not null,
        target text not null,
        course_id uuid not null references public.courses(id),
        content_hash text not null references private.artifact_refs(hash),
        updated_at timestamptz not null default now(),
        primary key(workspace_id,workspace_course_id,target)
      );
      create table public.user_course_selections(
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        course_id uuid not null references public.courses(id),
        position integer not null default 0,
        updated_at timestamptz not null default now(),
        unique(user_id,course_id)
      );
      create table public.catalog_collection_courses(
        collection_id uuid not null,
        course_id uuid not null references public.courses(id),
        position integer not null default 0,
        deleted_at timestamptz,
        unique(collection_id,course_id)
      );
      create table private.catalog_review_submissions(
        id uuid primary key default gen_random_uuid(),
        artifact_hash text,
        source_course_id uuid,
        official_course_id uuid
      );
      create table private.course_revision_sync_changes(
        id bigint generated always as identity primary key,
        user_id uuid,
        scope text not null,
        entity_id uuid not null,
        operation text not null,
        revision_hash text
      );
      create or replace function private.can_publish_catalog_v5(uuid)
      returns boolean language sql stable as $$ select false $$;
      create or replace function private.educational_workspace_effective_role_v1(
        p_workspace_id uuid,p_actor_id uuid
      ) returns text language sql stable as $$
        select member.role from private.educational_workspace_members member
        where member.workspace_id=p_workspace_id and member.user_id=p_actor_id
      $$;
      create function public.get_authoring_workspace_v5(
        p_actor_id uuid,p_workspace_id uuid,p_course_ids text[] default null,
        p_include_card_content boolean default true
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'workspaceId',p_workspace_id,'capabilities',jsonb_build_object()
        )
      $$;
      create function private.educational_workspace_details_v1(
        p_actor_id uuid,p_workspace_id uuid
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'workspaceId',p_workspace_id,'capabilities',jsonb_build_object()
        )
      $$;
    `);
    await database.exec(await fs.readFile(experimentMigrationUrl, "utf8"));
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_research_consent_policy_availability
      where active
    `), 1);
    assert.equal(await scalar(database, `
      select private.educational_workspace_can_v1($1,$2,'research') value
    `, [WORKSPACE, ACTOR]), true);
  } finally {
    await database.close();
  }
});
