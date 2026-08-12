import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOTS = [
  "supabase/fixtures/catalog",
  "tests/fixtures/course-catalog"
];

function comparable(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
}

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(target);
    return entry.isFile() && entry.name.endsWith(".json") ? [target] : [];
  }));
  return nested.flat();
}

function removeDuplicates(value, report, trail = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => removeDuplicates(item, report, `${trail}[${index}]`));
    return;
  }
  if (
    value.response?.package === "aralearn.response.choice" &&
    Array.isArray(value.content)
  ) {
    const question = comparable(value.response?.data?.question);
    const retained = value.content.filter((instance) => !(
      question &&
      instance?.package === "aralearn.resource.paragraph" &&
      comparable(instance?.data?.text) === question
    ));
    const removed = value.content.length - retained.length;
    if (removed > 0) {
      report.push({ card: value.id || trail, count: removed });
      value.content = retained;
    }
  }
  Object.entries(value).forEach(([key, item]) => removeDuplicates(item, report, `${trail}.${key}`));
}

const write = process.argv.includes("--write");
let duplicateCount = 0;
for (const root of ROOTS) {
  for (const file of await jsonFiles(root)) {
    const source = await readFile(file, "utf8");
    const document = JSON.parse(source);
    const report = [];
    removeDuplicates(document, report);
    const fileCount = report.reduce((total, item) => total + item.count, 0);
    duplicateCount += fileCount;
    if (!fileCount) continue;
    console.log(`${file}: ${fileCount} enunciado(s) duplicado(s)`);
    if (write) await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
}

if (duplicateCount > 0 && !write) {
  console.error(`Foram encontrados ${duplicateCount} enunciados de choice duplicados em paragraph.`);
  process.exitCode = 1;
} else {
  console.log(write
    ? `${duplicateCount} duplicações removidas.`
    : "Nenhuma duplicação de enunciado de choice encontrada.");
}
