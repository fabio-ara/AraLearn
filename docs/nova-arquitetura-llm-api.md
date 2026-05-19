# Nova arquitetura LLM/API do AraLearn

## Decisão central

O AraLearn não usa mais um pipeline estrutural longo e caro como fluxo principal.

O desenho atual é:

```text
top-down  = planejar curso -> módulo -> lição -> microssequência
bottom-up = gerar e melhorar cards dentro de uma microssequência
```

Consequências diretas:

- o top-down não gera cards;
- o top-down não depende de anexo bruto como entrada principal;
- o usuário governa o escopo por módulo;
- o bottom-up continua preso à trilha do top-down.

## Entrada principal do top-down

O ponto de partida é `aralearn.scope.v1`.

Estrutura:

- curso
- objetivo opcional
- evidência principal
- módulos
- para cada módulo:
  - `O que entra`
  - `O que não entra`
  - observações
  - estilo de cobrança

Isso reduz custo, melhora previsibilidade e força a LLM a trabalhar com contexto pequeno.

## Saída do top-down

O top-down devolve apenas:

- curso
- módulos
- lições
- microssequências planejadas
- objetivo de lição
- objetivo de microssequência
- dependências locais entre microssequências

As microssequências entram no projeto com:

- `type: "main"`
- `status: "planned"`
- `versions: []`

## Contrato público

O storage agora usa `aralearn.contract` versão 2.

Pontos principais:

- módulos carregam `include` e `exclude` como termos de escopo normalizados;
- lições carregam apenas o necessário para o estudo;
- microssequências têm `status` e `type`;
- versões de microssequência são explícitas;
- cards têm `resourceType` e `content`.

## Bottom-up

Cada operação bottom-up usa apenas um `ContextPacket` local:

- curso
- módulo atual
- lição atual
- microssequência atual
- dependências diretas
- vizinha anterior
- vizinha seguinte
- densidade
- pedido local opcional

Operações visíveis:

- `Gerar cards`
- `Melhorar explicação`
- `Mais prática`
- `Criar complemento`
- `Gerar próxima`

## Providers

Registry atual:

- `fake`
- `gemini`
- `codex-cli`
- `openai-compatible`

O `codex-cli` continua funcionando via bridge local e usa os mesmos modos estruturais do runtime por API.

## UI

A home nova foi substituída por três superfícies pequenas:

- `scopeBuilder`: curso e módulos com chips
- `courseTree`: árvore navegável da trilha
- `study`: painel da microssequência selecionada

Não existe mais o fluxo principal baseado em textarea central e anexos obrigatórios para gerar estrutura.

## O que foi removido da arquitetura principal

- `CourseForge`
- pipeline multifase estrutural antigo
- `domainMap` como eixo obrigatório do top-down
- `SourceLedger` como dependência estrutural
- geração estrutural por prompt livre e anexo bruto
- UI antiga de geração baseada em `Gerar estrutura`

## O que foi preservado

- runtime público dos cards
- recursos públicos renderizáveis
- validação determinística
- versão por microssequência
- bridge local do Codex
- harnesses e testes de fluxo novo

