import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyValidationImpact, isReleaseMetadataOnly } from "../../scripts/validationImpact.mjs";
import { buildCandidatePlan } from "../../scripts/validateCandidate.mjs";

const REAL_E2E = [
  "tests/e2e/course-access-local.spec.js", "tests/e2e/course-audio-local.spec.js",
  "tests/e2e/course-authoring-context-local.spec.js", "tests/e2e/course-parts-local.spec.js"
];

test("documentação comum não exige serviços e seleciona verificações documentais existentes", () => {
  const result = classifyValidationImpact(["README.md", "docs/arquitetura.md"]);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.docsOnly, true);
  assert.deepEqual(result.categories, ["docs"]);
  assert.deepEqual(result.requires, { web: false, contracts: false, supabase: false, android: false });
  assert.ok(result.runtimeFiles.includes("tests/runtime/documentation-audit.test.js"));
  assert.deepEqual(result.e2eFiles, []);
  assert.deepEqual(result.realE2eFiles, []);
});

test("CSS isolado mantém prova visual sem reproduzir banco ou exigir opt-ins reais", () => {
  const result = classifyValidationImpact(["public/styles.css", "public/course-authoring.css"]);
  assert.equal(result.docsOnly, false);
  assert.deepEqual(result.categories, ["web"]);
  assert.deepEqual(result.requires, { web: true, contracts: false, supabase: false, android: false });
  assert.ok(result.runtimeFiles.includes("tests/runtime/frontend-style-audit.test.js"));
  assert.ok(!result.runtimeFiles.some(file => file.includes("pglite")));
  assert.deepEqual(result.e2eFiles, []);
  assert.deepEqual(result.realE2eFiles, []);
});

test("migration exige banco, contratos e jornadas reais separadas dos E2E comuns", () => {
  const result = classifyValidationImpact(["supabase/migrations/20260909000000_example.sql"]);
  assert.deepEqual(result.categories, ["contracts", "backend", "database"]);
  assert.equal(result.requires.supabase, true);
  assert.equal(result.requires.contracts, true);
  assert.ok(result.runtimeFiles.includes("tests/runtime/course-sources-upgrade-pglite.test.js"));
  assert.ok(result.runtimeFiles.includes("tests/runtime/course-supabase-adapter.test.js"));
  assert.deepEqual(result.realE2eFiles, REAL_E2E);
  assert.ok(!result.e2eFiles.some(file => result.realE2eFiles.includes(file)));
});

test("OpenAPI e documentos dos canais exercitam o contrato compartilhado", () => {
  for (const file of ["docs/downloads/aralearn-chatgpt-action-openapi.yaml", "docs/autoria-mcp.md"]) {
    const result = classifyValidationImpact([file]);
    assert.equal(result.docsOnly, false, file);
    assert.ok(result.categories.includes("contracts"), file);
    assert.equal(result.requires.supabase, true, file);
    assert.ok(result.runtimeFiles.includes("tests/runtime/chatgpt-action-human-schema.test.js"), file);
    assert.ok(result.runtimeFiles.includes("tests/runtime/course-human-mcp.test.js"), file);
  }
});

test("runtime compartilhado seleciona consumidores web, kernel, canais e banco", () => {
  for (const file of ["src/domain/courseSources.js", "src/resources/kernel/packageRegistry.js",
    "supabase/functions/_shared/aralearn/runtime/domain/courseSources.js"]) {
    const result = classifyValidationImpact([file]);
    assert.deepEqual(result.categories, ["web", "contracts", "backend", "database"], file);
    assert.ok(result.runtimeFiles.includes("tests/kernel/resource-package-kernel.test.js"), file);
    assert.ok(result.runtimeFiles.includes("tests/runtime/course-sources-panel.test.js"), file);
    assert.deepEqual(result.realE2eFiles, REAL_E2E, file);
  }
});

test("estado da aplicação exige E2E real; shell Android seleciona validações nativas", () => {
  const state = classifyValidationImpact(["src/persistence/CourseLocalStore.js"]);
  assert.equal(state.requires.supabase, true);
  assert.ok(state.runtimeFiles.includes("tests/runtime/course-local-store.test.js"));
  assert.deepEqual(state.realE2eFiles, REAL_E2E);
  const android = classifyValidationImpact(["android/app/src/main/java/com/aralearn/app/MainActivity.java"]);
  assert.deepEqual(android.requires, { web: false, contracts: false, supabase: false, android: true });
  assert.ok(android.runtimeFiles.includes("tests/runtime/android-runtime-security.test.js"));
});

test("teste alterado é executado e mantém seleção conservadora de seus consumidores", () => {
  const file = "tests/runtime/course-local-store.test.js";
  const result = classifyValidationImpact([file]);
  assert.ok(result.runtimeFiles.includes(file));
  assert.ok(result.runtimeFiles.includes("tests/runtime/course-study-repository.test.js"));
  assert.equal(result.requires.web, true);
  assert.equal(result.requires.supabase, true);
  const real = classifyValidationImpact(["tests/e2e/course-audio-local.spec.js"]);
  assert.ok(real.realE2eFiles.includes("tests/e2e/course-audio-local.spec.js"));
  assert.equal(real.requires.supabase, true);
});

test("desconhecido, entrada inválida e orquestração ampliam gates sem dispensas implícitas", () => {
  for (const paths of [[], null, "README.md", [false], ["../README.md"], ["C:/README.md"],
    ["docs\\uso.md"], ["docs/uso.md\nrequires_supabase=false"], ["docs/new/runtime.yaml"],
    [".github/workflows/validacao.yml"], ["package-lock.json"], ["scripts/validateCandidate.mjs"]]) {
    const result = classifyValidationImpact(paths);
    assert.equal(result.docsOnly, false, JSON.stringify(paths));
    assert.deepEqual(result.requires, { web: true, contracts: true, supabase: true, android: true }, JSON.stringify(paths));
    assert.ok(result.runtimeFiles.includes("tests/runtime/course-supabase-adapter.test.js"));
    assert.deepEqual(result.realE2eFiles, REAL_E2E);
  }
});

test("verificador de publicação e sua regressão selecionam somente os consumidores focais", () => {
  const result = classifyValidationImpact([
    "scripts/verifyPublishedSite.mjs", "tests/runtime/published-site-verification.test.js"
  ]);
  assert.deepEqual(result.categories, ["verification"]);
  assert.deepEqual(result.runtimeFiles, ["tests/runtime/published-site-verification.test.js"]);
  assert.deepEqual(result.requires, { web: true, contracts: false, supabase: false, android: false });
  assert.deepEqual(result.e2eFiles, []);
  assert.deepEqual(result.realE2eFiles, []);
  const native = classifyValidationImpact(["scripts/androidNativeGate.py", "tests/helpers/androidNativeGateTests.py"]);
  assert.deepEqual(native.runtimeFiles, ["tests/runtime/android-native-gate.test.js", "tests/runtime/deployment-automation.test.js"]);
  assert.equal(native.requires.android, false, "verificar recibos não altera o aplicativo Android");
  assert.equal(native.requires.supabase, false);
  assert.deepEqual(classifyValidationImpact(["scripts/verifyDeploymentArtifacts.ps1"]).runtimeFiles,
    ["tests/runtime/deployment-automation.test.js"]);
  assert.deepEqual(buildCandidatePlan(result).map(step => step.gate), ["preflight", "lint", "runtime-contract", "runtime-focal"]);
  assert.deepEqual(buildCandidatePlan(result).at(-1).args,
    ["scripts/runTests.mjs", "--focal", "tests/runtime/published-site-verification.test.js"]);
});

test("papel focal não encobre mecanismo transversal, script desconhecido ou alteração de produto", () => {
  for (const file of ["scripts/releaseCandidate.mjs", "scripts/candidateApplicability.mjs", "scripts/newVerifier.mjs"]) {
    const result = classifyValidationImpact(["scripts/verifyPublishedSite.mjs", file]);
    assert.ok(Object.values(result.requires).every(Boolean), file);
    assert.ok(result.runtimeFiles.length > 100, file);
  }
  const mixed = classifyValidationImpact(["scripts/verifyPublishedSite.mjs", "src/domain/courseSources.js"]);
  assert.equal(mixed.requires.supabase, true);
  assert.ok(mixed.runtimeFiles.includes("tests/runtime/published-site-verification.test.js"));
  assert.ok(mixed.runtimeFiles.includes("tests/kernel/resource-package-kernel.test.js"));
});

test("união de paths preserva impacto da origem removida e resultado determinístico", () => {
  const result = classifyValidationImpact(["src/domain/removed.js", "docs/runtime.md", "public/styles.css"]);
  const reordered = classifyValidationImpact(["public/styles.css", "docs/runtime.md", "src/domain/removed.js", "public/styles.css"]);
  assert.deepEqual(result, reordered);
  assert.equal(result.docsOnly, false);
  assert.equal(result.requires.supabase, true);
});

test("inventário reconhece opt-in novo pelo contrato, não por nome, e falha se indisponível", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-impact-inventory-"));
  try {
    for (const folder of ["tests/kernel", "tests/runtime", "tests/e2e"]) fs.mkdirSync(path.join(root, folder), { recursive: true });
    fs.writeFileSync(path.join(root, "tests/runtime/new.test.js"), 'import "../../src/ui/Example.js";');
    fs.writeFileSync(path.join(root, "tests/e2e/new.spec.js"), 'const enabled = process.env.ARALEARN_E2E_REAL_SUPABASE === "1";');
    fs.writeFileSync(path.join(root, "tests/e2e/local-looking.spec.js"), 'test("normal", () => {});');
    const result = classifyValidationImpact(["src/ui/Example.js"], { root });
    assert.deepEqual(result.runtimeFiles, ["tests/runtime/new.test.js"]);
    assert.deepEqual(result.realE2eFiles, ["tests/e2e/new.spec.js"]);
    assert.deepEqual(result.e2eFiles, []);
    assert.throws(() => classifyValidationImpact(["README.md"], { root: path.join(root, "missing") }), /ENOENT/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test("metadados de versão são semânticos e qualquer outro campo mantém impacto", () => {
  const cases = [
    ["package.json", { version: "1", scripts: { test: "node test.js" }, dependencies: { a: "1" } }, value => { value.version = "2"; }],
    ["package-lock.json", { version: "1", packages: { "": { version: "1" }, "node_modules/a": { version: "1" } } }, value => { value.version = "2"; value.packages[""].version = "2"; }],
    ["docs/downloads/aralearn-chatgpt-action-openapi.yaml", { info: { version: "1" }, paths: {} }, value => { value.info.version = "2"; }]
  ];
  for (const [file, before, bump] of cases) {
    const after = structuredClone(before);
    bump(after);
    assert.equal(isReleaseMetadataOnly(file, JSON.stringify(before), JSON.stringify(after, null, 2)), true);
    after.extra = true;
    assert.equal(isReleaseMetadataOnly(file, JSON.stringify(before), JSON.stringify(after)), false);
    assert.equal(isReleaseMetadataOnly(file, null, JSON.stringify(after)), false);
  }
  assert.equal(isReleaseMetadataOnly("package-lock.json", '{"version":"1","packages":{"":{"version":"1"},"a":{"version":"1"}}}',
    '{"version":"2","packages":{"":{"version":"2"},"a":{"version":"2"}}}'), false);
  const androidBefore = 'defaultConfig {\n  versionCode = 219\n  versionName = "0.0.73"\n}\n';
  const androidAfter = 'defaultConfig {\n  versionCode = 220\n  versionName = "0.0.74"\n}\n';
  assert.equal(isReleaseMetadataOnly("android/app/build.gradle.kts", androidBefore, androidAfter), true);
  assert.equal(isReleaseMetadataOnly("android/app/build.gradle.kts", androidBefore,
    androidAfter.replace("defaultConfig", "defaultConfig // comportamento alterado")), false);
  assert.equal(isReleaseMetadataOnly("android/app/build.gradle.kts", androidBefore,
    androidBefore.replace("versionCode = 219", "versionCode = 220\n  versionCode = 221")), false);
});

test("incremento Android exclusivamente de release não seleciona gate nativo", () => {
  const current = fs.readFileSync(path.join(path.resolve(import.meta.dirname, "../.."), "android/app/build.gradle.kts"), "utf8");
  const previous = current.replace(/versionCode = (\d+)/u, (_match, value) => `versionCode = ${Number(value) - 1}`)
    .replace(/versionName = "\d+\.\d+\.\d+"/u, 'versionName = "999.999.999"');
  const result = classifyValidationImpact(["android/app/build.gradle.kts"], { readBase: () => previous });
  assert.deepEqual(result.categories, ["release"]);
  assert.deepEqual(result.requires, { web: false, contracts: false, supabase: false, android: false });
});

test("registro de paridade seleciona seu consumidor sem impacto sistêmico", () => {
  const impact = classifyValidationImpact(["docs/evidence/paridade-vertical.v1.json"]);
  assert.deepEqual(impact.categories, ["parity"]);
  assert.deepEqual(impact.runtimeFiles, ["tests/runtime/vertical-parity-audit.test.js"]);
  assert.ok(Object.values(impact.requires).every(value => value === false));
});

test("mudança web não agenda suíte E2E local; spec comum alterada é selecionada", () => {
  assert.deepEqual(classifyValidationImpact(["src/ui/Example.js"]).e2eFiles, []);
  const spec = "tests/e2e/study-explanation.spec.js";
  assert.deepEqual(classifyValidationImpact(["src/ui/Example.js", spec]).e2eFiles, [spec]);
});
