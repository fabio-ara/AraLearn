import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  renderCardEnvelope,
  validateCardEnvelope
} from "../../src/resources/kernel/cardEnvelope.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import {
  RESOURCE_PACKAGE_REGISTRY,
  terminalSessionPackage
} from "../../src/resources/packages/index.js";
import { inferAcademicTaxonomy } from "../../src/resources/catalog/vocabularies.js";

const fixtureUrl = new URL("../fixtures/package/terminal-session-stress.json", import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
const source = fs.readFileSync(
  new URL("../../src/resources/packages/terminal-session/index.js", import.meta.url),
  "utf8"
).replace(/\r\n?/gu, "\n");
const styles = fs.readFileSync(
  new URL("../../public/styles.css", import.meta.url),
  "utf8"
).replace(/\r\n?/gu, "\n");

const PACKAGE_ID = "aralearn.resource.terminal_session";
const VERSION = "1.0.0";

function normalizeCase(caseId, instanceId = caseId) {
  const value = fixture.cases.find(({ id }) => id === caseId);
  assert.ok(value, caseId);
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: instanceId,
    package: PACKAGE_ID,
    version: VERSION,
    data: value.data
  }, "content");
}

test("terminal_session declara contrato temporal, metadados acadêmicos e prática conservadora", () => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(PACKAGE_ID, VERSION);
  assert.equal(contract.manifest.label, "Sessão de terminal");
  assert.deepEqual(contract.contract.required, ["prompt", "environment", "interactions"]);
  assert.deepEqual(contract.contract.optional, ["initialContext"]);
  assert.deepEqual(contract.schema.required, ["prompt", "environment", "interactions"]);
  assert.equal(contract.schema.additionalProperties, false);
  assert.deepEqual(
    contract.schema.properties.interactions.items.required,
    ["input"]
  );
  assert.deepEqual(
    Object.keys(contract.schema.properties.interactions.items.properties),
    ["prompt", "input", "stdout", "stderr", "exitCode", "effect"]
  );
  assert.deepEqual(
    contract.practiceTargets,
    contract.contract.example.interactions.map((_, index) => ({
      path: `interactions[${index}].input`,
      label: `Lacuna de escolha na entrada ${index + 1}`,
      modes: ["gap"]
    }))
  );
  assert.equal(contract.practiceTargets.some(({ modes }) => modes.includes("typing")), false);

  for (const operation of [
    "trace-interaction",
    "interpret-output",
    "identify-error",
    "relate-action-consequence",
    "compare-state",
    "diagnose-situation",
    "predict-result",
    "recognize-command"
  ]) assert.ok(contract.manifest.cognitiveOperations.includes(operation), operation);

  const profile = RESOURCE_CATALOG.getProfile(PACKAGE_ID, VERSION);
  assert.equal(profile.primaryFamilyId, "family.process_state");
  assert.deepEqual(profile.structureIds, [
    "structure.terminal_session",
    "structure.process",
    "structure.state_transition"
  ]);
  assert.equal(profile.specificity, "versatile");
  assert.ok(profile.knowledgeObjects.includes("sessão textual de terminal"));
  assert.ok(profile.operationIds.includes("operation.identify"));
  assert.ok(profile.operationIds.includes("operation.trace"));
  assert.match(profile.limitations.join(" "), /Não executa nem interpreta comandos/u);
  assert.match(profile.accessibility, /lista cronológica/u);

  const discovery = RESOURCE_CATALOG.search({
    query: "sessão textual terminal stdout stderr comando resultado",
    structureIds: ["structure.terminal_session"],
    operationIds: ["operation.trace"],
    practiceModeIds: ["practice.gap"]
  });
  assert.equal(discovery.coverage.status, "canonical");
  assert.equal(discovery.candidates[0].packageId, PACKAGE_ID);
});

test("fixtures de Linux, Git, SQL e console administrativo validam e preservam a sessão", () => {
  assert.equal(fixture.contract, "aralearn.resource.terminal_session.fixture.v1");
  assert.deepEqual(fixture.cases.map(({ id }) => id), [
    "linux-permission-transition",
    "git-working-tree-transition",
    "sql-error-and-update",
    "administrative-cloud-long-output"
  ]);

  for (const value of fixture.cases) {
    const instance = normalizeCase(value.id);
    assert.equal(JSON.stringify(instance), JSON.stringify(normalizeCase(value.id)), value.id);
    const validation = RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "content");
    assert.equal(validation.valid, true, `${value.id}: ${validation.errors.join(" ")}`);
    const rendered = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "content");
    assert.match(rendered, /class="runtime-block package-terminal-session"/u, value.id);
    assert.match(rendered, /<ol aria-label="Interações da sessão">/u, value.id);
    assert.equal(
      (rendered.match(/data-terminal-interaction=/gu) || []).length,
      value.data.interactions.length,
      value.id
    );
    assert.ok(RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "content"), value.id);
  }

  const linux = normalizeCase("linux-permission-transition");
  const linuxHtml = RESOURCE_PACKAGE_REGISTRY.renderInstance(linux, "content");
  assert.match(linuxHtml, /class="package-terminal-stream is-stdout is-empty"/u);
  assert.match(linuxHtml, /class="package-terminal-stream is-stderr"/u);
  assert.match(linuxHtml, /Permission denied/u);
  assert.match(linuxHtml, /package-terminal-exit is-error[^]*?<code>126<\/code>/u);
  assert.match(linuxHtml, /package-terminal-exit is-success[^]*?<code>0<\/code>/u);

  const git = normalizeCase("git-working-tree-transition");
  assert.equal(git.data.interactions[0].stdout, " M src/app.js\n?? notas & rascunhos.txt");
  assert.equal(git.data.interactions[2].stdout, "M  src/app.js\n?? notas & rascunhos.txt");

  const sql = normalizeCase("sql-error-and-update");
  assert.equal(sql.data.interactions[2].input.split("\n").length, 4);
  const sqlHtml = RESOURCE_PACKAGE_REGISTRY.renderInstance(sql, "content");
  assert.match(sqlHtml, /UPDATE estudantes\nSET ativo = true\nWHERE id = 2/u);
  assert.match(sqlHtml, /relation &quot;estudante&quot; does not exist/u);

  const administrative = normalizeCase("administrative-cloud-long-output");
  const longOutput = administrative.data.interactions[0].stdout;
  assert.ok(longOutput.split("\n").length > 40);
  assert.ok(longOutput.length > 1000);
  const administrativeHtml = RESOURCE_PACKAGE_REGISTRY.renderInstance(administrative, "content");
  assert.match(administrativeHtml, /<samp>/u);
  assert.match(administrativeHtml, /api &lt;principal&gt; &amp; worker/u);
  assert.doesNotMatch(administrativeHtml, /<principal>/u);
  assert.match(administrativeHtml, /equipe &quot;Plataforma &amp; Dados&quot;/u);
  const accessible = RESOURCE_PACKAGE_REGISTRY.accessibleText(administrative, "content");
  assert.match(accessible, /api <principal> & worker/u);
  assert.match(accessible, /Código de saída: 3/u);
});

test("facetas preservam isoladamente interpretação de saída e relação ação-consequência", () => {
  assert.deepEqual(
    inferAcademicTaxonomy({ cognitiveOperations: ["interpret-output"] }).operationIds,
    ["operation.identify"]
  );
  assert.deepEqual(
    inferAcademicTaxonomy({ cognitiveOperations: ["relate-action-consequence"] }).operationIds,
    ["operation.trace"]
  );
});

test("normalização distingue stream vazio de stream omitido e conserva texto monoespaçado", () => {
  const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "whitespace-session",
    package: PACKAGE_ID,
    version: VERSION,
    data: {
      prompt: "Observe espaços e quebras.",
      environment: "Interface textual",
      interactions: [{
        prompt: ">",
        input: "tool <<'END'\r\n  linha com dois espaços  \r\nEND",
        stdout: "",
        effect: "entrada recebida"
      }]
    }
  }, "content");
  assert.equal(instance.data.interactions[0].input, "tool <<'END'\n  linha com dois espaços  \nEND");
  assert.equal(Object.hasOwn(instance.data.interactions[0], "stdout"), true);
  assert.equal(instance.data.interactions[0].stdout, "");
  assert.equal(Object.hasOwn(instance.data.interactions[0], "stderr"), false);

  const rendered = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "content");
  assert.match(rendered, /tool &lt;&lt;&#39;END&#39;\n {2}linha com dois espaços {2}\nEND/u);
  assert.match(rendered, /<pre tabindex="0" aria-label="Entrada da interação 1">/u);
  assert.match(rendered, /role="group" aria-label="Saída padrão da interação 1"/u);
  assert.match(rendered, /Estado ou efeito:<\/span> entrada recebida/u);
});

test("validação recusa forma aberta, entrada vazia e interação sem observação", () => {
  const base = {
    id: "invalid-terminal",
    package: PACKAGE_ID,
    version: VERSION,
    data: {
      prompt: "Observe.",
      environment: "Terminal",
      interactions: [{ input: "status", stdout: "ok" }]
    }
  };
  const unknown = structuredClone(base);
  unknown.data.execute = true;
  assert.match(
    RESOURCE_PACKAGE_REGISTRY.validateInstance(unknown, "content").errors.join(" "),
    /execute não é permitido/u
  );

  const emptyInput = structuredClone(base);
  emptyInput.data.interactions[0].input = " \n ";
  assert.match(
    RESOURCE_PACKAGE_REGISTRY.validateInstance(emptyInput, "content").errors.join(" "),
    /input não vazio/u
  );

  const noObservation = structuredClone(base);
  noObservation.data.interactions = [{ input: "status" }];
  assert.match(
    RESOURCE_PACKAGE_REGISTRY.validateInstance(noObservation, "content").errors.join(" "),
    /efeito observável/u
  );

  const multilinePrompt = structuredClone(base);
  multilinePrompt.data.interactions[0].prompt = "$\n>";
  assert.match(
    RESOURCE_PACKAGE_REGISTRY.validateInstance(multilinePrompt, "content").errors.join(" "),
    /prompt visual em uma única linha/u
  );

  for (const [field, invalidValue] of [
    ["stdout", null],
    ["stderr", null],
    ["exitCode", null],
    ["exitCode", ""],
    ["exitCode", "0"]
  ]) {
    const invalidObservedValue = structuredClone(base);
    invalidObservedValue.data.interactions[0][field] = invalidValue;
    assert.throws(
      () => RESOURCE_PACKAGE_REGISTRY.normalizeInstance(invalidObservedValue, "content"),
      /precisa ser (?:string|integer)/u,
      `${field}=${JSON.stringify(invalidValue)} não pode ser convertido silenciosamente`
    );
  }
});

test("gap de escolha materializa somente dentro da entrada e permanece determinístico", () => {
  const content = normalizeCase("linux-permission-transition", "terminal-content");
  const response = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: "terminal-response",
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      prompt: "Complete a opção que concede execução ao usuário.",
      blanks: [{
        id: "permission",
        targetInstanceId: content.id,
        targetPath: "interactions[2].input",
        label: "Opção de permissão",
        responseMode: "choice",
        answer: "u+x",
        distractors: ["a+x", "u-x", "g+x"]
      }]
    }
  }, "response");
  const card = {
    id: "terminal-practice",
    position: 1,
    title: "Permissão de execução",
    role: "practice",
    content: [content],
    response,
    feedback: [],
    topics: [],
    sources: []
  };
  const validation = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
  assert.equal(validation.valid, true, validation.errors.join(" "));

  const rendered = renderCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY, {
    cardResponse: response,
    responseBlockKey: "terminal-response-block",
    blockKey: "terminal-response-block",
    responseState: { values: [] }
  });
  assert.match(
    rendered.contentHtml,
    /package-terminal-input[^]*?data-action="text-gap-open-choice"/u
  );
  assert.doesNotMatch(
    rendered.contentHtml.match(/<p class="runtime-markdown-paragraph"[^]*?<\/p>/u)?.[0] || "",
    /data-action="text-gap-open-choice"/u
  );
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(response, { values: { permission: "u+x" } }).correct,
    true
  );
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(response, { values: { permission: "chmod u+x" } }).correct,
    false
  );
});

test("renderer é somente leitura, copiável e limita saída extensa à rolagem local", () => {
  assert.equal(terminalSessionPackage.hydrate, undefined);
  assert.doesNotMatch(
    source,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|execFile|spawn|child_process)\b|Deno\.Command|Bun\.spawn/u
  );
  const html = RESOURCE_PACKAGE_REGISTRY.renderInstance(
    normalizeCase("administrative-cloud-long-output"),
    "content"
  );
  assert.doesNotMatch(html, /<(?:script|button|form|input|textarea)\b|contenteditable=/iu);
  assert.match(html, /<pre tabindex="0" aria-label="Entrada da interação 1"><code>/u);
  assert.match(styles, /\.package-terminal-session pre\s*\{[^}]*overflow:\s*auto;/su);
  assert.match(styles, /\.package-terminal-stream pre\s*\{[^}]*max-height:\s*min\(38vh, 20rem\);/su);
  assert.match(styles, /\.package-terminal-session pre\s*\{[^}]*user-select:\s*text;/su);
  assert.match(styles, /\.package-terminal-session pre\s*\{[^}]*font-size:\s*var\(--type-dense\);/su);
});
