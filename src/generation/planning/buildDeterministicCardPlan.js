import { getMicrosequenceSize } from "../types/microsequenceSizes.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isExplicitPracticeRole(role = "") {
  return ["practice", "practice_more", "fix_error"].includes(text(role));
}

function ensureMinimumPracticeRoles(roles = []) {
  const nextRoles = [...roles];
  if (nextRoles.length < 3) {
    return nextRoles;
  }
  const explicitPracticeCount = nextRoles.filter((role) => isExplicitPracticeRole(role)).length;
  if (explicitPracticeCount >= 2) {
    return nextRoles;
  }

  const preferredInsertions = [];
  if (!nextRoles.includes("practice")) {
    preferredInsertions.push("practice");
  }
  if (!nextRoles.includes("practice_more")) {
    preferredInsertions.push("practice_more");
  }
  if (!nextRoles.includes("fix_error")) {
    preferredInsertions.push("fix_error");
  }

  preferredInsertions.forEach((nextRole) => {
    if (nextRoles.filter((role) => isExplicitPracticeRole(role)).length >= 2) {
      return;
    }
    for (let index = nextRoles.length - 1; index >= 1; index -= 1) {
      if (isExplicitPracticeRole(nextRoles[index])) {
        continue;
      }
      if (nextRoles[index] === "next" && index === nextRoles.length - 1) {
        continue;
      }
      nextRoles[index] = nextRole;
      break;
    }
  });

  if (nextRoles.filter((role) => isExplicitPracticeRole(role)).length < 2) {
    nextRoles[nextRoles.length - 2] = "practice";
    nextRoles[nextRoles.length - 1] = "practice_more";
  }

  return nextRoles;
}

function resolveRoleTemplate(type = "", count = 5) {
  const normalized = text(type);
  const templates = {
    concept: {
      short: ["explain", "practice", "fix_error"],
      medium: ["explain", "example", "practice", "practice_more", "next"],
      long: ["explain", "example", "practice", "review", "practice_more", "fix_error", "practice_more", "next"]
    },
    procedure: {
      short: ["explain", "practice", "practice_more"],
      medium: ["explain", "example", "practice", "practice_more", "next"],
      long: ["explain", "example", "practice", "review", "practice_more", "fix_error", "practice_more", "next"]
    },
    comparison: {
      short: ["explain", "practice", "review"],
      medium: ["explain", "example", "practice", "review", "next"],
      long: ["explain", "example", "practice", "review", "practice_more", "fix_error", "review", "next"]
    },
    guided_practice: {
      short: ["explain", "practice", "practice_more"],
      medium: ["explain", "practice", "practice_more", "fix_error", "next"],
      long: ["explain", "example", "practice", "practice_more", "fix_error", "practice_more", "review", "next"]
    },
    review: {
      short: ["review", "practice", "practice_more"],
      medium: ["review", "example", "practice", "practice_more", "next"],
      long: ["review", "example", "practice", "review", "practice_more", "fix_error", "review", "next"]
    },
    common_mistake: {
      short: ["explain", "fix_error", "practice"],
      medium: ["explain", "example", "fix_error", "practice", "next"],
      long: ["explain", "example", "fix_error", "review", "practice", "practice_more", "review", "next"]
    },
    rule_or_policy: {
      short: ["explain", "practice", "review"],
      medium: ["explain", "example", "practice", "review", "next"],
      long: ["explain", "example", "practice", "review", "practice_more", "fix_error", "review", "next"]
    },
    code_or_command: {
      short: ["explain", "practice", "practice_more"],
      medium: ["explain", "example", "practice", "practice_more", "next"],
      long: ["explain", "example", "practice", "review", "practice_more", "fix_error", "review", "next"]
    }
  };
  const sizeKey = count >= 8 ? "long" : count <= 3 ? "short" : "medium";
  const base = templates[normalized]?.[sizeKey] || templates.concept[sizeKey];
  const result = ensureMinimumPracticeRoles(base.slice(0, count));
  while (result.length < count) {
    result.splice(Math.max(result.length - 1, 1), 0, "practice_more");
  }
  return result;
}

function resolveGoal(role, packet = {}) {
  const microGoal = text(packet?.currentMicrosequence?.goal || packet?.goal || packet?.userRequest);
  const guides = {
    explain: "Explicar o ponto central sem abrir outro tópico.",
    example: "Materializar um caso suficiente no próprio card.",
    practice: "Cobrar a decisão principal em prática fechada.",
    practice_more: "Variar a prática no mesmo eixo sem abrir novo assunto.",
    fix_error: "Contrastar o erro provável com a leitura correta.",
    review: "Retomar o núcleo da microssequência de forma objetiva.",
    next: "Consolidar o ponto atual e preparar a continuidade."
  };
  return microGoal ? `${guides[role]} ${microGoal}`.trim() : guides[role];
}

function resolveChecks(role) {
  const checks = {
    explain: ["o card cobre só o ponto central"],
    example: ["o exemplo materializa o contexto no próprio card"],
    practice: ["há prática fechada verificável no próprio card"],
    practice_more: ["a variação preserva o mesmo conceito"],
    fix_error: ["os distratores representam erros plausíveis"],
    review: ["o card retoma o ponto já explicado"],
    next: []
  };
  return checks[role] || [];
}

function buildPlanItem(position, role, packet = {}) {
  return {
    position,
    role,
    goal: resolveGoal(role, packet),
    checks: resolveChecks(role)
  };
}

export function buildDidacticCardPlan(packet = {}, options = {}) {
  const size = Math.max(1, Number(options?.targetCount) || 5);
  const roles = resolveRoleTemplate(options?.type, size);
  return roles.map((role, index) => buildPlanItem(index + 1, role, packet));
}

export function buildDeterministicCardPlan({
  type,
  size,
  packet = {}
}) {
  const selectedSize = getMicrosequenceSize(size) || getMicrosequenceSize("medium");
  return buildDidacticCardPlan(packet, {
    type,
    targetCount: selectedSize?.cardCount || 5
  });
}
