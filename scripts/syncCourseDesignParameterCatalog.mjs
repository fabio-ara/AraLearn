import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE_DESIGN_PARAMETER_CATALOG_VERSION, COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../src/domain/courseDesignParameters.js";

const BEGIN = "-- COURSE_DESIGN_CATALOG_BEGIN";
const END = "-- COURSE_DESIGN_CATALOG_END";
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";

export function renderCourseDesignParameterCatalogSql() {
  const rows = COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition, index) => `(${[
    quote(definition.id), index + 1, quote(COURSE_DESIGN_PARAMETER_CATALOG_VERSION),
    quote(definition.valueSchema.type), `array[${definition.supportedScopes.map(quote).join(",")}]::text[]`,
    `${quote(JSON.stringify(definition))}::jsonb`, `${quote(JSON.stringify(definition.defaultValue))}::jsonb`
  ].join(",")})`);
  return `${BEGIN}\n-- Gerado por scripts/syncCourseDesignParameterCatalog.mjs; fonte: src/domain/courseDesignParameters.js.\n` +
    "insert into private.course_design_parameter_definitions(parameter_id,ordinal,catalog_version,value_kind,supported_scopes,definition,default_value) values\n" +
    rows.join(",\n") + "\non conflict(parameter_id) do update set ordinal=excluded.ordinal,catalog_version=excluded.catalog_version,value_kind=excluded.value_kind,supported_scopes=excluded.supported_scopes,definition=excluded.definition,default_value=excluded.default_value;\n" + END;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const directory = path.join(root, "supabase", "migrations");
  const entry = fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort().reverse()
    .map((name) => path.join(directory, name)).find((filename) => fs.readFileSync(filename, "utf8").includes(BEGIN));
  if (!entry) throw new Error("A migration do catálogo não foi encontrada.");
  const source = fs.readFileSync(entry, "utf8").replaceAll("\r\n", "\n");
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END, start);
  if (end < 0) throw new Error("O bloco gerado do catálogo está incompleto.");
  const expected = source.slice(0, start) + renderCourseDesignParameterCatalogSql() + source.slice(end + END.length);
  if (process.argv.includes("--write")) fs.writeFileSync(entry, expected);
  else if (expected !== source) throw new Error("O SQL do catálogo diverge da fonte canônica. Execute --write antes de aplicar a migration.");
  process.stdout.write("Catálogo de parâmetros SQL conferido.\n");
}
