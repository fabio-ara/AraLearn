import { COURSE_SOURCE_PDF_MAX_BYTES } from
  "../aralearn/runtime/domain/courseSources.js";
import { AuthoringApiError } from "./errors.js";
import { resolveOpenAiTemporaryFile } from "./openAiTemporaryFile.js";
export { isTrustedOpenAiFileHost } from "./openAiTemporaryFile.js";

function invalidDescriptor(path = "pdf", rule = "valid_openai_file_reference") {
  return new AuthoringApiError(
    422,
    "invalid_openai_file",
    "A referência temporária do PDF não está em um formato utilizável. O documento já anexado não precisa ser reenviado; refaça a chamada a partir desse anexo.",
    { path, rule }
  );
}

function unsupportedMediaType() {
  return new AuthoringApiError(
    415,
    "unsupported_pdf_media_type",
    "O anexo recebido não é um PDF. Envie um arquivo PDF."
  );
}

function expiredFile() {
  return new AuthoringApiError(
    410,
    "openai_file_expired",
    "O acesso temporário ao PDF expirou. Anexe o arquivo novamente."
  );
}

function unavailableFile() {
  return new AuthoringApiError(
    502,
    "openai_file_unavailable",
    "Não foi possível baixar o PDF agora. Repita a mesma tentativa; só anexe o arquivo novamente se o acesso temporário tiver expirado."
  );
}

function timedOutFile() {
  return new AuthoringApiError(
    408,
    "openai_file_timeout",
    "O recebimento do PDF não terminou a tempo. Repita a mesma tentativa."
  );
}

function oversizedFile() {
  return new AuthoringApiError(
    413,
    "pdf_too_large",
    "Use um PDF de até 20 MiB."
  );
}

const PDF_POLICY = {
  field: "pdf", mediaTypes: new Set(["application/pdf"]), maxBytes: COURSE_SOURCE_PDF_MAX_BYTES,
  errors: { invalidDescriptor, unsupportedMediaType, expiredFile, unavailableFile, timedOutFile, oversizedFile }
};

export async function resolveOpenAiTemporaryPdf(options) {
  const { bytes } = await resolveOpenAiTemporaryFile(options, PDF_POLICY);
  return bytes;
}
