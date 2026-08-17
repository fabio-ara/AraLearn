import test from "node:test";
import assert from "node:assert/strict";

import {
  PEDAGOGICAL_COMMENT_CATEGORIES,
  PEDAGOGICAL_COMMENT_MAX_CHARACTERS,
  normalizePedagogicalCommentDraft
} from "../../src/domain/pedagogicalComment.js";
import { renderStudyUnitCommentOverlay } from "../../src/ui/renderStudyUnitCommentOverlay.js";

test("categorias de observação são pequenas, estáveis e distintas", () => {
  assert.deepEqual(
    PEDAGOGICAL_COMMENT_CATEGORIES.map((item) => item.value),
    ["question", "possible_error", "confusing", "suggestion", "observation"]
  );
  assert.equal(new Set(PEDAGOGICAL_COMMENT_CATEGORIES.map((item) => item.label)).size, 5);
});

test("observação exige categoria fechada, texto curto e não vazio", () => {
  assert.deepEqual(
    normalizePedagogicalCommentDraft({
      category: "question",
      body: "  Onde esta regra é usada?  "
    }),
    { category: "question", body: "Onde esta regra é usada?" }
  );
  assert.throws(
    () => normalizePedagogicalCommentDraft({ category: "other", body: "Texto" }),
    /tipo válido/u
  );
  assert.throws(
    () => normalizePedagogicalCommentDraft({ category: "question", body: " " }),
    /Escreva/u
  );
  assert.throws(
    () => normalizePedagogicalCommentDraft({
      category: "question",
      body: "x".repeat(PEDAGOGICAL_COMMENT_MAX_CHARACTERS + 1)
    }),
    /até 1000/u
  );
});

test("overlay não expõe IDs e só oferece retirada quando existe observação", () => {
  const fresh = renderStudyUnitCommentOverlay({
    draft: { category: "suggestion", body: "Inclua outro exemplo." }
  });
  assert.match(fresh, /Tipo de observação/u);
  assert.match(fresh, /value="suggestion" checked/u);
  assert.match(fresh, /maxlength="1000"/u);
  assert.doesNotMatch(fresh, /comment-delete/u);
  assert.doesNotMatch(fresh, /studyUnitId|courseId|workspaceId/u);

  const existing = renderStudyUnitCommentOverlay({
    draft: {
      category: "observation",
      body: "Rever depois.",
      status: "considered",
      response: "A equipe está revisando o exemplo.",
      resolutionNote: "Aguardando nova publicação."
    },
    exists: true
  });
  assert.match(existing, /data-action="comment-delete"/u);
  assert.match(existing, /Considerada/u);
  assert.match(existing, /A equipe está revisando o exemplo\./u);
  assert.match(existing, /Aguardando nova publicação\./u);
});
