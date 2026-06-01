import { formatCodebookForPrompt } from "./slotCodebook.js";
import { listResourceCatalog } from "./resourceCatalog.js";

export function buildStablePromptPrefix() {
  const resourceLines = listResourceCatalog()
    .map((item) => `- ${item.code} ${item.id}: ${item.didacticFunction}`)
    .join("\n");
  return [
    "AraLearn Structured Engine",
    "Regras fixas:",
    "- O app monta a estrutura final. A LLM escolhe recursos e preenche slots.",
    "- Nunca devolva JSON amplo de cards.",
    "- Respeite os códigos do codebook.",
    formatCodebookForPrompt(["resource", "operation", "questionKind", "probableMistake", "feedbackKind", "didacticMove", "auditAction"]),
    "Catálogo de recursos:",
    resourceLines
  ].join("\n\n");
}
