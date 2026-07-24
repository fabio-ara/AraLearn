import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PART_CARD_SCHEMA
} from "../supabase/functions/_shared/aralearn-authoring/mcpTools.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const OUTPUT_PATH = path.join(
  REPOSITORY_ROOT,
  "authoring",
  "schemas",
  "card.schema.json"
);

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    );
  }
  return value;
}

export function standaloneAuthoringCardSchema(source = PART_CARD_SCHEMA) {
  const definitions = {};
  let namespaceSequence = 0;

  function transform(value, inheritedDefinitions = null) {
    if (Array.isArray(value)) {
      return value.map((item) => transform(item, inheritedDefinitions));
    }
    if (!value || typeof value !== "object") return value;

    let localDefinitions = inheritedDefinitions;
    if (value.$defs && typeof value.$defs === "object" && !Array.isArray(value.$defs)) {
      const namespace = `schema${namespaceSequence += 1}`;
      localDefinitions = Object.fromEntries(
        Object.keys(value.$defs).map((name) => [name, `${namespace}_${name}`])
      );
      Object.entries(value.$defs).forEach(([name, definition]) => {
        definitions[localDefinitions[name]] = transform(definition, localDefinitions);
      });
    }

    if (
      typeof value.$ref === "string"
      && value.$ref.startsWith("#/$defs/")
      && localDefinitions
    ) {
      const name = value.$ref.slice("#/$defs/".length);
      const resolved = localDefinitions[name];
      if (!resolved) {
        throw new Error(`Referência local desconhecida no schema de card: ${name}.`);
      }
      return {
        ...Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== "$ref" && key !== "$defs" && key !== "$id")
            .map(([key, item]) => [key, transform(item, localDefinitions)])
        ),
        $ref: `#/$defs/${resolved}`
      };
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "$defs" && key !== "$id")
        .map(([key, item]) => [key, transform(item, localDefinitions)])
    );
  }

  const schema = transform(clone(source));
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://fabio-ara.github.io/AraLearn/authoring/schemas/card.schema.json",
    title: "Card formal de autoria do AraLearn",
    ...schema,
    ...(Object.keys(definitions).length ? { $defs: definitions } : {})
  };
}

export async function generateAuthoringCardSchema() {
  const schema = standaloneAuthoringCardSchema();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  return schema;
}

if (pathToFileURL(process.argv[1] || "").href === import.meta.url) {
  await generateAuthoringCardSchema();
}
