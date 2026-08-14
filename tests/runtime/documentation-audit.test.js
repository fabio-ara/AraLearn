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
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "README.md"),
    [
      "# Guias",
      "",
      "[Guia](guia.md)",
      "[Glossário técnico](glossario-tecnico.md)",
      "[Matriz de conformidade técnica](matriz-conformidade-tecnica.md)",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(temporaryRoot, "docs", "guia.md"), "# Guia\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "docs", "glossario-tecnico.md"), "# Glossário técnico\n", "utf8");
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "matriz-conformidade-tecnica.md"),
    "# Matriz de conformidade técnica\n",
    "utf8"
  );
  fs.writeFileSync(path.join(temporaryRoot, "docs", "nested", "detalhe.md"), "# Detalhe\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "authoring", "README.md"), "# Autoria\n", "utf8");
  return temporaryRoot;
}

test("auditoria exige os documentos técnicos e links reais no índice público", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.rmSync(path.join(temporaryRoot, "docs", "glossario-tecnico.md"));
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "README.md"),
    "# Guias\n\n[Guia](guia.md)\n\nmatriz-conformidade-tecnica.md\n",
    "utf8"
  );

  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(errors.includes("docs/glossario-tecnico.md: documento técnico obrigatório ausente"));
  assert.ok(
    errors.includes("docs/README.md: documento técnico obrigatório não indexado: glossario-tecnico.md")
  );
  assert.ok(
    errors.includes("docs/README.md: documento técnico obrigatório não indexado: matriz-conformidade-tecnica.md")
  );
});

test("auditoria detecta afirmações factuais legadas em prosa autoral", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "authoring", "README.md"),
    [
      "# Autoria",
      "",
      "A assistência por API no aplicativo repara recursos selecionados, repara um",
      "card inteiro ou cria exatamente um card.",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "guia.md"),
    "# Guia\n\nOs cursos oficiais ficam uma única vez\nno banco compartilhado.\n",
    "utf8"
  );

  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(
    errors.some(
      (error) =>
        error === "authoring/README.md:3: afirmação legada incorreta sobre a cardinalidade da assistência"
    )
  );
  assert.ok(
    errors.some(
      (error) =>
        error === "docs/guia.md:3: afirmação legada incorreta sobre o armazenamento dos cursos oficiais"
    )
  );
});

test("auditoria não confunde histórico, material gerado ou literais com afirmações atuais", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "guia.md"),
    [
      "# Guia",
      "",
      "Uma operação unitária cria exatamente um card e continua sendo válida.",
      "Os identificadores `aralearn.course.v1`, `aralearn.library.v1` e",
      "`aralearn.resource-library.v1` continuam públicos e distintos.",
      "GPT personalizado, Action, integração MCP, kernel, package, registry e catalog",
      "continuam corretos quando o contexto técnico os desambigua.",
      "",
      "`A assistência cria exatamente um card.` é um literal de teste.",
      "",
      "```text",
      "Os cursos oficiais ficam uma única vez no banco compartilhado.",
      "```",
      "",
      "## Histórico",
      "",
      "A assistência cria exatamente um card.",
      "Os cursos oficiais ficam uma única vez no banco compartilhado.",
      "",
      "## Situação atual",
      "",
      "A assistência pode criar vários cards, conforme o escopo autorizado.",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "matriz-conformidade-tecnica.md"),
    [
      "# Matriz de conformidade técnica",
      "",
      "| Afirmação | Resultado |",
      "| --- | --- |",
      "| A assistência cria exatamente um card por envio. | **Não confirmado.** |",
      ""
    ].join("\n"),
    "utf8"
  );
  const generatedDirectory = path.join(temporaryRoot, "docs", "downloads", "authoring");
  fs.mkdirSync(generatedDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(generatedDirectory, "aralearn-chatgpt-knowledge-core.md"),
    "# Material gerado\n\nOs cursos oficiais ficam uma única vez no banco compartilhado.\n",
    "utf8"
  );

  assert.deepEqual(auditDocumentation({ root: temporaryRoot }), []);
});

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
