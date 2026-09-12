import { normalizeCourseSourcesRead } from "../domain/courseSources.js";
import { resolveCourseSourceOccurrences } from "../domain/courseSourceOccurrences.js";
import { formatCourseSourceReference } from "../domain/courseSourceReference.js";

function changed() {
  return Object.assign(new Error("O conteúdo ou suas fontes mudaram. Releia esta unidade."), {
    code: "course_revision_changed", status: 409
  });
}

/** Cache privado desta sequência: documentos sem contexto de outro alvo. */
export function createCourseInspectionCitations({ controller }) {
  const sources = new Map();
  let epoch = 0;
  async function read(courseId, courseRevision, query, expectedEpoch) {
    const value = normalizeCourseSourcesRead(await controller.loadCourseSources(courseId, {
      ...query, expectedRevision: courseRevision
    }));
    if (epoch !== expectedEpoch || value.courseId !== courseId || value.courseRevision !== courseRevision ||
        value.mode !== query.mode || value.query.sourceId !== (query.sourceId ?? null) ||
        value.query.targetKind !== (query.targetKind ?? null) || value.query.targetId !== (query.targetId ?? null)) throw changed();
    return value;
  }
  async function source(courseId, courseRevision, sourceId, expectedEpoch) {
    const key = JSON.stringify([courseId, courseRevision, sourceId]);
    if (!sources.has(key)) {
      const pending = read(courseId, courseRevision, { mode: "source", sourceId }, expectedEpoch).then(value => {
        if (value.items.length !== 1 || value.items[0].sourceId !== sourceId) throw changed();
        return value;
      });
      sources.set(key, pending);
      void pending.catch(() => { if (sources.get(key) === pending) sources.delete(key); });
    }
    const value = await sources.get(key);
    if (epoch !== expectedEpoch) throw changed();
    return value;
  }
  return {
    clear() { ++epoch; sources.clear(); },
    async load({ courseId, courseRevision, studyUnitId, studyUnitVersion, studyUnit }) {
      const expectedEpoch = epoch;
      if (studyUnit?.id !== studyUnitId || !Number.isSafeInteger(studyUnitVersion) || studyUnitVersion < 1) throw changed();
      const items = [], cursors = new Set();
      let cursor = null, bibliographyStyle = null;
      do {
        const page = await read(courseId, courseRevision, { mode: "target", targetKind: "study_unit",
          targetId: studyUnitId, ...(cursor ? { cursor } : {}) }, expectedEpoch);
        if (bibliographyStyle && bibliographyStyle !== page.bibliographyStyle) throw changed();
        bibliographyStyle = page.bibliographyStyle;
        items.push(...page.items);
        if (items.length > 1) throw changed();
        cursor = page.nextCursor;
        if (cursor && (cursors.has(cursor) || cursors.size >= 128)) throw changed();
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const attribution = items[0];
      if (attribution && (attribution.targetKind !== "study_unit" || attribution.targetId !== studyUnitId ||
          attribution.targetVersion !== studyUnitVersion)) throw changed();
      const formattedReferences = {};
      const citations = await Promise.all((attribution?.sourceLinks ?? []).map(async link => {
        const page = await source(courseId, courseRevision, link.sourceId, expectedEpoch);
        if (page.bibliographyStyle !== bibliographyStyle) throw changed();
        const document = page.items[0];
        const anchors = link.anchors.map(({ anchorId }) => document.anchors.find(anchor => anchor.anchorId === anchorId));
        if (anchors.some(anchor => !anchor)) throw changed();
        formattedReferences[link.linkId] = await formatCourseSourceReference(document, { style: bibliographyStyle });
        return { ...document, ...link, sourceRevision: document.revision,
          anchors, attachments: document.status === "active" ? document.attachments : [],
          occurrences: resolveCourseSourceOccurrences(studyUnit, link.occurrences) };
      }));
      if (epoch !== expectedEpoch) throw changed();
      return { value: { courseId, courseRevision, studyUnitId, bibliographyStyle, citations }, formattedReferences };
    }
  };
}
