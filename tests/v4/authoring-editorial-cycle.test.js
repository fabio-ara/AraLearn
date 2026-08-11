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

const [instructions, editorialCycle, workflow, semanticAudit, cardsAndResources,
  continuity, domainPatterns, mcpGuide, sources, termLedger, workspaceProtocol,
  workspaceIncremental] = await Promise.all([
  readProjectFile("authoring/platforms/chatgpt/INSTRUCTIONS.md"),
  readProjectFile("authoring/core/editorial-cycle.md"),
  readProjectFile("authoring/core/workflow.md"),
  readProjectFile("authoring/knowledge/semantic-audit.md"),
  readProjectFile("authoring/knowledge/cards-and-resources.md"),
  readProjectFile("authoring/knowledge/continuity.md"),
  readProjectFile("authoring/knowledge/domain-patterns.md"),
  readProjectFile("authoring/platforms/chatgpt/MCP_GUIDE.md"),
  readProjectFile("authoring/core/sources.md"),
  readProjectFile("authoring/knowledge/term-ledger.md"),
  readProjectFile("supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js"),
  readProjectFile("supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js")
]);

function guidanceIds(context) {
  return context.guidance.map(({ id }) => id);
}

test("instruções-fonte conservam margem abaixo do limite do ChatGPT", () => {
  assert.ok(instructions.length <= 7_600, `INSTRUCTIONS.md tem ${instructions.length} caracteres.`);
});

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
  assert.match(instructions, /mostre Partes.*espere a decisão/isu);
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
  assert.match(instructions, /construa somente a Parte pedida/iu);
  assert.match(instructions, /microteoria.*contagem de práticas.*resources/isu);
});

test("cenário 3: auditoria lê, registra achados e não repara conteúdo", () => {
  const context = prepareAuthoringContext({
    intent: "audit",
    targetEntity: "microsequence",
    context: "Auditar de modo independente a parte persistida"
  });
  assert.ok(guidanceIds(context).includes("independent-pedagogical-audit"));
  assert.ok(guidanceIds(context).includes("formal-practice-anchoring"));
  assert.ok(context.recommendedTools.length > 0);
  for (const name of context.recommendedTools) {
    if (name === "gerirContinuidadeDaAutoria") continue;
    assert.equal(
      authoringMcpToolDefinition(name).annotations.readOnlyHint,
      true,
      `${name} não é somente leitura.`
    );
  }
  assert.ok(context.recommendedTools.includes("gerirContinuidadeDaAutoria"));
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
  assert.match(instructions, /reauditoria.*não repare na mesma\s+rodada/isu);
});

test("cenário 5: pular auditoria não cria gate estrutural", () => {
  assert.match(instructions, /limitar ou pular etapas/iu);
  assert.match(editorialCycle, /pular auditoria/iu);
  assert.doesNotMatch(workspaceProtocol, /workspace_ready_requires_separate_review/u);
  assert.doesNotMatch(workspaceIncremental, /workspace_ready_requires_separate_review/u);
  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /não cria bloqueio técnico/iu);
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
  assert.match(semanticAudit, /nunca Transmission Control `Protocol \(TCP\)`/u);
  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /nunca marque apenas o sufixo/iu);
});

test("microteoria progride sem pré-requisitos e não se condensa para reduzir cards", () => {
  assert.match(instructions, /Teoria não é resumo/iu);
  assert.match(instructions, /quantidade de cards não é custo a minimizar/iu);
  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /Teoria não é resumo/iu);
  assert.match(semanticAudit, /Fidelidade à fonte não\s+justifica reproduzir sua densidade/iu);
  assert.match(continuity, /limite técnico de oito cards.*decomposição/isu);
  assert.match(
    domainPatterns,
    /associação entre um nome e um endereço.*hierarquia, registros distribuídos e resolução/isu
  );

  const context = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "microsequence",
    context: "Explicar a microteoria sem pré-requisito, com exemplo concreto e progressão"
  });
  const microtheory = context.guidance.find(({ id }) => id === "microtheory-design");
  assert.ok(microtheory);
  assert.match(microtheory.text, /focada.*não significa texto curto ou condensado/iu);
  assert.match(microtheory.text, /linguagem comum.*exemplo concreto.*termo formal/isu);
  assert.match(microtheory.text, /empilhe conceitos novos.*distribua a progressão/iu);
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
  assert.match(instructions, /quando pedidas, localize e releia as práticas/iu);
  assert.match(instructions, /opções\/lacuna, resposta, feedback/iu);
  assert.match(instructions, /Não despeje JSON/iu);
  assert.ok(
    prepareAuthoringContext({ intent: "audit", context: "mostrar práticas" })
      .recommendedTools.includes("listarCardsDaMicrossequencia")
  );
});

test("cenário 12 e contrato MCP: publicação não é prematura e intents são explícitas", () => {
  const create = prepareAuthoringContext({ intent: "create" });
  assert.equal(create.recommendedTools.includes("publicarCursoDoWorkspace"), false);
  assert.match(instructions, /publicarCursoDoWorkspace` somente quando a pessoa pedir distribuição/iu);
  assert.match(instructions, /materializar cards\s+torna essas partes estudáveis/iu);

  const prepare = authoringMcpToolDefinition("prepararAutoriaAraLearn");
  const intent = prepare.inputSchema.properties.intent;
  assert.ok(intent.enum.includes("audit"));
  assert.ok(intent.enum.includes("repair"));
  assert.match(intent.description, /audit audita ou reaudita sem alterar conteúdo ou estrutura/iu);
  assert.equal(AUTHORING_WORKSPACE_MCP_TOOLS.length, 30);

  const save = authoringMcpToolDefinition("salvarCardsNaMicrossequencia");
  assert.match(save.description, /não a aprovação pedagógica/iu);
  assert.equal(Object.hasOwn(save.inputSchema.properties, "status"), false);
  const projection = authoringMcpToolDefinition("revisarMicroteoriasDoWorkspace");
  assert.match(projection.description, /resources, tópicos e contagem de práticas/iu);
});

test("continuidade retoma estado persistido sem depender da conversa", () => {
  assert.match(instructions, /lerWorkspaceDeAutoria.*view: "resume"/isu);
  assert.match(instructions, /chat é descartável/iu);
  assert.match(
    workflow,
    /lista ordenada dos ids exatos (?:de suas|das)\s+microssequências/iu
  );
  assert.match(workflow, /gerirContinuidadeDaAutoria/iu);
  assert.match(mcpGuide, /record_approved_plan.*Partes, decisões e o mandato/isu);
  assert.match(mcpGuide, /replace_stable_brief/iu);
  assert.match(workflow, /brief.*somente contexto\s+estável e fontes/isu);
  assert.match(
    workflow,
    /partes, decisões humanas, mandatos e achados possuem registros\s+próprios/iu
  );
});

test("auditoria persiste decisão e só vincula reparo confirmado", () => {
  for (const document of [instructions, editorialCycle, semanticAudit, mcpGuide]) {
    assert.match(document, /list_comments/iu);
    assert.match(document, /list_observations/iu);
    assert.match(document, /achados? compact/iu);
  }
  assert.match(instructions, /somente os problemas aprovados.*mandato persistido/isu);
  assert.match(mcpGuide, /vincul[ea] a\s+correção.*escrita confirmada/isu);
  assert.match(editorialCycle, /reaudite/iu);
  assert.match(instructions, /auditoria.*limitada.*Parte.*targetPartId/isu);
  assert.match(workflow, /link_finding_correction.*retira.*repair_findings/isu);
  assert.match(mcpGuide, /reauditoria usa outro mandato `audit`/iu);
});

test("notas, achados e vínculos de correção permanecem inequívocos", () => {
  for (const document of [instructions, workflow, semanticAudit, mcpGuide]) {
    assert.match(document, /kinds: \["note"\]/u);
    assert.match(document, /kinds: \["audit_finding"\]/u);
    assert.match(document, /achados(?: de auditoria)? ativos.*resume/isu);
  }
  assert.match(
    mcpGuide,
    /link_comment_correction.*comentário.*estudo.*link_finding_correction.*achado formal/isu
  );
  assert.match(
    workflow,
    /link_comment_correction.*comentário.*estudo.*link_finding_correction.*achado formal/isu
  );
});

test("paragraph com gap usa marcador no texto e definição formal", () => {
  assert.match(cardsAndResources, /"resource": "paragraph"/u);
  assert.match(cardsAndResources, /"text": "P ∧ Q só é verdadeira quando \{gap:condition\}\."/u);
  assert.match(cardsAndResources, /"id": "condition"/u);
  assert.match(cardsAndResources, /servidor compila ambos ao salvar/iu);
  assert.doesNotMatch(
    cardsAndResources,
    /paragraph[^\n]*\{[^}]*"question"/iu
  );
});
