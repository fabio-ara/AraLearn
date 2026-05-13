# Arquitetura do AraLearn

## Visão geral

AraLearn é um app local-first, offline-first e mobile-first para autoria e estudo em:

```text
curso -> módulo -> lição -> microssequência -> card
```

O contrato público continua simples e legível. A complexidade operacional fica no app.

## Camadas principais

- `contract/`: contrato público e validação;
- `model/` e `render/`: projeção e leitura;
- `editor/`: mutações estruturais;
- `storage/`: persistência local, snapshots e progresso;
- `assist/`: integração com Gemini e Codex local;
- `generation/`: policy, planejamento, prompts, validação e reparo;
- `ui/`: navegação estrutural, estudo e workbench.

## Regra arquitetural da geração

Na trilha de cards, o app controla a operação. A LLM não controla arquitetura didática.

O fluxo atual é:

```text
pedido do usuário
  -> contrato de planejamento
  -> plano curto da LLM
  -> cardPlan determinístico do app
  -> contrato de geração
  -> cards da LLM
  -> reparo determinístico
  -> validação estrutural
  -> validação didática
  -> validação de fonte
  -> adaptação ao contrato público
  -> aplicação direta na microssequência
```

## Weak model mode

`generation/policies/weakModelPolicy.js` centraliza a política operacional para modelo fraco.

Essa policy define:

- quantidade recomendada e máxima de cards;
- tamanhos permitidos;
- recursos base, cautelosos e avançados;
- gating de recursos avançados;
- política de schema;
- política de reparo;
- política de fallback.

## Planejamento determinístico

A etapa de planejamento não recebe autoridade para desenhar os cards.

Ela devolve apenas:

```json
{
  "typeId": "...",
  "sizeId": "...",
  "microsequenceGoal": "...",
  "selectedExtraResourceTypes": [],
  "sourceUsePlan": [],
  "reason": "..."
}
```

Depois disso, o app:

- valida `typeId` e `sizeId`;
- aplica a policy da lição;
- monta o `cardPlan`;
- fixa `position` e `resourceType` por posição.

## Governança da lição

A precedência operacional é fixa:

1. `sourceGuideStructured` da lição;
2. `selectedLessonTopicRefs`;
3. `userPrompt`.

`description` não substitui `sourceGuideStructured`.

`selectedLessonTopicRefs` orienta recorte local e terminologia. Não é tag persistente por padrão.

## Recursos

Base segura:

- `paragraph`
- `block_gap_fill`
- `multiple_choice`

Cautelosos:

- `table`
- `code_editor`

Avançados:

- `flowchart`
- `tree`
- `matrix`
- `plane`

Recursos avançados só entram quando a policy liberar por tag da lição, adequação do tipo e opt-in ou indicação forte.

## Validação

A geração de cards agora separa:

- validação estrutural;
- validação didática;
- validação mínima de fonte.

Isso evita que um único módulo concentre parse, lint didático, grounding e reparo.

## Aplicação direta

A decisão oficial continua sendo aplicação direta.

Não existe prévia privada entre geração e persistência local.

O workbench mostra:

- iteração gerada ativa;
- ação para aceitar;
- ação para excluir.

Excluir usa o histórico local como reversão imediata.

O modo de estudo ignora:

- microssequências `draft`;
- microssequências com `included: false`.

## Codex local

`codex-cli-local` permanece suportado, mas como integração avançada.

Ele não define o fluxo principal do estudante comum e não altera o contrato público.
