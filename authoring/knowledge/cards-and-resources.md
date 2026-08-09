# Cards e recursos

O recurso representa a estrutura sobre a qual o estudante raciocina. Escolha-o pela operação exigida, não pela aparência nem pela facilidade de geração.

| Recurso | Operações que costuma representar |
|---|---|
| `paragraph` | Explicar, definir, sintetizar ou completar uma proposição. |
| `choice` | Discriminar alternativas quando a própria decisão é o objeto da prática. |
| `composite` | Articular blocos inseparáveis numa única explicação ou atividade. |
| `code` | Ler, executar mentalmente, completar ou corrigir código e comandos. |
| `table` | Comparar casos e completar relações entre linhas e colunas. |
| `flow` | Acompanhar processos, decisões, repetições e ramos. |
| `tree` | Classificar e reconhecer relações hierárquicas. |
| `graph` | Raciocinar sobre vértices, arestas, caminhos, pesos e dependências. |
| `relation_map` | Relacionar elementos de dois conjuntos e interpretar pares. |
| `matrix` | Operar sobre posições, linhas, colunas, padrões e transformações. |
| `plane` | Trabalhar com pontos, vetores, distância, soma e escala. |
| `formula` | Preservar a estrutura de expressões matemáticas e químicas. |
| `chart` | Comparar séries, distribuições, tendências e relações quantitativas. |
| `sequence` | Representar protocolo, cronologia, ciclo ou transformação ordenada. |
| `annotated_text` | Ligar segmentos de texto a evidências, funções, regras ou comentários. |
| `linguistic_example` | Alinhar forma, leitura, IPA, glosa e tradução. |
| `system_map` | Distinguir limites, grupos, componentes e conexões de um sistema. |
| `reaction` | Ler ou completar reagentes, produtos, coeficientes, estados, seta e condições. |

Use `paragraph` ou `choice` quando a estrutura realmente for textual ou discriminativa. Não os use como substitutos automáticos de código, tabela, fluxo, árvore, grafo, relação, matriz, plano ou fórmula.

## Escolha observável no contrato

O documento v4 não possui um plano paralelo de operações nem metadados de
preferência de recurso. Registre a intenção nos campos existentes:

- `microsequence.goal` descreve o que a pessoa aprenderá ou fará;
- `microsequence.covers` delimita o conteúdo;
- `microsequence.checks` descreve a evidência observável;
- `microsequence.dependsOn` aponta apenas para bases causais;
- `microsequence.role` classifica a unidade como `explain`, `practice`,
  `review` ou `support`;
- `card.resource` materializa a representação escolhida;
- `card.topics`, quando usado, pode referenciar IDs de `lesson.topics`.

Escolha o recurso que melhor preserve a operação descrita por `goal` e
`checks`. A justificativa pedagógica deve ser perceptível na correspondência
entre objetivo, conteúdo e representação, sem acrescentar propriedades que o
contrato não aceita.

## Contrato formal e renderização

Cada recurso possui um esquema JSON e um exemplo aceito pelo mesmo compilador usado no servidor. Consulte o contrato do recurso antes de produzir sua primeira ocorrência no workspace. Use somente os campos e valores declarados.

Português, anexos e fontes orientam o conteúdo didático, mas não identificam alvos de interação nem viram marcação. O servidor não interpreta frases como instruções de layout e não converte prosa em HTML. A estrutura visual nasce dos campos formais. Em texto, código e valores estruturados, uma posição interativa nasce de `{gap:id}` no campo permitido e da definição correspondente em `gaps`. Formas e rótulos de `flow` usam o objeto formal `practice`.

## Linguagem formal de lacunas

Na autoria, uma lacuna possui duas partes:

1. o marcador `{gap:identificador}` no campo em que a resposta deve aparecer;
2. uma definição em `gaps`, com resposta e modo de interação.

O identificador liga as duas partes de modo exato. Não informe um caminho textual e não descreva a posição em prosa. O servidor encontra o único marcador permitido, valida o recurso e compila a notação autoral para o contrato público v4 antes de persistir.

`gap` é uma forma de interação, não um recurso visual. Um card de tabela continua sendo tabela; um card de código continua preservando linguagem e indentação; uma fórmula continua sendo uma árvore de expressão. A lacuna apenas substitui um valor permitido dentro dessa estrutura. Assim, a prática ocorre sobre a representação escolhida para a operação, sem ser convertida numa pergunta genérica.

Exemplo mínimo válido de lacuna em `paragraph`:

```json
{
  "id": "card-conjuncao",
  "position": 1,
  "resource": "paragraph",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Conjunção",
  "text": "P ∧ Q só é verdadeira quando {gap:condition}.",
  "gaps": [{
    "id": "condition",
    "response": "choice",
    "answer": "P e Q são verdadeiras",
    "distractors": ["apenas P é verdadeira", "ao menos uma é verdadeira"]
  }],
  "after": "A conjunção exige que as duas proposições sejam verdadeiras."
}
```

O marcador fica em `text`, a definição correspondente fica em `gaps` e o
servidor compila ambos ao salvar. Não envie `question`, `options`, um objeto
`content` paralelo nem a notação interna `[[...]]`.

Lacuna por alternativas:

```json
{
  "id": "card-soma-tabela",
  "position": 1,
  "resource": "table",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Soma em tabela",
  "columns": ["Expressão", "Resultado"],
  "rows": [["2 + 3", "{gap:soma}"]],
  "gaps": [
    {
      "id": "soma",
      "response": "choice",
      "answer": "5",
      "distractors": ["4", "6"]
    }
  ],
  "after": "Somar duas unidades a três unidades resulta em cinco unidades."
}
```

Lacuna por digitação:

```json
{
  "id": "card-condicao-python",
  "position": 2,
  "resource": "code",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Condição em Python",
  "prompt": "Complete a condição.",
  "language": "python",
  "code": "if {gap:condition}:\n    processar()",
  "gaps": [
    {
      "id": "condition",
      "response": "text",
      "answer": "ativo is True",
      "acceptedAnswers": ["ativo == True"]
    }
  ],
  "after": "A condição compara o estado da variável antes de executar o bloco indentado."
}
```

Regras:

- cada `id` aparece uma vez em `gaps` e uma vez num campo interativo;
- `response: "choice"` exige de um a cinco distratores plausíveis e distintos e não usa `acceptedAnswers`;
- `response: "text"` não usa `distractors` e deve ser reservado a respostas cuja forma esperada seja inequívoca;
- uma lacuna `text` pode declarar até oito valores em `acceptedAnswers`; eles precisam ser variantes literais distintas da resposta principal, ocupam uma linha e não admitem regex nem equivalência semântica inferida;
- a resposta ocupa uma linha e tem no máximo 120 caracteres;
- o feedback fica em `after`; ele explica a operação e não apenas repete a resposta;
- não produza os delimitadores internos usados pelo runtime;
- não ponha marcadores em título, pergunta, feedback, metadados ou conteúdo meramente expositivo;
- uma fórmula repete os mesmos marcadores, na mesma ordem, em `accessibleText`.

Campos que aceitam marcadores:

| Recurso | Campos interativos |
|---|---|
| `paragraph` | `text` |
| `code` | `code` |
| `table` | células de `rows` |
| `flow` | `text`, `condition` e a condição de cada caso |
| `tree` | `nodes[].label` |
| `graph` | `vertices[].label`, `edges[].label`, `edges[].weight` |
| `relation_map` | rótulos dos itens, rótulos das relações, `pairList[]` e células de `relationTable.rows` |
| `matrix` | células de `values` ou `sequence[].values` |
| `plane` | `result` quando for texto |
| `formula` | `value` de nós terminais de `expression`, com espelho em `accessibleText` |
| `chart` | labels e unidades de eixo e nome de série |
| `sequence` | label, detalhe ou código de uma etapa |
| `annotated_text` | texto de segmento, label ou nota de anotação |
| `linguistic_example` | forma, escrita, leitura, IPA, glosa ou tradução |
| `system_map` | label de grupo, componente ou conexão |
| `reaction` | coeficiente, fórmula ou nome de reagente/produto e condição |
| `composite` | os mesmos campos, dentro de `blocks[]` |

`flow` possui ainda prática estrutural em `structure.practice`. `blankShape` oculta a forma, cuja resposta correta deriva do `kind` do nó; `shapeOptions` acrescenta alternativas. `labels.yes`, `labels.no`, `labels.match` e `labels.default` identificam ramos projetados, cujos rótulos corretos derivam do fluxo. Cada rótulo usa `blank: true`; `mode: "choice"` e `options` oferecem alternativas, enquanto `variants` registra grafias literais aceitas na digitação.

O texto visível de um ramo é independente da lacuna. `branchLabels.yes` e `branchLabels.no` personalizam decisões e laços; em `if_chain`, podem ser declarados em cada item de `cases`; `branchLabels.default` personaliza a saída padrão de `switch_case`. O rótulo correspondente a cada caso de `switch_case` continua em `cases[].match`. Omita `branchLabels` para conservar os padrões locais `Sim`, `Não` e `Outro caso` sem persistir cópias.

Em `if_chain`, use exclusivamente `cases[]`; cada caso declara sua `condition` e a saída em `thenBranch`. O campo antigo `branches` não pertence ao contrato e é rejeitado.

Posicione a prática no ponto que produz a aresta: decisões e laços usam `practice.labels.yes/no` no nó; um caso de `if_chain` usa somente `practice.labels.yes`, enquanto o `no` compartilhado fica no nó; cada caso de `switch_case` usa `practice.labels.match` e o nó usa `practice.labels.default`. Uma chave em outro ponto não corresponde a alvo executável.

Em `table`, `columns` é uma lista plana de textos e `rows` é uma grade bidimensional de textos. Não aninhe arrays ou objetos em células: cada linha e coluna lógica ocupa sua posição própria. Uma célula pode conter quebras de linha; linhas iniciadas por `- `, `* `, `+ ` ou numeração são renderizadas como lista. `topics` é metadado de indexação e nunca substitui o texto visível de `columns` e `rows`.

Forma e rótulo não usam marcador nem definição em `gaps`. Um exercício `flow` composto somente por esses alvos declara `exercise: "gap"` e omite `gaps`. Se também ocultar `text` ou `condition`, usa `{gap:id}` nesses campos e declara as definições correspondentes.

## Escolha simples ou múltipla

`choice` e os exercícios contextuais por alternativas usam:

- `selectionMode`: `single` ou `multiple`;
- `selectionCriterion`: `correct`, `incorrect` ou `best`;
- `options`: de 2 a 7 itens com `id` estável;
- `answerIds`: conjunto exato que o estudante deve assinalar;
- `options[].feedback` para explicar a distinção local;
- `options[].misconceptionId` quando o distrator representa equívoco modelado.

`best` exige `single`. `multiple` exige pelo menos um `answerId`, mas nunca pode
selecionar todas as opções. A quantidade de alternativas deriva de distratores
funcionais: três costumam bastar; cinco só são adequadas quando quatro
alternativas competitivas realmente existem. Não invente absurdos para atingir
uma quantidade.

Uma opção usa texto ou código estruturado desde o primeiro corte. O estudante
seleciona, confirma e só então recebe resultado e feedback. A correção compara
o conjunto exato sem depender da ordem.

## Variação dentro da microssequência

Uma microssequência ensina uma operação principal ou um conjunto conceitual inseparável. A prática deve variar exemplos e representações sem mudar silenciosamente a operação.

Uma progressão frequente é:

1. fundamento necessário;
2. exemplo resolvido;
3. prática guiada;
4. prática com menos apoio;
5. contraste, diagnóstico de erro ou integração, quando contribuírem para o objetivo.

Isso não é uma quantidade fixa de cards. `goal`, `covers`, `checks` e os erros
previsíveis determinam o necessário para a aprendizagem pretendida. Recuse uma
sequência dominada por `paragraph` e `choice` quando uma representação
estruturada tornar a operação mais clara.

Recupere componentes já estudados quando eles forem pré-requisitos úteis. Registre a dependência causal e mude o exemplo, a representação ou a situação. Não aumente a densidade de um card para revisar muitos assuntos ao mesmo tempo.

Use somente os vínculos didáticos do contrato:

- `lesson.topics` declara as unidades conceituais, procedimentais,
  representacionais ou terminológicas da lição;
- `card.topics` pode referenciar os IDs desses tópicos;
- `microsequence.covers` declara o recorte apresentado ou exercitado;
- `microsequence.checks` registra as evidências que os cards precisam tornar
  observáveis;
- `microsequence.errors` registra equívocos tratados;
- `microsequence.dependsOn` liga a unidade às bases já ensinadas;
- `microsequence.role` descreve a função da unidade inteira.

Fundamento, exemplo resolvido, prática guiada, prática com menor apoio,
contraste e diagnóstico aparecem na própria ordem e no conteúdo dos cards. Não
crie campos por card para representar essas funções. Não deduza continuidade
apenas pela proximidade de nomes.

## Prática autossuficiente

Cada atividade contém os dados temporários necessários à resolução. Não escreva apenas “considere o exemplo anterior”. Repita no card valores, nomes, trechos, relações e demais dados particulares.

Ao revisar a prática, procure trechos visíveis e discriminantes, como `pedidos(id, total)`, `12 mg/L`, `Lei 14.133/2021` ou `كتاب`. Os dados necessários devem aparecer no título, enunciado, texto, código, rótulo, valor ou alternativa. Identificadores internos, metadados, `after`, resposta e conteúdo oculto não fornecem contexto ao estudante.

Uma âncora confirma presença, não qualidade por si só. Antes de enviar, confira se a pessoa consegue identificar o referente de cada pronome, ator, valor, unidade, seta, ramo, célula, ponto, símbolo ou destaque necessário. Não use posição no desenho, cor, uma relação em card anterior ou uma legenda longa como única fonte de contexto.

## Semântica comum a todos os recursos

Todo recurso pode aparecer em uma prática `gap` quando seu contrato declarar campo interativo. A forma da atividade não reduz a exigência semântica: a lacuna continua cobrando a operação preservada pelo recurso.

- O enunciado nomeia a tarefa de leitura ou transformação. “Observe” é complemento, não operação suficiente.
- Uma prática pede uma decisão principal. Se resolver exige duas ou mais decisões independentes, divida o caso ou apresente apoio explícito entre elas.
- A resposta não pode estar visível em outro campo do mesmo card. Isso inclui título, rótulos, valores repetidos, alternativas, explicação anterior, destaque e texto fora da lacuna.
- O feedback explica por que a decisão é adequada e por que o erro provável falha. Não introduz contexto indispensável que faltou no enunciado.
- Um termo, sigla, notação, unidade, papel ou convenção nova recebe introdução antes de ser exigido. O registro de termos e as dependências formais demonstram essa ordem.
- Texto voltado ao estudante não menciona bastidores de autoria, modelo, API, auditoria, plano, fonte externa ou processo de busca. Fontes ficam no registro, salvo quando analisá-las for o próprio objetivo de aprendizagem.
- Crases têm significado técnico: código, comando, identificador, literal, sintaxe ou valor de forma relevante. Não servem para destacar frases naturais ou conceitos comuns.

### Legibilidade de estruturas

Antes de aprovar tabela, fluxo, árvore, grafo, mapa de relações, matriz, plano, fórmula ou bloco composto, leia a representação como quem não conhece o rascunho:

1. as entidades e relações necessárias têm rótulo visível e distinto;
2. direção, ordem, unidade, escala, condição e convenção que alteram a resposta estão declaradas;
3. o destaque aponta para o objeto certo, mas não é a única explicação do que ele significa;
4. a complexidade visual cabe em uma leitura no celular, sem depender de texto sobreposto ou legenda que obrigue alternância excessiva;
5. a estrutura e o enunciado descrevem a mesma situação, sem trocar papel, nível de abstração ou relação causal.

Em `graph`, cada vértice representa uma entidade ou papel estável e cada aresta uma relação nomeável. Se o card contiver mais de um componente, o enunciado explica por que eles estão juntos ou a autoria os separa. Direção só aparece quando tem valor semântico. Rótulos internos nunca substituem nomes apresentados ao estudante, e uma abreviação só é aceitável quando a legenda mantém correspondência inequívoca no mesmo card.

Em `system_map`, grupos representam limites ou regiões do sistema, componentes
declaram pertencimento por `groupId` e conexões usam IDs existentes em `from` e
`to`. Use-o somente quando esse pertencimento mudar a interpretação; para uma
rede sem limites, use `graph`, e para uma execução com decisões, use `flow`.

Em `reaction`, separe reagentes e produtos, declare os coeficientes
estequiométricos, estados e o tipo de seta e mantenha condições junto à
reação. O recurso representa a equação simbólica. Se o resultado exigir
coordenar observação macroscópica, partículas e símbolos, apresente as
representações adicionais e explicite a correspondência entre elas.

## Integridade dos recursos

Nós, arestas, células, pontos, linhas, opções e blocos possuem identidade e ordem próprias. Antes do envio, confirme:

- toda referência aponta para um elemento existente;
- identificadores são únicos no próprio recurso;
- relações e arestas usam origens e destinos válidos;
- nós hierárquicos não formam ciclos;
- linhas possuem a quantidade de células declarada;
- coordenadas e vetores usam números finitos;
- destaques apontam apenas para elementos existentes;
- nenhuma propriedade fora do contrato foi acrescentada.

## Cards compostos

Use `composite` quando os blocos formarem uma única unidade didática. Cada bloco segue o contrato do próprio `kind`. Num exercício `gap`, os marcadores podem estar distribuídos em mais de um bloco e continuam formando uma única atividade verificável.

## Código

- Declare `language` e preserve a indentação.
- Não use reticências para esconder dados necessários.
- Faça a lacuna incidir sobre a operação ensinada, não sobre pontuação incidental.
- Use digitação apenas quando houver uma forma esperada inequívoca; para sintaxes equivalentes, prefira alternativas ou outra prática verificável.

## Fórmulas

- Use `notation: "mathematics"` ou `notation: "chemistry"`.
- Construa `expression` somente com a árvore formal documentada.
- Não envie HTML, MathML, LaTeX ou código executável.
- Preencha `accessibleText` com a leitura integral.
- Numa lacuna, o marcador do nó terminal também aparece em `accessibleText`, na mesma posição lógica.

## Verificação antes do envio

Consulte `docs/recursos-de-card.md` para a forma completa do recurso escolhido. O servidor valida e compila a submissão; uma rejeição estrutural deve ser corrigida no mesmo campo indicado, sem reduzir o card a `paragraph` ou `choice` apenas para contornar o contrato.
