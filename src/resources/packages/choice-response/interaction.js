import { getCorrectExerciseOptionIds } from "../../../core/exerciseOptions.js";
import { bindPackageResponseControls as bind } from "../../sdk/responseInteraction.js";

// O retorno autoral da alternativa marcada é renderizado dentro dela, no painel de leitura.
// No erro, o alvo pertinente é o retorno de uma alternativa marcada INCORRETA do próprio
// bloco: havendo marcada incorreta, só ela pode ser revelada e, se nenhuma delas declarar
// retorno, nada é revelado (não se desvia o olhar para uma marcada correta sem explicação).
// O retorno de uma marcada qualquer só serve quando o erro é por omissão, isto é, quando
// não existe nenhuma marcada incorreta. Sem retorno declarado, nenhum texto é presumido.
// Sem host compatível, o recurso é ignorado: o host decide como revelar.
function revealMarkedReturn(data, state, host) {
  if (typeof host?.reveal !== "function") return;
  const expected = new Set((Array.isArray(data.answerIds) ? data.answerIds : []).map((id) => String(id)));
  const declared = (id) => (data.options || []).some((option) =>
    String(option.id) === String(id) && option.feedback);
  const marked = [...state.selected].map((id) => String(id));
  const incorrect = marked.filter((id) => !expected.has(id));
  const target = incorrect.length
    ? incorrect.find((id) => declared(id))
    : marked.find((id) => declared(id));
  if (!target) return;
  host.reveal("[data-choice-return-option]", {
    "data-choice-return-option": target,
    "data-choice-return-block": host.blockKey
  });
}

export const choiceResponseInteraction = Object.freeze({
  createState() { return { selected: [], feedback: null }; },
  submit(data, state, host) {
    if (!state.selected.length) {
      state.feedback = "incomplete";
      host.focus("[data-action='choice-toggle']", { "data-choice-block-key": host.blockKey });
      return false;
    }
    const result = host.evaluate({ selectedIds: [...state.selected] });
    state.feedback = result.correct ? "correct" : "wrong";
    if (state.feedback === "wrong") revealMarkedReturn(data, state, host);
    return result.correct === true;
  },
  bind(root, data, host) {
    const select = (node, forceSelected = false) => {
      const state = host.getState();
      const id = node.getAttribute("data-choice-option-id");
      if (!state || !id) return;
      const selected = new Set(state.selected);
      if (data.selectionMode === "single") selected.clear();
      if (forceSelected || !state.selected.includes(id)) selected.add(id);
      else selected.delete(id);
      state.selected = [...selected];
      state.feedback = null;
      host.focus("[data-action='choice-toggle']", {
        "data-choice-option-id": id, "data-choice-block-key": host.blockKey
      });
      host.render({ preserveFocus: false });
    };
    bind(root, "[data-action='choice-toggle']", "click", (node) => select(node));
    bind(root, "[data-action='choice-toggle']", "keydown", (node, event) => {
      if (node.getAttribute("role") !== "radio" ||
          !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
      const options = [...(node.closest("[role='radiogroup']")?.querySelectorAll(
        "[data-action='choice-toggle'][role='radio']") || [])];
      const index = options.indexOf(node);
      if (index < 0 || !options.length) return;
      event.preventDefault();
      const delta = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
      select(options[(index + delta + options.length) % options.length], true);
    });
    bind(root, "[data-action='choice-validate']", "click", () => host.submit());
    bind(root, "[data-action='choice-try-again']", "click", () => host.reset());
    bind(root, "[data-action='choice-view-answer']", "click", () => {
      const state = host.getState();
      if (!state) return;
      state.selected = getCorrectExerciseOptionIds(data.options, data.answerIds);
      state.feedback = "correct";
      host.render();
    });
  }
});
