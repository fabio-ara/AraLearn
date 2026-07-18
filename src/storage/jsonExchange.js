import {
  CONTRACT_KIND_PROJECT,
  CONTRACT_NAME,
  CONTRACT_VERSION
} from "../contract/validateContract.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function detectJsonExchangeFormat(parsed) {
  if (!isPlainObject(parsed)) {
    throw new Error("JSON inválido: raiz deve ser um objeto.");
  }

  if (parsed.format === "aralearn.storage") {
    return "storage";
  }

  if (
    parsed.contract === CONTRACT_NAME &&
    parsed.version === CONTRACT_VERSION &&
    parsed.kind === CONTRACT_KIND_PROJECT &&
    Array.isArray(parsed.courses)
  ) {
    return "contract";
  }

  throw new Error(
    `JSON inválido para importação. Use um projeto com \`contract: "${CONTRACT_NAME}"\`, \`version: ${CONTRACT_VERSION}\`, \`kind: "${CONTRACT_KIND_PROJECT}"\` ou um backup com \`format: "aralearn.storage"\`.`
  );
}
