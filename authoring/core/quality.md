# Critérios de qualidade

## Ponto de partida

- Na falta de evidência concreta, planeje para uma pessoa sem conhecimentos prévios sobre o tema.
- Declare `course.prerequisites` mesmo quando a lista estiver vazia. Omissão não significa ausência confirmada e é rejeitada.
- Não pergunte se a pessoa é iniciante, intermediária ou avançada. Pergunte somente por um pré-requisito observável quando a resposta mudar o plano, como saber ler uma fórmula, executar um comando ou interpretar uma tabela.
- Apresente termos, símbolos, notações e operações antes de exigi-los. Familiaridade presumida precisa estar apoiada no pedido, nos materiais ou em uma resposta objetiva do autor.

## Planejamento didático

- O dimensionamento é uma decisão pedagógica obrigatória, feita mesmo quando o autor não pede quantidade de lições, cards ou práticas. Decomponha a ementa, o objetivo e as fontes em unidades ensináveis: cada conceito, procedimento, relação, ferramenta, convenção ou erro previsível que exija explicação própria precisa ter resultado, operação ou equívoco rastreável no plano.
- Não trate a simples menção de vários itens no mesmo título, resultado ou card como cobertura. Quando itens pedem vocabulário, relações, decisões, pré-requisitos ou formas de prática diferentes, separe-os em segmentos causais que o estudante consiga estudar e recuperar.
- Antes de gravar o plano, faça uma revisão de cobertura: cada unidade ensinável deve ter introdução suficiente, evidência observável, prática coerente e retomada proporcional à sua importância e dificuldade. Para uma operação não factual, preveja exemplo resolvido, prática guiada e atividade com menor apoio; uma exceção factual indivisível deve ser justificada pelo próprio conteúdo, nunca pela vontade de encurtar o curso.
- A extensão final decorre desse mapa de cobertura, dos pré-requisitos, dos erros previsíveis, da complexidade das decisões e das retomadas necessárias. Não comprima um percurso apenas para produzir menos lições, partes ou cards, nem infle números sem acrescentar nova oportunidade de aprender ou recuperar.
- Quando a intenção exigir material autossuficiente, cobertura integral ou preparação para uma avaliação, o mapa de cobertura também separa cada subitem explícito do escopo e cada produto, tecnologia, padrão, método ou ferramenta nomeada que exija vocabulário, finalidade, limite ou decisão próprios. Para cada unidade, planeje ao menos: apresentação com contexto, discriminação ou aplicação verificável e retomada em cenário integrado. Conceitos procedimentais ainda exigem exemplo resolvido, prática guiada e prática com menor apoio. Um título que agrupe itens não reduz essas exigências.
- Quando materiais de avaliação, exemplos de desempenho ou critérios externos forem fornecidos, inclua práticas que reproduzam as decisões cognitivas observadas: distinção entre conceitos próximos, leitura de cenário, identificação de condição decisiva e eliminação de distratores plausíveis. Reserve revisões cumulativas e um bloco final de atividades inéditas integradas. Esse material calibra estilo e lacunas de prática, não limita o conteúdo ao que aparece em um exemplo anterior.
- Antes de gravar o plano, produza internamente uma matriz de cobertura por item da ementa, com cartões de fundamento, exemplo, prática, retomada e, quando aplicável, questão situacional. Grave o plano somente se a matriz não tiver lacunas. A matriz não substitui o plano nem deve ser apresentada como código ou bastidor ao autor.
- Cada resultado de aprendizagem precisa de evidência observável.
- As dependências formam um grafo justificável, não uma cadeia criada apenas pela ordem dos itens.
- A progressão é causal: base conceitual, exemplo resolvido da mesma `operationId`, prática guiada e prática com menor apoio. O exemplo fica antes da prática na mesma microssequência ou em uma dependência aprovada que declare exatamente a operação reutilizada.
- Uma microssequência que ensina uma operação nova não começa pela cobrança da operação nem termina apenas na explicação.
- A quantidade de práticas decorre da complexidade do resultado, dos erros previsíveis e da necessidade de retomada. Quando houver várias práticas da mesma operação, use `variationFocus` distintos e varie dados, representação ou nível de apoio.
- O plano prevê erros plausíveis e maneiras de distingui-los da resposta correta.
- Conceitos, operações e equívocos possuem identificadores próprios. As partes declaram o recorte que ensinam; os cards informam o que introduzem, recuperam, praticam ou corrigem. Não use semelhança de rótulos para criar uma ligação que não foi declarada.
- Use `foundation`, `worked_example`, `guided_practice`, `independent_practice`, `contrast`, `error_diagnosis` e `integration` de acordo com a função real do card. `error_diagnosis` identifica o equívoco examinado; uma retomada identifica o conceito já estudado que será mobilizado.
- O recurso escolhido corresponde à operação cognitiva. Considere os dezesseis recursos do contrato v4: `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix`, `plane`, `formula`, `chart`, `sequence`, `annotated_text` e `linguistic_example`. Não reduza o plano aos dois primeiros quando outro recurso preservar melhor o raciocínio.
- Cada operação declara `representation.preferredResources`, `representation.allowedResources` e `representation.rationale`. A lista preferencial registra a representação que melhor preserva a operação; a lista permitida delimita variações didaticamente coerentes. Todo recurso preferencial pertence também à lista permitida.
- Cada parte que usa uma operação emprega ao menos um recurso preferencial. Quando a parte contém prática da operação, uma dessas práticas usa recurso preferencial. Os demais cards podem usar qualquer recurso permitido para oferecer fundamento, exemplo ou contraste.
- A diversidade de recursos decorre do conteúdo. Não estabeleça cota e não troque o formato apenas para variar a aparência.
- A retomada de conhecimentos anteriores é planejada por `retrievedConceptIds` e dependências justificadas. Um conceito só pode ser recuperado depois de uma apresentação anterior em `foundation` ou `worked_example`, na mesma cadeia causal ou numa dependência aprovada.
- A retomada reaparece depois de uma separação significativa na trilha. Não aplique um intervalo universal: a distância depende da finalidade, da extensão do percurso e das oportunidades reais de estudo.
- A alternância reúne operações relacionadas quando distingui-las faz parte do resultado. Não misture operações ainda não apresentadas nem transforme um card em inventário de assuntos.
- Uma sequência de práticas varia pelo menos o caso, a representação, o erro provável, a estratégia ou o grau de apoio. Repetir o mesmo enunciado com números diferentes não basta quando a operação admite variação mais significativa.

## Construção dos cards

- Um card de prática mede uma decisão principal.
- A prática é autossuficiente. O enunciado não depende de imagem, texto ou aula ausente.
- Dados voláteis aparecem no próprio card: valores, nomes, trechos de código, tabelas, casos, coordenadas, opções e demais elementos particulares da questão não podem existir apenas em um card anterior. Conceitos e notações já ensinados podem ser mobilizados, mas o caso que será resolvido precisa estar completo.
- Cada prática lista em `contextAnchors` os valores e expressões exatos que precisam aparecer antes da resposta. O servidor procura esses elementos no enunciado e na representação, sem contar feedback, resposta aceita nem o conteúdo oculto de uma lacuna.
- Cada card liga sua função a `outcomeIds`; todo resultado atribuído à parte precisa chegar a uma prática observável.
- Toda prática declara `variationFocus`: o caso, a condição, a representação, a estratégia, o erro provável ou o grau de apoio que muda em relação às práticas próximas.
- Uma prática cobra uma decisão principal. Ela pode mobilizar pré-requisitos aprovados, mas não pode exigir que a pessoa reconstrua o caso a partir de posição, cor, legenda extensa, card anterior, feedback ou resposta oculta.
- Termo técnico, símbolo, sigla, unidade, papel, convenção ou relação nova recebe explicação suficiente antes de ser exigido. Não use jargão mais avançado como explicação de uma lacuna conceitual.
- Quando o estudante deve completar uma representação, a lacuna fica dentro do recurso correspondente. Use `{gap:id}` no campo estruturado e declare `id`, `response` e `answer` em `gaps`; `choice` acrescenta `distractors`, enquanto `text` pode acrescentar `acceptedAnswers`. Não descreva a posição em prosa.
- A lacuna mede a operação planejada e não pode ter a resposta exposta em título, enunciado, rótulo, outra opção, feedback antecipado ou estrutura visível do mesmo card. O feedback explica a condição decisiva e não fornece a base que faltava para responder.
- Prefira `response: "choice"` quando os distratores representam erros plausíveis. Use `response: "text"` somente quando a resposta puder ser normalizada sem exigir uma grafia arbitrariamente exata. Nesse modo, `acceptedAnswers` pode enumerar até oito variantes literais, distintas e auditáveis. Não use regex nem pressuponha equivalência semântica.
- O título não entrega a resposta.
- O enunciado não contém a resposta por repetição involuntária.
- Alternativas erradas representam equívocos plausíveis e não simples absurdos.
- Em `choice`, escolha `single` ou `multiple` e `correct`, `incorrect` ou `best` pela evidência pretendida. Use `answerIds` plural e verifique o conjunto exato.
- Use de 2 a 7 opções. Três alternativas costumam bastar; cinco só se justificam quando houver quatro distratores ou decisões realmente competitivos. Não infle a lista.
- Detecte opções equivalentes, pistas gramaticais, diferença injustificada de extensão, repetição exclusiva do enunciado e alternativa parcialmente correta tratada como errada sem condição explícita.
- O feedback explica a regra, o detalhe decisivo e o motivo do erro provável.
- Termos são apresentados com explicação antes do primeiro uso exigido.
- Uma expressão em outro idioma recebe tradução ou glosa quando isso ajuda o público previsto.
- Datas, versões, unidades e condições relevantes são explícitas.
- Referências temporais vagas, como “atualmente” ou “recentemente”, não substituem uma data necessária.

## Linguagem do curso

- Escreva em português natural, direto e preciso, de acordo com a variante pedida pelo autor.
- O texto destinado ao estudante não menciona plano, parte, card, geração, auditoria, API, modelo ou instruções de produção.
- Também não menciona busca, fonte externa, limitação do processo ou bastidor editorial, salvo quando a própria referência, citação ou método de pesquisa for o objeto explícito de estudo.
- Não anuncie o que a explicação fará nem descreva o próprio texto. Apresente diretamente o conceito, o caso ou a ação.
- Pronomes, elipses e expressões como “este”, “aquele”, “o anterior”, “desse tipo” ou “a figura” só podem ser usados quando o antecedente estiver visível no mesmo card e não houver ambiguidade.
- Revise concordância, regência, pontuação e referência entre substantivo, pronome, número e gênero. Quando uma frase admitir duas leituras relevantes, reescreva-a.
- Não use travessão. Reestruture a frase com ponto, vírgula, dois-pontos ou parênteses.
- Não descreva a extensão com adjetivos vagos. Informe o recorte ou a extensão de modo concreto quando isso for necessário.
- Evite fórmulas de redação repetidas, como iniciar parágrafos com “A leitura...” ou apresentar enumerações pela construção “X combina Y, Z e W”. Diga diretamente o que o estudante precisa compreender ou fazer.
- Títulos nomeiam o conceito ou a ação. Não transforme um parágrafo explicativo em título.
- Crases representam código, comando, identificador, literal, sintaxe ou valor cuja forma exata importa. Não as use como mero destaque de palavra comum, conceito pedagógico ou frase natural.

## Leitura de representações estruturadas

- Todo recurso estruturado deixa explícitos o objeto, a relação e a operação de leitura. A posição, a cor, um identificador interno ou uma legenda distante não podem ser a única forma de entender um dado necessário.
- Entidades que precisam ser distinguidas possuem nomes visíveis e inequívocos. Rótulos, unidades, direção, ordem, escala e destaque necessários aparecem no próprio card.
- Em `graph`, vértices representam entidades ou papéis estáveis e arestas representam relações nomeáveis. Direção só é usada quando altera a interpretação. Componentes independentes são distinguidos no enunciado ou separados em cards; uma legenda não pode exigir que a pessoa adivinhe a correspondência entre abreviação e papel.
- Em `flow`, cada ramo torna explícitas condição e consequência. Em `tree`, a ligação preserva leitura pai-filho. Em `relation_map`, os conjuntos e a natureza do pareamento são claros. Em `matrix`, `plane` e `formula`, unidades, eixos, ordem, notação e convenções necessárias aparecem antes da decisão.

## Auditoria

A auditoria registra dez indicadores obrigatórios em `gates`:

| Indicador | Verificação |
|---|---|
| `planAlignment` | A parte corresponde ao plano e à sua especificação. |
| `contract` | O fragmento obedece ao contrato AraLearn v4. |
| `outcomeCoverage` | Objetivos, critérios e evidências previstos estão cobertos. |
| `sources` | As afirmações têm apoio nas fontes autorizadas. |
| `continuity` | A parte respeita dependências e o estado acumulado. |
| `interactionCoherence` | O recurso preserva a operação estudada; lacunas, alternativas e respostas são coerentes, e a série não empobrece representações estruturadas em `paragraph` ou `choice`. |
| `language` | A linguagem é clara e adequada ao público. |
| `fieldPreservation` | Nenhum campo foi perdido ou alterado sem autorização. |
| `structuredElements` | Tabelas, fluxos, grafos e demais estruturas são válidos. |
| `feedback` | O feedback corresponde à resposta aceita e explica a decisão. |

Os dez valores precisam ser verdadeiros e `findings` precisa estar vazio para
aprovar. Um aviso não resolvido impede a aprovação. O auditor usa `repair` para
correção localizada, `rebuild` para refazer o fragmento sob a mesma especificação
e `blocked` quando a especificação, as fontes ou uma decisão externa precisam mudar.

O Auditor aplica o roteiro de `knowledge/semantic-audit.md` depois de reler a entrega persistida. O servidor confirma a forma dos gates e dos achados; o Auditor deve justificar semanticamente cada valor, sem marcar `language`, `interactionCoherence` ou `structuredElements` como verdadeiros por presunção.

Antes de iniciar a construção, o Planejador aplica a mesma exigência de evidência ao plano inteiro. Se algum item substantivo da ementa estiver apenas citado, se uma operação não tiver progressão suficiente ou se a variedade de práticas não corresponder às decisões que o estudante precisa tomar, refaça o plano antes de gravá-lo. Depois de gravado, o plano é imutável: não use a construção para compensar uma cobertura insuficiente.

## Base dos critérios

Estes critérios orientam decisões de autoria; não substituem avaliação pedagógica nem comprovam a eficácia de um curso. A progressão entre exemplo e prática apoia-se nos estudos sobre exemplos resolvidos de Sweller e Cooper (1985) e na redução gradual de apoio investigada por Renkl, Atkinson e Große (2004). A retomada distribuída considera a relação entre intervalo e retenção observada por Cepeda et al. (2008). A alternância de operações relacionadas considera o experimento de Taylor e Rohrer (2010), que separou seu efeito do simples espaçamento. A retomada distribuída, a alternância entre exemplos resolvidos e problemas e o uso de representações ligadas ao conteúdo também aparecem no guia de prática do Institute of Education Sciences (2007). A exigência de recuperar e aplicar o conteúdo, em vez de apenas relê-lo, considera os resultados de Roediger e Karpicke (2006). O feedback deve responder ao desempenho observado e indicar como avançar, conforme a síntese de Hattie e Timperley (2007). A escolha entre texto, código e representações estruturadas também considera as diretrizes de múltiplas formas de representação do CAST UDL 3.0.

- Sweller, J.; Cooper, G. A. (1985). *The use of worked examples as a substitute for problem solving in learning algebra*. Cognition and Instruction, 2(1), 59-89. <https://doi.org/10.1207/s1532690xci0201_3>
- Renkl, A.; Atkinson, R. K.; Große, C. S. (2004). *How fading worked solution steps works: A cognitive load perspective*. Instructional Science, 32, 59-82. <https://doi.org/10.1023/B:TRUC.0000021815.74806.f6>
- Cepeda, N. J.; Vul, E.; Rohrer, D.; Wixted, J. T.; Pashler, H. (2008). *Spacing effects in learning: A temporal ridgeline of optimal retention*. Psychological Science, 19(11), 1095-1102. <https://doi.org/10.1111/j.1467-9280.2008.02209.x>
- Taylor, K.; Rohrer, D. (2010). *The effects of interleaved practice*. Applied Cognitive Psychology, 24(6), 837-848. <https://doi.org/10.1002/acp.1598>
- Pashler, H. et al. (2007). *Organizing instruction and study to improve student learning*. Institute of Education Sciences. <https://ies.ed.gov/ncee/wwc/PracticeGuide/1>
- Roediger, H. L.; Karpicke, J. D. (2006). *Test-enhanced learning: Taking memory tests improves long-term retention*. Psychological Science, 17(3), 249-255. <https://doi.org/10.1111/j.1467-9280.2006.01693.x>
- Hattie, J.; Timperley, H. (2007). *The power of feedback*. Review of Educational Research, 77(1), 81-112. <https://doi.org/10.3102/003465430298487>
- CAST (2024). *Universal Design for Learning Guidelines 3.0*. <https://udlguidelines.cast.org/representation/>
