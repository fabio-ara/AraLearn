# Fundamentação pedagógica dos componentes didáticos

Uma tabela permite comparar valores por linha e coluna. Um grafo permite
acompanhar conexões entre elementos. Embora ambos possam apresentar dados
sobre o mesmo assunto, cada representação favorece certas leituras e exige
conhecimentos próprios. A escolha faz parte do ensino: muda o que o estudante
precisa perceber, relacionar e fazer.

No AraLearn, um **componente didático** organiza uma representação, uma forma
de resposta ou ambas dentro da unidade de estudo. A fundamentação de sua escolha
considera a tarefa, a convenção da área e as condições de leitura. Na
implementação, cada componente corresponde a um **pacote**, módulo que reúne
os dados e as regras necessárias para apresentá-los e receber respostas. O
[contrato de componentes](componentes-didaticos.md) descreve essa organização.

As decisões identificadas como R1 a R9 são escolhas do projeto apoiadas pelas
relações discutidas a seguir. A literatura ajuda a justificá-las e formular
perguntas de avaliação. O [protocolo de avaliação](protocolo-avaliacao-artefato.md)
distingue a verificação do software da investigação de compreensão, retenção
e transferência com participantes.

## 1. Relação que justifica a representação

### Decisão R1: admitir somente representações semanticamente necessárias

Considere uma lista de cidades e suas temperaturas. Uma tabela preserva a
associação entre cidade e valor e permite comparar as linhas. Se o objetivo
passa a ser acompanhar caminhos entre cidades, a conexão entre elas precisa
ficar visível. Uma representação de rede pode então preservar uma relação que
a tabela, usada da mesma forma, não mostra.

Um pacote especializado se justifica quando prosa, tabela ou outro componente
instalado não conserva adequadamente a relação necessária à tarefa. A
especialização também precisa corresponder a uma convenção reconhecível na
área. Ela tem custo: o estudante precisa aprender a ler a representação, e o
projeto precisa manter e testar suas regras.

O quadro DeFT, proposto por [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft),
relaciona desenho de representações, suas funções e tarefas de aprendizagem.
Representações podem **complementar** informação, **restringir** interpretações
possíveis ou apoiar a **construção** de relações. Uma tabela e um gráfico, por
exemplo, podem servir respectivamente à consulta de valores e à percepção de
uma tendência. A tarefa determina se o estudante precisa usar uma delas ou
integrar ambas.

A **coerência** orienta retirar elementos sem função na tarefa; a
**contiguidade**, aproximar informações que precisam ser integradas
([Mayer (2009)](referencias.md#ref-mayer2009multimedia);
[Ginns (2006)](referencias.md#ref-ginns2006contiguity)). Acrescentar figuras apenas
para variar a aparência pode exigir trabalho de interpretação sem acrescentar
uma relação útil.

A admissão de um pacote registra o objeto preservado, a operação pretendida,
a convenção adotada e a diferença em relação aos componentes próximos. Registra
também contraindicações, quantidade máxima de elementos e casos complexos que
exponham seus limites. A [auditoria acadêmica dos componentes](auditoria-academica-dos-resources.md)
aplica esses critérios e pode recomendar manter, restringir, fundir ou retirar
um pacote.

## 2. Da tarefa à escolha do componente

### Decisão R2: escolher primeiro a operação, depois o componente

Escolher entre explicações prontas e justificar com palavras próprias o
resultado de um cálculo podem envolver o mesmo assunto. Na primeira tarefa,
as alternativas permitem comparar interpretações. Na segunda, escolher entre
respostas prontas retiraria a produção que se queria solicitar. A **operação-alvo**
é essa ação intelectual pretendida, como comparar, explicar, calcular ou
reconstruir uma sequência; sua relação com o objetivo é desenvolvida no
[modelo didático](modelo-didatico.md#prática-orientada-pela-operação-alvo-da-tarefa).

A autoria parte do objetivo, dos conhecimentos necessários e da resposta que
permitirá examinar a tarefa. Consulta o catálogo para encontrar componentes
compatíveis; depois examina o formato dos dados do candidato escolhido. Cada
entrada descreve as relações que preserva, as operações que admite, o
conhecimento necessário à leitura, as modalidades de resposta e as situações
em que outra representação é preferível.

Essa ordem relaciona a escolha à função da representação, conforme DeFT
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). A **prática de
recuperação**, tentativa de lembrar conhecimento estudado, pode favorecer
aprendizagem posterior ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval);
[Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval)). Para projetá-la,
é preciso verificar o que a tarefa solicita recuperar; o formato visual não
resolve essa decisão sozinho.

### Disponibilidade, seleção e materialização

Um componente pode existir no catálogo e estar desabilitado para um curso.
Também pode estar permitido e não ser adequado à tarefa. Por isso, o AraLearn
conserva três registros diferentes:

| Registro | Significado |
| --- | --- |
| disponibilidade | a política do curso ou do recorte permite usar o pacote |
| seleção | a autoria escolheu o pacote por sua adequação à tarefa |
| materialização | uma ocorrência concreta do componente foi salva no conteúdo |

A **política de componentes** pode permitir o catálogo inteiro ou uma lista
restrita e registrar exclusões e preferências. Exclusão prevalece sobre
permissão; preferência orienta a escolha entre candidatos permitidos e
adequados. O [contrato da política](desenho-instrucional-parametrizado.md#política-de-componentes-didáticos)
detalha a revisão do catálogo e a aplicação por escopo.

A busca identifica candidatos específicos, versáteis ou substitutivos —
`canonical`, `versatile` e `substitute` no contrato. Esses estados qualificam o
ajuste calculado à consulta. A pessoa autora ainda precisa examinar exemplos,
convenções e limitações. Quando uma alternativa perde uma relação necessária,
a perda exige decisão humana antes da produção. A avaliação da busca pode
examinar escolhas inadequadas, adaptações artificiais e facilidade de revisão.

## 3. Aprender a ler a representação

### Decisão R3: introduzir a convenção antes de exigir sua interpretação

Uma matriz pode estar corretamente desenhada e ainda ser incompreensível para
quem nunca precisou distinguir linha e coluna. Antes de solicitar uma entrada
pela posição, o percurso precisa mostrar o que as posições significam e como
localizá-las. Uma legenda genérica sobre o funcionamento da interface não
substitui esse ensino.

O curso apresenta o referente, nomeia os elementos e desenvolve suas relações.
Depois introduz a notação e uma leitura justificada. A
[explicação compartilhada](explicacao-e-revisao-humana.md), texto-base da
microssequência com fontes, pode desenvolver pressupostos e exemplos para
consulta. As unidades continuam ensinando relações e propondo práticas
substantivas na sequência.

A memória de trabalho mantém e manipula informação durante a tarefa. Atividades
de busca e integração desnecessárias podem disputar recursos com a construção
de **esquemas**, organizações de conhecimento que permitem tratar relações
familiares em conjunto ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload);
[Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). Exemplos
resolvidos e retirada gradual de apoio podem tornar uma operação visível antes
de solicitar execução independente, sobretudo para novatos em condições
específicas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples);
[Renkl et al. (2004)](referencias.md#ref-renkl2004fading)).

Ao revisar o percurso, importa examinar se o estudante recebeu o problema,
os símbolos, a direção de leitura e o significado das posições, linhas e
rótulos. Um exemplo de inferência válida ajuda a mostrar o que se pode concluir.
Em prática, o contexto pode ser mais rico porque os elementos já ensinados
precisam permanecer disponíveis para a operação. A quantidade de elementos,
por si só, não estabelece a dificuldade; a avaliação pode pedir ao estudante
que leia, explique e aplique a representação.

## 4. Conteúdo autorado e disposição visual

### Decisão R4: separar intenção autoral de geometria visual

Ao produzir uma rede, a autoria informa quais elementos estão conectados e o
significado de cada ligação. A posição das caixas e o caminho das linhas são
calculados pelo software. Essa separação permite conservar o conteúdo quando
um rótulo fica mais longo ou a largura da tela muda.

O **contrato de dados** define quais elementos, relações e valores a autoria
pode fornecer. O pacote confere esses dados e produz a representação. A
**geometria visual** compreende posições, rotas, escalas e dimensões. Ela usa
mecanismos adequados ao objeto: Graphviz para estruturas de conexões, Vega para
gráficos com escalas e séries, MathML para estrutura matemática e HTML para
texto, tabelas e controles. Suas funções e referências estão no
[capítulo técnico dos componentes](componentes-didaticos.md#8-mecanismos-de-apresentação).

A escolha busca consistência e manutenção mais simples. Os princípios de
coerência e contiguidade ajudam a examinar a apresentação, mas não determinam
uma biblioteca de software ([Mayer (2009)](referencias.md#ref-mayer2009multimedia);
[Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

O dimensionamento considera os textos completos e as respostas interativas.
Se uma lacuna preenchida precisar de mais espaço, esse espaço deve estar
previsto antes da resposta. Rótulos não podem desaparecer nem ser comprimidos
até ficar ilegíveis. Casos grandes podem conservar a escala de leitura e usar
rolagem local. Os testes verificam recortes, sobreposições e estabilidade; a
inspeção disciplinar examina se a estrutura conserva o significado.

## 5. Convenções das áreas de conhecimento

### Decisão R5: preservar a gramática do domínio

Uma tabela de registros e uma matriz usam linhas e colunas, mas a posição numa
matriz participa das operações algébricas. Um fluxograma e um processo de
negócio podem usar caixas e setas, mas tipos de evento e relações entre
participantes têm significados próprios na notação
[BPMN](https://www.omg.org/spec/BPMN/2.0/), *Business Process Model and Notation*.
O catálogo distingue esses objetos quando a semelhança visual esconde uma
diferença necessária à tarefa.

| Objeto | Relação ou convenção a conservar |
| --- | --- |
| matriz | posição das entradas, linhas, colunas e delimitadores matemáticos |
| grafo matemático | vértices e conexões, incluindo direção, peso, laços e multiplicidade quando pertinentes |
| relação binária | associação entre elementos do domínio e do contradomínio |
| fluxograma | controle da sequência por processos, decisões, ramos e junções |
| processo BPMN | participantes, eventos, atividades, decisões e distinção entre fluxos de sequência e de mensagem |
| máquina de estados | mudanças de estado associadas a eventos, condições e ações |
| sessão textual entre pessoa e sistema | ordem de entradas, saídas, erros e efeitos observados no contexto informado |
| modelo entidade–relacionamento | entidades, atributos e quantidades possíveis de relações entre elas |
| glosa interlinear | alinhamento entre partes da expressão, significado gramatical e tradução |
| equação química | espécies, coeficientes, estados, cargas, condições e tipo de seta |
| gráfico estatístico | variáveis, escalas, unidades, séries e incerteza |

A [matriz dos componentes](auditoria-academica-dos-resources.md#4-matriz-dos-componentes-de-conteúdo)
explica onde essas representações são adequadas e quando uma forma semelhante não as
substitui. As convenções vêm de fontes das áreas: as
[Leipzig Glossing Rules](https://www.eva.mpg.de/lingua/resources/glossing-rules.php)
orientam glosas; [UML](https://www.omg.org/spec/UML/) e
[SysML](https://www.omg.org/sysml/sysmlv1/) são linguagens de modelagem de software
e sistemas; a [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html) especifica
o protocolo TCP, incluindo a estrutura de seus segmentos. O
[MathML](https://www.w3.org/TR/mathml-core/) expressa estruturas matemáticas para
apresentação na Web.

Convenções conhecidas podem restringir interpretações de uma figura
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Quando há tradições
alternativas, o pacote identifica a adotada e seu alcance. A revisão por
especialistas confronta casos complexos com essa referência; o catálogo pode
registrar uma lacuna quando nenhum pacote preserva o objeto adequadamente.

### Observar uma sessão e executar uma operação

O componente de sessão textual apresenta um registro autorado de comandos e
resultados, preservando a ordem. Ele não executa comandos. O mesmo comando pode
produzir outro resultado em outro ambiente, momento ou estado.

Como hipótese de desenho, uma sessão comentada pode tornar decisões e
consequências disponíveis para previsão e diagnóstico, de modo semelhante à
função de um exemplo resolvido. Estudos de exemplos e retirada de apoio
oferecem base para investigar essa possibilidade
([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples);
[Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Conhecimento prévio e
ordem entre exemplo e problema modificam a utilidade do apoio
([Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal);
[Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal)).
Quando executar num ambiente real é o objetivo, observar a sessão precisa ser
acompanhado de prática real adequada ou de uma indicação explícita de que esse
meio não está disponível no curso.

## 6. Resposta no próprio objeto estudado

### Decisão R6: localizar a resposta onde ocorre o raciocínio

Para completar uma entrada de matriz, a pessoa precisa relacionar a resposta
àquela posição. No AraLearn, a lacuna ocupa o campo correspondente. Ela conserva
a matriz como contexto, em vez de transferir a escolha para uma lista distante.
A contiguidade oferece uma razão para investigar essa aproximação
([Ginns (2006)](referencias.md#ref-ginns2006contiguity)). A operação solicitada
continua exigindo julgamento: completar um rótulo óbvio pode não examinar o
conhecimento pretendido.

Cada alvo de resposta possui identidade, opções e estado próprios. Duas
lacunas com a mesma solução permanecem independentes porque pertencem a lugares
diferentes. A autoria define o campo permitido, a modalidade e as respostas
aceitas; o componente oferece uma descrição acessível desse alvo. O
[contrato de prática interna](componentes-didaticos.md#6-lacunas-digitação-e-ordenação-internas)
especifica como preservar a estrutura durante o preenchimento.

Lacunas e digitação atuam em campos autorizados. Correspondências simples
podem usar lacunas independentes; ordenação move pelo menos dois trechos nos
próprios parágrafos ou células de tabela. A ordem precisa ser inequívoca, e cada
trecho recebe controles para deslocá-lo uma posição. Essa modalidade não se
aplica a diagramas espaciais. Na sessão textual, somente a entrada admite
lacuna de escolha com alternativas exatas; saídas e efeitos permanecem como
contexto.

Selecionar uma resposta, confirmar e revelar a solução são ações distintas.
Tocar numa lacuna preenchida pode limpá-la sem alterar as demais. Reconhecimento,
produção e aplicação solicitam operações diferentes, ainda que todas usem o
mesmo desenho de tela. A literatura sobre recuperação e transferência ajuda a
examinar essa diferença ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval);
[Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)); ela não torna
qualquer lacuna uma prática adequada.

## 7. Inspeção humana e edição delimitada

### Decisão R7: separar texto editável de estrutura protegida

Uma pessoa que deseja corrigir o nome de uma etapa deve conseguir reconhecer
esse nome e avaliar a alteração. Ela não precisa, para isso, reescrever todas
as relações do diagrama. Cada pacote indica os textos que podem ser corrigidos
separadamente. Identificadores, tipos e relações estruturais permanecem
protegidos nessa operação; mudar a composição usa uma tarefa própria.

Na inspeção de conteúdo, as respostas ficam desativadas e os campos editáveis
recebem rótulos compreensíveis. A pessoa examina a proposta; a gravação confere
o alvo e o escopo autorizados; a releitura mostra o resultado salvo. A conversa
em linguagem natural não amplia por si só a permissão de escrita.

Diretrizes de interação entre pessoas e IA recomendam comunicar capacidades e
limites, permitir correção e manter controle humano
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Em um estudo de
decisão assistida, intervenções que exigiam reflexão reduziram dependência
excessiva da IA e acrescentaram custo de uso
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). Essa tensão
é pertinente à autoria: uma confirmação pode exigir trabalho sem assegurar
que a pessoa compreendeu o conteúdo. A avaliação precisa examinar a inspeção
e a decisão efetivas.

Conferir o escopo de uma alteração protege a estrutura; avaliar a precisão da
explicação e o apoio das fontes exige leitura humana. Atender a uma observação
e declarar revisão do conteúdo são decisões distintas, descritas em
[Revisão e correções](auditoria-de-conformidade-instrucional.md).

## 8. Leitura e interação no celular

### Decisão R8: preservar legibilidade antes de exigir enquadramento total

Uma matriz larga não pode perder colunas para caber na tela. Reduzir toda a
figura também pode tornar os números ilegíveis. O aplicativo conserva a
estrutura e admite rolagem local quando a reorganização mudaria o objeto.
Representações com progressão natural podem usar orientação vertical; o
restante da unidade continua rolável fora do quadro.

Essa escolha tem uma contrapartida: deslocar a figura pode separar elementos
que precisam ser comparados. A revisão considera se uma divisão didática
preservaria a relação com menos deslocamento. A literatura sobre interfaces de
aprendizagem móvel reúne padrões e contextos diversos
([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)); por isso,
a adequação é examinada na tarefa e no dispositivo.

As WCAG 2.2, diretrizes de acessibilidade para conteúdo da Web, orientam
contraste, reorganização do conteúdo, foco visível, teclado e alvos acionáveis
([World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22)). Os testes
dos pacotes incluem temas claro e escuro, telas móveis, ampliação, rótulos
extensos e respostas preenchidas. Descrições textuais precisam conservar
entidades, relações e ordem de leitura sem depender só de cor ou posição.

Testes automatizados conseguem localizar parte dos defeitos. Uso com leitores
de tela, diferentes capacidades motoras e dispositivos reais acrescenta
questões que esses testes não resolvem. O [sistema visual](sistema-visual.md)
e a [auditoria dos componentes](auditoria-academica-dos-resources.md#7-processo-de-auditoria)
organizam essas verificações.

## 9. Combinação de representações

### Decisão R9: compor conforme a função de cada representação na tarefa

Uma tabela pode fornecer os valores exatos usados num gráfico; o gráfico pode
mostrar uma tendência difícil de perceber linha a linha. Se a tarefa pede
relacionar os dois, a autoria explica como cada posição e cada valor se
correspondem. Se a tabela serve apenas para consulta independente, essa
integração pode não ser o objetivo.

DeFT distingue funções complementares, restritivas e construtivas. Usar duas
representações não exige sempre ensinar uma relação entre elas, mas exige
justificar o papel de cada uma ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)).
Rótulos, unidades e variáveis compartilhados precisam permanecer consistentes.
Uma composição pode fornecer contexto, restringir ambiguidade, permitir
comparação ou desenvolver uma relação nova.

Quando duas representações exigem explicações independentes, sua distribuição
em unidades sucessivas pode favorecer a progressão. Quando a operação depende
de consultar ambas, o contexto necessário permanece disponível. A evidência
sobre segmentação apresenta condições e moderadores, sem prescrever uma cota
de conteúdo por tela ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).
A avaliação pode comparar a composição com uma apresentação segmentada e
examinar erros de leitura e explicações dos estudantes.

## 10. Da fundamentação à avaliação

A [auditoria acadêmica dos componentes](auditoria-academica-dos-resources.md)
reúne critérios por pacote: justificativa, convenção, casos válidos e inválidos,
edição, prática, leitura acessível e limites. Ela permite examinar uma proposta
ou revisar um componente instalado sem repetir o contrato inteiro nesta
fundamentação. A [matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
relaciona essas decisões a formas de avaliação.

Cada pergunta exige uma evidência apropriada. Testes verificam se a mesma
entrada produz a estrutura prevista, se as lacunas são independentes e se o
conteúdo permanece visível nos casos executados. Especialistas confrontam a
representação com as convenções do domínio. Tarefas com participantes examinam
compreensão, esforço, retenção, transferência e qualidade da revisão. A aprovação
em um desses exames não substitui os demais.

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui): Masyura Ahmad Faudzi; Zaihisma Che Cob; Ridha Omar; Sharul Azim Sharudin; Masitah Ghazali (2023). **Investigating the User Interface Design Frameworks of Current Mobile Learning Applications: A Systematic Review.** *Education Sciences*, 13(1), p. 94.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal): Slava Kalyuga (2007). **Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction.** *Educational Psychology Review*, 19(4), p. 509–539.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Mayer (2009)](referencias.md#ref-mayer2009multimedia): Richard E. Mayer (2009). **Multimedia Learning.** 2. ed., Cambridge University Press.
- [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer): Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756.
- [Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal): Jana Reisslein; Robert K. Atkinson; Patrick Seeling; Martin Reisslein (2006). **Encountering the Expertise Reversal Effect with a Computer-Based Environment on Electrical Circuit Analysis.** *Learning and Instruction*, 16(2), p. 92–103.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22): World Wide Web Consortium (2023). **Web Content Accessibility Guidelines (WCAG) 2.2.**

<!-- referências locais: fim -->
