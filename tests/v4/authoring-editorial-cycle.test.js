import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTHORING_SERVER_INSTRUCTIONS,
  prepareAuthoringContext
} from "../../supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolDefinition
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const readProjectFile = (relativePath) => readFile(
  new URL(`../../${relativePath}`, import.meta.url),
  "utf8"
);

const [instructions, editorialCycle, semanticAudit, sources, termLedger,
  workspaceProtocol, workspaceIncremental] = await Promise.all([
  readProjectFile("authoring/platforms/chatgpt/INSTRUCTIONS.md"),
  readProjectFile("authoring/core/editorial-cycle.md"),
  readProjectFile("authoring/knowledge/semantic-audit.md"),
  readProjectFile("authoring/core/sources.md"),
  readProjectFile("authoring/knowledge/term-ledger.md"),
  readProjectFile("supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js"),
  readProjectFile("supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js")
]);

function guidanceIds(context) {
  return context.guidance.map(({ id }) => id);
}

test("cenário 1: planejamento grava a estrutura sem cards, apresenta o plano e para", () => {
  const context = prepareAuthoringContext({
    intent: "create",
    targetEntity: "course",
    context: "Planejar um curso completo para iniciante"
  });
  assert.ok(context.recommendedTools.includes("criarEstruturaNoWorkspace"));
  assert.equal(context.recommendedTools.includes("publicarCursoDoWorkspace"), false);
  assert.equal(context.recommendedTools.includes("salvarCardsNaMicrossequencia"), false);
  assert.equal(context.recommendedTools.includes("revisarMicroteoriasDoWorkspace"), false);
  assert.match(context.workflow[0], /somente a etapa editorial pedida/iu);
  assert.match(instructions, /microssequências sem cards/iu);
  assert.match(instructions, /sugira aprovação\s+ou ajuste e pare/iu);
});

test("cenário 2: construção trata parte e microssequência como unidades distintas", () => {
  const context = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "lesson",
    context: "Construir somente a parte 1 aprovada"
  });
  assert.ok(context.recommendedTools.includes("salvarCardsNaMicrossequencia"));
  assert.equal(context.recommendedTools.includes("publicarCursoDoWorkspace"), false);
  assert.match(editorialCycle, /parte.*recorte conversacional/isu);
  assert.match(editorialCycle, /microssequência.*unidade técnica/isu);
  assert.match(instructions, /construa somente a parte pedida/iu);
  assert.match(instructions, /microteoria\s+consolidada.*quantidade de práticas.*resources/isu);
});

test("cenário 3: auditoria recupera somente leituras e não repara", () => {
  const context = prepareAuthoringContext({
    intent: "audit",
    targetEntity: "microsequence",
    context: "Auditar de modo independente a parte persistida"
  });
  assert.ok(guidanceIds(context).includes("independent-pedagogical-audit"));
  assert.ok(guidanceIds(context).includes("formal-practice-anchoring"));
  assert.ok(context.recommendedTools.length > 0);
  for (const name of context.recommendedTools) {
    assert.equal(
      authoringMcpToolDefinition(name).annotations.readOnlyHint,
      true,
      `${name} não é somente leitura.`
    );
  }
  assert.match(instructions, /aja somente como avaliador/iu);
  assert.match(instructions, /não repare/iu);
});

test("cenário 4: reparo parcial recomenda escritas focadas e reauditoria", () => {
  const context = prepareAuthoringContext({
    intent: "repair",
    targetEntity: "card",
    context: "Aprovar somente os problemas 1 e 3"
  });
  assert.ok(guidanceIds(context).includes("authorized-repair"));
  assert.ok(context.recommendedTools.includes("salvarCardNoWorkspace"));
  assert.equal(context.recommendedTools.includes("publicarCursoDoWorkspace"), false);
  assert.match(instructions, /somente os problemas aprovados/iu);
  assert.match(instructions, /altere somente os problemas aprovados/iu);
  assert.match(instructions, /reauditoria.*não repare na mesma rodada/isu);
});

test("cenário 5: pular auditoria não cria gate estrutural", () => {
  assert.match(instructions, /pular auditoria/iu);
  assert.match(editorialCycle, /pular auditoria/iu);
  assert.doesNotMatch(workspaceProtocol, /workspace_ready_requires_separate_review/u);
  assert.doesNotMatch(workspaceIncremental, /workspace_ready_requires_separate_review/u);
  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /sem bloqueio técnico/iu);
});

test("cenários 6 a 10: auditoria cobre bastidor, termos, contexto, ancoragem e carga", () => {
  assert.match(semanticAudit, /“de acordo com o PDF”/u);
  assert.match(semanticAudit, /no próprio card o caso particular/iu);
  assert.match(semanticAudit, /card anterior/iu);
  assert.match(termLedger, /forma expandida e explique sua\s+função/iu);
  assert.match(termLedger, /`pwd` corresponde a `print working directory`/u);
  assert.match(sources, /exercícios da mesma banca/iu);
  assert.match(sources, /operação cognitiva/iu);
  assert.match(semanticAudit, /carga cognitiva/iu);
  assert.match(semanticAudit, /uma decisão principal/iu);
});

test("contexto de banca reserva espaço para ancoragem em criação e ampliação", () => {
  for (const intent of ["create", "extend"]) {
    const context = prepareAuthoringContext({
      intent,
      targetEntity: "course",
      context: "Prova FGV, mesma banca, distratores plausíveis e ancoragem formal"
    });
    assert.ok(guidanceIds(context).includes("formal-practice-anchoring"), intent);
    assert.ok(context.guidance.length <= 8);
  }
});

test("cenário 11: práticas são legíveis sob demanda, sem despejo de JSON", () => {
  assert.match(instructions, /todas,\s+uma amostra, um resource, um tópico ou um erro específico/iu);
  assert.match(instructions, /alternativas ou\s+lacuna, resposta, feedback/iu);
  assert.match(instructions, /Não despeje JSON/iu);
  assert.ok(
    prepareAuthoringContext({ intent: "audit", context: "mostrar práticas" })
      .recommendedTools.includes("listarCardsDaMicrossequencia")
  );
});

test("cenário 12 e contrato MCP: publicação não é prematura e intents são explícitas", () => {
  const create = prepareAuthoringContext({ intent: "create" });
  assert.equal(create.recommendedTools.includes("publicarCursoDoWorkspace"), false);
  assert.match(instructions, /Só execute quando a pessoa pedir/iu);
  assert.match(instructions, /Partes materializadas ficam estudáveis/iu);

  const prepare = authoringMcpToolDefinition("prepararAutoriaAraLearn");
  const intent = prepare.inputSchema.properties.intent;
  assert.ok(intent.enum.includes("audit"));
  assert.ok(intent.enum.includes("repair"));
  assert.match(intent.description, /audit audita ou reaudita sem escrever/iu);
  assert.equal(AUTHORING_WORKSPACE_MCP_TOOLS.length, 30);

  const save = authoringMcpToolDefinition("salvarCardsNaMicrossequencia");
  assert.match(save.description, /não a aprovação pedagógica/iu);
  assert.equal(Object.hasOwn(save.inputSchema.properties, "status"), false);
  const projection = authoringMcpToolDefinition("revisarMicroteoriasDoWorkspace");
  assert.match(projection.description, /resources, tópicos e contagem de práticas/iu);
});
