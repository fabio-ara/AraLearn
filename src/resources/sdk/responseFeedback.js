// Fonte única do retorno visível de uma prática. Os packages de resposta e a
// auditoria pedagógica leem daqui para não divergirem sobre o que o estudante
// recebe. Cada retorno autoral declara a condição em que aparece, em termos da
// resposta efetiva, e nenhum consumidor presume o que um estudante viu.

export const RESPONSE_FEEDBACK_STATES = Object.freeze(["correct", "incomplete", "wrong"]);

// Condições do retorno autoral. "marked": a alternativa está marcada, no acerto e no
// erro. "wrong": a decisão da prática (lacuna ou item ordenado) está errada.
export const RESPONSE_FEEDBACK_CONDITIONS = Object.freeze(["marked", "wrong"]);

const DEFAULT_FEEDBACK = Object.freeze({
  "aralearn.response.choice": Object.freeze({
    correct: "Correto.",
    incomplete: "Selecione pelo menos uma resposta.",
    wrong: "As respostas marcadas não correspondem ao conjunto esperado."
  }),
  "aralearn.response.gap": Object.freeze({
    correct: "Correto.",
    incomplete: "Complete todas as lacunas.",
    wrong: "Incorreto. Tente novamente."
  }),
  "aralearn.response.ordering": Object.freeze({
    correct: "Correto.",
    wrong: "A ordem ainda não está correta."
  })
});

export function responseDefaultFeedback(packageId, state) {
  return DEFAULT_FEEDBACK[String(packageId || "")]?.[String(state || "")] || "";
}

function declaredFeedback(packageId, data) {
  const entries = [];
  const add = (condition, scope, id, text) => {
    if (typeof text !== "string" || !text.trim()) return;
    entries.push({ condition, scope, id: String(id ?? ""), text: text.trim() });
  };
  if (packageId === "aralearn.response.choice") {
    (data?.options || []).forEach((option, index) => add("marked", "options[" + index + "]", option?.id, option?.feedback));
  } else if (packageId === "aralearn.response.gap") {
    (data?.blanks || []).forEach((blank, index) => add("wrong", "blanks[" + index + "]", blank?.id, blank?.feedback));
  } else if (packageId === "aralearn.response.ordering") {
    (data?.targets || []).forEach((target, index) => add("wrong", "targets[" + index + "]", target?.id, target?.feedback));
  }
  return entries;
}

// Retorno autoral com escopo da decisão, condição de exibição e texto. A lista
// descreve condições declaradas; não afirma que a mensagem foi vista.
export function responseAuthoredFeedback(packageId, data) {
  return declaredFeedback(packageId, data).map(({ scope, condition, text }) => ({ scope, condition, text }));
}

// Condições por estado. "marked" entra no acerto e no erro porque depende da
// alternativa marcada; "wrong" só entra no erro.
export function responseFeedbackStates(packageId, data) {
  const authored = responseAuthoredFeedback(packageId, data);
  const forState = (state) => {
    const fallback = responseDefaultFeedback(packageId, state);
    return [
      ...(fallback ? [{ origin: "default", text: fallback }] : []),
      ...(state === "incomplete" ? [] : authored.filter(({ condition }) => condition === "marked")
        .map(({ scope, condition, text }) => ({ origin: "author", scope, condition, text }))),
      ...(state === "wrong" ? authored.filter(({ condition }) => condition === "wrong")
        .map(({ scope, condition, text }) => ({ origin: "author", scope, condition, text })) : [])
    ];
  };
  return Object.fromEntries(RESPONSE_FEEDBACK_STATES.map((state) => [state, forState(state)]));
}

// Retorno exibido para a resposta efetiva. markedIds são as alternativas marcadas e
// wrongIds são as decisões erradas; sem a decisão efetiva, só o rótulo do package
// aparece, porque a condição não é presumida.
export function responseFeedbackMessages(packageId, data, state, outcome = {}) {
  const marked = new Set(outcome.markedIds ?? []);
  const wrong = new Set(outcome.wrongIds ?? []);
  const applies = ({ condition, id }) => condition === "marked" ? marked.has(id) : wrong.has(id);
  const fallback = responseDefaultFeedback(packageId, state);
  return [
    ...(fallback ? [{ text: fallback, origin: "default", scope: null }] : []),
    ...declaredFeedback(packageId, data)
      .filter(({ condition }) => condition === "marked" || state === "wrong")
      .filter(applies)
      .map(({ scope, condition, text }) => ({ text, origin: "author", scope, condition }))
  ];
}
