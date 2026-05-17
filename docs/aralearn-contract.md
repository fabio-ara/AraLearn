# Contrato público do AraLearn

Este documento descreve o contrato JSON público do AraLearn em nível suficiente para leitura, interoperabilidade e importação/exportação. Ele não tenta documentar cada função interna da engine.

## Objetivo do contrato

O contrato público existe para:

- persistir estrutura didática;
- permitir importação e exportação;
- manter o projeto legível;
- separar dados do usuário de estados internos de runtime.

Ele não existe para expor todo o pipeline do `CourseForge`.

## Envelope raiz

Todo documento estrutural válido parte de:

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

O curso organiza a trilha ampla. Ele não carrega, no estado atual, a governança didática forte que fica concentrada na lição.

## Módulo

Campos centrais:

- `key`
- `title`
- `description`
- `lessons`

O módulo agrupa um bloco coerente do percurso.

## Lição

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

`sourceGuideStructured` é a principal fonte de verdade da orientação local da lição.

`sourceGuide` é texto derivado para leitura humana. Ele não substitui o objeto estruturado.

### Guidance tags

Os campos:

- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`

ajudam a restringir o tipo de microssequência e de card que faz sentido gerar naquela lição.

### `domainMap`

`domainMap` registra itens de domínio, sinais de cobertura e relações relevantes para a progressão local. Ele ajuda o sistema a raciocinar sobre:

- lacunas;
- pré-requisitos;
- contraste;
- prática;
- cobertura ainda fraca.

## Microssequência

Campos centrais:

- `key`
- `title`
- `description`
- `tags`
- `status`
- `included`
- `cards`

### `status`

Estados públicos hoje aceitos:

- `draft`
- `ready`

### `included`

`included` indica se a microssequência entra no percurso de estudo.

### Microssequência planejada

No estado atual do produto, uma microssequência pode existir com:

- `status: "draft"`
- `cards: []`

Esse caso não é erro. Ele representa uma microssequência planejada, ainda não materializada.

## Card

Campos comuns:

- `key`
- `title`
- `say`
- `after`
- `sourceRefs`

Dependendo do recurso didático, outros campos públicos aparecem.

## Recursos públicos

O contrato público contempla recursos como:

- `say`
- `ask`
- `code`
- `table`
- `tree`
- `flow`
- `plane`
- `matrix`

O pipeline interno pode usar aliases, schemas ou artefatos adicionais, mas a persistência pública respeita esse conjunto.

## `sourceRefs`

`sourceRefs` é opcional e registra grounding mínimo quando a geração usou fonte.

Ele não transforma o contrato em sistema completo de busca semântica. Sua função é fornecer rastreabilidade suficiente para auditoria local.

## O que fica fora do contrato público

Ficam fora do contrato:

- estados de fase do `CourseForge`;
- detalhes de provider;
- runtime autorado da UI;
- histórico interno de iterações locais;
- configurações transitórias de execução.

Isso mantém o contrato pequeno e portável.

## Relação com o top-down e com o runtime local

No estado atual do produto:

- o top-down escreve no contrato a trilha planejada;
- o runtime local materializa progressivamente as microssequências;
- o usuário pode exportar a estrutura sem exportar o motor.

## Exemplos

Exemplos públicos do contrato:

- [examples/](examples/)

## Leitura complementar

- [Arquitetura](arquitetura.md)
- [Guia de uso do app](uso-do-app.md)
- [Assistência por IA generativa](assistencia-por-ia.md)
