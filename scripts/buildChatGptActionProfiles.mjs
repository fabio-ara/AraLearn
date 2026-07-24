import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const OPENAPI_ROOT = path.join(ROOT, "docs", "openapi");
const EDITORIAL_PATH = path.join(
  OPENAPI_ROOT,
  "aralearn-authoring-api-chatgpt-editorial.yaml"
);
const PRIVATE_PATH = path.join(
  OPENAPI_ROOT,
  "aralearn-authoring-api-chatgpt-private.yaml"
);
const PUBLISH_PATH = "/functions/v1/aralearn-authoring-api/v1/runs/{runId}/publish";

export function buildPrivateActionDocument(editorialDocument) {
  const document = structuredClone(editorialDocument);
  document.info.title = "AraLearn Authoring API: perfil pessoal";
  document.info.description =
    "Cria, produz, revisa, valida e materializa cursos pessoais AraLearn por partes.";

  const createRun = document.paths[
    "/functions/v1/aralearn-authoring-api/v1/runs"
  ].post.requestBody.content["application/json"].schema;
  createRun.properties.target.enum = ["private"];
  delete createRun.properties.collectionId;
  createRun.properties.publicationIntent.properties.mode.enum = ["create"];
  createRun.properties.publicationIntent.properties.mode.description =
    "Cursos pessoais sempre começam como uma criação independente.";
  delete createRun.properties.publicationIntent.properties.existingCourseId;
  delete createRun.properties.publicationIntent.properties.expectedContentHash;

  const completion = document.paths[PUBLISH_PATH].post;
  completion.operationId = "concluirCursoPessoal";
  completion.summary = "Materializa o curso validado na conta do autor";
  completion.responses["200"].description = "Curso pessoal materializado.";
  completion.responses["202"].description =
    "Materialização em andamento. Consulte a execução com o mesmo requestId.";
  completion.responses.default.description = "Falha ao materializar o curso pessoal.";

  return document;
}

export function serializeActionDocument(document) {
  return stringify(document, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0,
    simpleKeys: true
  });
}

async function main() {
  const editorial = parse(await readFile(EDITORIAL_PATH, "utf8"));
  const personal = buildPrivateActionDocument(editorial);
  await writeFile(PRIVATE_PATH, serializeActionDocument(personal), "utf8");
  console.log(
    "Perfis da Action do ChatGPT gerados: pessoal e editorial."
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
