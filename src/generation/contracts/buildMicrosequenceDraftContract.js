import { buildMicrosequenceGenerationRepresentation } from "../didactics/microsequenceGenerationRepresentation.js";
import {
  supportsChoiceExercise,
  supportsGapExercise
} from "../../domain/cardExerciseSupport.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactRequest(request = {}) {
  return {
    mode: text(request?.mode) === "repair" ? "repair" : "generate",
    prompt: text(request?.prompt),
    preferredResource: text(request?.preferredResource),
    extraResources: Array.isArray(request?.extraResources) ? request.extraResources : []
  };
}

function compactContext(context = {}) {
  return {
    selectedRefs: Array.isArray(context?.selectedRefs) ? context.selectedRefs : [],
    refs: (Array.isArray(context?.refs) ? context.refs : []).map((item) => ({
      title: text(item?.title),
      goal: text(item?.goal),
      role: text(item?.role),
      covers: Array.isArray(item?.covers) ? item.covers : [],
      checks: Array.isArray(item?.checks) ? item.checks : [],
      ...(item?.dependency === true ? { dependency: true } : {}),
      ...(item?.selected === true ? { selected: true } : {})
    })),
    next: context?.next && typeof context.next === "object"
      ? {
          title: text(context.next.title),
          goal: text(context.next.goal),
          role: text(context.next.role),
          covers: Array.isArray(context.next.covers) ? context.next.covers : [],
          checks: Array.isArray(context.next.checks) ? context.next.checks : []
        }
      : null,
    existingCards: (Array.isArray(context?.existingCards) ? context.existingCards : []).map((card) => ({
      position: Number(card?.position) || 0,
      resource: text(card?.resource),
      kind: text(card?.kind),
      exercise: text(card?.exercise),
      title: text(card?.title)
    }))
  };
}

function compactPlan(cardPlan = []) {
  return (Array.isArray(cardPlan) ? cardPlan : []).map((item) => ({
    position: Number(item?.position) || 0,
    role: text(item?.role),
    goal: text(item?.goal),
    checks: Array.isArray(item?.checks) ? item.checks : [],
    shape:
      ["explain", "example", "next"].includes(text(item?.role))
        ? "kind=theory, exercise=none"
        : ["practice", "practice_more", "fix_error"].includes(text(item?.role))
          ? "kind=exercise; use exercise=gap to complete an element inside any compatible resource; use exercise=choice only to discriminate alternatives"
          : text(item?.role) === "review"
            ? "use either theory/none or a compatible exercise; prefer gap when the learner completes the representation"
            : ""
  }));
}

function buildExerciseRule(resources = [], role = "practice") {
  const normalizedResources = (Array.isArray(resources) ? resources : [])
    .map((resource) => text(resource))
    .filter(Boolean);
  const gapResources = normalizedResources
    .filter((resource) => supportsGapExercise(resource))
    .map((resource) => `${resource}/gap`);
  const choiceResources = normalizedResources
    .filter((resource) => supportsChoiceExercise(resource))
    .map((resource) => `${resource}/choice`);
  const roleLabel =
    role === "review"
      ? "For review, use theory/none or a compatible exercise"
      : "For practice, practice_more and fix_error, use a compatible exercise";
  return [
    roleLabel,
    gapResources.length ? `gap is available in ${gapResources.join(", ")}` : "",
    choiceResources.length ? `choice is available in ${choiceResources.join(", ")}` : "",
    "select the resource and interaction from the observable learning evidence"
  ].filter(Boolean).join("; ") + ".";
}

const EXERCISE_ROLES = new Set(["practice", "practice_more", "fix_error"]);

function buildTheoryPracticeBalanceRules(plan = [], resources = []) {
  const normalizedPlan = Array.isArray(plan) ? plan : [];
  const theoryItems = normalizedPlan.filter((item) => ["explain", "example", "review", "next"].includes(text(item?.role)));
  const exerciseItems = normalizedPlan.filter((item) => EXERCISE_ROLES.has(text(item?.role)));
  if (!theoryItems.length || !exerciseItems.length) {
    return [];
  }
  const rules = [
    "Choose each resource for pedagogical fit, not because one format is easier to validate.",
    "If the explanation needs more than one local step, distribute it across the available theory items instead of compressing it into one dense opening card.",
    "As theory expands, keep the later exercise items active and proportional so consolidation grows with the explanation."
  ];
  if (resources.includes("paragraph") && resources.length > 1) {
    rules.push("Do not avoid paragraph/gap or contextual resources by default; use whichever format best matches each teaching move.");
  }
  return rules;
}

function buildCoverageRules(planningContract = {}) {
  const covers = Array.isArray(planningContract?.microsequence?.covers) ? planningContract.microsequence.covers.filter(Boolean) : [];
  const include = Array.isArray(planningContract?.guide?.include) ? planningContract.guide.include.filter(Boolean) : [];
  const signalCount = Math.max(covers.length, include.length);
  if (signalCount < 2) {
    return [];
  }
  return [
    "If the microsequence combines more than one relevant subtopic or representation, distribute them across the draft when that improves teaching.",
    "Do not collapse every plan item into the same resource when different allowed resources fit the content better."
  ];
}

function buildPreferenceRules(planningContract = {}) {
  const preferred = text(planningContract?.request?.preferredResource);
  if (!preferred) {
    return [];
  }
  return [
    `Treat preferredResource=${preferred} as a preference, not as a monopoly, unless it clearly fits every plan item.`
  ];
}

function buildVisualResourceRules({ resources = [], plan = [] } = {}) {
  const allowed = new Set((Array.isArray(resources) ? resources : []).map((item) => text(item)));
  const goalText = (Array.isArray(plan) ? plan : []).map((item) => text(item?.goal)).join(" ").toLowerCase();
  const rules = [];
  if (allowed.has("matrix")) {
    rules.push("If the plan item is about matriz, linha, coluna, posição i,j, soma matricial or sequência matricial, prefer resource=matrix.");
    rules.push("Do not simulate a matrix with paragraph when resource=matrix is available and fits the plan item.");
  }
  if (allowed.has("plane")) {
    rules.push("If the plan item is about vetor 2D, ponto no plano, coordenada, soma de vetores, escala or distância, prefer resource=plane.");
    rules.push("Do not simulate a Cartesian plane with paragraph when resource=plane is available and fits the plan item.");
  }
  if (allowed.has("formula")) {
    rules.push("If the plan item depends on an equation, fraction, radical, index, power or chemical formula, prefer resource=formula.");
    rules.push("Do not simulate mathematical or chemical notation with plain text when resource=formula is available and fits the plan item.");
  }
  if (!allowed.has("matrix") && /\bmatriz|linha|coluna|i,j\b/.test(goalText)) {
    rules.push("resource=matrix is unavailable in this request, so choose another allowed resource.");
  }
  if (!allowed.has("plane") && /\bvetor|plano|coordenad|cartesian/.test(goalText)) {
    rules.push("resource=plane is unavailable in this request, so choose another allowed resource.");
  }
  if (!allowed.has("formula") && /\bequa[cç][aã]o|f[oó]rmula|fra[cç][aã]o|radical|pot[eê]ncia|qu[ií]mic/.test(goalText)) {
    rules.push("resource=formula is unavailable in this request, so choose another allowed resource.");
  }
  return rules;
}

export function buildMicrosequenceDraftContract({ planningContract, validatedPlan }) {
  const representation = buildMicrosequenceGenerationRepresentation({
    planningContract,
    validatedPlan
  });
  const plan = compactPlan(representation.planning.didacticItems);
  const resources = Array.isArray(representation?.resources?.allowedResourceTypes) ? representation.resources.allowedResourceTypes : [];
  const firstPlanItem = plan[0] || null;
  const isBranch = Boolean(text(planningContract?.microsequence?.branchOf));
  return {
    task: "bottom_up_card_plan",
    language: "pt-BR",
    path: {
      course: planningContract?.path?.course || "",
      module: planningContract?.path?.module || "",
      lesson: planningContract?.path?.lesson || "",
      microsequence: planningContract?.path?.microsequence || ""
    },
    guide: structuredClone(planningContract?.guide || { goal: "", include: [], exclude: [], notation: [], avoid: [] }),
    microsequence: {
      title: text(planningContract?.microsequence?.title),
      goal: text(validatedPlan?.plan?.goal || planningContract?.microsequence?.goal),
      checks: Array.isArray(planningContract?.microsequence?.checks) ? planningContract.microsequence.checks : [],
      branchOf: text(planningContract?.microsequence?.branchOf)
    },
    request: compactRequest(planningContract?.request),
    context: compactContext(planningContract?.context || { selectedRefs: [], refs: [], next: null, existingCards: [] }),
    plan,
    resources,
    sources: Array.isArray(planningContract?.sources) ? structuredClone(planningContract.sources) : [],
    rules: [
      "Return only valid JSON.",
      `Return exactly ${plan.length} draft items.`,
      "Use exactly the given positions.",
      "Choose the resource that best matches the content and the goal of each plan item.",
      "For explain, example and next, use kind theory and exercise none.",
      "For practice, practice_more and fix_error, always use kind exercise.",
      "Use exercise=gap when the learner must retrieve and complete an element inside paragraph, code, table, flow, tree, graph, relation_map, matrix, plane, formula or composite.",
      "Use exercise=choice only when discriminating alternatives is itself the best evidence; resource=choice always uses exercise=choice.",
      "Do not replace an appropriate structured gap with paragraph or choice merely because those resources are easier to produce.",
      ...(firstPlanItem && text(firstPlanItem.kind) === "theory" && resources.includes("paragraph")
        ? [
            "If the first plan item is theory and paragraph is allowed, use resource=paragraph for the opening card.",
            "The first opening paragraph must explain the local point in simple terms before any exercise."
          ]
        : []),
      buildExerciseRule(resources, "practice"),
      ...buildTheoryPracticeBalanceRules(plan, resources),
      "For review, if you choose an exercise card, use kind exercise.",
      buildExerciseRule(resources, "review"),
      ...(isBranch
        ? [
            "If this microsequence is a branch, reserve the final card to close the local doubt and hand the learner back to the planned track.",
            "If this branch exists only to unblock the main track, prefer an objective recognition check unless completing the representation is itself the target skill.",
            ...(plan.length && text(plan[plan.length - 1]?.role) === "next" && resources.includes("paragraph")
              ? ["If this branch closes with a theory plan item and paragraph is allowed, use resource=paragraph in the final return card."]
              : [])
          ]
        : []),
      ...buildCoverageRules(planningContract),
      ...buildPreferenceRules(planningContract),
      ...buildVisualResourceRules({ resources, plan }),
      "Keep the draft inside guide.include and away from guide.exclude.",
      "Do not mention guide.exclude in goals, stems, options, examples or return messages, not even as a wrong alternative.",
      ...(text(planningContract?.request?.mode) === "repair"
        ? [
            "If request.mode is repair, preserve the current sequence when it already works and change only what request.prompt requires.",
            "If request.mode is repair, avoid replacing a valid closed exercise unless request.prompt clearly requires it."
          ]
        : [])
    ],
    output: {
      format: "json",
      cardCount: plan.length
    }
  };
}
