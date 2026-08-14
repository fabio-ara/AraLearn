# Fundamentação pedagógica dos recursos de card

## 1. Objeto deste documento

Um **recurso de card** é uma representação externa estruturada empregada para
ensinar ou praticar um objeto de conhecimento. Texto corrido, matriz, grafo,
equação química e diagrama de estados não são variações ornamentais de uma
mesma caixa: cada forma torna algumas relações perceptíveis e oculta outras.
Por isso, a escolha da representação integra o planejamento didático.

Na implementação, cada tipo de recurso corresponde a um `package`: módulo que
reúne contrato de dados, validação, renderização, descrição de autoria,
campos textuais editáveis e alvos possíveis de prática. O **kernel** é a parte
comum que descobre, valida, compõe e apresenta esses packages. A separação
permite ampliar o catálogo sem concentrar todos os formatos em um contrato
monolítico.

Este documento fundamenta decisões de projeto. Ele distingue cinco classes de
enunciado:

- **evidência externa**: resultado ou argumento encontrado na literatura;
- **hipótese de design**: relação esperada entre contexto, mecanismo e efeito;
- **decisão de projeto**: regra adotada pelo AraLearn;
- **implementação**: mecanismo técnico que concretiza a decisão;
- **resultado empírico**: observação obtida com participantes e tarefas
  definidas.

Testes de contrato, acessibilidade, geometria e funcionamento offline verificam
implementação. Eles não demonstram compreensão, retenção, transferência ou
redução de carga cognitiva. Essas propriedades exigem avaliação empírica
específica.

## 2. Por que uma representação precisa de justificativa

### Decisão R1 — admitir somente representações semanticamente necessárias

**Problema.** Acrescentar diagramas apenas para variar a aparência pode impor ao
estudante uma nova convenção sem oferecer informação adicional. No sentido
inverso, converter em prosa um objeto essencialmente espacial, relacional ou
formal pode esconder a estrutura que precisa ser compreendida.

**Alternativas e requisitos.** Há três alternativas principais: usar prosa;
usar uma representação genérica, como tabela; ou criar uma representação
especializada. A alternativa especializada deve conservar uma estrutura que se
perderia nas demais, corresponder a uma operação cognitiva identificável e
seguir uma convenção reconhecível na área de conhecimento.

**Decisão.** Um package especializado só é admitido quando sua semântica não é
adequadamente substituída por `paragraph`, `table` ou outro package já
existente. Variedade visual não constitui critério de admissão.

**Fundamentação.** Representações externas podem complementar informação,
restringir interpretações ou permitir inferências que seriam difíceis em outra
forma. Coordená-las, porém, também exige esforço; mais representações não são
automaticamente melhores ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Os princípios de coerência e
contiguidade recomendam eliminar elementos sem função e aproximar informações
que precisam ser integradas ([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

**Operacionalização.** A proposta de um package precisa declarar:

1. o objeto de conhecimento preservado;
2. a operação que a pessoa realizará sobre esse objeto;
3. a convenção disciplinar ou normativa adotada;
4. as situações em que o recurso deve e não deve ser usado;
5. os limites de cardinalidade, densidade ou complexidade;
6. a diferença em relação aos packages próximos;
7. um caso de estresse que não possa ser reduzido a exemplo trivial.

**Consequências.** O catálogo pode conter recursos altamente específicos sem se
tornar uma coleção arbitrária de componentes visuais. Também se torna possível
fundir ou retirar um package cuja estrutura não justifique sua manutenção.

**Limites e evidência.** A distinção semântica pode ser comprovada por inspeção
do contrato e confronto com a convenção de domínio. A alegação de que o recurso
facilita a aprendizagem continua sendo hipótese até comparação com alternativas
e avaliação com pessoas.

## 3. Seleção pela intenção didática

### Decisão R2 — escolher primeiro a operação, depois o package

**Problema.** Se a autoria começa pelo catálogo visual, tende a adaptar o
conteúdo ao componente disponível. Essa inversão pode produzir exercícios
artificiais ou diagramas sem função didática.

**Alternativas e requisitos.** A escolha poderia seguir frequência de uso,
distribuição fixa de formatos ou adequação à evidência de aprendizagem
pretendida. O procedimento precisa ser previsível para autoria humana e para
autoria assistida por modelo de linguagem, sem exigir que o autor conheça todos
os contratos de antemão.

**Decisão.** O planejamento declara o objetivo, os conhecimentos necessários,
o gesto cognitivo e a evidência esperada. Em seguida, consulta um catálogo
descritivo; somente depois de escolher um tipo solicita seu contrato
específico.

**Fundamentação.** A coordenação de representações deve considerar suas funções
e as tarefas realizadas pelo aprendiz, não apenas seu desenho
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). A prática de recuperação pode favorecer aprendizagem
posterior, mas seu efeito depende da tarefa e do conhecimento recuperado
([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval)).

**Operacionalização.** Cada entrada do catálogo informa, em linguagem de alto
nível:

- quais relações o recurso torna visíveis;
- quais operações ele apoia;
- quais conhecimentos prévios sua leitura exige;
- quando outra representação é preferível;
- quais modalidades de resposta podem ser coordenadas;
- quais limitações impedem seu uso responsável.

Uma busca pode combinar intenção, domínio, forma lógica, gesto cognitivo e
capacidade de interação. O contrato recebido depois da seleção descreve
entidades, relações e valores, mas não exige coordenadas, cores ou detalhes da
biblioteca de renderização.

**Consequências.** A ampliação do catálogo não exige inserir todos os esquemas de validação no
contexto de autoria. Quando não houver representação ideal, a autoria pode usar
a alternativa menos inadequada e explicitar essa limitação, sem bloquear a
produção.

**Limites e evidência.** Um catálogo bem descrito não garante seleção correta.
É necessário avaliar precisão da recuperação, adequação da escolha, incidência
de adaptações artificiais e capacidade de revisão posterior.

## 4. Carga cognitiva, progressão e leitura do recurso

### Decisão R3 — introduzir a convenção antes de exigir sua interpretação

**Problema.** Uma representação academicamente correta pode permanecer
incompreensível para quem nunca encontrou sua gramática. Explicar toda figura
por uma legenda extensa, contudo, duplica informação e aumenta a busca visual.

**Alternativas e requisitos.** É possível pressupor domínio da notação,
acrescentar um tutorial genérico ou introduzir seus elementos no percurso em
que serão usados. Para estudantes iniciantes, a leitura precisa ser ensinada no
momento apropriado, sem transformar cada card em manual da interface.

**Decisão.** A microteoria apresenta o referente concreto, nomeia os elementos,
explica as relações e mostra como ler a notação antes de cobrar operações
complexas sobre ela. O recurso permanece visualmente convencional; a
explicação pertence ao conteúdo do curso, não a uma gramática inventada pela
interface.

**Fundamentação.** A memória de trabalho é limitada, e atividades de busca ou
integração desnecessárias podem competir com a construção de esquemas
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). Exemplos resolvidos e
retirada gradual de apoio podem ser úteis para novatos em condições específicas
([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)).

**Operacionalização.** Antes de um recurso denso, a autoria verifica se o
estudante já conhece:

- o problema que a representação resolve;
- os símbolos e categorias usados;
- a direção ou ordem de leitura;
- o significado de posição, forma, linha e rótulo;
- pelo menos um exemplo de inferência válida.

Em cards teóricos, uma representação não deve acumular vários conceitos novos
apenas para economizar telas. Em cards práticos, o contexto pode ser mais rico
quando os elementos necessários já foram ensinados e precisam permanecer
residentes para a tarefa.

**Consequências.** A complexidade inerente ao objeto é preservada, enquanto a
carga produzida por premissas ocultas é tratada pela progressão do curso.

**Limites e evidência.** A literatura sustenta considerar carga e conhecimento
prévio, mas não define uma quantidade universal de elementos por card. A
compreensão da notação deve ser verificada em tarefas de leitura, explicação e
aplicação.

## 5. Contratos semânticos e renderização determinística

### Decisão R4 — separar intenção autoral de geometria visual

**Problema.** Coordenadas e medidas calculadas manualmente tornam diagramas
frágeis diante de rótulos longos, telas estreitas, mudança de tema e tradução.
Permitir que a autoria controle pixels também mistura conhecimento disciplinar
com detalhes de implementação.

**Alternativas e requisitos.** A geometria pode ser fornecida pelo autor,
calculada por regras artesanais ou delegada a mecanismos especializados. O
contrato precisa expressar fielmente o objeto e admitir casos não previstos no
exemplo canônico.

**Decisão.** O autor declara semântica; o package valida e transforma essa
semântica em uma representação. Posicionamento, roteamento, escalas, quebras e
dimensões pertencem ao renderizador apropriado.

**Fundamentação.** A decisão deriva de requisitos de consistência,
manutenibilidade e redução de informação irrelevante para a tarefa. Em termos
pedagógicos, ela se alinha aos princípios de coerência e contiguidade, mas esses
princípios não prescrevem uma biblioteca de software específica
([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

**Operacionalização.** O catálogo utiliza mecanismos conforme o objeto:

- Graphviz/Viz.js para estruturas relacionais e fluxos cuja geometria depende
  da topologia;
- Vega e Vega-Lite para escalas, eixos, séries e camadas quantitativas;
- MathML para estrutura matemática e científica legível pelo navegador;
- HTML semântico e CSS responsivo para texto, tabelas e interfaces;
- bibliotecas disciplinares quando elas preservam convenções que um motor
  genérico não conhece.

O mesmo conteúdo que determina a caixa visual é o conteúdo exibido. Respostas
interativas são consideradas no dimensionamento antes da materialização; um
rótulo preenchido não pode ser maior que a reserva calculada e desaparecer.

**Consequências.** O contrato permanece legível por autores e modelos de
linguagem, enquanto o package concentra a complexidade da representação. Casos
grandes podem conservar tamanho natural e usar rolagem local em vez de serem
comprimidos até perder legibilidade.

**Limites e evidência.** Motores de layout reduzem trabalho artesanal, mas não
garantem uma figura boa. Topologia inadequada, densidade excessiva e escolha
errada do recurso continuam possíveis. Testes geométricos verificam ausência de
recorte e sobreposição; avaliação disciplinar verifica a notação; avaliação com
usuários verifica interpretação.

## 6. Convenção acadêmica e especialização

### Decisão R5 — preservar a gramática do domínio

**Problema.** Caixas, setas e tabelas podem imitar muitos objetos sem preservar
seu significado. Um fluxograma não substitui BPMN; uma tabela cercada por
colchetes não se torna matriz; um grafo matemático não é automaticamente uma
topologia de rede.

**Alternativas e requisitos.** Um mecanismo genérico de renderização reduz o número de módulos,
mas transfere ao leitor a tarefa de adivinhar a semântica. Packages específicos
aumentam o catálogo, porém podem conservar símbolos, restrições e operações do
campo. A especialização só se justifica pelo critério R1.

**Decisão.** O catálogo distingue representações quando a tradição acadêmica ou
profissional atribui significados diferentes às mesmas formas superficiais.

**Fundamentação.** Múltiplas representações restringem interpretações apenas
quando suas convenções são conhecidas e coordenadas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). A
interface deve ainda atender a contraste, reflow, foco e alternativas textuais
previstos nas WCAG 2.2 ([World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22)).

**Operacionalização.** Exemplos de distinções obrigatórias incluem:

| Objeto | Estrutura que precisa ser preservada | Representações próximas que não o substituem |
| --- | --- | --- |
| matriz | linhas, colunas e delimitadores matemáticos proporcionais | tabela de registros |
| grafo matemático | vértices, arestas, direção, peso, laço e multiplicidade | mapa conceitual ou rede física |
| relação binária | incidência entre domínio e contradomínio | tabela de pares ou associação genérica |
| fluxograma | símbolos de início/fim, processo, decisão, entrada/saída e fluxo de controle | árvore ou BPMN |
| BPMN | participantes, raias, eventos, atividades, gateways e fluxos normativos | fluxograma com caixas agrupadas |
| máquina de estados | estados, eventos, guardas, ações e transições | sequência cronológica |
| sessão textual pessoa–sistema | ambiente, contexto inicial e sequência ordenada de entrada, `stdout`, `stderr`, código de saída e efeito observável | código-fonte ou configuração estática, tabela de registros ou explicação em prosa |
| modelo entidade–relacionamento | entidades, atributos, relacionamentos e cardinalidades conceituais | esquema relacional com chaves |
| glosa interlinear | alinhamento entre forma, segmentação, glosa morfêmica e tradução | linhas independentes de texto |
| equação química | espécies, coeficientes, estados, carga, condições e tipo de seta | fórmula matemática genérica |
| gráfico estatístico | variável, escala, unidade, série e incerteza | plano cartesiano sem semântica estatística |

As referências técnicas primárias orientam cada package, por exemplo:
[BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/),
[UML](https://www.omg.org/spec/UML/),
[SysML](https://www.omg.org/sysml/sysmlv1/),
[RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html),
[Leipzig Glossing Rules](https://www.eva.mpg.de/lingua/resources/glossing-rules.php)
e [MathML](https://www.w3.org/TR/mathml-core/).

O package `aralearn.resource.terminal_session` preserva um processo textual
observável, não emula um terminal. Seu renderer não executa ou interpreta
comandos e não acessa shell, banco, rede ou outro ambiente; apenas torna
explícito o registro autoral e sua ordem. Um resultado observado também não
garante repetição sob outro estado ou sistema.

Como hipótese de desenho, uma sessão trabalhada pode tornar passos e
consequências disponíveis para análise, de modo semelhante à função de exemplos
resolvidos. A evidência sobre exemplos, porém, é condicional: conhecimento
prévio e ordem entre exemplo e problema podem alterar sua utilidade
([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading); [Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal); [Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal)). Essas fontes não avaliaram o AraLearn nem demonstram que observar
uma sessão substitua executar a operação. Quando o objetivo for desempenho em
ambiente real, a sessão pode preparar leitura, previsão ou diagnóstico, mas a
autoria deve incluir prática real adequada ou declarar que esse meio não está
disponível.

**Consequências.** Um mesmo domínio pode possuir vários packages, desde que
cada um corresponda a uma operação e um nível de análise distintos. O catálogo
também pode reconhecer lacunas de cobertura sem transformar todo conteúdo na
representação genérica disponível.

**Limites e evidência.** Convenções variam entre comunidades e podem possuir
alternativas legítimas. O manifest deve declarar a tradição adotada e seu
escopo; especialistas do domínio precisam revisar casos complexos.

## 7. Prática incorporada ao objeto

### Decisão R6 — localizar a resposta onde ocorre o raciocínio

**Problema.** Uma lacuna no enunciado não verifica necessariamente a operação
pretendida dentro de código, tabela, matriz ou diagrama. Opções globais também
podem misturar respostas de lacunas diferentes.

**Alternativas e requisitos.** A resposta pode aparecer fora da representação,
substituir o objeto inteiro ou ocupar uma folha semanticamente autorizada. Cada
alvo precisa conservar identidade própria, conjunto próprio de respostas e
estado independente.

**Decisão.** Lacuna e digitação são materializadas dentro do elemento em que a
decisão ocorre. Uma correspondência simples usa lacunas independentes nos
campos textuais correspondentes. A ordenação conserva um package de resposta,
mas move pelo menos dois trechos entre os próprios alvos declarados por
`paragraph` ou `table`; não cria uma lista paralela de itens.

**Fundamentação.** A contiguidade pode reduzir a necessidade de integrar fontes
separadas ([Ginns (2006)](referencias.md#ref-ginns2006contiguity)). A recuperação ativa apresenta benefícios em
diversos contextos, mas reconhecimento, produção e aplicação não são operações
equivalentes ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

**Operacionalização.** Cada alvo declara:

- identificador estável e único no card;
- caminho semântico dentro do conteúdo;
- modalidade admitida;
- resposta ou respostas aceitas;
- alternativas e feedback próprios, quando aplicável;
- descrição acessível independente da posição visual.

Na ordenação, os alvos também seguem a ordem canônica de leitura e cada
expressão oferece setas por ícone para uma posição à esquerda ou à direita.
Respostas visualmente iguais, ocorrências ambíguas e targets de diagramas ou
fluxos espaciais são rejeitados.

Em `terminal_session`, somente a entrada de cada interação pode ser alvo de
lacuna com opções exatas e inequívocas. Saídas, erros, códigos e efeitos
continuam contexto observável; não há avaliação por digitação, expressão
regular, equivalência aproximada ou interpretação por modelo.

Tocar numa lacuna vazia abre somente suas opções. Tocar novamente numa lacuna
preenchida pode limpá-la. Confirmar é uma ação distinta de selecionar, e a
resposta correta não é revelada antes de solicitação explícita.

**Consequências.** Vários alvos no mesmo recurso podem ser respondidos,
corrigidos e reiniciados de forma independente. A prática conserva a estrutura
acadêmica do objeto em vez de deslocar a tarefa para o enunciado.

**Limites e evidência.** Nem todo elemento editável é um bom alvo pedagógico.
Transformar automaticamente qualquer rótulo em lacuna pode produzir tarefa
trivial ou ambígua; a autoria deve justificar o conhecimento recuperado.

## 8. Edição textual e assistência por modelo de linguagem

### Decisão R7 — separar texto editável de estrutura protegida

**Problema.** Expor o JSON completo de um card obriga o usuário a interpretar
identificadores, topologia e código de renderização. Autorizar um modelo de
linguagem a alterar esse conjunto aumenta o risco de mudanças fora do escopo.

**Alternativas e requisitos.** A edição pode atuar sobre o documento inteiro,
usar um formulário específico para cada package ou expor somente folhas
textuais. O usuário precisa compreender o alvo, iterar sobre uma proposta,
rejeitá-la e restaurar estado anterior.

**Decisão.** A edição manual e a assistência recebem os mesmos campos textuais
autorizados. Identificadores, referências, tipos, relações e geometria são
contexto somente para leitura. A assistência assume forma conversacional e
produz alterações validadas e reversíveis.

**Fundamentação.** Diretrizes de interação humano–IA recomendam tornar
capacidades e limites perceptíveis, apoiar correção e manter controle humano
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Sistemas assistidos também precisam considerar confiança
indevida e aceitação automática ([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)).

**Operacionalização.** O package publica uma projeção de autoria com rótulos
humanos, agrupamento semântico e caminhos graváveis. A solicitação da pessoa não
amplia esse escopo. Cada resposta da assistência informa os campos modificados,
mantém histórico curto da conversa no contexto necessário e permite desfazer,
refazer ou restaurar.

**Consequências.** A pessoa edita o conteúdo que vê sem lidar com o contrato
integral. Um modelo menor pode receber contexto compacto e tarefas delimitadas,
reduzindo custo e superfície de erro.

**Limites e evidência.** Validação de escopo impede alterações estruturalmente
não autorizadas, mas não garante correção factual, adequação pedagógica ou boa
redação. A revisão humana permanece necessária.

## 9. Mobile, acessibilidade e continuidade

### Decisão R8 — preservar legibilidade antes de exigir enquadramento total

**Problema.** Comprimir uma representação complexa para caber integralmente na
largura do celular pode tornar texto e símbolos ilegíveis. Uma área de rolagem
sem limites claros, por outro lado, pode prender o gesto e esconder controles.

**Alternativas e requisitos.** O recurso pode reduzir escala, reorganizar a
progressão, dividir a representação ou manter tamanho natural com rolagem
local. A escolha precisa respeitar a semântica: matrizes e eixos não podem ser
transpostos apenas para caber na tela.

**Decisão.** Representações com progressão natural usam orientação vertical no
leitor móvel. Objetos bidimensionais preservam sua geometria e podem ocupar um
frame local com rolagem nos dois eixos. O card continua rolável fora do frame.

**Fundamentação.** Aplicações móveis de aprendizagem apresentam grande
diversidade de padrões e contextos; não há um layout universal
([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)). Reflow, contraste, operação por teclado, foco visível e
alvos acionáveis são requisitos de acessibilidade ([World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22)).

**Operacionalização.** Cada package é verificado em temas claro e escuro, por
toque e teclado e em larguras móveis definidas. Casos de estresse incluem
rótulos longos, maior resposta válida, densidade realista e zoom do navegador.
Descrições textuais apresentam estrutura e relações sem depender apenas de cor
ou posição.

**Consequências.** O recurso pode manter notação legível mesmo quando sua
largura natural supera a tela. A barra horizontal permanece acessível no
limite do frame, e o deslocamento do diagrama não impede o deslocamento do
card.

**Limites e evidência.** Conformidade automatizada não substitui avaliação com
leitor de tela, diferentes capacidades motoras e dispositivos reais. Rolagem
local também pode aumentar o esforço de integração e deve ser evitada quando a
divisão didática preservar o objeto.

## 10. Composição de recursos no mesmo card

### Decisão R9 — compor somente quando a coordenação é parte da tarefa

**Problema.** Fórmula, gráfico e explicação podem se complementar, mas a mera
acumulação de recursos aumenta densidade e alternância de atenção.

**Alternativas e requisitos.** Um conceito pode ser distribuído entre cards,
apresentado em uma única representação ou coordenado em múltiplas formas. A
composição precisa tornar explícita a relação entre elas.

**Decisão.** Mais de um recurso de conteúdo é permitido quando comparar,
traduzir ou coordenar representações constitui o objetivo local. Em teoria, a
regra predominante é progressão e segmentação; em prática, mais contexto pode
permanecer no card quando necessário para executar a operação.

**Fundamentação.** Múltiplas representações podem cumprir funções
complementares, restritivas ou construtivas, mas sua coordenação é uma demanda
própria ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Evidências sobre segmentação apresentam
moderadores e não autorizam uma cota universal de conteúdo por tela
([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

**Operacionalização.** O planejamento declara o papel de cada recurso e a
relação que o estudante deve estabelecer. Rótulos compartilhados, unidades e
variáveis mantêm consistência. Se uma representação serve apenas de decoração,
ela é retirada; se as duas exigem explicações independentes, são distribuídas
em cards sucessivos.

**Consequências.** A composição deixa de ser sinônimo de riqueza visual e passa
a corresponder a uma tarefa de integração identificável.

**Limites e evidência.** Mesmo uma composição teoricamente coerente pode
sobrecarregar. O resultado precisa ser examinado por rastreamento de erros,
explicação do estudante e comparação com apresentação segmentada.

## 11. Porta de qualidade de um package

Antes de integrar um package ao catálogo produtivo, a revisão deve responder:

1. qual problema representacional ele resolve;
2. qual alternativa mais simples foi rejeitada e por quê;
3. qual convenção acadêmica fundamenta sua gramática;
4. que casos válidos e inválidos o contrato expressa;
5. como a geometria é calculada sem coordenadas autorais;
6. como rótulos longos e respostas preenchidas afetam dimensões;
7. quais campos são editáveis e quais permanecem estruturais;
8. quais gestos cognitivos admitem prática interna;
9. como vários alvos mantêm identidade e estado independentes;
10. como a representação é descrita sem depender de visão ou cor;
11. como se comporta em telas móveis, temas, zoom, teclado e toque;
12. quais limitações ficam explícitas no catálogo;
13. que tarefa empírica poderia confirmar ou refutar sua utilidade didática.

A [Auditoria acadêmica dos recursos](auditoria-academica-dos-resources.md)
aplica essa porta ao catálogo. A [Matriz de rastreabilidade
pedagógica](matriz-rastreabilidade-pedagogica.md) relaciona fundamentos,
hipóteses, implementação e avaliação.

## 12. Interpretação responsável das evidências

Podem ser demonstrados tecnicamente:

- conformidade de um contrato;
- materialização determinística para a mesma entrada;
- ausência de sobreposição ou recorte nos casos testados;
- independência dos alvos de prática;
- preservação do escopo de edição;
- funcionamento em determinadas larguras, temas e modos de entrada.

Dependem de avaliação com participantes:

- compreensão da representação;
- redução de esforço mental irrelevante;
- qualidade da escolha feita pela autoria;
- retenção e transferência;
- facilidade de revisão e reparo;
- utilidade da assistência conversacional.

Essa distinção impede transformar correção visual em evidência de aprendizagem.
Os procedimentos de avaliação estão descritos no [Protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md). As referências bibliográficas
completas estão em [`referencias.bib`](referencias.bib).
