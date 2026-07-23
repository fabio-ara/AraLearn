import {
  microsequenceFragmentToRelationalRows
} from "../aralearn/runtime/persistence/contractToRelationalRows.js";
import {
  relationalRowsToContract,
  relationalRowsToMicrosequenceFragment
} from "../aralearn/runtime/persistence/relationalRowsToContract.js";
import { canonicalCourseHash } from "../aralearn/runtime/persistence/canonicalCourseHash.js";
import { listResourceGapFields } from "../aralearn/runtime/core/resourceGaps.js";
import { parseTextGapTokens } from "../aralearn/runtime/core/textGaps.js";
import { AuthoringApiError } from "./errors.js";

const PATCH_STORES = Object.freeze([
  "cards", "blocks", "options", "nodes", "flowNodes", "flowCases",
  "flowPractices", "flowPracticeEntries", "flowPracticeOptions",
  "flowPracticeVariants", "flowShapeOptions", "edges", "matrixItems",
  "cells", "points", "lines", "highlights", "cardSources", "cardTopics"
]);

function clone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function asRows(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([store, rows]) => [
      store,
      Array.isArray(rows) ? rows.map(clone) : []
    ])
  );
}

function uuidFactory() {
  return globalThis.crypto.randomUUID();
}

function pathParts(path) {
  const result = [];
  String(path || "").replace(/([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]/gu, (_, key, index) => {
    result.push(key ?? Number(index));
    return "";
  });
  return result;
}

function setAtPath(root, path, value) {
  const parts = pathParts(path);
  if (!parts.length) return;
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor?.[parts[index]];
    if (cursor == null) {
      throw new AuthoringApiError(
        422,
        "revision_fragment_invalid",
        `O alvo ${path} não existe no fragmento persistido.`
      );
    }
  }
  cursor[parts.at(-1)] = value;
}

function allocateGapId(nextId, preferred = "") {
  const preferredId = String(preferred || "").trim();
  if (preferredId && !nextId.used.has(preferredId)) {
    nextId.used.add(preferredId);
    return preferredId;
  }
  let id;
  do {
    id = `gap-${nextId.value++}`;
  } while (nextId.used.has(id));
  nextId.used.add(id);
  return id;
}

function replaceTokens(
  source,
  tokens,
  gapDefinitions,
  nextId,
  assignments = null
) {
  let result = String(source ?? "");
  [...tokens].reverse().forEach((token) => {
    const id = allocateGapId(nextId);
    gapDefinitions.push({
      id,
      response: token.hasOptions ? "choice" : "text",
      answer: token.answer,
      ...(token.acceptedAnswers.length
        ? { acceptedAnswers: token.acceptedAnswers }
        : {}),
      ...(token.distractors.length ? { distractors: token.distractors } : {})
    });
    assignments?.unshift({ id, raw: token.raw });
    result = `${result.slice(0, token.start)}{gap:${id}}${result.slice(token.end)}`;
  });
  return result;
}

function formulaRevisionGroups(resource) {
  if (resource?.resource === "formula") {
    return [{
      prefix: "",
      accessibleTextPath: "accessibleText",
      assignments: []
    }];
  }
  if (resource?.resource !== "composite") return [];
  return (Array.isArray(resource.blocks) ? resource.blocks : [])
    .flatMap((block, index) => (
      block?.kind === "formula"
        ? [{
          prefix: `blocks[${index}].`,
          accessibleTextPath: `blocks[${index}].accessibleText`,
          assignments: []
        }]
        : []
    ));
}

function replaceFormulaAccessibleText(result, group) {
  const accessibleText = pathParts(group.accessibleTextPath).reduce(
    (value, part) => value?.[part],
    result
  );
  const mirrorTokens = parseTextGapTokens(accessibleText);
  if (
    mirrorTokens.length !== group.assignments.length
    || mirrorTokens.some(
      (token, index) => token.raw !== group.assignments[index]?.raw
    )
  ) {
    throw new AuthoringApiError(
      422,
      "revision_fragment_invalid",
      `O espelho acessível ${group.accessibleTextPath} diverge da fórmula persistida.`
    );
  }
  let formalText = String(accessibleText ?? "");
  [...mirrorTokens].reverse().forEach((token, indexFromEnd) => {
    const assignmentIndex = mirrorTokens.length - indexFromEnd - 1;
    const id = group.assignments[assignmentIndex].id;
    formalText = `${formalText.slice(0, token.start)}{gap:${id}}${
      formalText.slice(token.end)
    }`;
  });
  setAtPath(result, group.accessibleTextPath, formalText);
}

function listFlowRevisionFields(structure, path = "structure", result = []) {
  if (!structure || typeof structure !== "object" || Array.isArray(structure)) {
    return result;
  }
  const kind = String(structure.kind || "");
  if (["start", "end", "input", "output", "process"].includes(kind)) {
    result.push({
      owner: structure,
      key: "text",
      path: `${path}.text`,
      value: structure.text
    });
  } else if (
    ["if_then", "if_then_else", "while", "do_while", "for"].includes(kind)
  ) {
    result.push({
      owner: structure,
      key: "condition",
      path: `${path}.condition`,
      value: structure.condition
    });
  }
  ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach(
    (fieldName) => {
      (Array.isArray(structure[fieldName]) ? structure[fieldName] : []).forEach(
        (item, index) => {
          listFlowRevisionFields(
            item,
            `${path}.${fieldName}[${index}]`,
            result
          );
        }
      );
    }
  );
  if (kind === "if_chain") {
    (Array.isArray(structure.cases) ? structure.cases : []).forEach(
      (caseValue, index) => {
        result.push({
          owner: caseValue,
          key: "condition",
          path: `${path}.cases[${index}].condition`,
          value: caseValue?.condition
        });
        (Array.isArray(caseValue?.thenBranch) ? caseValue.thenBranch : [])
          .forEach((item, itemIndex) => {
            listFlowRevisionFields(
              item,
              `${path}.cases[${index}].thenBranch[${itemIndex}]`,
              result
            );
          });
      }
    );
  }
  if (kind === "switch_case") {
    (Array.isArray(structure.cases) ? structure.cases : []).forEach(
      (caseValue, index) => {
        (Array.isArray(caseValue?.body) ? caseValue.body : []).forEach(
          (item, itemIndex) => {
            listFlowRevisionFields(
              item,
              `${path}.cases[${index}].body[${itemIndex}]`,
              result
            );
          }
        );
      }
    );
  }
  return result;
}

function flowRevisionFields(resource) {
  if (resource?.resource === "flow") {
    return listFlowRevisionFields(resource.structure);
  }
  if (resource?.resource !== "composite") return [];
  return (Array.isArray(resource.blocks) ? resource.blocks : []).flatMap(
    (block, index) => (
      block?.kind === "flow"
        ? listFlowRevisionFields(
          block.structure,
          `blocks[${index}].structure`
        )
        : []
    )
  );
}

function flowEntryValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? String(value.value ?? "")
    : String(value ?? "");
}

function compilerGapId(entry, answer) {
  const options = Array.isArray(entry?.options) ? entry.options : [];
  if (entry?.mode === "choice" && options.length > 1) {
    const answerOption = options.find(
      (option) => flowEntryValue(option) === answer
    );
    const match = String(answerOption?.id || "").match(/^gap-(.+)-answer$/u);
    if (!match) return null;
    const gapId = match[1];
    const generatedIds = options.every((option) => {
      const id = String(option?.id || "");
      return id === `gap-${gapId}-answer`
        || new RegExp(`^gap-${gapId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}-distractor-\\d+$`, "u")
          .test(id);
    });
    return generatedIds ? gapId : null;
  }
  const variants = Array.isArray(entry?.variants) ? entry.variants : [];
  if (variants.length) {
    if (variants.some((variant) => variant?.regex === true)) return null;
    const firstMatch = String(variants[0]?.id || "")
      .match(/^gap-(.+)-accepted-1$/u);
    if (!firstMatch) return null;
    const gapId = firstMatch[1];
    return variants.every((variant, index) =>
      String(variant?.id || "") === `gap-${gapId}-accepted-${index + 1}`
    )
      ? gapId
      : null;
  }
  return entry === true
    || (
      entry
      && typeof entry === "object"
      && !Array.isArray(entry)
      && entry.blank === true
      && !entry.mode
    )
    ? ""
    : null;
}

function decompileFlowPractice(entry, gapDefinitions, nextId) {
  const practice = entry.owner?.practice;
  if (!practice || !Object.hasOwn(practice, "text")) return false;
  const textPractice = practice.text;
  const answer = String(entry.owner?.[entry.key] ?? "");
  const preferredId = compilerGapId(textPractice, answer);
  if (preferredId === null) return false;
  const id = allocateGapId(nextId, preferredId);
  const options = Array.isArray(textPractice?.options)
    ? textPractice.options.map(flowEntryValue)
    : [];
  const variants = Array.isArray(textPractice?.variants)
    ? textPractice.variants.map(flowEntryValue)
    : [];
  const isChoice = textPractice?.mode === "choice" && options.length > 1;
  gapDefinitions.push({
    id,
    response: isChoice ? "choice" : "text",
    answer,
    ...(isChoice
      ? { distractors: options.filter((value) => value !== answer) }
      : variants.length
        ? { acceptedAnswers: variants.filter((value) => value !== answer) }
        : {})
  });
  entry.owner[entry.key] = `{gap:${id}}`;
  const remainingPractice = { ...practice };
  delete remainingPractice.text;
  if (Object.keys(remainingPractice).length) {
    entry.owner.practice = remainingPractice;
  } else {
    delete entry.owner.practice;
  }
  return true;
}

function decompileResourceGaps(resource, nextId) {
  const result = clone(resource);
  const gaps = [];
  const formulaGroups = formulaRevisionGroups(result);
  listResourceGapFields(result).forEach((entry) => {
    const tokens = parseTextGapTokens(entry.value);
    if (!tokens.length) return;
    const formulaGroup = formulaGroups.find((group) =>
      entry.path.startsWith(`${group.prefix}expression`)
    );
    setAtPath(result, entry.path, replaceTokens(
      entry.value,
      tokens,
      gaps,
      nextId,
      formulaGroup?.assignments
    ));
  });
  formulaGroups
    .filter((group) => group.assignments.length)
    .forEach((group) => replaceFormulaAccessibleText(result, group));
  flowRevisionFields(result).forEach((entry) => {
    const tokens = parseTextGapTokens(entry.value);
    if (tokens.length) {
      if (entry.owner?.practice?.text) {
        throw new AuthoringApiError(
          422,
          "revision_fragment_invalid",
          `O campo ${entry.path} combina duas representações de prática.`
        );
      }
      entry.owner[entry.key] = replaceTokens(
        entry.value,
        tokens,
        gaps,
        nextId
      );
      return;
    }
    decompileFlowPractice(entry, gaps, nextId);
  });
  if (gaps.length) result.gaps = gaps;
  return result;
}

export function decompileCourseRevisionFragment(compiledFragment) {
  const result = clone(compiledFragment);
  const nextId = { value: 1, used: new Set() };
  result.microsequences = result.microsequences.map((microsequence) => ({
    ...microsequence,
    cards: microsequence.cards.map((card) => decompileResourceGaps(card, nextId))
  }));
  return result;
}

function compiledFragmentFromRows(rows, context) {
  return {
    courseId: context.course.contractKey,
    moduleId: context.module.contractKey,
    lessonId: context.lesson.contractKey,
    microsequences: [
      relationalRowsToMicrosequenceFragment(
        rows,
        context.microsequence.id,
        { validate: true }
      )
    ]
  };
}

function valueKey(value) {
  return value == null ? "" : String(value);
}

function translated(idMap, id) {
  return id == null ? "" : valueKey(idMap.get(id) || id);
}

function rowMatchKey(store, row, idMap, actual = false) {
  const ref = (value) => actual ? valueKey(value) : translated(idMap, value);
  switch (store) {
    case "cards":
      return valueKey(row.contractKey);
    case "blocks":
      return [ref(row.cardId), row.region, row.position].join("|");
    case "options":
      return [ref(row.blockId), row.contractKey].join("|");
    case "nodes":
      return [ref(row.blockId), row.nodeScope, row.contractKey].join("|");
    case "edges":
      return [ref(row.blockId), row.edgeScope, row.position].join("|");
    case "matrixItems":
      return [ref(row.blockId), row.position].join("|");
    case "cells":
      return [
        ref(row.blockId), ref(row.matrixItemId), row.cellKind,
        row.rowIndex, row.columnIndex
      ].join("|");
    case "points":
      return [ref(row.blockId), row.pointRole || row.pointKind, row.position].join("|");
    case "lines":
      return [ref(row.blockId), row.lineRole || row.lineKind, row.position].join("|");
    case "highlights":
      return [
        ref(row.blockId), ref(row.matrixItemId), row.selectionType, row.position
      ].join("|");
    case "cardSources":
    case "cardTopics":
      return [ref(row.cardId), row.position].join("|");
    case "flowNodes":
      return [
        ref(row.blockId), ref(row.parentNodeId), ref(row.parentCaseId),
        row.branch, row.position, row.nodeKind, row.contractKey
      ].join("|");
    case "flowCases":
      return [ref(row.flowNodeId), row.position, row.caseKind, row.contractKey].join("|");
    case "flowPractices":
      return [row.ownerType, ref(row.ownerId)].join("|");
    case "flowPracticeEntries":
      return [
        ref(row.practiceId), row.entryKind, row.labelKey, row.position
      ].join("|");
    case "flowPracticeOptions":
    case "flowPracticeVariants":
      return [ref(row.entryId), row.position].join("|");
    case "flowShapeOptions":
      return [ref(row.practiceId), row.position].join("|");
    default:
      return valueKey(row.id);
  }
}

function alignStore(store, generated, actual, identityMap, idMap) {
  const available = [...actual];
  let pending = [...generated];
  for (let pass = 0; pass < 12 && pending.length; pass += 1) {
    const next = [];
    pending.forEach((row) => {
      const key = rowMatchKey(store, row, idMap, false);
      const index = available.findIndex(
        (candidate) => rowMatchKey(store, candidate, idMap, true) === key
      );
      if (index < 0) {
        next.push(row);
        return;
      }
      const [candidate] = available.splice(index, 1);
      identityMap.set(row.identityKey, candidate.id);
      idMap.set(row.id, candidate.id);
    });
    if (next.length === pending.length) break;
    pending = next;
  }
}

function buildIdentityMap(currentFragment, currentRows, context) {
  const identityMap = new Map();
  const generated = microsequenceFragmentToRelationalRows(currentFragment.microsequences[0], {
    courseId: context.course.id,
    lessonId: context.lesson.id,
    courseContractKey: context.course.contractKey,
    moduleContractKey: context.module.contractKey,
    lessonContractKey: context.lesson.contractKey,
    uuidFactory
  });
  const idMap = new Map();
  const micro = generated.microsequences[0];
  const actualMicro = currentRows.microsequences?.[0];
  if (micro && actualMicro) {
    identityMap.set(micro.identityKey, actualMicro.id);
    idMap.set(micro.id, actualMicro.id);
  }
  const orderedStores = [
    "cards", "blocks", "options", "nodes", "matrixItems", "cells", "points",
    "lines", "highlights", "edges", "cardSources", "cardTopics",
    "flowNodes", "flowCases", "flowNodes", "flowPractices",
    "flowPracticeEntries", "flowPracticeOptions", "flowPracticeVariants",
    "flowShapeOptions"
  ];
  orderedStores.forEach((store) => {
    alignStore(store, generated[store] || [], currentRows[store] || [], identityMap, idMap);
  });
  return identityMap;
}

function stripTechnical(row) {
  const result = clone(row);
  delete result.identityKey;
  delete result.updatedAt;
  delete result.deletedAt;
  return result;
}

function patchRowsFor(fragment, currentFragment, currentRows, context) {
  const identityMap = buildIdentityMap(currentFragment, currentRows, context);
  const mapped = microsequenceFragmentToRelationalRows(fragment.microsequences[0], {
    courseId: context.course.id,
    lessonId: context.lesson.id,
    courseContractKey: context.course.contractKey,
    moduleContractKey: context.module.contractKey,
    lessonContractKey: context.lesson.contractKey,
    identityMap,
    uuidFactory
  });
  return Object.fromEntries(PATCH_STORES.map((store) => [
    store,
    (mapped[store] || []).map(stripTechnical)
  ]));
}

function rowMap(rows) {
  return new Map(
    PATCH_STORES.flatMap((store) =>
      (rows[store] || []).map((row) => [`${store}:${row.id}`, stripTechnical(row)])
    )
  );
}

function objectFieldDiff(previous, next) {
  const fields = [...new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])]
    .sort()
    .filter((field) => JSON.stringify(previous?.[field]) !== JSON.stringify(next?.[field]));
  return Object.fromEntries(fields.map((field) => [
    field,
    { before: previous?.[field] ?? null, after: next?.[field] ?? null }
  ]));
}

export function buildScopedRevisionDiff(currentRows, patchRows) {
  const before = rowMap(currentRows);
  const after = rowMap(patchRows);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = keys.flatMap((key) => {
    const previous = before.get(key);
    const next = after.get(key);
    if (!previous) return [{ entity: key, operation: "insert", after: next }];
    if (!next) return [{ entity: key, operation: "delete", before: previous }];
    const fields = objectFieldDiff(previous, next);
    return Object.keys(fields).length
      ? [{ entity: key, operation: "update", fields }]
      : [];
  });
  return {
    scope: "microsequence",
    changedEntityCount: changes.length,
    changes
  };
}

function assertSameArray(name, previous, next) {
  if (JSON.stringify(previous ?? []) !== JSON.stringify(next ?? [])) {
    throw new AuthoringApiError(
      422,
      "revision_scope_violation",
      `A correção pontual não pode alterar ${name}.`
    );
  }
}

export function assertCourseRevisionScope(current, next, context) {
  if (next.courseId !== current.courseId
     || next.moduleId !== current.moduleId
     || next.lessonId !== current.lessonId
     || next.courseId !== context.course.contractKey
     || next.moduleId !== context.module.contractKey
     || next.lessonId !== context.lesson.contractKey
     || next.microsequences.length !== 1) {
    throw new AuthoringApiError(
      422,
      "revision_scope_violation",
      "A correção deve conservar curso, módulo, lição e uma única microssequência."
    );
  }
  const previousMicro = current.microsequences[0];
  const nextMicro = next.microsequences[0];
  for (const field of ["id", "title", "goal", "role", "status", "branchOf"]) {
    if ((previousMicro[field] ?? null) !== (nextMicro[field] ?? null)) {
      throw new AuthoringApiError(
        422,
        "revision_scope_violation",
        `A correção de cards não pode alterar microsequences[0].${field}.`
      );
    }
  }
  for (const field of ["dependsOn", "covers", "checks", "errors"]) {
    assertSameArray(`microsequences[0].${field}`, previousMicro[field], nextMicro[field]);
  }
}

function mergePatchIntoDocumentRows(fullRows, currentRows, patchRows) {
  const result = asRows(fullRows);
  PATCH_STORES.forEach((store) => {
    const removedIds = new Set((currentRows[store] || []).map((row) => row.id));
    result[store] = [
      ...(result[store] || []).filter((row) => !removedIds.has(row.id)),
      ...(patchRows[store] || []).map(clone)
    ];
  });
  return result;
}

export async function prepareCourseContentRevision({
  formalFragment,
  compiledFragment,
  currentFragmentPayload,
  fullDocumentRows
}) {
  const currentRows = asRows(currentFragmentPayload.rows);
  const currentCompiled = compiledFragmentFromRows(
    currentRows,
    currentFragmentPayload.context
  );
  const currentFormal = decompileCourseRevisionFragment(currentCompiled);
  assertCourseRevisionScope(currentFormal, formalFragment, currentFragmentPayload.context);
  const relationalPatch = patchRowsFor(
    compiledFragment,
    currentCompiled,
    currentRows,
    currentFragmentPayload.context
  );
  const diff = buildScopedRevisionDiff(currentRows, relationalPatch);
  const mergedRows = mergePatchIntoDocumentRows(
    fullDocumentRows,
    currentRows,
    relationalPatch
  );
  const project = relationalRowsToContract(mergedRows, { validate: true });
  const expectedContentHash = await canonicalCourseHash(project.courses[0]);
  return {
    currentFormal,
    relationalPatch,
    diff,
    expectedContentHash
  };
}

export function buildCourseContentRevisionFragment(payload) {
  const revision = { ...payload };
  const rows = asRows(revision.rows);
  const persistedAuthoringFragment = revision.authoringFragment;
  delete revision.rows;
  delete revision.compiledFragment;
  delete revision.authoringFragment;
  const compiledFragment = compiledFragmentFromRows(rows, payload.context);
  return {
    ...revision,
    authoringFragment: persistedAuthoringFragment
      || decompileCourseRevisionFragment(compiledFragment)
  };
}

export { PATCH_STORES };
