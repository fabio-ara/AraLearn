# Fluxos, prompts e contratos de geração

Este documento descreve a conversa técnica entre o AraLearn e os serviços textuais usados na geração assistida. O foco aqui é operacional: quais envelopes o app monta, que tipo de resposta espera, que validações aplica e em que momento um resultado pode alterar o projeto persistido.

Para a visão pedagógica do produto, leia [Modelo didático](modelo-didatico.md). Para a arquitetura geral, leia [Arquitetura](arquitetura.md). Para o formato persistido final, leia [Contrato público](aralearn-contract.md).

## Princípio operacional

O AraLearn usa serviços textuais por API, mas o projeto persistido continua sendo a fonte de verdade do sistema.

Isso produz uma divisão estável de tarefas:

- o **app** seleciona contexto, monta envelopes, envia a chamada, recompila a resposta e valida o resultado;
- o **serviço textual** interpreta o contrato transitório recebido e preenche apenas o que lhe foi pedido;
- o **projeto persistido** só muda depois de validação.

## Dois fluxos de geração

O runtime principal trabalha com dois fluxos.

### 1. Planejamento estrutural (`top-down`)

Parte de um escopo e produz:

- curso;
- módulos;
- lições;
- microssequências.

Não gera cards.

### 2. Geração local (`bottom-up`)

Parte de uma microssequência aberta e pode:

- gerar cards;
- corrigir a versão atual;
- criar microssequência de apoio;
- gerar a próxima microssequência planejada.

## Fluxo 1: planejamento estrutural

### Entrada

O planejamento recebe um contrato de escopo. Exemplo reduzido:

```json
{
  "schemaVersion": "aralearn.scope.v1",
  "course": {
    "title": "Lógica proposicional",
    "goal": "Estudar conectivos e tabelas-verdade."
  },
  "modules": [
    {
      "title": "Conectivos básicos",
      "include": ["conjunção", "disjunção", "negação"],
      "exclude": ["lógica de predicados"],
      "assessmentStyle": "exercícios objetivos"
    }
  ]
}
```

### Prompt de sistema

O prompt de sistema desse fluxo é deliberadamente curto. Ele existe para reforçar formato e fronteira de escopo, não para substituir o envelope:

```text
Você receberá um contrato JSON. Devolva somente JSON válido no formato pedido. Nunca mencione itens de exclude em guide, lessons ou microsequences, nem como contraste negativo. Copie strings de include e exclude exatamente como aparecem no contrato.
```

### Envelope enviado

```json
{
  "task": "plan_course",
  "language": "pt-BR",
  "scope": {
    "schemaVersion": "aralearn.scope.v1",
    "course": {
      "title": "Lógica proposicional",
      "goal": "Estudar conectivos e tabelas-verdade."
    },
    "modules": [
      {
        "title": "Conectivos básicos",
        "include": ["conjunção", "disjunção", "negação"],
        "exclude": ["lógica de predicados"]
      }
    ]
  },
  "rules": [
    "Do not generate cards.",
    "Plan only modules, lessons and microsequences.",
    "Stay strictly inside scope.include.",
    "Use exclude only as a hard boundary.",
    "Use guide.include and microsequence.covers only with exact strings taken from include.",
    "Each microsequence may depend only on ids declared earlier inside the same lesson."
  ]
}
```

### Saída esperada

O retorno esperado é uma proposta de trilha, por exemplo:

```json
{
  "course": {
    "title": "Lógica proposicional",
    "modules": [
      {
        "title": "Conectivos básicos",
        "guide": {
          "goal": "Estudar os conectivos básicos previstos no escopo.",
          "include": ["conjunção", "disjunção", "negação"],
          "exclude": ["lógica de predicados"],
          "notation": ["Usar P e Q como proposições de exemplo."],
          "avoid": ["Não abrir conteúdo fora do escopo informado."]
        },
        "lessons": [
          {
            "title": "Conjunção",
            "guide": {
              "goal": "Entender quando a conjunção é verdadeira.",
              "include": ["conjunção"],
              "exclude": ["lógica de predicados"],
              "notation": ["Usar P e Q."],
              "avoid": []
            },
            "microsequences": [
              {
                "id": "micro-conjuncao-regra",
                "title": "Regra da conjunção",
                "goal": "Reconhecer a condição de verdade da conjunção.",
                "role": "explain",
                "dependsOn": [],
                "covers": ["conjunção"],
                "checks": ["o aluno reconhece que P e Q precisam ser verdadeiras"]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Validação do planejamento

Antes de aplicar o resultado ao projeto, o app verifica:

- ausência de cards;
- presença de `guide` em módulo e lição;
- aderência de `guide.include` e `covers` ao escopo;
- ausência de itens excluídos em posições semânticas relevantes;
- coerência de `dependsOn`;
- inexistência de ciclos.

## Fluxo 2: geração local

O fluxo local é dividido em três etapas para reduzir ambiguidade e permitir correção localizada.

### Etapa 1 — `bottom_up_micro_plan`

Essa etapa decide a intenção da intervenção: tipo local de trabalho, escala, objetivo e recursos adicionais necessários.

#### Envelope

```json
{
  "task": "bottom_up_micro_plan",
  "language": "pt-BR",
  "path": {
    "course": "Vetores e Matrizes",
    "module": "Base visual",
    "lesson": "Casos visuais",
    "microsequence": "Leitura de vetor e matriz em casos mínimos"
  },
  "guide": {
    "goal": "Trabalhar leitura visual de vetor e matriz sem sair do escopo.",
    "include": ["vetor 2D", "matriz 2x2"],
    "exclude": ["determinante"],
    "notation": ["Use pares ordenados e linhas/colunas."],
    "avoid": ["Não abrir álgebra avançada."]
  },
  "microsequence": {
    "id": "micro-visual-base",
    "title": "Leitura de vetor e matriz em casos mínimos",
    "goal": "Reconhecer coordenadas de um vetor 2D e localizar valores em uma matriz 2x2.",
    "role": "explain",
    "dependsOn": [],
    "covers": ["vetor 2D", "matriz 2x2"],
    "checks": [
      "o aluno lê coordenadas no plano",
      "o aluno localiza valores por linha e coluna"
    ]
  },
  "request": {
    "mode": "generate",
    "prompt": "Abra com representação didaticamente adequada e pratique leitura visual sem sair do escopo.",
    "preferredResource": "",
    "extraResources": []
  },
  "availableTypes": [
    { "id": "concept", "label": "Conceito", "use": "introduzir e consolidar uma ideia local" },
    { "id": "guided_practice", "label": "Prática guiada", "use": "praticar uma operação com apoio" }
  ],
  "availableSizes": [
    { "id": "short", "cards": 3 },
    { "id": "medium", "cards": 5 },
    { "id": "long", "cards": 8 }
  ],
  "availableResources": [
    { "id": "paragraph", "use": "explicação ou lacuna por opções" },
    { "id": "choice", "use": "decisão objetiva" },
    { "id": "matrix", "use": "matriz, linha, coluna e sequência matricial" },
    { "id": "plane", "use": "vetor, coordenada e plano cartesiano" }
  ],
  "sources": []
}
```

#### Saída esperada

```json
{
  "type": "concept",
  "size": "long",
  "goal": "Explicar e praticar leitura de vetor 2D e matriz 2x2 com casos visuais.",
  "extraResources": ["plane", "matrix"],
  "sources": [],
  "reason": "O objetivo exige representação visual do plano e da matriz."
}
```

### Etapa 2 — `bottom_up_card_plan`

Essa etapa escolhe, por posição, o recurso, o tipo de card e o modo de exercício.

#### Saída esperada

```json
{
  "draft": [
    {
      "position": 1,
      "resource": "plane",
      "kind": "theory",
      "exercise": "none",
      "goal": "Apresentar a leitura de vetor 2D."
    },
    {
      "position": 2,
      "resource": "plane",
      "kind": "exercise",
      "exercise": "choice",
      "goal": "Praticar reconhecimento de vetor no plano."
    },
    {
      "position": 3,
      "resource": "matrix",
      "kind": "theory",
      "exercise": "none",
      "goal": "Apresentar a leitura de matriz 2x2."
    },
    {
      "position": 4,
      "resource": "matrix",
      "kind": "exercise",
      "exercise": "choice",
      "goal": "Praticar posição por linha e coluna."
    }
  ]
}
```

O app valida se:

- as posições pedidas foram respeitadas;
- os recursos escolhidos pertencem ao catálogo permitido;
- a combinação entre `resource`, `kind` e `exercise` faz sentido;
- o draft permanece dentro do escopo local.

### Etapa 3 — `bottom_up_card_build`

Essa etapa preenche os cards finais a partir do draft. O serviço textual não recebe o contrato público inteiro como campo de escrita; ele recebe apenas os campos do recurso ativo.

#### Saída esperada

```json
{
  "cards": [
    {
      "position": 1,
      "resource": "plane",
      "kind": "theory",
      "exercise": "none",
      "title": "Vetor no plano",
      "prompt": "Observe o vetor saindo da origem.",
      "vector": [2, 1],
      "after": "O primeiro valor indica deslocamento horizontal; o segundo indica deslocamento vertical."
    },
    {
      "position": 2,
      "resource": "plane",
      "kind": "exercise",
      "exercise": "choice",
      "title": "Identifique o vetor",
      "prompt": "Observe o vetor saindo da origem.",
      "vector": [3, -1],
      "question": "Qual vetor está representado?",
      "options": [
        { "id": "a", "text": "(3, -1)" },
        { "id": "b", "text": "(-1, 3)" },
        { "id": "c", "text": "(3, 1)" }
      ],
      "answer": "a",
      "after": "O vetor desloca 3 unidades no eixo horizontal e -1 no eixo vertical."
    }
  ]
}
```

## Operações locais atendidas pelo fluxo

O mesmo mecanismo atende quatro operações:

- gerar a microssequência atual;
- corrigir a microssequência atual;
- criar uma microssequência adicional de apoio;
- gerar a próxima microssequência planejada.

O que muda entre elas é o pacote de contexto e o tipo de pedido, não o contrato público final do projeto.

## Validação estrutural

Na validação estrutural, o app rejeita situações como:

- campo antigo ou fora do schema;
- `paragraph` de exercício sem lacuna;
- `choice` sem três ou quatro opções;
- `answer` incompatível com as alternativas;
- `matrix` sem dado matricial suficiente;
- `plane` sem dado visual;
- card de recurso inadequado sem os campos exigidos.

## Validação didática mínima

Além da forma, o app verifica condições mínimas de uso didático:

- exercício textual deve ser fechado;
- teoria não deve carregar lacuna ou pergunta objetiva indevida;
- o contexto volátil necessário precisa estar no próprio card;
- o card não deve sair do escopo local;
- papéis como `practice_more` e `fix_error` devem realmente variar ou corrigir o caso.

## Correção localizada e falha fechada

Quando o serviço textual falha, o runtime pode:

- pedir novo planejamento local;
- pedir refinamento do draft;
- pedir nova materialização dos campos;
- aplicar reparo mecânico seguro;
- rejeitar a saída sem alterar o projeto.

Esse comportamento é parte da arquitetura: o produto prioriza integridade do projeto sobre aceitação forçada da resposta.

## Serviços, relatórios e verificação

O repositório contém relatórios reais de execução, em especial com [`deepseek-v4-flash`](https://api-docs.deepseek.com/), e scripts de benchmark do motor estruturado. Esses relatórios são úteis porque mostram o comportamento completo do fluxo: geração, correções intermediárias, recompilação, validação e resultado final aceito ou rejeitado.

Arquivos relevantes:

- `scripts/runDeepSeekRealSmoke.js`
- `scripts/runStructuredEngineBenchmark.js`
- `scripts/runTopDownStructuredBenchmark.js`
- `scripts/runDidacticQualityBenchmark.js`

## Síntese

Os fluxos de geração do AraLearn foram desenhados para resolver um problema prático: serviços textuais econômicos podem interpretar bem uma tarefa, mas erram mais quando recebem contexto demais, schema demais ou responsabilidade demais de uma vez.

Por isso, o app separa trilha e card, separa intenção e materialização, recompila o resultado localmente e só persiste o que passou pelo contrato final.
