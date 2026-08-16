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
  assert.match(context.workflow[0], /somente a etapa editorial autorizada/iu);
  assert.match(instructions, /microssequências sem\s+cards/iu);
  assert.match(instructions, /aprovação materialmente necessária.*record_approved_plan/isu);
  assert.match(context.workflow[0], /Espere decisão.*somente quando.*material/isu);
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
  assert.match(instructions, /Parte autorizada.*uma microssequência por vez/isu);
  assert.match(editorialCycle, /microteorias.*quantidades de práticas.*resources/isu);
});

test("cenário 3: auditoria lê, registra achados e não repara conteúdo", () => {
  const context = prepareAuthoringContext({
    intent: "audit",
    targetEntity: "microsequence",
    context: "Auditar de modo independente a parte persistida"
  });
  assert.ok(guidanceIds(context).includes("independent-pedagogical-audit"));
  assert.ok(guidanceIds(context).includes("design-conformance-audit"));
  assert.ok(context.recommendedTools.length > 0);
  for (const name of context.recommendedTools) {
    if (["gerirContinuidadeDaAutoria", "gerirDesenhoInstrucional"].includes(name)) continue;
    assert.equal(
      authoringMcpToolDefinition(name).annotations.readOnlyHint,
      true,
      `${name} não é somente leitura.`
    );
  }
  assert.ok(context.recommendedTools.includes("gerirContinuidadeDaAutoria"));
  assert.match(instructions, /Auditoria não autoriza reparo/iu);
  assert.match(instructions, /reauditoria relê o estado corrente.*independente/iu);
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
  assert.match(instructions, /reparo só altera findings aprovados/iu);
  assert.match(instructions, /reauditoria relê o estado corrente.*independente/iu);
});

test("cenário 5: pular auditoria não cria gate estrutural", () => {
  assert.match(editorialCycle, /pular auditoria/iu);
  assert.doesNotMatch(workspaceProtocol, /workspace_ready_requires_separate_review/u);
  assert.doesNotMatch(workspaceIncremental, /workspace_ready_requires_separate_review/u);
  assert.match(AUTHORING_SERVER_INSTRUCTIONS, /sem parada automática/iu);
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
  assert.match(semanticAudit, /Nunca destaque apenas o sufixo/iu);
});

test("microteoria progride sem pré-requisitos e não se condensa para reduzir cards", () => {
  assert.match(instructions, /Teoria desenvolve.*não é resumo/iu);
  assert.match(instructions, /Quantidade de cards.*consequência.*nunca meta pedagógica/isu);
  assert.match(
    AUTHORING_SERVER_INSTRUCTIONS,
    /Quantidade de cards, chamadas ou armazenamento não autoriza condensar teoria/iu
  );
  assert.match(semanticAudit, /Fidelidade à fonte não\s+justifica reproduzir sua densidade/iu);
  assert.doesNotMatch(continuity, /(?:limite|teto).*oito cards/iu);
  assert.match(continuity, /progressão.*payload.*menor limite causal/isu);
  assert.match(
    domainPatterns,
    /associação entre um nome e um endereço.*hierarquia, registros distribuídos e resolução/isu
  );

  const context = prepareAuthoringContext({
    intent: "extend",
    targetEntity: "microsequence",
    context: "Explicar a microteoria sem pré-requisito, com exemplo concreto e progressão"
  });
  const elaboration = context.guidance.find(({ id }) => id === "explanatory-elaboration");
  assert.ok(elaboration);
  assert.match(elaboration.text, /Teoria não é resumo/iu);
  assert.match(elaboration.text, /linguagem comum.*formulação técnica/isu);
  assert.match(elaboration.text, /exemplos, contrastes ou limites/iu);
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
  const context = prepareAuthoringContext({ intent: "audit", context: "mostrar práticas" });
  const presentation = context.guidance.find(({ id }) => id === "practice-presentation");
  assert.ok(presentation);
  assert.match(presentation.text, /Quando a pessoa pedir práticas.*releia.*cards/isu);
  assert.match(presentation.text, /resposta, feedback/iu);
  assert.match(presentation.text, /não despeje JSON/iu);
  assert.ok(context.recommendedTools.includes("listarCardsDaMicrossequencia"));
});

test("cenário 12 e contrato MCP: publicação não é prematura e intents são explícitas", () => {
  const create = prepareAuthoringContext({ intent: "create" });
  assert.equal(create.recommendedTools.includes("publicarCursoDoWorkspace"), false);
  assert.match(instructions, /publicarCursoDoWorkspace` apenas quando a pessoa pedir/iu);
  assert.match(workflow, /Materializar cards permite.*estud/isu);

  const prepare = authoringMcpToolDefinition("prepararAutoriaAraLearn");
  const intent = prepare.inputSchema.properties.intent;
  assert.ok(intent.enum.includes("audit"));
  assert.ok(intent.enum.includes("repair"));
  assert.match(intent.description, /audit audita ou reaudita sem alterar conteúdo ou estrutura/iu);
  assert.equal(AUTHORING_WORKSPACE_MCP_TOOLS.length, 30);

  const save = authoringMcpToolDefinition("salvarCardsNaMicrossequencia");
  assert.match(save.description, /imediatamente renderizável/iu);
  assert.equal(Object.hasOwn(save.inputSchema.properties, "status"), false);
  assert.equal(
    AUTHORING_WORKSPACE_MCP_TOOLS.some(({ name }) => name === "revisarMicroteoriasDoWorkspace"),
    false
  );
  const design = authoringMcpToolDefinition("gerirDesenhoInstrucional");
  assert.match(design.description, /análise.*ResourceSet.*manifesto/isu);
});

test("continuidade retoma estado persistido sem depender da conversa", () => {
  assert.match(instructions, /lerWorkspaceDeAutoria.*view: "resume"/isu);
  assert.match(instructions, /sem reconstruir estado pela conversa/iu);
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
  for (const document of [editorialCycle, semanticAudit, mcpGuide]) {
    assert.match(document, /list_comments/iu);
    assert.match(document, /list_observations/iu);
    assert.match(document, /achados? compact/iu);
  }
  assert.match(mcpGuide, /pendingCorrectionRequestId/iu);
  assert.match(
    mcpGuide,
    /link_finding_correction.*escrita confirmada/isu
  );
  assert.match(mcpGuide, /vincul[ea] a\s+correção.*escrita confirmada/isu);
  assert.match(editorialCycle, /reaudite/iu);
  assert.match(editorialCycle, /targetPartId.*limitada a uma Parte/isu);
  assert.match(workflow, /link_finding_correction.*retira.*repair_findings/isu);
  assert.match(mcpGuide, /reauditoria usa outro mandato `audit`/iu);
});

test("notas, achados e vínculos de correção permanecem inequívocos", () => {
  for (const document of [workflow, semanticAudit, mcpGuide]) {
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

test("gap usa alvo textual formal e não marcador embutido", () => {
  assert.match(cardsAndResources, /aralearn\.resource\.paragraph/u);
  assert.match(cardsAndResources, /targetInstanceId/u);
  assert.match(cardsAndResources, /targetPath/u);
  assert.match(cardsAndResources, /não codifique lacunas em strings/iu);
  assert.doesNotMatch(cardsAndResources, /\{gap:[^}]+\}/u);
});
