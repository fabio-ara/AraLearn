import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const extensionId = "aralearn.response.extension_probe";

async function sourceDigests(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return new Map(await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const absolute = path.join(entry.parentPath, entry.name);
    return [path.relative(root, absolute), createHash("sha256").update(await readFile(absolute)).digest("hex")];
  })));
}

test("pacote compatível novo percorre catálogo, persistência e interação sem alterar o núcleo", async (t) => {
  const temporaryRoot = await realpath(os.tmpdir());
  const sandbox = await mkdtemp(path.join(temporaryRoot, "aralearn-package-extension-"));
  t.after(async () => {
    const resolved = await realpath(sandbox);
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.ok(path.basename(resolved).startsWith("aralearn-package-extension-"));
    assert.equal(resolved, sandbox);
    await rm(resolved, { recursive: true, force: true });
  });
  const sourceRoot = path.join(sandbox, "src");
  await cp(path.join(repositoryRoot, "src"), sourceRoot, { recursive: true });
  await cp(path.join(repositoryRoot, "package.json"), path.join(sandbox, "package.json"));
  const before = await sourceDigests(sourceRoot);
  const extensionDirectory = path.join(sourceRoot, "resources", "packages", "extension-probe");
  await mkdir(extensionDirectory);
  await writeFile(path.join(extensionDirectory, "index.js"), `
import { openResponsePackage } from "../open-response/index.js";
export const extensionProbePackage = Object.freeze({
  ...openResponsePackage,
  manifest: Object.freeze({
    ...openResponsePackage.manifest,
    id: ${JSON.stringify(extensionId)},
    label: "Resposta de extensão isolada",
    purpose: "Provar descoberta de extensão isolada com produção textual."
  })
});
`, "utf8");
  await execFileAsync(process.execPath, [path.join(repositoryRoot, "scripts", "generateResourcePackageIndex.mjs")], {
    cwd: sandbox, timeout: 30_000, windowsHide: true
  });

  const importSandbox = (relative) => import(pathToFileURL(path.join(sourceRoot, relative)).href);
  const [{ RESOURCE_CATALOG: catalog, RESOURCE_PACKAGE_REGISTRY: registry }, envelope, persistence, projectDomain, renderer, designDomain] = await Promise.all([
    importSandbox("resources/packages/index.js"),
    importSandbox("resources/kernel/studyUnitEnvelope.js"),
    importSandbox("domain/courseEntities.js"),
    importSandbox("domain/aralearnProject.js"),
    importSandbox("render/renderPackageStudyUnit.js"),
    importSandbox("domain/courseDesignParameters.js")
  ]);
  const manifest = registry.listCatalog({ slot: "response" }).find(({ id }) => id === extensionId);
  assert.ok(manifest, "O índice gerado precisa descobrir a pasta acrescentada.");
  assert.ok(catalog.search({ slot: "response", query: "extensão isolada" }).candidates.some(({ packageId }) => packageId === extensionId));
  const identity = { packageId: extensionId, version: manifest.version };
  assert.ok(designDomain.COURSE_COMPONENT_CATALOG.options.some(({ ref }) => ref === `${extensionId}@${manifest.version}`));
  assert.equal(catalog.inspect([identity]).items[0].status, "ok");
  const contract = catalog.contracts([identity]).items[0];
  assert.equal(contract.status, "ok");
  assert.equal(contract.definition.package, extensionId);

  const response = registry.normalizeInstance({
    id: "extension-answer", package: extensionId, version: manifest.version,
    data: { prompt: "  Explique por que as duas proposições precisam ser verdadeiras.  " }
  }, "response");
  assert.equal(response.data.prompt, "Explique por que as duas proposições precisam ser verdadeiras.");
  assert.throws(() => registry.normalizeInstance({ ...response, data: { prompt: "" } }, "response"), /prompt/u);
  assert.equal(registry.validateInstance(response, "content").valid, false);
  const studyUnit = envelope.normalizeStudyUnitEnvelope({
    id: "extension-unit", position: 1, title: "Explique a conjunção", role: "practice",
    content: [], response, feedback: [], topics: []
  }, registry);
  assert.equal(envelope.validateStudyUnitEnvelope(studyUnit, registry).valid, true);

  const project = JSON.parse(await readFile(path.join(repositoryRoot, "tests", "fixtures", "package", "project-minimal.json"), "utf8"));
  project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits = [studyUnit];
  const validation = projectDomain.validateProjectDocument(project);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const flattened = persistence.flattenCourseDocument(validation.value);
  const persistedRows = JSON.parse(JSON.stringify(flattened.rows));
  const row = persistedRows.find(({ entityType }) => entityType === "study_unit");
  assert.equal(row.content.response.package, extensionId);
  const restored = persistence.composeCourseDocument(flattened.course, persistedRows);
  const expected = structuredClone(validation.value);
  delete expected.scope;
  assert.deepEqual(restored, expected);
  const restoredUnit = restored.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[0];
  assert.match(envelope.renderStudyUnitEnvelope(restoredUnit, registry).responseHtml, /<textarea\b/u);
  const html = renderer.renderPackageStudyUnitBlocks(restoredUnit);
  assert.ok(html.includes(`data-package="${extensionId}"`));
  assert.match(html, /data-action="open-response-input"/u);

  const state = registry.createResponseState(response);
  const focused = [];
  const host = { getState: () => state, focus: (selector) => focused.push(selector) };
  assert.equal(registry.submitResponseState(response, state, host), false);
  assert.equal(state.feedback, "incomplete");
  assert.equal(focused.length, 1);
  const input = new EventTarget();
  input.value = "";
  let stateReads = 0;
  const root = { querySelectorAll: (selector) => {
    assert.equal(selector, "[data-action='open-response-input']");
    return [input];
  } };
  const bindingHost = { ...host, getState: () => { stateReads += 1; return state; } };
  registry.bindResponseInteraction(response, root, bindingHost);
  registry.bindResponseInteraction(response, root, bindingHost);
  input.value = "A conjunção exige que ambas sejam verdadeiras.";
  input.dispatchEvent(new Event("input"));
  assert.equal(stateReads, 1, "Uma nova hidratação não duplica o listener.");
  assert.equal(state.text, input.value);
  assert.equal(registry.submitResponseState(response, state, host), true);
  assert.equal(state.feedback, "recorded");
  assert.equal(registry.evaluateResponse(response, { text: input.value }).complete, true);

  const after = await sourceDigests(sourceRoot);
  const generated = path.join("resources", "packages", "generated.js");
  assert.notEqual(after.get(generated), before.get(generated));
  for (const [relative, digest] of before) {
    if (relative !== generated) assert.equal(after.get(relative), digest, `${relative} foi alterado.`);
  }
  assert.deepEqual([...after.keys()].filter((relative) => !before.has(relative)), [
    path.join("resources", "packages", "extension-probe", "index.js")
  ]);
});
