# Fundamentação pedagógica dos resources

## Finalidade e limites

Este documento registra a base teórica usada no desenho dos packages de
cards. Ele serve à documentação do artefato técnico e à futura dissertação, mas
não transforma decisões de engenharia em evidência de eficácia educacional.
Resultados de aprendizagem do AraLearn ainda precisam ser investigados com
participantes, tarefas e medidas adequadas.

O argumento de design é: uma representação deve ser escolhida quando sua
estrutura ajuda a executar a operação cognitiva pretendida; a prática deve
exigir recuperação ou discriminação observável; e a interface deve evitar carga
extrínseca que não contribui para aprender.

## Matriz de evidências e decisões

| Base | Implicação didática | Decisão no AraLearn | Limite |
|---|---|---|---|
| Carga cognitiva e atenção dividida | Informação que precisa ser integrada deve permanecer próxima | feedback localizado, anotações adjacentes, fórmula com leitura acessível, nenhum layout descrito por prosa | proximidade visual não garante compreensão |
| Coerência, sinalização e contiguidade | Elementos relevantes devem ser destacados sem decoração concorrente | presets semânticos, highlights referenciados por ID, labels próximos, ausência de propriedades livres de estilo | sinalização excessiva também pode competir por atenção |
| Múltiplas representações | Representações cumprem funções distintas e precisam ser coordenadas | objetivo e evidência em `goal`/`checks`, packages escolhidos antes da composição e múltiplas instâncias apenas para coordenação necessária | mais representações não são automaticamente melhores |
| Notações relacionais | Entidades e relações precisam ser perceptualmente distinguíveis e semanticamente explícitas | `graph` preserva a gramática nó-aresta matemática; os três packages de sistemas separam contexto C4, contêineres C4 e composição interna SysML | princípios de notação não comprovam ganho de aprendizagem por si sós |
| Representações químicas | Equações codificam lados, coeficientes, estados e tipos de seta; fenômeno químico também envolve níveis macro e submicroscópico | `reaction` preserva a equação simbólica e pode ser coordenado com outras representações | uma equação correta não demonstra fluência entre níveis representacionais |
| Exemplos resolvidos e fading | Novatos se beneficiam de exemplo antes de resolução com apoio progressivamente menor | sequência observável de fundamento, exemplo resolvido, prática guiada e prática com menor apoio | expertise e natureza da tarefa alteram o apoio necessário |
| Prática de recuperação | Recuperar favorece retenção posterior mais que apenas reler | microssequências combinam explicação, prática e retomada | reconhecimento simples pode ser insuficiente para alguns objetivos |
| Espaçamento e intercalação | O intervalo e a discriminação entre operações importam | dependências explícitas, retomadas posteriores e intercalação de categorias confundíveis | não existe intervalo universal; variedade aleatória não equivale a intercalação |
| Feedback corretivo | Conteúdo informacional, tarefa, momento e perfil moderam o efeito | confirmação antes da avaliação, feedback por opção e explicação causal em packages no slot `feedback` | feedback genérico, controlador ou apenas avaliativo pode ter pouco valor |
| Distratores funcionais | Opções não funcionais consomem tempo sem melhorar o item | 2 a 7 opções; quantidade deriva de equívocos plausíveis | perfil de prova pode justificar cinco somente quando há competição real |
| Multiple-response | Mais de uma resposta pode exigir recuperação adicional | `selectionMode: multiple`, `answerIds` plural e exact-set scoring | marcação múltipla aumenta carga e deve corresponder ao objetivo |
| Acessibilidade móvel | reflow, foco não oculto e alvos acionáveis preservam operação em telas estreitas | coluna móvel, controles por toque/teclado, confirmação, sem drag-and-drop | testes automatizados não substituem avaliação com usuários |

## Carga cognitiva e integração

Sweller (1988) descreve como busca por solução pode consumir recursos que não
se convertem em aprendizagem. Chandler e Sweller (1992) observaram que separar
fontes que precisam ser mentalmente integradas impõe carga extrínseca; a
integração física de texto e diagrama pode reduzi-la. Isso sustenta:

- não remeter a pessoa a dados particulares de um card anterior;
- posicionar feedback no item ou trecho correspondente;
- manter label, unidade e relação perto do objeto visual;
- preferir uma estrutura compacta a uma legenda que exige alternância contínua;
- dividir um caso quando a tela exige várias decisões independentes.

O princípio não autoriza remover complexidade inerente ao conteúdo. Uma matriz
continua bidimensional e um grafo continua relacional. O objetivo é eliminar a
busca visual e editorial que não faz parte da tarefa.

Mayer e Fiorella organizam evidências sobre coerência, sinalização,
redundância e contiguidade espacial/temporal. No contrato, a LLM indica
entidades, relações e destaques sem escolher cor ou posição. Assim, a mesma
semântica pode receber apresentação consistente em celular, desktop e leitura
assistiva.

## Representações externas

O framework DeFT de Ainsworth (2006) propõe analisar Design, Functions e Tasks
das múltiplas representações. Elas podem complementar informação, restringir
interpretações ou apoiar compreensão mais profunda, mas sua coordenação também
pode exigir esforço.

Rexigel et al. (2024) revisaram comparações com mais de duas representações
externas em STEM e encontraram resultados dependentes do comparador, do tipo de
representação, do apoio e do contexto. A síntese reforça uma regra negativa
importante: quantidade não é critério de qualidade. Múltiplas instâncias em
`content` só se justificam quando a coordenação simultânea faz parte da tarefa;
os packages são
um repertório, não um checklist de variedade por curso.

No AraLearn:

- `table`, `matrix`, `chart` e `plane` não são estilos de parágrafo;
- `tree`, `graph` e `flow` distinguem hierarquia, topologia abstrata e decisão;
- `annotated_text` ancora comentários em trechos identificáveis e mantém a
  navegação bidirecional entre evidência e explicação;
- `interlinear_gloss` alinha forma segmentada e glosa morfema a morfema,
  separa a tradução livre e explicita abreviações gramaticais;
- `software_system_context`, `software_container` e `system_internal_block`
  distinguem, respectivamente, fronteira externa, unidades executáveis internas
  e composição por partes, portas e conectores;
- `reaction` preserva a gramática de uma equação química;
- `truth_table`, `set_diagram` e `relation_map` distinguem valoração
  lógica, regiões de conjuntos e pares de uma relação binária;
- `entity_relationship`, `database_schema`, `memory_layout` e `call_stack`
  preservam, respectivamente, modelo conceitual, esquema lógico com chaves,
  intervalos de endereços e ativações de funções;
- `packet_layout`, `network_topology` e `state_machine` distinguem campos
  contíguos de protocolo, equipamentos/enlaces e comportamento dependente de
  estado;
- `state_transition_table` torna explícita a função de transição, enquanto
  `bpmn_process` preserva participantes, raias, atividades, gateways e a
  distinção normativa entre fluxo de sequência e fluxo de mensagem;
- múltiplos packages em `content` são reservados à tarefa que realmente exige coordenação.

`set_diagram` não é uma lista cercada por círculos. O contrato distingue
explicitamente Venn, que conserva todas as regiões lógicas possíveis, de
Euler, cuja topologia conserva somente inclusões e interseções existentes.
O autor declara conjuntos, símbolos e pertencimento; `@upsetjs/venn.js`
calcula os contornos sem receber coordenadas. Símbolos curtos permanecem junto
das curvas e marcadores numerados ancoram cada região a uma descrição completa,
evitando comprimir rótulos longos dentro das sobreposições. Para simples
classificação sem sobreposição vence uma resposta de encaixe ou uma tabela;
para mais de três conjuntos, Venn/Euler deixa de ser admitido e uma futura
representação de interseções precisa de package próprio.

Cada package de conteúdo expõe folhas textuais selecionáveis e pode ser
composto com resposta por lacuna/digitação ou encaixe. A prática fica no
package de resposta: essa separação impede que a interação descaracterize a
notação acadêmica do objeto. `matrix`, por exemplo, não recebe cabeçalhos de
atributos nem grade tabular; registros pertencem a `table`, enquanto chaves e
referências pertencem a `database_schema`.

`goal`, `covers` e `checks` declaram a intenção antes da escolha dos packages.
A revisão pergunta se a composição preserva a evidência
desejada, não se a sequência apresenta variedade visual.

## Gráficos estatísticos e plano cartesiano

`chart` não recebe coordenadas de tela nem uma legenda textual improvisada. O
contrato declara tipo, domínio, escala e unidade de cada eixo; séries contêm
pontos nomeados e podem incluir limites inferior e superior já calculados. A
autoria também nomeia a medida de incerteza e a nota metodológica. O package
compila essa semântica em Vega-Lite e Vega no próprio navegador. A árvore de
expressões é executada pelo interpretador do Vega, sem geração dinâmica de
código e sem relaxar a política de segurança do aplicativo. Os runtimes ficam
locais e continuam disponíveis offline. Vega-Lite
deriva eixos, escalas e marcas a partir dos campos e admite escalas contínuas,
temporais e discretas, domínios explícitos, camadas, regras de referência e
barras de erro com limites preagregados
([escalas](https://vega.github.io/vega-lite/docs/scale.html),
[barras de erro](https://vega.github.io/vega-lite/docs/errorbar.html),
[regras](https://vega.github.io/vega-lite/docs/rule.html)).

O exemplo canônico não pretende simular um artigo real. Ele é identificado
como sintético e funciona como teste de estresse: duas séries, seis níveis de
concorrência em escala logarítmica, doze intervalos de confiança, limiar
operacional e nota de método. Isso permite inspecionar no celular problemas que
três pontos igualmente espaçados ocultavam. `chart` permanece deliberadamente
limitado a linhas, dispersão e barras. Distribuição, histograma, boxplot,
regressão, múltiplos painéis ou diagnóstico de modelo exigem packages próprios,
em vez de serem imitados por esse contrato.

`plane` diferencia ponto, vetor aplicado e trajetória ou região. Cada vetor
declara origem e extremidade; cada caminho conserva a ordem dos pontos; os
eixos têm domínio e unidade próprios. A geometria também é compilada por
Vega-Lite, enquanto o contrato permanece em linguagem matemática de alto nível.
Categorias comparáveis podem ser declaradas em `groups`. A legenda apresenta
essas categorias e agrega os objetos que pertencem a cada uma, em vez de criar
uma entrada desconexa para cada ponto, vetor e região. O renderer usa uma
paleta de dados própria para cada tema e repete a distinção por traço e forma;
cor nunca é o único canal para reconhecer um grupo.
Tipo geométrico e categoria são dimensões independentes: pontos permanecem
circulares em qualquer grupo, vetores são reconhecidos pela ponta de seta e
trajetórias ou regiões pelo contorno. A ponta termina na coordenada `to`; ela
não usa a extremidade como centro e não avança além do valor declarado.
O exemplo canônico coordena base canônica, imagens de vetores por uma
transformação linear, ponto e imagem do ponto, quadrado unitário e região
transformada. Assim, exercita valores negativos, múltiplos rótulos, escalas e
objetos sobrepostos sem reduzir o plano a “um vetor saindo da origem”.

Essa abrangência não transforma `plane` em renderer universal. Campos
vetoriais densos, contornos, superfícies, três dimensões e objetos especializados
precisam de packages próprios; por exemplo, bibliotecas científicas tratam
campos vetoriais como uma operação específica de `quiver`, não como um conjunto
genérico de pontos ([Matplotlib, `quiver`](https://matplotlib.org/stable/api/quiver_api.html)).
O critério é preservar a convenção acadêmica do objeto, não anunciar suporte a
qualquer visualização usada em graduação ou pesquisa.

## Mapas, sistemas e notação visual

Novak e Cañas (2006) descrevem mapas conceituais como conceitos conectados por
relações nomeadas e organizados em torno de uma pergunta de foco. Essa fonte
apoia a exigência geral de rótulos relacionais explícitos e de um propósito de
leitura, mas não autoriza usar `graph` como mapa conceitual genérico. No
AraLearn, `graph` representa o objeto matemático nó-aresta; mapas conceituais
precisarão de package próprio se esse gesto cognitivo entrar no catálogo.

Moody (2009) propõe princípios para notações visuais cognitivamente eficazes,
como discriminação perceptual, transparência semântica e gerenciamento da
complexidade. O trabalho é uma teoria de desenho no domínio de engenharia de
software. No AraLearn, ele orienta escolhas conservadoras: tipos têm
convenções consistentes, o rótulo visível não é substituído por cor ou posição
e a LLM não fornece geometria.

O antigo `system_map` genérico foi abolido porque misturava níveis e notações.
`software_system_context` e `software_container` seguem as finalidades e os
níveis do modelo C4: o primeiro situa pessoas e sistemas externos em torno de
um único sistema em foco; o segundo abre essa fronteira apenas para aplicações
e armazenamentos executáveis ou implantáveis. `system_internal_block` usa a
gramática de diagrama interno de bloco do SysML, na qual partes tipadas expõem
portas e conectores. Os contratos não recebem coordenadas: Graphviz/Viz.js
calcula posições, recorta arestas nos nós e reduz cruzamentos. No contexto C4,
a leitura móvel progride verticalmente de pessoas para o sistema em foco e,
depois, para sistemas externos. Tipos são metadados tipográficos discretos;
o nome do objeto recebe a ênfase principal e sua responsabilidade permanece em
texto corrente. Colchetes só aparecem quando integram uma convenção formal do
domínio.

O renderer preserva a geometria natural calculada pelo motor. Diagramas
Graphviz, grafos e fluxogramas usam um frame local com altura limitada e
rolagem nativa nos dois eixos quando a estrutura excede o espaço disponível.
A barra horizontal permanece, assim, no limite inferior do frame, sem exigir
que a pessoa percorra toda a altura do desenho. Dentro do frame, o gesto move o
diagrama; fora dele, move o card. Não há instrução visual autorreferente para
um gesto convencional, o enquadramento vertical começa pelo início da
representação e o documento externo não sofre overflow. O CSS não altera família
nem tamanho tipográfico depois da diagramação, porque isso invalidaria as
caixas usadas pelo Graphviz. Rótulos estáticos com tipo, nome, tecnologia e
descrição são tabelas tipográficas do próprio Graphviz: o mesmo conteúdo que
determina a largura e a altura do nó é o que permanece visível na exposição.
Não se substitui depois da diagramação um rótulo estático por HTML com métricas
diferentes. Lacunas e digitação substituem somente rótulos
declarados pelo package; edição manual e assistência por API recebem as mesmas
folhas textuais, enquanto ids, referências, tipos, direções e topologia ficam
protegidos como contexto estrutural.

A orientação também deriva da semântica, não de coordenadas autorais. Uma
política compartilhada traduz progressão em bloco de cima para baixo,
progressão em linha da esquerda para a direita e estruturas livres para o
motor apropriado.
No leitor móvel, esquemas relacionais de banco de dados, modelos
entidade–relacionamento, topologias de rede e máquinas de estados priorizam a
progressão vertical. A relação entre domínio e contradomínio e o diagrama
interno de bloco SysML conservam a leitura lateral, pois lados, portas e
incidência fazem parte da notação. Grafos não hierárquicos continuam livres.
Essa política é interna ao package e não acrescenta orientação, largura ou
posição ao contrato preenchido pelo GPT.

Verticalizar o fluxo principal não significa transpor o objeto acadêmico.
Tabelas, matrizes, equações, reações, layouts de pacote e eixos cartesianos
preservam linhas, colunas, sintaxe e eixos convencionais; quando excedem a
largura, a rolagem local é informação espacial legítima. Diagramas densos são
recortados pedagogicamente ou divididos entre cards, nunca comprimidos até
prejudicar a leitura.

Esses packages não são intercambiáveis. Um processo com condição permanece
`flow` quando o objeto é um algoritmo; um processo de negócio entre
responsabilidades permanece `bpmn_process`; equipamentos e enlaces permanecem `network_topology`; relações entre
dois conjuntos permanecem `relation_map`; e topologia matemática abstrata
permanece `graph`.

`bpmn_process` cobre deliberadamente um subconjunto didático de BPMN 2.0:
participantes ou pools, raias, eventos, tarefas, gateways exclusivos e
paralelos, fluxo de sequência e fluxo de mensagem. A distinção não é estética:
fluxo de sequência ordena atividades dentro de um participante, enquanto
fluxo de mensagem comunica participantes distintos. Coreografia, conversação
e a notação completa de eventos precisam de packages próprios quando forem o
objeto de aprendizagem. O contrato declara semântica e responsabilidade; o
Graphviz calcula clusters, posições e rotas. A especificação normativa e os
exemplos da OMG são as referências de gramática visual, não um fluxograma
genérico com raias (<https://www.omg.org/spec/BPMN/2.0/>). No leitor móvel, a
progressão principal é diagramada de cima para baixo. A largura natural não é
comprimida: processos ou rótulos extensos usam rolagem local. Em práticas, o
Graphviz recebe antecipadamente a resposta válida mais larga de cada lacuna;
assim, a atividade é dimensionada antes da resposta aparecer e o texto
interativo não pode ser recortado quando a lacuna é preenchida.

Em teoria dos grafos, cruzamentos não tornam um desenho automaticamente
inválido: planaridade é uma propriedade específica, e grafos não planares
existem. Ainda assim, cruzamentos, curvas desnecessárias e rótulos sobrepostos
prejudicam a leitura. `graph` entrega a topologia completa aos engines do
Graphviz, selecionados por estrutura, em vez de posicionar vértices ou arestas
artesanalmente. Grafos densos devem ser divididos ou apresentados por outra
representação matemática, como matriz de adjacência, quando essa for a operação
pedagógica pretendida.

## Fluxogramas e complexidade estrutural

`flow` conserva uma AST de controle, e não coordenadas. O package compila essa
estrutura em grafo de fluxo de controle e entrega a geometria ao algoritmo
`dot` do Graphviz, executado localmente por Viz.js. O motor escolhe posições,
dimensões e rotas a partir da topologia completa. Rótulos como **Sim** e
**Não** pertencem à aresta correspondente; convergências passam por uma única
junção; e retornos de laço são arestas semanticamente distintas. Restrições
invisíveis podem ordenar a leitura sem criar etapa fictícia no conteúdo nem
aresta visual adicional.

O desenho permanece legível no exemplo pequeno e pode crescer conforme o
algoritmo. Não existe obrigação de comprimir um algoritmo na largura móvel:
estruturas maiores conservam as dimensões calculadas pelo Graphviz e usam o
frame bidirecional local, inicialmente posicionado no início do fluxo, sem
provocar overflow na página. Textos expositivos permanecem no próprio SVG e
participam da medição do motor; somente uma lacuna interativa troca o rótulo
correspondente por HTML ancorado ao símbolo calculado. O renderer continua
sendo único: falha de diagramação é explícita e não ativa árvore textual,
geometria manual ou outro fallback visual.

## Equações e múltiplas representações químicas

A IUPAC define a equação de reação química como representação simbólica com
reagentes à esquerda, produtos à direita, coeficientes estequiométricos e
símbolos de conexão com significados distintos. Isso fundamenta a separação
estrutural de `reactants`, `products`, `coefficient` e `reactionType` em
`reaction`. O contrato também conserva `state` e `conditions` como contexto
explícito, em vez de embuti-los numa string livre.

Fórmula, matriz e reação usam MathML para as estruturas matemáticas e
químicas. Como o Chromium móvel não expande delimitadores sem engrossar seus
glifos, `formula` e `matrix` compartilham delimitadores vetoriais de traço fino
e não escalável. Em `formula`, cada delimitador acompanha a caixa real do
conteúdo agrupado; em `matrix`, acompanha exatamente a altura da grade. A AST
e as entradas continuam em MathML, sem dimensão fornecida pelo autor.
`reaction` explicita o espaço fino entre coeficiente e espécie e espaços
laterais em torno de sinais e setas. A interação de lacuna permanece no package
e só pode atingir uma entrada ou componente químico efetivamente visível. O
kernel simula essa composição ao validar o card e recusa alvos que não
materializem um controle interativo.

`interlinear_gloss` segue a finalidade das Leipzig Glossing Rules: preservar
correspondência entre unidades e fronteiras de morfemas, sem fabricar
alinhamento por espaços. A tradução livre pertence ao exemplo inteiro, e a
legenda introduz abreviações antes que o estudante precise inferi-las. O
exemplo canônico de teste reproduz a estrutura do exemplo lezguiano das regras,
com seis unidades, múltiplas fronteiras morfológicas e quatro abreviações.

Nyachwaya e Wood (2014), ao avaliar representações em livros de físico-química,
retomam os níveis macroscópico, submicroscópico e simbólico associados a
Johnstone e observam predominância de representações simbólicas no corpus
estudado. Os autores também ressaltam a necessidade de características
superficiais claras e relação explícita entre representação e texto. O
`reaction` resolve a integridade do nível simbólico, mas não simula partículas
nem observações macroscópicas. Quando transitar entre níveis fizer parte do
objetivo, a autoria precisa coordenar representações separadas ou usar
packages de representação, com indicação explícita da correspondência.

Essa decisão evita duas conclusões indevidas: adicionar uma imagem molecular
não garante coordenação representacional, e apresentar apenas uma equação
balanceada não garante compreensão do fenômeno químico.

## Exemplos resolvidos e retirada de apoio

Sweller e Cooper (1985) encontraram vantagem de exemplos resolvidos sobre
resolução convencional em aquisição inicial de álgebra. Uma meta-análise mais
recente de Barbieri et al. (2023), com 55 estudos, encontrou efeito médio em
desempenho matemático, além de moderadores de desenho. Renkl et al. (2002)
estudaram transições suaves do estudo de exemplos à resolução; Renkl, Atkinson
e Große (2004) analisaram fading de passos sob a perspectiva da carga
cognitiva.

O apoio não deve permanecer idêntico para qualquer pessoa. Kalyuga et al.
(2003) sistematizam o efeito de reversão da expertise: técnicas úteis a
iniciantes podem tornar-se redundantes ou prejudiciais conforme aumenta o
conhecimento prévio. Por isso, a progressão abaixo é um padrão inicial
auditável, não uma quota fixa nem uma ordem universal.

Essas evidências sustentam uma progressão causal, não uma quantidade rígida de
cards:

1. introduzir a base e a notação;
2. mostrar um caso resolvido da mesma operação;
3. solicitar um passo com apoio;
4. solicitar a operação com menos apoio;
5. variar caso, estratégia ou erro provável;
6. retomar depois quando a retenção for relevante.

Retirar apoio não significa ocultar os dados necessários. A diferença é entre
mostrar como decidir e fornecer o caso que precisa ser decidido.

## Recuperação, espaçamento e feedback

Roediger e Karpicke (2006) mostraram que testes de recuperação podem melhorar
retenção posterior em comparação com estudo repetido. Yang et al. (2021)
sintetizaram 222 estudos independentes em sala; Agarwal, Nunes e Blunt (2021)
revisaram 50 experimentos aplicados e encontraram benefícios em diferentes
níveis e áreas, embora com baixa representação de países não WEIRD. O contrato
permite recuperação observável, mas não presume que qualquer clique ou
reconhecimento produza o mesmo efeito.

Cepeda et al. (2006) sintetizaram uma ampla literatura sobre prática
distribuída e mostraram que os efeitos dependem dos intervalos. Brunmair e
Richter (2019) encontraram efeito médio da intercalação com moderadores
substanciais: a vantagem foi mais clara quando discriminar categorias
semelhantes era relevante e não se generalizou igualmente a todos os
materiais. O AraLearn, portanto, registra pré-requisitos e retomadas sem fixar
uma distância universal nem introduzir variedade aleatória como finalidade.

Múltipla escolha exige cautela porque os distratores expõem a informação
incorreta. Butler, Karpicke e Roediger (2007) investigaram tipo e momento de
feedback; Butler e Roediger (2008) encontraram que feedback pode ampliar os
efeitos positivos e reduzir os negativos do teste de múltipla escolha. Daí:

- a seleção não é avaliada a cada toque;
- a pessoa confirma antes de receber o resultado;
- feedback de opção explica a distinção local;
- o slot `feedback` explicita a causa, a regra ou o próximo passo e não apenas diz
  “correto”;
- “ver resposta” distingue itens que deveriam e não deveriam ser marcados.

Shute (2008) descreve feedback formativo como informação destinada a modificar
o pensamento ou o comportamento, com efeitos dependentes da tarefa e da
pessoa. A meta-análise de Wisniewski, Zierer e Hattie (2020), com 435 estudos,
encontrou forte heterogeneidade e maior efeito para feedback com mais
informação. Esses resultados apoiam feedback específico, mas não autorizam
tratar toda mensagem pós-resposta como igualmente eficaz.

## Quantidade de opções e respostas múltiplas

Rodriguez (2005), numa meta-análise de 80 anos de pesquisa, concluiu que itens
com três opções frequentemente preservam qualidade psicométrica e permitem
maior cobertura. Raymond, Stevens e Bucak (2019) reforçam a importância de
identificar distratores não funcionais em provas de alto impacto.

O contrato aceita 2 a 7 opções porque o produto atende tarefas e perfis
distintos, mas a regra editorial é conservadora: só se adiciona uma opção
quando ela representa erro, condição ou decisão plausível. Cinco alternativas
podem ser adequadas quando uma avaliação externa exige esse formato; não são o
padrão universal do item.

Bishara e Lanzo (2015) encontraram condições em que opções múltiplas corretas
podem intensificar o testing effect. Isso apoia `multiple`, mas não justifica
usá-lo indiscriminadamente. O modo é apropriado quando reconhecer o conjunto
completo faz parte do resultado. O AraLearn usa correção pelo conjunto exato,
sem crédito por ordem ou marcação parcial implícita.

## Interação móvel, acessibilidade e interrupção

WCAG 2.2 orienta reflow sem perda de informação, foco visível e não oculto,
alternativas a gestos de arrastar e tamanho mínimo de alvo. O critério 1.4.10
permite preservar uma viewport própria para conteúdo bidimensional cuja
estrutura dependa de duas dimensões, sem estender a exceção ao restante da
página. O critério 2.5.8 estabelece alvo mínimo de 24 × 24 CSS px ou
espaçamento equivalente nas exceções previstas. O AraLearn adota uma meta
interna de 44 × 44 CSS px para linhas de resposta, superior ao mínimo AA,
porque o cenário de uso inclui uma mão, movimento e atenção fragmentada.

Recursos bidimensionais podem ter viewport próprio quando a relação espacial é
essencial, mas o texto ao redor deve refluir. O frame usa rolagem nativa e
`touch-action: pan-x pan-y`: não registra manipuladores artesanais que capturem
o toque. O limite de `48dvh`, até 430 px, mantém as duas barras ao alcance e
preserva área externa suficiente para rolar o card. A pessoa precisa conseguir
interromper, fechar e retomar no ponto corrente preservado no IndexedDB. A
resposta em elaboração existe apenas enquanto a tela do card está aberta; o
AraLearn não conserva tentativas, resultados ou histórico de respostas.
Nenhum renderer depende de CDN ou cálculo remoto.

## Determinismo e autoridade da LLM

Os schemas distribuídos declaram o dialeto JSON Schema 2020-12, enquanto o
validador do kernel implementa somente o subconjunto de palavras-chave usado
pelos packages. Structured Outputs, quando oferecido pelo provider, restringe
a saída à forma do schema; JSON mode apenas
garante JSON válido e é anunciado separadamente. A própria documentação do
DeepSeek alerta que JSON Output pode ocasionalmente devolver conteúdo vazio.
Por isso, o provider nunca é tratado como autoridade do contrato: resposta
vazia, truncada ou apenas sintaticamente válida falha antes de qualquer mudança
ser gravada. Em todos os providers, o AraLearn continua responsável por:

- validar referências, dimensões e invariantes;
- verificar interação, resposta e feedback;
- impor guarda de escopo e fingerprint;
- calcular layout e acessibilidade;
- falhar fechado diante de alteração lateral.

O modelo não produz HTML, CSS, SVG, coordenadas, caminhos, cores nem cadeia de
pensamento. Essa limitação reduz o espaço de erro e mantém o estudo reproduzível
offline.

## Microteoria, prática e participação autoral

“Microteoria” é um termo operacional do AraLearn: um pequeno conjunto de cards
teóricos que apresenta uma unidade conceitual suficiente para sustentar as
práticas da microssequência. Não é tratado como método universal nem como
sinônimo automático de microlearning eficaz. O tamanho adequado depende da
estrutura do conteúdo, dos conhecimentos prévios e da operação esperada.

A revisão de escopo de De Gagne et al. (2019) reuniu apenas 17 estudos em
educação de profissionais da saúde, com tecnologias variadas; nenhum deles
definiu explicitamente microlearning. Dezesseis avaliaram reação, catorze
avaliaram aquisição de conhecimento ou habilidade, somente cinco avaliaram
comportamento e nenhum avaliou resultados no nível mais alto do modelo usado
pelos autores. Assim, “curto”, “móvel” ou “micro” não constituem,
isoladamente, evidência de aprendizagem duradoura. O AraLearn deve avaliar
empiricamente sua unidade operacional em outras populações e domínios.

Na autoria assistida, o chat projeta as microteorias e informa a quantidade de
práticas sem enumerá-las por padrão. Essa decisão não remove a prática do
curso. Ela separa duas revisões humanas:

- a pessoa autora julga recorte, correção, linguagem e coerência conceitual na
  microteoria;
- os validadores e a inspeção sob demanda conferem variedade, resposta,
  feedback, retirada de apoio e autocontenção das práticas.

Essa projeção reduz volume de conversa e cria um ponto de participação
formativa durante a construção. Black e Wiliam (1998) mostram que avaliação
formativa depende de evidências usadas para ajustar o ensino; no AraLearn, a
projeção é um mecanismo de decisão autoral, não evidência de aprendizagem do
estudante. A eficácia desse desenho ainda precisa ser testada empiricamente.

Usar a composição corrente em `Trilhas` permite testar cedo uma parte
funcional do percurso, sem publicar nem duplicar o workspace. O que já possui
cards fica estudável no mesmo item; o restante continua visível como
planejamento até ser materializado.

## Consequências para avaliação do artefato

Uma avaliação futura pode separar pelo menos quatro dimensões:

1. validade de contrato: taxa de saídas aceitas sem reparo;
2. isolamento: proporção de correções atômicas sem alteração lateral;
3. usabilidade móvel: conclusão, erro de toque, reflow, retomada e tempo;
4. qualidade didática: cobertura, função do recurso, recuperação, feedback e
   desempenho posterior.

Comparações úteis incluem `choice` versus `gap` no lugar estrutural, exemplos
com apoio fixo versus fading e representação única versus composição de packages
coordenado. A análise deve registrar conhecimentos prévios e evitar concluir
causalidade a partir de métricas de uso.

Para cada regra didática, a avaliação deve registrar cinco campos: fonte,
população e tarefa estudadas, força/limite da evidência, inferência feita pelo
AraLearn e métrica que poderá refutá-la. Reparo direto, fingerprint, validação
interna, versões locais limitadas e controle de escopo pertencem à
confiabilidade de software; expor só microteorias no chat e permitir o teste incremental da
composição corrente em `Trilhas` são hipóteses de produto. Não devem ser
apresentados como resultados já demonstrados pela literatura.

## Referências técnicas

- JSON Schema. *Draft 2020-12*. <https://json-schema.org/draft/2020-12>
- OpenAI. *Structured model outputs*.
  <https://developers.openai.com/api/docs/guides/structured-outputs>
- DeepSeek. *JSON Output*.
  <https://api-docs.deepseek.com/guides/json_mode/>
- Graphviz. *dot*. <https://graphviz.org/docs/layouts/dot/>
- Viz.js. *Graphviz in the browser*. <https://github.com/mdaines/viz-js>
- Brown, S. *The C4 model: diagrams*. <https://c4model.com/diagrams>
- Object Management Group. *SysML v1 specification*.
  <https://www.omg.org/sysml/sysmlv1/>
- W3C. *Web Content Accessibility Guidelines 2.2*. <https://www.w3.org/TR/WCAG22/>
- W3C WAI. *Understanding SC 1.4.10: Reflow*. <https://www.w3.org/WAI/WCAG22/Understanding/reflow>
- W3C WAI. *Understanding SC 2.5.8: Target Size (Minimum)*.
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum>
- IUPAC. *Compendium of Chemical Terminology: chemical reaction equation*.
  <https://doi.org/10.1351/goldbook.C01034>
- Max Planck Institute for Evolutionary Anthropology & Leipzig University.
  *The Leipzig Glossing Rules*.
  <https://www.eva.mpg.de/lingua/resources/glossing-rules.php>
- W3C. *MathML Core*. <https://www.w3.org/TR/mathml-core/>

## Referências acadêmicas

- Ainsworth, S. (2006). DeFT: A conceptual framework for considering learning
  with multiple representations. *Learning and Instruction, 16*(3), 183–198.
  <https://doi.org/10.1016/j.learninstruc.2006.03.001>
- Agarwal, P. K., Nunes, L. D., & Blunt, J. R. (2021). Retrieval practice
  consistently benefits student learning: A systematic review of applied
  research in schools and classrooms. *Educational Psychology Review, 33*,
  1409–1453. <https://doi.org/10.1007/s10648-021-09595-9>
- Alpizar, D., Adesope, O. O., & Wong, R. M. (2020). A meta-analysis of
  signaling principle in multimedia learning environments. *Educational
  Technology Research and Development, 68*, 2095–2119.
  <https://doi.org/10.1007/s11423-020-09748-7>
- Barbieri, C. A., Miller-Cotto, D., Clerjuste, S. N., & Chawla, K. (2023).
  A meta-analysis of the worked examples effect on mathematics performance.
  *Educational Psychology Review, 35*, Article 11.
  <https://doi.org/10.1007/s10648-023-09745-1>
- Bishara, A. J., & Lanzo, L. A. (2015). All of the above: When multiple correct
  response options enhance the testing effect. *Memory, 23*(7), 1013–1028.
  <https://doi.org/10.1080/09658211.2014.946425>
- Black, P., & Wiliam, D. (1998). Assessment and classroom learning.
  *Assessment in Education: Principles, Policy & Practice, 5*(1), 7–74.
  <https://doi.org/10.1080/0969595980050102>
- Butler, A. C., Karpicke, J. D., & Roediger, H. L. (2007). The effect of type
  and timing of feedback on learning from multiple-choice tests. *Journal of
  Experimental Psychology: Applied, 13*(4), 273–281.
  <https://doi.org/10.1037/1076-898X.13.4.273>
- Butler, A. C., & Roediger, H. L. (2008). Feedback enhances the positive
  effects and reduces the negative effects of multiple-choice testing.
  *Memory & Cognition, 36*(3), 604–616.
  <https://doi.org/10.3758/MC.36.3.604>
- Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of
  interleaved learning and its moderators. *Psychological Bulletin, 145*(11),
  1029–1052. <https://doi.org/10.1037/bul0000209>
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006).
  Distributed practice in verbal recall tasks: A review and quantitative
  synthesis. *Psychological Bulletin, 132*(3), 354–380.
  <https://doi.org/10.1037/0033-2909.132.3.354>
- Chandler, P., & Sweller, J. (1992). The split-attention effect as a factor in
  the design of instruction. *British Journal of Educational Psychology, 62*,
  233–246. <https://doi.org/10.1111/j.2044-8279.1992.tb01017.x>
- De Gagne, J. C., Park, H. K., Hall, K., Woodward, A., Yamane, S., & Kim,
  S. S. (2019). Microlearning in health professions education: Scoping review.
  *JMIR Medical Education, 5*(2), e13997.
  <https://doi.org/10.2196/13997>
- Huang, W., Eades, P., & Hong, S.-H. (2014). Larger crossing angles make
  graphs easier to read. *Journal of Visual Languages & Computing, 25*(4),
  452–465. <https://doi.org/10.1016/j.jvlc.2014.03.001>
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise
  reversal effect. *Educational Psychologist, 38*(1), 23–31.
  <https://doi.org/10.1207/S15326985EP3801_4>
- Mayer, R. E., & Fiorella, L. (2014). Principles for reducing extraneous
  processing in multimedia learning. In R. E. Mayer (Ed.), *The Cambridge
  Handbook of Multimedia Learning* (2nd ed., pp. 279–315).
  <https://doi.org/10.1017/CBO9781139547369.015>
- Moody, D. (2009). The “Physics” of Notations: Toward a scientific basis for
  constructing visual notations in software engineering. *IEEE Transactions
  on Software Engineering, 35*(6), 756–779.
  <https://doi.org/10.1109/TSE.2009.67>
- Novak, J. D., & Cañas, A. J. (2006). *The theory underlying concept maps and
  how to construct them*. Technical Report IHMC CmapTools 2006-01. Florida
  Institute for Human and Machine Cognition.
  <https://cmap.ihmc.us/publications/researchpapers/theorycmaps/TheoryUnderlyingConceptMaps.bck-11-01-06.htm>
- Nyachwaya, J. M., & Wood, N. B. (2014). Evaluation of chemical
  representations in physical chemistry textbooks. *Chemistry Education
  Research and Practice, 15*, 720–728.
  <https://doi.org/10.1039/C4RP00113C>
- Raymond, M. R., Stevens, C., & Bucak, S. D. (2019). The optimal number of
  options for multiple-choice questions on high-stakes tests: Application of
  a revised index for detecting nonfunctional distractors. *Advances in Health
  Sciences Education, 24*(1), 141–150.
  <https://doi.org/10.1007/s10459-018-9855-9>
- Renkl, A., Atkinson, R. K., Maier, U. H., & Staley, R. (2002). From example
  study to problem solving: Smooth transitions help learning. *The Journal of
  Experimental Education, 70*(4), 293–315.
  <https://doi.org/10.1080/00220970209599510>
- Renkl, A., Atkinson, R. K., & Große, C. S. (2004). How fading worked solution
  steps works: A cognitive load perspective. *Instructional Science, 32*,
  59–82. <https://doi.org/10.1023/B:TRUC.0000021815.74806.f6>
- Rodriguez, M. C. (2005). Three options are optimal for multiple-choice items:
  A meta-analysis of 80 years of research. *Educational Measurement: Issues
  and Practice, 24*(2), 3–13.
  <https://doi.org/10.1111/j.1745-3992.2005.00006.x>
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking
  memory tests improves long-term retention. *Psychological Science, 17*(3),
  249–255. <https://doi.org/10.1111/j.1467-9280.2006.01693.x>
- Rexigel, E., Kuhn, J., Becker, S., & Malone, S. (2024). The more the
  better? A systematic review and meta-analysis of the benefits of more than
  two external representations in STEM education. *Educational Psychology
  Review, 36*, Article 124.
  <https://doi.org/10.1007/s10648-024-09958-y>
- Schroeder, N. L., & Cenkci, A. T. (2018). Spatial contiguity and spatial
  split-attention effects in multimedia learning environments: A
  meta-analysis. *Educational Psychology Review, 30*, 679–701.
  <https://doi.org/10.1007/s10648-018-9435-9>
- Shute, V. J. (2008). Focus on formative feedback. *Review of Educational
  Research, 78*(1), 153–189.
  <https://doi.org/10.3102/0034654307313795>
- Sweller, J. (1988). Cognitive load during problem solving: Effects on
  learning. *Cognitive Science, 12*(2), 257–285.
  <https://doi.org/10.1207/s15516709cog1202_4>
- Sweller, J., & Cooper, G. A. (1985). The use of worked examples as a
  substitute for problem solving in learning algebra. *Cognition and
  Instruction, 2*(1), 59–89.
  <https://doi.org/10.1207/s1532690xci0201_3>
- Wisniewski, B., Zierer, K., & Hattie, J. (2020). The power of feedback
  revisited: A meta-analysis of educational feedback research. *Frontiers in
  Psychology, 10*, Article 3087.
  <https://doi.org/10.3389/fpsyg.2019.03087>
- Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing
  (quizzing) boosts classroom learning: A systematic and meta-analytic review.
  *Psychological Bulletin, 147*(4), 399–435.
  <https://doi.org/10.1037/bul0000309>
