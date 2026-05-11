import test from "node:test";
import assert from "node:assert/strict";

import { renderCardVersionOverlay } from "../src/ui/renderCardVersionOverlay.js";

test("renderiza histórico com seleção explícita e ações discretas", () => {
  const html = renderCardVersionOverlay({
    title: "Versões estruturais",
    versions: [
      {
        key: "v3",
        origin: "v1 → v3",
        versionLabel: "v3",
        meta: "Duplicar · 10/05/2026 16:00:00",
        selected: true,
        inUse: true,
        actions: [
          { action: "open-version-compare-selected", label: "Comparar", icon: "👁" }
        ]
      },
      {
        key: "v2",
        origin: "v1 → v2",
        versionLabel: "v2",
        meta: "Edição estrutural · 10/05/2026 15:00:00",
        actions: [{ action: "open-version-compare-selected", label: "Comparar", icon: "👁" }],
        moreActions: [{ action: "restore-structure-version-as-new", label: "Criar variação", icon: "⧉" }],
        moreExpanded: true
      }
    ],
    footer: "Em uso: v3 · 10/05/2026 16:00:00"
  });

  assert.match(html, /history-item-card-body/);
  assert.match(html, /data-action="select-version-history-item" data-version-key="v3"/);
  assert.match(html, /data-action="open-version-compare-selected" data-version-key="v3"/);
  assert.match(html, /data-action="open-version-compare-selected" data-version-key="v2"/);
  assert.match(html, /data-action="restore-structure-version-as-new" data-version-key="v2"/);
  assert.match(html, /Em uso/);
  assert.match(html, /10\/05\/2026 16:00:00/);
  assert.match(html, /Versões estruturais/);
  assert.match(html, /Em uso: v3/);
  assert.doesNotMatch(html, /data-action="use-structure-version"/);
  assert.doesNotMatch(html, /Retomar como nova/);
});
