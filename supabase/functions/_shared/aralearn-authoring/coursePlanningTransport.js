import { AuthoringApiError } from "./errors.js";

export const PLANNING_TRANSPORT_ENCODING = "curriculum-backed-microsequence-v1";

const COMPACT_PART_MICROSEQUENCE_KEYS = Object.freeze([
  "id", "productionPosition", "curriculumPath", "studyUnitCount"
]);

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failure(detail) {
  return new AuthoringApiError(503, "course_service_unavailable", detail);
}

// O jsonb devolve chaves na ordem canônica (tamanho e depois bytes). Reconstituir essa
// ordem deixa o digest de reuso da revisão idêntico ao da representação legada.
function compareJsonbKeys(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalizeJsonbValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJsonbValue);
  if (isPlainRecord(value)) {
    const ordered = {};
    for (const key of Object.keys(value).sort(compareJsonbKeys)) {
      ordered[key] = canonicalizeJsonbValue(value[key]);
    }
    return ordered;
  }
  return value;
}

// Expande o transporte compacto do planejamento antes de validar, consumir e digerir.
// Não existe fallback: payload sem a marca interna ou com referência quebrada falha claramente.
export function expandPlanningTransport(value) {
  if (!isPlainRecord(value) || value.payloadEncoding !== PLANNING_TRANSPORT_ENCODING) {
    throw failure("O planejamento recebido não usa o transporte compacto esperado.");
  }
  const modules = value.plan?.curriculum?.modules;
  if (!isPlainRecord(value.plan) || !isPlainRecord(value.plan.curriculum) || !Array.isArray(modules)) {
    throw failure("O planejamento compacto não traz o currículo do curso.");
  }
  const contentByMicrosequenceId = new Map();
  for (const moduleValue of modules) {
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
        if (contentByMicrosequenceId.has(microsequence.id)) {
          throw failure("O currículo compacto repete a mesma microssequência.");
        }
        contentByMicrosequenceId.set(microsequence.id, microsequence);
      }
    }
  }
  if (!Array.isArray(value.plan.parts)) {
    throw failure("O planejamento compacto não traz os lotes do curso.");
  }
  const parts = value.plan.parts.map((part) => {
    if (!isPlainRecord(part) || !Array.isArray(part.microsequences)) {
      throw failure("O planejamento compacto traz um lote inválido.");
    }
    const microsequences = part.microsequences.map((entry) => {
      if (!isPlainRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        throw failure("O lote compacto traz microssequência sem identidade.");
      }
      if (Object.keys(entry).some((key) => !COMPACT_PART_MICROSEQUENCE_KEYS.includes(key))) {
        throw failure("O lote compacto traz campos não previstos no transporte.");
      }
      const source = contentByMicrosequenceId.get(entry.id);
      if (!source) {
        throw failure("O transporte compacto referencia microssequência ausente do currículo.");
      }
      return {
        id: entry.id,
        productionPosition: entry.productionPosition ?? null,
        title: source.title ?? null,
        goal: source.objective ?? null,
        explanationPlan: source.explanationPlan ?? null,
        explanation: source.explanation ?? null,
        contentReview: source.contentReview ?? null,
        role: source.role ?? null,
        curriculumPath: entry.curriculumPath ?? null,
        studyUnitCount: entry.studyUnitCount ?? null
      };
    });
    return { ...part, microsequences };
  });
  // A marca é interna ao transporte: some antes de o consumidor ver a árvore legada.
  const rest = { ...value };
  delete rest.payloadEncoding;
  return canonicalizeJsonbValue({ ...rest, plan: { ...value.plan, parts } });
}

