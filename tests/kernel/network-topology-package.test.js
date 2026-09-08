import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { renderStudyUnitEnvelope, validateStudyUnitEnvelope } from "../../src/resources/kernel/studyUnitEnvelope.js";

const packageId = "aralearn.resource.network_topology";
const contract = registry.getAuthoringContract(packageId, "1.0.0");
const instance = () => ({ id: "synthetic-topology", package: packageId, version: "1.0.0", data: structuredClone(contract.contract.example) });

test("topologia aceita hub e repetidor explícitos no exemplo completo em conteúdo e feedback", () => {
  const value = instance();
  assert.deepEqual(value.data.devices.filter(({ kind }) => ["hub", "repeater", "switch"].includes(kind)).map(({ kind }) => kind), ["hub", "repeater", "switch"]);
  for (const slot of ["content", "feedback"]) {
    const result = registry.validateInstance(value, slot);
    assert.equal(result.valid, true, result.errors.join(" "));
    assert.deepEqual(registry.normalizeInstance(value, slot).data.devices, value.data.devices);
  }
  value.data.devices[2].kind = "generic_hub";
  assert.equal(registry.validateInstance(value, "content").valid, false);
});

test("rótulo acessível preserva o tipo técnico e explica repetição sem comutação", () => {
  const value = instance();
  const text = registry.accessibleText(value, "content");
  assert.match(text, /Conexão das estações, Hub Ethernet/u);
  assert.match(text, /Regeneração entre trechos, Repetidor/u);
  assert.match(text, /Repetidor Ethernet multiporta/u);
  assert.match(text, /camada física/u);
  assert.match(text, /sem selecionar destino por endereço MAC/u);
  assert.match(text, /Acesso à rede comutada, Switch/u);
  assert.doesNotMatch(text, /Conexão das estações, Switch|Regeneração entre trechos, Switch/u);
  value.data.devices[4].label = "Hub é apenas um nome autoral";
  assert.match(registry.accessibleText(value, "content"), /Hub é apenas um nome autoral, Switch/u);
});

test("renderer mantém identidades, formas distintas do switch e rótulos explícitos", () => {
  const html = registry.renderInstance(instance(), "content");
  assert.match(html, /id=&quot;system-node-hub&quot;.*?shape=&quot;box&quot;/u);
  assert.match(html, /id=&quot;system-node-repeater&quot;.*?shape=&quot;ellipse&quot;/u);
  assert.match(html, /id=&quot;system-node-switch&quot;.*?shape=&quot;box3d&quot;/u);
  assert.match(html, /data-system-label-id="hub"[^>]*><span[^>]*><small>Hub Ethernet<\/small>/u);
  assert.match(html, /data-system-label-id="repeater"[^>]*><span[^>]*><small>Repetidor<\/small>/u);
});

test("lacunas de hub e repetidor ficam nos próprios nós pelo mecanismo compartilhado", () => {
  const content = registry.normalizeInstance(instance(), "content");
  const targets = registry.practiceTargets(content);
  const paths = ["devices[2].label", "devices[3].label"];
  for (const path of paths) assert.ok(targets.some((target) => target.path === path && target.modes.includes("gap")));
  const response = registry.normalizeInstance({ id: "network-gaps", package: "aralearn.response.gap", version: "1.0.0", data: {
    blanks: paths.map((targetPath, index) => ({ id: `device-${index}`, targetInstanceId: content.id, targetPath, responseMode: "choice", answer: content.data.devices[index + 2].label, distractors: ["Outra função"] }))
  } }, "response");
  const unit = { id: "synthetic-practice", position: 1, title: "Funções dos equipamentos", role: "practice", content: [content], response, feedback: [], topics: [] };
  const validation = validateStudyUnitEnvelope(unit, registry);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  const rendered = renderStudyUnitEnvelope(unit, registry, { studyUnitResponse: response, responseBlockKey: "network-gap", blockKey: "network-gap", responseState: { values: [] } });
  for (const id of ["hub", "repeater"]) {
    const template = rendered.contentHtml.match(new RegExp(String.raw`data-system-label-id="${id}"[^>]*>([\s\S]*?)<\/template>`, "u"));
    assert.ok(template, id);
    assert.match(template[1], /data-action="text-gap-open-choice"/u, id);
  }
});
