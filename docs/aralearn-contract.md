# Contrato publico do AraLearn

Este documento descreve o contrato JSON publico do AraLearn em nivel suficiente para leitura, interoperabilidade e importacao/exportacao. Ele nao tenta documentar cada funcao interna da engine.

## Objetivo do contrato

O contrato publico existe para:

- persistir estrutura didatica;
- permitir importacao e exportacao;
- manter o projeto legivel;
- separar dados do usuario de estados internos de runtime.

Ele nao existe para expor todo o pipeline do `CourseForge`.

## Envelope raiz

Todo documento estrutural valido parte de:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

## Hierarquia

```text
project
  -> course
    -> module
      -> lesson
        -> microsequence
          -> card
```

## Curso

Campos centrais:

- `key`
- `title`
- `description`
- `modules`

Curso organiza a trilha ampla. Ele nao carrega hoje a governanca didatica forte que fica concentrada na licao.

## Modulo

Campos centrais:

- `key`
- `title`
- `description`
- `lessons`

Modulo agrupa um bloco coerente do percurso.

## Licao

Campos centrais:

- `key`
- `title`
- `description`
- `sourceGuideStructured`
- `sourceGuide`
- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`
- `domainMap`
- `microsequences`

### `sourceGuideStructured`

`sourceGuideStructured` e a principal fonte de verdade da orientacao local da licao.

`sourceGuide` e texto derivado para leitura humana. Ele nao substitui o objeto estruturado.

### Guidance tags

Os campos:

- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`

ajudam a restringir o tipo de microssequencia e de card que faz sentido gerar naquela licao.

### `domainMap`

`domainMap` registra itens de dominio, sinais de cobertura e relacoes relevantes para a progressao local. Ele ajuda o sistema a raciocinar sobre:

- lacunas;
- prerequisitos;
- contraste;
- pratica;
- cobertura ainda fraca.

## Microssequencia

Campos centrais:

- `key`
- `title`
- `description`
- `tags`
- `status`
- `included`
- `cards`

### `status`

Estados publicos hoje aceitos:

- `draft`
- `ready`

### `included`

`included` indica se a microssequencia entra no percurso de estudo.

### Microssequencia planejada

No estado atual do produto, uma microssequencia pode existir com:

- `status: "draft"`
- `cards: []`

Esse caso nao e erro. Ele representa uma `microssequencia planejada`, ainda nao materializada.

## Card

Campos comuns:

- `key`
- `title`
- `say`
- `after`
- `sourceRefs`

Dependendo do recurso didatico, outros campos publicos aparecem.

## Recursos publicos

O contrato publico contempla recursos como:

- `say`
- `ask`
- `code`
- `table`
- `tree`
- `flow`
- `plane`
- `matrix`

O pipeline interno pode usar aliases, schemas ou artefatos adicionais, mas a persistencia publica respeita esse conjunto.

## `sourceRefs`

`sourceRefs` e opcional e registra grounding minimo quando a geracao usou fonte.

Ele nao transforma o contrato em sistema completo de busca semantica. Sua funcao e rastreabilidade suficiente para auditoria local.

## O que fica fora do contrato publico

Ficam fora do contrato:

- estados de fase do `CourseForge`;
- detalhes de provider;
- runtime autorado da UI;
- historico interno de iteracoes locais;
- configuracoes transitórias de execucao.

Isso mantem o contrato pequeno e portavel.

## Relacao com o top-down e com o runtime local

No estado atual do produto:

- o top-down escreve no contrato a trilha planejada;
- o runtime local materializa progressivamente as microssequencias;
- o usuario pode exportar a estrutura sem exportar o motor.

## Exemplos

Exemplos publicos do contrato:

- [examples/](examples/)

## Leitura complementar

- [Arquitetura](arquitetura.md)
- [Guia de uso do app](uso-do-app.md)
- [Assistencia por IA](assistencia-por-ia.md)
