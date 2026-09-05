export const TEXT_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
const TEXT_EXPORT_MAX_FILE_NAME_LENGTH = 160;
const TEXT_EXPORT_TYPES = Object.freeze({
  "application/json": ".json",
  "text/csv": ".csv"
});
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function normalizedMediaType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

export function normalizeTextFileDownload({ name, type, content } = {}) {
  const mediaType = normalizedMediaType(type);
  const extension = TEXT_EXPORT_TYPES[mediaType];
  const fileName = String(name || "").trim();
  if (!extension || !fileName || fileName.length > TEXT_EXPORT_MAX_FILE_NAME_LENGTH ||
      !SAFE_FILE_NAME.test(fileName) || fileName.includes("..") ||
      !fileName.toLowerCase().endsWith(extension)) {
    throw new TypeError("A exportação precisa ser CSV ou JSON e usar um nome de arquivo válido.");
  }
  if (typeof content !== "string") {
    throw new TypeError("O conteúdo da exportação precisa ser texto.");
  }
  const byteSize = new Blob([content]).size;
  if (byteSize > TEXT_EXPORT_MAX_BYTES) {
    throw new RangeError(
      "A exportação excede o limite de 32 MiB."
    );
  }
  return Object.freeze({ name: fileName, type: mediaType, content, byteSize });
}

export function downloadTextFile(value, {
  androidHost = globalThis.AndroidHost,
  documentValue = globalThis.document,
  urlValue = globalThis.URL,
  schedule = globalThis.setTimeout
} = {}) {
  const file = normalizeTextFileDownload(value);
  if (typeof androidHost?.saveTextFile === "function") {
    if (androidHost.saveTextFile(file.content, file.name, file.type) !== true) {
      throw new Error("O aplicativo não pôde abrir o seletor para salvar a exportação.");
    }
    return Object.freeze({ platform: "android", ...file });
  }

  const anchor = documentValue?.createElement?.("a");
  if (!anchor || typeof urlValue?.createObjectURL !== "function" ||
      typeof urlValue?.revokeObjectURL !== "function" || typeof schedule !== "function") {
    throw new TypeError("O navegador não oferece exportação de arquivos.");
  }
  const url = urlValue.createObjectURL(new Blob([file.content], {
    type: `${file.type};charset=utf-8`
  }));
  try {
    anchor.href = url;
    anchor.download = file.name;
    anchor.hidden = true;
    documentValue.body?.append?.(anchor);
    anchor.click();
  } finally {
    anchor.remove?.();
    schedule(() => urlValue.revokeObjectURL(url), 0);
  }
  return Object.freeze({ platform: "web", ...file });
}
