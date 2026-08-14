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
  fs.writeFileSync(
    path.join(temporaryRoot, "README.md"),
    [
      "# Produto",
      "",
      "[Documentação](docs/README.md)",
      "",
      "## O problema educacional",
      "",
      "## Como se estuda",
      "",
      "## Como se cria e revisa conteúdo",
      "",
      "## Funcionamento sem conexão e sincronização",
      "",
      "## Estado e limites",
      "",
      "## Documentação",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "README.md"),
    [
      "# Guias",
      "",
      "[Guia](guia.md)",
      "[Glossário técnico](glossario-tecnico.md)",
      "[Matriz de conformidade técnica](matriz-conformidade-tecnica.md)",
      "[Princípios editoriais](principios-editoriais.md)",
      "",
      "## Começar a usar",
      "",
      "## Estudar o modelo pedagógico",
      "",
      "## Estudar a engenharia",
      "",
      "## Estudar a autoria de cursos",
      "",
      "## Avaliar o artefato",
      "",
      "## Operar e implantar",
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
  fs.writeFileSync(path.join(temporaryRoot, "docs", "principios-editoriais.md"), "# Princípios editoriais\n", "utf8");
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "referencias.bib"),
    "@article{fonte2026,\n  title = {Fonte de teste},\n  year = {2026},\n  url = {https://example.org/fonte}\n}\n",
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
  assert.ok(
    errors.includes("docs/README.md: documento técnico obrigatório não indexado: principios-editoriais.md")
  );
});

test("auditoria rejeita vocabulário de bastidor e integração antes da apresentação do produto", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "README.md"),
    [
      "# Produto",
      "",
      "Integrações MCP e Action estão disponíveis.",
      "",
      "## Visão",
      "",
      "Este texto foi escrito conforme solicitado na issue #42 para uma tese.",
      ""
    ].join("\n"),
    "utf8"
  );

  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(errors.some((error) => error.includes("integração técnica aparece antes da apresentação do produto")));
  assert.ok(errors.some((error) => error.includes("referência a issue")));
  assert.ok(errors.some((error) => error.includes("vocabulário de finalidade acadêmica")));
  assert.ok(errors.some((error) => error.includes("referência ao processo de solicitação")));
});

test("auditoria valida chaves bibliográficas sem confundir texto entre citações", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "guia.md"),
    "# Guia\n\nAfirmação sustentada por duas fontes [@fonte2026; @ausente].\n",
    "utf8"
  );

  const errors = auditDocumentation({ root: temporaryRoot });
  assert.equal(errors.filter((error) => error.includes("citação bibliográfica desconhecida")).length, 1);
  assert.ok(errors.some((error) => error.endsWith("citação bibliográfica desconhecida @ausente")));
  assert.ok(errors.some((error) => error.includes("citação Pandoc exposta ao leitor")));
});

test("auditoria reconhece âncoras bibliográficas explícitas e rejeita chaves legíveis desconhecidas", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "referencias.md"),
    "# Referências\n\n<a id=\"ref-fonte2026\"></a>\n\n## Fonte (2026)\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "docs", "guia.md"),
    [
      "# Guia",
      "",
      "Fonte conhecida ([Fonte (2026)](referencias.md#ref-fonte2026)).",
      "Fonte ausente ([Ausente (2026)](referencias.md#ref-ausente)).",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.appendFileSync(
    path.join(temporaryRoot, "docs", "README.md"),
    "\n[Referências](referencias.md)\n",
    "utf8"
  );

  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(!errors.some((error) => error.includes("âncora inexistente referencias.md#ref-fonte2026")));
  assert.ok(errors.some((error) => error.includes("chave desconhecida ausente")));
});

test("auditoria aceita integrações técnicas depois da apresentação do produto", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(temporaryRoot, "README.md"),
    [
      "# Produto",
      "",
      "Ambiente de estudo e autoria.",
      "",
      "## O problema educacional",
      "",
      "## Como se estuda",
      "",
      "## Como se cria e revisa conteúdo",
      "",
      "## Funcionamento sem conexão e sincronização",
      "",
      "## Estado e limites",
      "",
      "## Documentação",
      "",
      "## Integrações",
      "",
      "MCP e Action são explicados nesta seção.",
      ""
    ].join("\n"),
    "utf8"
  );

  assert.deepEqual(auditDocumentation({ root: temporaryRoot }), []);
});

test("auditoria preserva apresentação do produto e percursos de aprendizagem", (context) => {
  const temporaryRoot = temporaryDocumentation();
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(temporaryRoot, "README.md"), "# Produto\n\nDescrição curta.\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "docs", "README.md"), "# Guias\n", "utf8");

  const errors = auditDocumentation({ root: temporaryRoot });
  assert.ok(errors.some((error) => error.includes("seção de apresentação obrigatória ausente")));
  assert.ok(errors.some((error) => error.includes("percurso de aprendizagem obrigatório ausente")));
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
      "Uma hipótese de pesquisa pode ser explicitamente testada.",
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
