import { normalizeFlowchartShapeKey } from "./flowchartShapes.js";

function clone(value) {
  return structuredClone(value);
}

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function uniqueByValue(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = String(item?.value || "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeOptionList(list) {
  return uniqueByValue(
    (Array.isArray(list) ? list : []).map((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return {
          id: String(item.id || `flow-option-${index}`),
          value: normalizeText(item.value)
        };
      }

      return {
        id: `flow-option-${index}`,
        value: normalizeText(item)
      };
    })
  );
}

function normalizeVariantList(list) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      const source = item && typeof item === "object" && !Array.isArray(item) ? item : { value: item };
      return {
        id: String(source.id || `flow-variant-${index}`),
        value: normalizeText(source.value),
        regex: !!source.regex
      };
    })
    .filter((item) => item.value);
}

function matchAttemptValue(expected, variants, attempt) {
  const normalizedAttempt = normalizeText(attempt);
  if (!normalizedAttempt) {
    return false;
  }

  const candidates = [{ value: normalizeText(expected), regex: false }, ...normalizeVariantList(variants)];
  return candidates.some((candidate) => {
    if (!candidate.value) {
      return false;
    }
    if (candidate.regex) {
      try {
        return new RegExp(candidate.value, "i").test(normalizedAttempt);
      } catch {
        return false;
      }
    }
    return candidate.value.toLowerCase() === normalizedAttempt.toLowerCase();
  });
}

export function flowchartNodeUsesTextChoiceBlank(node) {
  return !!node?.textBlank && Array.isArray(node?.textOptions) && node.textOptions.length > 0;
}

export function flowchartNodeUsesTextInputBlank(node) {
  return !!node?.textBlank && !flowchartNodeUsesTextChoiceBlank(node);
}

export function flowchartLinkUsesLabelChoiceBlank(link) {
  return !!link?.labelBlank && Array.isArray(link?.labelOptions) && link.labelOptions.length > 0;
}

export function flowchartLinkUsesLabelInputBlank(link) {
  return !!link?.labelBlank && !flowchartLinkUsesLabelChoiceBlank(link);
}

export function flowchartProjectionHasPractice(projection) {
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];
  return (
    nodes.some((node) => node?.shapeBlank || node?.textBlank) ||
    links.some((link) => link?.labelBlank)
  );
}

export function createFlowchartExerciseState(projection, currentState = null) {
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];
  const next = currentState && typeof currentState === "object" ? clone(currentState) : {};

  next.shapes = next.shapes && typeof next.shapes === "object" ? next.shapes : {};
  next.texts = next.texts && typeof next.texts === "object" ? next.texts : {};
  next.labels = next.labels && typeof next.labels === "object" ? next.labels : {};
  next.feedback = typeof next.feedback === "string" ? next.feedback : null;

  const nodeIds = new Set();
  nodes.forEach((node) => {
    if (!node?.id) {
      return;
    }
    nodeIds.add(node.id);
    if (!Object.prototype.hasOwnProperty.call(next.shapes, node.id)) {
      next.shapes[node.id] = null;
    }
    if (!Object.prototype.hasOwnProperty.call(next.texts, node.id)) {
      next.texts[node.id] = null;
    }
  });
  Object.keys(next.shapes).forEach((nodeId) => {
    if (!nodeIds.has(nodeId)) {
      delete next.shapes[nodeId];
    }
  });
  Object.keys(next.texts).forEach((nodeId) => {
    if (!nodeIds.has(nodeId)) {
      delete next.texts[nodeId];
    }
  });

  const linkIds = new Set();
  links.forEach((link) => {
    if (!link?.id) {
      return;
    }
    linkIds.add(link.id);
    if (!Object.prototype.hasOwnProperty.call(next.labels, link.id)) {
      next.labels[link.id] = null;
    }
  });
  Object.keys(next.labels).forEach((linkId) => {
    if (!linkIds.has(linkId)) {
      delete next.labels[linkId];
    }
  });

  return next;
}

export function resetFlowchartExerciseState(projection, currentState = null) {
  const next = createFlowchartExerciseState(projection, currentState);
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];

  nodes.forEach((node) => {
    if (node?.shapeBlank) {
      next.shapes[node.id] = null;
    }
    if (node?.textBlank) {
      next.texts[node.id] = null;
    }
  });
  links.forEach((link) => {
    if (link?.labelBlank) {
      next.labels[link.id] = null;
    }
  });
  next.feedback = null;
  return next;
}

export function fillFlowchartExerciseAnswer(projection, currentState = null) {
  const next = createFlowchartExerciseState(projection, currentState);
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];

  nodes.forEach((node) => {
    if (node?.shapeBlank) {
      next.shapes[node.id] = normalizeFlowchartShapeKey(node.shape);
    }
    if (node?.textBlank) {
      next.texts[node.id] = normalizeText(node.text);
    }
  });
  links.forEach((link) => {
    if (link?.labelBlank) {
      next.labels[link.id] = normalizeText(link.label);
    }
  });
  next.feedback = "correct";
  return next;
}

export function validateFlowchartExerciseState(projection, currentState = null) {
  const next = createFlowchartExerciseState(projection, currentState);
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const links = Array.isArray(projection?.links) ? projection.links : [];

  if (!flowchartProjectionHasPractice(projection)) {
    next.feedback = null;
    return { state: next, status: "none" };
  }

  let incomplete = false;
  let incorrect = false;

  nodes.forEach((node) => {
    if (!node?.id) {
      return;
    }

    if (node.shapeBlank) {
      const selectedShape = normalizeFlowchartShapeKey(next.shapes[node.id]);
      const currentShape = normalizeText(next.shapes[node.id]);
      if (!currentShape) {
        incomplete = true;
      } else if (selectedShape !== normalizeFlowchartShapeKey(node.shape)) {
        incorrect = true;
      }
    }

    if (node.textBlank) {
      const selectedText = normalizeText(next.texts[node.id]);
      if (!selectedText) {
        incomplete = true;
      } else if (flowchartNodeUsesTextChoiceBlank(node)) {
        if (!matchAttemptValue(node.text, node.textVariants, selectedText)) {
          incorrect = true;
        }
      } else if (!matchAttemptValue(node.text, node.textVariants, selectedText)) {
        incorrect = true;
      }
    }
  });

  links.forEach((link) => {
    if (!link?.id || !link.labelBlank) {
      return;
    }
    const selectedLabel = normalizeText(next.labels[link.id]);
    if (!selectedLabel) {
      incomplete = true;
    } else if (!matchAttemptValue(link.label, link.labelVariants, selectedLabel)) {
      incorrect = true;
    }
  });

  next.feedback = incorrect ? "incorrect" : incomplete ? "incomplete" : "correct";
  return { state: next, status: next.feedback };
}

export function listFlowchartNodeShapeOptions(node) {
  const options = [
    { id: `shape-correct-${node?.id || "node"}`, value: normalizeFlowchartShapeKey(node?.shape) },
    ...normalizeOptionList(node?.shapeOptions).map((item) => ({
      id: item.id,
      value: normalizeFlowchartShapeKey(item.value)
    }))
  ];
  const seen = new Set();
  return options.filter((item) => {
    if (!item.value || seen.has(item.value)) {
      return false;
    }
    seen.add(item.value);
    return true;
  });
}

export function listFlowchartNodeTextOptions(node) {
  return uniqueByValue([
    { id: `text-correct-${node?.id || "node"}`, value: normalizeText(node?.text) },
    ...normalizeOptionList(node?.textOptions)
  ]);
}

export function listFlowchartLinkLabelOptions(link) {
  return uniqueByValue([
    { id: `label-correct-${link?.id || "link"}`, value: normalizeText(link?.label) },
    ...normalizeOptionList(link?.labelOptions)
  ]);
}
