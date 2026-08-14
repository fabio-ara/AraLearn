import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceRoot = process.cwd();
const edgeRuntimeRoot = path.join(
  sourceRoot,
  "supabase",
  "functions",
  "_shared",
  "aralearn",
  "runtime"
);

const fixedFiles = [
  ["src/core/exerciseOptions.js", "core/exerciseOptions.js"],
  ["src/domain/aralearnProject.js", "domain/aralearnProject.js"],
  ["src/domain/formulaExpression.js", "domain/formulaExpression.js"],
  ["src/flowchart/flowchartStructure.js", "flowchart/flowchartStructure.js"],
  ["src/persistence/contractToRelationalRows.js", "persistence/contractToRelationalRows.js"],
  ["src/persistence/canonicalCourseHash.js", "persistence/canonicalCourseHash.js"],
  ["src/persistence/relationalSchema.js", "persistence/relationalSchema.js"],
  ["src/persistence/relationalRowsToContract.js", "persistence/relationalRowsToContract.js"],
  ["src/persistence/validateRelationalCourse.js", "persistence/validateRelationalCourse.js"],
  ["src/authoring/pedagogicalBlueprint.js", "authoring/pedagogicalBlueprint.js"],
  ["src/authoring/protectedCore.js", "authoring/protectedCore.js"]
];

async function listJavaScriptFiles(relativeRoot) {
  const absoluteRoot = path.join(sourceRoot, relativeRoot);
  const entries = await readdir(absoluteRoot, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => {
      const sourceRelativePath = path.relative(sourceRoot, path.join(entry.parentPath, entry.name));
      const targetRelativePath = path.relative(path.join(sourceRoot, "src"), path.join(entry.parentPath, entry.name));
      return [sourceRelativePath, targetRelativePath];
    });
}

const files = [
  ...fixedFiles,
  ...(await listJavaScriptFiles("src/resources/catalog")),
  ...(await listJavaScriptFiles("src/resources/kernel")),
  ...(await listJavaScriptFiles("src/resources/sdk")),
  ...(await listJavaScriptFiles("src/resources/packages"))
];

const checkOnly = process.argv.includes("--check");
const divergent = [];
const expectedTargets = new Set(files.map(([, targetRelativePath]) => targetRelativePath));

for (const [sourceRelativePath, targetRelativePath] of files) {
  const sourcePath = path.join(sourceRoot, sourceRelativePath);
  const targetPath = path.join(edgeRuntimeRoot, targetRelativePath);
  const source = await readFile(sourcePath, "utf8");
  const target = await readFile(targetPath, "utf8").catch(() => null);
  if (target === source) continue;
  divergent.push(targetRelativePath);
  if (!checkOnly) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, source, "utf8");
  }
}

const edgeResourcesRoot = path.join(edgeRuntimeRoot, "resources");
const mirroredResourceEntries = await readdir(edgeResourcesRoot, { recursive: true, withFileTypes: true });
for (const entry of mirroredResourceEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const targetPath = path.join(entry.parentPath, entry.name);
  const targetRelativePath = path.relative(edgeRuntimeRoot, targetPath);
  if (expectedTargets.has(targetRelativePath)) continue;
  divergent.push(targetRelativePath);
  if (!checkOnly) await rm(targetPath);
}

if (checkOnly && divergent.length) {
  throw new Error(
    `Espelho Edge divergente do registro canônico: ${divergent.join(", ")}.`
  );
}

if (!checkOnly) {
  console.log(`Runtime Edge sincronizado: ${files.length} arquivos.`);
}
