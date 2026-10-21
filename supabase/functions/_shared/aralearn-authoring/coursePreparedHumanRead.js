import { AuthoringApiError } from './errors.js';
import { sha256Hex } from './security.js';
import { canonicalAuthoringValue } from '../aralearn/runtime/domain/courseAuthoringBasis.js';
import { resolveHumanCourseContext } from './courseHumanTaskExecutor.js';
import { decodeHumanReadContinuation, paginatePreparedHumanReadLiteral,
  preparePersistedHumanReadWindow } from './courseHumanReadContext.js';

// Bump when a change to the literal/projection makes old prepared reads invalid.
const REPRESENTATION = 'aralearn.prepared-human-read.v1';
const PERSISTED_TASK_METADATA = '__aralearnPreparedTask';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const changed = () => { throw new AuthoringApiError(409, 'human_read_context_changed',
  'A leitura preparada expirou ou mudou. Recomece a consulta; não combine trechos de leituras diferentes.'); };
async function fencedRead(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AuthoringApiError && error.code === 'stale_course_state') changed();
    throw error;
  }
}

async function requestHash(task, args) {
  const query = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'continuacao'));
  return sha256Hex(canonicalAuthoringValue({ representation: REPRESENTATION, task, query }));
}

async function materializationQueryHash(args) {
  const query = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'continuacao')
    .sort(([left], [right]) => left.localeCompare(right)));
  return sha256Hex(canonicalAuthoringValue({ task: 'preparar_materializacao', query }));
}

function eligible(name, args) {
  return name === 'exportar_autoria' || name === 'preparar_revisao' &&
    args.resumo !== true && args.comparacao === undefined || name === 'preparar_materializacao';
}

function minimalMaterializationContinuation(name, args) {
  return name === 'preparar_materializacao' && args.continuacao !== undefined &&
    !Object.hasOwn(args, 'unidades');
}

function preparedReadUnavailable() {
  throw new AuthoringApiError(503, 'prepared_read_unavailable',
    'A continuação preparada não está disponível; repita a preparação completa.');
}

// Called before the expensive handler. A resumed page needs one bounded RPC,
// even with a new adapter/process. The cursor never grants access by itself.
export async function openPreparedHumanRead({ adapter, principal, name, args, deadlineAt }) {
  const state = args.continuacao === undefined ? null : decodeHumanReadContinuation(args.continuacao);
  const minimal = minimalMaterializationContinuation(name, args);
  const supportsPreparedRead = typeof adapter?.getPreparedHumanReadStamp === 'function' &&
    typeof adapter?.savePreparedHumanRead === 'function' && typeof adapter?.readPreparedHumanRead === 'function';
  if (minimal && !supportsPreparedRead) preparedReadUnavailable();
  if (!eligible(name, args) || !supportsPreparedRead) return null;
  if (minimal && state?.s === undefined) changed();
  // A legacy full-argument cursor remains on the old in-memory path. Only a
  // cursor carrying a persisted read may omit the candidate safely.
  if (name === 'preparar_materializacao' && state && state.s === undefined) return null;
  let hash;
  if (state?.s !== undefined) {
    if (!UUID.test(state.s) || Object.keys(state).sort().join(',') !== 'c,h,o,p,q,r,s' ||
        !UUID.test(state.c) || !Number.isSafeInteger(state.r) || state.r < 1 ||
        !Number.isSafeInteger(state.o) || state.o <= 0 || state.o > 96 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/u.test(state.h) || !/^[a-f0-9]{64}$/u.test(state.q) ||
        !(state.p === null || typeof state.p === 'string' && state.p.length <= 240)) changed();
    if (name === 'preparar_materializacao') {
      const resolved = await resolveHumanCourseContext({ adapter, principal, course: args.curso, deadlineAt });
      if (resolved.course.id !== state.c || resolved.course.revision !== state.r) changed();
      hash = minimal ? state.q : await materializationQueryHash(args);
    } else {
      hash = await requestHash(name, args);
    }
    const read = await fencedRead(() => adapter.readPreparedHumanRead({ principal, readId: state.s, requestHash: hash,
      state, deadlineAt }));
    if (!read || read.readId !== state.s || read.courseId !== state.c || read.revision !== state.r ||
        read.digest !== state.h || read.queryHash !== state.q || read.page !== state.p) changed();
    const persistedTask = read.envelope?.[PERSISTED_TASK_METADATA];
    if ((persistedTask !== undefined && persistedTask !== name) || minimal && persistedTask !== name) changed();
    const { [PERSISTED_TASK_METADATA]: ignoredTask, ...publicEnvelope } = read.envelope ?? {};
    void ignoredTask;
    const context = await paginatePreparedHumanReadLiteral(preparePersistedHumanReadWindow(read),
      { state, nextPage: read.nextPage });
    return { response: { ...publicEnvelope, nextDecision: context.temMais
      ? publicEnvelope.nextDecision : read.finalNextDecision, context } };
  }
  const title = name === 'exportar_autoria' ? args.recorte?.curso : args.curso;
  // Let the normal argument validator report malformed titles.
  if (typeof title !== 'string') return null;
  const { course } = await resolveHumanCourseContext({ adapter, principal, course: title, deadlineAt });
  hash = name === 'preparar_materializacao'
    ? await materializationQueryHash(args)
    : await requestHash(name, args);
  const stamp = await adapter.getPreparedHumanReadStamp({ principal, courseId: course.id,
    expectedRevision: course.revision, deadlineAt });
  if (!stamp || stamp.courseId !== course.id || stamp.revision !== course.revision ||
      !/^[a-f0-9]{64}$/u.test(stamp.selectionFingerprint) ||
      !Number.isSafeInteger(stamp.generation) || stamp.generation < 0 ||
      !Number.isSafeInteger(stamp.annotationSetVersion) || stamp.annotationSetVersion < 0) changed();
  return { stamp, requestHash: hash, task: name };
}

export async function presentPersistedHumanRead({ adapter, principal, preparedRead, prepared, state,
  nextPage = null, envelope, finalNextDecision = null, deadlineAt }) {
  const chunks = [];
  for (let start = 0; start < prepared.literal.length;) {
    let end = Math.min(start + 12_000, prepared.literal.length);
    if (end < prepared.literal.length && /[\uD800-\uDBFF]/u.test(prepared.literal[end - 1])) end--;
    chunks.push(prepared.literal.slice(start, end));
    start = end;
  }
  const readId = crypto.randomUUID();
  const persistedEnvelope = { ...envelope, [PERSISTED_TASK_METADATA]: preparedRead?.task ?? null };
  const saved = await fencedRead(() => adapter.savePreparedHumanRead({ principal, readId, ...preparedRead,
    digest: prepared.digest, state: { ...state, o: 0, h: null }, chunks, nextPage,
    envelope: persistedEnvelope, finalNextDecision, deadlineAt }));
  if (saved?.readId !== readId || saved.digest !== prepared.digest ||
      saved.total !== prepared.literal.length) changed();
  const context = await paginatePreparedHumanReadLiteral(prepared, { state: { ...state, s: readId }, nextPage });
  return { ...envelope, nextDecision: context.temMais ? envelope.nextDecision : finalNextDecision, context };
}
