import {
  createPackageGapMarker,
  escapePackageAttribute,
  renderPackageInline
} from "../../sdk/html.js";

function normalizeAnswer(value) { return String(value ?? "").normalize("NFC").trim(); }

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

function countOccurrences(value, search) {
  if (!search) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(search, offset)) >= 0) {
    count += 1;
    offset += search.length;
  }
  return count;
}

function actionIcon(kind) {
  return kind === "answer"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/></svg>';
}

function feedbackHtml(blockKey, feedback) {
  if (!feedback) return "";
  const key = escapePackageAttribute(blockKey);
  if (feedback === "correct") return `<div class="inline-feedback ok" data-complete-feedback-block-key="${key}"><p class="tiny">Correto.</p></div>`;
  if (feedback === "incomplete") return `<div class="inline-feedback warn" data-complete-feedback-block-key="${key}"><p class="tiny">Complete todas as lacunas.</p></div>`;
  return `<div class="inline-feedback err has-actions" data-complete-feedback-block-key="${key}"><p class="tiny">Incorreto. Tente novamente.</p><div class="feedback-icons"><button class="icon-pill" type="button" data-action="complete-view-answer" data-complete-block-key="${key}" title="Ver resposta" aria-label="Ver resposta">${actionIcon("answer")}</button><button class="icon-pill primary" type="button" data-action="complete-try-again" data-complete-block-key="${key}" title="Tentar de novo" aria-label="Tentar de novo">${actionIcon("retry")}</button></div></div>`;
}

function choicePrompt(data, options) {
  const active = options?.activeTextGapPrompt;
  if (!active || active.blockKey !== options.blockKey) return "";
  const blank = data.blanks[Number(active.blankIndex)];
  if (!blank || blank.responseMode !== "choice") return "";
  const current = options.responseState?.values?.[Number(active.blankIndex)] ?? "";
  const values = [blank.answer, ...(blank.distractors || [])];
  return `<section class="runtime-flow-prompt" data-text-gap-prompt="true" tabindex="-1"><div class="runtime-flow-prompt-head"><span class="runtime-flow-prompt-badge">Opções</span></div><div class="token-options">${values.map((value) => `<button class="token-option${normalizeAnswer(value) === normalizeAnswer(current) ? " active" : ""}" type="button" dir="auto" data-action="text-gap-set-choice" data-complete-block-key="${escapePackageAttribute(options.blockKey)}" data-complete-blank-index="${escapePackageAttribute(active.blankIndex)}" data-text-gap-value="${escapePackageAttribute(value)}">${renderPackageInline(value)}</button>`).join("")}</div></section>`;
}

export const gapResponsePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.response.gap", version: "1.0.0", label: "Lacuna",
    purpose: "Pedir recuperação ou discriminação exatamente no campo semântico declarado pelo conteúdo.", slots: Object.freeze(["response"]),
    cognitiveOperations: Object.freeze(["recall", "complete", "label", "calculate"]), responseCompatibility: Object.freeze([]),
    limitations: Object.freeze(["O package de conteúdo precisa declarar o targetPath como editável por resposta." ]), accessibility: "Cada lacuna tem prompt, rótulo e controle nativo próprios."
  }),
  authoringContract: Object.freeze({ intent: "Declare lacunas com targetInstanceId e targetPath inequívocos, resposta formal e modo.", required: Object.freeze(["blanks"]), optional: Object.freeze(["prompt"]), rules: Object.freeze(["Não codifique lacunas dentro de strings.", "AcceptedAnswers só contém equivalentes formalmente aceitos."]), example: Object.freeze({ prompt: "Complete o termo.", blanks: [{ id: "protocol", targetInstanceId: "body-1", targetPath: "text:protocol", responseMode: "text", answer: "protocolo" }] }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["blanks"], properties: { prompt: { type: "string", maxLength: 2000 }, blanks: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "targetInstanceId", "targetPath", "responseMode", "answer"], properties: { id: { type: "string", minLength: 1 }, targetInstanceId: { type: "string", minLength: 1 }, targetPath: { type: "string", minLength: 1 }, label: { type: "string" }, responseMode: { type: "string", enum: ["text", "choice"] }, answer: { type: "string", minLength: 1 }, acceptedAnswers: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } }, distractors: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } } } } } } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), blanks: (data?.blanks || []).map((blank) => ({ id: String(blank?.id || "").trim(), targetInstanceId: String(blank?.targetInstanceId || "").trim(), targetPath: String(blank?.targetPath || "").trim(), ...(blank?.label ? { label: String(blank.label).trim() } : {}), responseMode: String(blank?.responseMode || "text").trim(), answer: normalizeAnswer(blank?.answer), ...(blank?.acceptedAnswers ? { acceptedAnswers: blank.acceptedAnswers.map(normalizeAnswer) } : {}), ...(blank?.distractors ? { distractors: blank.distractors.map(normalizeAnswer) } : {}) })) }; },
  validate(data) { const errors = []; if (new Set(data.blanks.map(({ id }) => id)).size !== data.blanks.length) errors.push("Lacunas precisam de ids únicos."); data.blanks.forEach((blank) => { if (blank.responseMode === "choice" && (!blank.distractors || blank.distractors.length < 1)) errors.push(`Lacuna ${blank.id} por escolha precisa de distrator.`); if (blank.distractors?.includes(blank.answer)) errors.push(`Lacuna ${blank.id} repete a resposta nos distratores.`); }); return errors; },
  validateCard(card) {
    const errors = [];
    const contents = new Map((card.content || []).map((instance) => [instance.id, instance]));
    const requiredByTarget = new Map();
    (card.response?.data?.blanks || []).forEach((blank) => {
      const instance = contents.get(blank.targetInstanceId);
      if (!instance) {
        errors.push(`Lacuna ${blank.id} aponta para uma instância de conteúdo inexistente.`);
        return;
      }
      const path = fieldPath(blank.targetPath);
      const source = readPath(instance.data, path);
      if (typeof source !== "string") {
        errors.push(`Lacuna ${blank.id} aponta para um campo textual inexistente.`);
        return;
      }
      const key = `${blank.targetInstanceId}\u0000${path}\u0000${blank.answer}`;
      requiredByTarget.set(key, (requiredByTarget.get(key) || 0) + 1);
      if (countOccurrences(source, blank.answer) < requiredByTarget.get(key)) {
        errors.push(`Lacuna ${blank.id} não encontra sua resposta no campo de conteúdo indicado.`);
      }
    });
    return errors;
  },
  prepareCardForSemantics(card) {
    const visible = structuredClone(card);
    (visible.response?.data?.blanks || []).forEach((blank) => {
      const instance = (visible.content || []).find(({ id }) => id === blank.targetInstanceId);
      if (!instance) return;
      const path = fieldPath(blank.targetPath);
      const source = String(readPath(instance.data, path) ?? "");
      const answerIndex = source.indexOf(blank.answer);
      if (answerIndex < 0) return;
      writePath(
        instance.data,
        path,
        source.slice(0, answerIndex) + " […] " + source.slice(answerIndex + blank.answer.length)
      );
    });
    return visible;
  },
  prepareContentInstance(instance, response, options = {}) {
    const data = structuredClone(instance.data || {});
    (response.blanks || []).forEach((blank, index) => {
      if (blank.targetInstanceId !== instance.id) return;
      const path = fieldPath(blank.targetPath);
      const source = String(readPath(data, path) ?? "");
      const answerIndex = source.indexOf(blank.answer);
      if (answerIndex < 0) {
        throw new TypeError(`Lacuna ${blank.id} não encontra sua resposta no campo de conteúdo indicado.`);
      }
      const marker = createPackageGapMarker({
        blockKey: options.responseBlockKey || options.blockKey,
        index,
        responseMode: blank.responseMode,
        value: options.responseState?.values?.[index] ?? ""
      });
      writePath(data, path, source.slice(0, answerIndex) + marker + source.slice(answerIndex + blank.answer.length));
    });
    return data;
  },
  render(data, options = {}) {
    const prompt = choicePrompt(data, options);
    const feedback = feedbackHtml(options.blockKey, options.responseState?.feedback);
    if (Array.isArray(options.dockExerciseParts)) {
      if (prompt) options.dockExerciseParts.push(prompt);
      if (feedback) options.dockExerciseParts.push(feedback);
      return "";
    }
    return prompt + feedback;
  },
  accessibleText(data) { return `${data.prompt || "Complete as lacunas."} ${data.blanks.map((blank) => blank.label || blank.id).join("; ")}`; },
  editableTargets() { return []; },
  evaluate(data, answer) { const values = answer?.values && typeof answer.values === "object" ? answer.values : {}; const results = data.blanks.map((blank) => { const received = normalizeAnswer(values[blank.id]); const accepted = [blank.answer, ...(blank.acceptedAnswers || [])].map(normalizeAnswer); return { id: blank.id, correct: accepted.includes(received), received, expected: blank.answer }; }); return { correct: results.every(({ correct }) => correct), results }; }
});
