import { bindPackageResponseControls as bind } from "../../sdk/responseInteraction.js";

function editableValue(node) {
  return String(node?.textContent || "").replace(/[\u00a0\u2007]/g, " ")
    .replace(/[\r\n]+/g, "").trim();
}

export const gapResponseInteraction = Object.freeze({
  createState() { return { values: [], feedback: null }; },
  submit(data, state, host) {
    const values = data.blanks.map((_, index) => String(state.values[index] ?? "").trim());
    const index = values.findIndex((value) => !value);
    if (index >= 0) {
      state.feedback = "incomplete";
      const choice = data.blanks[index].responseMode === "choice";
      if (choice) host.setActivePrompt({ blockKey: host.blockKey, blankIndex: index });
      host.focus(choice ? "[data-action='text-gap-set-choice']" : "[data-action='complete-input']", {
        "data-complete-block-key": host.blockKey, "data-complete-blank-index": index
      });
      return false;
    }
    const result = host.evaluate({ values: Object.fromEntries(data.blanks.map((blank, index) => [blank.id, values[index]])) });
    state.feedback = result.correct ? "correct" : "wrong";
    return result.correct === true;
  },
  bind(root, data, host) {
    const inputSelector = "[data-action='complete-input']";
    const update = (node) => {
      const state = host.getState();
      const index = Number(node.getAttribute("data-complete-blank-index"));
      if (!state || !Number.isInteger(index) || index < 0 || index >= data.blanks.length) return;
      const editable = node.getAttribute("contenteditable") === "true";
      state.values = [...state.values];
      state.values[index] = editable ? editableValue(node) : String(node.value ?? node.textContent ?? "");
      state.feedback = null;
      if (editable) node.setAttribute("data-empty", state.values[index] ? "false" : "true");
    };
    root.querySelectorAll(inputSelector).forEach((node) => {
      if (node.getAttribute("contenteditable") === "true") {
        node.setAttribute("data-empty", editableValue(node) ? "false" : "true");
      }
    });
    bind(root, inputSelector, "input", update);
    bind(root, inputSelector, "keydown", (node, event) => {
      if (node.getAttribute("contenteditable") === "true" && event.key === "Enter") event.preventDefault();
    });
    bind(root, inputSelector, "beforeinput", (node, event) => {
      if (node.getAttribute("contenteditable") === "true" &&
          ["insertParagraph", "insertLineBreak"].includes(event.inputType)) event.preventDefault();
    });
    bind(root, inputSelector, "blur", (node) => {
      if (node.getAttribute("contenteditable") !== "true" || editableValue(node)) return;
      node.textContent = "";
      node.setAttribute("data-empty", "true");
      update(node);
    });
    const open = (node) => {
      const state = host.getState();
      const index = Number(node.getAttribute("data-complete-blank-index"));
      if (!state || !Number.isInteger(index) || index < 0 || index >= data.blanks.length) return;
      const attributes = { "data-complete-block-key": host.blockKey, "data-complete-blank-index": String(index) };
      if (state.values[index]) {
        state.values[index] = "";
        state.feedback = null;
        host.setActivePrompt(null);
        host.focus("[data-action='text-gap-open-choice']", attributes);
      } else {
        host.setActivePrompt({ blockKey: host.blockKey, blankIndex: index });
        host.focus("[data-action='text-gap-set-choice']", attributes);
      }
      host.render({ preserveFocus: false });
    };
    bind(root, "[data-action='text-gap-open-choice']", "click", open);
    bind(root, "[data-action='text-gap-open-choice']", "keydown", (node, event) => {
      if (node.getAttribute("role") !== "button" || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      open(node);
    });
    bind(root, "[data-action='text-gap-set-choice']", "click", (node) => {
      const state = host.getState();
      const index = Number(node.getAttribute("data-complete-blank-index"));
      if (!state || !Number.isInteger(index) || index < 0 || index >= data.blanks.length) return;
      state.values[index] = node.getAttribute("data-text-gap-value") || "";
      state.feedback = null;
      host.setActivePrompt(null);
      host.focus("[data-action='text-gap-open-choice']", {
        "data-complete-block-key": host.blockKey, "data-complete-blank-index": String(index)
      });
      host.render({ preserveFocus: false });
    });
    bind(root, "[data-action='complete-validate']", "click", () => host.submit());
    bind(root, "[data-action='complete-try-again']", "click", () => host.reset());
    bind(root, "[data-action='complete-view-answer']", "click", () => {
      const state = host.getState();
      if (!state) return;
      state.values = data.blanks.map((blank) => String(blank.answer || ""));
      state.feedback = "correct";
      host.setActivePrompt(null);
      host.render();
    });
  }
});
