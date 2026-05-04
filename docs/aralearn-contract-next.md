# Proposta de contrato público seguinte do AraLearn

Este documento registra a direção de evolução do contrato público do AraLearn a partir da base funcional do `AraLearn_old`.

O objetivo não é empobrecer o produto. O objetivo é simplificar a linguagem autoral do JSON, mantendo ou ampliando a robustez do motor interno.

## Direção geral

O contrato seguinte do AraLearn deve:

- preservar a clareza autoral do contrato público do `AraLearn_old`;
- introduzir `microssequências` entre `lições` e `cards`;
- permitir geração de cursos inteiros por LLM via API;
- permitir autoria humana direta sem exigir conhecimento de runtime interno;
- usar campos intencionais simples e previsíveis por tipo de card;
- transferir para o motor detalhes de runtime, layout, navegação, validação derivada e estruturas auxiliares.

## O que esta proposta rejeita

Esta proposta rejeita:

- `objective` como campo obrigatório de `microssequência`;
- `intent + data` como formato principal do card público;
- JSON autoral excessivamente acoplado a detalhes internos do runtime;
- simplificações que reduzam a expressividade do produto já existente no legado.

## Princípio de autoria

O JSON público deve descrever intenção didática de forma direta.

Exemplos de linguagem desejada:

- `ask`
- `answer`
- `wrong`
- `text`
- `code`
- `flow`
- `tree`

O motor interno do AraLearn continua responsável por converter essa intenção em contêineres internos ricos, renderização, comportamento de estudo, validação fina, embaralhamento e persistência auxiliar.

## Hierarquia autoral proposta

```text
courses[]
  course
    modules[]
      module
        lessons[]
          lesson
            microsequences[]
              microsequence
                cards[]
                  card
```

## Regras da hierarquia

- `course`, `module`, `lesson` e `microsequence` continuam sendo entidades explícitas do documento;
- `microssequência` passa a ser a nova camada estrutural obrigatória entre `lição` e `card`;
- `card` continua sendo a unidade de estudo;
- `block` continua sendo a unidade interna de composição do card, mas o contrato público deve expor isso com nomes autorais claros;
- `key` ou `id` público podem existir, mas devem ser opcionais e deriváveis pelo motor quando ausentes.

## Microssequência

Campos propostos:

- `title`: obrigatório;
- `tags`: opcional;
- `cards`: obrigatório.

Campos removidos:

- `objective`.

Exemplo:

```json
{
  "title": "Modelo cascata",
  "tags": ["Processos de software"],
  "cards": [
    {
      "type": "text",
      "title": "Ideia central",
      "text": "O modelo cascata organiza o trabalho em fases sequenciais."
    }
  ]
}
```

## Card público

Cada card público continua pertencendo a um tipo explícito.

Em vez de usar um objeto genérico `data`, cada tipo deve ter campos rasos e previsíveis.

## Tipos públicos preservados

Os tipos públicos devem continuar cobrindo, no mínimo, a capacidade já existente no legado:

- `text`
- `image`
- `table`
- `editor`
- `choice`
- `tree`
- `simulator`
- `flow`

Outros tipos podem existir depois, desde que não prejudiquem a clareza do contrato principal.

## Exemplos de linguagem pública

### `text`

```json
{
  "type": "text",
  "title": "Ideia central",
  "text": "O modelo cascata organiza o trabalho em fases sequenciais."
}
```

### `choice`

```json
{
  "type": "choice",
  "ask": "Qual modelo segue fases sequenciais?",
  "answer": ["Modelo cascata"],
  "wrong": ["Modelo iterativo", "Modelo em V", "Scrum"]
}
```

### `complete`

```json
{
  "type": "complete",
  "text": "O modelo [[cascata]] segue fases sequenciais.",
  "answer": ["cascata"],
  "wrong": ["iterativo", "espiral", "incremental"]
}
```

### `editor`

```json
{
  "type": "editor",
  "code": "git [[add]] .",
  "answer": ["add"],
  "wrong": ["push", "commit", "clone"]
}
```

### `table`

```json
{
  "type": "table",
  "title": "Modelos de processo",
  "columns": ["Modelo", "Característica"],
  "rows": [
    ["Cascata", "Fases sequenciais"],
    ["Iterativo", "Revisões sucessivas"]
  ]
}
```

### `flow`

```json
{
  "type": "flow",
  "flow": [
    { "start": "Início" },
    { "process": "Levantar requisitos" },
    { "process": "Projetar solução" },
    { "end": "Fim" }
  ]
}
```

## Regra de simplificação

A simplificação desejada não é redução de capacidade.

Ela significa:

- nomes mais simples para campos públicos;
- menos detalhes de runtime no JSON;
- menos necessidade de campos auxiliares obrigatórios;
- maior previsibilidade para autoria humana e para LLM via API.

Ela não significa:

- remover contêineres ricos do motor;
- reduzir o conjunto expressivo já suportado pelo legado;
- empobrecer cards complexos como `flow`, `tree`, `table` ou `simulator`.

## Papel do motor

O motor do AraLearn continua responsável por:

- derivar estruturas internas de renderização;
- decidir navegação e comportamento de estudo;
- embaralhar alternativas quando apropriado;
- validar coerência estrutural fina;
- gerar chaves estáveis quando necessário;
- manter índices, ids internos e projeções auxiliares;
- materializar a intenção pública em contêineres internos mais ricos.

## Papel da LLM por API

A LLM por API deve falar o contrato público, não o formato interno do motor.

Isso implica:

- cursos inteiros podem ser gerados com o mesmo contrato autoral simples;
- microssequências individuais também podem ser geradas isoladamente;
- o motor pode encaixar, revisar, reposicionar e consolidar essas microssequências sem exigir que a LLM declare detalhes internos da aplicação.

## Impacto esperado

Se esta direção for seguida, o AraLearn tende a ficar:

- mais robusto internamente;
- mais simples externamente;
- mais fiel à clareza do `AraLearn_old`;
- melhor preparado para `microssequências` e LLM por API;
- menos dependente de improviso estrutural na autoria.
