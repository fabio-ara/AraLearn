import {
  escapePackageAttribute,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

function normalizedText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function feedbackHtml(feedback) {
  if (feedback === "incomplete") {
    return '<div class="inline-feedback warn" role="alert" aria-live="assertive"><p class="tiny">Escreva uma resposta antes de continuar.</p></div>';
  }
  if (feedback === "recorded") {
    return '<div class="inline-feedback" role="status" aria-live="polite"><p class="tiny">Resposta preenchida.</p></div>';
  }
  return "";
}

export const openResponsePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.response.open",
    version: "1.0.0",
    label: "Resposta aberta",
    purpose: "Pedir que o estudante explique, justifique ou preveja com palavras próprias, sem oferecer alternativas.",
    slots: Object.freeze(["response"]),
    taskOperations: Object.freeze(["explain", "justify", "predict", "interpret"]),
    responseCompatibility: Object.freeze([]),
    academic: academicProfile({
      domains: ["transversal"],
      knowledgeObjects: ["resposta aberta", "explicação produzida"],
      conventions: ["proposta focal", "produção sem alternativas", "sem correção semântica automática"],
      appropriateWhen: [
        "o estudante deve explicar, justificar, prever ou interpretar com palavras próprias"
      ],
      avoidWhen: [
        "a resposta precisa de correção automática exata",
        "selecionar ou completar uma resposta curta é a operação desejada"
      ],
      technologies: ["HTML semântico", "controle nativo multilinha"],
      practiceModes: ["typing"],
      taxonomy: {
        primaryFamilyId: "family.text_language",
        familyIds: ["family.text_language"],
        structureIds: ["structure.prose"],
        specificity: "versatile"
      }
    }),
    limitations: Object.freeze([
      "Aceita a produção, mas não afirma se ela está semanticamente correta."
    ]),
    accessibility: "A proposta rotula um campo multilinha nativo e o retorno de preenchimento é anunciado."
  }),
  authoringContract: Object.freeze({
    intent: "Declare uma proposta focal que peça produção própria; não forneça resposta esperada nem alternativas.",
    required: Object.freeze(["prompt"]),
    optional: Object.freeze(["placeholder"]),
    rules: Object.freeze([
      "A proposta aparece somente neste componente.",
      "O placeholder pode orientar o foco, mas não pode entregar a resposta.",
      "Use feedback separado para oferecer explicação depois da produção."
    ]),
    example: Object.freeze({
      prompt: "Explique com suas palavras por que o switch aprende pela origem e consulta o destino.",
      placeholder: "Relacione origem, tabela MAC e decisão de saída."
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: Object.freeze(["prompt"]),
    properties: Object.freeze({
      prompt: Object.freeze({ type: "string", minLength: 1, maxLength: 3000 }),
      placeholder: Object.freeze({ type: "string", minLength: 1, maxLength: 500 })
    })
  }),
  normalize(data) {
    const prompt = normalizedText(data?.prompt);
    const placeholder = normalizedText(data?.placeholder);
    return {
      prompt,
      ...(placeholder ? { placeholder } : {})
    };
  },
  validate() {
    return [];
  },
  render(data, options = {}) {
    const blockKey = String(options.blockKey || options.instanceId || "package-open-response");
    const promptId = `${blockKey}::prompt`;
    const responseId = `${blockKey}::input`;
    const manualEditing = options.manualEditing === true;
    const reveal = options.revealPracticeAnswers === true;
    const prompt = `<div class="runtime-open-response-prompt" id="${escapePackageAttribute(promptId)}">${renderPackageProse(data.prompt)}</div>`;
    if (manualEditing || reveal) {
      const placeholder = manualEditing && data.placeholder
        ? `<p class="open-response-placeholder">${renderPackageInline(data.placeholder)}</p>`
        : "";
      const note = reveal
        ? '<p class="tiny open-response-note">Resposta aberta, sem correção automática.</p>'
        : '<div class="open-response-preview" aria-hidden="true"></div>';
      return `<section class="runtime-block package-open-response">${prompt}${placeholder}${note}</section>`;
    }
    const value = String(options.responseState?.text ?? "");
    const placeholder = data.placeholder
      ? ` placeholder="${escapePackageAttribute(data.placeholder)}"`
      : "";
    const input = `<label class="visually-hidden" for="${escapePackageAttribute(responseId)}">Sua resposta</label><textarea class="open-response-input" id="${escapePackageAttribute(responseId)}" data-action="open-response-input" data-open-response-block-key="${escapePackageAttribute(blockKey)}" aria-labelledby="${escapePackageAttribute(promptId)}"${placeholder}>${escapePackageAttribute(value)}</textarea>`;
    const feedback = feedbackHtml(options.responseState?.feedback);
    if (feedback && Array.isArray(options.dockExerciseParts)) {
      options.dockExerciseParts.push(feedback);
    }
    return `<section class="runtime-block package-open-response">${prompt}${input}${Array.isArray(options.dockExerciseParts) ? "" : feedback}</section>`;
  },
  accessibleText(data) {
    return `${data.prompt} Resposta aberta.`;
  },
  editableTargets(data) {
    return [
      { path: "prompt", label: "Editar proposta" },
      ...(data.placeholder
        ? [{ path: "placeholder", label: "Editar pista de escrita" }]
        : [])
    ];
  },
  evaluate(_data, answer) {
    const text = normalizedText(answer?.text);
    return { complete: Boolean(text), text };
  }
});
