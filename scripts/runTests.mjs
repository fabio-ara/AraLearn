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
  if (args[0] !== "--focal" || args.length < 2) {
    throw new Error("Uso: npm run test:focal -- tests/runtime/arquivo.test.js [outro.test.js]. Sem argumentos, o runner executa o conjunto integral.");
  }
  const selected = new Set(args.slice(1).map((argument) => {
    const absolute = path.resolve(root, argument);
    if (!available.includes(absolute)) {
      throw new Error(`Teste focal não encontrado em tests/kernel ou tests/runtime: ${argument}`);
    }
    return absolute;
  }));
  return available.filter((file) => selected.has(file));
}

export function runTests(args = [], root = repositoryRoot) {
  const files = resolveTestFiles(args, root);
  const testConcurrency = process.env.ARALEARN_TEST_CONCURRENCY || "1";
  const mode = args.length ? "focal" : "integral";
  process.stdout.write(`Testes: modo ${mode}, ${files.length} arquivo(s).\n`);
  const result = spawnSync(process.execPath, [
    "--test",
    `--test-concurrency=${testConcurrency}`,
    ...files
  ], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.error) process.stderr.write(`Falha ao iniciar os testes: ${result.error.message}\n`);
  return typeof result.status === "number" ? result.status : 1;
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
