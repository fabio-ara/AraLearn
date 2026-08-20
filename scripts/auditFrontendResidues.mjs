import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UI_SOURCE_EXTENSIONS = new Set([".html", ".js", ".mjs"]);
const CLASS_NAME = /\.([a-z][\w-]*)/giu;
const SIMPLE_CSS_RULE = /([^{}]+)\{([^{}]*)\}/gu;
const LITERAL_COLOR = /(?<!&)#[\da-f]{3,8}\b|rgba?\(|hsla?\(/giu;
const INTERFACE_GLYPH = /[\u2600-\u27bf]|\p{Extended_Pictographic}|&#(?!(?:10|39);)\d+;/gu;
const DYNAMIC_MODIFIER = /^(?:is-|kind-|mark-|tone-)/u;
const EXTERNAL_RUNTIME_CLASSES = new Set([
  "vega-embed"
]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }));
  return nested.flat();
}

export function referencedClassNames(source) {
  return new Set([...String(source || "").matchAll(/\b[a-z][\w-]{2,}\b/giu)]
    .map((match) => match[0]));
}

function selectorBranches(selector) {
  const branches = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      branches.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  branches.push(selector.slice(start));
  return branches;
}

export function auditCssResidues(css, referencedClasses) {
  const source = String(css || "");
  const orphanRules = [];
  const orphanBranches = [];
  const partialOrphanRules = [];
  const colorRules = [];
  let match;
  SIMPLE_CSS_RULE.lastIndex = 0;
  while ((match = SIMPLE_CSS_RULE.exec(source))) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    const branchRecords = selectorBranches(selector).map((branch) => ({
      selector: branch.trim().replace(/\s+/gu, " "),
      classes: [...new Set([...branch.matchAll(CLASS_NAME)].map((item) => item[1]))]
    }));
    const classes = [...new Set(branchRecords.flatMap((branch) => branch.classes))];
    const branchCannotMatch = (branch) => {
      const branchClasses = branch.classes;
      if (!branchClasses.length) return false;
      if (/:(?:is|where)\(/u.test(selector) && branchClasses.some(
        (className) => referencedClasses.has(className)
      )) return false;
      const structuralClasses = branchClasses.filter((className) => (
        !DYNAMIC_MODIFIER.test(className) && !EXTERNAL_RUNTIME_CLASSES.has(className)
      ));
      return structuralClasses.length > 0 && structuralClasses.some(
        (className) => !referencedClasses.has(className)
      );
    };
    const deadBranches = branchRecords.filter(branchCannotMatch);
    orphanBranches.push(...deadBranches.map((branch) => branch.selector));
    const cannotMatchAnyBranch = deadBranches.length === branchRecords.length;
    if (classes.length && cannotMatchAnyBranch) {
      orphanRules.push(Object.freeze({
        selector: selector.replace(/\s+/gu, " "),
        classes: Object.freeze(classes),
        start: match.index,
        end: SIMPLE_CSS_RULE.lastIndex
      }));
    } else if (deadBranches.length) {
      const deadSelectors = new Set(deadBranches.map((branch) => branch.selector));
      const leadingWhitespace = match[1].match(/^\s*/u)?.[0] || "";
      const liveSelectors = branchRecords
        .filter((branch) => !deadSelectors.has(branch.selector))
        .map((branch) => branch.selector);
      partialOrphanRules.push(Object.freeze({
        start: match.index,
        end: SIMPLE_CSS_RULE.lastIndex,
        replacement: `${leadingWhitespace}${liveSelectors.join(",\n")} {${match[2]}}`
      }));
    }
    const colors = match[2].match(LITERAL_COLOR) || [];
    if (colors.length) {
      colorRules.push(Object.freeze({
        selector: selector.replace(/\s+/gu, " "),
        count: colors.length
      }));
    }
  }
  SIMPLE_CSS_RULE.lastIndex = 0;
  return Object.freeze({
    orphanRules: Object.freeze(orphanRules),
    orphanBranches: Object.freeze(orphanBranches),
    partialOrphanRules: Object.freeze(partialOrphanRules),
    colorRules: Object.freeze(colorRules),
    literalColors: colorRules.reduce((total, rule) => total + rule.count, 0)
  });
}

export function pruneOrphanCssRules(css, orphanRules, partialOrphanRules = []) {
  let result = String(css || "");
  const rewrites = [
    ...orphanRules.map((rule) => ({ ...rule, replacement: "" })),
    ...partialOrphanRules
  ].sort((left, right) => right.start - left.start);
  for (const rule of rewrites) {
    result = result.slice(0, rule.start) + rule.replacement + result.slice(rule.end);
  }
  let previous;
  do {
    previous = result;
    result = result.replace(/\n?\s*@(?:media|supports|container)[^{]+\{\s*\}/gu, "");
  } while (result !== previous);
  return result.replace(/\n{3,}/gu, "\n\n");
}

export function auditInterfaceGlyphs(source) {
  return (String(source || "").match(INTERFACE_GLYPH) || []).length;
}

export async function auditFrontendResidues({ root = path.resolve(".") } = {}) {
  const sourceFiles = (await Promise.all([
    filesBelow(path.join(root, "src")),
    filesBelow(path.join(root, "public"))
  ])).flat().filter((file) => (
    UI_SOURCE_EXTENSIONS.has(path.extname(file)) &&
    !file.endsWith("styles.css") &&
    !file.endsWith("styles-tokens.css") &&
    !file.endsWith("styles-shell-baseline.css")
  ));
  const source = (await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))).join("\n");
  const interfaceFiles = sourceFiles.filter((file) => (
    file.includes(`${path.sep}src${path.sep}ui${path.sep}`) ||
    path.extname(file) === ".html"
  ));
  const interfaceSource = (await Promise.all(
    interfaceFiles.map((file) => readFile(file, "utf8"))
  )).join("\n");
  const styles = await Promise.all([
    "styles.css",
    "course-authoring.css"
  ].map(async (fileName) => {
    const cssPath = path.join(root, "public", fileName);
    const css = await readFile(cssPath, "utf8");
    const audit = auditCssResidues(css, referencedClassNames(source));
    return { cssPath, css, ...audit };
  }));
  const orphanRules = styles.flatMap((style) => style.orphanRules);
  const orphanBranches = styles.flatMap((style) => style.orphanBranches);
  const partialOrphanRules = styles.flatMap((style) => style.partialOrphanRules);
  const colorRules = styles.flatMap((style) => style.colorRules);
  return {
    styles,
    report: Object.freeze({
      sourceFiles: sourceFiles.length,
      styleFiles: styles.length,
      orphanRules: orphanRules.length,
      orphanBranches: orphanBranches.length,
      orphanBranchSelectors: Object.freeze(orphanBranches),
      orphanSelectors: Object.freeze(orphanRules.map((rule) => rule.selector)),
      colorRules: colorRules.length,
      literalColors: styles.reduce((total, style) => total + style.literalColors, 0),
      interfaceGlyphs: auditInterfaceGlyphs(interfaceSource),
      legacySubmissionSelectors: orphanRules.filter((rule) => (
        rule.classes.some((className) => className.startsWith("catalog-submission"))
      )).length
    }),
    orphanRules,
    partialOrphanRules
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const audit = await auditFrontendResidues();
  if (process.argv.includes("--write")) {
    for (const style of audit.styles) {
      const pruned = pruneOrphanCssRules(
        style.css,
        style.orphanRules,
        style.partialOrphanRules
      );
      await writeFile(style.cssPath, pruned, "utf8");
    }
  }
  process.stdout.write(`${JSON.stringify(audit.report, null, 2)}\n`);
  if (!process.argv.includes("--write") && audit.report.orphanBranches > 0) {
    process.exitCode = 1;
  }
}
