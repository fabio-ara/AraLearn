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
          { action: "use-structure-version", label: "Usar", icon: "✓", disabled: true },
          { action: "delete-structure-version", label: "Excluir", icon: "×", tone: "danger" }
        ]
      },
      {
        key: "v2",
        origin: "v1 → v2",
        versionLabel: "v2",
        meta: "Edição estrutural · 10/05/2026 15:00:00",
        actions: [
          { action: "use-structure-version", label: "Usar", icon: "✓" },
          { action: "delete-structure-version", label: "Excluir", icon: "×", tone: "danger" }
        ]
      }
    ],
    footer: "Em uso: v3 · 10/05/2026 16:00:00",
    primaryAction: { action: "save-version-snapshot", label: "Gravar snapshot", icon: "+" }
  });

  assert.match(html, /history-item-card-body/);
  assert.match(html, /data-action="select-version-history-item" data-version-key="v3"/);
  assert.match(html, /data-action="save-version-snapshot"/);
  assert.match(html, /data-action="use-structure-version" data-version-key="v3"/);
  assert.match(html, /data-action="delete-structure-version" data-version-key="v2"/);
  assert.match(html, /Em uso/);
  assert.match(html, /10\/05\/2026 16:00:00/);
  assert.match(html, /Versões estruturais/);
  assert.match(html, /Em uso: v3/);
  assert.doesNotMatch(html, /data-action="open-version-compare-selected"/);
  assert.doesNotMatch(html, /Retomar como nova/);
});
