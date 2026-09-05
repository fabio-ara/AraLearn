import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { COURSE_COMPONENT_CATALOG_VERSION } from
  "../../src/domain/courseDesignParameters.js";
import { COURSE_COMPONENT_CATALOG_VERSION as EDGE_COMPONENT_CATALOG_VERSION } from
  "../../supabase/functions/_shared/aralearn/runtime/domain/courseDesignParameters.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../../src/resources/packages/index.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260903193000_add_open_response_component.sql",
  import.meta.url
);
const COURSE = "10000000-0000-4000-8000-000000000001";

test("catálogo de aplicação e catálogo de componentes têm uma revisão corrente", () => {
  assert.equal(COURSE_COMPONENT_CATALOG_VERSION, RESOURCE_CATALOG.catalogVersion);
  assert.equal(EDGE_COMPONENT_CATALOG_VERSION, COURSE_COMPONENT_CATALOG_VERSION);
  assert.match(RESOURCE_CATALOG.catalogVersion, /^1-[a-f0-9]{8}$/u);
  assert.equal(RESOURCE_CATALOG.explore().packageCount, 33);
  assert.equal(
    RESOURCE_CATALOG.getProfile("aralearn.response.open", "1.0.0").label,
    "Resposta aberta"
  );
});

test("upgrade preserva políticas e unidades existentes ao acrescentar resposta aberta", async () => {
  const database = new PGlite();
  const previousOptions = RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .filter(({ id }) => id !== "aralearn.response.open")
    .map(({ id, version, label, purpose }) => ({
      ref: `${id}@${version}`,
      label,
      purpose
    }));
  const previousCatalog = JSON.stringify({
    version: "1-3e5629f8",
    options: previousOptions
  });
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema private;
    create table public.courses(id uuid primary key);
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer as $$
      select '{"schemaRevision":"20260903160000","contractVersion":1}'::jsonb
    $$;
    create function public.get_owned_course_authoring_analytics_for_actor_v2(
      p_actor_id uuid,
      p_course_id uuid,
      p_expected_course_revision bigint,
      p_query jsonb
    ) returns jsonb language sql stable security definer as $$
      select jsonb_build_object('missingData',jsonb_build_array(
        format('%s StudyUnits não possuem aplicação pedagógica corrente.',2),
        format('%s StudyUnits não possuem os seis parâmetros usados.',2),
        format('%s direções editoriais excederam o limite do snapshot.',1),
        'Há mudanças de StudyUnit sem origem explicitamente observável.'
      ))
    $$;
    create function private.course_component_catalog_v1()
    returns jsonb language sql immutable as $$
      select $catalog$${previousCatalog}$catalog$::jsonb
    $$;
    create function private.valid_course_component_policy_v1(p_policy jsonb)
    returns boolean language sql stable as $$
      select p_policy->>'catalogVersion' =
        private.course_component_catalog_v1()->>'version'
    $$;
    create table private.course_component_policy_assignments(
      course_id uuid not null references public.courses(id),
      scope_kind text not null,
      scope_ref text not null,
      policy jsonb not null,
      origin text not null,
      reason text not null,
      updated_at timestamptz not null default now(),
      primary key(course_id,scope_kind,scope_ref),
      constraint course_component_policy_assignments_policy_v1 check(
        private.valid_course_component_policy_v1(policy)
      )
    );
    create table private.course_entities(
      course_id uuid not null references public.courses(id),
      entity_type text not null,
      entity_id text not null,
      content jsonb not null,
      design_snapshot jsonb,
      primary key(course_id,entity_type,entity_id)
    );
    insert into public.courses(id) values('${COURSE}');
    insert into private.course_component_policy_assignments(
      course_id,scope_kind,scope_ref,policy,origin,reason
    ) values
    (
      '${COURSE}','course','${COURSE}',
      '{"catalogVersion":"1-3e5629f8","availability":"allow_only",
        "allowedRefs":["aralearn.resource.paragraph@1.0.0"],
        "excludedRefs":["aralearn.response.choice@1.0.0"],
        "preferredRefs":["aralearn.resource.paragraph@1.0.0"]}',
      'author','Condição existente preservada.'
    ),(
      '${COURSE}','didactic_microsequence','research-all',
      '{"catalogVersion":"1-3e5629f8","availability":"all",
        "allowedRefs":[],
        "excludedRefs":["aralearn.response.choice@1.0.0"],
        "preferredRefs":[]}',
      'research_condition','Universo experimental anterior preservado.'
    ),(
      '${COURSE}','didactic_microsequence','automatic-all',
      '{"catalogVersion":"1-3e5629f8","availability":"all",
        "allowedRefs":[],"excludedRefs":[],"preferredRefs":[]}',
      'automatic','Configuração automática acompanha o catálogo.'
    ),(
      '${COURSE}','didactic_microsequence','author-all',
      '{"catalogVersion":"1-3e5629f8","availability":"all",
        "allowedRefs":[],"excludedRefs":[],"preferredRefs":[]}',
      'author','A autoria escolheu todos os componentes disponíveis.'
    );
    insert into private.course_entities(
      course_id,entity_type,entity_id,content,design_snapshot
    ) values(
      '${COURSE}','study_unit','unit-existing',
      '{"title":"Unidade existente","role":"theory","content":[],
        "response":null,"feedback":[],"topics":[]}',
      '{"contract":"aralearn.study-unit-design-snapshot.v1",
        "componentPolicy":{"policy":{
          "catalogVersion":"1-3e5629f8","availability":"all",
          "allowedRefs":[],"excludedRefs":[],"preferredRefs":[]},
          "origin":"automatic","sourceScopeKind":"course"}}'
    );
  `);

  await database.exec(await fs.readFile(migrationUrl, "utf8"));

  const catalog = (await database.query(
    "select private.course_component_catalog_v1() value"
  )).rows[0].value;
  assert.equal(catalog.version, "1-4616b2e5");
  assert.equal(catalog.options.length, 33);
  assert.deepEqual(catalog.options, RESOURCE_PACKAGE_REGISTRY.listCatalog().map(
    ({ id, version, label, purpose }) => ({
      ref: `${id}@${version}`,
      label,
      purpose
    })
  ));

  const assignment = (await database.query(`
    select policy,origin,reason from private.course_component_policy_assignments
    where scope_kind='course' and scope_ref='${COURSE}'
  `)).rows[0];
  assert.deepEqual(assignment.policy, {
    catalogVersion: "1-4616b2e5",
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.paragraph@1.0.0"],
    excludedRefs: ["aralearn.response.choice@1.0.0"],
    preferredRefs: ["aralearn.resource.paragraph@1.0.0"]
  });
  assert.equal(assignment.origin, "author");
  assert.equal(assignment.reason, "Condição existente preservada.");

  const assignments = Object.fromEntries((await database.query(`
    select scope_ref,policy,origin,reason
    from private.course_component_policy_assignments
    where scope_kind='didactic_microsequence'
  `)).rows.map((row) => [row.scope_ref, row]));
  assert.deepEqual(assignments["research-all"].policy.excludedRefs, [
    "aralearn.response.choice@1.0.0",
    "aralearn.response.open@1.0.0"
  ]);
  assert.equal(assignments["research-all"].origin, "research_condition");
  assert.equal(
    assignments["research-all"].reason,
    "Universo experimental anterior preservado."
  );
  assert.deepEqual(assignments["automatic-all"].policy.excludedRefs, []);
  assert.deepEqual(assignments["author-all"].policy.excludedRefs, []);
  assert.ok(Object.values(assignments).every(
    ({ policy }) => policy.catalogVersion === "1-4616b2e5"
  ));

  const entity = (await database.query(`
    select content,design_snapshot snapshot from private.course_entities
    where entity_id='unit-existing'
  `)).rows[0];
  assert.equal(
    entity.snapshot.componentPolicy.policy.catalogVersion,
    "1-4616b2e5"
  );
  assert.equal(entity.content.title, "Unidade existente");
  assert.equal(
    entity.snapshot.componentPolicy.policy.availability,
    "all"
  );
  assert.deepEqual(entity.snapshot.componentPolicy.policy.excludedRefs, [
    "aralearn.response.open@1.0.0"
  ]);

  const currentRefs = RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .map(({ id, version }) => `${id}@${version}`);
  const policies = {
    defaultAll: {
      catalogVersion: "1-4616b2e5",
      availability: "all",
      allowedRefs: [],
      excludedRefs: [],
      preferredRefs: []
    },
    denyAllCurrent: {
      catalogVersion: "1-4616b2e5",
      availability: "all",
      allowedRefs: [],
      excludedRefs: currentRefs,
      preferredRefs: []
    },
    fixedCurrent: {
      catalogVersion: "1-4616b2e5",
      availability: "allow_only",
      allowedRefs: currentRefs,
      excludedRefs: [],
      preferredRefs: ["aralearn.response.open@1.0.0"]
    }
  };
  for (const policy of Object.values(policies)) {
    const result = (await database.query(`
      select private.valid_course_component_policy_v1(
        $policy$${JSON.stringify(policy)}$policy$::jsonb
      ) valid
    `)).rows[0];
    assert.equal(result.valid, true);
  }
  assert.equal(
    policies.defaultAll.excludedRefs.includes("aralearn.response.open@1.0.0"),
    false
  );
  await database.exec(`
    insert into private.course_component_policy_assignments(
      course_id,scope_kind,scope_ref,policy,origin,reason
    ) values(
      '${COURSE}','didactic_microsequence','new-fixed',
      $policy$${JSON.stringify(policies.fixedCurrent)}$policy$::jsonb,
      'research_condition','Condição nova fixa os 33 componentes correntes.'
    )
  `);
  const fixed = (await database.query(`
    select policy,origin,reason
    from private.course_component_policy_assignments
    where scope_ref='new-fixed'
  `)).rows[0];
  assert.equal(fixed.policy.allowedRefs.length, 33);
  assert.equal(fixed.origin, "research_condition");
  assert.equal(fixed.reason, "Condição nova fixa os 33 componentes correntes.");
  assert.equal(
    (await database.query(`
      select public.get_aralearn_runtime_manifest()->>'schemaRevision' revision
    `)).rows[0].revision,
    "20260903193000"
  );
  const missingData = (await database.query(`
    select public.get_owned_course_authoring_analytics_for_actor_v2(
      '${COURSE}','${COURSE}',1,'{}'::jsonb
    )->'missingData' value
  `)).rows[0].value;
  assert.deepEqual(missingData, [
    "Unidades de estudo sem informações pedagógicas completas: 2.",
    "Unidades de estudo sem configuração aplicada completa: 2.",
    "Direções editoriais que não puderam ser mostradas integralmente: 1.",
    "Há unidades de estudo cuja origem de autoria não foi registrada."
  ]);
  assert.doesNotMatch(
    JSON.stringify(missingData),
    /StudyUnits?|AnalysisUnits?|missingData|snapshot|schema|\bCAS\b/iu
  );
});
