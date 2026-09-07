import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";
import { RESOURCE_PACKAGE_REGISTRY as browserRegistry } from "../../src/resources/packages/index.js";
import { RESOURCE_PACKAGE_REGISTRY as edgeRegistry } from "../../supabase/functions/_shared/aralearn/runtime/resources/packages/index.js";

test("browser e Edge derivam catálogo e contrato do mesmo package", () => {
  assert.deepEqual(edgeRegistry.listCatalog(), browserRegistry.listCatalog());
  assert.deepEqual(
    edgeRegistry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0"),
    browserRegistry.getAuthoringContract("aralearn.resource.paragraph", "1.0.0")
  );
});

test("o espelho Edge contém somente módulos alcançados pelas funções e iguais ao fonte corrente", async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const runtimeRoot = path.join(repositoryRoot, "supabase/functions/_shared/aralearn/runtime");
  const pending = [];
  for (const name of ["aralearn-course-api", "aralearn-authoring-action", "aralearn-authoring-mcp"]) {
    const entry = path.join(repositoryRoot, "supabase/functions", name, "index.ts");
    const source = await readFile(entry, "utf8");
    for (const match of source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/gu)) {
      pending.push(path.resolve(path.dirname(entry), match[1]));
    }
  }
  const visited = new Set();
  while (pending.length) {
    const modulePath = pending.pop();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);
    const source = await readFile(modulePath, "utf8");
    const nodes = [parse(source, { ecmaVersion: "latest", sourceType: "module" })];
    while (nodes.length) {
      const node = nodes.pop();
      if (!node || typeof node !== "object") continue;
      const specifier = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"]
        .includes(node.type) ? node.source?.value : null;
      if (typeof specifier === "string" && specifier.startsWith(".")) {
        pending.push(path.resolve(path.dirname(modulePath), specifier));
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) nodes.push(...value);
        else if (value && typeof value === "object") nodes.push(value);
      }
    }
  }
  const entries = await readdir(runtimeRoot, { recursive: true, withFileTypes: true });
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".js"))) {
    const target = path.join(entry.parentPath, entry.name);
    const relative = path.relative(runtimeRoot, target);
    assert.equal(visited.has(target), true, `Espelho sem consumidor Edge: ${relative}`);
    assert.equal(await readFile(target, "utf8"),
      await readFile(path.join(repositoryRoot, "src", relative), "utf8"),
      `Espelho divergente do fonte corrente: ${relative}`);
  }
});
