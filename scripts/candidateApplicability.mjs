const SHA = /^[a-f0-9]{40}$/u;

export const CANDIDATE_GATES = Object.freeze(["preparation", "web", "android", "supabase"]);
export const CANDIDATE_ARTIFACTS = Object.freeze(["pages", "android"]);
export const CANDIDATE_TOOLCHAINS = Object.freeze(["web", "android", "supabase"]);

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  demand(value && typeof value === "object" && !Array.isArray(value), `${label} ausente ou inválido.`);
  demand(Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"), `${label} incompleto ou com campos desconhecidos.`);
}

function sourceIdentity(source) {
  exactKeys(source, ["baseSha", "headSha"], "Identidade da classificação");
  demand((source.baseSha === null || SHA.test(source.baseSha)) && SHA.test(source.headSha), "SHA da classificação ausente ou inválido.");
  return source;
}

export function createCandidateApplicability(impact, { baseSha = null, headSha, conclusive = true } = {}) {
  demand(impact?.schemaVersion === 1 && impact.requires && Array.isArray(impact.categories) && Array.isArray(impact.unknownPaths),
    "Impacto de validação inválido.");
  demand(["web", "android", "supabase"].every(gate => typeof impact.requires[gate] === "boolean"),
    "Impacto de validação sem gates booleanos.");
  demand(typeof conclusive === "boolean", "Conclusão da classificação inválida.");
  const broad = !conclusive || impact.unknownPaths.length > 0 || impact.categories.includes("unknown") ||
    impact.categories.includes("orchestration");
  const gates = {
    preparation: true,
    web: broad || impact.requires.web === true,
    android: broad || impact.requires.android === true,
    supabase: broad || impact.requires.supabase === true
  };
  return validateCandidateApplicability({
    schemaVersion: 1,
    source: { baseSha, headSha },
    classification: {
      conclusive,
      categories: [...impact.categories],
      unknownPaths: [...impact.unknownPaths]
    },
    gates,
    artifacts: { pages: gates.web, android: gates.android },
    toolchains: { web: gates.web, android: gates.android, supabase: gates.supabase }
  });
}

export function validateCandidateApplicability(value, expectedSource = null) {
  demand(value?.schemaVersion === 1, "Matriz de aplicabilidade inválida.");
  sourceIdentity(value.source);
  exactKeys(value.classification, ["conclusive", "categories", "unknownPaths"], "Classificação da candidata");
  demand(typeof value.classification.conclusive === "boolean" && Array.isArray(value.classification.categories) &&
    value.classification.categories.every(item => typeof item === "string") &&
    Array.isArray(value.classification.unknownPaths) && value.classification.unknownPaths.every(item => typeof item === "string"),
  "Classificação da candidata inválida.");
  exactKeys(value.gates, CANDIDATE_GATES, "Aplicabilidade dos gates");
  exactKeys(value.artifacts, CANDIDATE_ARTIFACTS, "Aplicabilidade dos artefatos");
  exactKeys(value.toolchains, CANDIDATE_TOOLCHAINS, "Aplicabilidade das toolchains");
  for (const collection of [value.gates, value.artifacts, value.toolchains]) {
    demand(Object.values(collection).every(item => typeof item === "boolean"), "Aplicabilidade precisa ser booleana.");
  }
  demand(value.gates.preparation === true, "A preparação nunca pode ser dispensada.");
  const broad = !value.classification.conclusive || value.classification.unknownPaths.length > 0 ||
    value.classification.categories.includes("unknown") || value.classification.categories.includes("orchestration");
  if (broad) demand(CANDIDATE_GATES.every(gate => value.gates[gate]), "Classificação conservadora exige todos os gates.");
  demand(value.artifacts.pages === value.gates.web && value.artifacts.android === value.gates.android,
    "Artefatos não correspondem aos gates aplicáveis.");
  demand(value.toolchains.web === value.gates.web && value.toolchains.android === value.gates.android &&
    value.toolchains.supabase === value.gates.supabase, "Toolchains não correspondem aos gates aplicáveis.");
  if (expectedSource) {
    demand(value.source.baseSha === expectedSource.baseSha && value.source.headSha === expectedSource.headSha,
      "Aplicabilidade pertence a outro delta ou SHA.");
  }
  return value;
}

export function certifyGateResults(applicability, rawResults, expectedSource = null) {
  validateCandidateApplicability(applicability, expectedSource);
  exactKeys(rawResults, CANDIDATE_GATES, "Resultados brutos dos gates");
  const results = {};
  for (const gate of CANDIDATE_GATES) {
    const raw = rawResults[gate];
    if (applicability.gates[gate]) {
      demand(raw === "success", `Gate aplicável não passou: ${gate}.`);
      results[gate] = "success";
    } else {
      demand(raw === "skipped", `Gate inaplicável não foi pulado de forma inequívoca: ${gate}.`);
      results[gate] = "not_applicable";
    }
  }
  return results;
}

export function validateGateCertificate(applicability, results, expectedSource = null) {
  validateCandidateApplicability(applicability, expectedSource);
  exactKeys(results, CANDIDATE_GATES, "Resultados certificados dos gates");
  for (const gate of CANDIDATE_GATES) {
    demand(results[gate] === (applicability.gates[gate] ? "success" : "not_applicable"),
      `Resultado certificado incompatível com a aplicabilidade: ${gate}.`);
  }
  return results;
}
