# Conhecimento didático dos resources do AraLearn

Critérios pedagógicos para escolher e combinar resources. Use consultarRecursosDeCard antes do primeiro uso de cada resource para obter o contrato exato e um exemplo válido.

---

## knowledge/cards-and-resources.md

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

O documento v4 não possui um plano paralelo de operações nem metadados de preferência de recurso. Registre a intenção nos campos existentes:

- `microsequence.goal` descreve o que a pessoa aprenderá ou fará;
- `microsequence.covers` delimita o conteúdo;
- `microsequence.checks` descreve a evidência observável;
- `microsequence.dependsOn` aponta apenas para bases causais;
- `microsequence.role` classifica a unidade como `explain`, `practice`, `review` ou `support`;
- `card.resource` materializa a representação escolhida;
- `card.topics`, quando usado, pode referenciar IDs de `lesson.topics`.

Escolha o recurso que melhor preserve a operação descrita por `goal` e `checks`. A justificativa pedagógica deve ser perceptível na correspondência entre objetivo, conteúdo e representação, sem acrescentar propriedades que o contrato não aceita.

## Contrato formal e renderização

Cada recurso possui um esquema JSON e um exemplo aceito pelo mesmo compilador usado no servidor. Consulte o contrato do recurso antes de produzir sua primeira ocorrência no workspace. Use somente os campos e valores declarados.

Português, anexos e fontes orientam o conteúdo didático, mas não identificam alvos de interação nem viram marcação. O servidor não interpreta frases como instruções de layout e não converte prosa em HTML. A estrutura visual nasce dos campos formais. Em texto, código e valores estruturados, uma posição interativa nasce de `{gap:id}` no campo permitido e da definição correspondente em `gaps`. Formas e rótulos de `flow` usam o objeto formal `practice`.

## Linguagem formal de lacunas

Na autoria, uma lacuna possui duas partes:

1. o marcador `{gap:identificador}` no campo em que a resposta deve aparecer;
2. uma definição em `gaps`, com resposta e modo de interação.

O identificador liga as duas partes de modo exato. Não informe um caminho textual e não descreva a posição em prosa. O servidor encontra o único marcador permitido, valida o recurso e compila a notação autoral para o contrato público v4 antes de persistir.

`gap` é uma forma de interação, não um recurso visual. Um card de tabela continua sendo tabela; um card de código continua preservando linguagem e indentação; uma fórmula continua sendo uma árvore de expressão. A lacuna apenas substitui um valor permitido dentro dessa estrutura. Assim, a prática ocorre sobre a representação escolhida para a operação, sem ser convertida numa pergunta genérica.

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

Forma e rótulo não usam marcador nem definição em `gaps`. Um exercício `flow` composto somente por esses alvos declara `exercise: "gap"` e omite `gaps`. Se também ocultar `text` ou `condition`, usa `{gap:id}` nesses campos e declara as definições correspondentes.

## Escolha simples ou múltipla

`choice` e os exercícios contextuais por alternativas usam:

- `selectionMode`: `single` ou `multiple`;
- `selectionCriterion`: `correct`, `incorrect` ou `best`;
- `options`: de 2 a 7 itens com `id` estável;
- `answerIds`: conjunto exato que o estudante deve assinalar;
- `options[].feedback` para explicar a distinção local;
- `options[].misconceptionId` quando o distrator representa equívoco modelado.

`best` exige `single`. `multiple` exige pelo menos um `answerId`, mas nunca pode selecionar todas as opções. A quantidade de alternativas deriva de distratores funcionais: três costumam bastar; cinco só são adequadas quando quatro alternativas competitivas realmente existem. Não invente absurdos para atingir uma quantidade.

Uma opção usa texto ou código estruturado desde o primeiro corte. O estudante seleciona, confirma e só então recebe resultado e feedback. A correção compara o conjunto exato sem depender da ordem.

## Variação dentro da microssequência

Uma microssequência ensina uma operação principal ou um conjunto conceitual inseparável. A prática deve variar exemplos e representações sem mudar silenciosamente a operação.

Uma progressão frequente é:

1. fundamento necessário;
2. exemplo resolvido;
3. prática guiada;
4. prática com menos apoio;
5. contraste, diagnóstico de erro ou integração, quando contribuírem para o objetivo.

Isso não é uma quantidade fixa de cards. `goal`, `covers`, `checks` e os erros previsíveis determinam o necessário para a aprendizagem pretendida. Recuse uma sequência dominada por `paragraph` e `choice` quando uma representação estruturada tornar a operação mais clara.

Recupere componentes já estudados quando eles forem pré-requisitos úteis. Registre a dependência causal e mude o exemplo, a representação ou a situação. Não aumente a densidade de um card para revisar muitos assuntos ao mesmo tempo.

Use somente os vínculos didáticos do contrato:

- `lesson.topics` declara as unidades conceituais, procedimentais, representacionais ou terminológicas da lição;
- `card.topics` pode referenciar os IDs desses tópicos;
- `microsequence.covers` declara o recorte apresentado ou exercitado;
- `microsequence.checks` registra as evidências que os cards precisam tornar observáveis;
- `microsequence.errors` registra equívocos tratados;
- `microsequence.dependsOn` liga a unidade às bases já ensinadas;
- `microsequence.role` descreve a função da unidade inteira.

Fundamento, exemplo resolvido, prática guiada, prática com menor apoio, contraste e diagnóstico aparecem na própria ordem e no conteúdo dos cards. Não crie campos por card para representar essas funções. Não deduza continuidade apenas pela proximidade de nomes.

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

Em `system_map`, grupos representam limites ou regiões do sistema, componentes declaram pertencimento por `groupId` e conexões usam IDs existentes em `from` e `to`. Use-o somente quando esse pertencimento mudar a interpretação; para uma rede sem limites, use `graph`, e para uma execução com decisões, use `flow`.

Em `reaction`, separe reagentes e produtos, declare os coeficientes estequiométricos, estados e o tipo de seta e mantenha condições junto à reação. O recurso representa a equação simbólica. Se o resultado exigir coordenar observação macroscópica, partículas e símbolos, apresente as representações adicionais e explicite a correspondência entre elas.

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

---

## knowledge/domain-patterns.md

# Padrões de autoria por área

O plano sempre parte de uma pessoa sem conhecimentos prévios, salvo quando o pedido ou os materiais comprovam um pré-requisito. A área muda a forma de representar, praticar e verificar o conteúdo; não muda a exigência de explicar símbolos, oferecer base causal e manter cada prática autossuficiente.

## Escolha da representação

Escolha o recurso pela operação que o estudante precisa realizar:

| Operação | Recursos mais prováveis |
|---|---|
| compreender uma definição ou distinção | `paragraph`, `choice`, `composite` |
| acompanhar execução, sintaxe ou comando | `code`, `flow`, `table` |
| comparar casos ou valores | `table`, `matrix`, `choice` |
| reconhecer hierarquia ou classificação | `tree`, `relation_map` |
| analisar conexões, dependências ou rotas | `graph`, `relation_map`, `flow` |
| distinguir limites, subsistemas e integrações | `system_map`, `graph`, `flow` |
| raciocinar com coordenadas, vetores ou distância | `plane`, `matrix`, `formula` |
| ler notação matemática | `formula`, `matrix`, `composite` |
| ler ou balancear uma equação de reação | `reaction`, `formula`, `composite` |

O recurso visual permanece no próprio card de prática. Não descreva um diagrama ausente nem peça que a pessoa se lembre dos valores apresentados anteriormente.

Registre o objetivo e a evidência em `microsequence.goal` e `microsequence.checks`, delimite o recorte em `microsequence.covers` e materialize a escolha diretamente em `card.resource`. A tabela acima orienta a análise, mas não escolhe o recurso de modo automático e não autoriza metadados adicionais fora do contrato.

## Programação, bancos de dados e automação

- Apresente a semântica da operação antes de cobrar a sintaxe.
- Use `code` com lacunas quando um token, uma expressão ou uma linha completa for a decisão principal.
- Use alternativas quando o objetivo for prever saída, encontrar defeito, escolher consulta ou distinguir efeitos colaterais.
- Preserve indentação, linguagem, versão e ambiente relevantes. SQL precisa indicar o esquema mínimo, as linhas necessárias e o dialeto quando isso mudar a resposta.
- Faça o estudante acompanhar o estado: valores de variáveis, pilha, resultado intermediário, linhas afetadas ou fluxo de controle.
- Um fragmento executável não deve depender de arquivo, biblioteca ou tabela que não esteja declarada no card.
- Distratores devem representar erros reais: atribuição em lugar de comparação, índice incorreto, junção inadequada, filtro aplicado no estágio errado, mutação inesperada ou tratamento incompleto de ausência.

## Matemática, estatística, lógica e economia quantitativa

- Introduza cada símbolo, domínio, unidade e convenção antes do primeiro uso exigido.
- Use `formula` para a estrutura simbólica, `plane` para relações espaciais, `matrix` para posição e transformação e `table` para dados observados.
- Um exemplo resolvido explicita as transformações decisivas. A prática seguinte altera dados e foco, não apenas a aparência.
- Arredondamento, precisão, intervalo, hipótese e unidade fazem parte do enunciado quando influenciam a resposta.
- Em estatística, diferencie descrição, estimação e inferência. Não transforme correlação em causalidade.
- Em lógica, declare linguagem, interpretação e regra de inferência empregadas.

## Física, química, biologia e engenharias

- Informe unidades, condições, escala e aproximações. Valores sem unidade só são aceitos quando a grandeza é adimensional e isso está claro.
- Em química, use `reaction` quando os lados de reagentes/produtos, coeficientes, estados e seta fizerem parte da operação. Use `formula` com `notation: chemistry` para outra relação simbólica admitida pela árvore do contrato. Não envie LaTeX, HTML ou MathML como conteúdo.
- Balanceamento, estequiometria e conversões precisam mostrar a grandeza conservada.
- Em física e engenharia, diferencie modelo, medida e condição de contorno.
- Em biologia, explicite nível de organização e evite atribuir intenção a processos naturais quando a explicação é mecanística.
- Procedimentos de segurança, limites normativos e riscos não podem ser omitidos para simplificar uma prática.

## Redes, infraestrutura e segurança

- Declare topologia, endereçamento, estado inicial, equipamento ou serviço e versão quando necessários.
- Use `system_map` quando limites e pertencimento a subsistemas importarem, `graph` para conexões sem essa semântica, `flow` para negociação e resposta a falhas, `table` para configuração e `code` para comandos.
- Diferencie observação, diagnóstico e ação. Uma evidência isolada não prova uma causa sem as condições correspondentes.
- Não apresente credenciais reais, dados pessoais, endereços internos nem comandos destrutivos sem ambiente seguro e finalidade didática explícita.
- Distratores podem representar camada errada, direção invertida, máscara incompatível, porta inadequada ou interpretação incorreta de log.

## Direito, administração, contabilidade e políticas públicas

- Declare jurisdição, data de vigência e fonte normativa quando elas afetarem a resposta.
- Separe texto normativo, interpretação, procedimento e exemplo. Não apresente uma conclusão controvertida como regra única.
- Use casos com fatos suficientes, sem esconder a condição que decide a aplicação da norma.
- Em contabilidade, indique regime, período, natureza da conta e unidade monetária.
- Em administração, diferencie conceito, instrumento e contexto de uso; evite listas sem decisão observável.
- Conteúdo sujeito a alteração recebe fonte versionada e data de acesso no registro de autoria.

## Idiomas, linguística e sistemas de escrita

- Preserve Unicode e a direção de escrita. Não translitere quando o objetivo é reconhecer ou produzir o sistema original.
- Introduza forma, leitura, significado, registro e contexto de uso conforme a necessidade da etapa.
- Tradução e glosa ajudam no início, mas não substituem o contato com a forma original.
- Em fonética, morfologia, sintaxe, semântica e pragmática, declare a convenção analítica adotada.
- Um exercício de interpretação contém no próprio card a frase, o trecho ou o diálogo necessário.
- Variação regional, histórica e social não deve ser tratada automaticamente como erro.

## Educação, ciências humanas e áreas interpretativas

- Diferencie afirmação do autor, evidência, interpretação e aplicação.
- Apresente conceitos no contexto intelectual necessário, sem transformar escolas teóricas em caricaturas.
- Uma prática pode pedir discriminação entre explicações, análise de caso ou relação entre argumento e evidência, sempre por uma decisão verificável.
- Quando houver mais de uma leitura defensável, formule critérios e não invente uma única resposta correta.

## Revisão do recorte

Antes de aprovar, verifique:

1. se o estudante recebeu a base necessária para a operação;
2. se símbolos, dados, fontes e condições estão no próprio card quando forem particulares do caso;
3. se a representação preserva a estrutura da área;
4. se resposta e feedback podem ser verificados;
5. se a segunda prática altera uma dimensão didaticamente relevante;
6. se não há simplificação que produza erro técnico, normativo ou conceitual;
7. se o conteúdo funciona no celular, por teclado e com tecnologia assistiva.

---

## docs/recursos-de-card.md

# Recursos de card

O contrato vigente é `aralearn.resources.v4`. Um recurso não é um tema visual: ele preserva a estrutura sobre a qual a pessoa raciocina. A LLM produz somente dados semânticos; o AraLearn valida referências e limites, calcula o layout, renderiza, avalia a resposta e persiste o estado localmente.

O MCP expõe `consultarRecursosDeCard`. Sem `resource`, a ferramenta lista o catálogo compacto; com `resource`, devolve o contrato formal daquele recurso. O assistente deve consultar antes do primeiro uso numa parte, em vez de completar campos por memória. A resposta padrão `compact` inclui critérios, exemplo e o `authoringSchema` necessário ao card comum, sem expandir repetidamente profundidades recursivas e sem o campo opcional `afterBlocks`. Use `detail: "full"` somente para criar `afterBlocks` ou auditar o schema normativo. O backend aplica em ambos os casos o contrato canônico integral e as invariantes semânticas do domínio.

## Campos e interações comuns

Todo card declara `id`, `position`, `resource`, `kind`, `exercise`, `title` e `after`. `kind` aceita `theory` ou `exercise`; `exercise` aceita `none`, `gap` ou `choice` somente nas combinações anunciadas pelo recurso.

`languageTag` recebe BCP 47 e `textDirection` aceita `auto`, `ltr` ou `rtl`. `sources` e `topics` são listas opcionais. Campos desconhecidos são erro.

Existem duas mecânicas de resposta:

- `gap`: a resposta ocupa um campo do próprio recurso;
- `choice`: a pessoa confirma um conjunto de alternativas.

`gap` não é recurso. Uma célula incompleta continua sendo `table`; uma condição incompleta continua sendo `code` ou `flow`.

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

`composite` aceita blocos dos demais recursos e exige `id` estável em cada bloco. Ele só deve ser usado quando separar as representações destruiria a tarefa de coordenação.

## Lacunas autorais

Na linguagem de autoria, o campo interativo recebe `{gap:id}` e o card declara uma definição correspondente em `gaps`:

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

Cada marcador e cada definição aparecem exatamente uma vez. A resposta ocupa uma linha e tem no máximo 120 caracteres. `response: "choice"` é o padrão para autoria automática e exige distratores plausíveis. `response: "text"` é reservado à autoria manual quando todas as variantes aceitas podem ser enumeradas literalmente em `acceptedAnswers`; não há regex, equivalência semântica nem correção por LLM durante o estudo.

Antes de persistir, o AraLearn compila `{gap:id}` + `gaps` para a representação interna do contrato v4, remove a lista autoral e valida o card. Integrações não devem produzir a notação interna `[[...]]`.

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

A quantidade de opções deriva dos distratores funcionais. Três opções costumam ser suficientes; cinco são adequadas quando há quatro alternativas realmente competitivas, como em certos perfis de simulação. Não se fabrica uma opção absurda para atingir uma quantidade.

O renderer gera o comando a partir do modo e do critério, mantém a linha inteira como alvo, usa semântica de radio/checkbox, não avalia a cada toque e só mostra feedback após confirmação. A correção compara conjuntos sem depender da ordem.

## Contratos dos recursos estruturados

### Graph, flow e tree

`graph` declara vértices e arestas por IDs sem coordenadas obrigatórias. Arestas possuem identidade estável e só usam direção quando ela muda o significado. `layout` é um preset semântico; o renderer calcula posição, rótulos e rotas.

`flow` declara a estrutura do processo, condições e ramos. A geometria ortogonal, os pontos de junção e os rótulos são calculados localmente. A prática de forma ou rótulo usa `structure.practice`, não descrição em prosa.

`tree` declara nós e `parentId`. `variant` aceita exatamente `filesystem`, `hierarchy`, `taxonomy`, `phylogeny`, `syntax` ou `organization`, sem forçar a metáfora pasta/arquivo. Pai inexistente, autorreferência e ciclo são rejeitados.

### Table, relation_map, matrix, plane e formula

`table` preserva dimensões e cabeçalhos. `relation_map` mantém conjuntos, ligações e pares auxiliares consistentes. `matrix` conserva linha, coluna, sequências e destaques. `plane` recebe apenas dados geométricos e deixa escala e desenho ao renderer. `formula` usa uma AST fechada e `accessibleText`; não aceita LaTeX, HTML ou MathML livre.

### Chart

`chartType` aceita `bar`, `line`, `scatter`, `histogram` ou `boxplot`. Eixos possuem label/unidade e cada série tem ID, nome e pontos. Em `boxplot`, os quartis são derivados de observações repetidas; a LLM não envia geometria. Limites de séries e pontos evitam densidade ilegível no celular.

### Sequence

`sequence` modela `ordered_steps`, `timeline`, `lifecycle`, `cycle` ou `code_blocks` por itens com IDs estáveis, label e detalhe opcional. É adequado para protocolo e cronologia; um processo com decisão deve usar `flow`.

### Annotated text

`annotated_text` separa o texto em segmentos identificados e liga anotações a esses IDs. Notas permanecem adjacentes ao trecho no celular. É preferível a um parágrafo quando localizar a evidência é parte do resultado.

### Linguistic example

`linguistic_example` mantém unidades alinhadas. Cada unidade pode declarar forma, escrita tradicional/simplificada, leitura, IPA, glosa e tradução. `languageTag`, `textDirection`, `writingMode` e `alignment` permitem escrita RTL e não latina sem converter o exemplo em tabela improvisada.

### `system_map`

`system_map` separa três relações que um grafo genérico não torna explícitas: grupos delimitam regiões ou fronteiras, componentes pertencem a um grupo e conexões ligam componentes por IDs. Grupos podem ser aninhados por `parentId`; componentes usam `groupId`; conexões usam `from` e `to`, com rótulo e direção quando necessários. O renderer calcula a apresentação e conserva uma descrição textual das quantidades e conexões. O recurso não recebe coordenadas, cor ou geometria da LLM.

Use `system_map` quando pertencer a um limite ou subsistema fizer parte da operação cognitiva, como numa arquitetura de serviços, numa cadeia logística ou num sistema sociotécnico. Use `graph` quando importarem apenas vértices, arestas e caminhos; use `flow` quando a operação for acompanhar decisões ou execução temporal.

### `reaction`

`reaction` preserva uma equação química como estrutura, em vez de tratá-la como texto ou fórmula genérica. `reactants` e `products` contêm espécies com ID, fórmula e nome; coeficiente, estado e carga são campos explícitos quando aplicáveis. `reactionType` distingue reação direta, reversível e equilíbrio; `conditions` registra condições mostradas junto à seta. Referências e destaques usam IDs de espécie.

A estrutura segue a distinção da IUPAC entre os lados de reagentes e produtos, coeficientes estequiométricos e o significado da seta. Ela representa o nível simbólico da química; não presume, sozinha, que o estudante coordenou fenômeno macroscópico e modelo submicroscópico. Quando essa coordenação for o objetivo, use cards relacionados ou `composite` com representações explicitamente articuladas. O validador garante forma e referências, mas não infere balanceamento nem certifica a correção química da equação.

## Assistência atômica de revisão por API

Esta capacidade local é `atomic-card-assistance`. Ela é distinta de `atomic-resource-authoring`, que pertence à consulta de contratos e às mutações de workspace da autoria remota pelo Chatbot ou Plugin. A assistência interna trabalha com duas operações, sem interpretar uma lista aberta de intenções:

- `repair`: repara o card inteiro ou um conjunto explícito de recursos;
- `create`: cria exatamente um card antes ou depois do atual, no fim da microssequência ou em uma nova microssequência imediatamente posterior.

No reparo por recursos, a seleção usa identidades formais:

- `main`: campos do recurso principal de um card simples;
- `response`: pergunta, modo, critério, opções e respostas de uma prática contextual por escolha em recurso que não seja `choice`;
- `after:text`: texto canônico posterior do card;
- `body:<id>`: bloco identificado do corpo de `composite`;
- `after:<id>`: bloco identificado de apoio em `afterBlocks`.

Quando informado, `afterBlocks` contém de um a cinco blocos, com `id` não vazio e único dentro dessa coleção. O mesmo teto de cinco preserva a leitura móvel adotada para os blocos de um card `composite`.

O card inteiro é outro escopo de reparo e não é abreviado por um `targetId`. O provider recebe somente os alvos selecionados como graváveis. Card atual, vizinhos imediatos, hierarquia didática e anexos delimitados entram como contexto somente leitura.

Reparo de recursos usa uma chamada estruturada com uma substituição por alvo. Reparo do card inteiro e criação usam duas chamadas pequenas: primeiro a escolha de uma combinação canônica `resource` + `kind` + `exercise`; depois a construção de um único card pelo schema exato daquela combinação. A aplicação local:

- preserva ID e posição em reparos;
- preserva byte a byte o que ficou fora da seleção de recursos;
- recusa IDs repetidos e referências inválidas;
- recompila lacunas autorais e valida o contrato v4 completo;
- renderiza uma prévia e compara o fingerprint antes de aplicá-la;
- renumera posições de modo determinístico ao inserir;
- falha fechada se o alvo mudou durante a chamada.

No destino `new_microsequence`, a escrita aceita exatamente uma microssequência nova na lição selecionada e sua subárvore. Fora dela, somente o campo `position` das microssequências irmãs existentes pode mudar, sem alterar sua ordem relativa. Qualquer outra diferença é recusada.

Além do JSON Schema, a aceitação semântica verifica regras delimitadas que podem ser demonstradas de modo determinístico: termos de `guide.exclude` e `guide.avoid` do módulo e da lição, uso de fontes autorizadas, referências explícitas a material ausente e exposição da resposta de uma lacuna em conteúdo visível ou geometria derivada. Essa camada não prova correção factual, cobertura didática nem autocontenção em toda formulação possível; a inspeção humana continua obrigatória.

Pedido, resposta bruta e prévia permanecem efêmeros. Somente o documento validado após a confirmação da pessoa autora entra na projeção relacional local. O mesmo fluxo atende cursos privados e projeções locais de cursos do catálogo selecionados em `Trilhas`; ele marca um rascunho local e não cria clone, outbox de conteúdo ou mutação remota por linha. A publicação oficial continua sendo uma operação separada.

## Escolha didática

O contrato não possui um bloco separado de preferências de representação. A microssequência registra objetivo, recorte, evidências e dependências em `goal`, `covers`, `checks` e `dependsOn`; cada card materializa diretamente a representação em `resource`. A escolha considera a evidência observável:

- use estrutura quando a estrutura faz parte do conhecimento;
- use `choice` quando discriminar alternativas é a própria operação;
- use `gap` quando recuperar um elemento no lugar correto é a operação;
- use `composite` somente quando coordenar representações for indispensável;
- não varie recursos por aparência;
- não reduza uma representação difícil a texto para facilitar a geração.

Os fundamentos acadêmicos dessas decisões estão em [Fundamentação pedagógica dos resources](https://github.com/fabio-ara/AraLearn/blob/main/docs/fundamentacao-pedagogica-dos-resources.md).

## Galeria visual e responsiva

A galeria executável está em `tests/gallery/resources-v4.html`, alimentada pela fixture `tests/fixtures/v4/project-resources-gallery.json`. Ela usa o renderer real e contém um card de cada um dos dezoito resources.

`npm run resources:gallery:visual` reconstrói a fixture, verifica overflow em 360, 390, 412 e 1280 px e atualiza as quatro capturas versionadas:

- [galeria em 360 px](https://github.com/fabio-ara/AraLearn/blob/main/docs/screenshots/resources-v4/gallery-360.png);
- [galeria em 390 px](https://github.com/fabio-ara/AraLearn/blob/main/docs/screenshots/resources-v4/gallery-390.png);
- [galeria em 412 px](https://github.com/fabio-ara/AraLearn/blob/main/docs/screenshots/resources-v4/gallery-412.png);
- [galeria em desktop](https://github.com/fabio-ara/AraLearn/blob/main/docs/screenshots/resources-v4/gallery-1280.png).
