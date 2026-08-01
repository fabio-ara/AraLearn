import assert from "node:assert/strict";
import test from "node:test";

import {
  auditFrontendRepository,
  auditCssRules,
  auditStyleText,
  auditUiSourceText
} from "../../scripts/auditFrontendStyles.mjs";

test("auditoria distingue tokens, cores literais e declarações de estilo", () => {
  assert.deepEqual(auditStyleText(`:root {
    --surface: #fff;
    --overlay: rgba(0, 0, 0, 0.2);
  }
  .card { color: var(--surface) !important; }
  `), {
    bytes: 116,
    lines: 6,
    literalColors: { hex: 1, rgb: 1, hsl: 0 },
    customPropertyDeclarations: 2,
    customPropertyUses: 1,
    importantDeclarations: 1
  });

  assert.deepEqual(auditUiSourceText(`
    const icon = "&#9654;";
    const markup = '<span style="color:#fff"></span>';
    node.style.width = "20px";
  `), {
    literalColors: { hex: 1, rgb: 0, hsl: 0 },
    numericHtmlEntities: 1,
    inlineStyleAttributes: 1,
    directStyleAssignments: 1
  });
});

test("auditoria localiza cores literais somente nos seletores consultados", () => {
  assert.deepEqual(auditCssRules(`
    .runtime-card { color: #fff; }
    .other-card { color: rgb(1 2 3); }
    @media (width > 20rem) { .runtime-card { border-color: var(--border-default); } }
  `, /\.runtime-/gu), {
    rulesWithLiteralColors: 1,
    findings: [{
      selector: ".runtime-card",
      literalColors: { hex: 1, rgb: 0, hsl: 0 }
    }]
  });
});

test("front-end consolidado permanece reproduzível e usa somente decisões semânticas", async () => {
  const report = await auditFrontendRepository();
  assert.ok(report.styles.bytes > 100_000);
  assert.equal(report.styles.literalColors.hex, 0);
  assert.equal(report.styles.literalColors.rgb, 0);
  assert.ok(report.tokens.customPropertyDeclarations >= 50);
  assert.equal(report.shellBaseline.literalColors.hex, 0);
  assert.equal(report.shellBaseline.literalColors.rgb, 0);
  assert.equal(report.cardRuntime.literalColors.hex, 0);
  assert.equal(report.cardRuntime.literalColors.rgb, 0);
  assert.equal(report.cardRuntime.numericHtmlEntities, 0);
  assert.equal(report.runtimeStyles.rulesWithLiteralColors, 0);
  assert.equal(report.uiMarkup.numericHtmlEntities, 0);
  assert.equal(report.legacySubmissionSelectors, 0);
  assert.equal(report.sourceBytes.styles, report.styles.bytes);
});
