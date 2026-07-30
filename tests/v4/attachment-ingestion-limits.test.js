import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTACHMENT_INGESTION_LIMITS,
  ingestAttachments
} from "../../src/generation/ingestion/attachmentIngestion.js";

function namedBlob(parts, {
  name,
  type
}) {
  const blob = new Blob(parts, { type });
  Object.defineProperty(blob, "name", {
    configurable: true,
    value: name
  });
  return blob;
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  entries.forEach(({ name, content = "" }) => {
    const nameBytes = Buffer.from(name, "utf8");
    const contentBytes = Buffer.from(content, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(contentBytes.length, 18);
    localHeader.writeUInt32LE(contentBytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(contentBytes.length, 20);
    centralHeader.writeUInt32LE(contentBytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildSuspiciousDocxEntry({
  name = "[Content_Types].xml",
  compressedBytes = 1,
  uncompressedBytes = 10_000
} = {}) {
  const nameBytes = Buffer.from(name, "utf8");
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(compressedBytes, 18);
  localHeader.writeUInt32LE(uncompressedBytes, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);
  const compressedContent = Buffer.alloc(compressedBytes);
  const centralOffset = localHeader.length + nameBytes.length + compressedContent.length;

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt32LE(compressedBytes, 20);
  centralHeader.writeUInt32LE(uncompressedBytes, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);
  centralHeader.writeUInt32LE(0, 42);
  const centralDirectory = Buffer.concat([centralHeader, nameBytes]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([
    localHeader,
    nameBytes,
    compressedContent,
    centralDirectory,
    end
  ]);
}

test("PDF acima do limite é recusado antes de qualquer leitura ou parser", async () => {
  let reads = 0;
  let parserLoads = 0;
  const file = {
    name: "apostila.pdf",
    type: "application/pdf",
    size: ATTACHMENT_INGESTION_LIMITS.maxPdfBytes + 1,
    async arrayBuffer() {
      reads += 1;
      return new ArrayBuffer(0);
    }
  };

  const result = await ingestAttachments([file], {
    loadPdfjsModule: async () => {
      parserLoads += 1;
      return {};
    }
  });

  assert.equal(reads, 0);
  assert.equal(parserLoads, 0);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /excede o limite de 12 MB.*não foi lido/iu);
});

test("orçamento total impede a leitura do arquivo que o ultrapassaria", async () => {
  let firstReads = 0;
  let secondReads = 0;
  const first = {
    name: "primeiro.txt",
    type: "text/plain",
    size: 3,
    async arrayBuffer() {
      firstReads += 1;
      return Uint8Array.from([97, 98, 99]).buffer;
    }
  };
  const second = {
    name: "segundo.txt",
    type: "text/plain",
    size: 3,
    async arrayBuffer() {
      secondReads += 1;
      return Uint8Array.from([100, 101, 102]).buffer;
    }
  };

  const result = await ingestAttachments([first, second], {
    limits: {
      maxTotalBytes: 5,
      maxTextBytes: 4
    }
  });

  assert.equal(firstReads, 1);
  assert.equal(secondReads, 0);
  assert.equal(result.attachments[0].ingestionStatus, "supported");
  assert.equal(result.attachments[1].ingestionStatus, "failed");
  assert.match(result.warnings[0], /limite total de 5 bytes.*não foi lido/iu);
});

test("arquivo sem tamanho declarado falha fechado sem chamar leitura integral", async () => {
  let reads = 0;
  const result = await ingestAttachments([{
    name: "indefinido.txt",
    type: "text/plain",
    async arrayBuffer() {
      reads += 1;
      return new ArrayBuffer(0);
    }
  }]);

  assert.equal(reads, 0);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /não informa seu tamanho.*rejeitado antes da leitura/iu);
});

test("leitor que entrega mais bytes que File.size é rejeitado", async () => {
  const result = await ingestAttachments([{
    name: "inconsistente.txt",
    type: "text/plain",
    size: 1,
    async arrayBuffer() {
      return Uint8Array.from([97, 98, 99]).buffer;
    }
  }]);

  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /não corresponde ao tamanho declarado/iu);
});

test("texto usa somente prefixo limitado e sinaliza ingestão parcial", async () => {
  const file = namedBlob(["0123456789".repeat(20)], {
    name: "material.txt",
    type: "text/plain"
  });
  Object.defineProperty(file, "text", {
    value() {
      throw new Error("text() integral não deveria ser chamado");
    }
  });

  const result = await ingestAttachments([file], {
    limits: {
      maxTextBytes: 256,
      maxTextPrefixBytes: 32,
      maxExtractedCharacters: 20
    }
  });

  assert.equal(result.attachments[0].textContent, "01234567890123456789");
  assert.equal(result.attachments[0].ingestionStatus, "partial");
  assert.match(result.warnings[0], /somente o início.*20 caracteres/iu);
});

test("PDF com páginas demais é recusado antes de extrair qualquer página", async () => {
  let pageReads = 0;
  let destroyed = false;
  const file = namedBlob(["%PDF-1.7"], {
    name: "livro.pdf",
    type: "application/pdf"
  });

  const result = await ingestAttachments([file], {
    limits: {
      maxPdfPages: 2
    },
    loadPdfjsModule: async () => ({
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 3,
          async getPage() {
            pageReads += 1;
            return {};
          },
          async destroy() {
            destroyed = true;
          }
        })
      })
    })
  });

  assert.equal(pageReads, 0);
  assert.equal(destroyed, true);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /tem 3 páginas.*limite.*2/iu);
});

test("extração de PDF interrompe coleta ao atingir o teto textual", async () => {
  let pageCleanup = false;
  const file = namedBlob(["%PDF-1.7"], {
    name: "denso.pdf",
    type: "application/pdf"
  });

  const result = await ingestAttachments([file], {
    limits: {
      maxExtractedCharacters: 10
    },
    loadPdfjsModule: async () => ({
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          async getPage() {
            return {
              async getTextContent() {
                return {
                  items: [{
                    str: "x".repeat(100),
                    hasEOL: true
                  }]
                };
              },
              cleanup() {
                pageCleanup = true;
              }
            };
          },
          async destroy() {}
        })
      })
    })
  });

  assert.equal(pageCleanup, true);
  assert.equal(result.attachments[0].textContent, "x".repeat(10));
  assert.equal(result.attachments[0].ingestionStatus, "partial");
  assert.match(result.warnings[0], /limitado a 10 caracteres/iu);
});

test("deadline cancela o stream que não responde", async () => {
  let cancelled = false;
  const file = {
    name: "travado.txt",
    type: "text/plain",
    size: 1,
    stream() {
      return {
        getReader() {
          return {
            read: () => new Promise(() => {}),
            cancel: async () => {
              cancelled = true;
            },
            releaseLock() {}
          };
        }
      };
    }
  };

  const result = await ingestAttachments([file], {
    limits: {
      perFileTimeoutMs: 10,
      totalTimeoutMs: 50
    }
  });

  assert.equal(cancelled, true);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /excedeu o limite de tempo.*interrompida/iu);
});

test("AbortSignal já cancelado impede a abertura do arquivo", async () => {
  let streamCalls = 0;
  const controller = new AbortController();
  controller.abort();
  const result = await ingestAttachments([{
    name: "cancelado.txt",
    type: "text/plain",
    size: 1,
    stream() {
      streamCalls += 1;
      return new Blob(["x"]).stream();
    }
  }], {
    signal: controller.signal
  });

  assert.equal(streamCalls, 0);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /foi cancelada/iu);
});

test("DOCX com metadado de zip bomb falha antes de carregar Mammoth", async () => {
  let mammothLoads = 0;
  const file = namedBlob([buildSuspiciousDocxEntry()], {
    name: "bomba.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });

  const result = await ingestAttachments([file], {
    limits: {
      maxDocxEntryUncompressedBytes: 100,
      maxDocxUncompressedBytes: 200
    },
    loadMammothLib: async () => {
      mammothLoads += 1;
      return {};
    }
  });

  assert.equal(mammothLoads, 0);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /item descompactado acima de 100 bytes.*rejeitado/iu);
});

test("DOCX com razão de descompactação suspeita também falha antes do Mammoth", async () => {
  let mammothLoads = 0;
  const file = namedBlob([buildSuspiciousDocxEntry({
    compressedBytes: 1,
    uncompressedBytes: 100
  })], {
    name: "razao.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });

  const result = await ingestAttachments([file], {
    limits: {
      maxDocxCompressionRatio: 10,
      maxDocxEntryUncompressedBytes: 1_000,
      maxDocxUncompressedBytes: 2_000
    },
    loadMammothLib: async () => {
      mammothLoads += 1;
      return {};
    }
  });

  assert.equal(mammothLoads, 0);
  assert.equal(result.attachments[0].ingestionStatus, "failed");
  assert.match(result.warnings[0], /taxa de descompactação.*10:1/iu);
});

test("DOCX estruturalmente válido continua sendo extraído dentro dos limites", async () => {
  const archive = buildStoredZip([
    { name: "[Content_Types].xml", content: "<Types />" },
    { name: "word/document.xml", content: "<document />" }
  ]);
  const file = namedBlob([archive], {
    name: "aula.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  let receivedArrayBuffer = false;

  const result = await ingestAttachments([file], {
    loadMammothLib: async () => ({
      extractRawText: async ({ arrayBuffer }) => {
        receivedArrayBuffer = arrayBuffer instanceof ArrayBuffer;
        return {
          value: "Objetivo\n\nCompreender o conteúdo.",
          messages: []
        };
      }
    })
  });

  assert.equal(receivedArrayBuffer, true);
  assert.equal(result.attachments[0].ingestionStatus, "supported");
  assert.equal(result.attachments[0].textContent, "Objetivo\n\nCompreender o conteúdo.");
  assert.equal(result.extractedCount, 1);
});
