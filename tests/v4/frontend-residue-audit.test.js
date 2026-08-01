import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCssResidues,
  auditFrontendResidues,
  auditInterfaceGlyphs,
  pruneOrphanCssRules,
  referencedClassNames
} from "../../scripts/auditFrontendResidues.mjs";

test("auditoria separa regra órfã de estado associado a componente vivo", () => {
  const references = referencedClassNames('element.className = "live-card";');
  const css = [
    ".dead-card.is-active { color: #fff; }",
    ".dead-card, .live-card { border: 0; }",
    ".live-card.is-active { color: rgba(0, 0, 0, 0.5); }"
  ].join("\n");
  const audit = auditCssResidues(css, new Set([...references, "is-active"]));
  assert.deepEqual(audit.orphanRules.map((rule) => rule.selector), [".dead-card.is-active"]);
  assert.deepEqual(audit.orphanBranches, [".dead-card.is-active", ".dead-card"]);
  assert.equal(audit.literalColors, 2);
  const pruned = pruneOrphanCssRules(css, audit.orphanRules, audit.partialOrphanRules);
  assert.match(pruned, /live-card/u);
  assert.doesNotMatch(pruned, /dead-card/u);
});

test("auditoria distingue ícone textual de pontuação e entidades permitidas", () => {
  assert.equal(auditInterfaceGlyphs("Salvar ▶ &#9654;"), 2);
  assert.equal(auditInterfaceGlyphs("Texto · linha\n e apóstrofo &#39;"), 0);
});

test("front-end ativo não mantém regra órfã, paleta paralela nem glifo de interface", async () => {
  const { report } = await auditFrontendResidues();
  assert.equal(report.orphanRules, 0);
  assert.equal(report.orphanBranches, 0);
  assert.equal(report.literalColors, 0);
  assert.equal(report.interfaceGlyphs, 0);
  assert.equal(report.legacySubmissionSelectors, 0);
});
