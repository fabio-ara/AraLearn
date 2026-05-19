# Manual final para reconstrução do AraLearn orientado a LLM via API barata

**Base de decisão:** commit `92d0e9b` — “Documenta simplificação do motor e da UX”  
**Finalidade:** especificação normativa para o Codex implementar uma reconstrução radical do AraLearn, sem preservar compatibilidade com o motor antigo como fluxo principal.

---

## 1. Objetivo da intervenção

Reconstruir o AraLearn para que ele funcione de modo realista com LLMs via API baratas, como Gemini 2.5 Flash/Flash-Lite, DeepSeek, Qwen, Kimi, Z.ai ou providers compatíveis com OpenAI.

A nova arquitetura deve abandonar o `CourseForge` como fluxo principal.

A decisão central é:

```text
Top-down = planejar trilha até microssequências, sem cards.
Bottom-up = gerar, corrigir, expandir e consolidar uma microssequência por vez.
```

O AraLearn não deve tentar fazer:

```text
material bruto extenso → curso completo → cards completos → auditorias globais
```

O AraLearn deve fazer:

```text
contrato de escopo pequeno → trilha planejada → microssequência selecionada → cards locais
```

---

## 2. Diagnóstico da versão atual

O commit `92d0e9b` documenta a simplificação, mas a implementação ainda mantém o motor antigo e a UI antiga.

Problemas principais:

1. O `README.md` já reconhece a separação top-down/bottom-up, mas ainda descreve geração a partir de “intenção e fontes” e mantém contrato, contexto, auditoria, reparo e aplicação controlada de patch como promessa central.
2. O `CourseForge` ainda existe como motor multifase.
3. A UI atual de geração ainda é baseada em curso/módulo/lição + textarea + anexos + botão “Gerar estrutura”, não em contrato de escopo por módulos com chips de “O que entra” e “O que não entra”.
4. O contrato atual ainda exige `cards` em toda microssequência e usa status `draft`/`ready`, o que conflita com microssequências planejadas sem cards.
5. A semântica interna (`domainMap`, `domainRefs`, `practiceVariantRefs`, `didacticPurpose`, `coverageRole`, `assessmentTargets`) continua pesada demais para o caminho principal com LLM barata.

---

## 3. O que deve ser removido como fluxo principal

Remover, desativar ou substituir completamente o fluxo atual baseado em `src/generation/courseForge/`.

O diretório `src/generation/courseForge/` pode ser apagado se não houver dependência indispensável. Caso existam utilitários reaproveitáveis, movê-los para módulos novos e menores, sem manter o nome `courseForge`.

Remover como fluxo de produto:

```text
src/generation/courseForge/courseForgeRunner.js
src/generation/courseForge/courseForgePhases.js
src/generation/courseForge/courseForgePrompts.js
src/generation/courseForge/courseForgeCards.js
src/generation/courseForge/courseForgeBackstageAudit.js
src/generation/courseForge/courseForgeSourceLedger.js
src/generation/courseForge/courseForgeScope.js
src/generation/courseForge/courseForgeValidation.js
src/generation/courseForge/courseForgePatch.js
src/generation/courseForge/courseForgeApply.js
src/generation/courseForge/courseForgeIr.js
src/generation/courseForge/courseForgeIntervention.js
src/generation/courseForge/courseForgeSourcePack.js
```

O problema não é a existência de funções úteis nesses arquivos. O problema é o desenho do fluxo: arquitetura, auditoria, reparo, source ledger, course graph, lesson governance, microssequências, cards, reparos didáticos e auditorias de aderência estão acoplados em um pipeline extenso demais para uso comum.

O `CourseForge` não deve ser rebatizado. Ele deve deixar de ser a arquitetura principal.

---

## 4. O que deve ser preservado

Preservar ou reimplementar, sem acoplar ao CourseForge:

```text
runtime de cards
renderização dos recursos públicos
validação determinística
patching seguro, se estiver simples
versionamento de microssequência
fake provider para testes
provider Codex CLI
configuração de modelos
harness local
scripts npm úteis
```

O provider Codex CLI deve continuar existindo. Ele deve ser adaptado aos novos modos:

```text
plan-scope
generate-microsequence
improve-microsequence
add-practice
create-support
generate-next
```

Não deve mais usar `courseforge-phase` como modo central.

---

## 5. Nova organização de código

Criar ou reorganizar os módulos assim:

```text
src/
  core/
    ids.js
    text.js
    storageKeys.js
    patch.js
    validation.js

  domain/
    scopeContract.js
    scopeTerms.js
    aralearnProject.js
    plannedCourse.js
    microsequence.js
    microsequenceVersion.js
    cards.js
    resources.js

  generation/
    providers/
      providerRegistry.js
      fakeProvider.js
      geminiProvider.js
      codexCliProvider.js
      openAiCompatibleProvider.js

    schemas/
      scopeContractSchema.js
      plannedCourseSchema.js
      bottomUpSchema.js
      cardSchema.js

    topDown/
      planCourseFromScope.js
      buildTopDownPrompt.js
      validatePlannedCourse.js
      plannedCourseToProjectPatch.js

    bottomUp/
      buildContextPacket.js
      generateMicrosequenceCards.js
      improveMicrosequenceVersion.js
      addPracticeToMicrosequence.js
      createSupportMicrosequence.js
      generateNextMicrosequence.js
      validateMicrosequenceCards.js

    prompts/
      topDownPrompt.js
      bottomUpPrompt.js
      improvePrompt.js
      practicePrompt.js
      supportPrompt.js

  ui/
    scopeBuilder/
      renderScopeBuilder.js
      scopeBuilderState.js
      scopeChips.js
      importScopeJson.js

    courseTree/
      renderCourseTree.js

    study/
      renderMicrosequenceStudy.js
      microsequenceActions.js

    providers/
      renderProviderSettings.js

  tests/
    scopeContract.test.js
    topDownPlan.test.js
    bottomUpMicrosequence.test.js
    providerRegistry.test.js
    scopeBuilderUi.test.js
```

Não manter nomenclatura `CourseForge` em código novo.

---

## 6. Novo contrato público do projeto

Substituir por contrato `aralearn.contract` versão 2.

### 6.1. Project

```ts
type AraLearnProjectV2 = {
  contract: "aralearn.contract";
  version: 2;
  kind: "project";
  courses: Course[];
};
```

### 6.2. Course

```ts
type Course = {
  key: string;
  title: string;
  goal?: string;
  evidencePriority: EvidenceKind[];
  modules: Module[];
};
```

### 6.3. Module

```ts
type Module = {
  key: string;
  title: string;
  include: ScopeTerm[];
  exclude: ScopeTerm[];
  notes?: string;
  assessmentStyle: "theoretical" | "practical" | "mixed";
  lessons: Lesson[];
};
```

### 6.4. ScopeTerm

```ts
type ScopeTerm = {
  id: string;
  label: string;
  normalizedLabel: string;
};
```

### 6.5. Lesson

```ts
type Lesson = {
  key: string;
  title: string;
  goal: string;
  microsequences: Microsequence[];
};
```

### 6.6. Microsequence

```ts
type Microsequence = {
  key: string;
  title: string;
  goal: string;
  type: "main" | "support";
  status: "planned" | "generated" | "needs_review" | "ready";
  dependsOn: string[];
  scopeRefs: string[];
  parentMicrosequenceKey?: string;
  supportReason?: string;
  versions: MicrosequenceVersion[];
  activeVersionKey?: string;
};
```

### 6.7. MicrosequenceVersion

```ts
type MicrosequenceVersion = {
  key: string;
  createdAt: string;
  source: "llm" | "manual" | "codex";
  mode: "generate" | "improve" | "more_practice" | "support" | "repair";
  userRequest?: string;
  cards: Card[];
  summary: string;
  validationReport: ValidationReport;
};
```

### 6.8. Card

Manter o card simples e renderizável:

```ts
type Card = {
  key: string;
  title?: string;
  resourceType: ResourceType;
  content: unknown;
  after?: string;
};
```

Recursos públicos mínimos:

```ts
type ResourceType =
  | "say"
  | "table"
  | "code"
  | "flow"
  | "tree"
  | "graph"
  | "block_gap_fill";
```

O recurso `graph` deve ser público e validado, não texto improvisado.

---

## 7. Contrato de escopo

Criar um contrato separado para entrada top-down:

```ts
type ScopeContract = {
  schemaVersion: "aralearn.scope.v1";
  course: {
    title: string;
    goal?: string;
    evidencePriority: EvidenceKind[];
  };
  modules: ScopeModule[];
};
```

```ts
type ScopeModule = {
  title: string;
  include: string[];
  exclude: string[];
  notes?: string;
  assessmentStyle: "theoretical" | "practical" | "mixed";
};
```

```ts
type EvidenceKind =
  | "notebook"
  | "exercise_list"
  | "exam"
  | "syllabus"
  | "booklet"
  | "documentation"
  | "article"
  | "manual"
  | "mixed"
  | "none";
```

Validações obrigatórias:

```text
course.title obrigatório
course.evidencePriority default ["none"]
modules deve ter pelo menos 1 módulo
module.title obrigatório
module.include deve ter pelo menos 1 chip
module.exclude pode ser vazio
assessmentStyle default "mixed"
não permitir chip repetido em include
não permitir chip repetido em exclude
não permitir mesmo normalizedLabel em include e exclude
não permitir módulos com mesmo título normalizado
```

Exemplo válido:

```json
{
  "schemaVersion": "aralearn.scope.v1",
  "course": {
    "title": "Matemática para Informática",
    "goal": "Estudar o conteúdo cobrado na disciplina com prática frequente.",
    "evidencePriority": ["notebook", "exercise_list", "exam"]
  },
  "modules": [
    {
      "title": "Lógica Proposicional",
      "include": [
        "introdução à lógica proposicional",
        "proposições",
        "duas proposições",
        "conectivos",
        "tabela-verdade",
        "xor",
        "equivalências lógicas",
        "inferências lógicas"
      ],
      "exclude": [
        "lógica de predicados",
        "mais de duas proposições"
      ],
      "assessmentStyle": "mixed",
      "notes": "Priorizar resolução passo a passo e exercícios parecidos com os de prova."
    }
  ]
}
```

---

## 8. Nova UI: Criar trilha

Substituir a UI atual de geração.

Nova tela principal:

```text
Criar trilha

Curso
[ Título do curso ]
[ Objetivo opcional ]
[ Evidência principal ]

Módulos
┌ Módulo 1
│ [ Título do módulo ]
│ O que entra
│ [ chip ][ chip ][ + novo chip ]
│ O que não entra
│ [ chip ][ chip ][ + novo chip ]
│ [ Observações opcionais ]
│ [ teórico | prático | misto ]
└

[ + módulo ]

[ Importar JSON ]
[ Gerar trilha ]
```

Regras da UI:

```text
Enter cria chip
botão + cria chip
chip é removível
chip é editável
chip duplicado é recusado
chip em include e exclude ao mesmo tempo é recusado
botão "Gerar trilha" só habilita contrato válido
importação JSON abre prévia editável antes de aplicar
```

Remover da UI principal:

```text
textarea genérico como campo central
anexo como requisito do top-down
seletores pressionáveis curso/módulo/lição no fluxo inicial
"Gerar estrutura" como botão genérico
painel de planejamento didático exposto ao usuário comum
```

Anexos podem existir depois, mas como ação secundária:

```text
Extrair chips de fonte
Extrair fonte-guia
Usar fonte nesta microssequência
```

Não permitir:

```text
anexo bruto → gerar curso completo
```

---

## 9. Novo top-down

Criar:

```text
src/generation/topDown/planCourseFromScope.js
```

Assinatura:

```ts
async function planCourseFromScope({
  scopeContract,
  provider,
  modelId,
  density = "standard"
}): Promise<PlannedCourseOutput>
```

Pipeline permitido:

```text
1. validateScopeContract
2. normalizeScopeTerms
3. buildTopDownPrompt
4. callProviderStructured
5. validatePlannedCourse
6. plannedCourseToProjectPatch
7. applyPatch
```

Não usar:

```text
sourceLedger obrigatório
assessmentProfile obrigatório
courseGraph
lessonGovernance
auditoria LLM global
repair LLM em cadeia
build_cards
audit_cards
repair_cards
```

### 9.1. Saída top-down

```ts
type PlannedCourseOutput = {
  course: {
    title: string;
    goal?: string;
    modules: PlannedModule[];
  };
};

type PlannedModule = {
  title: string;
  lessons: PlannedLesson[];
};

type PlannedLesson = {
  title: string;
  goal: string;
  microsequences: PlannedMicrosequence[];
};

type PlannedMicrosequence = {
  title: string;
  goal: string;
  dependsOnTitles: string[];
  scopeLabels: string[];
};
```

### 9.2. Regras de geração top-down

O modelo deve receber instruções estritas:

```text
Gere apenas estrutura planejada.
Não gere cards.
Não gere conteúdo completo.
Não gere explicações longas.
Não use tópicos de exclude.
Use include como escopo permitido.
Crie progressão didática.
Crie lições pequenas.
Crie microssequências com objetivo operacional.
Dependências só podem apontar para microssequências anteriores.
Retorne JSON válido no schema solicitado.
```

### 9.3. Validação top-down

Verificar deterministamente:

```text
não há cards
curso tem título
módulos existem
lições existem
microssequências existem
toda microssequência tem objetivo
dependsOnTitles só aponta para microssequências anteriores
não há dependência circular
não há título/objetivo com tópico proibido
não há duplicação grosseira de microssequências
scopeLabels pertencem ao include ou são pré-requisito mínimo justificado
```

---

## 10. Novo bottom-up

Criar:

```text
src/generation/bottomUp/
```

Módulos obrigatórios:

```text
buildContextPacket.js
generateMicrosequenceCards.js
improveMicrosequenceVersion.js
addPracticeToMicrosequence.js
createSupportMicrosequence.js
generateNextMicrosequence.js
validateMicrosequenceCards.js
```

### 10.1. Context packet

Toda chamada bottom-up deve usar pacote pequeno:

```ts
type ContextPacket = {
  courseTitle: string;
  courseGoal?: string;
  module: {
    title: string;
    include: string[];
    exclude: string[];
    notes?: string;
    assessmentStyle: "theoretical" | "practical" | "mixed";
  };
  lesson: {
    title: string;
    goal: string;
  };
  currentMicrosequence: {
    key: string;
    title: string;
    goal: string;
    type: "main" | "support";
    dependsOn: {
      key: string;
      title: string;
      summary: string;
    }[];
  };
  neighborMicrosequences: {
    previous?: {
      key: string;
      title: string;
      goal: string;
      summary?: string;
    };
    next?: {
      key: string;
      title: string;
      goal: string;
    };
  };
  allowedResources: ResourceType[];
  density: "standard" | "deep" | "exam";
  userRequest?: string;
};
```

Não enviar curso inteiro. Não enviar todos os cards anteriores. Usar `summary` das versões anteriores.

### 10.2. Ações bottom-up

Implementar cinco ações visíveis:

```text
Gerar cards
Melhorar explicação
Mais prática
Criar complemento
Gerar próxima
```

#### Gerar cards

Usada quando `status = planned`.

Resultado:

```text
nova MicrosequenceVersion
status = generated
activeVersionKey = versão criada
```

#### Melhorar explicação

Usada quando já existe versão ativa.

Exigir motivo:

```text
explicação confusa
faltou passo
exemplo ruim
erro conceitual
linguagem inadequada
muito superficial
outro
```

Resultado:

```text
nova versão completa
não sobrescrever versão anterior
```

#### Mais prática

Não muda o tópico. Acrescenta prática dentro da mesma microssequência.

Regras:

```text
não introduzir próximo assunto
não avançar trilha
não repetir mecanicamente
variar reconhecimento, aplicação, lacuna, erro comum, contraste e consolidação
```

#### Criar complemento

Cria microssequência `support`.

Usar quando:

```text
o usuário não entendeu pré-requisito
há lacuna local
o pedido saiu do tamanho da microssequência atual
é preciso reforço antes de avançar
```

Não inserir automaticamente na trilha principal. Mostrar como reforço vinculado.

#### Gerar próxima

Não exige prompt.

Fluxo:

```text
1. localizar próxima microssequência main planejada
2. verificar se dependências existem
3. gerar cards
4. salvar versão
5. atualizar status
6. abrir a próxima microssequência
```

Se dependência não estiver `generated` ou `ready`, oferecer gerar dependência antes.

---

## 11. Densidade didática

Criar preset:

```ts
type Density = "standard" | "deep" | "exam";
```

Comportamento:

```text
standard = 4 a 6 cards
deep = 6 a 10 cards
exam = 8 a 14 cards
```

A microssequência não deve seguir o padrão pobre:

```text
1 teoria
1 exercício
1 consolidação genérica
```

O padrão recomendado:

```text
microteoria
exemplo resolvido
prática guiada
contraste ou erro comum
prática independente
consolidação
```

Não precisa aparecer tudo sempre, mas a validação deve bloquear geração superficial demais quando `density = deep` ou `exam`.

---

## 12. Providers

Manter a ideia de registry por provider, mas criar interface mais simples:

```ts
type LlmProvider = {
  id: string;
  label: string;
  capabilities: {
    supportsJsonSchema: boolean;
    supportsJsonMode: boolean;
    contextClass: "small" | "medium" | "large" | "local";
  };
  generateStructured<T>(request: {
    modelId: string;
    system: string;
    prompt: string;
    schema: unknown;
    temperature?: number;
  }): Promise<T>;
};
```

Providers mínimos:

```text
fake
gemini
codex-cli
openai-compatible
```

`codex-cli` deve permanecer, mas o payload deve mudar de `mode: "courseforge-phase"` para:

```text
mode: "plan-scope"
mode: "generate-microsequence"
mode: "improve-microsequence"
mode: "add-practice"
mode: "create-support"
mode: "generate-next"
```

---

## 13. Scripts

Alterar `package.json`.

Remover:

```json
"harness:courseforge": "node ./scripts/runCourseForgeHarness.js"
```

Adicionar:

```json
"harness:scope": "node ./scripts/runScopePlanningHarness.js",
"harness:bottom-up": "node ./scripts/runBottomUpHarness.js",
"validate:scope": "node ./src/generation/schemas/validateScopeContract.cli.js",
"smoke:provider": "node ./scripts/runProviderSmoke.js"
```

Manter:

```json
"codex:local": "node ./scripts/aralearnCodexBridge.mjs",
"test": "node --test",
"dev": "node ./scripts/servePublic.js"
```

---

## 14. Documentação a atualizar

Atualizar:

```text
README.md
docs/README.md
docs/arquitetura.md
docs/assistencia-por-ia.md
docs/aralearn-contract.md
docs/uso-do-app.md
docs/rascunhos-e-microssequencias.md
```

Remover ou reescrever referências a:

```text
CourseForge
domainMap como contrato central
domainRefs como eixo do top-down
assessmentTargets ricos no topo
SourceLedger obrigatório
CourseGraph
LessonGovernance
auditoria/reparo global
geração estrutural por prompt/anexo
```

O documento `docs/api-uiux-evolucao-do-motor.md` pode permanecer como histórico, mas deve receber nota no topo:

```text
Este documento registra o diagnóstico que motivou a reconstrução.
A especificação normativa atual está em docs/nova-arquitetura-llm-api.md.
```

Criar:

```text
docs/nova-arquitetura-llm-api.md
```

---

## 15. Testes obrigatórios

Remover ou reescrever:

```text
tests/courseForge.test.js
```

Criar:

```text
tests/scopeContract.test.js
tests/topDownPlan.test.js
tests/plannedCourseValidation.test.js
tests/bottomUpMicrosequence.test.js
tests/contextPacket.test.js
tests/scopeBuilderUi.test.js
tests/providerRegistry.test.js
tests/codexCliProvider.test.js
```

Cobrir obrigatoriamente:

```text
contrato de escopo válido
contrato sem módulo é inválido
módulo sem include é inválido
chip duplicado é inválido
include/exclude com mesmo termo é inválido
top-down não aceita cards
top-down gera microssequências planned
dependsOn só aponta para microssequência anterior
bottom-up gera versão sem apagar versões anteriores
mais prática não muda tópico
criar complemento gera type support
gerar próxima não exige prompt
provider fake funciona
codex-cli continua acessível
```

---

## 16. Critério de aceite

A reconstrução só está correta se:

```text
1. Não existir CourseForge como fluxo principal.
2. Top-down não gerar cards.
3. Usuário conseguir criar curso por título + módulos + chips.
4. Usuário conseguir importar JSON de escopo.
5. Top-down gerar lições e microssequências planejadas.
6. Microssequências planejadas existirem sem cards.
7. Bottom-up gerar cards de uma microssequência.
8. Bottom-up criar nova versão, sem sobrescrever a anterior.
9. Usuário conseguir pedir melhoria.
10. Usuário conseguir pedir mais prática.
11. Usuário conseguir criar complemento.
12. Usuário conseguir gerar próxima microssequência sem prompt livre.
13. domainMap não ser obrigatório nem eixo do top-down.
14. SourceLedger não ser obrigatório.
15. Codex CLI continuar disponível.
16. npm test passar.
17. A UI principal não depender de textarea/anexo para gerar trilha.
18. O storage usar contrato v2.
```

---

## 17. Instrução direta para o Codex

Copie este bloco para o Codex:

```text
Reconstrua o AraLearn conforme a nova arquitetura orientada a LLM via API barata.

O commit 92d0e9b documentou a simplificação, mas a implementação ainda mantém CourseForge, UI de geração estrutural antiga, domainMap como eixo semântico e pipeline multifase. Substitua isso.

Decisões obrigatórias:

1. Remover CourseForge como fluxo principal.
2. Não gerar cards no top-down.
3. Criar contrato de escopo aralearn.scope.v1.
4. Criar contrato público aralearn.contract v2.
5. Permitir microssequências planejadas sem cards.
6. Implementar status de microssequência:
   planned, generated, needs_review, ready.
7. Implementar type de microssequência:
   main, support.
8. Criar UI "Criar trilha" baseada em:
   curso, objetivo, evidência, módulos, chips de "O que entra", chips de "O que não entra", observações e estilo.
9. Substituir textarea/anexo como fluxo principal.
10. Top-down deve gerar:
    curso, módulos, lições, microssequências planejadas, objetivos, ordem e dependências.
11. Bottom-up deve gerar:
    cards de uma microssequência, melhoria, mais prática, complemento e próxima microssequência.
12. Gerar próxima microssequência não deve exigir prompt.
13. Manter provider fake, Gemini/provider externo e Codex CLI.
14. Adaptar Codex CLI para modos novos, não "courseforge-phase".
15. Atualizar testes, docs e package scripts.
16. Não preservar compatibilidade com contrato antigo, salvo import/export explícito futuro. Não fazer migração silenciosa.
17. Executar npm test e corrigir falhas.

Arquitetura esperada:

src/domain/scopeContract.js
src/domain/aralearnProject.js
src/domain/microsequence.js
src/generation/topDown/planCourseFromScope.js
src/generation/topDown/buildTopDownPrompt.js
src/generation/topDown/validatePlannedCourse.js
src/generation/bottomUp/buildContextPacket.js
src/generation/bottomUp/generateMicrosequenceCards.js
src/generation/bottomUp/improveMicrosequenceVersion.js
src/generation/bottomUp/addPracticeToMicrosequence.js
src/generation/bottomUp/createSupportMicrosequence.js
src/generation/bottomUp/generateNextMicrosequence.js
src/ui/scopeBuilder/
src/ui/study/

Critério absoluto:
o novo AraLearn deve ser previsível, barato em tokens, local-first, modular, testável e centrado em microssequências.
```
