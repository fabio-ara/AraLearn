import { AuthoringApiError } from './errors.js';
import { sha256Hex } from './security.js';
import { canonicalAuthoringValue } from '../aralearn/runtime/domain/courseAuthoringBasis.js';
import { COURSE_AUTHORING_EXPORT_MAX_BYTES } from '../aralearn/runtime/domain/courseAuthoringComparison.js';

// Internal focal budget, below the Actions envelope limit. Larger literal data
// remains recoverable through contiguous JSON fragments, never through a summary.
const MAX_CONTEXT_CHARACTERS = 12_000;
const MAX_CONTEXT_BYTES = 16 * 1024;
// Export v2 accepts at most 32 MiB of UTF-8 JSON. Its outer read envelope adds
// only a small fixed overhead, while escaping U+2011 expands each 3-byte UTF-8
// code point to six ASCII characters. Three times the export byte cap safely
// bounds the UTF-16 cursor offset for that representation without widening any
// other human-read continuation.
const MAX_EXPORT_CONTEXT_OFFSET = COURSE_AUTHORING_EXPORT_MAX_BYTES * 3;
const encoder = new TextEncoder();
const preparedLiterals = new WeakSet();
const fail = (message, status = 422) => { throw new AuthoringApiError(status,
  status === 409 ? 'human_read_context_changed' : 'invalid_read_continuation', message); };
function encode(value) {
  return btoa(String.fromCharCode(...encoder.encode(JSON.stringify(value))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
function decode(value) {
  try {
    if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw Error();
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0))));
  } catch { fail('A continuação da consulta é inválida. Repita a consulta inicial.'); }
}
export async function openHumanReadContinuation({ args, course, task }) {
  const query = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'continuacao')
    .sort(([left], [right]) => left.localeCompare(right)));
  const queryHash = await sha256Hex(canonicalAuthoringValue({ task, query }));
  const initial = { c: course.id, r: course.revision, q: queryHash, p: null, o: 0, h: null };
  if (args.continuacao === undefined) return initial;
  const value = decode(args.continuacao);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'c,h,o,p,q,r' ||
      !(value.p === null || typeof value.p === 'string' && value.p.length > 0 && value.p.length <= 240) ||
      !Number.isSafeInteger(value.o) || value.o < 0 || value.o >
        (task === 'exportar_autoria' ? MAX_EXPORT_CONTEXT_OFFSET : 16 * 1024 * 1024) ||
      !(value.h === null || typeof value.h === 'string' && /^[a-f0-9]{64}$/u.test(value.h)) ||
      (value.o === 0) !== (value.h === null)) {
    fail('A continuação da consulta é inválida. Repita a consulta inicial.');
  }
  if (value.c !== initial.c || value.r !== initial.r) {
    fail('O curso ou sua revisão mudou. Recomece a consulta para ler uma revisão coerente.', 409);
  }
  if (value.q !== initial.q) {
    fail('Os argumentos da consulta mudaram. Repita os mesmos argumentos da consulta inicial, acrescentando somente a continuação recebida.', 409);
  }
  return value;
}
function fits(value) {
  const json = JSON.stringify(value);
  return json.length <= MAX_CONTEXT_CHARACTERS && encoder.encode(json).byteLength <= MAX_CONTEXT_BYTES;
}
export async function prepareHumanReadContextLiteral(context, { escapeNonbreakingHyphen = false } = {}) {
  const json = JSON.stringify(context);
  const literal = escapeNonbreakingHyphen ? json.replaceAll('\u2011', '\\u2011') : json;
  const prepared = Object.freeze({ literal, digest: await sha256Hex(literal) });
  preparedLiterals.add(prepared);
  return prepared;
}
export async function prepareSerializedAuthoringExportLiteral(serializedExport) {
  if (typeof serializedExport !== 'string' || serializedExport.length === 0 ||
      serializedExport[0] !== '{' || serializedExport.at(-1) !== '}') {
    fail('A exportação serializada é inválida. Recomece a consulta.');
  }
  const json = `{"authoringExport":${serializedExport}}`;
  const literal = json.replaceAll('\u2011', '\\u2011');
  const prepared = Object.freeze({ literal, digest: await sha256Hex(literal) });
  preparedLiterals.add(prepared);
  return prepared;
}
export async function paginatePreparedHumanReadLiteral(prepared, { state, nextPage = null }) {
  if (!preparedLiterals.has(prepared) || typeof prepared.literal !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(prepared.digest)) {
    fail('O literal preparado para continuação é inválido. Recomece a consulta.');
  }
  const next = nextPage === null ? null : encode({ ...state, p: nextPage, o: 0, h: null });
  const { literal, digest } = prepared;
  if (state.o >= literal.length || state.h !== null && state.h !== digest) {
    fail('O conteúdo da consulta mudou. Recomece para não combinar trechos diferentes.', 409);
  }
  const fragment = end => ({
    fragmento: { formato: 'application/json', inicio: state.o, fim: end,
      total: literal.length, texto: literal.slice(state.o, end) },
    continuacao: end === literal.length ? next : encode({ ...state, o: end, h: digest }),
    temMais: end < literal.length || next !== null
  });
  let low = state.o + 1, high = Math.min(literal.length, state.o + MAX_CONTEXT_CHARACTERS), end = state.o;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(fragment(middle))) { end = middle; low = middle + 1; }
    else high = middle - 1;
  }
  // Offsets count UTF-16 units; never divide a Unicode surrogate pair.
  if (end < literal.length && /[\uD800-\uDBFF]/u.test(literal[end - 1])) end--;
  if (end <= state.o) fail('O recorte não cabe na consulta. Escolha uma unidade específica.');
  return fragment(end);
}
export async function paginateHumanReadContext(context, { state, nextPage = null, escapeNonbreakingHyphen = false }) {
  const next = nextPage === null ? null : encode({ ...state, p: nextPage, o: 0, h: null });
  const complete = { ...context, continuacao: next, temMais: nextPage !== null };
  if (!escapeNonbreakingHyphen && state.o === 0 && fits(complete)) return complete;
  const prepared = await prepareHumanReadContextLiteral(context, { escapeNonbreakingHyphen });
  return paginatePreparedHumanReadLiteral(prepared, { state, nextPage });
}
