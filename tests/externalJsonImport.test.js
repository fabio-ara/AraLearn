import test from "node:test";
import assert from "node:assert/strict";

import { handleExternalJsonImportText } from "../src/ui/externalJsonImport.js";

test("handleExternalJsonImportText prepara projeto AraLearn válido para revisão", () => {
  const result = handleExternalJsonImportText(
    JSON.stringify({
      contract: "aralearn.contract",
      version: 1,
      kind: "project",
      courses: []
    }),
    { sourceName: "arquivo.json" }
  );

  assert.equal(result.detectedFormat, "contract");
  assert.equal(result.sourceName, "arquivo.json");
  assert.equal(result.formatLabel, "Projeto AraLearn");
});

test("handleExternalJsonImportText rejeita JSON inválido com erro controlado", () => {
  assert.throws(
    () => handleExternalJsonImportText("{invalido", { sourceName: "texto" }),
    /JSON inválido\./
  );
});

test("handleExternalJsonImportText rejeita formato não reconhecido com erro claro", () => {
  assert.throws(
    () => handleExternalJsonImportText(JSON.stringify({ foo: "bar" })),
    /não parece ser um arquivo AraLearn válido/i
  );
});

test("handleExternalJsonImportText não depende de bridge Android no navegador comum", () => {
  const originalBridge = globalThis.AndroidHost;

  try {
    delete globalThis.AndroidHost;
    const result = handleExternalJsonImportText(
      JSON.stringify({
        format: "aralearn.storage",
        project: {
          contract: "aralearn.contract",
          version: 1,
          kind: "project",
          courses: []
        },
        progress: {}
      })
    );
    assert.equal(result.detectedFormat, "storage");
  } finally {
    if (originalBridge !== undefined) {
      globalThis.AndroidHost = originalBridge;
    }
  }
});
