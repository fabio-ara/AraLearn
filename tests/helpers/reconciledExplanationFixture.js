import { createHash } from "node:crypto";

// Passages describe the persisted teaching basis. Callers supply them explicitly;
// the fixture never infers the inventory from requested materialization units.
export function reconciledExplanationFixture(passages, { title = "Explicação de DNS" } = {}) {
  const content = passages.map(({ text }, index) => ({ id: `support-${index}`,
    package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } }));
  return { title, content, reconciliation: {
    contract: "aralearn.explanation-reconciliation.v1",
    contentBasis: createHash("sha256").update(JSON.stringify({ title, content })).digest("hex"),
    entries: passages.map((passage, index) => ({ resourceId: content[index].id, path: "text", quote: passage.text,
      prefix: null, suffix: null, role: passage.role ?? "introduced",
      analysisUnitIds: passage.analysisUnitIds ?? [], evidenceRequirementIds: passage.evidenceRequirementIds ?? [],
      destinationMicrosequenceId: passage.destinationMicrosequenceId ?? null,
      reason: passage.reason ?? "Passagem da base vinculada ao repertório persistido desta fixture."
    }))
  } };
}
