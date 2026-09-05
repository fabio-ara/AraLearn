import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { createCourseSourcesPanel } from "../../src/ui/CourseSourcesPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000002";
const SOURCE_ID = "source-context-synthetic";

class Root {
  innerHTML = "";
  listeners = new Map();
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  querySelector() { return { focus() {}, scrollIntoView() {} }; }
  querySelectorAll() { return []; }
  contains() { return true; }
}

function click(root, action, dataset = {}) {
  root.listeners.get("click")({ preventDefault() {}, target: {
    closest: selector => selector === "[data-source-action]"
      ? { dataset: { sourceAction: action, ...dataset } } : null
  } });
}

async function settle() {
  for (let index = 0; index < 4; index += 1) await new Promise(resolve => setImmediate(resolve));
}

function submitSource(root) {
  const values = {
    sourceId: SOURCE_ID, kind: "book", role_technical_conceptual: true,
    citationMode: "manual", title: "Referência com título corrigido",
    authors_0_format: "literal", authors_0_literal: "Autoria sintética",
    publicationDate: "2026", identifier: "", language: "pt-BR",
    citationText: "Autoria sintética. Referência corrigida. 2026.",
    url: "https://example.test/reference", editionOrVersion: "",
    origin: "external", availability: "open_access", verificationStatus: "author_verified",
    studyVisibility: "citation_and_link"
  };
  const form = { elements: {}, matches: selector => selector === '[data-source-form="source"]' };
  form.elements = Object.fromEntries(Object.entries(values).map(([name, value]) =>
    [name, { name, value, checked: value === true, form }]));
  root.listeners.get("submit")({ preventDefault() {}, target: form });
}

function harness({ failTargetRefresh = false } = {}) {
  let courseRevision = 5;
  let sourceRevision = 1;
  let storedLinks = [];
  let targetReads = 0;
  let changedMetadata = false;
  const writes = [];
  const source = () => ({
    sourceId: SOURCE_ID, revision: sourceRevision, status: "active", kind: "book",
    defaultRoles: ["technical_conceptual"], bibliographic: createEmptyCourseSourceBibliographicMetadata(),
    citationMode: "manual", title: changedMetadata ? "Referência com título corrigido" : "Referência sintética",
    authors: [{ literal: "Autoria sintética" }], publicationDate: "2026", identifier: null,
    language: "pt-BR", citationText: "Autoria sintética. Referência. 2026.",
    url: "https://example.test/reference", editionOrVersion: null,
    origin: "external", availability: "open_access", verificationStatus: "author_verified",
    studyVisibility: "citation_and_link", publicFileAccess: "inherit", anchorCount: 0,
    createdAt: "2026-09-05T10:00:00.000Z"
  });
  const controller = {
    async loadCourseSources(_courseId, options) {
      assert.equal(options.expectedRevision, courseRevision);
      if (options.mode === "target") {
        targetReads += 1;
        if (failTargetRefresh && targetReads === 2) throw new Error("Falha sintética na releitura do alvo.");
      }
      return {
        contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025",
        courseId: COURSE_ID, courseRevision, mode: options.mode,
        query: { sourceId: options.sourceId ?? null,
          targetKind: options.targetKind ?? null, targetId: options.targetId ?? null },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
        items: options.mode === "target" ? [{
          targetKind: "plan_item", targetId: TARGET_ID, targetVersion: 3,
          sourceLinks: structuredClone(storedLinks), createdAt: "2026-09-05T10:00:00.000Z"
        }] : options.mode === "source" ? [{ ...source(), anchors: [], attachments: [] }] : [source()],
        nextCursor: null
      };
    },
    async mutateCourseSources(request) {
      writes.push(structuredClone(request));
      assert.equal(request.expectedCourseRevision, courseRevision);
      courseRevision += 1;
      if (request.command.type === "save_source") {
        sourceRevision += 1;
        changedMetadata = true;
      } else if (request.command.type === "set_target_sources") {
        storedLinks = structuredClone(request.command.sourceLinks);
      } else assert.fail("Escritor fora do recorte sintético.");
      return { contract: "aralearn.course-source-change.v1", courseId: COURSE_ID,
        courseRevision, requestId: request.requestId, idempotent: false, changed: true,
        change: request.command.type === "save_source"
          ? { type: "save_source", subjectId: SOURCE_ID, revision: sourceRevision }
          : { type: "set_target_sources", subjectId: TARGET_ID, targetVersion: 3 } };
    },
    async loadCourseAnchoredAnnotations(_courseId, options) {
      return { contract: "aralearn.course-anchored-annotation-page.v1", courseId: COURSE_ID,
        courseRevision, annotationSetVersion: 0, query: structuredClone(options.query),
        summary: { matchingTotal: 0, byOrigin: {}, byChannel: {}, byState: {}, unclassifiedTotal: 0 },
        items: [], hasMore: false, nextCursor: null };
    }
  };
  const root = new Root();
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
    courseRevision, mode: "target", targetKind: "plan_item", targetId: TARGET_ID,
    targetVersion: 3, targetLabel: "Alvo sintético com vínculo em rascunho" });
  return { root, panel, writes };
}

for (const failTargetRefresh of [false, true]) {
  test(`metadados da fonte preservam vínculo não salvo${failTargetRefresh ? " mesmo com falha na releitura" : " e sua identidade"}`, async () => {
    const { root, panel, writes } = harness({ failTargetRefresh });
    await panel.open();
    click(root, "add-target-source", { sourceId: SOURCE_ID });
    await settle();
    const linkId = root.innerHTML.match(/data-link-id="([^"]+)"/u)?.[1];
    assert.ok(linkId);
    assert.equal(panel.hasPendingDraft(), true);
    click(root, "open-source", { sourceId: SOURCE_ID });
    await settle();
    click(root, "edit-source");
    submitSource(root);
    await settle();
    assert.equal(writes.length, 1, "metadados não gravam automaticamente o vínculo");
    assert.equal(writes[0].command.type, "save_source");
    assert.equal(writes[0].command.expectedSourceRevision, 1);
    assert.equal(panel.hasPendingDraft(), true);
    if (failTargetRefresh) {
      assert.match(root.innerHTML, /alteração foi confirmada, mas a lista está desatualizada/iu);
    }
    click(root, "close-detail");
    if (failTargetRefresh) {
      assert.match(root.innerHTML, /data-source-action="retry-target"/u);
      click(root, "retry-target");
      await settle();
    }
    assert.equal(panel.hasPendingDraft(), true, "releitura/retry não transforma vínculo local em salvo");
    assert.match(root.innerHTML, new RegExp(`data-link-id="${linkId}"`, "u"));
    click(root, "save-target");
    await settle();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].expectedCourseRevision, 6);
    assert.equal(writes[1].command.type, "set_target_sources");
    assert.deepEqual(writes[1].command.sourceLinks, [{ linkId, sourceId: SOURCE_ID,
      relation: "supported_by", roles: ["technical_conceptual"], anchors: [], occurrences: [] }]);
    assert.equal(panel.hasPendingDraft(), false);
    panel.destroy();
  });
}
