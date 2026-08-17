import { academicProfile } from "../../sdk/academic.js";
import {
  createPackageGapMarker,
  escapePackageAttribute,
  renderPackageActionIcon
} from "../../sdk/html.js";

function normalizedAnswer(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

function fieldPath(value) {
  return String(value || "").split(":", 1)[0].trim();
}

function pathSegments(path) {
  return (String(path || "").match(/[^.[\]]+|\[(\d+)\]/gu) || []).map((segment) => (
    segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment
  ));
}

function readPath(root, path) {
  return pathSegments(path).reduce((value, segment) => value?.[segment], root);
}

function writePath(root, path, value) {
  const parts = pathSegments(path);
  let target = root;
  parts.slice(0, -1).forEach((segment) => { target = target?.[segment]; });
  const last = parts.at(-1);
  if (!target || last === undefined) return;
  target[last] = value;
}

function locateTargetAnswers(source, targets) {
  const claimed = [];
  return targets.map(({ target, index }) => {
    let offset = 0;
    let start = -1;
    while ((start = source.indexOf(target.answer, offset)) >= 0) {
      const end = start + target.answer.length;
      if (!claimed.some((range) => start < range.end && end > range.start)) {
        const location = { start, end, target, index };
        claimed.push(location);
        return location;
      }
      offset = start + 1;
    }
    throw new TypeError(
      `Alvo de ordenação ${target.id} não encontra uma ocorrência livre da resposta no campo indicado.`
    );
  });
}

function replaceLocatedAnswers(source, locations, replacement) {
  return [...locations]
    .sort((left, right) => right.start - left.start)
    .reduce((value, location) => (
      value.slice(0, location.start) + replacement(location) + value.slice(location.end)
    ), source);
}

function countOccurrences(source, search) {
  let count = 0;
  let offset = 0;
  while (search && (offset = source.indexOf(search, offset)) >= 0) {
    count += 1;
    offset += 1;
  }
  return count;
}

function markdownRanges(source) {
  const ranges = [];
  for (const pattern of [
    /`[^`]+`/gu,
    /\*\*[^*]+\*\*/gu,
    /(?<!\*)\*[^*]+\*(?!\*)/gu,
    /!?\[[^\]]+\]\([^)]+\)/gu
  ]) {
    for (const match of String(source || "").matchAll(pattern)) {
      ranges.push({ start: Number(match.index), end: Number(match.index) + match[0].length });
    }
  }
  return ranges;
}

function targetTouchesMarkdown(source, location) {
  if (/[*`]/u.test(location.target.answer) || /!?\[[^\]]+\]\([^)]+\)/u.test(location.target.answer)) {
    return true;
  }
  return markdownRanges(source).some((range) => (
    location.start <= range.end && location.end >= range.start
  ));
}

function normalizedOrder(data, responseState) {
  const ids = data.targets.map(({ id }) => id);
  const received = Array.isArray(responseState?.order)
    ? responseState.order.map(String)
    : [];
  if (received.length === ids.length &&
      new Set(received).size === ids.length &&
      received.every((id) => ids.includes(id))) {
    return received;
  }
  return [...ids.slice(1), ids[0]];
}

function feedbackHtml(blockKey, feedback) {
  if (!feedback) return "";
  const key = escapePackageAttribute(blockKey);
  if (feedback === "correct") {
    return '<div class="inline-feedback ok"><p class="tiny">Correto.</p></div>';
  }
  return `<div class="inline-feedback err has-actions"><p class="tiny">A ordem ainda não está correta.</p><div class="feedback-icons"><button class="icon-pill" type="button" data-action="ordering-view-answer" data-response-block-key="${key}" title="Ver resposta" aria-label="Ver resposta">${renderPackageActionIcon("answer")}</button><button class="icon-pill primary" type="button" data-action="ordering-try-again" data-response-block-key="${key}" title="Tentar de novo" aria-label="Tentar de novo">${renderPackageActionIcon("retry")}</button></div></div>`;
}

function groupedTargets(data, instanceId) {
  const grouped = new Map();
  data.targets.forEach((target, index) => {
    if (target.targetInstanceId !== instanceId) return;
    const path = fieldPath(target.targetPath);
    if (!grouped.has(path)) grouped.set(path, []);
    grouped.get(path).push({ target, index });
  });
  return grouped;
}

function practiceValueLabel(target, value, options) {
  return typeof options?.practiceValueLabel === "function"
    ? options.practiceValueLabel(target.targetInstanceId, fieldPath(target.targetPath), value)
    : String(value ?? "");
}

function markerForSlot(data, slotIndex, order, options) {
  const itemById = new Map(data.targets.map((target) => [target.id, target]));
  const item = itemById.get(order[slotIndex]) || data.targets[slotIndex];
  const visibleValues = data.targets.map((target) => (
    practiceValueLabel(target, target.answer, options)
  ));
  const layoutText = visibleValues.reduce((widest, candidate) => (
    candidate.length > widest.length ? candidate : widest
  ), "");
  return createPackageGapMarker({
    responseMode: "ordering",
    blockKey: options.responseBlockKey || options.blockKey,
    itemId: item.id,
    slotIndex,
    totalSlots: data.targets.length,
    value: practiceValueLabel(item, item.answer, options),
    layoutText,
    canMoveLeft: slotIndex > 0,
    canMoveRight: slotIndex < data.targets.length - 1
  });
}

function readingPosition(card, registry, target, locationsByIdentity) {
  const instanceIndex = (card.content || []).findIndex(({ id }) => id === target.targetInstanceId);
  const instance = card.content[instanceIndex];
  const path = fieldPath(target.targetPath);
  const practiceIndex = (registry.practiceTargets(instance) || [])
    .findIndex((candidate) => candidate.path === path);
  const identity = `${target.targetInstanceId}\u0000${target.targetPath}`;
  return [instanceIndex, practiceIndex, locationsByIdentity.get(identity)?.start ?? -1];
}

function comparePosition(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export const orderingResponsePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.response.ordering",
    version: "3.0.0",
    label: "Ordenação",
    purpose: "Pedir que o estudante reconstrua a ordem de expressões nos próprios campos textuais em que elas são lidas.",
    slots: Object.freeze(["response"]),
    taskOperations: Object.freeze(["order", "reconstruct-process", "sequence-causes"]),
    responseCompatibility: Object.freeze([]),
    academic: academicProfile({
      domains: ["transversal"],
      knowledgeObjects: ["ordem de expressões", "procedimento reconstruído"],
      conventions: ["expressões nos campos de origem", "movimento para esquerda ou direita", "conjunto preservado"],
      appropriateWhen: ["reconstruir a ordem entre ao menos duas expressões textuais é a evidência de aprendizagem"],
      avoidWhen: ["a ordem é arbitrária", "o conteúdo depende de leitura vertical ou espacial"],
      technologies: ["HTML semântico", "controles de movimento acessíveis"],
      practiceModes: ["ordering"],
      content: false
    }),
    limitations: Object.freeze([
      "Cada alvo precisa pertencer a um campo textual que declare a modalidade ordering.",
      "Não use para diagramas ou para ordem meramente decorativa."
    ]),
    accessibility: "Cada expressão conserva sua posição anunciada e oferece botões nomeados de movimento para esquerda e direita."
  }),
  authoringContract: Object.freeze({
    intent: "Aponte ao menos duas expressões já visíveis em resources textuais e declare os alvos na ordem correta de leitura.",
    required: Object.freeze(["targets"]),
    optional: Object.freeze([]),
    rules: Object.freeze([
      "Cada alvo declara id, targetInstanceId, targetPath e a resposta presente no campo.",
      "Use um sufixo de ocorrência em targetPath quando mais de uma expressão pertence ao mesmo campo.",
      "Liste os alvos na ordem correta em que os campos e ocorrências são lidos.",
      "Use somente expressões de texto plano, fora e afastadas de delimitadores Markdown.",
      "Use somente campos cujo practiceTargets declare ordering."
    ]),
    example: Object.freeze({
      targets: [
        { id: "prepare", targetInstanceId: "step-1", targetPath: "text", answer: "Preparar" },
        { id: "execute", targetInstanceId: "step-2", targetPath: "text", answer: "Executar" }
      ]
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["targets"],
    properties: {
      targets: {
        type: "array",
        minItems: 2,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "targetInstanceId", "targetPath", "answer"],
          properties: {
            id: { type: "string", minLength: 1 },
            targetInstanceId: { type: "string", minLength: 1 },
            targetPath: { type: "string", minLength: 1 },
            answer: { type: "string", minLength: 1 }
          }
        }
      }
    }
  }),
  normalize(data) {
    return {
      targets: (data?.targets || []).map((target) => ({
        id: String(target?.id || "").trim(),
        targetInstanceId: String(target?.targetInstanceId || "").trim(),
        targetPath: String(target?.targetPath || "").trim(),
        answer: String(target?.answer || "").normalize("NFC").trim()
      }))
    };
  },
  validate(data) {
    const errors = [];
    const ids = data.targets.map(({ id }) => id);
    const destinations = data.targets.map(({ targetInstanceId, targetPath }) => (
      `${targetInstanceId}\u0000${targetPath}`
    ));
    const answers = data.targets.map(({ answer }) => normalizedAnswer(answer));
    if (new Set(ids).size !== ids.length) {
      errors.push("Alvos de ordenação precisam de ids únicos.");
    }
    if (new Set(destinations).size !== destinations.length) {
      errors.push("Cada alvo de ordenação precisa de targetInstanceId + targetPath únicos.");
    }
    if (new Set(answers).size !== answers.length) {
      errors.push("Alvos de ordenação precisam de respostas textuais distintas.");
    }
    const byField = new Map();
    data.targets.forEach((target) => {
      const key = `${target.targetInstanceId}\u0000${fieldPath(target.targetPath)}`;
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key).push(target);
    });
    byField.forEach((targets) => {
      if (targets.length > 1 && targets.some(({ targetPath }) => !targetPath.includes(":"))) {
        errors.push("Alvos no mesmo campo precisam de sufixos de ocorrência distintos em targetPath.");
      }
    });
    return errors;
  },
  validateCard(card, registry) {
    const errors = [];
    const contents = new Map((card.content || []).map((instance) => [instance.id, instance]));
    const locationsByIdentity = new Map();
    const targetsByField = new Map();
    const visibleAnswers = [];
    card.response.data.targets.forEach((target, index) => {
      const instance = contents.get(target.targetInstanceId);
      if (!instance) {
        errors.push(`Alvo de ordenação ${target.id} aponta para uma instância de conteúdo inexistente.`);
        return;
      }
      const path = fieldPath(target.targetPath);
      const declaredTarget = registry.practiceTargets(instance)
        .find((candidate) => candidate.path === path && candidate.modes.includes("ordering"));
      if (!declaredTarget) {
        errors.push(`Alvo de ordenação ${target.id} aponta para um campo que não declara ordering.`);
        return;
      }
      const source = readPath(instance.data, path);
      if (typeof source !== "string") {
        errors.push(`Alvo de ordenação ${target.id} aponta para um campo textual inexistente.`);
        return;
      }
      visibleAnswers.push(normalizedAnswer(
        registry.practiceValueLabel(instance, path, target.answer)
      ));
      const key = `${target.targetInstanceId}\u0000${path}`;
      if (!targetsByField.has(key)) targetsByField.set(key, { source, entries: [] });
      targetsByField.get(key).entries.push({ target, index });
    });
    if (new Set(visibleAnswers).size !== visibleAnswers.length) {
      errors.push("Alvos de ordenação precisam permanecer visualmente distintos.");
    }
    targetsByField.forEach(({ source, entries }) => {
      try {
        entries.forEach(({ target }) => {
          if (countOccurrences(source, target.answer) !== 1) {
            throw new TypeError(
              `Alvo de ordenação ${target.id} precisa corresponder a uma única ocorrência no campo indicado.`
            );
          }
        });
        locateTargetAnswers(source, entries).forEach((location) => {
          if (targetTouchesMarkdown(source, location)) {
            throw new TypeError(
              `Alvo de ordenação ${location.target.id} precisa ser texto plano fora da marcação Markdown.`
            );
          }
          locationsByIdentity.set(
            `${location.target.targetInstanceId}\u0000${location.target.targetPath}`,
            location
          );
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    });
    if (!errors.length) {
      const positions = card.response.data.targets.map((target) => (
        readingPosition(card, registry, target, locationsByIdentity)
      ));
      if (positions.some((position, index) => (
        index > 0 && comparePosition(positions[index - 1], position) > 0
      ))) {
        errors.push("Alvos de ordenação precisam seguir a ordem de leitura dos resources e das ocorrências.");
      }
    }
    if (!errors.length) {
      card.response.data.targets.forEach((target, index) => {
        const instance = contents.get(target.targetInstanceId);
        if (!registry.materializesOrdering(instance, card.response, index)) {
          errors.push(`Alvo de ordenação ${target.id} não materializa exatamente um controle visível no renderer do package.`);
        }
      });
    }
    return errors;
  },
  prepareCardForSemantics(card) {
    const visible = structuredClone(card);
    (visible.content || []).forEach((instance) => {
      groupedTargets(visible.response.data, instance.id).forEach((targets, path) => {
        const source = String(readPath(instance.data, path) ?? "");
        const locations = locateTargetAnswers(source, targets);
        writePath(instance.data, path, replaceLocatedAnswers(source, locations, () => " […] "));
      });
    });
    return visible;
  },
  prepareContentInstance(instance, response, options = {}) {
    const data = structuredClone(instance.data || {});
    const order = normalizedOrder(response, options.responseState);
    groupedTargets(response, instance.id).forEach((targets, path) => {
      const source = String(readPath(data, path) ?? "");
      const locations = locateTargetAnswers(source, targets);
      writePath(data, path, replaceLocatedAnswers(
        source,
        locations,
        ({ index }) => markerForSlot(response, index, order, options)
      ));
    });
    return data;
  },
  render(data, options = {}) {
    if (options.manualEditing === true) return "";
    const feedback = feedbackHtml(options.blockKey, options.responseState?.feedback);
    if (Array.isArray(options.dockExerciseParts)) {
      if (feedback) options.dockExerciseParts.push(feedback);
      return "";
    }
    return feedback;
  },
  accessibleText() {
    return "Ordene as expressões nos campos indicados.";
  },
  editableTargets() {
    return [];
  },
  evaluate(data, answer) {
    const expectedOrder = data.targets.map(({ id }) => id);
    const order = Array.isArray(answer?.order) ? answer.order.map(String) : [];
    return {
      correct: order.length === expectedOrder.length &&
        order.every((id, index) => id === expectedOrder[index]),
      order,
      expectedOrder
    };
  }
});
