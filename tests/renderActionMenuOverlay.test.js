import test from "node:test";
import assert from "node:assert/strict";

import { renderActionMenuOverlay } from "../src/ui/renderActionMenuOverlay.js";

test("renderiza menu lateral de ações globais com ícones", () => {
  const html = renderActionMenuOverlay({
    title: "Ações",
    placement: "side",
    actions: [
      { key: "create-course", label: "Novo curso", icon: "&#43;" },
      { key: "import-json", label: "Importar", icon: "&#8679;" }
    ]
  });

  assert.match(html, /action-menu-overlay-side/);
  assert.match(html, /data-entity-action="create-course"/);
  assert.match(html, /data-entity-action="import-json"/);
  assert.match(html, /&#8679;/);
  assert.match(html, /title="Novo curso"/);
  assert.match(html, /aria-label="Importar"/);
});

test("renderiza menu inferior de ações do curso com exclusão destacada", () => {
  const html = renderActionMenuOverlay({
    title: "Ações do curso",
    placement: "bottom",
    actions: [
      { key: "edit-course-metadata", label: "Editar curso", icon: "&#9998;" },
      { key: "reset-course-progress", label: "Zerar progresso do curso", icon: "&#8635;" },
      { key: "export-course", label: "Exportar curso", icon: "&#8681;" },
      { key: "delete-course", label: "Excluir curso", icon: "&#128465;", tone: "danger" }
    ]
  });

  assert.match(html, /action-menu-overlay-bottom/);
  assert.match(html, /data-entity-action="edit-course-metadata"/);
  assert.match(html, /data-entity-action="reset-course-progress"/);
  assert.match(html, /data-entity-action="export-course"/);
  assert.match(html, /data-entity-action="delete-course"/);
  assert.match(html, /action-menu-btn is-danger/);
});
