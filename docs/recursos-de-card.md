# Recursos de card

O contrato vigente é `aralearn.resources.v4`. Um recurso não é um tema visual:
ele preserva a estrutura sobre a qual a pessoa raciocina. A LLM produz somente
dados semânticos; o AraLearn valida referências e limites, calcula o layout,
renderiza, avalia a resposta e persiste o estado localmente.

O MCP expõe `consultarRecursosDeCard`. Sem `resource`, a ferramenta lista o
catálogo compacto; com `resource`, devolve o contrato formal daquele recurso.
O assistente deve consultar antes do primeiro uso numa parte, em vez de
completar campos por memória. A resposta padrão `compact` inclui critérios,
exemplo e o `authoringSchema` necessário ao card comum, sem expandir
repetidamente profundidades recursivas e sem o campo opcional `afterBlocks`.
Use `detail: "full"` somente para criar `afterBlocks` ou auditar o schema
normativo. O backend aplica em ambos os casos o contrato canônico integral e
as invariantes semânticas do domínio.

## Campos e interações comuns

Todo card declara `id`, `position`, `resource`, `kind`, `exercise`, `title` e
`after`. `kind` aceita `theory` ou `exercise`; `exercise` aceita `none`, `gap`
ou `choice` somente nas combinações anunciadas pelo recurso.

`languageTag` recebe BCP 47 e `textDirection` aceita `auto`, `ltr` ou `rtl`.
`sources` e `topics` são listas opcionais. Campos desconhecidos são erro.

Existem duas mecânicas de resposta:

- `gap`: a resposta ocupa um campo do próprio recurso;
- `choice`: a pessoa confirma um conjunto de alternativas.

`gap` não é recurso. Uma célula incompleta continua sendo `table`; uma condição
incompleta continua sendo `code` ou `flow`.

## Catálogo v4

| Recurso | Estrutura preservada | Uso característico |
|---|---|---|
| `paragraph` | texto contínuo | explicar, definir, sintetizar |
| `choice` | alternativas comparáveis | discriminar decisões ou diagnósticos |
| `composite` | blocos inseparáveis | coordenar duas ou mais representações |
| `code` | linguagem, linhas e indentação | ler, completar, prever ou corrigir código |
| `table` | linhas e colunas | comparar casos e localizar relações |
| `flow` | sequência, decisão e repetição | acompanhar processo e consequência |
| `tree` | hierarquia | classificar, decompor ou navegar níveis |
| `graph` | vértices e arestas | analisar conexão, caminho, peso e dependência |
| `relation_map` | dois conjuntos e ligações | interpretar domínio, imagem e pares |
| `matrix` | posição bidimensional | operar sobre linhas, colunas e transformações |
| `plane` | eixos, pontos e vetores | interpretar coordenadas, soma, escala e distância |
| `formula` | árvore de expressão | preservar notação matemática ou química |
| `chart` | séries quantitativas | comparar distribuição, tendência e relação |
| `sequence` | etapas ordenadas ou cíclicas | ordenar processo, cronologia ou protocolo |
| `annotated_text` | trechos ligados a notas | localizar evidência, função ou regra |
| `linguistic_example` | forma, leitura, glosa e tradução alinhadas | estudar línguas e análise linguística |
| `system_map` | limites, grupos, componentes e conexões | interpretar arquitetura, integração e pertencimento |
| `reaction` | reagentes, produtos, coeficientes, estados e seta | ler ou completar equações de reação química |

`composite` aceita blocos dos demais recursos e exige `id` estável em cada
bloco. Ele só deve ser usado quando separar as representações destruiria a
tarefa de coordenação.

## Lacunas autorais

Na linguagem de autoria, o campo interativo recebe `{gap:id}` e o card declara
uma definição correspondente em `gaps`:

```json
{
  "id": "card-tabela",
  "position": 2,
  "resource": "table",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Variação mensal",
  "columns": ["Mês", "Índice"],
  "rows": [["Março", "104"], ["Abril", "{gap:indice}"]],
  "gaps": [
    {
      "id": "indice",
      "response": "choice",
      "answer": "109",
      "distractors": ["105", "113"]
    }
  ],
  "after": "O índice de abril é 109."
}
```

Cada marcador e cada definição aparecem exatamente uma vez. A resposta ocupa
uma linha e tem no máximo 120 caracteres. `response: "choice"` é o padrão para
autoria automática e exige distratores plausíveis. `response: "text"` é
reservado à autoria manual quando todas as variantes aceitas podem ser
enumeradas literalmente em `acceptedAnswers`; não há regex, equivalência
semântica nem correção por LLM durante o estudo.

Antes de persistir, o AraLearn compila `{gap:id}` + `gaps` para a representação
interna do contrato v4, remove a lista autoral e valida o card. Integrações não
devem produzir a notação interna `[[...]]`.

| Recurso | Alvos de lacuna |
|---|---|
| `paragraph` | `text` |
| `code` | `code` |
| `table` | células de `rows` |
| `flow` | texto/condição e `structure.practice` |
| `tree` | `nodes[].label` |
| `graph` | rótulos de vértice; rótulo ou peso de aresta |
| `relation_map` | itens, relações, pares e tabela auxiliar |
| `matrix` | `values` ou `sequence[].values` |
| `plane` | `result` textual |
| `formula` | valores folha, espelhados em `accessibleText` |
| `chart` | labels/unidades de eixo e nome de série |
| `sequence` | label, detalhe ou código da etapa |
| `annotated_text` | texto do segmento, label ou nota |
| `linguistic_example` | forma, leitura, IPA, glosa ou tradução |
| `system_map` | label de grupo, componente ou conexão |
| `reaction` | coeficiente, fórmula ou nome de espécie e condição |
| `composite` | alvos dos blocos internos |

`choice` já contém sua própria interação e não usa `gaps`.

## Choice

`choice` e exercícios contextuais por alternativas usam o mesmo contrato:

```json
{
  "id": "card-elasticidade",
  "position": 4,
  "resource": "choice",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Elasticidade em nuvem",
  "question": "Quais ações caracterizam ajuste elástico?",
  "selectionMode": "multiple",
  "selectionCriterion": "correct",
  "options": [
    {
      "id": "expandir",
      "text": "Adicionar recursos durante o pico.",
      "feedback": "Correta: a capacidade acompanha o aumento da demanda."
    },
    {
      "id": "reduzir",
      "text": "Remover recursos quando a demanda diminui.",
      "feedback": "Correta: elasticidade também inclui retração."
    },
    {
      "id": "fixar",
      "text": "Manter permanentemente o dobro da capacidade.",
      "feedback": "Incorreta: capacidade fixa não acompanha a variação."
    }
  ],
  "answerIds": ["expandir", "reduzir"],
  "after": "Elasticidade ajusta recursos para cima e para baixo conforme a demanda."
}
```

- `selectionMode`: `single` ou `multiple`;
- `selectionCriterion`: `correct`, `incorrect` ou `best`;
- `options`: 2 a 7 itens com IDs únicos;
- `answerIds`: conjunto exato que a pessoa deve marcar;
- `best` exige `single`;
- `multiple` exige ao menos uma resposta, mas não permite marcar todas;
- uma opção usa `text` ou `kind: "code"` com `language` e `code`;
- `feedback` e `misconceptionId` são opcionais.

A quantidade de opções deriva dos distratores funcionais. Três opções costumam
ser suficientes; cinco são adequadas quando há quatro alternativas realmente
competitivas, como em certos perfis de simulação. Não se fabrica uma opção
absurda para atingir uma quantidade.

O renderer gera o comando a partir do modo e do critério, mantém a linha inteira
como alvo, usa semântica de radio/checkbox, não avalia a cada toque e só mostra
feedback após confirmação. A correção compara conjuntos sem depender da ordem.

## Contratos dos recursos estruturados

### Graph, flow e tree

`graph` declara vértices e arestas por IDs sem coordenadas obrigatórias. Arestas
possuem identidade estável e só usam direção quando ela muda o significado.
`layout` é um preset semântico; o renderer calcula posição, rótulos e rotas.

`flow` declara a estrutura do processo, condições e ramos. A geometria
ortogonal, os pontos de junção e os rótulos são calculados localmente. A prática
de forma ou rótulo usa `structure.practice`, não descrição em prosa.

`tree` declara nós e `parentId`. `variant` aceita exatamente `filesystem`,
`hierarchy`, `taxonomy`, `phylogeny`, `syntax` ou `organization`, sem forçar a
metáfora pasta/arquivo. Pai inexistente, autorreferência e ciclo são rejeitados.

### Table, relation_map, matrix, plane e formula

`table` preserva dimensões e cabeçalhos. `relation_map` mantém conjuntos,
ligações e pares auxiliares consistentes. `matrix` conserva linha, coluna,
sequências e destaques. `plane` recebe apenas dados geométricos e deixa escala e
desenho ao renderer. `formula` usa uma AST fechada e `accessibleText`; não
aceita LaTeX, HTML ou MathML livre.

### Chart

`chartType` aceita `bar`, `line`, `scatter`, `histogram` ou `boxplot`. Eixos
possuem label/unidade e cada série tem ID, nome e pontos. Em `boxplot`, os
quartis são derivados de observações repetidas; a LLM não envia geometria.
Limites de séries e pontos evitam densidade ilegível no celular.

### Sequence

`sequence` modela `ordered_steps`, `timeline`, `lifecycle`, `cycle` ou
`code_blocks` por itens com IDs estáveis, label e detalhe opcional. É adequado
para protocolo e cronologia; um processo com decisão deve usar `flow`.

### Annotated text

`annotated_text` separa o texto em segmentos identificados e liga anotações a
esses IDs. Notas permanecem adjacentes ao trecho no celular. É preferível a um
parágrafo quando localizar a evidência é parte do resultado.

### Linguistic example

`linguistic_example` mantém unidades alinhadas. Cada unidade pode declarar
forma, escrita tradicional/simplificada, leitura, IPA, glosa e tradução.
`languageTag`, `textDirection`, `writingMode` e `alignment` permitem escrita
RTL e não latina sem converter o exemplo em tabela improvisada.

### `system_map`

`system_map` separa três relações que um grafo genérico não torna explícitas:
grupos delimitam regiões ou fronteiras, componentes pertencem a um grupo e
conexões ligam componentes por IDs. Grupos podem ser aninhados por `parentId`;
componentes usam `groupId`; conexões usam `from` e `to`, com rótulo e direção
quando necessários. O renderer calcula a apresentação e conserva uma descrição
textual das quantidades e conexões. O recurso não recebe coordenadas, cor ou
geometria da LLM.

Use `system_map` quando pertencer a um limite ou subsistema fizer parte da
operação cognitiva, como numa arquitetura de serviços, numa cadeia logística ou
num sistema sociotécnico. Use `graph` quando importarem apenas vértices, arestas
e caminhos; use `flow` quando a operação for acompanhar decisões ou execução
temporal.

### `reaction`

`reaction` preserva uma equação química como estrutura, em vez de tratá-la como
texto ou fórmula genérica. `reactants` e `products` contêm espécies com ID,
fórmula e nome; coeficiente, estado e carga são campos explícitos quando
aplicáveis. `reactionType` distingue reação direta, reversível e equilíbrio;
`conditions` registra condições mostradas junto à seta. Referências e destaques
usam IDs de espécie.

A estrutura segue a distinção da IUPAC entre os lados de reagentes e produtos,
coeficientes estequiométricos e o significado da seta. Ela representa o nível
simbólico da química; não presume, sozinha, que o estudante coordenou fenômeno
macroscópico e modelo submicroscópico. Quando essa coordenação for o objetivo,
use cards relacionados ou `composite` com representações explicitamente
articuladas. O validador garante forma e referências, mas não infere
balanceamento nem certifica a correção química da equação.

## Assistência atômica de revisão por API

Esta capacidade local é `atomic-card-assistance`. Ela é distinta de
`atomic-resource-authoring`, que pertence à consulta de contratos e às mutações
de workspace da autoria remota pelo Chatbot ou Plugin. A assistência interna trabalha
com duas operações, sem interpretar uma lista aberta de intenções:

- `repair`: repara o card inteiro ou um conjunto explícito de recursos;
- `create`: cria exatamente um card antes ou depois do atual, no fim da
  microssequência ou em uma nova microssequência imediatamente posterior.

No reparo por recursos, a seleção usa identidades formais:

- `main`: campos do recurso principal de um card simples;
- `response`: pergunta, modo, critério, opções e respostas de uma prática
  contextual por escolha em recurso que não seja `choice`;
- `after:text`: texto canônico posterior do card;
- `body:<id>`: bloco identificado do corpo de `composite`;
- `after:<id>`: bloco identificado de apoio em `afterBlocks`.

Quando informado, `afterBlocks` contém de um a cinco blocos, com `id` não vazio
e único dentro dessa coleção. O mesmo teto de cinco preserva a leitura móvel
adotada para os blocos de um card `composite`.

O card inteiro é outro escopo de reparo e não é abreviado por um `targetId`. O
provider recebe somente os alvos selecionados como graváveis. Card atual,
vizinhos imediatos, hierarquia didática e anexos delimitados entram como
contexto somente leitura.

Reparo de recursos usa uma chamada estruturada com uma substituição por alvo.
Reparo do card inteiro e criação usam duas chamadas pequenas: primeiro a
escolha de uma combinação canônica `resource` + `kind` + `exercise`; depois a
construção de um único card pelo schema exato daquela combinação. A aplicação
local:

- preserva ID e posição em reparos;
- preserva byte a byte o que ficou fora da seleção de recursos;
- recusa IDs repetidos e referências inválidas;
- recompila lacunas autorais e valida o contrato v4 completo;
- renderiza uma prévia e compara o fingerprint antes de aplicá-la;
- renumera posições de modo determinístico ao inserir;
- falha fechada se o alvo mudou durante a chamada.

No destino `new_microsequence`, a escrita aceita exatamente uma microssequência
nova na lição selecionada e sua subárvore. Fora dela, somente o campo
`position` das microssequências irmãs existentes pode mudar, sem alterar sua
ordem relativa. Qualquer outra diferença é recusada.

Além do JSON Schema, a aceitação semântica verifica regras delimitadas que
podem ser demonstradas de modo determinístico: termos de `guide.exclude` e
`guide.avoid` do módulo e da lição, uso de fontes autorizadas, referências
explícitas a material ausente e exposição da resposta de uma lacuna em conteúdo
visível ou geometria derivada. Essa camada não prova correção factual, cobertura
didática nem autocontenção em toda formulação possível; a inspeção humana
continua obrigatória.

Pedido, resposta bruta e prévia permanecem efêmeros. Somente o documento
validado após a confirmação da pessoa autora entra na projeção relacional
local. O mesmo fluxo atende cursos privados e projeções locais de cursos do
catálogo selecionados em `Trilhas`; ele marca um rascunho local e não cria
clone, outbox de conteúdo ou mutação remota por linha. A publicação oficial
continua sendo uma operação separada.

## Escolha didática

O contrato não possui um bloco separado de preferências de representação. A
microssequência registra objetivo, recorte, evidências e dependências em
`goal`, `covers`, `checks` e `dependsOn`; cada card materializa diretamente a
representação em `resource`. A escolha considera a evidência observável:

- use estrutura quando a estrutura faz parte do conhecimento;
- use `choice` quando discriminar alternativas é a própria operação;
- use `gap` quando recuperar um elemento no lugar correto é a operação;
- use `composite` somente quando coordenar representações for indispensável;
- não varie recursos por aparência;
- não reduza uma representação difícil a texto para facilitar a geração.

Os fundamentos acadêmicos dessas decisões estão em
[Fundamentação pedagógica dos resources](fundamentacao-pedagogica-dos-resources.md).

## Galeria visual e responsiva

A galeria executável está em `tests/gallery/resources-v4.html`, alimentada
pela fixture `tests/fixtures/v4/project-resources-gallery.json`. Ela usa o
renderer real e contém um card de cada um dos dezoito resources.

`npm run resources:gallery:visual` reconstrói a fixture, verifica overflow em
360, 390, 412 e 1280 px e atualiza as quatro capturas versionadas:

- [galeria em 360 px](screenshots/resources-v4/gallery-360.png);
- [galeria em 390 px](screenshots/resources-v4/gallery-390.png);
- [galeria em 412 px](screenshots/resources-v4/gallery-412.png);
- [galeria em desktop](screenshots/resources-v4/gallery-1280.png).
