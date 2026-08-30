import test from "node:test";
import assert from "node:assert/strict";

import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { resolveOpenAiTemporaryPdf } from
  "../../supabase/functions/_shared/aralearn-authoring/openAiTemporaryPdf.js";
import { COURSE_SOURCE_PDF_MAX_BYTES } from
  "../../supabase/functions/_shared/aralearn/runtime/domain/courseSources.js";

const DOWNLOAD_URL = "https://files.oaiusercontent.com/file.pdf?sig=temporary-secret";
const REGIONAL_DOWNLOAD_URL =
  "https://sdmntprbrazilsouth.oaiusercontent.com/files/file.pdf?sig=temporary-secret";
const FILE_ID = "file-aralearn-synthetic-pdf";

function descriptor(overrides = {}) {
  return {
    download_url: DOWNLOAD_URL,
    file_id: FILE_ID,
    mime_type: "application/pdf",
    file_name: "ementa-sintetica.pdf",
    ...overrides
  };
}

async function captureError(run) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail("A operação deveria falhar.");
}

test("resolve PDF oficial sem propagar credenciais do servidor", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  let receivedUrl;
  let receivedOptions;
  const bytes = await resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async (url, options) => {
      receivedUrl = url;
      receivedOptions = options;
      return new Response(expected, {
        headers: {
          "content-type": "application/pdf; charset=binary",
          "content-length": String(expected.byteLength)
        }
      });
    }
  });

  assert.deepEqual(bytes, expected);
  assert.equal(receivedUrl, DOWNLOAD_URL);
  assert.equal(receivedOptions.method, "GET");
  assert.equal(receivedOptions.redirect, "error");
  assert.equal(receivedOptions.credentials, "omit");
  const headers = new Headers(receivedOptions.headers);
  assert.equal(headers.has("authorization"), false);
  assert.equal(headers.has("cookie"), false);
});

test("rejeita descritor ausente, shape inválido e campos malformados sem pedir reanexo", async () => {
  for (const candidate of [
    undefined,
    "file-isolado",
    [descriptor()],
    {},
    { file_id: FILE_ID },
    { download_url: DOWNLOAD_URL },
    descriptor({ extra: "não permitido" }),
    descriptor({ file_id: "file-id\nforjado" }),
    descriptor({ file_name: "arquivo\nforjado.pdf" })
  ]) {
    const error = await captureError(() => resolveOpenAiTemporaryPdf({
      descriptor: candidate,
      deadlineAt: Date.now() + 1_000,
      fetchImpl: async () => assert.fail("não deveria buscar")
    }));
    assert.ok(error instanceof AuthoringApiError);
    assert.equal(error.code, "invalid_openai_file");
    assert.match(error.message, /não precisa ser reenviado/iu);
    assert.doesNotMatch(error.message, /^Anexe|Anexe o PDF novamente/iu);
  }
});

test("aceita o host regional entregue pelo ChatGPT Actions", async () => {
  const expected = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  let receivedUrl;
  const bytes = await resolveOpenAiTemporaryPdf({
    descriptor: descriptor({ download_url: REGIONAL_DOWNLOAD_URL }),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async (url) => {
      receivedUrl = url;
      return new Response(expected, {
        headers: { "content-type": "application/pdf" }
      });
    }
  });

  assert.deepEqual(bytes, expected);
  assert.equal(receivedUrl, REGIONAL_DOWNLOAD_URL);
});

test("rejeita MIME declarado que não seja PDF", async () => {
  const error = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor({ mime_type: "text/plain" }),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => assert.fail("não deveria buscar")
  }));

  assert.ok(error instanceof AuthoringApiError);
  assert.equal(error.status, 415);
  assert.equal(error.code, "unsupported_pdf_media_type");
});

test("rejeita URL não HTTPS, host aproximado, credenciais, fragmento e porta não padrão", async () => {
  const invalidUrls = [
    ["http://files.oaiusercontent.com/file.pdf", "https"],
    ["https://files.oaiusercontent.com.example.test/file.pdf", "trusted_openai_file_origin"],
    ["https://oaiusercontent.com/file.pdf", "trusted_openai_file_origin"],
    ["https://sdmntprbrazilsouth.oaiusercontent.com.example.test/file.pdf",
      "trusted_openai_file_origin"],
    ["https://user:password@files.oaiusercontent.com/file.pdf", "no_url_credentials"],
    ["https://files.oaiusercontent.com/file.pdf#fragment", "no_url_fragment"],
    ["https://files.oaiusercontent.com:8443/file.pdf", "standard_https_port"]
  ];

  for (const [downloadUrl, rule] of invalidUrls) {
    const error = await captureError(() => resolveOpenAiTemporaryPdf({
      descriptor: descriptor({ download_url: downloadUrl }),
      deadlineAt: Date.now() + 1_000,
      fetchImpl: async () => assert.fail("não deveria buscar")
    }));
    assert.equal(error.code, "invalid_openai_file", downloadUrl);
    assert.deepEqual(error.details, { path: "pdf.download_url", rule }, downloadUrl);
  }
});

test("bloqueia redirecionamento mesmo quando o fetch simulado o devolve", async () => {
  let redirectMode;
  const error = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async (_url, options) => {
      redirectMode = options.redirect;
      return new Response(null, { status: 302, headers: { location: "https://example.test" } });
    }
  }));

  assert.equal(redirectMode, "error");
  assert.equal(error.code, "openai_file_unavailable");
});

test("distingue acesso temporário expirado de falha remota", async () => {
  for (const status of [401, 403, 404, 410]) {
    const expired = await captureError(() => resolveOpenAiTemporaryPdf({
      descriptor: descriptor(),
      deadlineAt: Date.now() + 1_000,
      fetchImpl: async () => new Response(null, { status })
    }));
    assert.equal(expired.code, "openai_file_expired", String(status));
    assert.match(expired.message, /Anexe o arquivo novamente/u);
  }
  const failed = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => new Response(null, { status: 503 })
  }));

  assert.equal(failed.code, "openai_file_unavailable");
  assert.match(failed.message, /Repita a mesma tentativa/u);
  assert.match(failed.message, /só anexe o arquivo novamente se/iu);
});

test("rejeita MIME explícito incompatível e aceita octet-stream", async () => {
  const incompatible = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => new Response("não é PDF", {
      headers: { "content-type": "text/plain" }
    })
  }));
  assert.equal(incompatible.code, "unsupported_pdf_media_type");

  const expected = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const bytes = await resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => new Response(expected, {
      headers: { "content-type": "application/octet-stream" }
    })
  });
  assert.deepEqual(bytes, expected);
});

test("rejeita Content-Length acima de 20 MiB antes de ler o corpo", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      cancelled = true;
    }
  });
  const error = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => new Response(body, {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(COURSE_SOURCE_PDF_MAX_BYTES + 1)
      }
    })
  }));

  assert.equal(error.code, "pdf_too_large");
  assert.equal(cancelled, true);
});

test("interrompe stream assim que ultrapassa 20 MiB", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(COURSE_SOURCE_PDF_MAX_BYTES));
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    }
  });
  const error = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => new Response(body, {
      headers: { "content-type": "application/pdf" }
    })
  }));

  assert.equal(error.status, 413);
  assert.equal(error.code, "pdf_too_large");
});

test("aborta fetch que excede deadline", async () => {
  let signal;
  const error = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor(),
    deadlineAt: Date.now() + 20,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return await new Promise(() => {});
    }
  }));

  assert.equal(error.status, 408);
  assert.equal(error.code, "openai_file_timeout");
  assert.match(error.message, /Repita a mesma tentativa/u);
  assert.doesNotMatch(error.message, /Anexe o arquivo novamente/u);
  assert.equal(signal.aborted, true);
});

test("não vaza URL, assinatura nem file_id quando o transporte falha", async () => {
  const secretUrl = "https://files.oaiusercontent.com/private.pdf?sig=segredo-absoluto";
  const secretFileId = "file-id-segredo-absoluto";
  const error = await captureError(() => resolveOpenAiTemporaryPdf({
    descriptor: descriptor({ download_url: secretUrl, file_id: secretFileId }),
    deadlineAt: Date.now() + 1_000,
    fetchImpl: async () => {
      throw new Error(`falha em ${secretUrl} para ${secretFileId}`);
    }
  }));
  const serialized = JSON.stringify({
    status: error.status,
    code: error.code,
    message: error.message,
    details: error.details
  });

  assert.ok(error instanceof AuthoringApiError);
  assert.equal(error.code, "openai_file_unavailable");
  assert.equal(serialized.includes(secretUrl), false);
  assert.equal(serialized.includes("segredo-absoluto"), false);
  assert.equal(serialized.includes(secretFileId), false);
});
