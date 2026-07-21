import { deterministicImportId, prepareCourseDocument } from "./canonical.js";
import { AuthoringApiError } from "./errors.js";

export const OFFICIAL_IMPORT_STORES = Object.freeze([
  "modules", "lessons", "guides", "guideItems", "topics", "topicStatements",
  "microsequences", "dependencies", "microsequenceStatements", "cards", "blocks", "options",
  "nodes", "flowNodes", "flowCases", "flowPractices", "flowPracticeEntries",
  "flowPracticeOptions", "flowPracticeVariants", "flowShapeOptions", "edges", "matrixItems",
  "cells", "points", "lines", "highlights", "cardSources", "cardTopics"
]);

const CHUNK_SIZE = 200;

function countRows(rows) {
  return Object.fromEntries(
    OFFICIAL_IMPORT_STORES.map((storeName) => [storeName, rows[storeName]?.length || 0])
  );
}

function flowOperations(importId, rows) {
  const nodesByBlock = new Map();
  const casesByBlock = new Map();
  for (const node of rows.flowNodes || []) {
    const blockId = String(node.blockId || "");
    if (!nodesByBlock.has(blockId)) nodesByBlock.set(blockId, []);
    nodesByBlock.get(blockId).push(node);
  }
  for (const flowCase of rows.flowCases || []) {
    const blockId = String(flowCase.blockId || "");
    if (!casesByBlock.has(blockId)) casesByBlock.set(blockId, []);
    casesByBlock.get(blockId).push(flowCase);
  }
  return [...new Set([...nodesByBlock.keys(), ...casesByBlock.keys()])].sort().map(
    (blockId, chunkIndex) => {
    const nodes = nodesByBlock.get(blockId) || [];
    if (!nodes.length) {
      throw new AuthoringApiError(
        422,
        "invalid_flow",
        `O fluxograma ${blockId || "sem bloco"} contém casos sem nós.`
      );
    }
      return {
        kind: "flowChunk",
        functionName: "apply_official_course_import_flow_chunk",
        payload: {
          p_import_id: importId,
          p_chunk_index: chunkIndex,
          p_nodes: nodes,
          p_cases: casesByBlock.get(blockId) || []
        }
      };
    }
  );
}

function importOperations(prepared, importId, authoring = null) {
  const operations = [{
    kind: "begin",
    functionName: authoring
      ? "begin_authoring_official_course_import"
      : "begin_official_course_import",
    payload: authoring ? {
      p_import_id: importId,
      p_run_id: authoring.runId,
      p_course: prepared.rows.courses[0],
      p_source_hash: prepared.contentHash,
      p_expected_counts: countRows(prepared.rows)
    } : {
      p_import_id: importId,
      p_course: prepared.rows.courses[0],
      p_source_hash: prepared.contentHash,
      p_expected_counts: countRows(prepared.rows),
      p_publish: true
    }
  }];
  for (const storeName of OFFICIAL_IMPORT_STORES) {
    if (storeName === "flowNodes") {
      const flowChunks = flowOperations(importId, prepared.rows);
      operations.push({
        kind: "flowBegin",
        functionName: "begin_official_course_import_flow",
        payload: { p_import_id: importId },
        skip: flowChunks.length
      });
      operations.push(...flowChunks);
      continue;
    }
    if (storeName === "flowCases") continue;
    const rows = prepared.rows[storeName] || [];
    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      operations.push({
        kind: "chunk",
        functionName: "apply_official_course_import_chunk",
        payload: {
          p_import_id: importId,
          p_store_name: storeName,
          p_chunk_index: Math.floor(offset / CHUNK_SIZE),
          p_rows: rows.slice(offset, offset + CHUNK_SIZE)
        }
      });
    }
  }
  operations.push({
    kind: "finalize",
    functionName: authoring
      ? "finalize_authoring_official_course_import"
      : "finalize_official_course_import",
    payload: authoring
      ? { p_import_id: importId, p_run_id: authoring.runId }
      : { p_import_id: importId }
  });
  return operations;
}

export async function publishOfficialDocumentStep(document, {
  rpc,
  step = 0,
  maxOperations = 20,
  prepared = null,
  authoring = null,
  deferFinalize = false
}) {
  if (typeof rpc !== "function") {
    throw new TypeError("A publicação oficial exige um executor RPC.");
  }
  const normalized = prepared
    || await prepareCourseDocument(document, { official: true, requireReady: true });
  const importId = await deterministicImportId(normalized.course.id, normalized.contentHash);
  const operations = importOperations(normalized, importId, authoring);
  let nextStep = Math.max(0, Number.isInteger(step) ? step : 0);
  let executed = 0;
  while (nextStep < operations.length && executed < maxOperations) {
    const operation = operations[nextStep];
    if (deferFinalize && operation.kind === "finalize") {
      return {
        status: "finalizing",
        importId,
        courseId: normalized.rows.courses[0].id,
        nextStep,
        totalSteps: operations.length,
        percent: 99,
        finalizeOperation: operation
      };
    }
    const result = await rpc(operation.functionName, operation.payload);
    executed += 1;
    nextStep += 1;
    if (operation.kind === "begin" && result?.status === "published") {
      if (authoring && result?.runFinalized !== true) {
        throw new AuthoringApiError(
          502,
          "authoring_run_not_finalized",
          "O curso já existe, mas a execução de autoria não foi concluída pelo banco."
        );
      }
      return { status: "published", publication: result, nextStep: operations.length, totalSteps: operations.length };
    }
    if (operation.kind === "flowBegin" && result?.status === "complete") {
      nextStep += operation.skip;
    }
    if (operation.kind === "finalize") {
      if (result?.status !== "published") {
        throw new AuthoringApiError(
          502,
          "publication_not_confirmed",
          "O banco não confirmou a publicação do curso."
        );
      }
      return { status: "published", publication: result, nextStep, totalSteps: operations.length };
    }
  }
  return {
    status: "publishing",
    importId,
    courseId: normalized.rows.courses[0].id,
    nextStep,
    totalSteps: operations.length,
    percent: Math.min(99, Math.floor((nextStep / operations.length) * 100))
  };
}

export async function publishOfficialDocument(document, { rpc }) {
  let step = 0;
  for (;;) {
    const result = await publishOfficialDocumentStep(document, {
      rpc,
      step,
      maxOperations: 20
    });
    if (result.status === "published") return result.publication;
    if (result.nextStep <= step) {
      throw new AuthoringApiError(500, "publication_stalled", "A publicação não avançou.");
    }
    step = result.nextStep;
  }
}
