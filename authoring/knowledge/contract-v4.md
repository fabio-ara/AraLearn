# Contrato AraLearn versão 4

O artefato final é um documento JSON com esta raiz:

```json
{
  "contract": "aralearn.contract",
  "version": 4,
  "kind": "project",
  "courses": []
}
```

A hierarquia pública é:

```text
project > course > module > lesson > microsequence > card
```

O JSON canônico serve para intercâmbio e validação. Publicações são revisões
imutáveis endereçadas por hash; a projeção relacional existe somente no
IndexedDB local para navegação e estudo offline.

## Curso, módulo e lição

O curso declara um recorte geral, um objetivo e seus módulos. Módulos e lições organizam a progressão. O `guide` de cada nível fixa:

- `goal`: objetivo local;
- `include`: conteúdo obrigatório;
- `exclude`: conteúdo proibido naquele recorte;
- `notation`: símbolos e convenções;
- `avoid`: desvios que prejudicam o foco.

Não trate `exclude` e `avoid` como observações opcionais. Eles também se aplicam a títulos, exemplos, alternativas e feedback.

## Tópicos

Os tópicos de uma lição registram conceitos, procedimentos, representações e termos. Cada tópico pode ter critérios de verificação e erros prováveis. As tags de um card são strings e podem, mas não precisam, coincidir com o identificador de um tópico estruturado.

## Microssequência

Uma microssequência possui título, objetivo, papel, estado, dependências, conteúdos, verificações, erros e cards.

Papéis aceitos:

- `explain`;
- `practice`;
- `review`;
- `support`.

Estados aceitos:

- `planned`;
- `generated`;
- `needs_review`;
- `ready`.

`dependsOn` contém somente microssequências anteriores da mesma lição. Uma dependência existe por necessidade didática, não apenas porque dois itens são vizinhos.

## Card

Todo card possui `id`, `position`, `resource`, `kind`, `exercise`, `title` e
`after`. `kind` aceita `theory` ou `exercise`. `exercise` aceita `none`, `gap`
ou `choice`, dentro das combinações admitidas pelo recurso. O contrato v4
possui dezesseis recursos; `chart`, `sequence`, `annotated_text` e
`linguistic_example` integram o mesmo registro e as mesmas mecânicas.

Em alternativas, use sempre `selectionMode`, `selectionCriterion`, `options` e
`answerIds`. A forma singular `answer` não pertence ao contrato.

Campos opcionais comuns incluem fontes, tags e blocos posteriores. Campos próprios de cada recurso estão descritos em [cards-and-resources.md](cards-and-resources.md) e na documentação normativa do projeto.

## Identidades e ordem

- Reserve identificadores no plano e preserve-os em todas as tentativas.
- `position` define a ordem dos cards e deve ser inteira, positiva e sem ambiguidade.
- Não reutilize o mesmo identificador para entidades diferentes.
- Uma parte só pode conter as entidades declaradas em sua especificação.
- Campos desconhecidos são erro. Não descarte dados para fazer o documento passar.

## Fonte normativa

Antes de enviar uma parte, confronte-a com:

1. `docs/aralearn-contract.md`;
2. `docs/recursos-de-card.md`;
3. os validadores atuais executados pela API de autoria.

Este resumo orienta a produção, mas não substitui o contrato mantido pelo aplicativo.
