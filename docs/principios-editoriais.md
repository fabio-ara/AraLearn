# Princípios editoriais da documentação

A documentação do AraLearn é parte de sua proposta educativa. Ela oferece
caminhos para usar o aplicativo, compreender seu funcionamento e aprofundar o
trabalho de desenvolvimento ou pesquisa. Este capítulo apresenta as escolhas de
organização, linguagem e fundamentação adotadas no projeto e suas razões.

O público reúne pessoas com experiências diferentes em estudo, educação e
tecnologia. A entrada de cada leitor pode variar. A documentação oferece
percursos de aprofundamento para que uma especialidade não seja pré-requisito
silencioso para compreender outra.

## Uma progressão que parte de problemas concretos

A apresentação de um conceito começa pela situação que ele ajuda a compreender. Na engenharia, por exemplo, há dois problemas distintos: impedir que uma pessoa altere o curso de outra e evitar que duas gravações simultâneas apaguem o trabalho uma da outra. A explicação dessas situações prepara a introdução de autorização e de controle de concorrência. Os nomes dos mecanismos passam então a designar relações que o leitor já consegue reconhecer.

O mesmo cuidado orienta os capítulos educacionais. A dificuldade de acompanhar uma explicação que exige atenção simultânea a muitos elementos ajuda a situar a discussão sobre carga cognitiva. O ato de tentar recordar uma resposta antes de consultá-la permite introduzir a prática de recuperação. A teoria aprofunda esses problemas e oferece formas de investigá-los.

Essa progressão também vale dentro dos capítulos especializados. Siglas, convenções do AraLearn e conceitos acadêmicos recebem uma explicação breve no ponto em que se tornam necessários. Um link próximo oferece aprofundamento. Os glossários apoiam a consulta posterior, enquanto a explicação local permite continuar a leitura.

Mesmo um artigo técnico aprofundado constrói o repertório necessário ao seu
próprio raciocínio. Primeiro apresenta o problema, a finalidade do mecanismo e
suas relações com o restante do sistema; depois introduz contratos,
identificadores e outros detalhes especializados. Essa progressão preserva a
profundidade técnica e permite que um leitor sem conhecimento prévio chegue até
ela.

Na prosa, a documentação evita antecipar a lista completa de uma classificação
quando o leitor precisa apenas reconhecer seu alcance. Uma estrutura com muitos
níveis pode ser apresentada “do curso à unidade de estudo”, com um link para a
referência exata.
Quando exemplos bastam, três casos representativos costumam formar melhor o
modelo mental do que um inventário. Enumerações completas permanecem nos
lugares em que os itens são o próprio objeto de consulta, como contratos,
matrizes e checklists.

Depois de apresentado, um termo pode ser usado com consistência, sem uma nova definição em cada parágrafo. Quando a mesma palavra tem sentidos diferentes em áreas próximas, a qualificação ajuda a reconhecer o sentido adotado: revisão de conteúdo, revisão bibliográfica e revisão de software, por exemplo, designam atividades distintas.

## Profundidade distribuída pelo conjunto

A extensão de um capítulo acompanha a complexidade do assunto. Clareza depende de mostrar relações, exemplos, alternativas e limites; uma redução de palavras que elimina essas relações pode tornar a leitura mais difícil.

Por isso, os capítulos têm funções próprias. Um guia de estudo explica como retomar um percurso. O capítulo de persistência explica como essa continuidade depende dos dados no dispositivo e no servidor. O protocolo de avaliação discute como observar a retomada em uma investigação com participantes. Há uma relação entre os três textos, mas cada um responde a uma pergunta diferente.

| Tipo de documento | O que oferece ao leitor |
| --- | --- |
| Apresentação e visão do produto | Problema, finalidade, público, compromissos de desenho e possibilidades de uso. |
| Guias | Ações, resultados esperados e recuperação de dificuldades relevantes. |
| Capítulos conceituais e acadêmicos | Conceitos, relações, fundamentos, alternativas e questões de pesquisa. |
| Capítulos de engenharia | Responsabilidades dos subsistemas, fluxo de dados, decisões técnicas, falhas e formas de verificação. |
| Referências, glossários e matrizes | Consulta precisa depois de situado o assunto. |
| Documentos de avaliação | Relação entre perguntas, métodos, evidências e limites de inferência. |
| Registros históricos | Contexto de uma versão ou etapa identificada do desenvolvimento. |

Uma explicação pode ser redistribuída entre páginas quando o conjunto fica mais compreensível. A página de origem conserva a relação necessária para entender o encaminhamento, e o destino contém o desenvolvimento prometido. Assim, reduzir repetição preserva a cobertura do assunto.

O [mapa da documentação](README.md) organiza percursos por intenção de leitura. O [inventário](inventario-documentacao.md) permite localizar documentos específicos e reconhecer a função de cada um.

## Português e terminologia

A prosa privilegia frases que desenvolvem uma relação reconhecível: quem realiza uma ação, sobre qual objeto, com qual finalidade e sob quais condições. Exemplos tornam essas relações concretas. Listas atendem a sequências ou conjuntos comparáveis; tabelas ajudam quando as correspondências entre elementos são o centro da explicação.

O uso de terminologia especializada acrescenta precisão e permite continuar a pesquisa fora da documentação. Quando pertinente, a primeira ocorrência apresenta o termo em português e sua forma consagrada em outra língua. Nomes de instituições, padrões, protocolos, produtos e trabalhos acadêmicos permanecem reconhecíveis.

Os nomes comuns do domínio aparecem em minúsculas no corpo do texto, do curso
à unidade de estudo. O mesmo vale para termos como explicação, fonte e autoria;
o [vocabulário controlado](vocabulario-controlado.md) mantém a relação completa.
Maiúsculas permanecem em nomes próprios, títulos e na reprodução exata de
identificadores ou rótulos da interface. “Ler a explicação” descreve o conteúdo;
“abrir **Explicação**” pode identificar uma ação com esse nome na interface
vigente.

Os [glossários técnico](glossario-tecnico.md) e [de
construtos](glossario-construtos.md) desenvolvem conceitos de engenharia,
educação e metodologia. Um construto é um conceito empregado para formular e
investigar um fenômeno, como autorregulação; sua definição orienta o que uma
pesquisa procura observar.

## Autoria, assistência e participação humana

A apresentação geral distingue os papéis humanos e técnicos no processo de
autoria. A [assistência por IA](assistencia-por-ia.md) mantém a relação completa
entre eles. Marcas aparecem quando identificam um serviço efetivamente usado,
uma configuração ou uma condição de compatibilidade. Assim, o processo pode ser
compreendido mesmo quando o fornecedor muda.

MCP e OpenAPI são apresentados pela função que exercem na comunicação entre
aplicações. O uso desses padrões facilita a descrição de interfaces de
integração; a compatibilidade de um cliente depende também de suas capacidades
e das condições de autorização.

A participação humana é descrita por ações observáveis, como definir a
intenção, examinar uma proposta e decidir sobre o conteúdo salvo. Produzir,
validar e declarar revisão continuam sendo atos distintos. Essa precisão ajuda
tanto a usar o aplicativo quanto a investigar a colaboração entre pessoas e
sistemas de inteligência artificial.

## O alcance de cada afirmação

A documentação relaciona o que o AraLearn implementa com as razões de desenho e com as questões que permanecem abertas. O leitor encontra distinções entre tipos de afirmação que exigem evidências diferentes.

| Tipo de afirmação | Como é situado na documentação |
| --- | --- |
| Definição operacional do produto | Explica o significado adotado no AraLearn e sua função, como a organização em microssequências didáticas. |
| Decisão de desenho | Apresenta o problema, a opção adotada e as razões pertinentes. |
| Comportamento implementado | Descreve o funcionamento nas condições conhecidas e indica onde verificá-lo. |
| Proposição teórica ou resultado de outro estudo | Identifica a fonte e conserva o alcance da teoria ou da investigação citada. |
| Hipótese sobre o AraLearn | Formula uma relação que pode ser investigada, com as condições necessárias à observação. |
| Evidência obtida com o artefato | Identifica método, contexto, participantes ou dados, resultados e limites de interpretação. |

Um teste de software pode verificar que a posição de leitura é recuperada após uma interrupção. Investigar se essa retomada ajuda uma pessoa a compreender o assunto exige outro desenho de avaliação. Da mesma forma, uma recomendação institucional oferece orientações para a atuação responsável, enquanto um estudo empírico produz evidências sob condições delimitadas.

A proximidade entre um termo do produto e um conceito da literatura abre uma relação a examinar. Por exemplo, a possibilidade de ajustar o próprio percurso pode ser relevante para investigar autorregulação, mas a existência desse controle não demonstra, por si, que os estudantes regulam melhor sua aprendizagem.

## Fontes que participam do argumento

As fontes são escolhidas pela contribuição que oferecem à pergunta em discussão. Trabalhos teóricos ajudam a formular relações; estudos primários permitem examinar métodos e resultados; revisões e meta-análises situam a diversidade da evidência disponível. Obras fundamentais e pesquisas recentes podem cumprir funções complementares.

A leitura de uma publicação considera o argumento, o método e as condições
que limitam seus resultados. Esses elementos ajudam a formular investigações
adequadas para o AraLearn. Uma proposta derivada dessa leitura é apresentada
como possibilidade para o artefato, com distinção entre a contribuição dos
autores e a interpretação desenvolvida no projeto.

Resultados contraditórios, nulos ou dependentes do contexto permanecem relevantes quando alteram a interpretação. A escolha de um estudo considera o que seu conteúdo permite afirmar; a afinidade entre títulos, temas ou instituições é insuficiente para justificar sua inclusão.

As afirmações sobre protocolos, bibliotecas e serviços usam especificações e documentação oficial. O link aparece junto da explicação da tecnologia ou da tarefa para a qual ela é necessária. Afirmações educacionais e metodológicas recorrem à literatura pertinente. Questões de ética e direitos distinguem requisitos jurídicos, orientações institucionais, decisões de produto e problemas de pesquisa.

## Bibliografia e percursos de aprofundamento

A bibliografia cumpre duas funções: permitir conferir uma afirmação e apoiar o estudo. As citações aparecem próximas dos argumentos aos quais se referem. A [revisão de literatura](revisao-de-literatura.md) organiza os eixos de investigação; o [quadro teórico](quadro-teorico.md) explicita relações entre conceitos; o [guia do pesquisador](guia-pesquisador.md) ajuda a passar de um interesse amplo a uma pergunta investigável.

Os metadados bibliográficos — autoria, título, ano e identificadores de publicação — ficam em [referencias.bib](referencias.bib). A [bibliografia legível](referencias.md) e as seções locais de referências derivam dessa fonte. Cada seção local reúne as obras efetivamente citadas na página, evitando versões concorrentes da mesma referência.

O [registro de buscas bibliográficas](evidence/registro-buscas-bibliograficas.csv) conserva consultas realizadas conforme o [protocolo da revisão](revisao-de-literatura.md#protocolo-prospectivo-de-busca-e-atualização). Ele distingue a conferência de metadados, a leitura de resumos e a leitura de textos integrais. Essa distinção permite compreender a base da seleção e retomar uma busca sem atribuir à revisão uma abrangência que ela não teve.

## Engenharia que pode ser compreendida e reproduzida

Os capítulos técnicos explicam o problema atendido por cada subsistema e suas
relações com o restante do aplicativo. Conforme o assunto, acompanham o acesso,
o caminho dos dados ou a recuperação de uma falha até o nível necessário para
compreender e reproduzir o funcionamento.

Identificadores, trechos de código e estruturas de dados são úteis quando permitem integrar um cliente, localizar uma implementação, reproduzir uma operação ou verificar uma propriedade. A seleção desses detalhes considera sua finalidade para o leitor. A descrição de cada função auxiliar ou de cada ajuste de implementação pertence ao código e a seu histórico; os capítulos desenvolvem o funcionamento que essas partes tornam possível.

Uma afirmação como “o AraLearn usa PostgreSQL, IndexedDB e Supabase” ainda deixa por explicar a arquitetura. O capítulo correspondente mostra que responsabilidades cabem a cada mecanismo, como os dados circulam e quais condições de acesso e continuidade resultam dessas escolhas.

Procedimentos operacionais apresentam ações e resultados reconhecíveis. Quando uma falha exige recuperação específica, o guia explica como reconhecê-la e o que a recuperação preserva. A evidência técnica informa a propriedade verificada e as condições do teste, com ligações aos artefatos necessários à reprodução.

## Estado corrente, história e manutenção

Cada informação mutável tem um local principal. A visão do produto apresenta sua finalidade; o guia da tarefa descreve o uso; o capítulo técnico explica o mecanismo; os registros estruturados mantêm metadados e contratos. Outras páginas oferecem a ligação necessária ao seu próprio assunto e encaminham o aprofundamento.

As páginas correntes descrevem o funcionamento disponível. A história das mudanças permanece no Git, no [CHANGELOG](../CHANGELOG.md) e nos documentos identificados como históricos. Conversas de desenvolvimento, tentativas de depuração e instruções internas não fazem parte da explicação pública do produto.

As [origens do AraLearn](origens-do-aralearn.md) têm outra função: apresentar as experiências e os problemas que motivaram o projeto. Esse relato pessoal permite compreender sua trajetória. Os capítulos de pesquisa tratam das perguntas e das evidências com os métodos apropriados.

A revisão editorial combina leitura humana e verificações automáticas. A automação ajuda a encontrar destinos de links ausentes, referências desconhecidas e inconsistências terminológicas. A leitura examina a progressão, a correspondência com o produto, a suficiência das explicações e o alcance das fontes. A comparação com versões anteriores permite reconhecer conhecimento ainda necessário e atualizar sua apresentação.

Essas escolhas oferecem uma base comum a quem contribui com a documentação. A manutenção acompanha a evolução do AraLearn e as dificuldades encontradas pelos leitores, preservando caminhos para compreender, usar e investigar o artefato.
