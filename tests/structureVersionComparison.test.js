import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStructureVersionComparison,
  buildStructureVersionHistoryComparison,
  buildStructureVersionComparisonForVersion
} from "../src/ui/structureVersionComparison.js";

test("compara curso por módulos e contagem aninhada de cards", () => {
  const comparison = buildStructureVersionComparison({
    level: "course",
    previousEntity: {
      title: "Curso A",
      modules: [
        {
          key: "m1",
          title: "Módulo 1",
          lessons: [{ key: "l1", title: "Lição 1", microsequences: [{ key: "ms1", cards: [{ key: "c1" }] }] }]
        }
      ]
    },
    currentEntity: {
      title: "Curso A revisado",
      modules: [
        {
          key: "m1",
          title: "Módulo 1",
          lessons: [{ key: "l1", title: "Lição 1", microsequences: [{ key: "ms1", cards: [{ key: "c1" }, { key: "c2" }] }] }]
        },
        {
          key: "m2",
          title: "Módulo 2",
          lessons: []
        }
      ]
    }
  });

  assert.equal(comparison.childField, "modules");
  assert.equal(comparison.metadata.titleChanged, true);
  assert.equal(comparison.counts.childDelta, 1);
  assert.equal(comparison.counts.previousNestedCards, 1);
  assert.equal(comparison.counts.currentNestedCards, 2);
  assert.equal(comparison.composition.totals.added, 1);
  assert.equal(comparison.composition.totals.changed, 1);
  assert.deepEqual(
    comparison.metrics.map((item) => ({ label: item.label, previous: item.previous, current: item.current })),
    [
      { label: "Módulos", previous: 1, current: 2 },
      { label: "Lições", previous: 1, current: 1 },
      { label: "Microssequências", previous: 1, current: 1 },
      { label: "Cards", previous: 1, current: 2 }
    ]
  );
  assert.deepEqual(comparison.metadataSummary, ["Título"]);
});

test("compara módulo por lições e detecta reordenação", () => {
  const comparison = buildStructureVersionComparison({
    level: "module",
    previousEntity: {
      title: "Módulo",
      lessons: [
        { key: "l1", title: "Lição 1", microsequences: [] },
        { key: "l2", title: "Lição 2", microsequences: [] }
      ]
    },
    currentEntity: {
      title: "Módulo",
      lessons: [
        { key: "l2", title: "Lição 2", microsequences: [] },
        { key: "l1", title: "Lição 1", microsequences: [] }
      ]
    }
  });

  assert.equal(comparison.childLabel, "Lições");
  assert.equal(comparison.composition.totals.moved, 2);
  assert.deepEqual(
    comparison.composition.changes.map((item) => item.kind),
    ["moved", "moved"]
  );
});

test("compara lição por microssequências e detecta metadata própria", () => {
  const comparison = buildStructureVersionComparison({
    level: "lesson",
    previousEntity: {
      title: "Lição",
      description: "Resumo curto",
      sourceGuide: "Guia inicial",
      microsequences: [{ key: "ms1", title: "Mic 1", cards: [] }]
    },
    currentEntity: {
      title: "Lição",
      description: "Resumo novo",
      sourceGuide: "Guia novo",
      microsequences: [{ key: "ms1", title: "Mic 1 revisada", cards: [] }]
    }
  });

  assert.equal(comparison.metadata.descriptionChanged, true);
  assert.equal(comparison.metadata.sourceGuideChanged, true);
  assert.equal(comparison.composition.totals.changed, 1);
  assert.equal(comparison.composition.changes[0].title, "Mic 1 revisada");
  assert.deepEqual(comparison.metadataSummary, ["Descrição", "Fonte-guia"]);
  assert.deepEqual(
    comparison.metrics.map((item) => ({ label: item.label, previous: item.previous, current: item.current })),
    [
      { label: "Microssequências", previous: 1, current: 1 },
      { label: "Cards", previous: 0, current: 0 }
    ]
  );
});

test("compara versão estrutural ativa com a anterior", () => {
  const comparison = buildStructureVersionHistoryComparison({
    entry: {
      level: "module",
      activeVersionId: "v2",
      versions: [
        {
          id: "v1",
          label: "Versão 1",
          operationType: "seed",
          snapshot: {
            title: "Módulo base",
            lessons: [{ key: "l1", title: "Lição 1", microsequences: [] }]
          }
        },
        {
          id: "v2",
          label: "Versão 2",
          operationType: "create-child",
          snapshot: {
            title: "Módulo base",
            lessons: [
              { key: "l1", title: "Lição 1", microsequences: [] },
              { key: "l2", title: "Lição 2", microsequences: [] }
            ]
          }
        }
      ]
    }
  });

  assert.equal(comparison.kind, "structure");
  assert.equal(comparison.level, "module");
  assert.equal(comparison.previousVersion.label, "Versão 1");
  assert.equal(comparison.currentVersion.label, "Versão 2");
  assert.equal(comparison.previousVersion.operationType, "seed");
  assert.equal(comparison.currentVersion.operationType, "create-child");
  assert.equal(comparison.counts.childDelta, 1);
  assert.equal(comparison.composition.totals.added, 1);
});

test("prioriza parentVersionId ao comparar variação estrutural não sequencial", () => {
  const comparison = buildStructureVersionComparisonForVersion({
    entry: {
      level: "lesson",
      activeVersionId: "v4",
      versions: [
        {
          id: "v1",
          label: "Versão 1",
          snapshot: {
            title: "Lição base",
            microsequences: [{ key: "ms1", title: "Mic 1", cards: [] }]
          }
        },
        {
          id: "v2",
          label: "Versão 2",
          snapshot: {
            title: "Lição intermediária",
            microsequences: [{ key: "ms2", title: "Mic 2", cards: [] }]
          }
        },
        {
          id: "v4",
          parentVersionId: "v1",
          label: "Versão 4",
          snapshot: {
            title: "Lição variação",
            microsequences: [{ key: "ms1", title: "Mic 1 revisto", cards: [] }]
          }
        }
      ]
    },
    versionId: "v4"
  });

  assert.equal(comparison.previousVersion.id, "v1");
  assert.equal(comparison.currentVersion.id, "v4");
});
