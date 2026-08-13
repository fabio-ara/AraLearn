import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repositoryRoot = process.cwd();
const packagesRoot = path.join(repositoryRoot, "src", "resources", "packages");
const outputPath = path.join(packagesRoot, "generated.js");

// A sequência é persistida porque IDs de fixtures e snapshots publicados foram
// derivados dela. Packages novos continuam sendo descobertos automaticamente e
// entram depois deste prefixo estável, em ordem de identidade.
const STABLE_PACKAGE_SEQUENCE = Object.freeze([
  "aralearn.resource.paragraph",
  "aralearn.resource.code",
  "aralearn.resource.table",
  "aralearn.resource.annotated_text",
  "aralearn.resource.bpmn_process",
  "aralearn.resource.interlinear_gloss",
  "aralearn.response.choice",
  "aralearn.response.gap",
  "aralearn.response.ordering",
  "aralearn.resource.tree",
  "aralearn.resource.matrix",
  "aralearn.resource.reaction",
  "aralearn.resource.flow",
  "aralearn.resource.formula",
  "aralearn.resource.plane",
  "aralearn.resource.chart",
  "aralearn.resource.software_system_context",
  "aralearn.resource.software_container",
  "aralearn.resource.system_internal_block",
  "aralearn.resource.graph",
  "aralearn.resource.relation_map",
  "aralearn.resource.database_schema",
  "aralearn.resource.memory_layout",
  "aralearn.resource.network_topology",
  "aralearn.resource.packet_layout",
  "aralearn.resource.set_diagram",
  "aralearn.resource.state_machine",
  "aralearn.resource.truth_table",
  "aralearn.response.matching",
  "aralearn.resource.entity_relationship",
  "aralearn.resource.state_transition_table",
  "aralearn.resource.call_stack"
]);
const stablePosition = new Map(STABLE_PACKAGE_SEQUENCE.map((id, index) => [id, index]));

function packageOrder(definition) {
  return stablePosition.get(definition.manifest.id) ?? STABLE_PACKAGE_SEQUENCE.length;
}

async function packageModules() {
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const modules = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    if (!entry.isDirectory()) continue;
    const modulePath = path.join(packagesRoot, entry.name, "index.js");
    const source = await readFile(modulePath, "utf8").catch(() => null);
    if (source == null) continue;
    const imported = await import(`${pathToFileURL(modulePath).href}?catalog-index=1`);
    const candidates = Object.entries(imported).filter(([, value]) => (
      value && typeof value === "object" && value.manifest && value.schema
      && typeof value.render === "function"
    ));
    if (candidates.length !== 1) {
      throw new Error(`${entry.name}/index.js precisa exportar exatamente uma definição de package.`);
    }
    const [exportName, definition] = candidates[0];
    modules.push({ directory: entry.name, exportName, definition });
  }
  modules.sort((left, right) => (
    packageOrder(left.definition) - packageOrder(right.definition)
    || Number(stablePosition.has(right.definition.manifest.id))
      - Number(stablePosition.has(left.definition.manifest.id))
    || left.definition.manifest.id.localeCompare(right.definition.manifest.id, "en")
  ));
  const identities = modules.map(({ definition }) => (
    `${definition.manifest.id}@${definition.manifest.version}`
  ));
  if (new Set(identities).size !== identities.length) {
    throw new Error("As pastas de packages contêm identidades duplicadas.");
  }
  return modules;
}

function generatedSource(modules) {
  const imports = modules.map(({ directory, exportName }) => (
    `import { ${exportName} } from "./${directory}/index.js";`
  ));
  const names = modules.map(({ exportName }) => `  ${exportName}`);
  return `${[
    "// Gerado por scripts/generateResourcePackageIndex.mjs. Não edite manualmente.",
    ...imports,
    "",
    "export const RESOURCE_PACKAGE_DEFINITIONS = Object.freeze([",
    `${names.join(",\n")}`,
    "]);",
    "",
    "export {",
    `${names.join(",\n")}`,
    "};",
    ""
  ].join("\n")}`;
}

const next = generatedSource(await packageModules());
const current = await readFile(outputPath, "utf8").catch(() => null);
if (process.argv.includes("--check")) {
  if (current !== next) throw new Error("src/resources/packages/generated.js está desatualizado.");
} else if (current !== next) {
  await writeFile(outputPath, next, "utf8");
  process.stdout.write("Índice de packages gerado.\n");
}
