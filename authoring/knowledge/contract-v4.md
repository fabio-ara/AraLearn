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

O JSON canônico serve para intercâmbio, validação e publicação. Durante a
autoria remota, o estado corrente é composto por partes relacionais no
PostgreSQL. Ao publicar, o servidor materializa um artefato endereçado por hash;
o aplicativo também mantém projeções relacionais no IndexedDB para navegação e
estudo offline.

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

Uma microssequência possui título, objetivo, papel, dependências, conteúdos,
verificações, erros e cards.

Papéis aceitos:

- `explain`;
- `practice`;
- `review`;
- `support`.

`dependsOn` contém somente microssequências anteriores da mesma lição. Uma dependência existe por necessidade didática, não apenas porque dois itens são vizinhos.

Sem cards, a microssequência permanece parte do plano; com cards, torna-se
executável. Marcadores internos do runtime não são argumentos de autoria nem
categorias que a pessoa precise administrar.

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

O `authoringSchema` legado devolvido pela rota v4 quando recebe
`resource` descreve a entrada estrutural da autoria, inclusive `id`,
`position`, `gaps` e combinações de `kind`/`exercise`. Por padrão, o transporte
usa `detail: "compact"`: elimina expansões repetidas e omite apenas o campo
opcional `afterBlocks`. Solicite
`detail: "full"` quando for criar `afterBlocks` ou auditar o schema normativo.
Ambas as formas mantêm o exemplo e os metadados pedagógicos. O backend sempre
aplica o contrato canônico integral e a validação semântica final, incluindo
referências, limites do recurso, regras dos guides de módulo e lição, fontes
autorizadas, dependências externas explícitas e exposição de respostas de
lacuna.

Na autoria remota, `listarCardsDaMicrossequencia` localiza cards do workspace
sem recompor o curso nem devolver seu conteúdo integral. A resposta paginada
traz id, posição, `kind`, resource e título resumido. Leia como entidade apenas
o card que será inspecionado ou corrigido. Para alterar um curso publicado,
abra-o ou importe-o primeiro em um workspace.

## Assistência bottom-up no aplicativo

`atomic-card-assistance` repara o card inteiro ou os alvos `main`, `response`,
`after:text`, `body:<id>` e `after:<id>`. Essa capacidade local permanece
separada de `atomic-resource-authoring`, a consulta de contratos e a mutação de
workspaces na autoria remota pelo Chatbot ou Plugin. O nível de card não cria
outro card nem uma microssequência.

`afterBlocks`, quando presente, contém de um a cinco blocos. Cada bloco precisa
ter `id` não vazio e único dentro da coleção.

A seleção de todos os cards concede autoridade sobre o recipiente da
microssequência e permite criar cards apenas dentro dela. No nível de lição,
uma microssequência selecionada pode receber cards; todas as microssequências
selecionadas concedem o recipiente e permitem criar no máximo uma nova
microssequência. Recipientes vazios podem receber seu primeiro filho. Não há
assistência local em módulo ou curso.

O provider recebe como gravável somente a seleção; hierarquia, ordem, vizinhos
limitados e índice compacto da lição entram somente para leitura. A saída
estruturada passa por schema, semântica, guarda de escopo, fingerprint e
compare-and-swap. Quando válida, é gravada diretamente e a interface conserva
somente uma reversão compacta para **Desfazer**.

Curso privado próprio mantém sua identidade. Curso oficial é somente leitura
para conta comum e permanece oficial quando alterado por conta administrativa
ou editorial. Não há fork automático nem promoção ao catálogo pelo fluxo
local. No MCP, a concorrência remota é controlada separadamente por
`expectedRevision`.

## Identidades e ordem

- `course.id` é único no projeto. Identificadores de `module`, `lesson`,
  `topic`, `microsequence` e `card` são únicos por tipo em todo o curso,
  inclusive entre ramos; cursos independentes podem repetir identificadores
  internos. No workspace de autoria, a unicidade por tipo abrange todos os
  cursos da área de trabalho.
- Use identificadores estáveis e preserve-os nas substituições e movimentações.
  Cópias e importações geram identidades novas para toda a parte copiada.
- `position` define a ordem dos cards e deve ser inteira, positiva e sem ambiguidade.
- Não reutilize um identificador do mesmo tipo em outro ramo.
- Uma mutação só pode alterar o alvo declarado pela ferramenta.
- Campos desconhecidos são erro. Não descarte dados para fazer o documento passar.

## Fonte normativa

Antes de gravar uma revisão, confronte-a com:

1. `docs/aralearn-contract.md`;
2. `docs/recursos-de-card.md`;
3. os validadores atuais executados pelo aplicativo e pelo gateway MCP.

Este resumo orienta a produção, mas não substitui o contrato mantido pelo aplicativo.
