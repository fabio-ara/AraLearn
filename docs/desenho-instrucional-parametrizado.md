# Desenho instrucional parametrizado

Os parâmetros do AraLearn registram decisões sobre como explicar, propor
práticas, distribuir o texto e organizar a produção de um curso. A pessoa
autora pode defini-los, delegar escolhas ao assistente e comparar a intenção
atual com a configuração aplicada, registro das escolhas usadas na produção
das unidades salvas. A interface e os canais
de autoria por [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md)
usam as mesmas definições.

Esses parâmetros tornam o [modelo didático](modelo-didatico.md) inspecionável
em escolhas locais. Seus valores são decisões de projeto ou condições de
pesquisa; a avaliação do material e da aprendizagem exige evidências próprias.

## O que constitui um parâmetro

Para compreender as escolhas, considere uma unidade sobre média aritmética.
O autor pode querer introduzir a relação entre total e quantidade de
observações, desenvolvê-la por exemplo e pedir uma interpretação num caso novo.
A relação acompanhada é uma **unidade de análise**; o que a prática precisa
solicitar para examinar o objetivo forma um **requisito de evidência**. Esses
recortes são decisões do planejamento, justificadas no
[protocolo de unidade de análise](#protocolo-de-unidade-de-análise).

Um **escopo** é o trecho a que a escolha se aplica: curso inteiro, lição,
microssequência ou unidade. **Herdar** significa usar a orientação de um nível
mais amplo quando não há uma definição própria naquele ponto. Por exemplo,
uma orientação do curso pode chegar às suas unidades. No modo automático,
a escolha ainda será feita conforme a tarefa; no modo fixo, a pessoa registra
um valor que deve ser respeitado.

Um parâmetro identifica uma decisão ajustável e define como representá-la.
O [catálogo canônico](../src/domain/courseDesignParameters.js) registra:

- identidade e versão;
- definição operacional;
- forma do valor e domínio permitido;
- escopos em que pode ser atribuído;
- estado contextual ou valor deliberadamente definido;
- limites de interpretação;
- referências que fundamentam a dimensão investigada.

No modo automático, o assistente precisa escolher cada valor conforme público,
conteúdo, função, planejamento e escopo admitido pelo catálogo. A ausência de
escolha é explícita; não representa um conjunto fixo de valores. Herdar conserva a intenção
do escopo anterior, enquanto uma escolha fixa conserva o valor deliberado.
A produção registra a **calibração**, escolha de valores e justificativas
conforme a tarefa, junto ao conteúdo. Evidência
externa pode justificar a investigação de uma dimensão, mas não estabelece
automaticamente o melhor valor para toda população, conteúdo ou tarefa. Uma
definição deliberadamente fixada pelo pesquisador prevalece no escopo pertinente.

Limites de caracteres, bytes, elementos de página e tamanho de lote continuam
relevantes para ergonomia e segurança. A quantidade de partes organiza a
produção, mas não é meta pedagógica. As preferências de parte, lote e pausa têm
escopo de curso e não viram atribuições locais de uma unidade de estudo.

## Catálogo corrente

O catálogo 1.2.1 contém doze decisões organizadas em explicações, prática, leitura e estilo,
conversa e produção. Interface, MCP, Actions e banco usam essas mesmas definições.
Cada escolha possui uma definição comum, usada para consultar e salvar os valores.
Os [identificadores técnicos](#identificadores-para-integração) permitem reconhecer
essas mesmas decisões nos dados trocados pelos canais de autoria.

| Parâmetro | Forma e exemplos de valores | Escopos | Decisão representada |
| --- | --- | --- | --- |
| Teto de novidades na unidade expositiva | inteiro; por exemplo, `1` ou `2` | curso, lição, microssequência e unidade de estudo | teto de unidades de análise apresentadas pela primeira vez numa unidade expositiva |
| Formas de explicação | conjunto; por exemplo, definição, exemplo, mecanismo ou contraste | curso, lição, microssequência e unidade de estudo | formas de explicação que precisam ser desenvolvidas quando aplicáveis |
| Mínimo de oportunidades de prática | inteiro; por exemplo, `1` ou `2` | curso, lição, microssequência e unidade de estudo | quantidade mínima de oportunidades distintas por requisito de evidência |
| Variação da prática | conjunto; por exemplo, caso, contexto, representação ou apoio | curso, lição, microssequência e unidade de estudo | dimensões que precisam variar entre oportunidades dirigidas ao mesmo requisito |
| Extensão da resposta na conversa | inteiro; por exemplo, `80` ou `120` | curso, lição, microssequência e unidade de estudo | alvo flexível de palavras para uma resposta de autoria |
| Extensão da unidade de estudo | inteiro; por exemplo, `140` ou `180` | curso, lição, microssequência e unidade de estudo | alvo flexível de palavras para o conteúdo de uma unidade de estudo |
| Distribuição da prática | intercalada ou agrupada | curso, lição, microssequência e unidade de estudo | organização das práticas na sequência |
| Posição da prática | antes, depois ou antes e depois | curso, lição, microssequência e unidade de estudo | posição da prática em relação à explicação |
| Tamanho pretendido da parte | inteiro | curso | quantidade pretendida de microssequências por parte |
| Tamanho pretendido do lote | inteiro | curso | quantidade pretendida de partes por lote |
| Frequência de pausa | preferência enumerada | curso | pontos de discussão e revisão durante a produção |
| Forma da conversa de autoria | concisão, debate ou explicação | curso, lição, microssequência e unidade de estudo | forma da conversa de autoria |

Os quatro primeiros parâmetros registram como desenvolver os recortes de
conhecimento e oferecer prática. Distribuição e posição acrescentam decisões
sobre a sequência. Os dois
alvos de palavras tornam a extensão editorial comparável sem transformá-la em medida de
qualidade. Um alvo de palavras não é mínimo nem máximo: respostas e unidades
podem ultrapassá-lo quando a decisão ou o conteúdo exigirem. Ele nunca autoriza
ocultar uma decisão educacional, truncar conteúdo necessário, compactar várias
novidades ou atomizar uma explicação para satisfazer a contagem.

Distribuição e posição descrevem a intenção da sequência, sem certificar sua
adequação pela contagem. Cadência organiza o trabalho de autoria. Preferência
de conversa orienta a resposta do assistente e não reduz o material didático.
Perfis pertencem à conta e copiam essas preferências para um curso; editar ou
excluir o perfil não modifica as cópias já aplicadas. Exceções locais permanecem,
salvo remoção explícita, e condições de pesquisa impedem substituição silenciosa.

O [protocolo de unidade de análise](#protocolo-de-unidade-de-análise) define
como recortar o conhecimento necessário à tarefa e justificar as contagens.
Seu alcance é maior que o diagnóstico já implementado; a seção de
[medidas observáveis](#medidas-observáveis-e-seus-denominadores) distingue os
registros disponíveis das anotações que ainda exigem exame próprio.

### Formas de explicação

O conjunto fechado admite:

- definição simples;
- exemplo concreto;
- mecanismo;
- contraste;
- condição de aplicação;
- limite ou exceção;
- exemplo resolvido;
- ligação entre representações.

Definição, exemplo, mecanismo e contraste podem ser escolhidos conforme o objeto
tratado. Quando uma forma deliberadamente exigida não se aplica, a
produção registra a forma e uma justificativa breve. A lista completa não é um
roteiro obrigatório para toda unidade.

Uma definição esclarece o significado; um exemplo mostra um caso; um mecanismo
explica como o resultado se produz. Um contraste torna uma diferença relevante
visível. No caso da média, mostrar a divisão e comparar o resultado com os
valores observados cumprem funções diferentes, mesmo que apareçam no mesmo
parágrafo. A escolha de formas registra o desenvolvimento pretendido, que
continua exigindo inspeção do texto.

### Oportunidades e variação da prática

Um **requisito de evidência** descreve a operação e as condições de uma tarefa
com que se pretende examinar um objetivo. Uma oportunidade de prática solicita
uma operação do estudante antes de fornecer
sua solução. Para contar como oportunidade **distinta** num mesmo requisito de
evidência, conserva a operação-alvo e modifica um aspecto semanticamente
relevante. As dimensões disponíveis são:

- caso ou dados;
- contexto;
- característica da tarefa;
- representação externa;
- nível de apoio.

Trocar palavras, ordem visual ou componente pode preservar a mesma tarefa. A
distinção entre oportunidades depende do requisito de evidência e da estrutura
semântica, não de diferença cosmética. Nova tentativa do mesmo item é repetição
da oportunidade. Repetição pode ter finalidade pedagógica, mas não satisfaz por
si um mínimo de oportunidades distintas.

## Protocolo de unidade de análise

**Definição operacional 1, de 5 de setembro de 2026.** Unidade de análise é um
recorte de conhecimento necessário para explicar, reconhecer, relacionar ou
executar a operação pretendida para um público e um repertório declarados.
Pode ser conceito, definição, relação, regra, condição ou distinção. Essas
descrições ajudam a justificar o recorte; não formam uma classificação universal do conhecimento
nem exigem uma taxonomia específica de cada disciplina.

O recorte pertence ao desenho do curso. Ele não é identificado pela quantidade
de palavras ou frases, pelo formato visual ou pelas unidades numéricas usadas
internamente por um modelo de linguagem; depende do conhecimento necessário
à tarefa. A unidade de
estudo organiza a apresentação e a experiência: pode desenvolver vários
recortes, e um recorte pode ser desenvolvido ao longo de várias unidades.

### Como recortar e quando parar

**Codificar** significa identificar trechos e atribuir a eles as categorias do
protocolo, com justificativa. Por exemplo, o primeiro desenvolvimento da relação
entre total, quantidade e média recebe a categoria de introdução; usá-la num
cálculo posterior pode receber a de uso. O registro permite que outro revisor
localize o trecho e examine a decisão.

1. Fixar finalidade, público, idioma, conhecimentos explicitamente pressupostos
   e contexto anterior. Examinar o trecho com sua tarefa e seu retorno, além
   das fontes necessárias; não codificar apenas título ou frase isolada.
2. Perguntar o que a pessoa precisa distinguir para compreender ou realizar a
   operação. Incluir conhecimento acessório indispensável mesmo fora da ementa.
   Se não foi assumido nem desenvolvido, registrar a lacuna; ausência no plano
   não o transforma em conhecimento prévio.
3. Separar dois recortes quando o desenho precisa ensinar, aplicar ou tratar uma
   confusão relevante de cada um de modo independente. Explicitar a relação
   quando conhecer os termos não basta para compreender o que se afirma entre
   eles. Conservar juntos os elementos cuja decomposição não altera nenhuma
   decisão instrucional nesse contexto.
4. Atribuir identidade local, descrição, motivo da inclusão, dependências e
   localizador do trecho. Associar sinônimos e traduções à mesma identidade
   somente quando preservam o significado exigido pela tarefa.
5. Codificar ocorrência e desenvolvimento separadamente. Guardar a dúvida ou
   alternativa material quando o contexto não permite decidir; não escolher
   o menor inventário para fazer um teto passar.

O recorte termina quando cada conhecimento necessário tem destino explícito
(pressuposto, desenvolvido antes, desenvolvido agora ou lacuna a resolver), e
uma subdivisão adicional não mudaria explicação, dependência, prática ou
tratamento de erro na tarefa escolhida. Isso evita tanto a lista de termos
quanto a decomposição indefinida de todo conhecimento humano. Mudar público,
objetivo, idioma, fonte ou tarefa pode reabrir essa decisão.

### Distinções que a codificação precisa preservar

| Distinção | Regra operacional e exemplo | Contraexemplo ou limite |
| --- | --- | --- |
| conceito e expressão | Uma identidade representa o conteúdo delimitado; rótulos equivalentes no contexto apontam para ela. “Comutador” e “switch” podem nomear o mesmo objeto no trecho de redes. | Duas palavras não provam dois conceitos; a mesma palavra em dois sentidos não prova um só. Se aprender a correspondência lexical for o objetivo, essa correspondência pode constituir outro recorte. |
| conceito e relação | “Quadro” e “endereço MAC” não explicam, por si, a relação usada no encaminhamento. A relação ganha identidade se precisa ser ensinada ou aplicada separadamente. | Não contar cada verbo, seta ou par de termos como relação nova. Uma relação já delimitada não recebe outra identidade por mudar de frase. |
| regra e condição | Uma regra declara o que vale ou como proceder, com suas condições. Separar a condição quando discriminá-la é uma necessidade instrucional própria. | Dividir ambos os lados de uma igualdade pelo mesmo número não ensina que o divisor deve ser diferente de zero apenas por exibir símbolos. Tampouco cada símbolo exige identidade para quem domina a notação. |
| pressuposto | Conhecimento que o planejamento declara necessário e disponível ao público antes do curso; registrar escopo e justificativa. | “É básico” ou “não está na ementa” não bastam. Pressuposição de desenho não comprova conhecimento real do estudante. |
| introdução | Primeiro tratamento didático de um recorte não pressuposto na ordem corrente do curso, com conteúdo que permita reconhecer o significado pretendido. Conta uma vez por identidade. | Nomear um assunto em índice ou usá-lo sem explicação não o introduz suficientemente. Uma introdução não comprova desenvolvimento completo ou aprendizagem. |
| uso | Mobilização de conhecimento pressuposto ou já introduzido para compreender, explicar ou executar outra operação. | Repetir termo num título não demonstra uso; exigir conhecimento sem base registra lacuna, não uso válido artificial. |
| retomada | Reativação intencional de conhecimento pressuposto ou anterior: reexplicar, comparar com o caso anterior ou solicitar recuperação. É uma forma identificada de uso, sem nova introdução. | Ocorrência posterior de palavra não demonstra retomada. Continuar uma explicação na unidade seguinte pode ser desenvolvimento por uso, sem atividade de reativação. |
| menção e desenvolvimento | Menção apenas aponta para um conteúdo. Desenvolvimento explicita significado, relações, exemplos, mecanismo, condições ou outra forma pertinente, com trecho verificável. | Lista de palavras, ligação bibliográfica e selo “explicado” não demonstram desenvolvimento. Mais palavras ou todas as formas selecionadas também não comprovam suficiência. |

Pressuposto é origem no repertório, não evento textual equivalente aos demais.
Introdução, uso e retomada descrevem ocorrências; desenvolvimento qualifica o
tratamento e pode coexistir com qualquer delas. Na mesma unidade, a identidade
introduzida e imediatamente aplicada conta uma introdução; sua aplicação fica
descrita sem duplicá-la no total de identidades mobilizadas. Para contagens
mutuamente exclusivas por identidade/unidade, a precedência é introdução,
retomada, uso. Uma ocorrência pode ser apenas menção e não entrar nesses totais.

Uma retomada de pressuposto não aumenta a novidade declarada. Se a suposição
estava errada, corrigir o repertório e recalcular as introduções; não conservar
a classificação para atender um número fixado. Desenvolvimento satisfatório
depende da tarefa, das formas aplicáveis e de revisão semântica; nenhuma
contagem o certifica.

### Codificação assistida por modelo de linguagem

A IA recebe protocolo, público, inventário corrente, trecho e contexto focal.
Propõe identidades, localizadores, ocorrências, justificativas e lacunas;
não infere conhecimento efetivo do estudante pela fluência do texto. O software
verifica identidades, duplicações, referências, ordem e contagens. A pessoa
autora pode contestar o recorte; ambiguidade que altera escopo, repertório ou
condição fixada deve ser trazida como decisão concreta.

Resultados de modelos de linguagem em classificação de textos delimitam a possibilidade de
assistência, mas não validam este recorte de conhecimento pedagógico
([Gilardi et al. (2023)](referencias.md#ref-gilardi2023annotation);
[Pangakis et al. (2023)](referencias.md#ref-pangakis2023validation)). Tokenização
em subpalavras é uma técnica de representação computacional
([Sennrich et al. (2016)](referencias.md#ref-sennrich2016subwords)); contar essas
unidades ou dimensões internas não identifica conceitos humanos.

Para investigar estabilidade, fixar conteúdo, contexto, protocolo, modelo,
configuração e instrução efetivamente enviados; comparar identidades alinhadas
pelo significado, localizadores, divisões/fusões e rótulos, não só totais.
Nesta definição, a comparação de inventários não produz taxa de concordância:
divisões e fusões impedem pressupor um universo comum de pares. Relatar os dois
inventários completos, correspondências propostas, divisões, fusões, omissões e
dúvidas com seus localizadores, sem excluir discordâncias para calcular um
percentual. Contagens descritivas têm como base cada inventário integral, e não
somente o subconjunto que foi possível alinhar. A regra vale também quando
nenhuma correspondência é encontrada: o resultado é comparação não resolvida,
não concordância zero ou perfeita.
Repetições do mesmo modelo não são codificadores humanos independentes.
Um estudo de confiabilidade exigirá corpus próprio, codificação humana
independente e uma regra para alinhar os recortes e resolver discordâncias, com base de
comparação definida antes da codificação. Não foi realizado
esse estudo nesta etapa, nem estimada validade cognitiva.

O [corpus de recortes e contraexemplos](corpus-unidades-de-analise.md) torna
refutáveis as decisões do protocolo. É material sintético de inspeção, não
amostra de estudantes, benchmark de modelos ou padrão-ouro validado.

## Explicação, prática e posição na sequência

Uma unidade **expositiva** desenvolve conteúdo ou mostra solução comentada sem
solicitar produção do estudante antes de revelá-la. Uma unidade de **prática**
solicita recuperar, discriminar, explicar, decidir, aplicar ou produzir algo
antes da solução; pode oferecer instruções e retorno. **Mista** combina
desenvolvimento expositivo e oportunidade efetiva na mesma unidade. As categorias
descrevem função, não componente: um parágrafo pode solicitar prática, e um botão
“continuar” não a cria.

Um retorno que só corrige o alvo mantém a classificação de prática. Se ensina
outro recorte necessário, a unidade é mista e essa introdução entra na análise;
esconder explicação no retorno não reduz a novidade. Registrar a ordem entre
explicação, solicitação e revelação. “Pense nisso”, sem alvo ou produção
identificável, não interrompe automaticamente um trecho expositivo.

Oportunidade é solicitação disponível no material; resposta é acontecimento
do estudante. Duas solicitações independentes numa unidade podem oferecer duas
oportunidades. Etapas inseparáveis da mesma resolução não viram várias por terem
vários campos. Operação, apoio, localizador, ordem e distinção semântica precisam
ser conhecidos antes da contagem. A resposta pode ser mental e conferida pelo próprio estudante;
isso não produz automaticamente evidência observada de desempenho.

Prática de consolidação pode apontar a unidades de análise sem requisito formal
de evidência. Quando se vincula a esse requisito, precisa conservar a operação
exigida e as condições de produção relevantes. Quantidade de oportunidades
oferecidas não equivale a respostas corretas, domínio ou proficiência.

A distribuição é uma decisão ajustável. Uma preferência como “aproximadamente
duas unidades expositivas antes de praticar” orienta a posição das oportunidades,
admite unidade mista e exige leitura da coerência resultante; não é intervalo
cientificamente ótimo. Valor deliberadamente fixado exige respeito ou decisão
explícita sobre o conflito. Mistas interrompem uma sequência sem prática somente
quando há oportunidade real; a exposição anterior e posterior continua visível
pela ordem dos eventos.

## Medidas observáveis e seus denominadores

Estas definições são contratos de cálculo, não promessa de instrumentação
inteiramente implementada. Usar a mesma revisão corrente do conteúdo, inventário,
ordem, público e protocolo. Ausência de anotação é dado ausente, não zero. Em
qualquer agregado, informar quantos itens foram analisados e quantos faltam.
Denominador vazio produz “não se aplica”, nunca zero por divisão implícita.
Classificação incompleta permite somente resultado parcial identificado como tal.

O diagnóstico corrente implementa um subconjunto dessas definições. Em particular,
`revisits` conta aplicações explicativas de identidades não introduzidas na mesma
unidade; não distingue continuação do desenvolvimento de reativação intencional.
As oportunidades registradas são contadas por requisito de evidência, sem cobrir
toda prática informal prevista pelo protocolo. O [dicionário das
medidas](dicionario-metricas-datasets.md) explicita o cálculo e as ausências; as
anotações do corpus não devem ser apresentadas como campos já observados pelo produto.

| Medida | Numerador, denominador e escopo | Limite de interpretação |
| --- | --- | --- |
| introduções por unidade | Identidades introduzidas / uma unidade de estudo, inclusive mista ou prática com novidade no retorno. | Novidade declarada, não carga cognitiva. O teto corrente de expositivas não dispensa examinar os outros casos. |
| mobilização e retomadas | Identidades distintas mobilizadas ou retomadas / uma unidade; cada identidade conta no máximo uma vez em cada conjunto. Retomadas são subconjunto da mobilização, não soma adicional. | Não estima elementos simultâneos na memória. Mostrar também as relações que precisam ser coordenadas. |
| cobertura do desenho | Identidades com introdução localizada / identidades planejadas para desenvolvimento; pressupostos ficam em conjunto separado. | Nome citado não cobre desenvolvimento. O inventário pode estar incompleto; relatar lacunas necessárias fora dele. |
| ocorrência de prática | unidades de prática ou mistas / unidades didáticas classificadas da sequência. Mostrar as três categorias separadamente. | Uma mista conta uma vez no denominador; proporção de unidades não equivale a tempo ou extensão de prática. |
| intervalos sem oportunidade | Número de unidades expositivas completas entre oportunidades consecutivas, mais os trechos inicial e final; cada intervalo é delimitado por esse par de posições ou borda. | Duas oportunidades na mesma unidade têm intervalo zero nessa escala, mas podem ter exposição entre si. Informar posições internas; não inferir espaçamento temporal. |
| oportunidades por alvo | Solicitações distintas dirigidas a uma unidade de análise ou requisito / um alvo identificado; relatar também repetições e alvos sem oportunidade. | Uma solicitação com dois alvos conta uma vez no total e uma vez em cada alvo; não somar colunas por alvo como total global. |
| extensão textual | Palavras segundo algoritmo e idioma declarados, ou caracteres segundo unidade Unicode declarada / conteúdo textual delimitado no estado observado. | Não comparar idiomas como se palavra fosse unidade universal. Notação, imagens e retorno oculto exigem descrição própria. |
| extensão renderizada | Altura do conteúdo inspecionável em pixels CSS / altura útil da área de leitura em pixels CSS, no mesmo estado. | Razão contínua de telas equivalentes, não número de gestos, tempo de leitura ou dificuldade. Transbordamento horizontal é observado à parte. |

A **extensão renderizada** é o espaço ocupado pelo conteúdo tal como aparece
na tela. A área visível da página no navegador é o
[*viewport*](https://developer.mozilla.org/en-US/docs/Glossary/Viewport). Pixels CSS são
unidades de disposição da página, distintas dos pontos físicos da tela. Para
comparar medidas, registrar essa área e a parte útil após barras fixas,
largura, tipografia carregada, tamanho de fonte, entrelinha, zoom, escala do
dispositivo, navegador, modo de visualização, idioma, tema e estado da prática
(inicial, resposta preenchida, retorno aberto, detalhes expandidos). Medir a área
didática, com instruções, alternativas e retorno visível; excluir menu e
ferramentas sobrepostos. Declarar inclusões de cabeçalho e margens. Área de
rolagem interna exige medida e inspeção próprias: a altura externa pode ocultá-la.

Fonte, fórmula, imagem ou retorno ainda não carregados invalidam a comparação.
Uma observação inicial não representa todos os estados. Sem navegador e estado
conhecidos, registrar medição ausente; não preencher pixels por estimativa.
Coeficientes exploratórios por componente não substituem a observação nem
fundamentam limite de geração.

Se o desenvolvimento ultrapassar o alvo editorial, examinar sua organização.
Manter uma unidade mais extensa pode ser adequado para ensinar uma relação que
precisa permanecer junta; dividir faz sentido quando melhora a progressão e
permite reconsiderar a prática entre as unidades. Preservar relações, exemplos,
condições e ligação com a sequência. Limite de transporte exige continuação ou
erro recuperável; nenhuma medida autoriza resumir ou truncar conhecimento.
Comparações entre cópias que variam apenas a distribuição conservam inventário e
repertório. Fusão ou divisão de recortes muda a condição e deve ser declarada.

## Dimensões mantidas fora do catálogo

O planejamento do mapa antes dos lotes, a aprovação limitada ao material
inspecionável e a comunicação compreensível das decisões são compromissos do
fluxo de autoria. Eles não são parâmetros ajustáveis de uma condição. Distribuição editorial, explicações e prática
podem variar pela configuração existente. Uma heurística pedagógica não se torna
automaticamente entidade ou controle novo.

Rótulos como densidade conceitual, dificuldade, carga cognitiva, profundidade,
teoria e prática, cobertura, progressão ou qualidade abrangem fenômenos
distintos e exigem unidades e métodos próprios. O AraLearn não os reduz a
controles globais.

Algumas relações podem ser examinadas por meios mais precisos:

- cobertura compara o inventário planejado e as introduções correntes;
- progressão depende de ordem curricular e pré-requisitos;
- teoria e prática aparecem nas unidades e em suas operações;
- extensão editorial usa contagens observáveis, sem equivaler a complexidade;
- densidade textual só se torna métrica quando unidade, idioma, gênero,
  denominador e procedimento estão definidos.

Essa escolha preserva a possibilidade de pesquisa sem atribuir um significado
indevido a números fáceis de calcular.

## Escopo, origem e precedência

Os parâmetros pedagógicos e os alvos editoriais podem ser definidos no curso,
na lição, na microssequência ou na unidade de estudo. Uma unidade recebe o valor
efetivo de seu contexto. Sem definição deliberada, o assistente precisa calibrar o
desenho conforme público, tarefa, conteúdo e função.
Quando uma pessoa fixa uma condição, essa decisão explícita prevalece no escopo
pertinente. Remover a definição local restaura a herança do escopo ancestral
aplicável. Sem valor definido nessa cadeia, permanece a intenção automática,
a ser calibrada no contexto; a escolha aplicada a uma produção anterior permanece registrada separadamente.

### Exemplo de herança

Considere o teto `2` definido no curso e o teto `1` definido na
microssequência A. Suas unidades recebem `1`. Ao limpar essa definição, a
microssequência volta a herdar `2` do curso. Se também não houver definição no
curso, volta ao estado contextual. Interface, MCP e Actions apresentam a mesma
precedência.

## Repertório por microssequência

Unidades de análise instrucional e requisitos de evidência podem ser associados
a microssequências concretas durante a preparação e a materialização. A relação
admite vários itens em cada alvo e vários alvos para a mesma ideia. Resultados de
aprendizagem pretendidos permanecem no plano geral.

Salvar uma parte apenas agrupa microssequências já previstas no mapa curricular.
O refinamento interno do repertório não altera silenciosamente cobertura, ordem
ou profundidade aprovadas. O serviço resolve as identidades dos registros e evita
duplicação; o assistente distingue introdução, uso de conhecimento estabelecido e
retomada.

## Direção editorial

Direção editorial é um texto curto e explícito no curso ou num escopo didático.
Ela orienta extensão, estilo, títulos e organização da próxima geração ou
revisão. As direções aplicáveis são reunidas em camadas, na ordem dos escopos
ancestrais até o local. Uma direção local não apaga as demais. Instruções
incompatíveis exigem resolução explícita, sem presumir que a mais próxima
substitua silenciosamente uma condição de pesquisa.

Esse texto não é um catálogo de parâmetros e não recebe uma camada permanente
de interpretações. Ele complementa os dois alvos quantitativos com orientação
qualitativa. O assistente aplica a direção na fase editorial pertinente sem alterar o
repertório semântico. Se o conteúdo necessário ultrapassar o alvo de palavras,
o assistente examina se convém manter uma unidade mais extensa ou distribuir o
desenvolvimento. A escolha depende da relação a ensinar e da progressão; o alvo
orienta a extensão, sem obrigar a divisão.

## Política de componentes didáticos

A política de [componentes didáticos](componentes-didaticos.md) define quais
representações e formatos de resposta podem ser usados. É independente dos
parâmetros pedagógicos. Seu valor
efetivo fixa a revisão do catálogo, a disponibilidade de todos os componentes
ou de uma lista restrita, os bloqueios e as preferências entre os permitidos.

Cada referência combina o nome técnico do pacote e a versão do seu contrato
na forma `package@version`. Um conjunto admite
até 64 referências. Bloqueio prevalece sobre permissão; preferência apenas
orienta a escolha entre componentes permitidos e adequados. Disponibilidade,
preferência e uso materializado são fatos diferentes.

O catálogo apresentado pela interface, pelo MCP e por Actions vem da mesma fonte
usada na função remota. Na produção seguinte, o servidor registra a revisão do
catálogo e a política efetiva de cada microssequência. Componente desconhecido,
bloqueado ou fora de uma lista restrita faz a gravação inteira ser revertida.

## Contexto efetivo e aplicação corrente

Ao preparar a produção de uma parte, o servidor reúne para cada microssequência
os parâmetros pedagógicos, os alvos editoriais, a direção editorial, a política
de componentes, o repertório, os requisitos de evidência e as fontes pertinentes.

A gravação conserva com as unidades de estudo a aplicação instrucional corrente:

- identidades das unidades do lote;
- unidades de análise declaradas como introduzidas;
- unidades de análise estabelecidas que foram utilizadas;
- formas de explicação desenvolvidas ou justificadamente inaplicáveis;
- oportunidades dirigidas aos requisitos de evidência;
- operação mantida e dimensões variadas;
- componentes usados;
- alvos editoriais aplicados e extensão observada.

Uma edição apenas do título, sem mudar conteúdo ou posição na estrutura,
conserva a decisão e os mapeamentos registrados, incluindo sua data original.
Uma mudança de prosa, resposta, referências ou hierarquia conserva a decisão
histórica, mas invalida a aplicação semântica corrente. As mesmas referências de
componentes não provam que a análise continua pertinente ao conteúdo alterado.
Uma nova aplicação precisa ser registrada e validada para o conteúdo corrente.

Uma introdução marca somente a primeira apresentação de cada unidade de análise. O
desenvolvimento pode continuar em duas ou mais unidades de estudo sem repetir a
introdução; as formas
requeridas são verificadas sobre o conjunto dessas aplicações. No sentido
inverso, uma unidade pode desenvolver várias unidades de análise quando as
relações forem intencionais e a quantidade de introduções novas respeitar o
teto efetivo. Assim, o teto mede novidade no desenho, não comprimento de texto
nem quantidade de telas.

Uma unidade de prática também pode fazer consolidação formativa sem se dirigir
a um requisito de evidência: por exemplo, recuperar uma relação recém-explicada
antes de introduzir a próxima. Nesse caso, ela não se liga a um requisito e não
entra na contagem mínima de oportunidades de evidência. Isso
permite composições como explicação, pequena consolidação, nova explicação,
aplicação e prática de evidência, sem transformar essa ordem em roteiro
universal nem inventar um requisito de evidência.

O contrato verifica forma, unicidade, pertencimento, teto, cobertura declarada
e política de componentes. O banco de dados também confere se unidades, relações curriculares,
microssequências e componentes correspondem ao conteúdo gravado; essa
verificação integra a [persistência relacional](persistencia-relacional.md).

Essa verificação preserva rastreabilidade. Ela não substitui a leitura
disciplinar do conteúdo para decidir se uma explicação realmente desenvolve o
mecanismo ou se duas práticas são substantivamente distintas.

Ao revisar uma unidade já produzida, a leitura recupera as três escolhas de
organização da produção — tamanho da parte, tamanho do lote e frequência de
pausa — registradas em sua aplicação quando não existe uma atribuição vigente. Isso permite
reproduzir a mesma configuração sem transformar aquela escolha automática em
preferência do curso. A consulta do curso ou da microssequência continua indicando
ausência de escolha enquanto ela não for definida nesses escopos. Uma atribuição
vigente, inclusive uma nova fixação humana, prevalece na resolução; a aplicação
anterior continua inspecionável separadamente e não é reescrita por essa leitura.

## Interface, MCP e Actions

Na inspeção do curso, o menu de tarefas abre **Parâmetros** e **Fontes** diretamente.
O ícone da unidade abre os ajustes daquele escopo sem perder a posição da
inspeção. O painel mantém dimensões e ações estáveis, apresenta um grupo por vez
e revela a definição, origem e limites ao abrir uma decisão.

**Explicações** e **Prática** reúnem decisões pedagógicas; **Leitura e estilo**
contém a extensão do material e a direção editorial. **Produção** organiza
partes, lotes e pausas; **Conversa** regula as respostas do assistente.
**Recursos** delimita componentes permitidos, e **Perfis** reutiliza preferências. Essa organização não
altera o significado dos parâmetros nem converte escolhas operacionais em
medidas de aprendizagem.

O controle de alcance identifica curso, lição, microssequência ou unidade e
permite navegar entre os escopos. Rascunhos permanecem ao trocar de grupo;
fechar ou navegar com alterações pendentes exige salvá-las ou descartá-las.
Preferências do aplicativo, como aparência e sincronização deste dispositivo,
continuam na tela inicial, em Conta e aparência.

A subvisão **Parâmetros** abre no curso, no módulo, na lição, na microssequência
ou na unidade de estudo e mostra:

- valor efetivo e escopo que o definiu;
- definição local e ação para restaurar a herança;
- as definições do catálogo canônico aplicáveis ao escopo, organizadas por
  explicações, prática, leitura e estilo, produção e conversa;
- direção editorial separada;
- política de componentes com nomes legíveis;
- unidades de análise e requisitos atribuídos à microssequência;
- aplicação corrente nas unidades de estudo.

Ao abrir **Ajustar**, a pessoa autora encontra o significado do parâmetro e o
aviso de que salvar muda a orientação, sem reescrever unidades ou a explicação.
O detalhe **Definição e origem**, antes do formulário, reúne a operação regulada,
o alcance, a configuração atual e sua justificativa. **Fixo** indica o valor
vigente; **Automático** delega a escolha contextual da próxima produção. A
indicação de herança identifica o nível de origem e não cria uma definição
local ao consultar.

Na unidade de estudo, o mesmo detalhe distingue **Aplicado nesta produção** da
configuração atual. Esse registro vem da leitura autoral já existente, com o
valor, origem e motivo realmente preservados. Uma fixação nova pode divergir do
valor aplicado; salvar não atualiza esse histórico. Valores iguais também não
atestam que o conteúdo realiza adequadamente a intenção. Ausência de registro,
consulta pendente e falha de leitura são estados diferentes; a configuração
atual não preenche uma lacuna histórica nem inventa uma justificativa.

Nos níveis acima da unidade, o painel orienta inspecionar cada produção, sem
promover o registro de uma unidade a regra para o curso inteiro. Ajustes
restritos ao curso continuam legíveis na unidade, mas não ganham editor em um
nível não permitido. Definições, opções e limites seguem no mesmo catálogo;
comparar esses estados não acrescenta parâmetros ou provoca materialização.

`consultar_configuracao` lê valores efetivos e `ajustar_configuracao` define ou
restaura herança. Interface, MCP e Actions chegam ao mesmo domínio. A pessoa
indica o curso e o escopo a consultar ou ajustar; o servidor verifica a versão
atual antes de gravar e conserva a identidade de uma tentativa repetida.

## Identificadores para integração

Os nomes abaixo identificam as decisões no catálogo e nos registros de
configuração. Para consultar valores, alcance e finalidade, use o
[catálogo corrente](#catálogo-corrente).

| Decisão | Identificador |
| --- | --- |
| Teto de novidades na unidade expositiva | `new_analysis_unit_ceiling_per_expository_study_unit` |
| Formas de explicação | `required_explanation_forms` |
| Mínimo de oportunidades de prática | `minimum_distinct_practice_opportunities_per_evidence_requirement` |
| Variação da prática | `required_practice_variation_dimensions` |
| Extensão da resposta na conversa | `authoring_chat_response_word_target` |
| Extensão da unidade de estudo | `study_unit_content_word_target` |
| Distribuição da prática | `practice_distribution` |
| Posição da prática | `practice_position` |
| Tamanho pretendido da parte | `authoring_part_microsequence_target` |
| Tamanho pretendido do lote | `authoring_batch_part_target` |
| Frequência de pausa | `authoring_pause_frequency` |
| Forma da conversa de autoria | `authoring_chat_interaction` |

## Limites operacionais

Valores e textos possuem limites de transporte e persistência. Uma leitura muito
ampla deve usar um escopo mais específico; uma direção editorial extensa deve
ser dividida conforme sua função.

Esses valores protegem transporte, memória e transação. Eles não possuem
significado pedagógico.

## Fundamentação e limites de interpretação

As ligações seguintes registram o argumento usado para esta definição operacional.
São inferências de desenho do AraLearn, não medidas prescritas pelas fontes.
A consulta focal em 5 de setembro de 2026 foi suficiente para delimitar o
protocolo e suas incertezas; não constituiu revisão sistemática da literatura.

| Fonte e localização consultada | Argumento delimitado | Decisão no AraLearn | Medida e limite |
| --- | --- | --- | --- |
| [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli), [KLI, §§ 2.1 e 3](https://doi.org/10.1111/j.1551-6709.2012.01245.x) | O quadro separa eventos observáveis e mudanças de conhecimento não observáveis; análises de conhecimento orientam escolhas instrucionais. | Descrever o conhecimento-alvo e suas relações segundo tarefa e público; não identificar anotação editorial com componente cognitivo. | Introduções por unidade e cobertura do inventário, sem inferência de aprendizagem. |
| [Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity), [“Element Interactivity” e “Expertise, Strategy Use, and Element Interactivity”](https://link.springer.com/article/10.1007/s10648-023-09782-w) | Interatividade depende do que precisa ser processado conjuntamente e do conhecimento prévio; a mesma informação pode ser agrupada de modos diferentes conforme a experiência. | Registrar repertório e relações de coordenação; contagem editorial permanece distinta da estimativa de interatividade do artigo. | Identidades mobilizadas por unidade, sem conversão em carga; não transferir a contagem de símbolos de um exemplo do artigo como algoritmo geral. |
| [McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence), [resumo dos dois experimentos](https://www.tandfonline.com/doi/abs/10.1080/01638539609544975) | Coerência, inferência e conhecimento prévio interagem; resultados diferem conforme tarefa, e parte dos resultados do primeiro experimento não se repetiu no segundo. | Localizar as relações necessárias e o apoio ao público, sem regra “mais explícito sempre é melhor”. | Lacunas e desenvolvimento localizados, não escore de coerência por palavras. A consulta deste estudo foi ao resumo, não reanálise de seus dados. |
| [Saussure (1916)](referencias.md#ref-saussure1916cours), [segunda parte, cap. IV, §§ 1–2](https://fr.wikisource.org/wiki/Cours_de_linguistique_g%C3%A9n%C3%A9rale/Deuxi%C3%A8me_partie) | Valor linguístico envolve relações no sistema; equivalências entre palavras de línguas diferentes não são necessariamente exatas. | Tratar rótulo, sentido e identidade separadamente; testar equivalência no contexto antes de fundir tradução ou sinônimo. | Identidades alinhadas no corpus, sem contar palavras como conceitos. A análise linguística não fornece unidade cognitiva nem valida o inventário do curso. |
| [Greimas (1966)](referencias.md#ref-greimas1966recit), [§ I, p. 28](https://www.persee.fr/doc/comm_0588-8018_1966_num_8_1_1114) | No problema do relato mítico, sequências articuladas e informação extratextual são necessárias à interpretação; o texto e a recepção são planos distintos. | Examinar contexto e continuidade de sentidos além da frase; não aplicar inventário de semas ou categorias narrativas como taxonomia pedagógica universal. | Localizadores e relações entre trechos; não escore de isotopia ou medida da mente. Consulta focal ao artigo, sem alegar leitura integral de *Sémantique structurale*. |
| [Miller (1984)](referencias.md#ref-miller1984genre), [“Recurrent Rhetorical Situations” e “Implications”, pp. 155–165](https://www.researchgate.net/profile/Carolyn-Miller-15/publication/238749675_Genre_as_Social_Action/links/56bc9c9c08ae6cc737c5c405/Genre-as-Social-Action.pdf) | Gênero envolve ação retórica em situações sociais recorrentes; semelhança formal não basta. | Tratar unidade de estudo como formato de apresentação e elemento da sequência; analisar os gêneros efetivamente usados por finalidade e interlocução. | Categorias funcionais e posições das oportunidades, sem inferir gênero pela geometria. |
| [Gilardi et al. (2023)](referencias.md#ref-gilardi2023annotation), [artigo, tarefas e resultados](https://pmc.ncbi.nlm.nih.gov/articles/PMC10372638/); [Pangakis et al. (2023)](referencias.md#ref-pangakis2023validation), [resumo do preprint](https://arxiv.org/abs/2306.00176) | Um modelo de linguagem pode anotar textos; desempenho é dependente da tarefa, dos dados e da instrução. O segundo trabalho requer validação específica. | Usar codificação assistida e revisão de ambiguidades, sem presumir validade a partir de concordância do modelo consigo mesmo. | Comparação de recortes, ocorrências e divergências; confiabilidade humana e validade ainda não medidas. |
| [Sennrich et al. (2016)](referencias.md#ref-sennrich2016subwords), [resumo e método de subpalavras](https://aclanthology.org/P16-1162/) | Segmentação computacional permite representar palavras raras ou desconhecidas com unidades menores. | Tokens são observáveis do instrumento, não unidades semânticas aprovadas do curso. | Contagem de tokens somente para transporte/custo computacional, nunca denominador cognitivo. |

No contrato atual, a unidade de estudo é um **formato de apresentação e uma parte
de sequência didática** que pode abrigar explicação, exemplo resolvido, problema,
comentário ou combinação. “Card” designa o suporte visual. Uma futura alegação
de gênero próprio exigiria estudar finalidades compartilhadas, interlocução,
convenções e usos recorrentes por uma comunidade. Não há essa evidência aqui.
Concisão da conversa de autoria e profundidade do material de estudo respondem
a situações comunicativas diferentes e são decisões independentes.

Explicações podem apoiar elaboração e relações com princípios, mas dependem
do conteúdo e do modo de uso
([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations); [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)).

Prática de recuperação, distribuição e intercalação apoiam a investigação de
oportunidades e variações, sem fixar uma dosagem universal ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)). Representações externas
precisam ser escolhidas segundo sua função e a tarefa de coordenação
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)).

Essas fontes sustentam as dimensões examinadas. Calibrações contextuais e valores
fixados continuam hipóteses revisáveis. Para o funcionamento conversacional, consulte [Fluxos,
instruções e contratos](fluxos-prompts-e-contratos.md).

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing): Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102.
- [Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity): Ouhao Chen; Fred Paas; John Sweller (2023). **A Cognitive Load Theory Approach to Defining and Measuring Task Complexity Through Element Interactivity.** *Educational Psychology Review*, 35, p. 63.
- [Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations): Michelene T. H. Chi; Miriam Bassok; Matthew W. Lewis; Peter Reimann; Robert Glaser (1989). **Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.** *Cognitive Science*, 13(2), p. 145–182.
- [Gilardi et al. (2023)](referencias.md#ref-gilardi2023annotation): Fabrizio Gilardi; Meysam Alizadeh; Maël Kubli (2023). **ChatGPT Outperforms Crowd Workers for Text-Annotation Tasks.** *Proceedings of the National Academy of Sciences*, 120(30), p. e2305016120.
- [Greimas (1966)](referencias.md#ref-greimas1966recit): Algirdas Julien Greimas (1966). **Éléments pour une théorie de l'interprétation du récit mythique.** *Communications*, 8(1), p. 28–59.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence): Danielle S. McNamara; Walter Kintsch (1996). **Learning from Texts: Effects of Prior Knowledge and Text Coherence.** *Discourse Processes*, 22(3), p. 247–288.
- [Miller (1984)](referencias.md#ref-miller1984genre): Carolyn R. Miller (1984). **Genre as Social Action.** *Quarterly Journal of Speech*, 70(2), p. 151–167.
- [Pangakis et al. (2023)](referencias.md#ref-pangakis2023validation): Nicholas Pangakis; Samuel Wolken; Neil Fasching (2023). **Automated Annotation with Generative AI Requires Validation.** arXiv.
- [Saussure (1916)](referencias.md#ref-saussure1916cours): Ferdinand de Saussure (1916). **Cours de linguistique générale.** Lausanne and Paris, Payot.
- [Sennrich et al. (2016)](referencias.md#ref-sennrich2016subwords): Rico Sennrich; Barry Haddow; Alexandra Birch (2016). **Neural Machine Translation of Rare Words with Subword Units.** In: *Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, Association for Computational Linguistics, p. 1715–1725.
- [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved): Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848.
- [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations): Jörg Wittwer; Alexander Renkl (2008). **Why Instructional Explanations Often Do Not Work: A Framework for Understanding the Effectiveness of Instructional Explanations.** *Educational Psychologist*, 43(1), p. 49–64.

<!-- referências locais: fim -->
