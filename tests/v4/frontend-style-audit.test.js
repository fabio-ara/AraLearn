import assert from "node:assert/strict";
import test from "node:test";

import {
  auditFrontendRepository,
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

test("linha de base do front-end permanece reproduzível durante a migração", async () => {
  const report = await auditFrontendRepository();
  assert.ok(report.styles.bytes > 100_000);
  assert.ok(report.styles.literalColors.hex > 0);
  assert.ok(report.styles.literalColors.rgb > 0);
  assert.ok(report.cardRuntime.literalColors.hex > 0);
  assert.ok(report.uiMarkup.numericHtmlEntities > 0);
  assert.ok(report.legacySubmissionSelectors > 0);
  assert.equal(report.sourceBytes.styles, report.styles.bytes);
});
