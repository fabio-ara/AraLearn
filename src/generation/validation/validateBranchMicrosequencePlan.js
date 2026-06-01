const ALLOWED_ROLES = new Set(["explain", "practice", "review", "support"]);
const REQUIRED_FIELDS = ["title", "goal", "role", "covers", "checks"];
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function canonicalToken(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fail(errors = []) {
  return { ok: false, errors, value: null };
}

function parseResponse(rawResponse) {
  if (typeof rawResponse === "string") {
    try {
      return parseResponse(JSON.parse(rawResponse));
    } catch {
      return fail(["JSON incorreto."]);
    }
  }
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) {
    return fail(["JSON incorreto."]);
  }
  return { ok: true, value: rawResponse };
}

export function validateBranchMicrosequencePlan(rawResponse, contract = {}) {
  const parsed = parseResponse(rawResponse);
  if (!parsed.ok) {
    return parsed;
  }

  const includeMap = new Map(
    unique(contract?.guide?.include).map((item) => [canonicalToken(item), item])
  );
  const excludeMap = new Map(
    unique(contract?.guide?.exclude).map((item) => [canonicalToken(item), item])
  );
  const value = parsed.value;
  const errors = [];

  Object.keys(value).forEach((fieldName) => {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      errors.push(`campo fora do schema: ${fieldName}.`);
    }
  });
  REQUIRED_FIELDS.forEach((fieldName) => {
    if (value?.[fieldName] === undefined) {
      errors.push(`campo obrigatório ausente: ${fieldName}.`);
    }
  });

  const title = text(value?.title);
  const goal = text(value?.goal);
  const role = text(value?.role);
  const covers = unique(value?.covers);
  const checks = unique(value?.checks);

  if (!title) {
    errors.push("title vazio.");
  }
  if (!goal) {
    errors.push("goal vazio.");
  }
  if (!ALLOWED_ROLES.has(role)) {
    errors.push(`role inválido: ${role || "vazio"}.`);
  }
  if (!covers.length) {
    errors.push("covers vazio.");
  }
  const normalizedCovers = covers.map((item) => {
    const canonical = canonicalToken(item);
    return includeMap.get(canonical) || item;
  });
  normalizedCovers.forEach((item) => {
    const canonical = canonicalToken(item);
    if (includeMap.size && !includeMap.has(canonical)) {
      errors.push(`covers fora de guide.include: ${item}.`);
    }
    if (excludeMap.has(canonical)) {
      errors.push(`covers usa item proibido: ${excludeMap.get(canonical) || item}.`);
    }
  });

  if (errors.length) {
    return fail(errors);
  }

  return {
    ok: true,
    errors: [],
    value: {
      title,
      goal,
      role,
      covers: normalizedCovers,
      checks
    }
  };
}
