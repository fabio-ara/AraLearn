import { AuthoringApiError } from "./errors.js";

export const PLANNING_TRANSPORT_ENCODING = "curriculum-backed-microsequence-v1";
export const REVIEW_PLANNING_TRANSPORT_ENCODING = "curriculum-backed-review-microsequence-v1";

// Campos que o lote compacto carrega. Qualquer outro campo é recusado, para não
// descartar em silêncio uma variante futura do produtor.
const COMPACT_PART_MICROSEQUENCE_KEYS = Object.freeze([
  "id", "productionPosition", "curriculumPath", "studyUnitCount"
]);

// Campos que o lote omite e o currículo da MESMA microssequência fornece.
// A chave é o campo do transporte legado; o valor, a chave do currículo.
const PART_FIELD_FROM_CURRICULUM = Object.freeze({
  title: "title",
  goal: "objective",
  explanationPlan: "explanationPlan",
  explanation: "explanation",
  contentReview: "contentReview",
  role: "role"
});

// A leitura de revisão conserva todos os inputs semânticos do plano, inclusive
// explicação e dependências, mas não carrega a avaliação global de contentReview.
// O estado de revisão continua sendo lido por alvo em readReviewContext.
const REVIEW_PART_FIELD_FROM_CURRICULUM = Object.freeze({
  title: "title",
  goal: "objective",
  explanationPlan: "explanationPlan",
  explanation: "explanation",
  role: "role"
});

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failure(detail) {
  return new AuthoringApiError(503, "course_service_unavailable", detail);
}

// O jsonb do Postgres ordena chaves pelo tamanho em bytes UTF-8 e, em empate, pelos
// bytes da chave. Reconstituir essa ordem mantém o texto idêntico ao do produtor legado.
function utf8Length(value) {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function compareJsonbKeys(left, right) {
  const leftBytes = utf8Length(left);
  const rightBytes = utf8Length(right);
  if (leftBytes !== rightBytes) return leftBytes - rightBytes;
  return left < right ? -1 : left > right ? 1 : 0;
}

// Propriedade própria criada por definição, sem passar pelo setter herdado (__proto__).
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value, enumerable: true, writable: true, configurable: true
  });
}

function requiredOwn(source, key, detail) {
  if (!Object.hasOwn(source, key)) throw failure(detail);
  return source[key];
}

function orderedRecord(entries, expectedLimit) {
  const ordered = entries.slice().sort(([left], [right]) => compareJsonbKeys(left, right));
  const record = {};
  for (const [key, value] of ordered) setOwn(record, key, value);
  if (Object.keys(record).length !== expectedLimit) {
    throw failure("O transporte compacto não reconstituiu todos os campos da microssequência.");
  }
  return record;
}

// Expande o transporte compacto antes de validar, consumir e digerir. Não existe
// fallback: marca ausente, referência quebrada ou campo obrigatório ausente falham
// claramente; valores nulos vindos do SQL são preservados.
function expandTransport(value, encoding, fieldsFromCurriculum) {
  if (!isPlainRecord(value) || value.payloadEncoding !== encoding) {
    throw failure("O planejamento recebido não usa o transporte compacto esperado.");
  }
  const plan = value.plan;
  if (!isPlainRecord(plan) || !isPlainRecord(plan.curriculum) || !Array.isArray(plan.curriculum.modules)) {
    throw failure("O planejamento compacto não traz o currículo do curso.");
  }
  const curriculumByMicrosequenceId = new Map();
  for (const moduleValue of plan.curriculum.modules) {
    if (!isPlainRecord(moduleValue) || !Array.isArray(moduleValue.lessons)) {
      throw failure("O currículo compacto traz um módulo inválido.");
    }
    for (const lesson of moduleValue.lessons) {
      if (!isPlainRecord(lesson) || !Array.isArray(lesson.microsequences)) {
        throw failure("O currículo compacto traz uma lição inválida.");
      }
      for (const microsequence of lesson.microsequences) {
        if (!isPlainRecord(microsequence) || typeof microsequence.id !== "string" || !microsequence.id) {
          throw failure("O currículo compacto traz uma microssequência sem identidade.");
        }
        if (curriculumByMicrosequenceId.has(microsequence.id)) {
          throw failure("O currículo compacto repete a mesma microssequência.");
        }
        curriculumByMicrosequenceId.set(microsequence.id, microsequence);
      }
    }
  }
  if (!Array.isArray(plan.parts)) {
    throw failure("O planejamento compacto não traz os lotes do curso.");
  }
  const parts = plan.parts.map((part) => {
    if (!isPlainRecord(part) || !Array.isArray(part.microsequences)) {
      throw failure("O planejamento compacto traz um lote inválido.");
    }
    const microsequences = part.microsequences.map((entry) => {
      if (!isPlainRecord(entry)) throw failure("O lote compacto traz microssequência inválida.");
      if (Object.keys(entry).some((key) => !COMPACT_PART_MICROSEQUENCE_KEYS.includes(key))) {
        throw failure("O lote compacto traz campos não previstos no transporte.");
      }
      const id = requiredOwn(entry, "id", "O lote compacto traz microssequência sem identidade.");
      if (typeof id !== "string" || !id) {
        throw failure("O lote compacto traz microssequência sem identidade.");
      }
      const source = curriculumByMicrosequenceId.get(id);
      if (!source) {
        throw failure("O transporte compacto referencia microssequência ausente do currículo.");
      }
      const values = [
        ["id", id],
        ["productionPosition", requiredOwn(entry, "productionPosition",
          "O lote compacto omite a posição de produção.")],
        ["curriculumPath", requiredOwn(entry, "curriculumPath",
          "O lote compacto omite o caminho curricular.")],
        ["studyUnitCount", requiredOwn(entry, "studyUnitCount",
          "O lote compacto omite a contagem de unidades.")]
      ];
      for (const [target, from] of Object.entries(fieldsFromCurriculum)) {
        values.push([target, requiredOwn(source, from,
          "O currículo compacto omite o campo " + from + " da microssequência.")]);
      }
      return orderedRecord(values, 4 + Object.keys(fieldsFromCurriculum).length);
    });
    return { ...part, microsequences };
  });
  // A marca é interna ao transporte e some antes de o consumidor ver a árvore legada.
  // O resto da árvore não é copiado, reordenado nem inspecionado.
  const rest = { ...value };
  delete rest.payloadEncoding;
  return { ...rest, plan: { ...plan, parts } };
}

export function expandPlanningTransport(value) {
  return expandTransport(value, PLANNING_TRANSPORT_ENCODING, PART_FIELD_FROM_CURRICULUM);
}

export function expandReviewPlanningTransport(value) {
  return expandTransport(value, REVIEW_PLANNING_TRANSPORT_ENCODING, REVIEW_PART_FIELD_FROM_CURRICULUM);
}
