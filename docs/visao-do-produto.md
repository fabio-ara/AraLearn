# Visão do produto

O AraLearn é uma plataforma para estudo autodidata e criação de cursos com apoio de inteligência artificial generativa. A partir de um tema, de uma ementa ou de materiais já reunidos, um curso pode ser planejado, produzido, revisado e estudado no próprio aplicativo.

A inteligência artificial (IA) participa da autoria, mas o curso é o objeto central que permanece. Uma conversa pode ajudar a planejar uma sequência, produzir conteúdo ou revisar uma parte do material; o resultado continua organizado como curso, com estrutura própria, conteúdo revisável e relações que podem ser retomadas em outro momento ou por outra forma de autoria.

## O problema tratado

O AraLearn parte de situações em que materiais já estão disponíveis, mas ainda precisam ser organizados como um percurso de estudo. Livros, aulas, vídeos, ementas, documentos ou materiais próprios podem oferecer o conteúdo necessário e, ainda assim, deixar em aberto como começar, como relacionar o que foi apresentado, quando aprofundar um assunto e como praticar o que precisa ser compreendido ou realizado.

No AraLearn, organizar esse percurso inclui preservar sua continuidade. Por isso, assuntos extensos podem ser distribuídos em várias etapas, para que conceitos, procedimentos e relações sejam desenvolvidos sem condensação excessiva. Ao mesmo tempo, essas etapas precisam permanecer ligadas para que a divisão do conteúdo não transforme o estudo numa sequência de fragmentos independentes.

Esse problema inclui situações em que o estudo ocorre em períodos curtos, sofre interrupções ou depende de uma conexão instável. O AraLearn procura conservar o percurso e o ponto alcançado para que continuar estudando não exija reconstruir a cada sessão a organização anterior.

O [modelo didático](modelo-didatico.md) desenvolve os fundamentos e as decisões educacionais que orientam essa organização.

## O curso como objeto central

No AraLearn, um curso não é apenas um conjunto de páginas nem o resultado final de uma conversa. Ele reúne um percurso que pode continuar sendo planejado e modificado ao longo do tempo. O conteúdo produzido permanece ligado à estrutura em que será estudado, e fontes e informações de proveniência podem acompanhar o material ao longo da autoria e da revisão.

Estudo e autoria trabalham sobre esse mesmo curso, embora com responsabilidades diferentes. Durante o estudo, a pessoa percorre o conteúdo já produzido, realiza práticas, recebe retorno, marca unidades para rever e pode registrar observações. Na autoria, o curso continua sendo planejado, produzido, revisado e corrigido. A pessoa proprietária também pode conceder acesso ao curso para estudo sem transferir a autoria do original.

Essa relação permite que um curso evolua sem exigir que todo o material esteja concluído antes de qualquer estudo. O que já foi produzido pode integrar o percurso enquanto outras partes continuam em elaboração ou revisão.

Os procedimentos de estudo estão no [guia do estudante](guia-estudante.md), e o trabalho de criação e manutenção de cursos é desenvolvido no [guia do professor e autor](guia-professor-autor.md).

## Organização do percurso

O percurso de estudo segue uma hierarquia:

```text
curso → módulo → lição → microssequência didática → unidade de estudo
```

Os níveis mais amplos mantêm cada avanço situado no restante do percurso. A **microssequência didática** organiza um objetivo local dentro da lição. Suas **unidades de estudo** desenvolvem as etapas necessárias para alcançá-lo por meio de explicações, exemplos, práticas e retorno.

O AraLearn não exige uma quantidade fixa de unidades para cada assunto nem uma quantidade universal de exercícios. A extensão depende do conteúdo, do objetivo e do trabalho necessário para desenvolvê-lo. Um assunto pode exigir poucas etapas ou uma sequência mais longa.

Uma unidade de estudo também não precisa se limitar à prosa. Quando a estrutura do próprio conteúdo é importante para compreendê-lo ou trabalhar com ele, podem ser usadas fórmulas, código, tabelas, gráficos, diagramas e outras representações. A escolha decorre da relação que precisa ser preservada ou da tarefa que precisa ser realizada, e não da necessidade de variar visualmente a página.

Os [componentes didáticos](componentes-didaticos.md) apresentam essas representações e seu funcionamento. A [fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md) desenvolve os critérios educacionais usados para examiná-las.

## Autoria com inteligência artificial

A IA funciona como instrumento de autoria. Ela pode auxiliar no planejamento do percurso, na redação e revisão de explicações, na elaboração de práticas e na escolha de formas adequadas de representar determinado conteúdo.

Esse trabalho pode acontecer na assistência integrada ao aplicativo ou por integrações conversacionais externas. O [Model Context Protocol (MCP)](autoria-mcp.md) permite trabalhar com cursos a partir de clientes compatíveis, enquanto [Actions](autoria-actions.md) permite a integração com um GPT personalizado. Os canais são diferentes, mas a conversa não substitui o curso: todos trabalham sobre um objeto estruturado que continua existindo independentemente da sessão usada para modificá-lo.

A autoria assistida também não transforma a resposta de um modelo em conteúdo definitivo por si só. Propostas podem ser examinadas, corrigidas ou rejeitadas antes de permanecerem no curso. A [assistência por modelo de linguagem](assistencia-por-ia.md) apresenta em detalhe como contexto, propostas, validação e decisão humana se relacionam.

## Continuidade do estudo

O AraLearn funciona na web e no Android e considera situações em que o estudo é interrompido ou a conexão com a internet varia. Depois que o conteúdo necessário de um curso está disponível no dispositivo, a leitura, a realização de práticas e a retomada desse conteúdo já carregado não precisam depender de uma operação remota a cada passo.

O estado necessário para continuar também pode permanecer localmente e ser sincronizado quando a conexão retorna. Isso permite interromper uma sessão e retomá-la posteriormente, além de levar o estado confirmado para outro dispositivo ligado à mesma conta.

Essa continuidade não significa que todas as operações do produto funcionem sem conexão. A criação e a alteração de informações que precisam ser confirmadas pelo servidor continuam dependendo da comunicação necessária para realizá-las. A [persistência relacional e sincronização](persistencia-relacional.md) explica como o AraLearn distribui essas responsabilidades entre dispositivo e servidor.

## Estado pessoal

Para que um percurso possa ser interrompido e retomado, o AraLearn conserva informações pessoais de continuidade, como o ponto alcançado e as unidades marcadas para revisão. Esses registros servem para organizar o próprio estudo e manter escolhas entre sessões.

Esse estado não é convertido automaticamente em nota, histórico de desempenho ou medida de aprendizagem. Avançar por uma unidade ou marcá-la para rever informa o que o aplicativo precisa fazer depois; não estabelece, por si só, quanto a pessoa compreendeu ou domina aquele conteúdo.

O [estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) detalha quais registros são conservados, suas finalidades e os limites de interpretação associados a eles.

## Contextos de aplicação e fronteiras

O estudo autodidata é um contexto central do AraLearn, mas não esgota os usos possíveis do produto. Formação profissional e aprendizagem no trabalho, inclusive em contextos institucionais compatíveis com as capacidades disponíveis, também são contextos possíveis de aplicação e investigação.

O núcleo do produto continua sendo a criação e o estudo de cursos. Em particular, o AraLearn não transforma o estado pessoal de estudo em avaliação automática da aprendizagem nem deduz competência a partir de progresso ou de ações registradas durante o percurso.

As funções disponíveis e seus limites podem mudar com a evolução do software. A referência corrente para verificar o que está efetivamente disponível é [Capacidades e limites atuais](estado-atual-e-roadmap.md). A [revisão de literatura](revisao-de-literatura.md) situa os diferentes contextos educacionais e profissionais sem tratá-los como resultados já demonstrados do produto.

## Pesquisa e avaliação

O AraLearn também é um artefato técnico ligado a pesquisa educacional. Essa condição exige distinguir perguntas que podem ser respondidas pela inspeção do software daquelas que dependem de investigação com pessoas.

O funcionamento sem conexão, por exemplo, pode ser verificado no próprio software. Saber se essa propriedade melhora a retomada do estudo, a compreensão ou a aprendizagem exige uma pesquisa que defina participantes, tarefas, condições e formas de avaliação adequadas à pergunta.

Da mesma forma, a literatura pode fundamentar conceitos, decisões de projeto e hipóteses, mas não demonstra que uma função esteja implementada. Código, testes e inspeção sustentam afirmações sobre o funcionamento do produto; efeitos educacionais dependem de evidência empírica produzida para essa finalidade.

A [revisão de literatura](revisao-de-literatura.md) reúne os fundamentos externos usados pelo projeto, o [quadro teórico](quadro-teorico.md) organiza as relações propostas e o [protocolo de avaliação](protocolo-avaliacao-artefato.md) estabelece como propriedades técnicas e questões educacionais podem ser investigadas sem confundir seus tipos de evidência.
