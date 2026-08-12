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
    numericHtmlEntities: matches(text, /&#(?!(?:10|39);)\d+;/gu),
    inlineStyleAttributes: matches(text, /\bstyle\s*=/giu),
    directStyleAssignments: matches(text, /\.style\.[a-z][\w]*\s*=/giu)
  });
}

export function auditCssRules(source, selectorPattern) {
  const text = String(source || "").replace(/\/\*[\s\S]*?\*\//gu, "");
  const rulePattern = /([^{}]+)\{([^{}]*)\}/gu;
  const findings = [];
  let match;
  while ((match = rulePattern.exec(text))) {
    const selector = match[1].trim();
    selectorPattern.lastIndex = 0;
    if (selector.startsWith("@") || !selectorPattern.test(selector)) continue;
    selectorPattern.lastIndex = 0;
    const audit = auditStyleText(match[2]);
    const literalCount = Object.values(audit.literalColors)
      .reduce((total, count) => total + count, 0);
    if (literalCount) {
      findings.push(Object.freeze({ selector, literalColors: audit.literalColors }));
    }
  }
  selectorPattern.lastIndex = 0;
  return Object.freeze({
    rulesWithLiteralColors: findings.length,
    findings: Object.freeze(findings)
  });
}

async function read(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

export async function auditFrontendRepository() {
  const [tokens, styles, baseline, packageRenderer, home, lesson] = await Promise.all([
    read("../public/styles-tokens.css"),
    read("../public/styles.css"),
    read("../public/styles-shell-baseline.css"),
    read("../src/render/renderPackageCard.js"),
    read("../src/ui/renderHomeScreen.js"),
    read("../src/ui/renderLessonScreen.js")
  ]);
  const legacySubmissionSelectors = matches(
    styles,
    /\.catalog-submission(?:s)?-[a-z][\w-]*/giu
  );
  const runtimeStyles = auditCssRules(
    styles,
    /(?:\.runtime-|\.multiple-choice-|\.card-(?:portrait-body|sheet-content|answer-dock)|\.inline-feedback|\.study-(?:reader|progress)|\.remote-central)/gu
  );
  return Object.freeze({
    generatedAt: new Date().toISOString(),
    tokens: auditStyleText(tokens),
    styles: auditStyleText(styles),
    shellBaseline: auditStyleText(baseline),
    packageRenderer: auditUiSourceText(packageRenderer),
    uiMarkup: auditUiSourceText([home, lesson].join("\n")),
    runtimeStyles,
    legacySubmissionSelectors,
    sourceBytes: Object.freeze({
      tokens: (await stat(new URL("../public/styles-tokens.css", import.meta.url))).size,
      styles: (await stat(new URL("../public/styles.css", import.meta.url))).size,
      packageRenderer: (await stat(new URL("../src/render/renderPackageCard.js", import.meta.url))).size
    })
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.stdout.write(`${JSON.stringify(await auditFrontendRepository(), null, 2)}\n`);
}
