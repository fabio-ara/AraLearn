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

  if (
    parsed.contract === CONTRACT_NAME &&
    parsed.version === CONTRACT_VERSION &&
    parsed.kind === CONTRACT_KIND_PROJECT &&
    Array.isArray(parsed.courses)
  ) {
    return "contract";
  }

  throw new Error(
    `JSON inválido para importação. Use um projeto com \`contract: "${CONTRACT_NAME}"\`, \`version: ${CONTRACT_VERSION}\` e \`kind: "${CONTRACT_KIND_PROJECT}"\`.`
  );
}
