import { AuthoringApiError } from './errors.js';
import { sha256Hex } from './security.js';

// Internal focal budget, below the Actions envelope limit. Larger literal data
// remains recoverable through contiguous JSON fragments, never through a summary.
const MAX_CONTEXT_CHARACTERS = 88_000;
const MAX_CONTEXT_BYTES = 128 * 1024;
const encoder = new TextEncoder();
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
  const queryHash = await sha256Hex(JSON.stringify({ task, query }));
  const initial = { c: course.id, r: course.revision, q: queryHash, p: null, o: 0, h: null };
  if (args.continuacao === undefined) return initial;
  const value = decode(args.continuacao);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'c,h,o,p,q,r' ||
      !(value.p === null || typeof value.p === 'string' && value.p.length > 0 && value.p.length <= 240) ||
      !Number.isSafeInteger(value.o) || value.o < 0 || value.o > 16 * 1024 * 1024 ||
      !(value.h === null || typeof value.h === 'string' && /^[a-f0-9]{64}$/u.test(value.h)) ||
      (value.o === 0) !== (value.h === null)) {
    fail('A continuação da consulta é inválida. Repita a consulta inicial.');
  }
  if (value.c !== initial.c || value.r !== initial.r || value.q !== initial.q) {
    fail('O curso ou o recorte mudou. Recomece a consulta para ler uma revisão coerente.', 409);
  }
  return value;
}
function fits(value) {
  const json = JSON.stringify(value);
  return json.length <= MAX_CONTEXT_CHARACTERS && encoder.encode(json).byteLength <= MAX_CONTEXT_BYTES;
}
export async function paginateHumanReadContext(context, { state, nextPage = null }) {
  const next = nextPage === null ? null : encode({ ...state, p: nextPage, o: 0, h: null });
  const complete = { ...context, continuacao: next, temMais: next !== null };
  if (state.o === 0 && fits(complete)) return complete;
  const literal = JSON.stringify(context);
  const digest = await sha256Hex(literal);
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
