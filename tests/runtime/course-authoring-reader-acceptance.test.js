import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  buildCourseInspectionSearchIndex,
  createCourseInspectionSequence,
  searchCourseInspectionIndex
} from "../../src/ui/CourseInspectionSequence.js";
import {
  buildCourseAuthoringRoute,
  parseCourseAuthoringRoute
} from "../../src/ui/courseAuthoringRoute.js";
import { renderPackageStudyUnitBlocksWithDock } from
  "../../src/render/renderPackageStudyUnit.js";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/course-authoring-reader-acceptance.v1.json",
  import.meta.url
), "utf8"));
const css = await fs.readFile(new URL("../../public/course-authoring.css", import.meta.url), "utf8");

function unitId(ordinal) {
  return `unit-${String(ordinal).padStart(3, "0")}`;
}

function partForOrdinal(ordinal) {
  return fixture.parts[Math.floor((ordinal - 1) / fixture.unitsPerPart)];
}

function studyUnit(ordinal, revision = fixture.course.revision) {
  const external = revision >= fixture.externalUpdate.revision &&
    ordinal === fixture.externalUpdate.studyUnitOrdinal;
  return {
    id: unitId(ordinal),
    position: (ordinal - 1) % fixture.unitsPerPart + 1,
    title: ordinal === fixture.oldStudyUnitOrdinal
      ? "Unidade antiga recuperável"
      : `Unidade ${ordinal}`,
    role: "theory",
    content: [{
      id: `paragraph-${ordinal}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: {
        text: external
          ? `Conteúdo completo revisto. ${fixture.externalUpdate.marker}`
          : `Conteúdo pedagógico completo da Unidade ${ordinal}.`
      }
    }],
    response: null,
    feedback: [],
    topics: []
  };
}

function inspectionItem(ordinal, revision = fixture.course.revision) {
  const part = partForOrdinal(ordinal);
  return {
    studyUnit: studyUnit(ordinal, revision),
    version: revision >= fixture.externalUpdate.revision &&
      ordinal === fixture.externalUpdate.studyUnitOrdinal ? 2 : 1,
    updatedAt: revision >= fixture.externalUpdate.revision
      ? "2026-09-01T13:00:00Z"
      : "2026-09-01T12:00:00Z",
    ordinal,
    curriculumPath: {
      module: { id: `module-${part.position + 1}`, position: part.position, title: part.title },
      lesson: { id: `lesson-${part.position + 1}`, position: 0, title: `Percurso da ${part.title}` },
      didacticMicrosequence: {
        id: `micro-${part.position + 1}`,
        position: 0,
        title: `Microssequência da ${part.title}`
      }
    },
    authoringPart: {
      id: part.id,
      position: part.position,
      title: part.title,
      state: "materialized"
    },
    authorship: {
      createdOrigin: "gpt",
      lastRevisionOrigin: "gpt",
      design: {
        application: null
      }
    },
    deepLink: buildCourseAuthoringRoute(fixture.course.id, {
      section: "content",
      studyUnitId: unitId(ordinal)
    })
  };
}

function courseDocument(revision = fixture.course.revision) {
  return {
    courses: [{
      id: fixture.course.id,
      title: fixture.course.title,
      position: 0,
      modules: fixture.parts.map((part) => ({
        id: `module-${part.position + 1}`,
        position: part.position,
        title: part.title,
        lessons: [{
          id: `lesson-${part.position + 1}`,
          position: 0,
          title: `Percurso da ${part.title}`,
          microsequences: [{
            id: `micro-${part.position + 1}`,
            position: 0,
            title: `Microssequência da ${part.title}`,
            studyUnits: Array.from({ length: fixture.unitsPerPart }, (_, index) => (
              studyUnit(part.position * fixture.unitsPerPart + index + 1, revision)
            ))
          }]
        }]
      }))
    }]
  };
}

function pageFor(options) {
  const all = Array.from(
    { length: fixture.totalStudyUnits },
    (_, index) => inspectionItem(index + 1, options.expectedRevision)
  );
  const cursorIndex = options.cursor
    ? all.findIndex(({ studyUnit: value }) => value.id === options.cursor.studyUnitId)
    : -1;
  const anchorIndex = options.anchorStudyUnitId
    ? all.findIndex(({ studyUnit: value }) => value.id === options.anchorStudyUnitId)
    : -1;
  let start;
  let items;
  if (options.direction === "backward" && cursorIndex >= 0) {
    start = Math.max(0, cursorIndex - options.limit);
    items = all.slice(start, cursorIndex);
  } else {
    start = cursorIndex >= 0 ? cursorIndex + 1 : Math.max(0, anchorIndex);
    items = all.slice(start, start + options.limit);
  }
  const end = start + items.length;
  return {
    contract: "aralearn.course-study-unit-inspection-page.v2",
    courseId: fixture.course.id,
    courseRevision: options.expectedRevision,
    scope: options.scope,
    totalCount: fixture.totalStudyUnits,
    scopeOptions: {
      authoringParts: fixture.parts.map((part) => ({ ...part, state: "materialized" })),
      unassignedStudyUnitCount: 0
    },
    items,
    hasPrevious: start > 0,
    hasMore: end < fixture.totalStudyUnits,
    previousCursor: start > 0 && items.length
      ? { studyUnitId: items[0].studyUnit.id }
      : null,
    nextCursor: end < fixture.totalStudyUnits && items.length
      ? { studyUnitId: items.at(-1).studyUnit.id }
      : null,
    pageBytes: 32_768
  };
}

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  closest() { return null; }
  querySelector(selector) {
    if (selector.includes("[data-inspection-study-unit=")) {
      return {
        focus() {},
        getBoundingClientRect() { return { top: 0, bottom: 600 }; },
        scrollIntoView() {}
      };
    }
    return null;
  }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class FakeWindow {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  scrollBy() {}
  matchMedia() { return { matches: false }; }
}

function controllerFixture() {
  return {
    calls: [],
    positions: [],
    async loadAuthoringStudyUnits(courseId, options) {
      assert.equal(courseId, fixture.course.id);
      this.calls.push(structuredClone(options));
      return pageFor(options);
    },
    async loadCourseDocument(courseId, options) {
      assert.equal(courseId, fixture.course.id);
      return { document: courseDocument(options.verifiedRevision) };
    },
    async loadAuthoringInspectionPosition() { return null; },
    async saveAuthoringInspectionPosition(_courseId, position) {
      this.positions.push(structuredClone(position));
    }
  };
}

function countRenderedStudyUnits(html) {
  return (html.match(/data-inspection-study-unit=/gu) || []).length;
}

function assertIconControlsHaveNames(html) {
  for (const match of html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gu)) {
    const attributes = match[2];
    const visibleText = match[3]
      .replace(/<svg\b[\s\S]*?<\/svg>/gu, "")
      .replace(/<[^>]+>/gu, "")
      .replace(/&[a-z]+;/giu, " ")
      .trim();
    if (!visibleText) assert.match(attributes, /\saria-label="[^"]+"/u, match[0]);
  }
}

async function searchAndSelect(root, ordinal) {
  const id = unitId(ordinal);
  assert.equal(await root.listeners.get("input")({
    target: {
      value: String(ordinal),
      matches(selector) { return selector === "[data-inspection-search-input]"; }
    }
  }), true);
  assert.match(root.innerHTML, new RegExp(`data-inspection-search-option="study_unit:${id}"`, "u"));
  assert.equal(await root.listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: { inspectionSearchOption: `study_unit:${id}` },
      closest(selector) { return selector === "[data-inspection-search-option]" ? this : null; }
    }
  }), true);
}

test("#270 fixture representa 12 Partes e 120 Units em índice compacto pesquisável", () => {
  assert.equal(fixture.contract, "aralearn.course-authoring-reader-acceptance.v1");
  assert.equal(fixture.parts.length, 12);
  assert.equal(fixture.parts.reduce((total) => total + fixture.unitsPerPart, 0), 120);
  const index = buildCourseInspectionSearchIndex(courseDocument(), fixture.course.id);
  assert.equal(index.filter(({ kind }) => kind === "study_unit").length, 120);
  assert.equal(searchCourseInspectionIndex(index, "unidade antiga recuperavel")[0].id,
    unitId(fixture.oldStudyUnitOrdinal));
  assert.equal(searchCourseInspectionIndex(index, "120")[0].id, unitId(120));
  assert.match(searchCourseInspectionIndex(index, "parte 12 sintese")[0].path.join(" "),
    /Parte 12 — Síntese/u);
});

test("#270 leitor mantém uma Unit completa, salta para antiga, retorna e preserva deep link", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture();
  const focusedDeepLinks = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: {
      courseId: fixture.course.id,
      revision: fixture.course.revision,
      title: fixture.course.title,
      ownership: "owned",
      canEdit: false
    },
    routeTarget: { kind: "study_unit", id: unitId(fixture.initialStudyUnitOrdinal) },
    onStudyUnitChange(studyUnitId) {
      focusedDeepLinks.push(buildCourseAuthoringRoute(fixture.course.id, {
        section: "content",
        studyUnitId
      }));
    },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.equal(sequence.snapshot().studyUnitId, unitId(fixture.initialStudyUnitOrdinal));
  assert.match(root.innerHTML, new RegExp(
    `${fixture.initialStudyUnitOrdinal}/${fixture.totalStudyUnits}`,
    "u"
  ));
  assert.equal(countRenderedStudyUnits(root.innerHTML), 1);
  assert.match(root.innerHTML, /Conteúdo pedagógico completo da Unidade 76/u);
  assert.doesNotMatch(root.innerHTML, /Conteúdo pedagógico completo da Unidade 75/u);
  assert.doesNotMatch(root.innerHTML, /Parte 1 — Fundamentos|Parte 12 — Síntese/u);
  const expectedStudy = renderPackageStudyUnitBlocksWithDock(
    studyUnit(fixture.initialStudyUnitOrdinal),
    { omitRepeatedHeading: true, blockKeyPrefix: `inspection:${unitId(76)}` }
  );
  assert.ok(expectedStudy.bodyHtml);
  assert.equal(root.innerHTML.includes(expectedStudy.bodyHtml), true);

  await searchAndSelect(root, fixture.oldStudyUnitOrdinal);
  assert.equal(sequence.snapshot().studyUnitId, unitId(fixture.oldStudyUnitOrdinal));
  assert.equal(countRenderedStudyUnits(root.innerHTML), 1);
  assert.match(root.innerHTML, /Unidade antiga recuperável/u);
  await searchAndSelect(root, fixture.initialStudyUnitOrdinal);
  assert.equal(sequence.snapshot().studyUnitId, unitId(fixture.initialStudyUnitOrdinal));
  assert.equal(countRenderedStudyUnits(root.innerHTML), 1);

  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-action]"
          ? { dataset: { inspectionAction: "next" } }
          : null;
      }
    }
  });
  assert.equal(sequence.snapshot().studyUnitId, unitId(fixture.initialStudyUnitOrdinal + 1));
  assert.equal(countRenderedStudyUnits(root.innerHTML), 1);
  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-action]"
          ? { dataset: { inspectionAction: "previous" } }
          : null;
      }
    }
  });
  assert.equal(sequence.snapshot().studyUnitId, unitId(fixture.initialStudyUnitOrdinal));
  assert.deepEqual(
    focusedDeepLinks.map((link) => parseCourseAuthoringRoute(link).target.id),
    [
      unitId(fixture.oldStudyUnitOrdinal),
      unitId(fixture.initialStudyUnitOrdinal),
      unitId(fixture.initialStudyUnitOrdinal + 1),
      unitId(fixture.initialStudyUnitOrdinal)
    ]
  );

  const oldDeepLink = buildCourseAuthoringRoute(fixture.course.id, {
    section: "content",
    studyUnitId: unitId(fixture.oldStudyUnitOrdinal)
  });
  assert.deepEqual(parseCourseAuthoringRoute(oldDeepLink), {
    courseId: fixture.course.id,
    section: "content",
    target: { kind: "study_unit", id: unitId(fixture.oldStudyUnitOrdinal) }
  });
  assertIconControlsHaveNames(root.innerHTML);
  fixture.accessibleControls.forEach((label) => assert.match(
    root.innerHTML,
    new RegExp(`aria-label="${label}"`, "u")
  ));
  const visibleText = root.innerHTML.replace(/<[^>]+>/gu, " ");
  fixture.forbiddenEverydayTerms.forEach((term) => assert.doesNotMatch(
    visibleText,
    new RegExp(`\\b${term}\\b`, "iu")
  ));
  sequence.destroy();

  const linkedRoot = new FakeRoot();
  const linked = createCourseInspectionSequence({
    root: linkedRoot,
    controller: controllerFixture(),
    course: { courseId: fixture.course.id, revision: fixture.course.revision },
    routeTarget: { kind: "study_unit", id: unitId(fixture.oldStudyUnitOrdinal) },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  assert.equal(await linked.open(), true);
  assert.equal(linked.snapshot().studyUnitId, unitId(fixture.oldStudyUnitOrdinal));
  assert.equal(countRenderedStudyUnits(linkedRoot.innerHTML), 1);
  linked.destroy();
});

test("#270 atualização externa conserva a Unit ativa e troca somente seu conteúdo", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture();
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: fixture.course.id, revision: fixture.course.revision },
    routeTarget: { kind: "study_unit", id: unitId(fixture.externalUpdate.studyUnitOrdinal) },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();
  const before = sequence.snapshot();
  assert.doesNotMatch(root.innerHTML, new RegExp(fixture.externalUpdate.marker, "u"));
  assert.equal(await sequence.refresh(fixture.externalUpdate.revision), true);
  assert.equal(sequence.snapshot().studyUnitId, before.studyUnitId);
  assert.equal(sequence.snapshot().scope.kind, before.scope.kind);
  assert.equal(countRenderedStudyUnits(root.innerHTML), 1);
  assert.match(root.innerHTML, new RegExp(fixture.externalUpdate.marker, "u"));
  sequence.destroy();
});

test("#270 CSS sustenta uma coluna e uma rolagem principal em 360/390/430/desktop", () => {
  assert.deepEqual(fixture.viewports, [360, 390, 430, 1280]);
  const rootBlock = /\.course-authoring-root\s*\{([^}]+)\}/u.exec(css)?.[1] || "";
  assert.match(rootBlock, /overflow-y:\s*auto/u);
  assert.match(rootBlock, /overflow-x:\s*clip/u);
  const contentBlock = /\.course-authoring-surface\[data-section="content"\]\s*\{([^}]+)\}/u
    .exec(css)?.[1] || "";
  assert.match(contentBlock, /width:\s*min\(100%,\s*430px\)/u);
  assert.doesNotMatch(contentBlock, /grid-template-columns/u);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/u);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/u);
  assert.doesNotMatch(css, /course-authoring-sidebar/u);
  assert.deepEqual(fixture.viewports.map((width) => Math.min(width, 430)), [360, 390, 430, 430]);
});
