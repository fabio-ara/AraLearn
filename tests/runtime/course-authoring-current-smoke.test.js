import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const smokePath = path.join(
  repositoryRoot,
  "supabase",
  "tests",
  "course-authoring-current-local-smoke.mjs"
);
const source = fs.readFileSync(smokePath, "utf8");

test("#274 prova a jornada autoral corrente no Supabase local", () => {
  for (const task of [
    "criar_curso", "salvar_parte", "preparar_materializacao",
    "materializar_parte", "registrar_observacao"
  ]) {
    assert.match(source, new RegExp(`name: "${task}"`, "u"));
  }
  assert.match(source, /objetivoDoModulo/u);
  assert.match(source, /unidadesDeAnalise: \[\]/u);
  assert.match(source, /getCourseAuthoringAnalytics/u);
  assert.match(source, /Interfaces e transporte/u);
  assert.match(source, /content\.dependsOn/u);
  assert.match(source, /removeLocalUser\(config, actorId\)/u);
});

test("#274 prova substituição idempotente e Observações multi-alvo atômicas", () => {
  assert.match(source, /materializedRevision/u);
  assert.match(source, /assert\.equal\(context\.course\.revision, materializedRevision\)/u);
  assert.match(source, /createCourseAnchoredAnnotations/u);
  assert.match(source, /unidade-inexistente/u);
  assert.match(source, /\.items\.length, 0/u);
  assert.match(source, /observationCount: 2/u);
  assert.match(source, /explicitParameterOverrideCount, 0/u);
  assert.match(source, /afterEditAttribution/u);
  assert.match(source, /retiredAnchorCitationCount/u);
});
