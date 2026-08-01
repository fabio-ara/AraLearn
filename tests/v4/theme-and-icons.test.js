import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { buildEntityEditorModel } from "../../src/ui/entityEditorModel.js";
import { renderActionMenuOverlay } from "../../src/ui/renderActionMenuOverlay.js";
import { renderUiIcon } from "../../src/ui/renderUiIcons.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function themeHarness({ stored = null, systemDark = false } = {}) {
  const values = new Map(stored ? [["aralearn.ui.theme", stored]] : []);
  const mediaListeners = [];
  const events = [];
  const themeMeta = {
    content: "",
    setAttribute(name, value) {
      if (name === "content") this.content = value;
    }
  };
  const media = {
    matches: systemDark,
    addEventListener(type, listener) {
      if (type === "change") mediaListeners.push(listener);
    }
  };
  class CustomEventValue {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  const context = {
    document: {
      documentElement: { dataset: {} },
      querySelector: () => themeMeta
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    matchMedia: () => media,
    CustomEvent: CustomEventValue,
    dispatchEvent: (event) => events.push(event),
    Object
  };
  context.globalThis = context;
  return { context, events, media, mediaListeners, themeMeta, values };
}

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/giu).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("tema aplica a preferência antes do CSS e acompanha o sistema sem gravar estado redundante", async () => {
  const source = await read("../../public/theme-bootstrap.js");
  const harness = themeHarness();
  vm.runInNewContext(source, harness.context);

  assert.deepEqual({ ...harness.context.document.documentElement.dataset }, {
    themePreference: "system",
    colorMode: "light"
  });
  assert.equal(harness.themeMeta.content, "#f7f8fa");
  assert.equal(harness.values.size, 0);

  const explicit = harness.context.AraLearnTheme.setPreference("dark");
  assert.deepEqual({ ...explicit }, { preference: "dark", mode: "dark" });
  assert.equal(harness.values.get("aralearn.ui.theme"), "dark");
  assert.equal(harness.events.at(-1).type, "aralearn:themechange");

  harness.context.AraLearnTheme.setPreference("system");
  assert.equal(harness.values.size, 0);
  harness.media.matches = true;
  harness.mediaListeners[0]();
  assert.equal(harness.context.document.documentElement.dataset.colorMode, "dark");
});

test("tokens têm modos explícitos, contraste AA e nenhum alias do tema anterior", async () => {
  const [tokens, styles, baseline, index] = await Promise.all([
    read("../../public/styles-tokens.css"),
    read("../../public/styles.css"),
    read("../../public/styles-shell-baseline.css"),
    read("../../public/index.html")
  ]);

  assert.match(tokens, /:root\[data-color-mode="dark"\]/u);
  assert.doesNotMatch(
    tokens,
    /--(?:surface|text|border|action|focus|input|status|shadow-card|shadow-floating|scrollbar|theme-color)[\w-]*:\s*(?:#|rgb)/u
  );
  assert.ok(contrast("#1f2328", "#f7f8fa") >= 4.5);
  assert.ok(contrast("#59636e", "#f7f8fa") >= 4.5);
  assert.ok(contrast("#f0f3f6", "#111418") >= 4.5);
  assert.ok(contrast("#b8c0ca", "#111418") >= 4.5);
  assert.ok(contrast("#ffffff", "#0b57d0") >= 4.5);
  assert.ok(contrast("#08111f", "#8ab4f8") >= 4.5);
  assert.doesNotMatch(styles + baseline, /--(?:bg-[012]|surface-[012]|line(?:-soft)?|accent(?:-strong|-ink|-soft)?|field-bg|field-border)\s*:/u);
  assert.ok(index.indexOf('src="theme-bootstrap.js"') < index.indexOf('href="styles-tokens.css"'));
});

test("interface usa SVG temável e recusa silenciosamente nenhum nome desconhecido", () => {
  for (const name of ["add", "attachment", "cloud", "drag", "more", "play", "theme-system", "theme-light", "theme-dark"]) {
    const icon = renderUiIcon(name);
    assert.match(icon, /<svg/u);
    assert.match(icon, /currentColor/u);
  }
  assert.throws(() => renderUiIcon("inexistente"), /desconhecido/u);

  const model = buildEntityEditorModel({
    project: { courses: [] },
    entityEditor: { kind: "home-actions" }
  });
  const markup = renderActionMenuOverlay(model);
  assert.match(markup, /action-menu-svg-icon/u);
  assert.doesNotMatch(markup, /&#\d+;|[☁⋯▶＋]/u);
});
