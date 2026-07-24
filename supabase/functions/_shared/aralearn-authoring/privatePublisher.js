import {
  deterministicRequestUuid,
  prepareCourseDocument
} from "./canonical.js";
import { AuthoringApiError } from "./errors.js";
import { OFFICIAL_IMPORT_STORES } from "./officialPublisher.js";

const CHUNK_SIZE = 200;

function countRows(rows) {
  return Object.fromEntries(
    OFFICIAL_IMPORT_STORES.map((storeName) => [storeName, rows[storeName]?.length || 0])
  );
}

async function importOperations(prepared, {
  runId,
  actorId,
  clientId
}) {
  const courseId = prepared.rows.courses[0].id;
  const importId = await deterministicRequestUuid(
    `private-import:${runId}:${courseId}:${prepared.contentHash}`
  );
  const identity = {
    p_import_id: importId,
    p_run_id: runId,
    p_actor_id: actorId,
    p_client_id: clientId
  };
  const operations = [{
    kind: "begin",
    functionName: "begin_authoring_private_course_import",
    payload: {
      ...identity,
      p_course: prepared.rows.courses[0],
      p_source_hash: prepared.contentHash,
      p_expected_counts: countRows(prepared.rows)
    }
  }];

  for (const storeName of OFFICIAL_IMPORT_STORES) {
    const rows = prepared.rows[storeName] || [];
    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      operations.push({
        kind: "chunk",
        functionName: "apply_authoring_private_course_import_chunk",
        payload: {
          ...identity,
          p_store_name: storeName,
          p_chunk_index: Math.floor(offset / CHUNK_SIZE),
          p_rows: rows.slice(offset, offset + CHUNK_SIZE)
        }
      });
    }
  }
  operations.push({
    kind: "finalize",
    functionName: "finalize_authoring_private_course_import",
    payload: identity
  });
  return { importId, operations };
}

export async function materializePrivateDocumentStep(document, {
  rpc,
  runId,
  actorId,
  clientId = null,
  step = 0,
  maxOperations = 2,
  prepared = null,
  deferFinalize = false
}) {
  if (typeof rpc !== "function") {
    throw new TypeError("A materialização privada exige um executor RPC.");
  }
  const normalized = prepared || await prepareCourseDocument(document, {
    requireReady: true,
    identityNamespace: runId
  });
  const { importId, operations } = await importOperations(normalized, {
    runId,
    actorId,
    clientId
  });
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
      return {
        status: "published",
        publication: result,
        nextStep: operations.length,
        totalSteps: operations.length
      };
    }
    if (operation.kind === "finalize") {
      if (result?.status !== "published") {
        throw new AuthoringApiError(
          502,
          "materialization_not_confirmed",
          "O banco não confirmou a criação do curso privado."
        );
      }
      return {
        status: "published",
        publication: result,
        nextStep,
        totalSteps: operations.length
      };
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
