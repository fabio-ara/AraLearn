import { validateScopeContractDocument } from "../../domain/scopeContract.js";
import { scopeContractToDraft } from "./scopeBuilderState.js";

export function importScopeJson(rawText) {
  const parsed = JSON.parse(String(rawText || ""));
  const result = validateScopeContractDocument(parsed);
  if (!result.ok) {
    throw new Error(result.errors.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
  return {
    contract: result.value,
    draft: scopeContractToDraft(result.value)
  };
}

