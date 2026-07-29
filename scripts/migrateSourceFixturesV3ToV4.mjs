import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "espree";

const targets = process.argv.slice(2);
if (!targets.length) {
  throw new Error("Uso: node scripts/migrateSourceFixturesV3ToV4.mjs <arquivo-ou-diretório> [...]");
}

function propertyName(property) {
  if (property?.type !== "Property" || property.computed) return "";
  return property.key.type === "Identifier"
    ? property.key.name
    : String(property.key.value || "");
}

function objectProperty(node, name) {
  return node?.type === "ObjectExpression"
    ? node.properties.find((property) => propertyName(property) === name)
    : null;
}

function literalPropertyValue(node, name) {
  const property = objectProperty(node, name);
  return property?.value?.type === "Literal" ? property.value.value : undefined;
}

function isChoiceObject(node) {
  const answer = objectProperty(node, "answer");
  const options = objectProperty(node, "options");
  if (!answer || !options) return false;
  return literalPropertyValue(node, "resource") === "choice"
    || literalPropertyValue(node, "exercise") === "choice"
    || literalPropertyValue(node, "kind") === "choice";
}

function isResourceObject(node, resource) {
  return literalPropertyValue(node, "resource") === resource
    || literalPropertyValue(node, "kind") === resource;
}

function insertObjectProperty(source, node, propertySource) {
  const offset = node.range[0] + 1;
  const multiline = source.slice(offset, node.range[1]).includes("\n");
  const indent = indentationAt(source, node.range[0]);
  return {
    start: offset,
    end: offset,
    value: multiline ? `\n${indent}  ${propertySource},` : ` ${propertySource},`
  };
}

function inferTreeVariantFromSource(source, node) {
  const fragment = source.slice(node.range[0], node.range[1]);
  if (/(?:Animalia|Plantae|Fungi|Chordata|táxon|taxon)/iu.test(fragment)) return "taxonomy";
  if (/(?:ancestral|clado|linhagem|filogen)/iu.test(fragment)) return "phylogeny";
  if (/(?:sintagma|oração|sentença|constituinte)/iu.test(fragment)) return "syntax";
  if (/(?:diretoria|departamento|gerência|equipe|presidência)/iu.test(fragment)) return "organization";
  return "filesystem";
}

function propertySourceWithout(source, node, omittedNames = []) {
  const omitted = new Set(omittedNames);
  return node.properties
    .filter((property) => !omitted.has(propertyName(property)))
    .map((property) => source.slice(property.range[0], property.range[1]))
    .join(", ");
}

function indentationAt(source, offset) {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^\s*/u)?.[0] || "";
}

function blockIdBase(block) {
  const kind = literalPropertyValue(block, "kind");
  return typeof kind === "string"
    ? kind.replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "").toLowerCase() || "block"
    : "block";
}

function collectChanges(source, ast) {
  const changes = [];

  function migrateBlockArray(property) {
    if (!["blocks", "afterBlocks"].includes(propertyName(property))) return;
    if (property.value?.type !== "ArrayExpression") return;
    const counts = new Map();
    property.value.elements.forEach((block) => {
      if (block?.type !== "ObjectExpression" || objectProperty(block, "id")) return;
      const base = blockIdBase(block);
      const count = (counts.get(base) || 0) + 1;
      counts.set(base, count);
      const id = `${base}-${count}`;
      const offset = block.range[0] + 1;
      const multiline = source.slice(offset, block.range[1]).includes("\n");
      const indent = indentationAt(source, block.range[0]);
      const insertion = multiline
        ? `\n${indent}  id: "${id}",`
        : ` id: "${id}",`;
      changes.push({ start: offset, end: offset, value: insertion });
    });
  }

  function migrateTreeObject(node) {
    if (!isResourceObject(node, "tree") || !objectProperty(node, "nodes")) return;
    const variant = literalPropertyValue(node, "variant") || inferTreeVariantFromSource(source, node);
    if (!objectProperty(node, "variant")) {
      changes.push(insertObjectProperty(source, node, `variant: "${variant}"`));
    }
    const nodes = objectProperty(node, "nodes")?.value;
    if (nodes?.type !== "ArrayExpression") return;
    nodes.elements.forEach((treeNode) => {
      if (treeNode?.type !== "ObjectExpression") return;
      const typeProperty = objectProperty(treeNode, "type");
      if (!typeProperty) return;
      const legacyType = literalPropertyValue(treeNode, "type");
      if (variant === "filesystem" || variant === "file_system") {
        changes.push({
          start: typeProperty.range[0],
          end: typeProperty.range[1],
          value: `entryType: "${legacyType === "folder" ? "directory" : "file"}"`
        });
      } else {
        changes.push({
          start: treeNode.range[0],
          end: treeNode.range[1],
          value: `{ ${propertySourceWithout(source, treeNode, ["type"])} }`
        });
      }
    });
  }

  function migrateGraphObject(node) {
    if (!isResourceObject(node, "graph") ||
        objectProperty(node, "vertices")?.value?.type !== "ArrayExpression" ||
        objectProperty(node, "edges")?.value?.type !== "ArrayExpression") return;
    if (!objectProperty(node, "layout")) {
      changes.push(insertObjectProperty(source, node, 'layout: "auto"'));
    }
    objectProperty(node, "vertices").value.elements.forEach((vertex) => {
      if (vertex?.type !== "ObjectExpression" ||
          (!objectProperty(vertex, "x") && !objectProperty(vertex, "y"))) return;
      changes.push({
        start: vertex.range[0],
        end: vertex.range[1],
        value: `{ ${propertySourceWithout(source, vertex, ["x", "y"])} }`
      });
    });
    objectProperty(node, "edges").value.elements.forEach((edge, index) => {
      if (edge?.type !== "ObjectExpression" || objectProperty(edge, "id")) return;
      changes.push(insertObjectProperty(source, edge, `id: "edge-${index + 1}"`));
    });
  }

  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ObjectExpression") {
      node.properties.forEach(migrateBlockArray);
      migrateTreeObject(node);
      migrateGraphObject(node);
      if (isChoiceObject(node) && !objectProperty(node, "answerIds")) {
        const answer = objectProperty(node, "answer");
        const indent = indentationAt(source, answer.range[0]);
        const answerValue = source.slice(answer.value.range[0], answer.value.range[1]);
        changes.push({
          start: answer.range[0],
          end: answer.range[1],
          value: [
            'selectionMode: "single",',
            `${indent}selectionCriterion: "correct",`,
            `${indent}answerIds: [${answerValue}]`
          ].join("\n")
        });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["parent", "range", "loc"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }

  visit(ast);
  return changes.sort((left, right) => right.start - left.start);
}

async function sourceFiles(target) {
  const absolute = path.resolve(target);
  const stat = await fs.stat(absolute);
  if (stat.isFile()) return [absolute];
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(?:m?js)$/u.test(entry.name) ? [child] : [];
  }));
  return nested.flat();
}

const files = (await Promise.all(targets.map(sourceFiles))).flat();
let changedFiles = 0;
let changeCount = 0;

for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    range: true,
    comment: true
  });
  const changes = collectChanges(source, ast);
  if (!changes.length) continue;
  let result = source;
  changes.forEach((change) => {
    result = `${result.slice(0, change.start)}${change.value}${result.slice(change.end)}`;
  });
  await fs.writeFile(file, result, "utf8");
  changedFiles += 1;
  changeCount += changes.length;
}

console.log(`${changedFiles} arquivos; ${changeCount} alterações AST.`);
