import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const COLOR_PATTERNS = Object.freeze({
  hex: /(?<!&)#[\da-f]{3,8}\b/giu,
  rgb: /rgba?\(/giu,
  hsl: /hsla?\(/giu
});

function matches(source, pattern) {
  return [...String(source || "").matchAll(pattern)].length;
}

export function auditStyleText(source) {
  const text = String(source || "");
  return Object.freeze({
    bytes: Buffer.byteLength(text, "utf8"),
    lines: text ? text.split(/\r?\n/u).length : 0,
    literalColors: Object.freeze({
      hex: matches(text, COLOR_PATTERNS.hex),
      rgb: matches(text, COLOR_PATTERNS.rgb),
      hsl: matches(text, COLOR_PATTERNS.hsl)
    }),
    customPropertyDeclarations: matches(text, /--[a-z][\w-]*\s*:/giu),
    customPropertyUses: matches(text, /var\(\s*--[a-z][\w-]*/giu),
    importantDeclarations: matches(text, /!important\b/giu)
  });
}

export function auditUiSourceText(source) {
  const text = String(source || "");
  return Object.freeze({
    literalColors: Object.freeze({
      hex: matches(text, COLOR_PATTERNS.hex),
      rgb: matches(text, COLOR_PATTERNS.rgb),
      hsl: matches(text, COLOR_PATTERNS.hsl)
    }),
    numericHtmlEntities: matches(text, /&#\d+;/gu),
    inlineStyleAttributes: matches(text, /\bstyle\s*=/giu),
    directStyleAssignments: matches(text, /\.style\.[a-z][\w]*\s*=/giu)
  });
}

async function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

export async function auditFrontendRepository() {
  const [styles, baseline, runtime, home, lesson, editorModel] = await Promise.all([
    read("../public/styles.css"),
    read("../public/styles-shell-baseline.css"),
    read("../src/render/renderCardRuntime.js"),
    read("../src/ui/renderHomeScreen.js"),
    read("../src/ui/renderLessonScreen.js"),
    read("../src/ui/entityEditorModel.js")
  ]);
  const legacySubmissionSelectors = matches(
    styles,
    /\.catalog-submission(?:s)?-[a-z][\w-]*/giu
  );
  return Object.freeze({
    generatedAt: new Date().toISOString(),
    styles: auditStyleText(styles),
    shellBaseline: auditStyleText(baseline),
    cardRuntime: auditUiSourceText(runtime),
    uiMarkup: auditUiSourceText([home, lesson, editorModel].join("\n")),
    legacySubmissionSelectors,
    sourceBytes: Object.freeze({
      styles: (await stat(new URL("../public/styles.css", import.meta.url))).size,
      cardRuntime: (await stat(new URL("../src/render/renderCardRuntime.js", import.meta.url))).size
    })
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.stdout.write(`${JSON.stringify(await auditFrontendRepository(), null, 2)}\n`);
}
