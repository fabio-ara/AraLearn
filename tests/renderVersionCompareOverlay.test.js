import test from "node:test";
import assert from "node:assert/strict";

import { renderVersionCompareOverlay } from "../src/ui/renderVersionCompareOverlay.js";

test("renderiza comparação com abas, resumo em linguagem simples e links de inspeção", () => {
  const html = renderVersionCompareOverlay({
    comparison: {
      kind: "structure",
      level: "course",
      activeVersionId: "v3",
      previousVersion: {
        id: "v2",
        label: "Versão 2",
        updatedAt: "2026-05-10T18:32:00.000Z",
        snapshot: {
          key: "course-1",
          title: "Curso base",
          modules: [{ key: "m1", title: "Módulo 1", lessons: [] }]
        }
      },
      currentVersion: {
        id: "v3",
        label: "Versão 3",
        updatedAt: "2026-05-10T18:40:00.000Z",
        snapshot: {
          key: "course-1",
          title: "Curso base",
          modules: [
            { key: "m1", title: "Módulo 1", lessons: [] },
            { key: "m2", title: "Módulo novo", lessons: [] }
          ]
        }
      },
      summaryEntries: [
        {
          id: "module-added-m2",
          title: "Módulo adicionado",
          lines: ["Módulo: Módulo novo"],
          target: { scope: "module", moduleKey: "m2" },
          canOpenPrevious: false,
          canOpenCurrent: true,
          canCompare: false
        }
      ]
    },
    uiState: {
      activeTab: "summary",
      focusTarget: null
    }
  });

  assert.match(html, /editor-title">Comparar<\/p>/);
  assert.match(html, /data-action="select-version-compare-tab" data-compare-tab="summary"/);
  assert.match(html, /data-action="select-version-compare-tab" data-compare-tab="previous"/);
  assert.match(html, /data-action="select-version-compare-tab" data-compare-tab="current"/);
  assert.match(html, /10\/05 18:32/);
  assert.match(html, /10\/05 18:40/);
  assert.match(html, /Comparando v2 com v3/);
  assert.match(html, /data-action="use-version-compare-side" data-compare-side="previous"/);
  assert.match(html, /Usar v2/);
  assert.match(html, /Em uso: v3/);
  assert.match(html, /Módulo adicionado/);
  assert.match(html, /Ver em vB/);
  assert.doesNotMatch(html, /manual-restore/);
  assert.doesNotMatch(html, /metadata/);
  assert.doesNotMatch(html, /cards aninhados/);
});

test("renderiza inspeção somente leitura ao abrir uma diferença estrutural", () => {
  const html = renderVersionCompareOverlay({
    comparison: {
      kind: "structure",
      level: "course",
      activeVersionId: "v3",
      previousVersion: {
        id: "v2",
        label: "Versão 2",
        updatedAt: "2026-05-10T18:32:00.000Z",
        snapshot: {
          key: "course-1",
          title: "Curso base",
          modules: [{ key: "m1", title: "Módulo 1", lessons: [] }]
        }
      },
      currentVersion: {
        id: "v3",
        label: "Versão 3",
        updatedAt: "2026-05-10T18:40:00.000Z",
        snapshot: {
          key: "course-1",
          title: "Curso base",
          modules: [{ key: "m1", title: "Módulo 1", lessons: [] }]
        }
      },
      summaryEntries: []
    },
    uiState: {
      activeTab: "current",
      focusTarget: { scope: "module", moduleKey: "m1" }
    }
  });

  assert.match(html, /Somente leitura/);
  assert.match(html, /data-action="back-to-comparison"/);
  assert.match(html, /Módulo 1/);
  assert.doesNotMatch(html, /data-action="open-module-actions"/);
  assert.doesNotMatch(html, /data-action="open-version-history"/);
});
