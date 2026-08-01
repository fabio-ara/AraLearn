(function initializeAraLearnTheme(globalObject) {
  "use strict";

  const STORAGE_KEY = "aralearn.ui.theme";
  const PREFERENCES = Object.freeze(["system", "light", "dark"]);
  const documentValue = globalObject.document;
  const root = documentValue?.documentElement || null;
  const media = typeof globalObject.matchMedia === "function"
    ? globalObject.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function normalizePreference(value) {
    return PREFERENCES.includes(value) ? value : "system";
  }

  function readPreference() {
    try {
      return normalizePreference(globalObject.localStorage?.getItem(STORAGE_KEY));
    } catch {
      return "system";
    }
  }

  function resolveMode(preference) {
    if (preference === "dark" || preference === "light") return preference;
    return media?.matches ? "dark" : "light";
  }

  function apply(preference = readPreference()) {
    const normalized = normalizePreference(preference);
    const mode = resolveMode(normalized);
    if (root) {
      root.dataset.themePreference = normalized;
      root.dataset.colorMode = mode;
    }
    const themeMeta = documentValue?.querySelector?.('meta[name="theme-color"]');
    themeMeta?.setAttribute("content", mode === "dark" ? "#111418" : "#f7f8fa");
    return Object.freeze({ preference: normalized, mode });
  }

  function setPreference(value) {
    const preference = normalizePreference(value);
    try {
      if (preference === "system") globalObject.localStorage?.removeItem(STORAGE_KEY);
      else globalObject.localStorage?.setItem(STORAGE_KEY, preference);
    } catch {
      // A escolha continua válida nesta sessão quando o armazenamento local está indisponível.
    }
    const state = apply(preference);
    globalObject.dispatchEvent?.(new globalObject.CustomEvent("aralearn:themechange", { detail: state }));
    return state;
  }

  function getState() {
    return Object.freeze({
      preference: normalizePreference(root?.dataset?.themePreference || readPreference()),
      mode: root?.dataset?.colorMode === "dark" ? "dark" : "light"
    });
  }

  const onSystemChange = () => {
    if (getState().preference !== "system") return;
    const state = apply("system");
    globalObject.dispatchEvent?.(new globalObject.CustomEvent("aralearn:themechange", { detail: state }));
  };
  media?.addEventListener?.("change", onSystemChange);

  globalObject.AraLearnTheme = Object.freeze({
    preferences: PREFERENCES,
    getState,
    setPreference
  });
  apply();
})(globalThis);
