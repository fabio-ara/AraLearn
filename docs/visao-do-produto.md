# Visão do produto

O AraLearn é um aplicativo de pesquisa em design instrucional e tecnologia educacional, voltado à autoria de cursos e ao estudo autodidata no celular. Com assistência de inteligência artificial (IA) generativa e revisão humana, uma pessoa pode transformar temas, ementas, slides e outros materiais em trilhas que desenvolvem explicações, apresentam representações visuais e propõem atividades interativas.

O problema central está no trabalho entre reunir informação e dispor de um percurso de estudo. É preciso decidir o que ensinar primeiro, explicitar relações, escolher exemplos e práticas, conferir as fontes e revisar o resultado. No AraLearn, essas decisões podem ser examinadas durante a autoria e retomadas no próprio curso. O aplicativo constitui, assim, um artefato para investigar tanto o desenho do material quanto a colaboração entre a pessoa autora e a IA.

## Problema educacional e problema de interação

Ter acesso a livros, aulas e respostas de um modelo de linguagem pode deixar ao estudante a tarefa de reconstruir sozinho a sequência de que precisa. Uma explicação condensada demais oculta pressupostos; uma coleção de fragmentos isolados torna difícil entender como os assuntos se relacionam.

Essa dificuldade se agrava quando o estudo acontece durante deslocamentos ou entre trabalho, aulas e outras atividades. Há pouco tempo contínuo, interrupções e conexão nem sempre disponível. Além de compreender o assunto, a pessoa precisa recuperar o contexto e localizar o ponto em que parou.

O AraLearn organiza o curso em etapas com continuidade entre si. Quando um assunto exige desenvolvimento maior, a autoria pode acrescentar etapas e explicações, preservando a profundidade definida para o público. A preocupação com o esforço decorrente da apresentação encontra fundamento na teoria da carga cognitiva, que relaciona exigências do conteúdo, conhecimento prévio e condições de processamento ([Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). O [modelo didático](modelo-didatico.md) desenvolve sua relação com a progressão do curso.

## Autoria com participação humana

A autoria se desenvolve em diálogo: a pessoa define o que pretende ensinar, a IA ajuda a propor e produzir, e a pessoa inspeciona o resultado e orienta as correções. Essa participação ao longo do processo costuma ser chamada de *human-in-the-loop*. No AraLearn, ela se concretiza no controle do escopo, na inspeção do material e de suas fontes e nas decisões humanas de revisão.

| Momento | Participação da pessoa autora | Apoio do aplicativo e da IA |
| --- | --- | --- |
| Definir o curso | estabelecer objetivo, público, materiais e alcance | organizar uma proposta de estrutura e explicitar dependências |
| Desenvolver o material | ajustar parâmetros e decidir a progressão | redigir explicações, compor representações e preparar atividades |
| Inspecionar | ler a sequência, resolver atividades e conferir fontes | apresentar o conteúdo salvo, seus vínculos e as observações pertinentes |
| Corrigir e revisar | decidir o que muda e declarar a revisão realizada | aplicar as alterações autorizadas e permitir nova conferência do resultado |

O escopo de atuação e os momentos de conversa podem variar. A pessoa pode acompanhar recortes pequenos ou autorizar um trabalho maior. Essa flexibilidade organiza a colaboração; a declaração de revisão continua dependente de uma decisão humana expressa sobre o conteúdo inspecionado. Produzir material, validar sua estrutura ou corrigir uma observação são operações distintas dessa declaração. O [guia de autoria pelo chat](criar-cursos-pelo-chat.md) apresenta o percurso, e [Explicação e revisão humana](explicacao-e-revisao-humana.md) explica como a decisão fica vinculada ao material salvo.

As diretrizes de interação humano–IA de [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai) oferecem fundamento para tornar capacidades e limites compreensíveis, facilitar correções e conservar o controle da pessoa. A orientação da [UNESCO (2023)](referencias.md#ref-unesco2023genai) situa a agência humana e a adequação pedagógica no uso de IA generativa em educação. No AraLearn, essas referências orientam decisões de projeto. Investigar se as pessoas de fato identificam problemas e exercem esse controle é uma questão de avaliação.

## Integrações e independência de modelos

Para que a conversa possa trabalhar sobre o curso, o AraLearn expõe operações autorizadas por dois caminhos. O [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) conecta aplicações de IA a ferramentas e dados externos. A [OpenAPI](https://spec.openapis.org/oas/latest.html) descreve, de forma padronizada, as operações de uma interface de programação de aplicações — uma API — acessível pela web.

Esses caminhos dão suporte à autoria conversacional: o assistente lê o estado corrente, propõe ou executa o trabalho autorizado e devolve conteúdo que pode ser inspecionado. O curso permanece no AraLearn, com estrutura e fontes próprias, mesmo quando a conversa termina. A pessoa pode retomá-lo em outra sessão.

A independência de modelos e fornecedores orienta a evolução do projeto. MCP e OpenAPI ajudam a separar as operações do curso do cliente que conduz a conversa, mas cada integração ainda precisa de configuração e verificação próprias. A documentação de [MCP](autoria-mcp.md) e de [OpenAPI e Actions](autoria-actions.md) delimita os canais disponíveis e suas condições atuais.

O aplicativo também oferece edição manual e [assistência contextual por IA](assistencia-por-ia.md). Nesse modo, a pessoa discute uma proposta junto do conteúdo, examina uma prévia e decide aplicá-la. Os contratos estruturais verificam se o material pode ser armazenado e apresentado; conferir sua correção factual e sua adequação didática faz parte da revisão humana.

## Fontes que acompanham o conteúdo

Um curso pode partir de materiais distintos, como uma ementa, uma apresentação, um livro ou um artigo. Cada material pode cumprir um papel diferente: delimitar assuntos, fornecer uma explicação, sustentar uma afirmação ou oferecer um caso para análise. A autoria precisa tornar esse papel explícito.

No AraLearn, uma fonte reúne a identificação da obra e os materiais associados. Uma **âncora** localiza um trecho pertinente, como uma página ou seção. O vínculo entre uma explicação ou unidade e a fonte registra de onde veio o conteúdo e qual trecho foi utilizado. Essa relação é a sua **proveniência**. O capítulo [Fontes, citações e referências](fontes-e-citacoes.md) desenvolve o registro, a atribuição e a consulta desses vínculos.

A pessoa autora pode confrontar o texto didático com a obra, avaliar se ela sustenta a afirmação e pedir uma correção. Ter uma referência cadastrada ou uma citação apresentada não substitui essa conferência. O material usado para definir o programa, por exemplo, não deve receber automaticamente a atribuição de fatos ensinados no curso.

## Unidade de organização do estudo

Um **curso** delimita a finalidade e o campo de estudo. Seus **módulos** reúnem conjuntos coerentes de assuntos, e as **lições** organizam progressões dentro desses conjuntos. Cada lição contém **microssequências didáticas**, formadas por **unidades de estudo** que desenvolvem um objetivo próximo por meio de explicações, exemplos e práticas.

A microssequência mantém um contexto comum sem exigir que toda a lição seja apresentada de uma vez. Uma unidade contribui para esse avanço e precisa continuar inteligível em sua posição no percurso. A relação entre os níveis e os critérios de progressão está no [modelo didático](modelo-didatico.md).

A **explicação compartilhada** é o texto-base da microssequência. Produzida durante a autoria, desenvolve pressupostos, conceitos, relações, exemplos e fontes que fundamentam o conjunto. Pode ser elaborada e revisada antes das unidades. As decisões de desenho orientam a produção dessas unidades, que conservam a configuração instrucional e editorial aplicada e a referência à base utilizada.

Durante o estudo, a explicação permanece acessível a partir das unidades, inclusive das práticas. Abri-la conserva o ponto do percurso e consulta conteúdo já salvo. Sua autoria, composição, fontes e revisão são tratadas em [Explicação e revisão humana](explicacao-e-revisao-humana.md); a relação entre decisões e unidades está em [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md).

## Teoria progressiva, e não teoria resumida

O conteúdo deve partir do repertório previsto para o público. Quando um conceito é novo, a sequência precisa situar o problema, introduzir o vocabulário e construir as relações necessárias antes de exigir seu uso.

Exemplos resolvidos tornam visíveis decisões intermediárias que um resultado final pode ocultar ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples)). O apoio pode ser retirado gradualmente conforme a tarefa passa a exigir mais trabalho do estudante ([Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Analogias ajudam na aproximação inicial quando suas correspondências e limites estão claros.

Os [parâmetros de autoria](parametros-de-autoria.md) permitem expressar escolhas sobre o desenvolvimento das ideias, a prática e a apresentação. A pessoa pode deixar uma decisão para calibração contextual, fixar um valor ou estabelecer uma condição de pesquisa. O curso conserva a diferença entre a intenção e a configuração aplicada ao conteúdo. O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md) explica cada decisão e seus limites.

## Prática como parte da explicação

As atividades devem corresponder ao que o estudante precisa aprender a fazer. Distinguir duas situações, justificar uma relação e calcular um resultado exigem práticas diferentes. O planejamento escolhe as operações e a variedade de casos pertinentes ao objetivo, em vez de adotar uma quantidade universal de exercícios.

O retorno pode indicar a resposta esperada, explicar o raciocínio e tornar um erro compreensível. A pesquisa sobre prática de recuperação e retorno formativo sustenta seu interesse educacional e delimita condições de uso ([Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Shute (2008)](referencias.md#ref-shute2008feedback)). No produto, o modo de resposta determina que conferências podem ser feitas automaticamente. Uma resposta aberta pode ser comparada com uma orientação, sem que o aplicativo avalie automaticamente seu significado.

## Componentes e representações

O conteúdo pode usar texto, áudio e representações visuais. Uma tabela torna comparáveis informações em linhas e colunas; um fluxograma evidencia etapas e decisões; um gráfico permite examinar uma relação quantitativa. As atividades podem pedir preenchimento de lacunas, seleção de alternativas, ordenação ou resposta aberta. Ferramentas como a calculadora apoiam tarefas em que o cálculo serve ao raciocínio.

A escolha depende da função de cada representação. Quando duas formas expressam o mesmo assunto, o curso precisa explicar como elas se correspondem. O quadro DeFT, de [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft), relaciona desenho, função e tarefas envolvidas no uso de múltiplas representações. A [fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md) aprofunda essas escolhas.

Cada forma de apresentação é implementada por um **componente didático**, que define como organizar, exibir e, quando pertinente, manipular o conteúdo. Componentes distribuídos em pacotes próprios podem evoluir sem reescrever o percurso inteiro. O capítulo [Componentes didáticos](componentes-didaticos.md) explica essa separação e as responsabilidades de legibilidade, interação e validação. [Áudio](audio.md) e [Ferramentas de cálculo e consulta](ferramentas-calculo-e-consulta.md) apresentam seus usos específicos.

## Interação que preserva orientação e contexto

A pessoa precisa reconhecer onde está, o que está lendo ou alterando e como voltar. O AraLearn usa a estrutura do curso como referência entre estudo e autoria, mantém o contexto junto das ações e procura preservar foco e posição após uma interrupção.

A organização do conteúdo, de suas relações e dos nomes usados para encontrá-lo constitui a **arquitetura da informação**; a navegação oferece caminhos pela interface para acessar essa organização ([Cardello, 2014](https://www.nngroup.com/articles/ia-vs-navigation/)). No AraLearn, os níveis do curso orientam esses caminhos entre estudo e autoria.

A **visibilidade do estado** comunica o que está acontecendo e o resultado das ações ([Harley, 2018](https://www.nngroup.com/articles/visibility-system-status/)). Ela ajuda a distinguir, por exemplo, uma alteração ainda no rascunho de outra já salva. A **divulgação progressiva** mantém as ações mais frequentes em evidência e apresenta opções especializadas quando solicitadas ([Nielsen, 2006](https://www.nngroup.com/articles/progressive-disclosure/)). O [sistema visual](sistema-visual.md) explica como essas escolhas orientam os controles e os percursos do aplicativo.

O estudo privilegia o conteúdo e a continuidade. A autoria oferece a inspeção da estrutura, das explicações, das fontes e das configurações junto do objeto pertinente. O [uso do aplicativo](uso-do-app.md) apresenta a navegação, e os guias do [estudante](guia-estudante.md) e do [professor e autor](guia-professor-autor.md) desenvolvem as tarefas de cada contexto.

## Continuidade entre dispositivo e servidor

O aplicativo funciona no navegador e pode ser instalado no celular. O conteúdo de cursos já carregados permanece no dispositivo, permitindo ler, praticar e retomar o estudo sem conexão. Arquivos e serviços externos dependem de sua própria disponibilidade; abrir um curso ainda não obtido e gravar alterações autorais exige rede.

Há duas responsabilidades complementares. O servidor conserva os dados compartilhados e verifica quem pode acessá-los ou alterá-los. O dispositivo conserva uma cópia para estudo e o estado pessoal necessário à continuidade. Quando a rede retorna, os dados pertinentes podem ser sincronizados. [Persistência relacional](persistencia-relacional.md) explica armazenamento, filas, atualização e conflitos; [Arquitetura](arquitetura.md) situa esses mecanismos no sistema.

O estado pessoal permite responder a perguntas como “onde continuar?” e “quais unidades marquei para rever?”. O aplicativo não transforma navegação, conclusão ou resposta em uma medida automática de atenção ou domínio. A opção de limitar a coleta à finalidade funcional é desenvolvida em [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md), em diálogo com a discussão sobre responsabilidade e interpretação de dados educacionais ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical)).

## Propriedade, acesso e revisão

Todo curso nasce privado e possui uma pessoa proprietária, responsável por sua edição e por definir o acesso. Ela pode compartilhar a leitura com contas identificadas ou tornar o curso público. A permissão para copiar o curso e a disponibilidade de seus arquivos são decisões próprias. O [guia de autoria](guia-professor-autor.md) apresenta essas escolhas.

Cada explicação e unidade pode receber uma marca de revisão humana ligada ao conteúdo salvo. Uma mudança material desatualiza a marca correspondente. Por padrão, quem tem acesso pode estudar o conteúdo completo salvo; a pessoa proprietária pode escolher disponibilizar somente conteúdo revisado. O compromisso de inspecionar o material e a política de disponibilização são, portanto, decisões relacionadas, com efeitos distintos no aplicativo.

## Públicos, investigação e limites

O AraLearn atende pessoas que estudam por conta própria e autores que precisam preparar material para um público definido. Graduação, preparação para concursos, educação a distância, treinamento profissional e estudo no trabalho são contextos possíveis. A aprendizagem no trabalho depende também das oportunidades e condições do ambiente ([Tynjälä (2008)](referencias.md#ref-tynjala2008workplace)). Organizar e compartilhar material pode apoiar processos de gestão do conhecimento, cujo alcance envolve práticas organizacionais mais amplas que as funções de um aplicativo ([Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge)).

Para educadores e pesquisadores, o curso permite examinar a relação entre intenção, material produzido, fontes e intervenções humanas. Para engenheiros, os contratos e a implementação permitem verificar como essas relações são preservadas. Uma adoção institucional exige ainda examinar [privacidade](privacidade.md), [operação e implantação](implantacao.md) e adequação ao público e às tarefas. O produto não oferece gestão de matrículas, competências ou certificação.

A investigação pode estudar o esforço de autoria, a identificação de erros, a qualidade das correções, a compreensão do percurso e os efeitos sobre a aprendizagem. A confiança na IA precisa corresponder à sua capacidade na tarefa, e aceitar uma sugestão não demonstra que houve inspeção crítica ([Lee e See (2004)](referencias.md#ref-lee2004trust); [Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation)). A [revisão de literatura](revisao-de-literatura.md) reúne esses fundamentos e suas controvérsias.

O [guia de investigação](guia-pesquisador.md) e o [protocolo de avaliação](protocolo-avaliacao-artefato.md) orientam perguntas, instrumentos e critérios de análise. O funcionamento pode ser demonstrado por testes de software; usabilidade e resultados educacionais requerem avaliação com pessoas em condições definidas. A documentação conserva essa distinção para que o artefato possa ser estudado, criticado e aperfeiçoado.

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge): Maryam Alavi; Dorothy E. Leidner (2001). **Review: Knowledge Management and Knowledge Management Systems: Conceptual Foundations and Research Issues.** *MIS Quarterly*, 25(1), p. 107–136.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Lee e See (2004)](referencias.md#ref-lee2004trust): John D. Lee; Katrina A. See (2004). **Trust in Automation: Designing for Appropriate Reliance.** *Human Factors*, 46(1), p. 50–80.
- [Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation): Raja Parasuraman; Dietrich H. Manzey (2010). **Complacency and Bias in Human Use of Automation: An Attentional Integration.** *Human Factors*, 52(3), p. 381–410.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Tynjälä (2008)](referencias.md#ref-tynjala2008workplace): Päivi Tynjälä (2008). **Perspectives into Learning at the Workplace.** *Educational Research Review*, 3(2), p. 130–154.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
