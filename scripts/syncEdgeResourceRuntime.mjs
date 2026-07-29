import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const files = [
  ["src/core/authoringResourceContract.js", "core/authoringResourceContract.js"],
  ["src/core/authoringGaps.js", "core/authoringGaps.js"],
  ["src/core/choiceOptions.js", "core/choiceOptions.js"],
  ["src/core/resourceGaps.js", "core/resourceGaps.js"],
  ["src/core/textGaps.js", "core/textGaps.js"],
  ["src/domain/aralearnProject.js", "domain/aralearnProject.js"],
  ["src/domain/cardExerciseSupport.js", "domain/cardExerciseSupport.js"],
  ["src/domain/cards.js", "domain/cards.js"],
  ["src/domain/resources.js", "domain/resources.js"],
  ["src/domain/formulaExpression.js", "domain/formulaExpression.js"],
  ["src/persistence/contractToRelationalRows.js", "persistence/contractToRelationalRows.js"],
  ["src/persistence/canonicalCourseHash.js", "persistence/canonicalCourseHash.js"],
  ["src/persistence/relationalSchema.js", "persistence/relationalSchema.js"],
  ["src/persistence/relationalRowsToContract.js", "persistence/relationalRowsToContract.js"],
  ["src/persistence/validateRelationalCourse.js", "persistence/validateRelationalCourse.js"],
  ["src/resources/registry/index.js", "resources/registry/index.js"],
  ["src/resources/registry/authoring.js", "resources/registry/authoring.js"],
  ["src/resources/registry/generation.js", "resources/registry/generation.js"]
];

const checkOnly = process.argv.includes("--check");
const divergent = [];

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

if (checkOnly && divergent.length) {
  throw new Error(
    `Espelho Edge divergente do registro canônico: ${divergent.join(", ")}.`
  );
}

if (!checkOnly) {
  console.log(`Runtime Edge sincronizado: ${files.length} arquivos.`);
}
