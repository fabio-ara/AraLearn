# Critérios de qualidade

## Ponto de partida

- Na falta de evidência concreta, planeje para uma pessoa sem conhecimentos prévios sobre o tema.
- Não acrescente um campo de pré-requisitos ao curso: o contrato persistido de
  `course` contém somente `id`, `title`, `goal` e `modules`. Quando um
  conhecimento anterior for realmente necessário, materialize-o numa
  microssequência anterior ou numa dependência verificável.
- Não pergunte se a pessoa é iniciante, intermediária ou avançada. Pergunte somente por um pré-requisito observável quando a resposta mudar o plano, como saber ler uma fórmula, executar um comando ou interpretar uma tabela.
- Apresente termos, símbolos, notações e operações antes de exigi-los. Familiaridade presumida precisa estar apoiada no pedido, nos materiais ou em uma resposta objetiva do autor.

## Planejamento didático

- O dimensionamento é uma decisão pedagógica obrigatória, feita mesmo quando o
  autor não pede quantidade de lições, cards ou práticas. Decomponha a ementa,
  o objetivo e as fontes em unidades ensináveis.
- Em `lesson.topics`, registre cada unidade compartilhada com `id`, `label`,
  `kind`, `checks` e `errors`. Use `kind` somente como `concept`, `procedure`,
  `representation` ou `term`.
- Em cada microssequência, declare o objetivo em `goal`, a função global em
  `role`, o recorte em `covers`, a evidência observável em `checks`, os
  equívocos em `errors` e apenas as dependências causais em `dependsOn`.
  `role` aceita `explain`, `practice`, `review` ou `support`; ele pertence à
  microssequência, não aos cards.
- Não trate a simples menção de vários itens no mesmo título, em `covers` ou
  num card como cobertura. Quando os itens pedirem vocabulário, relações,
  decisões ou formas de prática diferentes, separe-os em segmentos causais.
- Antes de persistir o documento, revise se cada tópico e cada item de
  `covers` possui apresentação suficiente e se cada item de `checks` chega a
  uma atividade observável. Os campos `topics` opcionais dos cards podem
  referenciar IDs de `lesson.topics` para tornar essa correspondência
  rastreável.
- A extensão final decorre do mapa de cobertura, dos erros previsíveis, da
  complexidade das decisões e das retomadas necessárias. Não comprima o
  percurso apenas para produzir menos lições, microssequências ou cards, nem
  acrescente repetição sem nova oportunidade de aprender ou recuperar.
- Quando materiais de avaliação ou critérios externos forem fornecidos, inclua
  práticas que reproduzam as decisões cognitivas observadas. O material calibra
  estilo e lacunas de prática, mas não limita o conteúdo ao exemplo recebido.
  A ancoragem formal, a adaptação e a rastreabilidade seguem a política de
  `sources.md`; não copie a questão nem mencione seu bastidor no card.
- As dependências formam um grafo justificável. `dependsOn` aponta para IDs de
  microssequências que realmente oferecem a base exigida, não para itens apenas
  vizinhos.
- A progressão é observável na ordem dos cards: fundamento, exemplo resolvido,
  prática guiada e prática com menor apoio, quando essas etapas forem
  pertinentes. Não invente metadados de função por card; a sequência e o
  conteúdo precisam demonstrar a progressão.
- Uma microssequência que ensina uma operação nova não começa pela cobrança da
  operação nem termina apenas na explicação.
- A quantidade de práticas decorre da complexidade de `checks`, dos erros
  previsíveis e da necessidade de retomada. Quando houver várias práticas,
  torne visível a variação de caso, representação, estratégia, erro provável ou
  grau de apoio.
- O recurso escolhido corresponde à operação cognitiva. Consulte primeiro o
  catálogo compacto de packages instalados. Só depois de escolher recupere o
  contrato da versão exata. Não reduza a autoria a texto e escolha quando
  outro package preservar melhor o raciocínio.
- A escolha fica materializada em uma instância de package de `card.content`,
  `card.response` ou `card.feedback`. Confira se ela preserva
  `microsequence.goal`, `covers` e `checks`; não acrescente ao JSON um bloco
  paralelo de preferências de representação.
- A diversidade de recursos decorre do conteúdo. Não estabeleça cota e não troque o formato apenas para variar a aparência.
- A retomada de conhecimentos anteriores usa `dependsOn`, os tópicos da lição
  e conteúdo anterior visível. Um conceito só pode ser recuperado depois de uma
  apresentação anterior na mesma cadeia causal.
- A retomada reaparece depois de uma separação significativa na trilha. Não aplique um intervalo universal: a distância depende da finalidade, da extensão do percurso e das oportunidades reais de estudo.
- A alternância reúne operações relacionadas quando distingui-las faz parte do resultado. Não misture operações ainda não apresentadas nem transforme um card em inventário de assuntos.
- Uma sequência de práticas varia pelo menos o caso, a representação, o erro provável, a estratégia ou o grau de apoio. Repetir o mesmo enunciado com números diferentes não basta quando a operação admite variação mais significativa.

## Construção dos cards

- Um card de prática mede uma decisão principal.
- A prática é autossuficiente. O enunciado não depende de imagem, texto ou aula ausente.
- Dados voláteis aparecem no próprio card: valores, nomes, trechos de código, tabelas, casos, coordenadas, opções e demais elementos particulares da questão não podem existir apenas em um card anterior. Conceitos e notações já ensinados podem ser mobilizados, mas o caso que será resolvido precisa estar completo.
- Confira os dados necessários nos campos que a pessoa vê antes de responder,
  como enunciado, texto, código, rótulos, valores ou alternativas. Metadados,
  respostas e conteúdo oculto não tornam a prática autossuficiente.
- Cada item de `microsequence.checks` precisa chegar a uma prática observável.
  Quando útil, `card.topics` liga o card aos IDs declarados em
  `lesson.topics`; não crie campos adicionais para resultados ou funções.
- A diferença entre práticas próximas deve estar no conteúdo observável: caso,
  condição, representação, estratégia, erro provável ou grau de apoio.
- Uma prática cobra uma decisão principal. Ela pode mobilizar pré-requisitos aprovados, mas não pode exigir que a pessoa reconstrua o caso a partir de posição, cor, legenda extensa, card anterior, feedback ou resposta oculta.
- Termo técnico, símbolo, sigla, unidade, papel, convenção ou relação nova recebe explicação suficiente antes de ser exigido. Expanda a sigla na primeira ocorrência e explique sua função, não apenas as letras. Para comando, utilitário ou palavra reservada, apresente forma literal, significado, função e ambiente; por exemplo, `pwd` significa `print working directory` e mostra o diretório de trabalho atual. Não use jargão mais avançado como explicação de uma lacuna conceitual.
- Quando o estudante deve completar uma representação, use um package de
  resposta compatível com o conteúdo. A lacuna, as alternativas ou os itens
  ordenáveis pertencem ao contrato específico desse package; não descreva a
  posição da resposta em prosa.
- A lacuna mede a operação planejada e não pode ter a resposta exposta em título, enunciado, rótulo, outra opção, feedback antecipado, estrutura visível ou geometria derivada do mesmo card. O feedback explica a condição decisiva e não fornece a base que faltava para responder.
- Prefira `aralearn.response.choice` quando os distratores representam erros
  plausíveis. Use `aralearn.response.gap` somente quando a resposta puder ser
  normalizada sem exigir grafia arbitrariamente exata. Variantes aceitas devem
  ser literais, distintas e auditáveis. Não use regex nem pressuponha
  equivalência semântica.
- O título não entrega a resposta.
- O enunciado não contém a resposta por repetição involuntária.
- Alternativas erradas representam equívocos plausíveis e não simples absurdos.
- No package de escolha, selecione resposta única ou múltipla conforme a
  evidência pretendida e verifique o conjunto exato de identificadores.
- A pergunta de `aralearn.response.choice` é o único enunciado da escolha. Não
  copie a mesma pergunta para um `paragraph` de `content`; use `content: []`
  quando não houver cenário, dado ou representação adicional.
- Use de 2 a 7 opções. Três alternativas costumam bastar; cinco só se justificam quando houver quatro distratores ou decisões realmente competitivos. Não infle a lista.
- Detecte opções equivalentes, pistas gramaticais, diferença injustificada de extensão, repetição exclusiva do enunciado e alternativa parcialmente correta tratada como errada sem condição explícita.
- O feedback explica a regra, o detalhe decisivo e o motivo do erro provável.
- Termos são apresentados com explicação antes do primeiro uso exigido.
- Uma expressão em outro idioma recebe tradução ou glosa quando isso ajuda o público previsto.
- Datas, versões, unidades e condições relevantes são explícitas.
- Referências temporais vagas, como “atualmente” ou “recentemente”, não substituem uma data necessária.
- Respeite `guide.exclude` e `guide.avoid` também em títulos, alternativas e
  feedback.
- `sources` contém somente IDs autorizados no workspace ou no contexto da
  operação. Não transforme nome de arquivo, URL ou trecho recuperado em fonte
  implícita.

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
- Em `system_map`, grupos correspondem a limites ou regiões identificáveis, componentes declaram pertencimento e conexões têm origem, destino, direção e rótulo quando semanticamente necessários. Não use a posição visual como única evidência de pertencimento.
- Em `reaction`, reagentes e produtos ocupam lados distintos, coeficientes e estados pertencem à espécie correta e a seta/condição corresponde ao fenômeno descrito. Uma equação simbólica não substitui representação macroscópica ou submicroscópica quando a coordenação entre níveis é o objetivo.

## Revisão antes de aceitar

O contrato persistido não possui campos extras de auditoria. A revisão combina
validação automática e inspeção do conteúdo:

1. valide o envelope do projeto e cada instância contra o contrato exato do
   package versionado, sem propriedades desconhecidas;
2. compare `lesson.topics`, `microsequence.goal`, `role`, `covers`, `checks`,
   `errors` e `dependsOn` com os cards realmente presentes;
3. leia a sequência na ordem em que a pessoa estudará e confirme que base,
   exemplo, prática e retomada aparecem quando necessários;
4. confirme que o recurso preserva a operação, que os dados são
   autossuficientes e que resposta e feedback permanecem coerentes;
5. confira fontes, linguagem, integridade estrutural, acessibilidade e respeito
   a `guide.exclude` e `guide.avoid`.

As verificações automáticas da assistência podem detectar propriedades
inválidas, fontes não autorizadas, referências externas explícitas, termos de
`exclude`/`avoid` e alguns vazamentos de resposta. Elas não comprovam correção
factual, cobertura pedagógica completa nem autossuficiência para toda
formulação possível. A revisão humana especializada continua necessária.

Na autoria pelo chat, a auditoria independente aplica esta lista somente para
diagnosticar e relatar. Ela não altera conteúdo. O reparo ocorre em outra
rodada, limitado aos problemas autorizados, e uma reauditoria posterior relê o
estado persistido. Essa separação é procedimental; não cria estado ou trava no
contrato.

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
