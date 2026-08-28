import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditVerticalParity,
  buildExactDatabaseInventory
} from "../../scripts/auditVerticalParity.mjs";
import { COURSE_MCP_TOOLS } from "../../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const registryPath = path.join(
  repositoryRoot,
  "docs/evidence/paridade-vertical.v1.json"
);
const databaseInventoryPath = path.join(
  repositoryRoot,
  "docs/evidence/paridade-vertical-banco.v1.json"
);

async function registry() {
  return JSON.parse(await readFile(registryPath, "utf8"));
}

async function registeredDatabaseObjects() {
  const inventory = JSON.parse(await readFile(databaseInventoryPath, "utf8"));
  return inventory.objects.map((entry) => entry.object);
}

test("o registro corrente cobre UI, ferramentas, Edge, manifesto e testes", async () => {
  assert.deepEqual(await auditVerticalParity({ repositoryRoot }), []);
});

test("o registro usa somente as cinco ferramentas públicas canônicas de Curso", async () => {
  const current = await registry();
  const registered = current.cases.flatMap((caseRecord) =>
    caseRecord.objects?.mcpTools || []
  ).toSorted();
  assert.deepEqual(
    registered,
    COURSE_MCP_TOOLS.map(({ name }) => name).toSorted()
  );
  assert.equal(current.cases.some((caseRecord) =>
    Object.hasOwn(caseRecord.objects || {}, "applicationTools") ||
    Object.hasOwn(caseRecord.objects || {}, "applicationToolPatterns")
  ), false);
});

test("o audit rejeita o canal abolido de ferramentas exclusivas do aplicativo", async () => {
  const changedRegistry = await registry();
  changedRegistry.cases[0].objects.applicationTools = ["operacaoParalela"];
  const findings = await auditVerticalParity({
    repositoryRoot,
    registry: changedRegistry
  });
  assert.ok(findings.includes(
    "study-course-experience: applicationTools foi abolido; aplicativo e MCP usam as mesmas operações de Curso."
  ));
});

test("o inventário exato cobre os onze casos correntes", async () => {
  const current = await registry();
  const inventory = JSON.parse(await readFile(databaseInventoryPath, "utf8"));
  const assignments = new Map(inventory.objects.map(({ object, caseId }) => [object, caseId]));
  const counts = Object.fromEntries(current.cases.map(({ id }) => [
    id,
    inventory.objects.filter(({ caseId }) => caseId === id).length
  ]));
  assert.equal(inventory.objects.length, 786);
  assert.deepEqual(counts, {
    "study-course-experience": 40,
    "course-authoring-experience": 295,
    "course-source-provenance": 122,
    "course-anchored-annotations": 86,
    "course-audit-corrections": 91,
    "course-variant-comparisons": 51,
    "course-authoring-research": 1,
    "current-data-lifecycle": 20,
    "person-profile-and-course-access": 31,
    "didactic-component-runtime": 1,
    "course-shared-transports": 48
  });
  const currentCaseIds = current.cases
    .filter(({ status }) => status === "current")
    .map(({ id }) => id);
  assert.equal(currentCaseIds.length, 11);
  assert.deepEqual(
    new Set(inventory.objects.map(({ caseId }) => caseId)),
    new Set(currentCaseIds)
  );
  assert.equal(assignments.get("table:public.courses"), "course-authoring-experience");
  assert.equal(
    assignments.get("table:private.course_source_revisions"),
    "course-source-provenance"
  );
  assert.equal(
    assignments.get("table:private.course_source_pdf_upload_intents"),
    "course-source-provenance"
  );
  assert.equal(
    assignments.get(
      "function:private.commit_course_instructional_plan_sources_core_v1(p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_expected_plan_version bigint, p_command jsonb, p_plan jsonb, p_channel text, p_request_id text)"
    ),
    "course-source-provenance"
  );
  assert.equal(
    assignments.get("table:private.course_access_grant_rate_limits"),
    "current-data-lifecycle"
  );
  assert.equal(
    assignments.get("table:private.course_anchored_annotations"),
    "course-anchored-annotations"
  );
  assert.equal(
    assignments.get("table:public.course_personal_states"),
    "study-course-experience"
  );
  assert.equal(
    assignments.get("table:public.person_profiles"),
    "person-profile-and-course-access"
  );
  assert.equal(
    assignments.get("function:public.get_aralearn_runtime_manifest()"),
    "didactic-component-runtime"
  );
  assert.equal(
    assignments.get("function:public.aralearn_mcp_access_token_hook(event jsonb)"),
    "course-shared-transports"
  );
  assert.equal(
    assignments.get("table:private.authoring_action_oauth_clients"),
    "course-shared-transports"
  );
});

test("o workflow compara o inventário completo logo após reconstruir o banco", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github/workflows/validacao.yml"),
    "utf8"
  );
  const resetIndex = workflow.indexOf("npx --yes supabase@2.115.0 db reset");
  const parityIndex = workflow.indexOf("- name: Conferir paridade vertical no banco real");
  const lintIndex = workflow.indexOf("- name: Conferir o lint do banco");
  assert.ok(resetIndex >= 0 && parityIndex > resetIndex && lintIndex > parityIndex);
  for (const token of [
    "c.relkind in ('r', 'p', 'v', 'm')",
    "pg_get_function_identity_arguments(p.oid)",
    "from pg_index x",
    "from pg_constraint k",
    "from pg_trigger t",
    "from pg_policy p",
    "c.relforcerowsecurity",
    "from storage.buckets",
    "--database-inventory -"
  ]) {
    assert.ok(workflow.includes(token), `consulta ausente no workflow: ${token}`);
  }
});

test("o audit rejeita um objeto de backend órfão", async () => {
  const databaseInventory = await registeredDatabaseObjects();
  databaseInventory.push("function:public.backend_orfao_v1()");
  const findings = await auditVerticalParity({
    repositoryRoot,
    databaseInventory
  });
  assert.ok(findings.some((finding) => finding.includes(
    "objeto de banco real novo sem registro exato: function:public.backend_orfao_v1()"
  )));
});

test("um objeto novo falha mesmo quando combina com um prefixo já classificado", async () => {
  const databaseInventory = await registeredDatabaseObjects();
  const matchingExistingPrefix = "table:private.course_revision_nova_sombra";
  databaseInventory.push(matchingExistingPrefix);
  const findings = await auditVerticalParity({ repositoryRoot, databaseInventory });
  assert.ok(findings.includes(
    `objeto de banco real novo sem registro exato: ${matchingExistingPrefix}.`
  ));
});

test("uma função privada nova não é aceita pelo seletor auxiliar genérico", async () => {
  const databaseInventory = await registeredDatabaseObjects();
  const matchingInternalPattern = "function:private.authoring_auxiliar_fantasma_v1()";
  databaseInventory.push(matchingInternalPattern);
  const findings = await auditVerticalParity({ repositoryRoot, databaseInventory });
  assert.ok(findings.includes(
    `objeto de banco real novo sem registro exato: ${matchingInternalPattern}.`
  ));
});

test("índice, restrição, trigger, policy e estado RLS novos exigem revisão explícita", async () => {
  const registered = await registeredDatabaseObjects();
  const currentRls = registered.find((object) => object.startsWith("rls:public.courses="));
  const alternateRls = ["disabled", "enabled", "forced"]
    .map((state) => `rls:public.courses=${state}`)
    .find((object) => object !== currentRls);
  const additions = [
    "index:public.courses/courses_indice_fantasma",
    "constraint:public.courses/courses_check_fantasma[check]",
    "trigger:public.courses/courses_trigger_fantasma",
    "policy:public.courses/courses_policy_fantasma",
    alternateRls
  ];
  for (const object of additions) {
    const databaseInventory = [...registered];
    databaseInventory.push(object);
    const findings = await auditVerticalParity({ repositoryRoot, databaseInventory });
    assert.ok(findings.includes(
      `objeto de banco real novo sem registro exato: ${object}.`
    ));
  }
});

test("o catch-all interno não toma estruturas filhas de um caso primário", () => {
  const syntheticRegistry = {
    cases: [
      {
        id: "course-use",
        objects: { databasePatterns: ["^table:public\\.courses$"] }
      },
      {
        id: "legacy-removal",
        objects: {
          databaseInternalPatterns: [
            "^(?:table|view|materialized_view|function|bucket|index|constraint|trigger|policy|rls):.+$"
          ]
        }
      }
    ]
  };
  const databaseObjects = [
    "table:public.courses",
    "index:public.courses/courses_pkey",
    "constraint:public.courses/courses_pkey[primary_key]",
    "trigger:public.courses/courses_touch",
    "policy:public.courses/courses_select",
    "rls:public.courses=enabled"
  ];
  const { findings, inventory } = buildExactDatabaseInventory(
    syntheticRegistry,
    databaseObjects
  );
  assert.deepEqual(findings, []);
  assert.deepEqual(
    inventory.objects.map((entry) => entry.caseId),
    databaseObjects.toSorted().map(() => "course-use")
  );
});

test("a regeneração recusa tabela sem estado RLS explícito", () => {
  const { findings } = buildExactDatabaseInventory({
    cases: [{
      id: "course-use",
      objects: { databasePatterns: ["^table:public\\.courses$"] }
    }]
  }, ["table:public.courses"]);
  assert.ok(findings.includes(
    "Inventário regenerado do banco: table:public.courses deve possuir exatamente um estado RLS; encontrados 0."
  ));
});

test("o audit rejeita um consumidor de interface inexistente", async () => {
  const changedRegistry = await registry();
  changedRegistry.cases[0].ui[0] = {
    path: "src/ui/ConsumidorInexistente.js",
    token: "data-action=\"open-course\""
  };
  const findings = await auditVerticalParity({
    repositoryRoot,
    registry: changedRegistry
  });
  assert.ok(findings.some((finding) => finding.includes(
    "arquivo inexistente (src/ui/ConsumidorInexistente.js)"
  )));
});
