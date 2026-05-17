import test from "node:test";
import assert from "node:assert/strict";

import { ingestCourseForgeAttachments } from "../src/ui/courseForgeAttachmentIngestion.js";

function encodeText(value) {
  return new TextEncoder().encode(value).buffer;
}

function makeFile({ name, type, content = "", binaryContent = null }) {
  return {
    name,
    type,
    async text() {
      return content;
    },
    async arrayBuffer() {
      return binaryContent || encodeText(content);
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

test("ingestCourseForgeAttachments usa parser de pdf quando disponivel", async () => {
  const result = await ingestCourseForgeAttachments([
    makeFile({
      name: "apostila.pdf",
      type: "application/pdf",
      binaryContent: encodeText("pdf-bytes")
    })
  ], {
    async loadPdfjsModule() {
      return {
        GlobalWorkerOptions: {},
        getDocument() {
          return {
            promise: Promise.resolve({
              numPages: 1,
              async getPage() {
                return {
                  async getTextContent() {
                    return {
                      items: [
                        { str: "Rede", hasEOL: false },
                        { str: "local", hasEOL: true },
                        { str: "conecta dispositivos.", hasEOL: false }
                      ]
                    };
                  }
                };
              }
            })
          };
        }
      };
    }
  });

  assert.equal(result.extractedCount, 1);
  assert.match(result.attachments[0].textContent, /Rede local/);
  assert.equal(result.attachments[0].ingestionStatus, "supported");
});

test("ingestCourseForgeAttachments usa parser de docx e preserva warnings", async () => {
  const result = await ingestCourseForgeAttachments([
    makeFile({
      name: "roteiro.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      binaryContent: encodeText("docx-bytes")
    })
  ], {
    async loadMammothLib() {
      return {
        async extractRawText() {
          return {
            value: "Objetivo da lição\n\nComparar LAN e internet.",
            messages: [{ message: "tabela simplificada durante a extração" }]
          };
        }
      };
    }
  });

  assert.equal(result.extractedCount, 1);
  assert.match(result.attachments[0].textContent, /Comparar LAN e internet/);
  assert.equal(result.attachments[0].ingestionStatus, "supported");
  assert.match(result.warnings[0], /tabela simplificada/i);
});

test("ingestCourseForgeAttachments sinaliza formato ainda nao suportado", async () => {
  const result = await ingestCourseForgeAttachments([
    makeFile({
      name: "quadro.png",
      type: "image/png",
      binaryContent: encodeText("png")
    })
  ]);

  assert.equal(result.extractedCount, 0);
  assert.equal(result.attachments[0].textContent, "");
  assert.equal(result.attachments[0].ingestionStatus, "unsupported");
  assert.match(result.warnings[0], /ingestão textual ainda não suportada/i);
});
