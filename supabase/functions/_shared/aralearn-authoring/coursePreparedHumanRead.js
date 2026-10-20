import { AuthoringApiError } from './errors.js';
import { sha256Hex } from './security.js';
import { canonicalAuthoringValue } from '../aralearn/runtime/domain/courseAuthoringBasis.js';
import { resolveHumanCourseContext } from './courseHumanTaskExecutor.js';
import { decodeHumanReadContinuation, paginatePreparedHumanReadLiteral,
  preparePersistedHumanReadWindow } from './courseHumanReadContext.js';

// Bump when a change to the literal/projection makes old prepared reads invalid.
const REPRESENTATION = 'aralearn.prepared-human-read.v1';
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

function eligible(name, args) {
  return name === 'exportar_autoria' || name === 'preparar_revisao' &&
    args.resumo !== true && args.comparacao === undefined;
}

// Called before the expensive handler. A resumed page needs one bounded RPC,
// even with a new adapter/process. The cursor never grants access by itself.
export async function openPreparedHumanRead({ adapter, principal, name, args, deadlineAt }) {
  if (!eligible(name, args) || typeof adapter?.getPreparedHumanReadStamp !== 'function' ||
      typeof adapter?.savePreparedHumanRead !== 'function' || typeof adapter?.readPreparedHumanRead !== 'function') return null;
  const hash = await requestHash(name, args);
  const state = args.continuacao === undefined ? null : decodeHumanReadContinuation(args.continuacao);
  if (state?.s !== undefined) {
    if (!UUID.test(state.s) || Object.keys(state).sort().join(',') !== 'c,h,o,p,q,r,s' ||
        !UUID.test(state.c) || !Number.isSafeInteger(state.r) || state.r < 1 ||
        !Number.isSafeInteger(state.o) || state.o <= 0 || state.o > 96 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/u.test(state.h) || !/^[a-f0-9]{64}$/u.test(state.q) ||
        !(state.p === null || typeof state.p === 'string' && state.p.length <= 240)) changed();
    const read = await fencedRead(() => adapter.readPreparedHumanRead({ principal, readId: state.s, requestHash: hash,
      state, deadlineAt }));
    if (!read || read.readId !== state.s || read.courseId !== state.c || read.revision !== state.r ||
        read.digest !== state.h || read.queryHash !== state.q || read.page !== state.p) changed();
    const context = await paginatePreparedHumanReadLiteral(preparePersistedHumanReadWindow(read),
      { state, nextPage: read.nextPage });
    return { response: { ...read.envelope, nextDecision: context.temMais
      ? read.envelope.nextDecision : read.finalNextDecision, context } };
  }
  const title = name === 'exportar_autoria' ? args.recorte?.curso : args.curso;
  // Let the normal argument validator report malformed titles.
  if (typeof title !== 'string') return null;
  const { course } = await resolveHumanCourseContext({ adapter, principal, course: title, deadlineAt });
  const stamp = await adapter.getPreparedHumanReadStamp({ principal, courseId: course.id,
    expectedRevision: course.revision, deadlineAt });
  if (!stamp || stamp.courseId !== course.id || stamp.revision !== course.revision ||
      !/^[a-f0-9]{64}$/u.test(stamp.selectionFingerprint) ||
      !Number.isSafeInteger(stamp.generation) || stamp.generation < 0 ||
      !Number.isSafeInteger(stamp.annotationSetVersion) || stamp.annotationSetVersion < 0) changed();
  return { stamp, requestHash: hash };
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
  const saved = await fencedRead(() => adapter.savePreparedHumanRead({ principal, readId, ...preparedRead,
    digest: prepared.digest, state: { ...state, o: 0, h: null }, chunks, nextPage,
    envelope, finalNextDecision, deadlineAt }));
  if (saved?.readId !== readId || saved.digest !== prepared.digest ||
      saved.total !== prepared.literal.length) changed();
  const context = await paginatePreparedHumanReadLiteral(prepared, { state: { ...state, s: readId }, nextPage });
  return { ...envelope, nextDecision: context.temMais ? envelope.nextDecision : finalNextDecision, context };
}
