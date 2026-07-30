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
possui dezoito recursos: `paragraph`, `choice`, `composite`, `code`, `table`,
`flow`, `tree`, `graph`, `relation_map`, `matrix`, `plane`, `formula`, `chart`,
`sequence`, `annotated_text`, `linguistic_example`, `system_map` e `reaction`.
`system_map` preserva grupos/limites, componentes e conexões; `reaction`
preserva reagentes, produtos, coeficientes, estados, tipo de seta e condições.

Em alternativas, use sempre `selectionMode`, `selectionCriterion`, `options` e
`answerIds`. A forma singular `answer` não pertence ao contrato.

Campos opcionais comuns incluem `sources`, `topics`, `afterBlocks`,
`languageTag` e `textDirection`. Campos próprios de cada recurso estão
descritos em [cards-and-resources.md](cards-and-resources.md) e na documentação
normativa do projeto.

O `authoringSchema` devolvido por `consultarRecursoDeCard` descreve a entrada
estrutural da autoria, inclusive `id`, `position`, `gaps` e combinações de
`kind`/`exercise`. Ele não substitui a validação semântica final. Na assistência
local, o AraLearn também confere referências, limites do recurso, regras dos
guides de módulo e lição, fontes autorizadas, dependências externas explícitas
e exposição de respostas de lacuna dentro das verificações implementadas.

## Assistência atômica de revisão no aplicativo

`atomic-card-assistance` é a assistência local por API e permanece separada de
`atomic-resource-authoring`, a consulta de contratos e a mutação de workspaces
na autoria remota pelo GPT com MCP. A assistência local usa `repair` ou
`create`. O reparo pode abranger o card inteiro ou os alvos `main`, `response`,
`after:text`, `body:<id>` e `after:<id>`. A criação insere um card antes ou
depois do atual, no fim da microssequência ou em uma nova microssequência
posterior.

`afterBlocks`, quando presente, contém de um a cinco blocos. Cada bloco precisa
ter `id` não vazio e único dentro da coleção.

Em `new_microsequence`, a persistência admite exatamente uma microssequência
nova na lição selecionada. Somente a nova subárvore e o campo `position` das
microssequências irmãs existentes podem mudar; a ordem relativa anterior das
irmãs precisa ser preservada.

A proposta é exibida em prévia e só pode ser aplicada se o fingerprint do
contexto continuar igual. O salvamento é local-first em cursos privados e em
cursos do catálogo selecionados em `Trilhas`. No MCP, a concorrência remota é
controlada separadamente por `expectedRevision`.

## Identidades e ordem

- Use identificadores estáveis e preserve-os nas substituições e movimentações.
- `position` define a ordem dos cards e deve ser inteira, positiva e sem ambiguidade.
- Não reutilize o mesmo identificador para entidades diferentes.
- Uma mutação só pode alterar o alvo declarado pela ferramenta.
- Campos desconhecidos são erro. Não descarte dados para fazer o documento passar.

## Fonte normativa

Antes de gravar uma revisão, confronte-a com:

1. `docs/aralearn-contract.md`;
2. `docs/recursos-de-card.md`;
3. os validadores atuais executados pelo aplicativo e pelo gateway MCP.

Este resumo orienta a produção, mas não substitui o contrato mantido pelo aplicativo.
