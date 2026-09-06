import { getCorrectExerciseOptionIds } from "../../../core/exerciseOptions.js";
import { bindPackageResponseControls as bind } from "../../sdk/responseInteraction.js";

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
