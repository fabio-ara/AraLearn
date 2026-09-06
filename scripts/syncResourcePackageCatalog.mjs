import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE_COMPONENT_CATALOG } from "../src/domain/courseDesignParameters.js";

const BEGIN = "-- RESOURCE_PACKAGE_CATALOG_BEGIN";
const END = "-- RESOURCE_PACKAGE_CATALOG_END";
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";

export function renderResourcePackageCatalogSql(catalog = COURSE_COMPONENT_CATALOG) {
  return `${BEGIN}\n-- Gerado por scripts/syncResourcePackageCatalog.mjs; fonte: registro de packages.\n` +
    "create or replace function private.course_component_catalog_v1()\n" +
    "returns jsonb language sql immutable security definer set search_path=pg_catalog\n" +
    `as $catalog$ select ${quote(JSON.stringify(catalog))}::jsonb $catalog$;\n${END}`;
}

export function checkResourcePackageCatalog(root) {
  const directory = path.join(root, "supabase", "migrations");
  const entry = fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort().reverse()
    .map((name) => path.join(directory, name)).find((filename) => fs.readFileSync(filename, "utf8").includes(BEGIN));
  if (!entry) throw new Error("A migration gerada do catálogo não foi encontrada.");
  const source = fs.readFileSync(entry, "utf8").replaceAll("\r\n", "\n");
  if (!source.includes(renderResourcePackageCatalogSql())) {
    throw new Error("O catálogo SQL diverge do registro. Gere o bloco para uma nova migration antes de aplicá-la.");
  }
  return entry;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--print")) process.stdout.write(renderResourcePackageCatalogSql() + "\n");
  else {
    checkResourcePackageCatalog(fileURLToPath(new URL("..", import.meta.url)));
    process.stdout.write("Catálogo de componentes SQL conferido.\n");
  }
}
