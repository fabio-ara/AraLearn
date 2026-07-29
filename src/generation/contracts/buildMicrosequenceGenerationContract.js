import { buildMicrosequenceGenerationRepresentation } from "../didactics/microsequenceGenerationRepresentation.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compactRequest(request = {}) {
  return {
    mode: text(request?.mode) === "repair" ? "repair" : "generate",
    prompt: text(request?.prompt)
  };
}

function compactGenerationContext(context = {}) {
  return {
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
    })),
    currentCards: Array.isArray(context?.currentCards) ? structuredClone(context.currentCards) : []
  };
}

function compactKnownErrors(knownErrors = []) {
  return (Array.isArray(knownErrors) ? knownErrors : []).map((item) => text(item)).filter(Boolean);
}

function schemaFieldsMap(resourceSchemas = {}) {
  return Object.fromEntries(
    Object.entries(resourceSchemas || {}).map(([resourceId, fields]) => [resourceId, Array.isArray(fields) ? fields : []])
  );
}

function buildCardSpecificRules(plan = []) {
  const normalizedPlan = Array.isArray(plan) ? plan : [];
  return normalizedPlan.flatMap((item, index) => {
    const position = Number(item?.position) || 0;
    const role = text(item?.role);
    const kind = text(item?.kind);
    const exercise = text(item?.exercise);
    const previous = index > 0 ? normalizedPlan[index - 1] : null;
    const roleRules = (() => {
      if (role === "explain") {
        return [
          `Card ${position} role explain: state one central rule clearly and stay inside the local scope.`,
          `Card ${position} role explain: keep the opening explanation short, concrete and limited to 1 to 3 sentences.`
        ];
      }
      if (role === "example") {
        return [
          `Card ${position} role example: materialize one minimal sufficient case in the card itself.`,
          `Card ${position} role example: include the case inside the main field of the card instead of leaving the example implicit.`
        ];
      }
      if (role === "practice") {
        return exercise === "gap"
          ? [`Card ${position} role practice: use one precise completion target inside the main field; add plausible wrong options only when recognition is the intended evidence.`]
          : [`Card ${position} role practice: ask about the case shown in the card, not broad trivia.`];
      }
      if (role === "practice_more") {
        return [
          `Card ${position} role practice_more: vary the case but test the same target as the previous practice.`,
          `Card ${position} role practice_more: use a different concrete case, values, inputs or state from the previous practice.`,
          ...(previous
            ? [`Card ${position} role practice_more: do not repeat the same case, same prompt, same question or same options from card ${Number(previous.position) || index}.`]
            : [])
        ];
      }
      if (role === "fix_error") {
        return [
          `Card ${position} role fix_error: wrong options must be plausible mistakes from this topic.`,
          `Card ${position} role fix_error: after must explain the correction briefly and directly.`,
          `Card ${position} role fix_error: use a different concrete case or a clearly different mistake from the previous practice.`,
          ...(previous
            ? [`Card ${position} role fix_error: do not restate card ${Number(previous.position) || index} with the same prompt, same question or same options.`]
            : [])
        ];
      }
      if (role === "review") {
        return [`Card ${position} role review: compress the target into quick recognition or recall without opening new scope.`];
      }
      if (role === "next") {
        return [`Card ${position} role next: consolidate the current point and prepare continuity without teaching the next microsequence in advance.`];
      }
      return [];
    })();
    if (kind === "theory") {
      return [...roleRules, `Card ${position} is theory: do not return question, options or answer.`];
    }
    if (exercise === "choice") {
      return [
        ...roleRules,
        `Card ${position} is exercise choice: return exactly 3 or 4 options.`,
        `Card ${position} options must be full alternatives, not only binary tokens.`,
        `Card ${position} options may be plain text or code; if an option is code, use { id, kind: "code", language, code }.`
      ];
    }
    if (exercise === "gap") {
      const gapField = text(item?.resource) === "code" ? "code" : "text";
      const resourceLabel = text(item?.resource) === "code" ? "code gap" : "paragraph gap";
      return [
        ...roleRules,
        `Card ${position} is ${resourceLabel}: ${gapField} must contain at least one [[answer]] typed-recall pattern or [[answer::answer|wrong1|wrong2]] option pattern.`,
        `Card ${position} is ${resourceLabel}: prefer [[answer]] when the learner must retrieve the answer; use options only when discrimination among plausible alternatives is the learning evidence.`,
        `Card ${position} is ${resourceLabel}: write the completion target inside ${gapField} itself, not as a plain question stem.`,
        `Card ${position} is ${resourceLabel}: do not use question, options or answer fields, and do not write ___ placeholders.`,
        ...(text(item?.resource) === "code"
          ? [
              `Card ${position} resource code: if code has multiple lines, indent nested lines consistently with spaces.`,
              `Card ${position} resource code: preserve line breaks in code; do not linearize the snippet into one sentence.`
            ]
          : [])
      ];
    }
    if (text(item?.resource) === "code") {
      return [
        ...roleRules,
        `Card ${position} resource code: if code has multiple lines, indent nested lines consistently with spaces.`,
        `Card ${position} resource code: preserve line breaks in code; do not linearize the snippet into one sentence.`
      ];
    }
    if (text(item?.resource) === "matrix") {
      return [
        ...roleRules,
        `Card ${position} resource matrix: return a complete matrix object with values or sequence, not a textual substitute.`,
        `Card ${position} resource matrix: if highlight exists, use only { pattern }, { cells }, { rows } or { columns } inside matrix.highlight.`
      ];
    }
    if (text(item?.resource) === "graph") {
      return [
        ...roleRules,
        `Card ${position} resource graph: return only the structural graph data in vertices and edges; do not invent x/y coordinates.`,
        `Card ${position} resource graph: each vertex should use id and label, and each edge should use from and to.`
      ];
    }
    if (text(item?.resource) === "composite") {
      return [
        ...roleRules,
        `Card ${position} resource composite: return all visible parts inside blocks.`,
        `Card ${position} resource composite: repeat a resource kind when the case needs two parallel objects, such as graph + graph.`,
        `Card ${position} resource composite: keep exactly one choice block for the final answer when exercise is choice.`,
        `Card ${position} resource composite: materialize each compared object in its own block instead of merging two cases into one visual payload.`
      ];
    }
    if (text(item?.resource) === "relation_map") {
      return [
        ...roleRules,
        `Card ${position} resource relation_map: return leftSet, rightSet and relations explicitly instead of simulating the relation in plain text.`,
        `Card ${position} resource relation_map: leftSet/rightSet items should use id and label; relations should use from and to.`
      ];
    }
    if (text(item?.resource) === "plane") {
      return [
        ...roleRules,
        `Card ${position} resource plane: return a complete plane object with explicit coordinates or vectors, not a textual substitute.`,
        `Card ${position} resource plane: for a simple arrow from the origin, prefer vector [x, y] as the primary visual field.`,
        `Card ${position} resource plane: only use x and y when each one is itself a full numeric pair [x, y], never as separate axis scalars or placeholders.`
      ];
    }
    if (text(item?.resource) === "formula") {
      return [
        ...roleRules,
        `Card ${position} resource formula: return notation, accessibleText and a structured expression AST; never return raw HTML, MathML, LaTeX or executable code.`,
        `Card ${position} resource formula: use mathematics for mathematical notation and chemistry for chemical formulas.`,
        `Card ${position} resource formula: accessibleText must verbalize the complete expression without depending on sight.`
      ];
    }
    return roleRules;
  });
}

function buildRepairRules(request = {}, context = {}) {
  if (text(request?.mode) !== "repair") {
    return [];
  }
  const currentCards = Array.isArray(context?.currentCards) ? context.currentCards : [];
  return [
    "This is a repair request.",
    "Use request.prompt as the main instruction for what must change.",
    "Preserve any current card that already fits the plan and the request.",
    "Change only what is necessary to satisfy request.prompt.",
    "Do not rewrite unaffected cards just to vary wording.",
    ...(currentCards.length
      ? ["Use current.currentCards as the baseline for what already exists in the microsequence."]
      : [])
  ];
}

function buildNextBoundaryRules(context = {}) {
  if (!text(context?.next?.title)) {
    return [];
  }
  return [
    "If context.next exists, prepare continuity without teaching the next microsequence in detail.",
    "Do not move the focus of the current microsequence into context.next covers.",
    "Use the final card to create a short bridge into the next planned step."
  ];
}

function buildBranchReturnRules(microsequence = {}, plan = []) {
  if (!text(microsequence?.branchOf)) {
    return [];
  }
  const lastCard = Array.isArray(plan) && plan.length ? plan[plan.length - 1] : null;
  if (text(lastCard?.role) !== "next") {
    return [];
  }
  return [
    "This microsequence is a local support branch.",
    "Use the final card to say explicitly that the next action is to return to the main track or trilha principal.",
    "Prefer an explicit sentence such as 'Retorne agora à trilha principal.' or 'Volte agora à trilha principal.' in the final return card."
  ];
}

function buildTheoryDistributionRules(plan = []) {
  const theoryItems = (Array.isArray(plan) ? plan : []).filter((item) => text(item?.kind) === "theory");
  const practiceItems = (Array.isArray(plan) ? plan : []).filter((item) =>
    ["practice", "practice_more", "fix_error"].includes(text(item?.role))
  );
  if (theoryItems.length < 2) {
    return [];
  }
  const rules = [
    "Distribute the explanation across the available theory cards instead of compressing all theory into the first opening card.",
    "Each theory card should advance one local step: definition, mechanism, example or bridge, not all of them at once."
  ];
  if (practiceItems.length >= 2) {
    rules.push("Because this plan contains extra theory, keep the later practice cards active and specific so consolidation grows with the explanation.");
  }
  return rules;
}

export function buildMicrosequenceGenerationContract({ planningContract, validatedPlan }) {
  const representation = buildMicrosequenceGenerationRepresentation({
    planningContract,
    validatedPlan
  });
  const plan = representation.planning.cardPlan || [];
  const cardSpecificRules = buildCardSpecificRules(plan);
  const request = compactRequest(planningContract?.request);
  const context = compactGenerationContext(planningContract?.context || {});
  if (request.mode !== "repair") {
    context.currentCards = [];
  }
  return {
    task: "bottom_up_card_build",
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
    knownErrors: compactKnownErrors(planningContract?.knownErrors),
    request,
    context,
    plan: structuredClone(plan),
    schemas: schemaFieldsMap(representation.resources.effectiveResourceSchemas),
    rules: [
      "Return only valid JSON.",
      `Return exactly ${plan.length} cards.`,
      "Use exactly the given position, resource, kind and exercise.",
      "Do not add fields outside schemas.",
      "If kind is theory, do not return question, options or answer, even as empty values.",
      "If resource is paragraph and exercise is gap, text must contain at least one [[answer::answer|wrong1|wrong2]] pattern.",
      "If resource is code and exercise is gap, code must contain at least one [[answer::answer|wrong1|wrong2]] pattern.",
      "If exercise is gap, write the completion target inside the main field itself instead of using a plain question stem.",
      "If exercise is choice and resource is not composite, return question, options and answer in the same card.",
      "If resource is composite and exercise is choice, keep the final question, options and answer inside exactly one choice block.",
      "If exercise is choice, return exactly 3 or 4 options.",
      "Each textual choice option must be an object with id and text.",
      "If a choice option is code, use { id, kind: \"code\", language, code }.",
      "Do not use binary option sets like only yes/no or only true/false.",
      "Use after for short follow-up text and inline code with backticks; if you need block content such as code, matrix, table, flow or multi-part continuation, use afterBlocks.",
      "When a card or composite block has a known language, languageTag may use a simple BCP 47 tag; use textDirection rtl only for right-to-left content, ltr only when it must be fixed, and otherwise omit both optional fields.",
      "Do not use ___ placeholders in final cards.",
      "Do not leave the main instructional field empty: paragraph needs text; choice needs question; composite needs blocks; code/table/graph/relation_map/matrix/plane/formula need their own concrete payload.",
      "If the first card is theory, open with a short local explanation before charging the learner with an exercise.",
      "Keep the first theory card short enough for initial study: no long summary block in the opening.",
      "Do not mention guide.exclude in text, question, prompt, options, examples or after, not even as a wrong alternative.",
      "If you need to delimit scope, use generic phrasing such as 'mecanismos mais avançados' without naming excluded terms.",
      "If resource is code and code has multiple lines, indent nested lines consistently with spaces.",
      "Do not ask open-ended questions.",
      "Keep all critical context inside the card.",
      ...buildTheoryDistributionRules(plan),
      ...buildRepairRules(request, context),
      ...buildNextBoundaryRules(context),
      ...buildBranchReturnRules(planningContract?.microsequence, plan),
      ...cardSpecificRules
    ],
    sources: Array.isArray(planningContract?.sources) ? structuredClone(planningContract.sources) : [],
    output: {
      format: "json",
      cardCount: plan.length
    }
  };
}
