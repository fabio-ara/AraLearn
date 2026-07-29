import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJavaScript } from "espree";
import { buildAssistAllowedOrigins } from "../src/config/networkOrigins.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const CSP_CONNECT_SOURCE_PLACEHOLDER = "__ARALEARN_CONNECT_SRC__";
const CACHE_REVISION_PLACEHOLDER = "__ARALEARN_CACHE_REVISION__";

const runtimeDependencies = [
  "node_modules/pdfjs-dist/build/pdf.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  "node_modules/mammoth/mammoth.browser.js"
];

const runtimeStaticAssets = [
  "docs/downloads/authoring/aralearn-authoring-chatgpt.zip",
  "docs/downloads/authoring/aralearn-chatgpt-system-prompt.md",
  "docs/downloads/authoring/aralearn-chatgpt-knowledge.md"
];

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const options = {
    target: "",
    output: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--target") {
      options.target = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (argument === "--output") {
      options.output = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    fail(`Argumento desconhecido: ${argument}`);
  }

  if (options.target !== "pages" && options.target !== "android") {
    fail('Destino inválido. Use "--target pages" ou "--target android".');
  }
  if (!options.output) {
    fail("Informe o diretório de saída com --output.");
  }

  return options;
}

function pathIsInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
}

function samePath(leftPath, rightPath) {
  const left = path.resolve(leftPath);
  const right = path.resolve(rightPath);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function resolveSafeOutput(target, outputValue) {
  const outputPath = path.resolve(repositoryRoot, outputValue);
  const expectedOutputPath = target === "pages"
    ? path.join(repositoryRoot, ".pages")
    : path.join(repositoryRoot, "android", "app", "build", "generated", "web-assets", "main");

  if (!samePath(outputPath, expectedOutputPath)) {
    fail(`Saída inválida para ${target}: ${normalizeArtifactPath(path.relative(repositoryRoot, outputPath))}.`);
  }

  return outputPath;
}

async function listFiles(directoryPath) {
  const files = [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function copyFile(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function copyTree(sourceDirectory, destinationDirectory) {
  const files = await listFiles(sourceDirectory);
  for (const sourcePath of files) {
    const relativePath = path.relative(sourceDirectory, sourcePath);
    await copyFile(sourcePath, path.join(destinationDirectory, relativePath));
  }
}

function collectModuleSpecifiers(source) {
  const specifiers = [];
  const syntaxTree = parseJavaScript(source, {
    ecmaVersion: "latest",
    sourceType: "module"
  });
  const pending = [syntaxTree];

  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (
      (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") &&
      typeof node.source?.value === "string"
    ) {
      specifiers.push(node.source.value);
    } else if (node.type === "ImportExpression" && typeof node.source?.value === "string") {
      specifiers.push(node.source.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        pending.push(...value);
      } else if (value && typeof value === "object") {
        pending.push(value);
      }
    }
  }
  return [...new Set(specifiers)];
}

async function collectRuntimeJavaScript() {
  const sourceRoot = path.join(repositoryRoot, "src");
  const entryPath = path.join(repositoryRoot, "public", "main.js");
  const pending = [entryPath];
  const visited = new Set();

  while (pending.length) {
    const modulePath = pending.pop();
    const moduleKey = path.resolve(modulePath);
    if (visited.has(moduleKey)) continue;
    visited.add(moduleKey);

    const source = await fs.readFile(moduleKey, "utf8");
    for (const specifier of collectModuleSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const dependencyPath = path.resolve(path.dirname(moduleKey), specifier);
      if (!pathIsInside(sourceRoot, dependencyPath)) {
        fail(`Import relativo fora de src no runtime: ${specifier} em ${path.relative(repositoryRoot, moduleKey)}.`);
      }
      if (path.extname(dependencyPath).toLowerCase() !== ".js") {
        fail(`Módulo do runtime sem extensão .js: ${specifier} em ${path.relative(repositoryRoot, moduleKey)}.`);
      }
      try {
        await fs.access(dependencyPath);
      } catch {
        fail(`Módulo ausente no runtime: ${specifier} em ${path.relative(repositoryRoot, moduleKey)}.`);
      }
      pending.push(dependencyPath);
    }
  }

  visited.delete(path.resolve(entryPath));
  return [...visited];
}

async function copyRuntimeJavaScript(runtimeRoot) {
  const sourceRoot = path.join(repositoryRoot, "src");
  const javaScriptFiles = await collectRuntimeJavaScript();

  for (const sourcePath of javaScriptFiles) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    await copyFile(sourcePath, path.join(runtimeRoot, "src", relativePath));
  }
}

async function copyRuntimeDependencies(runtimeRoot) {
  for (const relativePath of runtimeDependencies) {
    const sourcePath = path.join(repositoryRoot, relativePath);
    try {
      await fs.access(sourcePath);
    } catch {
      fail(`Dependência pública ausente: ${relativePath}`);
    }
    await copyFile(sourcePath, path.join(runtimeRoot, relativePath));
  }
}

async function copyRuntimeStaticAssets(publicDestination) {
  for (const relativePath of runtimeStaticAssets) {
    const sourcePath = path.join(repositoryRoot, relativePath);
    try {
      await fs.access(sourcePath);
    } catch {
      fail(`Material público do assistente ausente: ${relativePath}`);
    }
    await copyFile(sourcePath, path.join(publicDestination, relativePath));
  }
}

async function rewritePagesMainImport(runtimeRoot) {
  const mainPath = path.join(runtimeRoot, "main.js");
  const source = await fs.readFile(mainPath, "utf8");
  const rewritten = source.replaceAll('"../src/', '"./src/').replaceAll("'../src/", "'./src/");
  await fs.writeFile(mainPath, rewritten, "utf8");
}

function normalizeArtifactPath(value) {
  return value.split(path.sep).join("/");
}

async function writePagesAssetManifest(runtimeRoot) {
  const files = await listFiles(runtimeRoot);
  const assets = files
    .map((filePath) => normalizeArtifactPath(path.relative(runtimeRoot, filePath)))
    .filter((relativePath) => relativePath !== "asset-manifest.json")
    .filter((relativePath) => !relativePath.endsWith(".map"))
    .map((relativePath) => `./${relativePath}`)
    .sort();
  await fs.writeFile(
    path.join(runtimeRoot, "asset-manifest.json"),
    `${JSON.stringify({ assets }, null, 2)}\n`,
    "utf8"
  );
}

async function stampServiceWorker(runtimeRoot, publicDestination) {
  const serviceWorkerPath = path.join(publicDestination, "service-worker.js");
  const source = await fs.readFile(serviceWorkerPath, "utf8");
  if (!source.includes(CACHE_REVISION_PLACEHOLDER)) {
    fail("Placeholder da revisão de cache ausente em public/service-worker.js.");
  }
  const files = (await listFiles(runtimeRoot))
    .filter((filePath) => !samePath(filePath, serviceWorkerPath))
    .filter((filePath) => path.basename(filePath) !== "asset-manifest.json")
    .sort((left, right) =>
      normalizeArtifactPath(path.relative(runtimeRoot, left))
        .localeCompare(normalizeArtifactPath(path.relative(runtimeRoot, right)))
    );
  const digest = createHash("sha256");
  for (const filePath of files) {
    digest.update(normalizeArtifactPath(path.relative(runtimeRoot, filePath)));
    digest.update("\0");
    digest.update(await fs.readFile(filePath));
    digest.update("\0");
  }
  const revision = digest.digest("hex").slice(0, 20);
  await fs.writeFile(
    serviceWorkerPath,
    source.replaceAll(CACHE_REVISION_PLACEHOLDER, revision),
    "utf8"
  );
  return revision;
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function publicRuntimeConfig({ target = "pages" } = {}) {
  const supabaseUrl = String(process.env.ARALEARN_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const supabasePublishableKey = String(process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const payload = decodeJwtPayload(supabasePublishableKey);
  if (
    payload?.role === "service_role" ||
    /service[_-]?role/i.test(supabasePublishableKey) ||
    /^sb_secret_/i.test(supabasePublishableKey)
  ) {
    fail("ARALEARN_SUPABASE_PUBLISHABLE_KEY não pode ser uma service role key.");
  }
  if (supabaseUrl) {
    let parsed;
    try {
      parsed = new URL(supabaseUrl);
    } catch {
      fail("ARALEARN_SUPABASE_URL deve ser uma URL válida.");
    }
    const local = new Set(["localhost", "127.0.0.1", "10.0.2.2"]).has(parsed.hostname);
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
      fail("ARALEARN_SUPABASE_URL deve usar HTTPS fora do desenvolvimento local.");
    }
  }
  const assistAllowedOrigins = buildAssistAllowedOrigins({
    configured: process.env.ARALEARN_ASSIST_ALLOWED_ORIGINS || "",
    development: target === "android"
  });
  return {
    supabaseUrl,
    supabasePublishableKey,
    assistAllowedOrigins,
    androidRuntime: target === "android"
  };
}

async function writeRuntimeConfig(publicDestination, target) {
  const config = publicRuntimeConfig({ target });
  const source = `globalThis.__ARALEARN_ENV__ ??= Object.freeze(${JSON.stringify(config, null, 2)});\n`;
  await fs.writeFile(path.join(publicDestination, "runtime-config.js"), source, "utf8");
}

async function writeExactContentSecurityPolicy(publicDestination, target) {
  const config = publicRuntimeConfig({ target });
  const indexPath = path.join(publicDestination, "index.html");
  const source = await fs.readFile(indexPath, "utf8");
  if (!source.includes(CSP_CONNECT_SOURCE_PLACEHOLDER)) {
    fail("Placeholder da CSP ausente em public/index.html.");
  }
  const connectSource = [
    config.supabaseUrl ? new URL(config.supabaseUrl).origin : "",
    ...config.assistAllowedOrigins
  ].filter(Boolean).join(" ");
  const rewritten = source.replaceAll(CSP_CONNECT_SOURCE_PLACEHOLDER, connectSource);
  if (/connect-src[^;]*\bhttps:\s/u.test(rewritten)) {
    fail("A CSP não pode liberar conexões para qualquer origem HTTPS.");
  }
  await fs.writeFile(indexPath, rewritten, "utf8");
}

async function validateArtifact(runtimeRoot) {
  const artifactFiles = await listFiles(runtimeRoot);
  const relativeFiles = artifactFiles.map((filePath) => normalizeArtifactPath(path.relative(runtimeRoot, filePath)));
  const forbiddenSegments = new Set(["fixtures", "_old", "embedded-courses"]);
  const forbiddenRuntimeFiles = new Set([
    "embeddedseedcourseloader.js",
    "embeddedseedprojectdocument.js",
    "createbrowserindexeddbstore.js",
    "createprojectstorage.js"
  ]);

  for (const relativePath of relativeFiles) {
    const segments = relativePath.split("/").map((segment) => segment.toLowerCase());
    if (segments.some((segment) => forbiddenSegments.has(segment))) {
      fail(`Artefato proibido no runtime: ${relativePath}`);
    }
    if (forbiddenRuntimeFiles.has(segments.at(-1))) {
      fail(`Caminho documental ou catálogo legado presente no runtime: ${relativePath}`);
    }
  }

  const commandLineModules = relativeFiles.filter((relativePath) => relativePath.endsWith(".cli.js"));
  if (commandLineModules.length) {
    fail(`Módulo exclusivo de linha de comando presente no runtime: ${commandLineModules.join(", ")}.`);
  }

  const packagedCourseFiles = relativeFiles.filter((relativePath) => {
    const fileName = path.posix.basename(relativePath);
    return /(?:seed-)?course(?:s)?(?:[.-][^/]*)?\.json$/i.test(fileName) || /catalog.*\.json$/i.test(fileName);
  });
  if (packagedCourseFiles.length) {
    fail(`Curso ou catálogo operacional presente no artefato: ${packagedCourseFiles.join(", ")}.`);
  }

  for (const relativePath of runtimeDependencies) {
    const normalizedPath = normalizeArtifactPath(relativePath);
    if (!relativeFiles.includes(normalizedPath)) {
      fail(`Dependência ausente no artefato: ${normalizedPath}`);
    }
  }

}

async function stageRuntime({ target, outputPath }) {
  const runtimeRoot = target === "android" ? path.join(outputPath, "www") : outputPath;
  const publicDestination = target === "android" ? path.join(runtimeRoot, "public") : runtimeRoot;

  await fs.rm(outputPath, { recursive: true, force: true });
  await fs.mkdir(outputPath, { recursive: true });
  await copyTree(path.join(repositoryRoot, "public"), publicDestination);
  await copyRuntimeStaticAssets(publicDestination);
  await writeRuntimeConfig(publicDestination, target);
  await writeExactContentSecurityPolicy(publicDestination, target);
  await copyRuntimeJavaScript(runtimeRoot);
  await copyRuntimeDependencies(runtimeRoot);

  if (target === "pages") {
    await rewritePagesMainImport(runtimeRoot);
    await stampServiceWorker(runtimeRoot, publicDestination);
    await writePagesAssetManifest(runtimeRoot);
  } else {
    await stampServiceWorker(runtimeRoot, publicDestination);
  }

  await validateArtifact(runtimeRoot);
  return runtimeRoot;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputPath = resolveSafeOutput(options.target, options.output);
  const runtimeRoot = await stageRuntime({
    target: options.target,
    outputPath
  });
  const relativeRuntimeRoot = normalizeArtifactPath(path.relative(repositoryRoot, runtimeRoot));
  console.log(`Runtime ${options.target} gerado em ${relativeRuntimeRoot || "."}.`);
  console.log("Catálogo embarcado: ausente.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
