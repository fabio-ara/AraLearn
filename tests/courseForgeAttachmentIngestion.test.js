import test from "node:test";
import assert from "node:assert/strict";

import { ingestCourseForgeAttachments } from "../src/ui/courseForgeAttachmentIngestion.js";

function makeFile({ name, type, content }) {
  return {
    name,
    type,
    async text() {
      return content;
    }
  };
}

test("ingestCourseForgeAttachments preserva texto simples", async () => {
  const result = await ingestCourseForgeAttachments([
    makeFile({
      name: "ementa.md",
      type: "text/markdown",
      content: "# Lógica\n\n- Proposições\n- Conectivos"
    })
  ]);

  assert.equal(result.extractedCount, 1);
  assert.equal(result.attachments[0].name, "ementa.md");
  assert.match(result.attachments[0].textContent, /Proposições/);
  assert.deepEqual(result.warnings, []);
});

test("ingestCourseForgeAttachments extrai texto de html simples", async () => {
  const result = await ingestCourseForgeAttachments([
    makeFile({
      name: "pagina.html",
      type: "text/html",
      content: "<html><body><h1>Redes</h1><p>LAN conecta um mesmo ambiente.</p></body></html>"
    })
  ]);

  assert.equal(result.extractedCount, 1);
  assert.match(result.attachments[0].textContent, /Redes/);
  assert.match(result.attachments[0].textContent, /LAN conecta um mesmo ambiente/);
});

test("ingestCourseForgeAttachments sinaliza formato ainda nao suportado", async () => {
  const result = await ingestCourseForgeAttachments([
    {
      name: "apostila.pdf",
      type: "application/pdf",
      async text() {
        return "";
      }
    }
  ]);

  assert.equal(result.extractedCount, 0);
  assert.equal(result.attachments[0].textContent, "");
  assert.match(result.warnings[0], /ingestão textual ainda não suportada/i);
});
