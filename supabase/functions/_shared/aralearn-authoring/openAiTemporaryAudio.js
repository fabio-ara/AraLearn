import { COURSE_AUDIO_MEDIA_TYPES, COURSE_MEDIA_MAX_BYTES, inspectCourseAudioBytes,
  normalizeCourseAudioFileName } from "../aralearn/runtime/domain/courseMedia.js";
import { AuthoringApiError } from "./errors.js";
import { resolveOpenAiTemporaryFile } from "./openAiTemporaryFile.js";

const AUDIO_POLICY = {
  field: "audio", mediaTypes: new Set(COURSE_AUDIO_MEDIA_TYPES), maxBytes: COURSE_MEDIA_MAX_BYTES,
  errors: {
    invalidDescriptor: (path = "audio", rule = "valid_openai_file_reference") => new AuthoringApiError(
      422, "invalid_openai_file", "O arquivo de áudio precisa ser fornecido pelo cliente da conversa.", { path, rule }),
    unsupportedMediaType: () => new AuthoringApiError(415, "unsupported_audio_media_type", "Use áudio WAV PCM ou MP3."),
    expiredFile: () => new AuthoringApiError(410, "openai_file_expired", "O acesso temporário ao áudio expirou. Anexe o arquivo novamente."),
    unavailableFile: () => new AuthoringApiError(502, "openai_file_unavailable", "Não foi possível receber o áudio. Repita a mesma tentativa."),
    timedOutFile: () => new AuthoringApiError(408, "openai_file_timeout", "O recebimento do áudio não terminou a tempo. Repita a mesma tentativa."),
    oversizedFile: () => new AuthoringApiError(413, "audio_too_large", "Use áudio de até 20 MiB.")
  }
};

/** Bytes reais, MIME verificado e nome local; nunca devolve a URL temporária. */
export async function resolveOpenAiTemporaryAudio(options) {
  const { bytes, responseMediaType } = await resolveOpenAiTemporaryFile(options, AUDIO_POLICY);
  try {
    const inspected = inspectCourseAudioBytes(bytes, {
      declaredMediaType: options.descriptor.mime_type?.trim().toLowerCase() ?? ""
    });
    if (responseMediaType && responseMediaType !== "application/octet-stream" &&
        responseMediaType !== inspected.mediaType) throw new TypeError("MIME divergente.");
    const fileName = normalizeCourseAudioFileName(options.descriptor.file_name ?? `audio.${inspected.extension}`);
    return { bytes, mediaType: inspected.mediaType, fileName };
  } catch {
    throw new AuthoringApiError(422, "invalid_course_media", "O arquivo deve conter áudio WAV PCM ou MP3 válido e um nome sem caminho.");
  }
}
