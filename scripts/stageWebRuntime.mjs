import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJavaScript } from "espree";
import {
  CONTRACT_KIND_PROJECT,
  CONTRACT_NAME,
  CONTRACT_VERSION,
  validateContractDocument
} from "../src/contract/validateContract.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const embeddedCatalogDirectory = path.join(repositoryRoot, "src", "data", "embedded-courses");
const embeddedManifestName = "embedded-seed-manifest.json";
const embeddedManifestPath = path.join(embeddedCatalogDirectory, embeddedManifestName);

const runtimeDependencies = [
  "node_modules/pdfjs-dist/build/pdf.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  "node_modules/mammoth/mammoth.browser.js"
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

async function readJson(filePath, label) {
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (error) {
    fail(`${label} ausente: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} contém JSON inválido: ${error.message}`);
  }
}

function validateCourseFileName(value) {
  const fileName = typeof value === "string" ? value.trim() : "";
  if (
    !fileName ||
    fileName !== path.basename(fileName) ||
    !fileName.endsWith(".json") ||
    fileName === embeddedManifestName
  ) {
    fail(`Arquivo inválido no manifesto de cursos embarcados: ${String(value || "")}`);
  }
  return fileName;
}

async function readEmbeddedManifest() {
  const manifest = await readJson(embeddedManifestPath, "Manifesto de cursos embarcados");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("Manifesto de cursos embarcados deve ser um objeto.");
  }
  if (!Array.isArray(manifest.courseFiles) || !manifest.courseFiles.length) {
    fail("Manifesto de cursos embarcados não contém courseFiles.");
  }

  const courseFiles = manifest.courseFiles.map((value) => validateCourseFileName(value));
  if (new Set(courseFiles).size !== courseFiles.length) {
    fail("Manifesto de cursos embarcados contém arquivos duplicados.");
  }

  const courses = await Promise.all(
    courseFiles.map((fileName) => readJson(path.join(embeddedCatalogDirectory, fileName), `Curso embarcado ${fileName}`))
  );
  const validation = validateContractDocument({
    contract: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    kind: CONTRACT_KIND_PROJECT,
    courses
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    fail(`Catálogo embarcado inválido: ${details}`);
  }

  return { courseFiles };
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

async function copyEmbeddedCatalog(runtimeRoot, courseFiles) {
  const destinationDirectory = path.join(runtimeRoot, "src", "data", "embedded-courses");
  await copyFile(embeddedManifestPath, path.join(destinationDirectory, embeddedManifestName));
  for (const fileName of courseFiles) {
    await copyFile(path.join(embeddedCatalogDirectory, fileName), path.join(destinationDirectory, fileName));
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

async function rewritePagesMainImport(runtimeRoot) {
  const mainPath = path.join(runtimeRoot, "main.js");
  const source = await fs.readFile(mainPath, "utf8");
  const rewritten = source.replaceAll('"../src/', '"./src/').replaceAll("'../src/", "'./src/");
  await fs.writeFile(mainPath, rewritten, "utf8");
}

function normalizeArtifactPath(value) {
  return value.split(path.sep).join("/");
}

async function validateArtifact(runtimeRoot, courseFiles) {
  const artifactFiles = await listFiles(runtimeRoot);
  const relativeFiles = artifactFiles.map((filePath) => normalizeArtifactPath(path.relative(runtimeRoot, filePath)));
  const forbiddenSegments = new Set(["fixtures", "_old"]);

  for (const relativePath of relativeFiles) {
    const segments = relativePath.split("/").map((segment) => segment.toLowerCase());
    if (segments.some((segment) => forbiddenSegments.has(segment))) {
      fail(`Artefato proibido no runtime: ${relativePath}`);
    }
  }

  const commandLineModules = relativeFiles.filter((relativePath) => relativePath.endsWith(".cli.js"));
  if (commandLineModules.length) {
    fail(`Módulo exclusivo de linha de comando presente no runtime: ${commandLineModules.join(", ")}.`);
  }

  const catalogPrefix = "src/data/embedded-courses/";
  const packagedCatalogFiles = relativeFiles
    .filter((relativePath) => relativePath.startsWith(catalogPrefix))
    .map((relativePath) => relativePath.slice(catalogPrefix.length))
    .sort();
  const expectedCatalogFiles = [embeddedManifestName, ...courseFiles].sort();

  if (JSON.stringify(packagedCatalogFiles) !== JSON.stringify(expectedCatalogFiles)) {
    fail(
      "Catálogo empacotado diverge do manifesto. " +
      `Esperado: ${expectedCatalogFiles.join(", ")}. ` +
      `Encontrado: ${packagedCatalogFiles.join(", ")}.`
    );
  }

  const unlistedCourseFiles = relativeFiles.filter((relativePath) => {
    const fileName = path.posix.basename(relativePath);
    return /(?:seed-)?course\.json$/i.test(fileName) && !relativePath.startsWith(catalogPrefix);
  });
  if (unlistedCourseFiles.length) {
    fail(`Curso não listado no manifesto foi empacotado: ${unlistedCourseFiles.join(", ")}`);
  }

  for (const relativePath of runtimeDependencies) {
    const normalizedPath = normalizeArtifactPath(relativePath);
    if (!relativeFiles.includes(normalizedPath)) {
      fail(`Dependência ausente no artefato: ${normalizedPath}`);
    }
  }
}

async function stageRuntime({ target, outputPath, courseFiles }) {
  const runtimeRoot = target === "android" ? path.join(outputPath, "www") : outputPath;
  const publicDestination = target === "android" ? path.join(runtimeRoot, "public") : runtimeRoot;

  await fs.rm(outputPath, { recursive: true, force: true });
  await fs.mkdir(outputPath, { recursive: true });
  await copyTree(path.join(repositoryRoot, "public"), publicDestination);
  await copyRuntimeJavaScript(runtimeRoot);
  await copyEmbeddedCatalog(runtimeRoot, courseFiles);
  await copyRuntimeDependencies(runtimeRoot);

  if (target === "pages") {
    await rewritePagesMainImport(runtimeRoot);
  }

  await validateArtifact(runtimeRoot, courseFiles);
  return runtimeRoot;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputPath = resolveSafeOutput(options.target, options.output);
  const manifest = await readEmbeddedManifest();
  const runtimeRoot = await stageRuntime({
    target: options.target,
    outputPath,
    courseFiles: manifest.courseFiles
  });
  const relativeRuntimeRoot = normalizeArtifactPath(path.relative(repositoryRoot, runtimeRoot));
  console.log(`Runtime ${options.target} gerado em ${relativeRuntimeRoot || "."}.`);
  console.log(`Cursos embarcados: ${manifest.courseFiles.length}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
