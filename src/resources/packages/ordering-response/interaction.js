import { bindPackageResponseControls as bind } from "../../sdk/responseInteraction.js";

export const orderingResponseInteraction = Object.freeze({
  createState(data) {
    const ids = (data.targets || []).map(({ id }) => String(id));
    return { order: ids.length > 1 ? [...ids.slice(1), ids[0]] : ids, feedback: null };
  },
  submit(_data, state, host) {
    const result = host.evaluate({ order: [...state.order] });
    state.feedback = result.correct ? "correct" : "wrong";
    return result.correct === true;
  },
  bind(root, data, host) {
    bind(root, "[data-action='ordering-move']", "click", (node) => {
      const state = host.getState();
      if (!state) return;
      const id = node.getAttribute("data-ordering-item-id");
      const index = state.order.indexOf(id);
      const delta = node.getAttribute("data-ordering-direction") === "left" ? -1 : 1;
      const target = index + delta;
      if (index < 0 || target < 0 || target >= state.order.length) return;
      [state.order[index], state.order[target]] = [state.order[target], state.order[index]];
      state.feedback = null;
      host.focus(".runtime-ordering-slot", { "data-ordering-item-id": id });
      host.render({ preserveFocus: false });
    });
    bind(root, "[data-action='ordering-view-answer']", "click", () => {
      const state = host.getState();
      if (!state) return;
      state.order = (data.targets || []).map(({ id }) => String(id));
      state.feedback = "correct";
      host.render();
    });
    bind(root, "[data-action='ordering-try-again']", "click", () => host.reset());
  }
});
