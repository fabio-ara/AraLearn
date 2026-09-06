import { bindPackageResponseControls as bind } from "../../sdk/responseInteraction.js";

export const openResponseInteraction = Object.freeze({
  createState() { return { text: "", feedback: null }; },
  submit(_data, state, host) {
    const text = String(state.text || "").trim();
    if (!text) {
      state.feedback = "incomplete";
      host.focus("[data-action='open-response-input']");
      return false;
    }
    const result = host.evaluate({ text });
    state.feedback = result.complete ? "recorded" : "incomplete";
    return result.complete === true;
  },
  bind(root, _data, host) {
    bind(root, "[data-action='open-response-input']", "input", (node) => {
      const state = host.getState();
      if (!state) return;
      state.text = String(node.value || "");
      state.feedback = null;
    });
  }
});
