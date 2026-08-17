import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditVerticalParity,
  buildExactDatabaseInventory
} from "../../scripts/auditVerticalParity.mjs";

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

test("a regeneração sugere o caso estrutural pela relação sem dispensar o inventário exato", () => {
  const syntheticRegistry = {
    cases: [{
      id: "course-use",
      objects: { databasePatterns: ["^table:public\\.courses$"] }
    }]
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
