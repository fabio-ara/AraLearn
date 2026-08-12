import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { auditDocumentation } from "../../scripts/auditDocumentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("documentação pública possui links, índice e exemplos neutros", () => {
  assert.deepEqual(auditDocumentation({ root }), []);
});

function temporaryDocumentation() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-doc-audit-"));
  fs.mkdirSync(path.join(temporaryRoot, "docs", "nested"), { recursive: true });
  fs.mkdirSync(path.join(temporaryRoot, "authoring", "platforms"), { recursive: true });
  fs.mkdirSync(path.join(temporaryRoot, "src", "ui"), { recursive: true });
  fs.writeFileSync(path.join(temporaryRoot, "README.md"), "# Produto\n\n[Documentação](docs/README.md)\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "docs", "README.md"), "# Guias\n\n[Guia](guia.md)\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "docs", "guia.md"), "# Guia\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "docs", "nested", "detalhe.md"), "# Detalhe\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "authoring", "README.md"), "# Autoria\n", "utf8");
  return temporaryRoot;
}

test("auditoria percorre documentação e materiais de autoria aninhados", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "authoring", "platforms", "setup.md"),
    "# Configuração\n\n[Ausente](../../missing.md)\n",
    "utf8"
  );
  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(errors.some((error) => error.includes("authoring/platforms/setup.md:3: link inexistente")));
});

test("auditoria alcança texto de interface e fixture publicada não classificada", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(temporaryRoot, "src", "ui", "screen.js"), "export const title = 'Curso SENAI';\n", "utf8");
  const fixtureDirectory = path.join(temporaryRoot, "supabase", "fixtures", "catalog");
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  fs.writeFileSync(path.join(fixtureDirectory, "unexpected.json"), '{"title":"Dataprev"}\n', "utf8");
  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(errors.some((error) => error.includes("src/ui/screen.js:1: instituição particular SENAI")));
  assert.ok(errors.some((error) => error.includes("supabase/fixtures/catalog/unexpected.json:1: instituição particular Dataprev")));
});

test("auditoria detecta hierarquia inválida e títulos públicos duplicados", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(temporaryRoot, "docs", "guia.md"), "# Guia\n\n### Salto\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "docs", "nested", "duplicado.md"), "# Guia\n", "utf8");
  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(errors.some((error) => error.includes("nível de heading salta de H1 para H3")));
  assert.ok(errors.some((error) => error.includes("título público duplicado")));
});
