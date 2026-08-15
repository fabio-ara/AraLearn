import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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

test("interface usa SVG temável e recusa nomes desconhecidos", () => {
  for (const name of [
    "add",
    "arrow-left",
    "arrow-right",
    "cloud",
    "drag",
    "more",
    "panel",
    "play",
    "theme-system",
    "theme-light",
    "theme-dark"
  ]) {
    const icon = renderUiIcon(name);
    assert.match(icon, /<svg/u);
    assert.match(icon, /currentColor/u);
  }
  assert.throws(() => renderUiIcon("inexistente"), /desconhecido/u);
});

test("marca do aplicativo acompanha o tema sem alterar o favicon", async () => {
  const [brand, baseline, index, main, authGate, oauthConsent, homeScreen] = await Promise.all([
    read("../../public/assets/brand/aralearn-mark-monochrome.svg"),
    read("../../public/styles-shell-baseline.css"),
    read("../../public/index.html"),
    read("../../public/main.js"),
    read("../../src/ui/AuthGate.js"),
    read("../../src/ui/OAuthAuthorizationConsent.js"),
    read("../../src/ui/renderHomeScreen.js")
  ]);

  assert.match(brand, /viewBox="0 0 108 108"/u);
  assert.match(brand, /fill="#111418"/u);
  assert.match(brand, /stroke="#ffffff"/u);
  assert.match(
    index,
    /<link rel="icon" type="image\/svg\+xml" href="assets\/brand\/aralearn-mark-monochrome\.svg">/u
  );
  assert.doesNotMatch(index, /brand-assets\.js/u);
  for (const source of [main, authGate, oauthConsent, homeScreen]) {
    assert.match(source, /aralearn-mark-monochrome\.svg/u);
    assert.doesNotMatch(source, /aralearn-mark\.png/u);
  }
  assert.match(
    baseline,
    /^img\[src\$="aralearn-mark-monochrome\.svg"\]\s*\{\s*filter:\s*invert\(1\);/mu
  );
  assert.match(
    baseline,
    /^:root\[data-color-mode="dark"\]\s+img\[src\$="aralearn-mark-monochrome\.svg"\]\s*\{\s*filter:\s*none;/mu
  );
});

test("launcher Android mantém o kanji escuro na zona segura sobre fundo claro", async () => {
  const [background, foreground, adaptive, adaptiveRound, legacy, legacyRound] =
    await Promise.all([
      read("../../android/app/src/main/res/values/ic_launcher_background.xml"),
      read("../../android/app/src/main/res/drawable/aralearn_launcher_foreground.xml"),
      read("../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"),
      read("../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"),
      read("../../android/app/src/main/res/mipmap-anydpi/ic_launcher.xml"),
      read("../../android/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml")
    ]);

  assert.match(background, /#F7F8FA/u);
  assert.match(foreground, /viewportWidth="108"[\s\S]*viewportHeight="108"/u);
  assert.match(foreground, /pivotX="54"[\s\S]*pivotY="54"/u);
  assert.match(foreground, /scaleX="0\.8"[\s\S]*scaleY="0\.8"/u);
  assert.match(foreground, /strokeColor="#FF111418"/u);
  assert.doesNotMatch(foreground, /#FFFFFFFF/u);

  for (const icon of [adaptive, adaptiveRound]) {
    assert.match(icon, /<background[^>]+ic_launcher_background/u);
    assert.match(icon, /<foreground[^>]+aralearn_launcher_foreground/u);
    assert.match(icon, /<monochrome[^>]+aralearn_launcher_foreground/u);
  }
  for (const icon of [legacy, legacyRound]) {
    assert.match(icon, /fillColor="#FFF7F8FA"/u);
    assert.match(icon, /strokeColor="#FF111418"/u);
    assert.match(icon, /scaleX="0\.8"[\s\S]*scaleY="0\.8"/u);
  }
});
