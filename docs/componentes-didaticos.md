# Componentes didáticos e pacotes

No AraLearn, um **componente didático** produz uma representação externa, uma
forma de resposta ou ambas dentro de uma unidade de estudo. Uma tabela pode
comparar valores; uma lacuna pode pedir que o estudante complete um deles. A
escolha depende da relação a ensinar e da operação solicitada, conforme a
[fundamentação pedagógica dos componentes](fundamentacao-pedagogica-dos-resources.md).

Na implementação, o **pacote de componente** reúne o formato dos dados, sua
validação, apresentação, acessibilidade e, quando há resposta, avaliação.
O **núcleo de execução** é a parte comum do software que valida e apresenta a
unidade. Ele conhece as posições de conteúdo, resposta e retorno, mas não incorpora
a estrutura interna de grafos, matrizes, fórmulas ou processos.

Essa separação permite ampliar o catálogo sem duplicar leitura e persistência.
Também permite corrigir e testar uma representação especializada sem espalhar
exceções pelo aplicativo.

## 1. Quando um pacote é justificável

Uma caixa visual não se torna um componente didático apenas por ter estilo
próprio. Um pacote especializado se justifica quando texto, tabela genérica ou
outro componente instalado perderia uma relação relevante, uma notação
convencional ou uma operação que o estudante precisa realizar. Essa escolha segue a
[operação-alvo da tarefa](modelo-didatico.md#prática-orientada-pela-operação-alvo-da-tarefa).

### Critério de decisão

Antes de criar um pacote, responda:

1. qual objeto ou relação precisa ser percebido;
2. qual operação-alvo a tarefa deverá exercitar;
3. qual convenção é usada na área acadêmica;
4. por que uma representação existente não preserva essa intenção;
5. como a forma continua legível, acessível e editável no celular;
6. quais situações tornam o componente inadequado.

O pacote de matriz, `matrix`, é distinto do de tabela, `table`, porque posição algébrica, delimitadores e
operações matriciais têm significado. O pacote de pilha de chamadas, `call-stack`, é distinto de tabela quando
precisa mostrar topo, ordem de quadros, ativação e retorno. Se um suposto
“rastreamento de algoritmo” apenas listar linhas e valores, `table` é
suficiente. A especialização se sustenta quando materializa o estado do
algoritmo, sua transição e seus elementos ativos de uma forma que a grade
genérica não expressa.

Representações múltiplas podem favorecer compreensão quando suas funções são
coordenadas, mas aumentam carga quando apenas repetem ou decoram a mesma
informação. O quadro DeFT relaciona o desenho das representações, suas funções e as
tarefas de aprendizagem; é proposto por
[Ainsworth (2006)](referencias.md#ref-ainsworth2006deft).

## 2. Núcleo de execução e pacote

Uma instância é uma ocorrência de um pacote com dados próprios, como uma
tabela concreta. Um **contrato** especifica quais dados são aceitos e como serão interpretados.
A referência `package@version` identifica o pacote e a versão desse contrato.
Por exemplo, duas tabelas com valores diferentes são instâncias do mesmo
pacote; elas seguem as mesmas regras de linhas, colunas e cabeçalhos. O núcleo em
[`src/resources/kernel/`](../src/resources/kernel/) oferece:

- estrutura externa e posições da unidade de estudo;
- resolução de `package@version`;
- validação estrutural e de composição;
- montagem da apresentação;
- mediação de lacunas, digitação e respostas;
- seleção de instâncias para edição e assistência.

Cada diretório em [`src/resources/packages/`](../src/resources/packages/) define
um pacote. Sua função didática orienta os dados aceitos, a apresentação e a
forma de participar de uma atividade. No código, essas responsabilidades ficam
separadas nos seguintes elementos:

- identidade, finalidade, taxonomia, operações e limites no manifesto
  (`manifest`);
- linguagem de alto nível para autoria (`authoringContract`);
- formato dos dados (`schema` e `data`);
- conversão de entradas equivalentes para uma forma comum (`normalize`) e
  verificação das regras que os dados precisam respeitar (`validate`);
- apresentação visual (`render`) e equivalente textual (`accessibleText`);
- textos editáveis (`editableTargets`) e campos aptos a lacuna ou digitação
  (`practiceTargets`);
- rótulo textual opcional para apresentar um valor de referência sem alterar o
  dado persistido (`practiceValueLabel`);
- avaliação da resposta (`evaluate`);
- ativação dos controles após apresentar o conteúdo, chamada hidratação
  (`hydrate`), quando a interação exigir.

O registro rejeita pacotes que não cumprem as obrigações aplicáveis ao seu papel. Um pacote de
conteúdo declara `exposition`; um pacote de resposta implementa sua avaliação.
Todo pacote delimita os textos autorizados e pode participar da busca autoral,
enquanto a estrutura permanece protegida.

## 3. Catálogo como vocabulário controlado

O registro instalado reúne 38 pacotes: 34 de conteúdo e quatro de resposta.
O inventário e a decisão de manter ou restringir cada gramática estão na
[auditoria dos componentes](auditoria-academica-dos-resources.md#6-decisão-corrente-e-uso-observado).
Diretórios auxiliares, como `system-diagrams`, não são pacotes adicionais.

Para encontrar um componente pelo que ele precisa fazer, o catálogo descreve
cada pacote por categorias de consulta, chamadas **facetas**. Elas situam o
objeto e as convenções da área, a operação e a modalidade de prática, a forma de
apresentação e sua compatibilidade com a resposta, além dos limites de uso e
acessibilidade.

Como as facetas descrevem a intenção, o modelo consegue recuperar candidatos
pertinentes. O mesmo vocabulário permite acrescentar termos ao catálogo sem
ampliar um algoritmo central e oferece à curadoria uma base para confrontar a
justificativa de cada escolha.

O catálogo interno usa o contrato `aralearn.resource-library.v1` e oferece
consultas progressivas:

1. `explore` mostra famílias e facetas;
2. `search` ordena candidatos por adequação;
3. `inspect` compara até oito perfis;
4. `contracts` entrega exatamente um contrato versionado por chamada;
5. `validateStudyUnit` verifica a estrutura e a composição de uma unidade;
6. `previewStudyUnitDescriptor` prepara a descrição que o aplicativo usa para
   apresentar uma composição válida.

Nos canais conversacionais, `consultar_componentes` recebe a função pretendida, a
busca ou filtros de papel, lugar, estrutura e operação. Devolve até oito
candidatos; informar um componente permite consultar seu contrato específico.
A ferramenta usa o catálogo interno, sem expor todos os seus métodos como
operações públicas. Os campos correntes estão no
[catálogo de tarefas](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).

No método interno `search`, a autoria pode complementar a frase de intenção com
facetas sobre o contexto da unidade e da disciplina, o objeto de conhecimento e
a operação esperada. Também pode indicar a modalidade de prática, a relação que
precisa ser preservada e se a notação faz parte da aprendizagem. Esses dados
tornam explícitos contrastes que uma frase livre pode ocultar, como explicar em
prosa ou comparar por tabela, reconhecer uma alternativa ou produzir uma
resposta por digitação.

O retorno interno preserva frase e facetas em `producerDeclaration`, marcada
como declaração de quem produziu a consulta, sem verificação semântica pelo servidor. Com facetas presentes, o ajuste usa essas propriedades
determinísticas e mantém `query` apenas como localizador curto; interpretar a
intenção livre continua sendo responsabilidade do assistente e da pessoa autora.

## 4. Seleção e cobertura

O catálogo devolve um estado de cobertura:

- `canonical`: candidato específico para as facetas solicitadas;
- `versatile`: candidato geral que preserva a operação;
- `substitute`: aproximação possível com limitação declarada.

Esses termos descrevem o ajuste calculado; não proclamam que uma representação
seja universal na academia. O assistente ainda precisa confrontar convenções,
exemplo e contraindicações depois da busca.

A escolha segue a função instrucional. `paragraph` continua adequado quando a
prosa é a melhor forma; `choice`, quando a operação pretendida é reconhecer
entre alternativas. Uma sequência, uma estrutura de código ou uma relação
visual leva a autoria a considerar componentes que preservem melhor aquele
objeto.

O ajuste calculado não autoriza o uso sozinho. A política de componentes
efetiva do curso e do escopo fixa a revisão do catálogo, a disponibilidade
total ou restrita (`all|allow_only`), as exclusões e as preferências. Exclusão vence; preferência
somente desempata candidatos ainda permitidos e semanticamente adequados.
Durante a materialização, o servidor confronta os `package@version` realmente
persistidos com essa política. Sem representação adequada, a autoria registra
a lacuna e não finge equivalência.

## 5. Composição da unidade de estudo

Uma unidade de estudo possui:

- zero ou mais representações de conteúdo (`content`);
- no máximo um formato de resposta (`response`);
- zero ou mais retornos (`feedback`).

Componentes complementares podem coexistir quando cada um desempenha uma função
diferente, como um parágrafo que situa o fenômeno, uma fórmula que o formaliza e
um gráfico que mostra o comportamento. A composição é inadequada quando duplica
o estímulo ou obriga o estudante a reconciliar representações sem finalidade.

A prática acrescenta uma resposta compatível com o conteúdo. `choice` apresenta
alternativas próprias. `open` recebe explicação, justificativa ou previsão em
texto livre sem fingir correção semântica automática. `gap` e `ordering` atuam nos campos que os pacotes de
conteúdo declaram como alvos: não duplicam o texto numa lista ou num painel de
resposta. Uma correspondência simples é expressa por lacunas independentes nos
campos reais de um `paragraph` ou de uma `table`, sem um pacote paralelo de
encaixe.

## 6. Lacunas, digitação e ordenação internas

Uma lacuna precisa identificar o campo que será preenchido. Numa tabela, por
exemplo, duas células podem ter a mesma resposta e ainda assim corresponder a
decisões distintas. O contrato localiza cada alvo pela combinação:

```text
targetInstanceId + targetPath
```

`targetInstanceId` identifica a instância; `targetPath` identifica o campo
declarado por `practiceTargets`. Em campos textuais comuns, o valor é substituído
pelo marcador interativo. Uma referência estrutural só pode ser alvo quando o
pacote declara `preserveReference: true`: nesse caso, o marcador fica associado
ao caminho sem sobrescrever o identificador usado para resolver a estrutura.
Quando o valor de referência não é o melhor rótulo para leitura, como um identificador de estado,
`practiceValueLabel` projeta a forma apresentada nas alternativas e no controle.

### Independência entre lacunas

Cada lacuna possui índice e estado próprios. Suas alternativas pertencem apenas
àquela lacuna e aparecem quando ela recebe foco. Tocar numa lacuna preenchida
novamente a esvazia sem alterar as demais. Digitação segue a mesma identidade,
mas usa entrada textual e normalização declarada.

Identidade não é deduzida pelo valor da resposta. Duas transições que apontam
para o mesmo estado, por exemplo, continuam sendo lacunas distintas porque usam
caminhos e índices distintos; preencher ou abrir as opções de uma não altera a
outra. Reutilizar o mesmo caminho ou chave para várias lacunas produziria
seleção simultânea, portanto o núcleo e os testes verificam unicidade e
materialização de cada alvo. O preenchimento real também é medido no navegador:
o controle precisa caber na reserva calculada antes da interação, sem ser
recortado nem redimensionar a representação depois de uma resposta.

### Ordenação situada

Uma ordenação aponta para pelo menos dois trechos já existentes em campos de
leitura textual de `paragraph` ou `table`. Cada alvo declara instância, caminho
e expressão; a lista de alvos segue a ordem correta de leitura. Durante a
prática, as expressões são permutadas entre esses mesmos pontos. Cada uma traz
botões de seta, apenas por ícone, para mover uma posição à esquerda ou à
direita.

O formato de resposta não repete os itens numa lista própria. Ele apenas
coordena o estado da permutação e o retorno. Alvos em parágrafos e células diferentes podem
participar da mesma sequência, desde que a ordem de leitura seja inequívoca e
os textos permaneçam distintos. Diagramas, fluxos verticais e outras
representações espaciais não recebem essa modalidade por conveniência.

Em `paragraph`, o alvo precisa ser texto plano visível, fora de ênfase, código,
link ou outra marcação. A ordenação não corta sintaxe Markdown nem a apresenta
como se fosse conteúdo. Ocorrências repetidas ou sobrepostas são recusadas em
vez de receber uma posição inferida.

## 7. Autoria e campos protegidos

Cada pacote declara em `editableTargets()` quais textos podem ser alterados sem
expor a estrutura. Coordenadas, identidades relacionais, tipos de nó, índices e
textos destinados apenas à acessibilidade ficam fora desse conjunto.

Essa declaração delimita as correções textuais permitidas na inspeção do
conteúdo, conforme o [contrato de conteúdo](aralearn-contract.md). A interface visual mostra a unidade com respostas
desativadas. Uma correção aprovada pode alterar os campos autorizados e precisa
validar novamente a unidade inteira; uma mudança estrutural usa a operação de
composição. Dados no formato [JSON](https://developer.mozilla.org/en-US/docs/Glossary/JSON)
bem-formados, por si só, não concedem autoridade nem demonstram
validade semântica.

## 8. Mecanismos de apresentação

O pacote escolhe a tecnologia conforme a classe do problema:

| Necessidade | Tecnologia principal | Justificativa |
|---|---|---|
| grafos, fluxos e diagramas relacionais | [Graphviz/Viz.js](https://graphviz.org/) | cálculo de posições, rotas e dimensões a partir dos elementos e suas conexões |
| gráficos estatísticos e planos com dados | [Vega/Vega-Lite](https://vega.github.io/vega-lite/docs/) | escalas, eixos, legendas e gramática declarativa de visualização |
| fórmulas, matrizes e reações | [MathML](https://developer.mozilla.org/en-US/docs/Web/MathML) | estrutura matemática nativa e dimensionamento tipográfico dos delimitadores |
| texto, código e tabelas | [HTML semântico](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html) | seleção, reorganização responsiva, acessibilidade e edição textual nativas |

A geometria da representação é calculada a partir dos dados e das convenções
do pacote; a autoria não precisa fornecer coordenadas de desenho. Motores externos também têm limites: Graphviz não decide o valor pedagógico de um grafo, Vega não escolhe a escala cientificamente correta e MathML não valida uma equação.

O [inventário tipográfico](#inventário-tipográfico-do-catálogo) reúne os papéis
textuais e casos extremos de cada pacote. As decisões gerais pertencem ao
[sistema visual](sistema-visual.md).

## 9. Regras de representação acadêmica

Um contrato de alto nível usa os conceitos da área. A tabela mostra essa
tradução em alguns dos pacotes especializados:

| Pacote | Conceitos recebidos pelo contrato |
| --- | --- |
| `graph` | vértices, arestas, direção, peso e agrupamentos, sem coordenadas de desenho |
| `chart` | variáveis, unidades, séries, incerteza, escala e nota metodológica |
| `reaction` | espécies, coeficientes, estados, cargas, condições e seta |

Essas três linhas são exemplos, não o inventário do catálogo. A consulta
`contracts`, apresentada em [Catálogo como vocabulário
controlado](#3-catálogo-como-vocabulário-controlado), entrega o contrato
versionado completo do pacote escolhido. É ali que permanecem, por exemplo,
domínio, contradomínio e pares ordenados para `relation-map`, além dos campos
próprios dos demais pacotes.

O contrato usa conceitos da área em vez de pedir SVG, LaTeX livre, uma tabela
improvisada ou frases concatenadas. Isso reduz ambiguidades e permite que o
pacote preserve convenções. Quando duas áreas usam diagramas superficialmente
parecidos com semânticas distintas, pacotes separados são preferíveis a um
contrato genérico repleto de exceções.

Em `aralearn.resource.chart`, o título do eixo horizontal apresenta o rótulo
na primeira linha e a unidade, entre parênteses, na segunda. Essa divisão
preserva o texto e o tamanho tipográfico do título em telas estreitas. Quando
o eixo não declara unidade, o título contém apenas o rótulo.

Em `aralearn.resource.packet_layout`, a largura interna das palavras acompanha
a escala tipográfica e preserva a proporção em bits entre os campos. Régua e
campos compartilham o alinhamento após a coluna de offsets. Em telas estreitas,
o cabeçalho usa rolagem horizontal local; os rótulos mantêm seu tamanho de texto
e as descrições completas permanecem na legenda. Cada entrada apresenta o
rótulo, a faixa de bits e a descrição em linhas sucessivas, inclusive com texto
ampliado.

### Sessões textuais observáveis

A sessão textual entre pessoa e sistema, identificada por
`aralearn.resource.terminal_session`, preserva uma sequência temporal. Ela é
apropriada para acompanhar entrada, resposta e efeito em um terminal de
comandos, PowerShell, Git, SQL ou outra interface
textual quando a ordem e o estado observável fazem parte do objeto de estudo.

O contrato declara uma orientação pedagógica em `prompt`, o `environment`, um
`initialContext` opcional e uma lista ordenada de `interactions`. Cada interação
possui `input` e pode registrar separadamente o sinal visual de entrada. A saída
normal vai em `stdout`; mensagens de diagnóstico ou erro, em `stderr`; e
`exitCode` registra o código de encerramento. Um efeito curto pode completar a
interpretação. Espaços e quebras de linha são preservados num conteúdo
declarativo e determinístico. Em `stdout` e `stderr`, a cadeia de caracteres
vazia significa que o fluxo foi observado sem conteúdo; a omissão significa
que ele não foi registrado ou não é pertinente.

As operações previstas são rastrear interação, interpretar saída, identificar
erro, relacionar ação e consequência, comparar estado, diagnosticar situação,
prever resultado e reconhecer comando.

Esse objeto não é `code`, que preserva código-fonte ou configuração estática;
não é `table`, que compara registros por atributos; e não é `paragraph`, que
expõe uma explicação em prosa. O pacote apresenta um registro fornecido pela
autoria: não executa nem interpreta comandos, não abre terminal ou banco e não
acessa rede ou ambiente externo. O mesmo texto pode produzir outro resultado em
outro estado, sistema ou momento.

Quando houver prática, somente `interactions[i].input` pode receber lacuna de
escolha com alternativas exatas e inequívocas. O pacote não avalia digitação,
expressões regulares, equivalência semântica nem resposta livre por modelo. Sua
lista cronológica, os rótulos dos fluxos de saída e o texto monoespaçado selecionável
fornecem uma ordem de leitura acessível; no celular, conteúdo largo usa rolagem
local sem alterar espaços ou quebrar o fluxo da unidade.

Observar e interpretar uma sessão pode preparar reconhecimento, previsão ou
diagnóstico, mas não substitui operar um ambiente real quando executar a ação é
o objetivo de aprendizagem. Nessa situação, a autoria precisa oferecer prática
externa adequada ou declarar explicitamente a limitação.

## 10. Leitura sem gramática adicional

O estudante encontra a notação reconhecida na área. O pacote preserva essa
convenção, e a unidade introduz os termos necessários quando a leitura da
representação faz parte do conteúdo. Uma instrução breve é adequada quando a
disciplina ensina aquela forma; vocabulário de implementação e instruções
óbvias de rolagem ficam fora do conteúdo didático.

Legendas e instruções são decididas pelo papel que cumprem naquele exemplo:

| Papel | Decisão | Exemplos |
| --- | --- | --- |
| necessário para interpretar | preservar junto ao elemento correspondente | unidade de eixo, cardinalidade, condição de um ramo, abreviação de glosa, direção dos endereços |
| contexto ou orientação opcional | incluir quando acrescentar informação à tarefa | recorte de uma tabela, pressuposto da medição, orientação para comparar dois casos |
| repetição sem função adicional | retirar a cópia e conservar a ocorrência que ancora o significado | repetir abaixo da reação a mesma condição já apresentada sobre a seta |
| informação de implementação | manter fora do material de estudo | identidade interna do pacote, nome de um campo de JSON ou estado do motor de desenho |

Essa decisão não é uma lista de palavras proibidas. `stdout`, `stderr` e código
de saída, por exemplo, são objetos pertinentes de uma sessão de terminal.
Rótulos acessíveis também podem repetir uma informação visual para oferecer
outra forma de acesso; essa repetição não cria um segundo alvo interativo.
A [matriz de legendas](auditoria-academica-dos-resources.md#legendas-instruções-e-prova-por-pacote)
registra as escolhas por pacote, sem retirar eixos, unidades ou relações para
reduzir o tamanho do cartão.

Teoria e prática admitem densidades diferentes. Uma unidade de teoria apresenta
uma transformação conceitual delimitada, sem condensar vários pressupostos. Uma
unidade de prática pode conter um contexto mais rico porque o estudante precisa
operar sobre ela; ainda assim, rótulos e relações devem permanecer legíveis.

O caso de [hub Ethernet e repetidor](#topologia-hub-ethernet-e-repetidor)
exemplifica a distinção entre função de um equipamento, símbolo adotado pelo
pacote e cuidados de apresentação.

## 11. Telas móveis, orientação e ampliação

Os dez pacotes que usam a camada compartilhada `system-diagrams`, além de
`graph` e `flow`, usam o mecanismo de navegação `diagramViewport`. Apresentam um
único diagrama dentro de um quadro estável. A orientação continua favorecendo a
leitura vertical, mas o estudante pode ampliar e mover o próprio desenho no
corpo da unidade. Em telas táteis, uma pinça com dois dedos altera a escala em
torno do ponto
tocado; quando o conteúdo ampliado ultrapassa o quadro, o arraste percorre os
dois eixos sem redimensionar a unidade.

Quando houver prática, o controle real da lacuna permanece no ponto semântico
do diagrama. Ele não é duplicado em painel, legenda ou projeção paralela. A
mesma ocorrência continua ativa depois da ampliação e quando o desenho é levado para
tela cheia.

Uma faixa superior reservada no quadro apresenta, no canto direito e somente
por ícones e nomes acessíveis, os comandos de diminuir, aumentar e expandir. Ela
não é sobreposta ao desenho. A expansão move a mesma área visível para um diálogo cuja
largura não excede a largura móvel do aplicativo; ali, diminuir e aumentar ficam
à esquerda e o retorno à unidade fica à direita. Não há botão visível de ajuste:
reduzir até o limite retoma automaticamente o enquadramento global e responsivo.
Pinça e arraste continuam disponíveis. Escala e posição são estado efêmero do
componente: auxiliam a navegação, mas não integram curso, progresso ou
sincronização.

A orientação continua decorrendo da estrutura. Hierarquias e sistemas tendem à
progressão de cima para baixo; o diagrama interno de bloco SysML adota esse
fluxo em bloco. Relações cuja leitura é genuinamente lateral podem conservar
elementos no mesmo nível, pois a ampliação não depende de forçar toda topologia para
uma única coluna.

A camada compartilhada abrange `bpmn_process`, `database_schema`,
`entity_relationship`, `network_topology`, `relation_map`, `software_container`,
`software_system_context`, `state_machine`, `system_internal_block` e `tree`.
`graph` usa o mesmo mecanismo de navegação em sua implementação própria.
`flow` abre na escala natural, com rolagem local para conservar a leitura dos
rótulos; oferece o mesmo mecanismo de ampliação e expansão. A validação visual
inclui larguras móveis, temas e exemplos capazes de expor cruzamentos,
transbordamento, legendas, múltiplas lacunas e textos extensos.

Em telas estreitas, o mapa de memória apresenta cada segmento na ordem endereço
inicial, descrição e endereço final. A descrição ocupa a largura disponível;
endereços e direção conservam sua notação e ordem, inclusive com texto ampliado.

## 12. Acessibilidade

Todo pacote fornece `accessibleText()` e estrutura navegável quando há
controles. Cor não pode ser o único código. Foco, seleção, resposta e erro
precisam de contraste e forma. Alvos de toque seguem os critérios adotados pelo
sistema visual.

Um equivalente textual oferece acesso ao conteúdo e base para tecnologia
assistiva, mas ainda precisa de ordem de leitura e nomes de relações adequados.
Pacotes complexos também devem apresentar retorno contextualizado.

A interação específica permanece no próprio pacote. Em `annotated_text`,
selecionar um trecho destaca as notas associadas e traz a primeira nota para
a área visível; selecionar uma nota destaca os trechos correspondentes. Os
botões funcionam por toque e teclado e expõem seu estado pressionado. A
hidratação pode ser chamada novamente sem duplicar vínculos de eventos nem alterar
outra instância da unidade.

## 13. Validação e escolha

O método interno `validateStudyUnit` verifica:

- estrutura externa e posições;
- `package@version` instalado;
- formato de `data` e regras de domínio expressas pelo pacote;
- identificadores e caminhos de prática;
- compatibilidades entre conteúdo e resposta.

`search` e `inspect` comparam as facetas declaradas com metadados determinísticos
do catálogo. Essa comparação ajuda a escolher candidatos, mas não prova que o
texto, a interação ou o feedback cumpram a intenção. O assistente confronta o conteúdo
produzido com a função instrucional e a pessoa autora decide ambiguidades.

A apresentação real e os testes de navegador verificam geometria e
comportamento. Essas etapas fornecem evidência técnica; correção científica e
efeito pedagógico com estudantes exigem avaliação acadêmica e empírica.

## 14. Adicionar ou revisar um pacote

1. registre a justificativa pedagógica e as alternativas recusadas;
2. escolha a convenção e a tecnologia adequadas;
3. defina manifesto (`manifest`), taxonomia, contrato e exemplo complexo;
4. implemente normalização, validação, apresentação e acessibilidade;
5. declare edição e alvos de prática sem expor estrutura;
6. teste exposição, lacunas independentes, digitação e respostas compatíveis;
7. teste claro/escuro, 360/390/430 px e computador, textos extensos e dados complexos;
8. regenere o índice, a cópia usada pelas funções remotas, a projeção do catálogo
   no banco de dados e os dados de autoria;
9. verifique a coerência de nomes, contratos e comportamentos com o modelo corrente;
10. atualize documentação e evidência de conformidade.

Adicionar um pacote preserva o núcleo. Alterar a estrutura externa, as posições ou a
semântica comum modifica o núcleo e exige revisão mais ampla.

Cada pasta em `src/resources/packages` exporta a definição descrita na seção
[Núcleo de execução e pacote](#2-núcleo-de-execução-e-pacote).
`generateResourcePackageIndex.mjs` encontra essas pastas e forma o índice. A
ordem anterior permanece estável porque dela derivaram identificadores de
exemplos publicados. O catálogo, a consulta de contratos e os canais de autoria
usam esse registro. Cada instância leva apenas a identidade do pacote, a versão
e os dados, nos campos `package`, `version` e `data`.

Respostas declaram `responseInteraction` com `createState`, `submit` e `bind`,
além de `evaluate`. O pacote controla seus campos, validação de preenchimento e
interação; o aplicativo fornece acesso ao estado da instância, foco, apresentação
e submissão. A ligação de eventos suporta nova hidratação sem duplicar vínculos de eventos.
Quando uma resposta depende de um trecho do conteúdo, o próprio pacote declara
`prepareContentInstance`, a validação da relação e, quando necessário,
`reconcileContentEdit`. Uma ambiguidade na edição textual impede a gravação.
Assim, acrescentar uma resposta compatível não exige um desvio por identidade
no controlador de estudo.

`version` identifica a compatibilidade do formato e do significado dos dados.
Uma ampliação explícita que conserva as entradas anteriores e sua normalização
pode manter a versão: `paragraph@1.0.0` admite texto simples e o formato rico
distinto, e `flow@1.0.0` mantém os dados ao corrigir sua apresentação. Uma mudança
que invalida ou reinterpreta dados exige nova versão e conversão única dos dados
úteis. Cada versão, assim, conserva um contrato explícito, e a compatibilidade
com os dados anteriores fica concentrada na conversão.

O navegador, as funções remotas e o banco de dados mantêm projeções do mesmo
catálogo. Para impedir que uma delas aceite um contrato diferente, uma
**impressão digital** calculada pelo algoritmo SHA-256 identifica o conjunto
exato de manifestos, esquemas e contratos instalados. A revisão de descoberta e
essa impressão acompanham a projeção do banco; uma divergência interrompe o uso.
A referência da revisão publicada no Git, chamada *commit*, identifica a
implementação completa, incluindo os renderizadores.

Para preparar uma atualização, execute o gerador do índice,
`syncEdgeResourceRuntime.mjs` e `syncResourcePackageCatalog.mjs --print`. O bloco
resultante entra em uma **nova migração de banco**, alteração versionada que
leva o catálogo persistido de um estado ao seguinte com as verificações de
transição necessárias. O modo padrão do último script confere a migração
corrente e integra a validação do ambiente de execução. Migrações já aplicadas
permanecem imutáveis.

A atualização compatível conserva literalmente os registros da configuração
já aplicada. Preferências atuais podem receber a revisão corrente quando o
conjunto de referências permanece igual. A materialização seguinte registra a
configuração corrente. A edição conserva o registro histórico literalmente.
Somente uma mudança de título, com conteúdo e hierarquia idênticos, conserva
também a aplicação semântica atual. Alterar prosa, resposta ou estrutura
invalida essa aplicação: referências de componentes iguais não demonstram que
o conteúdo continua realizando a mesma análise instrucional.

A prova de extensão em `tests/kernel/resource-package-extension.test.js`
acrescenta um pacote a uma cópia temporária. Ela percorre sua descoberta, seu
contrato e sua normalização; testa a ida e volta relacional, a apresentação e a
interação; e confere que o núcleo permaneceu igual. O pacote temporário fica
fora do produto.

Áudio e ferramentas de cálculo ou consulta também são pacotes de conteúdo do
mesmo registro, com identidade `aralearn.resource.*`. Uma ferramenta declara
`manifest.tool` com rótulo e ícone e implementa
`toolInteraction.bind(root, data, host)`, que devolve sua função de limpeza.
Essas instâncias continuam em `content[]`; estudo as apresenta na barra da
unidade, com dois atalhos e um menu para as demais. O aplicativo conserva a
unidade, o foco e a posição ao abrir ou fechar a ferramenta; o pacote controla
sua interação. Cada canal reconhece as ferramentas pelo catálogo, sem manter
outra lista fixa de tipos.

Os textos instrucionais dessas ferramentas usam os mesmos contratos de edição
e acessibilidade.
Esses cinco pacotes não oferecem campos de prática. Gramática, dicionário e
leitura comportam várias consultas, com URL validada ou referência lógica a um
PDF de fonte. O papel de consulta não cria atribuição bibliográfica. Áudio
comporta várias faixas nativas ou arquivos incorporados ao curso e alternativas
textuais com momento de exibição explícito. Consulte [Áudio](audio.md) e
[Ferramentas de cálculo e consulta](ferramentas-calculo-e-consulta.md).

## Referência de apresentação por pacote

Os registros abaixo ajudam a manter a notação e a legibilidade ao alterar um
pacote. Reúnem detalhes que variam conforme a representação.

### Inventário tipográfico do catálogo

O registro em `src/resources/packages/generated.js` contém os 38 pacotes abaixo.
`aralearn.response.ordering` está na versão 3.0.0; os demais estão na 1.0.0. A
lista deriva das identidades instaladas, enquanto diretórios de apoio cumprem
outra função. `public/styles-tokens.css` fornece os
papéis, `public/styles.css` os aplica aos componentes de apresentação e `public/study-references.css`
liga a explicação à mesma prosa. Os 34 pacotes de conteúdo podem ocupar os
papéis admitidos em seus manifestos; feedback substantivo usa a representação
do próprio pacote, enquanto acerto, erro e ausência de resposta são estados.

| Pacote | Papéis textuais e mecanismo | Extremo a conservar na inspeção |
| --- | --- | --- |
| `aralearn.resource.paragraph` | Prosa, listas, literais e retorno; HTML com formatação + MathML | Texto longo, símbolos fonéticos, anotações de pronúncia sobre ideogramas, escrita da direita para a esquerda com matemática |
| `aralearn.resource.code` | Enunciado em prosa; bloco `pre/code` monoespaçado | Indentação, linhas longas, crases, operadores e Unicode |
| `aralearn.resource.table` | Cabeçalhos, células e legenda; tabela HTML na escala densa | Colunas longas, unidades, rolagem local e ordem de leitura |
| `aralearn.resource.annotated_text` | Texto-fonte, chamadas, excertos e notas; HTML | Anotação extensa, numeração, caracteres e retorno ao trecho |
| `aralearn.resource.bpmn_process` | Tarefas, eventos, raias e mensagens; Graphviz/SVG + rótulos HTML | Rótulos longos, tipos de evento e direção do processo |
| `aralearn.resource.interlinear_gloss` | Forma, glosa, tradução e abreviações; HTML com idioma/direção | símbolos fonéticos, diacríticos, morfemas alinhados e escrita da direita para a esquerda |
| `aralearn.response.choice` | Enunciado, alternativas e feedback; grupo acessível e botões | Seleção múltipla, melhor resposta, código literal e alternativas longas |
| `aralearn.response.gap` | Lacuna herda o texto-alvo; campos e opções da biblioteca de interação | Lacuna em prosa, código, tabela ou diagrama sem mudar notação |
| `aralearn.response.ordering` | Expressões e controles da biblioteca de interação | Ordem, texto longo e alcance por teclado |
| `aralearn.resource.tree` | Nós, relações e contorno textual; Graphviz/SVG + HTML | Hierarquia profunda, rótulos extensos e rolagem/zoom local |
| `aralearn.resource.matrix` | Nome, valores, índices e delimitadores; MathML/HTML | Matrizes altas/largas, sinais e cercas que acompanham o conteúdo |
| `aralearn.resource.reaction` | Espécies, coeficientes, estados e condições; MathML | Subscritos, cargas, setas e condições extensas |
| `aralearn.resource.flow` | Nós, arestas e enunciado; Graphviz + rótulos HTML | Decisões, ciclos, rótulos longos e geometria medida |
| `aralearn.resource.formula` | Expressão e leitura acessível; MathML | Frações, raízes aninhadas, tensores, integrais e limites |
| `aralearn.resource.plane` | Eixos, coordenadas, objetos e legenda; Vega/SVG + HTML | Sinais, unidades, escala e rótulos próximos |
| `aralearn.resource.chart` | Eixos, séries, legenda e descrição; Vega/SVG + HTML | unidades, incerteza, números extensos e séries distinguíveis |
| `aralearn.resource.software_system_context` | Pessoas, sistemas e relações; Graphviz/SVG + HTML | Nomes, descrições e rótulos de relação longos |
| `aralearn.resource.software_container` | Contêineres, tecnologia e relações; Graphviz/SVG + HTML | Tecnologias com caixa significativa e fronteiras do sistema |
| `aralearn.resource.system_internal_block` | Blocos, portas e fluxos; Graphviz/SVG + HTML | Portas, direções e multiplicidades legíveis |
| `aralearn.resource.graph` | Vértices e arestas; Graphviz/SVG + rótulos HTML | Laços, multiarestas, nomes longos e símbolos |
| `aralearn.resource.relation_map` | Objetos e relações nomeadas; Graphviz/SVG + HTML | Rótulos verbais e setas sem ambiguidade |
| `aralearn.resource.database_schema` | Relações, atributos e chaves; Graphviz/SVG + HTML | PK/FK, tipos e identificadores longos |
| `aralearn.resource.memory_layout` | Endereços, valores e direção; grade de HTML e CSS | Hexadecimal, alinhamento e ordem dos endereços |
| `aralearn.resource.network_topology` | Equipamentos, interfaces e enlaces; Graphviz/SVG + HTML | Endereços, portas, hub/repetidor e tipos de enlace |
| `aralearn.resource.packet_layout` | Bits, offsets, campos e legenda; grade de HTML e CSS | Offsets monoespaçados, campos repartidos e largura em bits |
| `aralearn.resource.set_diagram` | Conjuntos, regiões e valores; SVG + HTML | Interseções, regiões vazias e rótulos |
| `aralearn.resource.state_machine` | Estados, eventos e guardas; Graphviz/SVG + HTML | Transições múltiplas, estados inicial/final e guardas extensas |
| `aralearn.resource.truth_table` | Variáveis, operadores e resultados; tabela HTML | Negação, condicionais e valores lógicos alinhados |
| `aralearn.resource.entity_relationship` | Entidades, atributos e relações; Graphviz/SVG + HTML | Cardinalidade, opcionalidade e nomes extensos |
| `aralearn.resource.state_transition_table` | Estado atual, entrada, saída e destino; tabela HTML | Condições, transições e ausência de destino explícita |
| `aralearn.resource.call_stack` | Quadros, chamada, variáveis e retorno; HTML | Topo, função ativa, continuação e valores longos |
| `aralearn.resource.audio` | Títulos, orientação, transcrição e estado; controles nativos | Transcrição longa, símbolos fonéticos, consentimento e faixa indisponível |
| `aralearn.resource.calculator` | Expressão, resultado, rótulos e limites; formulário HTML | Sinal, separador decimal, erro e alcance dos controles |
| `aralearn.resource.dictionary` | Verbetes, idioma e orientação de consulta; HTML | Palavra em outro alfabeto e destino de consulta |
| `aralearn.resource.grammar` | Construções, idioma e orientação de consulta; HTML | Exemplos em outro idioma e descrições longas |
| `aralearn.resource.reading` | Título, orientação e destino; HTML | Referência extensa, PDF autorizado e retorno ao estudo |
| `aralearn.resource.terminal_session` | Prompt, comando, streams e código de saída; `pre/code/samp` | Espaços, stdout/stderr, linhas longas e saída vazia |
| `aralearn.response.open` | Enunciado, resposta e estado; textarea associado ao prompt | Texto ampliado, resposta longa e pista de escrita |

As medidas em `rem` acompanham o tamanho de fonte de referência da página;
as decisões tipográficas completas estão no [sistema visual](sistema-visual.md).
Prosa e enunciados compartilham a família de interface e o cinza de leitura;
alternativas e valores usam o degrau de 1 rem, tabelas/código o de 0,9375 rem,
legendas o de 0,875 rem e metadados o de 0,8125 rem. Diagramas calculados mantêm
as métricas adotadas por Graphviz/Vega; medidas internas em pixels não devem ser
substituídas por CSS depois do layout. MathML mantém sua fonte matemática.
Essas exceções conservam a convenção do objeto, sem criar um segundo tema.

No modo de escolha única e resposta correta (`single`/`correct`), o enunciado identifica o grupo de alternativas e a seleção dispensa
instrução genérica adicional. Os modos de seleção múltipla (`multiple`) e melhor resposta (`best`) mantêm a condição visível como
descrição acessível do grupo. O modo de resposta revelada e os avisos de
resposta incompleta continuam explícitos. Alternativas de código usam o mesmo
escape literal do pacote de código: crases, asteriscos e indentação não viram
formatação de prosa.

O teste [de tipografia](../tests/runtime/resource-typography.test.js) confronta
esta lista com o registro e verifica os papéis comuns; o teste
[de instruções de escolha](../tests/runtime/choice-instructions.test.js) exercita
os três modos, seus nomes e código literal. A galeria existente e os cursos
acadêmicos de estresse oferecem os casos para inspeção visual. Essa cobertura
estática é complementada por testes dinâmicos de geometria, ampliação e
reorganização do texto, além da interação. A eficácia pedagógica exige avaliação com
método próprio.

### Topologia: hub Ethernet e repetidor

O pacote `network_topology` admite `hub` e `repeater` como tipos próprios, além de
`switch`. Aqui, **hub Ethernet** significa repetidor multiporta: retransmite nas
demais portas os sinais recebidos, sem escolher uma porta de destino pelo endereço
MAC. O **repetidor** regenera e retransmite sinais entre trechos do meio na camada
física. O tipo não deve ser escolhido pelo nome informal dado ao equipamento: um
switch chamado “Hub” continua descrito como switch. A terminologia é delimitada
pela [carta do grupo IEEE 802.3 Hub MIB da IETF](https://www.ietf.org/proceedings/33/charters/hubmib-charter.html)
e pela natureza física do repetidor descrita na
[RFC 2108, seção 2.4.1.2](https://www.rfc-editor.org/rfc/rfc2108#section-2.4.1.2).

O componente usa retângulo para hub, elipse para repetidor e caixa tridimensional
para switch. Essas são convenções locais de apresentação, não símbolos universais
de normalização técnica; o rótulo do tipo acompanha cada equipamento. A descrição
textual equivalente explicita a função dos dois novos tipos. Não se depende da
cor ou apenas da forma para identificá-los.

O exemplo completo do
[pacote de topologia](../src/resources/packages/network-topology/index.js)
representa duas estações ligadas a um hub, seguido de um repetidor e de um switch.
Os trechos ligados por repetição são agrupados, os quatro enlaces Ethernet são
bidirecionais e o switch conecta esse recorte à rede comutada. O exemplo permite
comparar os papéis dos equipamentos. Alcance, desempenho e colisões exigem
outros dados, e uma simulação de tráfego exigiria outro tipo de componente. As
condições físicas e as regras de instalação de uma rede real também dependem de
informações que o desenho não contém.

Na hidratação, rótulos de enlaces e fronteiras que contêm apenas marcação de
campo autoral conservam a fonte e a entrelinha medidas no SVG. A caixa HTML
recebe a altura de todas as linhas e tolerância para arredondamento; isso evita
cortar o fim de uma palavra ou a segunda linha ao substituir texto por marcação
inspecionável. Na topologia, a medição já reserva Arial 16 para fronteiras e
Arial 14 para enlaces. O texto não é abreviado e não se reduz a fonte para fazê-lo
caber. Controles de resposta continuam no tratamento próprio das lacunas.

Hub e repetidor reutilizam os mesmos alvos de edição e lacuna dos demais
equipamentos. Uma prática pode operar sobre o rótulo autoral de cada nó, com o
controle naquele nó; consultar ou ampliar o diagrama não cria uma resposta nem
uma nova ferramenta. O contrato e o exemplo são comuns ao conteúdo da unidade,
à explicação e ao feedback.

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.

<!-- referências locais: fim -->
