import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectories = ["tests/kernel", "tests/runtime"];

export function resolveTestFiles(args = [], root = repositoryRoot) {
  const available = testDirectories.flatMap((directory) => {
    const testsDir = path.resolve(root, directory);
    return fs.readdirSync(testsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .map((entry) => path.join(testsDir, entry.name));
  });
  if (args.length === 0) {
    if (!available.length) throw new Error("Nenhum arquivo de teste encontrado.");
    return available;
  }
  let selectedArguments;
  if (args[0] === "--focal" && args.length >= 2) selectedArguments = args.slice(1);
  else if (args[0] === "--focal-list" && args.length === 2 &&
      args[1] === ".validation/runtime-focal-files.json") {
    const list = JSON.parse(fs.readFileSync(path.join(root, args[1]), "utf8"));
    if (!Array.isArray(list) || list.some(file => typeof file !== "string")) {
      throw new Error("Lista de testes focais inválida.");
    }
    selectedArguments = list;
  } else {
    throw new Error("Uso: npm run test:focal -- tests/runtime/arquivo.test.js [outro.test.js]. Sem argumentos, o runner executa o conjunto integral.");
  }
  if (!selectedArguments.length) throw new Error("Uso: a seleção focal precisa conter ao menos um teste.");
  const selected = new Set(selectedArguments.map((argument) => {
    const absolute = path.resolve(root, argument);
    if (!available.includes(absolute)) {
      throw new Error(`Teste focal não encontrado em tests/kernel ou tests/runtime: ${argument}`);
    }
    return absolute;
  }));
  return available.filter((file) => selected.has(file));
}

export function batchTestFiles(files, maxArgumentLength = process.platform === "win32" ? 12_000 : Infinity) {
  const batches = [];
  let batch = [];
  let length = 0;
  for (const file of files) {
    const size = file.length + 3;
    if (batch.length && length + size > maxArgumentLength) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    if (size > maxArgumentLength) throw new Error("O caminho de um teste excede o limite de argumentos do processo.");
    batch.push(file);
    length += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function runTests(args = [], root = repositoryRoot) {
  const files = resolveTestFiles(args, root);
  const testConcurrency = process.env.ARALEARN_TEST_CONCURRENCY || "1";
  const mode = args.length ? "focal" : "integral";
  process.stdout.write(`Testes: modo ${mode}, ${files.length} arquivo(s).\n`);
  let exitCode = 0;
  for (const batch of batchTestFiles(files)) {
    const result = spawnSync(process.execPath, [
      "--test",
      `--test-concurrency=${testConcurrency}`,
      ...batch
    ], {
      cwd: root,
      stdio: "inherit"
    });
    if (result.error) process.stderr.write(`Falha ao iniciar os testes: ${result.error.message}\n`);
    if (typeof result.status !== "number" || result.status !== 0) exitCode = result.status || 1;
  }
  return exitCode;
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (modulePath.toLowerCase() === invokedPath.toLowerCase()) {
  try {
    process.exitCode = runTests(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
