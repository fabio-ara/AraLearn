import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildReleaseNotes,
  configurationDigest,
  extractArtifactArchive,
  GITHUB_API_ACCEPT,
  releasePlan,
  selectReleaseByTag,
  validateCandidateIdentity,
  validateIntegratedPullRequest,
  validateManifest,
  validateRun,
  validateVersionProgress,
  verifyAndroid,
  verifyDirectory
} from "../../scripts/releaseCandidate.mjs";
import { DEFAULT_ASSIST_ALLOWED_ORIGINS } from "../../src/assist/providerRuntimeSecurity.js";

const REPOSITORY = "fabio-ara/AraLearn";
const VERSION = "0.1.0";
const TESTED_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const TREE = "c".repeat(40);
const TARGET_SHA = "d".repeat(40);
const CERTIFICATE = "c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296";
const ENV = {
  ARALEARN_SUPABASE_URL: "https://project.example.test",
  ARALEARN_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic-test-value"
};
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("downloads de artefatos usam o media type aceito pela API do GitHub", () => {
  assert.equal(GITHUB_API_ACCEPT, "application/vnd.github+json");
});

test("notas da release usam apenas a versão exata e conservam texto e links", () => {
  const notes = buildReleaseNotes([
    "# Mudanças", "## [Não publicado]", "- Próxima alteração.",
    "## [0.1.0] - 2026-09-05", "### Alterado", "- Texto da versão, com [guia](https://example.test/guia).",
    "  Continuação integral.", "## [0.0.9] - 2026-09-04", "### Corrigido", "- Texto antigo."
  ].join("\r\n"), "0.1.0");
  assert.match(notes, /Texto da versão, com \[guia\]\(https:\/\/example\.test\/guia\)\.\n {2}Continuação integral\./u);
  assert.match(notes, /blob\/v0\.1\.0\/docs\/implantacao\.md/u);
  assert.doesNotMatch(notes, /Próxima alteração|Texto antigo|Não publicado/u);
});

test("notas da release recusam ausência, duplicação ou seção vazia sem usar versão antiga", () => {
  assert.throws(() => buildReleaseNotes("## [Não publicado]\n- Futuro.", "0.1.0"), /ausentes/u);
  const section = "## [0.1.0] - 2026-09-05\n### Alterado\n- Texto.\n";
  assert.throws(() => buildReleaseNotes(section + section, "0.1.0"), /duplicadas/u);
  assert.throws(() => buildReleaseNotes("## [0.1.0] - 2026-09-05\n", "0.1.0"), /vazias/u);
});
const PAGES = {
  "asset-manifest.json": Buffer.from('{"version":"0.1.0","assets":["./index.html"]}\n'),
  "index.html": Buffer.from("<!doctype html><div id=app-root></div>\n")
};
const ANDROID = {
  "public/index.html": Buffer.from("<!doctype html><div id=app-root></div>\n"),
  "public/mark.png": Buffer.from([137, 80, 78, 71, 255, 254, 0])
};
function fileList(bodies) {
  return Object.keys(bodies).sort().map((name) => ({
    path: name, sha256: digest(bodies[name]), size: bodies[name].length
  }));
}
function candidate() {
  return {
    schemaVersion: 1,
    version: VERSION,
    source: {
      repository: REPOSITORY, headRepository: REPOSITORY,
      testedSha: TESTED_SHA, headSha: HEAD_SHA, tree: TREE,
      pullRequest: 123, baseSha: "e".repeat(40)
    },
    run: { id: 31, attempt: 2, workflow: ".github/workflows/validacao.yml", event: "pull_request" },
    configurationSha256: configurationDigest(ENV),
    lockfileSha256: digest("lockfile"),
    backendManifestSha256: digest("backend manifest"),
    android: { versionCode: 211, certificateSha256: CERTIFICATE },
    toolchain: {
      web: { node: process.version, java: "openjdk 21", runner: "windows-2022", image: "20260901.1", architecture: process.arch },
      supabase: { deno: "deno 2.2.1", runner: "ubuntu-24.04", image: "20260901.1", cli: "2.75.0" }
    },
    gate: { scope: "integral", web: "success", supabase: "success" },
    artifacts: {
      pages: { files: fileList(PAGES), id: 42, digest: `sha256:${digest("uploaded ZIP")}` },
      android: { files: fileList(ANDROID) }
    }
  };
}
function runInfo() {
  return {
    id: 31, run_attempt: 2, repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY }, head_sha: HEAD_SHA,
    path: ".github/workflows/validacao.yml", event: "pull_request",
    status: "completed", conclusion: "success", head_branch: "feature/candidate",
    pull_requests: [{ number: 123 }]
  };
}
function requiredJobs() {
  return [
    { name: "Testar web e Android", steps: ["Executar testes", "Gerar e testar o artefato web no navegador", "Compilar aplicativo Android", "Analisar aplicativo Android"] },
    { name: "Testar Supabase local", steps: ["Executar testes pgTAP", "Testar concorrência real dos pedidos de Curso", "Servir e testar o gateway MCP e a Autoria real"] },
    { name: "Testar e validar", steps: [] }
  ].map((job) => ({
    ...job, status: "completed", conclusion: "success",
    steps: job.steps.map((name, index) => ({ name, number: index + 1, status: "completed", conclusion: "success" }))
  }));
}
function targetIdentity(manifest = candidate()) {
  return {
    repository: REPOSITORY, targetTree: TREE,
    configurationSha256: manifest.configurationSha256,
    lockfileSha256: manifest.lockfileSha256,
    backendManifestSha256: manifest.backendManifestSha256
  };
}
async function temporaryDirectory(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-candidate-test-"));
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aralearn-candidate-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}
async function writeFiles(directory, bodies) {
  for (const [name, bytes] of Object.entries(bodies)) {
    const file = path.join(directory, ...name.split("/"));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
}
async function androidArchive(context, bodies) {
  const directory = await temporaryDirectory(context);
  const payload = path.join(directory, "payload");
  await writeFiles(path.join(payload, "assets", "www"), bodies);
  const archive = path.join(directory, "synthetic-runtime.apk");
  // O tar sintético testa leitura e identidade do runtime; não representa assinatura Android.
  const packed = spawnSync("tar", ["-cf", archive, "assets"], { cwd: payload, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.error?.message || packed.stderr);
  return archive;
}

async function artifactZip(context, bodies) {
  const directory = await temporaryDirectory(context);
  const payload = path.join(directory, "payload");
  await writeFiles(payload, bodies);
  const archive = path.join(directory, "artifact.zip");
  const packed = spawnSync("tar", ["-a", "-cf", archive, ...Object.keys(bodies)], { cwd: payload, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.error?.message || packed.stderr);
  const bytes = await fs.readFile(archive);
  assert.equal(bytes.subarray(0, 2).toString("ascii"), "PK", "A prova deve usar ZIP real.");
  return { bytes, artifact: { id: 42, expired: false, digest: `sha256:${digest(bytes)}` } };
}

test("manifesto completo distingue bytes da candidata, dependências e ambiente", () => {
  const manifest = candidate();
  assert.equal(validateManifest(manifest), manifest);
  const unsealed = structuredClone(manifest);
  delete unsealed.gate;
  delete unsealed.artifacts.pages.id;
  delete unsealed.artifacts.pages.digest;
  delete unsealed.toolchain.supabase;
  assert.equal(validateManifest(unsealed, { sealed: false }), unsealed);
  assert.throws(() => validateManifest(unsealed), /Gate integral/u);
});

test("manifesto recusa gate omitido, focal, pulado, cancelado ou falho", async (context) => {
  const variants = [
    ["ausente", (manifest) => { delete manifest.gate; }],
    ["focal", (manifest) => { manifest.gate.scope = "focal"; }],
    ...["web", "supabase"].flatMap((job) => [undefined, "skipped", "failure", "cancelled"]
      .map((result) => [`${job}: ${result}`, (manifest) => { manifest.gate[job] = result; }]))
  ];
  for (const [name, mutate] of variants) {
    await context.test(name, () => {
      const manifest = candidate(); mutate(manifest);
      assert.throws(() => validateManifest(manifest), /Gate integral/u);
    });
  }
});

test("manifesto recusa identidade incompleta e artefatos sem procedência", async (context) => {
  const variants = [
    ["schema", (manifest) => { manifest.schemaVersion = 2; }],
    ["fork", (manifest) => { manifest.source.headRepository = "fork/AraLearn"; }],
    ["SHA testado ausente", (manifest) => { delete manifest.source.testedSha; }],
    ["SHA de origem inválido", (manifest) => { manifest.source.headSha = "invalid"; }],
    ["árvore inválida", (manifest) => { manifest.source.tree = "invalid"; }],
    ["run ausente", (manifest) => { delete manifest.run.id; }],
    ["tentativa ausente", (manifest) => { delete manifest.run.attempt; }],
    ["workflow diferente", (manifest) => { manifest.run.workflow = ".github/workflows/pages.yml"; }],
    ["evento não autorizado", (manifest) => { manifest.run.event = "push"; }],
    ["configuração sem digest", (manifest) => { delete manifest.configurationSha256; }],
    ["lockfile sem digest", (manifest) => { delete manifest.lockfileSha256; }],
    ["backend sem digest", (manifest) => { delete manifest.backendManifestSha256; }],
    ["certificado diferente", (manifest) => { manifest.android.certificateSha256 = "0".repeat(64); }],
    ["versionCode inválido", (manifest) => { manifest.android.versionCode = 0; }],
    ["upload Pages sem id", (manifest) => { delete manifest.artifacts.pages.id; }],
    ["upload Pages sem digest", (manifest) => { delete manifest.artifacts.pages.digest; }],
    ["upload Pages digest inválido", (manifest) => { manifest.artifacts.pages.digest = "sha256:invalid"; }],
    ["runtime manifest ausente", (manifest) => { manifest.artifacts.pages.files.shift(); }],
    ["Android sem lista", (manifest) => { manifest.artifacts.android.files = []; }],
    ["Deno ausente", (manifest) => { delete manifest.toolchain.supabase.deno; }],
    ["digest de arquivo inválido", (manifest) => { manifest.artifacts.pages.files[0].sha256 = "invalid"; }],
    ["digest de arquivo não textual", (manifest) => {
      manifest.artifacts.pages.files[0].sha256 = [manifest.artifacts.pages.files[0].sha256];
    }],
    ["arquivos fora de ordem", (manifest) => { manifest.artifacts.pages.files.reverse(); }],
    ["arquivo duplicado", (manifest) => { manifest.artifacts.pages.files.push(manifest.artifacts.pages.files[0]); }],
    ["tamanho inválido", (manifest) => { manifest.artifacts.pages.files[0].size = -1; }],
    ...["../outside", "/outside", "a\\b", "a//b", "a/./b", "a/%2e%2e/b", "a?b", "a#b"]
      .map((name) => [`caminho inseguro ${name}`, (manifest) => { manifest.artifacts.pages.files[0].path = name; }])
  ];
  for (const [name, mutate] of variants) {
    await context.test(name, () => {
      const manifest = candidate(); mutate(manifest);
      assert.throws(() => validateManifest(manifest));
    });
  }
});

test("run integral exige origem, conclusão e tentativa exatas", async (context) => {
  assert.doesNotThrow(() => validateRun(runInfo(), requiredJobs(), REPOSITORY, 2));
  const variants = [
    ["outro repositório", (info) => { info.repository.full_name = "other/project"; }],
    ["fork", (info) => { info.head_repository.full_name = "fork/AraLearn"; }],
    ["workflow divergente", (info) => { info.path = ".github/workflows/pages.yml"; }],
    ["evento divergente", (info) => { info.event = "push"; }],
    ["run em andamento", (info) => { info.status = "in_progress"; }],
    ["run falhou", (info) => { info.conclusion = "failure"; }],
    ["run cancelado", (info) => { info.conclusion = "cancelled"; }],
    ["tentativa superada", (info) => { info.run_attempt = 3; }]
  ];
  for (const [name, mutate] of variants) {
    await context.test(name, () => {
      const info = runInfo(); mutate(info);
      assert.throws(() => validateRun(info, requiredJobs(), REPOSITORY, 2));
    });
  }
});

test("run verde não substitui job nem etapa integral ausente ou malsucedida", async (context) => {
  for (let index = 0; index < 3; index += 1) {
    for (const result of ["omitted", "skipped", "failure", "cancelled", "duplicated"]) {
      await context.test(`${requiredJobs()[index].name}: ${result}`, () => {
        const jobs = requiredJobs();
        if (result === "omitted") jobs.splice(index, 1);
        else if (result === "duplicated") jobs.push(structuredClone(jobs[index]));
        else jobs[index].conclusion = result;
        assert.throws(() => validateRun(runInfo(), jobs, REPOSITORY, 2), /Prova obrigatória/u);
      });
    }
  }
  for (const [jobIndex, job] of requiredJobs().entries()) {
    for (const [stepIndex, step] of job.steps.entries()) {
      for (const result of ["omitted", "skipped", "failure"]) {
        await context.test(`${step.name}: ${result}`, () => {
          const jobs = requiredJobs();
          if (result === "omitted") jobs[jobIndex].steps.splice(stepIndex, 1);
          else jobs[jobIndex].steps[stepIndex].conclusion = result;
          assert.throws(() => validateRun(runInfo(), jobs, REPOSITORY, 2), /Etapa integral/u);
        });
      }
    }
  }
});

test("identidade admite SHA de merge distinto quando árvore e entradas são as mesmas", () => {
  const manifest = candidate();
  manifest.promotion = { targetSha: TARGET_SHA, tree: TREE };
  assert.notEqual(manifest.source.testedSha, manifest.source.headSha);
  assert.notEqual(manifest.source.testedSha, manifest.promotion.targetSha);
  assert.doesNotThrow(() => validateCandidateIdentity(manifest, runInfo(), targetIdentity(manifest)));
});

test("vínculo do PR usa o registro persistente mesmo quando o run perde a associação efêmera", async (context) => {
  const manifest = candidate();
  const info = runInfo();
  info.pull_requests = [];
  assert.doesNotThrow(() => validateRun(info, requiredJobs(), REPOSITORY, 2));
  const pullRequest = {
    number: manifest.source.pullRequest,
    merged: true,
    merge_commit_sha: TARGET_SHA,
    head: { sha: manifest.source.headSha, repo: { full_name: REPOSITORY } },
    base: { ref: "main", repo: { full_name: REPOSITORY } }
  };
  assert.doesNotThrow(() => validateIntegratedPullRequest(manifest, pullRequest, TARGET_SHA, REPOSITORY));
  const variants = [
    ["número", (pr) => { pr.number += 1; }],
    ["não integrado", (pr) => { pr.merged = false; }],
    ["SHA de merge", (pr) => { pr.merge_commit_sha = "f".repeat(40); }],
    ["SHA da cabeça", (pr) => { pr.head.sha = "f".repeat(40); }],
    ["repositório da cabeça", (pr) => { pr.head.repo.full_name = "fork/AraLearn"; }],
    ["base", (pr) => { pr.base.ref = "release"; }],
    ["repositório da base", (pr) => { pr.base.repo.full_name = "other/AraLearn"; }]
  ];
  for (const [name, mutate] of variants) {
    await context.test(name, () => {
      const changed = structuredClone(pullRequest);
      mutate(changed);
      assert.throws(() => validateIntegratedPullRequest(manifest, changed, TARGET_SHA, REPOSITORY), /não corresponde/u);
    });
  }
});

test("identidade recusa outro run, tentativa, SHA, árvore, configuração, lockfile ou backend", async (context) => {
  const variants = [
    ["run", (_manifest, info) => { info.id += 1; }],
    ["tentativa", (_manifest, info) => { info.run_attempt += 1; }],
    ["SHA de origem", (_manifest, info) => { info.head_sha = "f".repeat(40); }],
    ["evento", (_manifest, info) => { info.event = "workflow_dispatch"; }],
    ["repositório", (_manifest, _info, target) => { target.repository = "other/project"; }],
    ["árvore integrada", (_manifest, _info, target) => { target.targetTree = "f".repeat(40); }],
    ["configuração", (_manifest, _info, target) => { target.configurationSha256 = digest("changed configuration"); }],
    ["lockfile", (_manifest, _info, target) => { target.lockfileSha256 = digest("changed lockfile"); }],
    ["backend", (_manifest, _info, target) => { target.backendManifestSha256 = digest("changed backend"); }]
  ];
  for (const [name, mutate] of variants) {
    await context.test(name, () => {
      const manifest = candidate(); const info = runInfo(); const target = targetIdentity(manifest);
      mutate(manifest, info, target);
      assert.throws(() => validateCandidateIdentity(manifest, info, target), /não pertence|divergem/u);
    });
  }
});

test("configuração usa valores explícitos normalizados e muda o digest quando eles mudam", () => {
  const expected = digest(JSON.stringify({
    supabaseUrl: ENV.ARALEARN_SUPABASE_URL,
    supabasePublishableKey: ENV.ARALEARN_SUPABASE_PUBLISHABLE_KEY,
    assistAllowedOrigins: [...DEFAULT_ASSIST_ALLOWED_ORIGINS]
  }));
  assert.equal(configurationDigest(ENV), expected);
  assert.equal(configurationDigest({
    ...ENV, ARALEARN_SUPABASE_URL: ` ${ENV.ARALEARN_SUPABASE_URL}/ `,
    ARALEARN_SUPABASE_PUBLISHABLE_KEY: ` ${ENV.ARALEARN_SUPABASE_PUBLISHABLE_KEY} `
  }), expected);
  assert.notEqual(configurationDigest({ ...ENV, ARALEARN_SUPABASE_URL: "https://other.example.test" }), expected);
  assert.notEqual(configurationDigest({ ...ENV, ARALEARN_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_another-test-value" }), expected);
});

test("configuração recusa valores ausentes, origem insegura e credencial administrativa", async (context) => {
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.synthetic-signature`;
  const variants = [
    ["URL ausente", { ARALEARN_SUPABASE_URL: "" }],
    ["chave ausente", { ARALEARN_SUPABASE_PUBLISHABLE_KEY: "" }],
    ["HTTP", { ARALEARN_SUPABASE_URL: "http://project.example.test" }],
    ["caminho", { ARALEARN_SUPABASE_URL: "https://project.example.test/path" }],
    ["consulta", { ARALEARN_SUPABASE_URL: "https://project.example.test/?x=1" }],
    ["fragmento", { ARALEARN_SUPABASE_URL: "https://project.example.test/#x" }],
    ["credenciais na URL", { ARALEARN_SUPABASE_URL: "https://synthetic:password@project.example.test" }],
    ["chave secreta", { ARALEARN_SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic-test-value" }],
    ["service role", { ARALEARN_SUPABASE_PUBLISHABLE_KEY: jwt }],
    ["chave inválida", { ARALEARN_SUPABASE_PUBLISHABLE_KEY: "not-a-public-key" }]
  ];
  for (const [name, env] of variants) {
    await context.test(name, () => assert.throws(() => configurationDigest({ ...ENV, ...env })));
  }
});

test("plano de release retoma tag sem Release e draft sem assets", () => {
  const input = { targetSha: TARGET_SHA, version: VERSION };
  assert.deepEqual(releasePlan(input), { create: true, finalize: true });
  assert.deepEqual(releasePlan({ ...input, tagSha: TARGET_SHA }), { create: true, finalize: true });
  assert.deepEqual(releasePlan({
    ...input, tagSha: TARGET_SHA,
    release: { tag_name: `v${VERSION}`, draft: true, prerelease: false, assets: [] }
  }), { create: false, finalize: true });
  assert.deepEqual(releasePlan({
    ...input,
    release: { tag_name: `v${VERSION}`, draft: true, prerelease: false, target_commitish: TARGET_SHA, assets: [] }
  }), { create: false, finalize: true });
  assert.deepEqual(releasePlan({
    ...input, tagSha: TARGET_SHA,
    release: { tag_name: `v${VERSION}`, draft: false, prerelease: false, assets: [{ name: "application.apk" }] }
  }), { create: false, finalize: false });
});

test("plano de release recusa tag divergente e estado incompatível", () => {
  const input = { targetSha: TARGET_SHA, version: VERSION };
  assert.throws(() => releasePlan({ ...input, tagSha: HEAD_SHA }), /outra revisão/u);
  assert.throws(() => releasePlan({ ...input, release: { tag_name: `v${VERSION}`, draft: true, prerelease: false } }), /incompatível/u);
  assert.throws(() => releasePlan({ ...input, release: { tag_name: `v${VERSION}`, draft: true, prerelease: false, target_commitish: HEAD_SHA } }), /incompatível/u);
  assert.throws(() => releasePlan({ ...input, release: { tag_name: `v${VERSION}`, draft: false, prerelease: false, target_commitish: TARGET_SHA } }), /incompatível/u);
  assert.throws(() => releasePlan({ ...input, tagSha: TARGET_SHA, release: { tag_name: "v9.9.9", prerelease: false } }), /incompatível/u);
  assert.throws(() => releasePlan({ ...input, tagSha: TARGET_SHA, release: { tag_name: `v${VERSION}`, prerelease: true } }), /incompatível/u);
  assert.throws(() => releasePlan({ ...input, targetSha: "invalid" }), /Identidade/u);
});

test("seleção encontra draft que o endpoint por tag omite e recusa duplicidade", () => {
  const draft = { tag_name: `v${VERSION}`, draft: true, target_commitish: TARGET_SHA };
  assert.equal(selectReleaseByTag([{ tag_name: "v0.0.1" }, draft], `v${VERSION}`), draft);
  assert.equal(selectReleaseByTag([], `v${VERSION}`), null);
  assert.throws(() => selectReleaseByTag([draft, { ...draft }], `v${VERSION}`), /duplicada/u);
});

test("avanço de versão aceita retry exato e exige avanço numérico do versionCode", () => {
  const previous = { version: "1.9.9", versionCode: 211 };
  assert.doesNotThrow(() => validateVersionProgress({ ...previous }, previous));
  for (const version of ["1.9.10", "1.10.0", "2.0.0"]) {
    assert.doesNotThrow(() => validateVersionProgress({ version, versionCode: 212 }, previous));
  }
});

test("avanço de versão recusa downgrade, troca de code no retry e reutilização de code", async (context) => {
  const previous = { version: "1.9.9", versionCode: 211 };
  const variants = [
    ["mesma versão com code maior", { version: "1.9.9", versionCode: 212 }],
    ["mesma versão com code menor", { version: "1.9.9", versionCode: 210 }],
    ["patch anterior com code maior", { version: "1.9.8", versionCode: 212 }],
    ["minor anterior com patch maior", { version: "1.8.99", versionCode: 212 }],
    ["major anterior com minor maior", { version: "0.99.99", versionCode: 212 }],
    ["versão nova com code repetido", { version: "1.10.0", versionCode: 211 }],
    ["versão nova com code menor", { version: "1.10.0", versionCode: 210 }]
  ];
  for (const [name, current] of variants) {
    await context.test(name, () => assert.throws(() => validateVersionProgress(current, previous)));
  }
});

test("diretório deve conter exatamente os bytes e caminhos aprovados", async (context) => {
  const bodies = { ...PAGES, "assets/mark.png": ANDROID["public/mark.png"] };
  const expected = fileList(bodies);
  const directory = await temporaryDirectory(context);
  await writeFiles(directory, bodies);
  await verifyDirectory(directory, expected);
  await fs.writeFile(path.join(directory, "assets", "mark.png"), Buffer.from([137, 80, 78, 71, 254, 255, 0]));
  await assert.rejects(() => verifyDirectory(directory, expected), /bytes da candidata/u);
  await writeFiles(directory, bodies);
  await fs.writeFile(path.join(directory, "extra.js"), "export {};\n");
  await assert.rejects(() => verifyDirectory(directory, expected), /bytes da candidata/u);
  await fs.unlink(path.join(directory, "extra.js"));
  await fs.unlink(path.join(directory, "index.html"));
  await assert.rejects(() => verifyDirectory(directory, expected), /bytes da candidata/u);
});

test("runtime Android compactado exige lista completa e bytes binários idênticos", async (context) => {
  const manifest = candidate();
  await verifyAndroid(await androidArchive(context, ANDROID), manifest);
  const variants = [
    ["bytes binários alterados", { ...ANDROID, "public/mark.png": Buffer.from([137, 80, 78, 71, 254, 255, 0]) }, /Bytes do APK/u],
    ["binário truncado", { ...ANDROID, "public/mark.png": Buffer.from([137, 80]) }, /Bytes do APK/u],
    ["arquivo ausente", { "public/index.html": ANDROID["public/index.html"] }, /Runtime do APK/u],
    ["arquivo extra", { ...ANDROID, "public/extra.js": Buffer.from("export {};\n") }, /Runtime do APK/u]
  ];
  for (const [name, bodies, expectedError] of variants) {
    await context.test(name, async (subcontext) => {
      const archive = await androidArchive(subcontext, bodies);
      await assert.rejects(() => verifyAndroid(archive, manifest), expectedError);
    });
  }
});

test("download de candidata valida ZIP real e extrai somente manifesto ou arquivos aprovados", {
  skip: process.platform !== "win32" && "O preparador da promoção usa o tar BSD do runner Windows."
}, async (context) => {
  const manifestBytes = Buffer.from(JSON.stringify(candidate()));
  const metadata = await artifactZip(context, { "candidate.json": manifestBytes });
  const metadataDirectory = await temporaryDirectory(context);
  await extractArtifactArchive(metadata.artifact, metadata.bytes, metadataDirectory);
  assert.deepEqual(await fs.readFile(path.join(metadataDirectory, "candidate.json")), manifestBytes);

  const bodies = { ...PAGES, "assets/mark.png": ANDROID["public/mark.png"] };
  const pages = await artifactZip(context, bodies);
  const pagesDirectory = await temporaryDirectory(context);
  await extractArtifactArchive(pages.artifact, pages.bytes, pagesDirectory, fileList(bodies));
  await verifyDirectory(pagesDirectory, fileList(bodies));
});

test("download bloqueia ZIP divergente, expirado, inesperado e destino ocupado", {
  skip: process.platform !== "win32" && "O preparador da promoção usa o tar BSD do runner Windows."
}, async (context) => {
  const metadata = await artifactZip(context, { "candidate.json": Buffer.from("{}") });
  const destination = await temporaryDirectory(context);
  const corrupt = Buffer.from(metadata.bytes);
  corrupt[corrupt.length - 1] ^= 1;
  await assert.rejects(() => extractArtifactArchive(metadata.artifact, corrupt, destination), /Digest/u);
  await assert.rejects(() => extractArtifactArchive({ ...metadata.artifact, expired: true }, metadata.bytes, destination), /expirado/u);
  await assert.rejects(() => extractArtifactArchive({ ...metadata.artifact, digest: "" }, metadata.bytes, destination), /digest/u);
  assert.deepEqual(await fs.readdir(destination), []);

  const extra = await artifactZip(context, { "candidate.json": Buffer.from("{}"), "extra.txt": Buffer.from("unexpected") });
  await assert.rejects(() => extractArtifactArchive(extra.artifact, extra.bytes, destination), /entradas inesperadas/u);
  const unsafe = await artifactZip(context, { "candidate.json": Buffer.from("{}") });
  // Troca de mesmo tamanho nos nomes local e central do ZIP, sem alterar os bytes/CRC do conteúdo.
  const originalName = Buffer.from("candidate.json");
  const unsafeName = Buffer.from("../escape.json");
  assert.equal(originalName.length, unsafeName.length);
  let replacements = 0;
  for (let offset = unsafe.bytes.indexOf(originalName); offset !== -1; offset = unsafe.bytes.indexOf(originalName, offset + unsafeName.length)) {
    unsafeName.copy(unsafe.bytes, offset);
    replacements += 1;
  }
  assert.equal(replacements, 2);
  unsafe.artifact.digest = `sha256:${digest(unsafe.bytes)}`;
  await assert.rejects(() => extractArtifactArchive(unsafe.artifact, unsafe.bytes, destination), /inseguro/u);
  assert.deepEqual(await fs.readdir(destination), []);

  await fs.writeFile(path.join(destination, "keep.txt"), "existing work");
  await assert.rejects(() => extractArtifactArchive(metadata.artifact, metadata.bytes, destination), /vazio/u);
  assert.equal(await fs.readFile(path.join(destination, "keep.txt"), "utf8"), "existing work");
});

test("download reprova bytes internos alterados mesmo com ZIP íntegro", {
  skip: process.platform !== "win32" && "O preparador da promoção usa o tar BSD do runner Windows."
}, async (context) => {
  const altered = { ...PAGES, "index.html": Buffer.from("different candidate") };
  const archive = await artifactZip(context, altered);
  const destination = await temporaryDirectory(context);
  await assert.rejects(() => extractArtifactArchive(archive.artifact, archive.bytes, destination, fileList(PAGES)), /bytes da candidata/u);
});
