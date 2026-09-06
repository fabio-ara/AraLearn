import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssistAllowedOrigins } from "../src/assist/providerRuntimeSecurity.js";
import { verifyHostedBackend, validatePublicProjectConfiguration } from "./verifyHostedBackend.mjs";
import { verifyPublishedSite } from "./verifyPublishedSite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const CANDIDATE = ".candidate/candidate.json";
const PAGES_NAME = "aralearn-pages-candidate";
const METADATA_NAME = "aralearn-candidate-manifest";
const CERTIFICATE = "c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296";
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.status !== 0 || result.error) throw new Error(`Falha em ${command} (${result.status ?? "indisponível"}).`);
  return result.stdout;
}

function git(...args) { return run("git", args).trim(); }
function toolVersion(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  demand(result.status === 0 && !result.error, `Não foi possível registrar a versão de ${command}.`);
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}
function demand(condition, message) { if (!condition) throw new Error(message); }
function positive(value, label) {
  demand(/^[1-9][0-9]*$/u.test(String(value)), `${label} inválido.`);
  return Number(value);
}
function output(name, value) {
  demand(/^[a-z_]+$/u.test(name) && !/[\r\n]/u.test(String(value)), "Saída de workflow inválida.");
  return process.env.GITHUB_OUTPUT ? fs.appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`) : undefined;
}
async function jsonFile(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function configurationDigest(env = process.env) {
  const url = String(env.ARALEARN_SUPABASE_URL || "").trim().replace(/\/+$/u, "");
  const key = String(env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "").trim();
  validatePublicProjectConfiguration({ projectUrl: url, publishableKey: key });
  demand(new URL(url).pathname === "/", "A configuração pública exige uma origem sem caminho.");
  let role = "";
  try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role; } catch { /* Uma chave publicável moderna não é JWT. */ }
  demand(/^sb_publishable_[A-Za-z0-9_-]{12,}$/u.test(key) || role === "anon", "Chave pública explícita inválida.");
  return sha256(JSON.stringify({ supabaseUrl: url, supabasePublishableKey: key,
    assistAllowedOrigins: buildAssistAllowedOrigins(env.ARALEARN_ASSIST_ALLOWED_ORIGINS || "") }));
}

export function validateFiles(files) {
  demand(Array.isArray(files) && files.length > 0 && files.length < 10000, "Lista de arquivos ausente ou inválida.");
  const seen = new Set();
  let previous = "";
  for (const file of files) {
    demand(typeof file.path === "string" && !file.path.includes("\\") && !file.path.startsWith("/") &&
      file.path.split("/").every((part) => part && part !== "." && part !== "..") &&
      !/[:%?#]/u.test(file.path) && [...file.path].every((character) => character.codePointAt(0) > 31) &&
      !seen.has(file.path), "Caminho de artefato inseguro ou duplicado.");
    demand(typeof file.sha256 === "string" && HASH.test(file.sha256) && Number.isSafeInteger(file.size) && file.size >= 0, "Digest ou tamanho de artefato inválido.");
    demand(!previous || previous < file.path, "Lista de arquivos fora da ordem canônica.");
    seen.add(file.path);
    previous = file.path;
  }
  return files;
}

export async function filesIn(directory, prefix = "") {
  const files = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    demand(!entry.isSymbolicLink(), "Artefato contém link simbólico.");
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative));
    else {
      demand(entry.isFile(), "Artefato contém entrada que não é arquivo.");
      const bytes = await fs.readFile(path.join(directory, entry.name));
      files.push({ path: relative, sha256: sha256(bytes), size: bytes.length });
    }
  }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export async function verifyDirectory(directory, expected) {
  validateFiles(expected);
  assert.deepEqual(await filesIn(directory), expected, "Os arquivos não correspondem aos bytes da candidata aprovada.");
}

export function validateManifest(manifest, { sealed = true } = {}) {
  demand(manifest?.schemaVersion === 1 && /^\d+\.\d+\.\d+$/u.test(manifest.version), "Manifesto de candidata inválido.");
  demand(SHA.test(manifest.source?.testedSha) && SHA.test(manifest.source?.headSha) && SHA.test(manifest.source?.tree), "Identidade Git incompleta.");
  demand(/^[\w.-]+\/[\w.-]+$/u.test(manifest.source.repository) && manifest.source.headRepository === manifest.source.repository, "Candidata de fork recusada.");
  positive(manifest.run?.id, "Run"); positive(manifest.run?.attempt, "Tentativa");
  demand(manifest.run.workflow === ".github/workflows/validacao.yml" && ["pull_request", "workflow_dispatch"].includes(manifest.run.event), "Origem de validação não autorizada.");
  demand(HASH.test(manifest.configurationSha256) && HASH.test(manifest.lockfileSha256) && HASH.test(manifest.backendManifestSha256), "Configuração ou dependências sem identidade.");
  demand(Number.isSafeInteger(manifest.android?.versionCode) && manifest.android.versionCode > 0 && manifest.android.certificateSha256 === CERTIFICATE, "Identidade Android inválida.");
  validateFiles(manifest.artifacts?.pages?.files);
  validateFiles(manifest.artifacts?.android?.files);
  demand(manifest.artifacts.pages.files.some((file) => file.path === "asset-manifest.json") &&
    manifest.artifacts.pages.files.some((file) => file.path === "index.html"), "Manifesto Pages incompleto.");
  if (sealed) {
    demand(manifest.gate?.scope === "integral" && manifest.gate.web === "success" && manifest.gate.supabase === "success", "Gate integral ausente ou incompleto.");
    positive(manifest.artifacts.pages.id, "Artefato Pages");
    demand(/^sha256:[a-f0-9]{64}$/u.test(manifest.artifacts.pages.digest), "Digest do upload Pages ausente.");
    demand(manifest.toolchain?.web?.node && manifest.toolchain?.supabase?.deno, "Ambiente de validação não registrado.");
  }
  return manifest;
}

async function record() {
  demand(process.env.GITHUB_ACTIONS === "true", "O registro publicável exige GitHub Actions.");
  git("diff", "--exit-code", "HEAD", "--");
  const event = await jsonFile(process.env.GITHUB_EVENT_PATH);
  const repository = process.env.GITHUB_REPOSITORY;
  const testedSha = git("rev-parse", "HEAD");
  const packageInfo = await jsonFile(path.join(ROOT, "package.json"));
  const android = await fs.readFile(path.join(ROOT, "android/app/build.gradle.kts"), "utf8");
  demand(android.match(/versionName\s*=\s*"([^"]+)"/u)?.[1] === packageInfo.version, "Versão Android divergente.");
  const manifest = {
    schemaVersion: 1, version: packageInfo.version,
    source: { repository, headRepository: event.pull_request?.head?.repo?.full_name || repository,
      testedSha, headSha: event.pull_request?.head?.sha || testedSha, tree: git("rev-parse", "HEAD^{tree}"),
      pullRequest: event.pull_request?.number || null, baseSha: event.pull_request?.base?.sha || null },
    run: { id: positive(process.env.GITHUB_RUN_ID, "Run"), attempt: positive(process.env.GITHUB_RUN_ATTEMPT, "Tentativa"),
      workflow: ".github/workflows/validacao.yml", event: process.env.GITHUB_EVENT_NAME },
    configurationSha256: configurationDigest(),
    lockfileSha256: sha256(await fs.readFile(path.join(ROOT, "package-lock.json"))),
    backendManifestSha256: sha256(await fs.readFile(path.join(ROOT, "supabase/runtime-manifest.json"))),
    android: { versionCode: Number(android.match(/versionCode\s*=\s*(\d+)/u)?.[1]), certificateSha256: CERTIFICATE },
    toolchain: { web: { node: process.version, java: toolVersion("java", ["-version"]),
      runner: process.env.ImageOS, image: process.env.ImageVersion, architecture: process.arch } },
    artifacts: { pages: { files: await filesIn(path.join(ROOT, ".pages")) },
      android: { files: await filesIn(path.join(ROOT, "android/app/build/generated/web-assets/main/www")) } }
  };
  validateManifest(manifest, { sealed: false });
  await writeJson(CANDIDATE, manifest);
}

async function seal() {
  demand(process.env.DOCS_ONLY === "false" && process.env.WEB_RESULT === "success" && process.env.SUPABASE_RESULT === "success", "As duas provas integrais são obrigatórias.");
  const manifest = await jsonFile(CANDIDATE);
  manifest.gate = { scope: "integral", web: process.env.WEB_RESULT, supabase: process.env.SUPABASE_RESULT };
  manifest.artifacts.pages.id = positive(process.env.PAGES_ARTIFACT_ID, "Artefato Pages");
  manifest.artifacts.pages.digest = `sha256:${process.env.PAGES_ARTIFACT_DIGEST}`;
  manifest.toolchain.supabase = JSON.parse(process.env.SUPABASE_TOOLCHAIN);
  validateManifest(manifest);
  await writeJson(CANDIDATE, manifest);
}

async function api(route, { method = "GET", body, missing = false, binary = false } = {}) {
  const token = process.env.GH_TOKEN;
  demand(token, "Token de acesso GitHub ausente.");
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${route}`, {
    method, redirect: binary ? "manual" : "follow",
    headers: { Authorization: `Bearer ${token}`, Accept: binary ? "application/octet-stream" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (missing && response.status === 404) return null;
  if (binary && response.status === 302) {
    const destination = new URL(response.headers.get("location"));
    demand(destination.protocol === "https:", "Download GitHub sem HTTPS recusado.");
    const download = await fetch(destination);
    demand(download.ok, "Download de artefato falhou.");
    return Buffer.from(await download.arrayBuffer());
  }
  demand(response.ok, `GitHub recusou a operação (${response.status}).`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.status === 204 ? null : response.json();
}

export function validateRun(runInfo, jobs, repository, attempt) {
  demand(runInfo.repository?.full_name === repository && runInfo.head_repository?.full_name === repository, "Run de outro repositório ou fork recusado.");
  demand(runInfo.path === ".github/workflows/validacao.yml" && ["pull_request", "workflow_dispatch"].includes(runInfo.event), "Workflow de origem não autorizado.");
  demand(runInfo.status === "completed" && runInfo.conclusion === "success" && runInfo.run_attempt === attempt, "Run integral incompleto, obsoleto ou malsucedido.");
  for (const name of ["Testar web e Android", "Testar Supabase local", "Testar e validar"]) {
    const selected = jobs.filter((job) => job.name === name);
    demand(selected.length === 1 && selected[0].conclusion === "success", `Prova obrigatória ausente: ${name}.`);
  }
  const web = jobs.find((job) => job.name === "Testar web e Android");
  const database = jobs.find((job) => job.name === "Testar Supabase local");
  for (const [job, names] of [[web, ["Executar testes", "Gerar e testar o artefato web no navegador", "Compilar aplicativo Android", "Analisar aplicativo Android"]],
    [database, ["Executar testes pgTAP", "Testar concorrência real dos pedidos de Curso", "Servir e testar o gateway MCP e a Autoria real"]]]) {
    for (const name of names) demand(job.steps?.some((step) => step.name === name && step.conclusion === "success"), `Etapa integral não executada: ${name}.`);
  }
}

async function downloadArtifact(artifact, destination, expectedFiles = null) {
  demand(artifact && !artifact.expired && /^sha256:[a-f0-9]{64}$/u.test(artifact.digest), "Artefato ausente, expirado ou sem digest confiável.");
  const archive = await api(`actions/artifacts/${positive(artifact.id, "Artefato")}/zip`, { binary: true });
  await extractArtifactArchive(artifact, archive, destination, expectedFiles);
}

export async function extractArtifactArchive(artifact, archive, destination, expectedFiles = null) {
  demand(artifact && !artifact.expired && /^sha256:[a-f0-9]{64}$/u.test(artifact.digest), "Artefato ausente, expirado ou sem digest confiável.");
  demand(`sha256:${sha256(archive)}` === artifact.digest, "Digest do arquivo baixado diverge do GitHub.");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "aralearn-candidate-"));
  try {
    const zip = path.join(temporary, "artifact.zip");
    await fs.writeFile(zip, archive);
    const entries = run("tar", ["-tf", zip]).split(/\r?\n/u).filter(Boolean);
    validateFiles(entries.map((entry) => ({ path: entry.replace(/\/$/u, ""), sha256: "0".repeat(64), size: 0 })).sort((a, b) => a.path < b.path ? -1 : 1));
    const files = entries.filter((entry) => !entry.endsWith("/"));
    validateFiles(files.map((entry) => ({ path: entry, sha256: "0".repeat(64), size: 0 })).sort((a, b) => a.path < b.path ? -1 : 1));
    if (expectedFiles) assert.deepEqual([...files].sort(), expectedFiles.map((file) => file.path).sort(), "Conteúdo do ZIP inesperado.");
    else assert.deepEqual(files, ["candidate.json"], "Manifesto compactado contém entradas inesperadas.");
    const details = run("tar", ["-tvf", zip]).split(/\r?\n/u).filter(Boolean);
    demand(details.every((line) => line.startsWith("-") || line.startsWith("d")), "Links ou entradas especiais recusados.");
    await fs.mkdir(destination, { recursive: true });
    demand((await fs.readdir(destination)).length === 0, "Destino do download precisa estar vazio.");
    run("tar", ["-xf", zip, "-C", path.resolve(destination)]);
    if (expectedFiles) await verifyDirectory(destination, expectedFiles);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

async function currentMain(target = process.env.GITHUB_SHA) {
  demand(SHA.test(target) && process.env.GITHUB_REF === "refs/heads/main", "Promoção permitida somente na main por SHA explícito.");
  const main = await api("git/ref/heads/main");
  demand(main.object.sha === target, "A revisão foi superada; promoção recusada.");
  demand(git("rev-parse", "HEAD") === target, "Checkout não corresponde à revisão de promoção.");
  return target;
}

export function validateCandidateIdentity(manifest, runInfo, { repository, targetTree, lockfileSha256, backendManifestSha256, configurationSha256 }) {
  validateManifest(manifest);
  demand(manifest.source.repository === repository && manifest.source.headSha === runInfo.head_sha && manifest.run.id === runInfo.id && manifest.run.attempt === runInfo.run_attempt && manifest.run.event === runInfo.event, "Manifesto não pertence ao run selecionado.");
  demand(manifest.source.tree === targetTree && manifest.lockfileSha256 === lockfileSha256 && manifest.backendManifestSha256 === backendManifestSha256 && manifest.configurationSha256 === configurationSha256, "Árvore, dependências, backend ou configuração divergem da candidata.");
}

export function validateVersionProgress(current, previous) {
  for (const identity of [current, previous]) demand(/^\d+\.\d+\.\d+$/u.test(identity?.version) &&
    Number.isSafeInteger(identity.versionCode) && identity.versionCode > 0, "Versão ou versionCode inválido.");
  const left = current.version.split(".").map(Number);
  const right = previous.version.split(".").map(Number);
  const index = left.findIndex((value, position) => value !== right[position]);
  if (index === -1) demand(current.versionCode === previous.versionCode, "Retry mudou o versionCode da versão publicada.");
  else demand(left[index] > right[index] && current.versionCode > previous.versionCode, "A publicação exige avanço de versão e versionCode.");
}

async function verifyVersionProgress(manifest) {
  const previous = await api("releases/latest", { missing: true });
  if (!previous) return;
  demand(/^v\d+\.\d+\.\d+$/u.test(previous.tag_name), "A versão publicada anterior não pôde ser identificada.");
  const file = await api(`contents/android/app/build.gradle.kts?ref=${encodeURIComponent(previous.tag_name)}`);
  demand(file.encoding === "base64" && typeof file.content === "string", "Identidade Android anterior indisponível.");
  const gradle = Buffer.from(file.content, "base64").toString("utf8");
  validateVersionProgress({ version: manifest.version, versionCode: manifest.android.versionCode },
    { version: previous.tag_name.slice(1), versionCode: Number(gradle.match(/versionCode\s*=\s*(\d+)/u)?.[1]) });
}

async function prepare(runId, attempt) {
  const id = positive(runId, "Run"); const number = positive(attempt, "Tentativa");
  const target = await currentMain();
  const info = await api(`actions/runs/${id}`);
  const jobResponse = await api(`actions/runs/${id}/attempts/${number}/jobs?per_page=100`);
  demand(jobResponse.total_count <= 100, "Quantidade inesperada de jobs.");
  validateRun(info, jobResponse.jobs, process.env.GITHUB_REPOSITORY, number);
  const artifactResponse = await api(`actions/runs/${id}/artifacts?per_page=100`);
  demand(artifactResponse.total_count <= 100, "Quantidade inesperada de artefatos.");
  const findArtifact = (name) => {
    const matches = artifactResponse.artifacts.filter((item) => item.name === `${name}-${number}`);
    demand(matches.length === 1, `Artefato único obrigatório ausente: ${name}.`);
    return matches[0];
  };
  await downloadArtifact(findArtifact(METADATA_NAME), ".candidate");
  const manifest = await jsonFile(CANDIDATE);
  validateCandidateIdentity(manifest, info, { repository: process.env.GITHUB_REPOSITORY,
    targetTree: git("rev-parse", "HEAD^{tree}"), configurationSha256: configurationDigest(),
    lockfileSha256: sha256(await fs.readFile("package-lock.json")), backendManifestSha256: sha256(await fs.readFile("supabase/runtime-manifest.json")) });
  const testedCommit = await api(`git/commits/${manifest.source.testedSha}`);
  demand(testedCommit.tree.sha === manifest.source.tree, "Árvore do SHA testado não comprovada pelo GitHub.");
  if (info.event === "pull_request") {
    const number = positive(manifest.source.pullRequest, "PR");
    demand(info.pull_requests?.some((pr) => pr.number === number), "Run não está vinculado ao PR informado.");
    const pr = await api(`pulls/${number}`);
    demand(pr.merged && pr.merge_commit_sha === target && pr.head.sha === manifest.source.headSha &&
      pr.head.repo.full_name === process.env.GITHUB_REPOSITORY && pr.base.ref === "main", "A candidata não corresponde ao PR integrado nesta revisão.");
  } else demand(info.head_branch === "main" && info.head_sha === target, "Dispatch de candidata não corresponde à main corrente.");
  await verifyVersionProgress(manifest);
  const pages = findArtifact(PAGES_NAME);
  demand(pages.id === manifest.artifacts.pages.id && pages.digest === manifest.artifacts.pages.digest, "Identidade do upload Pages diverge do gate.");
  await downloadArtifact(pages, ".pages", manifest.artifacts.pages.files);
  manifest.promotion = { targetSha: target, tree: git("rev-parse", "HEAD^{tree}"), candidateRun: id, candidateAttempt: number };
  await writeJson(CANDIDATE, manifest);
  await output("version", manifest.version);
  await output("target_sha", target);
}

export async function verifyAndroid(apk, manifest) {
  validateManifest(manifest);
  const prefix = "assets/www/";
  const actual = run("tar", ["-tf", apk]).split(/\r?\n/u).filter((entry) => entry.startsWith(prefix) && !entry.endsWith("/")).map((entry) => entry.slice(prefix.length)).sort();
  assert.deepEqual(actual, manifest.artifacts.android.files.map((file) => file.path).sort(), "Runtime do APK difere da candidata.");
  for (const file of manifest.artifacts.android.files) {
    const bytes = run("tar", ["-xOf", apk, `${prefix}${file.path}`], { encoding: null });
    demand(bytes.length === file.size && sha256(bytes) === file.sha256, `Bytes do APK divergem da candidata: ${file.path}.`);
  }
}

export function releasePlan({ tagSha, release, targetSha, version }) {
  demand(SHA.test(targetSha) && /^\d+\.\d+\.\d+$/u.test(version), "Identidade de release inválida.");
  demand(!tagSha || tagSha === targetSha, "Tag existente aponta para outra revisão.");
  if (release) demand(tagSha && release.tag_name === `v${version}` && !release.prerelease, "Release existente é incompatível.");
  return { create: !release, finalize: !release || release.draft === true };
}

async function releaseState(manifest) {
  const tag = `v${manifest.version}`;
  const ref = await api(`git/ref/tags/${tag}`, { missing: true });
  let tagSha = ref?.object.sha || null;
  if (ref?.object.type === "tag") tagSha = (await api(`git/tags/${tagSha}`)).object.sha;
  const release = await api(`releases/tags/${tag}`, { missing: true });
  const plan = releasePlan({ tagSha, release, targetSha: manifest.promotion.targetSha, version: manifest.version });
  return { tag, release, ...plan };
}

async function requirePromotion() {
  const manifest = validateManifest(await jsonFile(CANDIDATE));
  demand(manifest.promotion?.targetSha === process.env.GITHUB_SHA && manifest.promotion.tree === manifest.source.tree, "Manifesto sem promoção validada.");
  await currentMain(manifest.promotion.targetSha);
  demand(manifest.configurationSha256 === configurationDigest(), "Configuração mudou após a aprovação.");
  return manifest;
}

async function verifyBackend() {
  const manifest = await requirePromotion();
  const backend = await verifyHostedBackend({ projectUrl: process.env.ARALEARN_SUPABASE_URL,
    publishableKey: process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY });
  manifest.promotion.backend = backend;
  await writeJson(CANDIDATE, manifest);
}

async function siteCurrent() {
  const manifest = await requirePromotion();
  let current = false;
  try {
    await verifyPublishedSite({ siteUrl: "https://fabio-ara.github.io/AraLearn/", candidateManifest: manifest });
    current = true;
  } catch { console.log("O site ainda não confirmou os bytes desta candidata; a publicação permanece necessária."); }
  await output("site_current", current);
}

async function releaseAsset(release, name, expectedBytes = null) {
  const matches = release.assets.filter((asset) => asset.name === name);
  demand(matches.length <= 1, "Assets duplicados na release.");
  if (!matches.length) return null;
  const asset = matches[0];
  demand(asset.state === "uploaded" && asset.size > 0, "Asset existente está incompleto.");
  const bytes = await api(`releases/assets/${asset.id}`, { binary: true });
  if (expectedBytes) demand(sha256(bytes) === sha256(expectedBytes), `Asset existente diverge: ${name}.`);
  return bytes;
}

async function reuseApk() {
  const manifest = await requirePromotion();
  const state = await releaseState(manifest);
  const name = `AraLearn-${manifest.version}.apk`;
  const bytes = state.release ? await releaseAsset(state.release, name) : null;
  if (bytes) {
    await fs.writeFile(name, bytes);
    await verifyAndroid(name, manifest);
  }
  await output("reused", Boolean(bytes));
}

export function buildReleaseNotes(changelog, version) {
  demand(/^\d+\.\d+\.\d+$/u.test(version), "Versão das notas inválida.");
  const sections = String(changelog).replace(/\r\n/gu, "\n").split(/^## /mu);
  const matching = sections.filter(section => section.startsWith(`[${version}] - `));
  demand(matching.length === 1, "Notas da versão ausentes ou duplicadas no registro de mudanças.");
  const content = matching[0].slice(matching[0].indexOf("\n") + 1).trim();
  demand(content.startsWith("### ") && /^- /mu.test(content), "Notas da versão estão vazias.");
  return `${content}\n\n[Usar o AraLearn](https://fabio-ara.github.io/AraLearn/) · ` +
    `[Orientações de atualização](https://github.com/fabio-ara/AraLearn/blob/v${version}/docs/implantacao.md)\n\n` +
    "O APK mantém o certificado das versões anteriores. O checksum e o manifesto anexos identificam os artefatos desta versão.\n";
}

async function stageRelease(apk) {
  const manifest = await requirePromotion();
  demand(manifest.promotion.backend?.schemaRevision, "Backend hospedado ainda não foi conferido.");
  await verifyAndroid(apk, manifest);
  const name = `AraLearn-${manifest.version}.apk`;
  if (path.resolve(apk) !== path.resolve(name)) await fs.copyFile(apk, name);
  const apkBytes = await fs.readFile(name);
  const checksumName = `${name}.sha256`;
  const receiptName = `AraLearn-${manifest.version}.json`;
  const receipt = { ...manifest, release: { apk: name, sha256: sha256(apkBytes), certificateSha256: CERTIFICATE } };
  await fs.writeFile(checksumName, `${sha256(apkBytes)}  ${name}\n`);
  await writeJson(receiptName, receipt);
  let state = await releaseState(manifest);
  if (state.create) {
    const notes = buildReleaseNotes(await fs.readFile(path.join(ROOT, "CHANGELOG.md"), "utf8"), manifest.version);
    await fs.writeFile(".candidate/release-notes.md", notes);
    run("gh", ["release", "create", state.tag, "--repo", process.env.GITHUB_REPOSITORY, "--target", manifest.promotion.targetSha, "--draft", "--title", `AraLearn v${manifest.version}`, "--notes-file", ".candidate/release-notes.md"]);
    state = await releaseState(manifest);
  }
  for (const file of [name, checksumName, receiptName]) {
    const bytes = await fs.readFile(file);
    if (!await releaseAsset(state.release, file, bytes)) {
      demand(state.release.draft, "Release pública sem asset obrigatório; recuperação exige inspeção explícita.");
      run("gh", ["release", "upload", state.tag, file, "--repo", process.env.GITHUB_REPOSITORY]);
    }
  }
}

async function finalizeRelease() {
  const manifest = await requirePromotion();
  demand(manifest.promotion.backend?.schemaRevision, "Backend hospedado ainda não foi conferido.");
  const backend = await verifyHostedBackend({ projectUrl: process.env.ARALEARN_SUPABASE_URL,
    publishableKey: process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY });
  assert.deepEqual(backend, manifest.promotion.backend, "Backend mudou durante a promoção.");
  await verifyPublishedSite({ siteUrl: "https://fabio-ara.github.io/AraLearn/", candidateManifest: manifest });
  const state = await releaseState(manifest);
  demand(state.release, "Release preparada ausente.");
  const name = `AraLearn-${manifest.version}.apk`;
  const apk = await releaseAsset(state.release, name);
  const checksum = await releaseAsset(state.release, `${name}.sha256`);
  const receiptBytes = await releaseAsset(state.release, `AraLearn-${manifest.version}.json`);
  demand(apk && checksum && receiptBytes, "A publicação ainda está parcial.");
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  demand(receipt.release?.sha256 === sha256(apk) && checksum.toString("utf8") === `${sha256(apk)}  ${name}\n`, "Checksum publicado diverge.");
  const { release, ...candidate } = receipt;
  demand(release.certificateSha256 === CERTIFICATE, "Certificado declarado divergente.");
  assert.deepEqual(candidate, manifest, "Manifesto da release diverge da promoção.");
  if (state.release.draft) await api(`releases/${state.release.id}`, { method: "PATCH", body: { draft: false } });
  console.log(`Release verificada: https://github.com/${process.env.GITHUB_REPOSITORY}/releases/tag/${state.tag}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "record") await record();
  else if (command === "seal") await seal();
  else if (command === "prepare") await prepare(args[0], args[1]);
  else if (command === "verify-backend") await verifyBackend();
  else if (command === "site-current") await siteCurrent();
  else if (command === "verify-pages") await verifyDirectory(".pages", validateManifest(await jsonFile(CANDIDATE)).artifacts.pages.files);
  else if (command === "verify-android") await verifyAndroid(args[0], await jsonFile(CANDIDATE));
  else if (command === "reuse-apk") await reuseApk();
  else if (command === "stage-release") await stageRelease(args[0]);
  else if (command === "finalize-release") await finalizeRelease();
  else if (command === "current") await requirePromotion();
  else throw new Error("Comando de candidata desconhecido.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
