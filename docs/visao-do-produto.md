# Visão do produto

O AraLearn é uma plataforma para estudo autodidata e criação de cursos com apoio de inteligência artificial (IA) generativa. A partir de um tema, de uma ementa ou de materiais já reunidos, uma pessoa pode construir um percurso que desenvolve o assunto e propõe oportunidades de prática.

O problema central está no trabalho que existe entre reunir informação e dispor de um percurso de estudo. Alguém precisa decidir o que vem primeiro, tornar as relações compreensíveis e conferir se o material produzido atende ao objetivo. No AraLearn, essas decisões acompanham o curso e podem ser examinadas durante a autoria. Por isso, além de servir ao estudo, o aplicativo constitui um artefato para investigar o desenho do material e a colaboração entre a pessoa autora e a IA.

## Problema educacional e problema de interação

Ter acesso a livros, aulas e respostas de um modelo de linguagem pode deixar ao estudante a tarefa de reconstruir sozinho a sequência de que precisa. Uma explicação condensada demais oculta pressupostos; uma coleção de fragmentos isolados torna difícil entender como os assuntos se relacionam.

Essa dificuldade se agrava quando o estudo acontece durante deslocamentos ou entre trabalho, aulas e outras atividades. Há pouco tempo contínuo, interrupções e conexão nem sempre disponível. Além de compreender o assunto, a pessoa precisa recuperar o contexto e localizar o ponto em que parou.

O AraLearn organiza o curso em etapas com continuidade entre si. Quando um assunto exige desenvolvimento maior, a autoria pode acrescentar etapas e explicações, preservando a profundidade definida para o público.

A teoria da carga cognitiva examina as exigências impostas à capacidade limitada de manter e relacionar informações durante uma tarefa. Ela distingue a dificuldade própria do conteúdo, que depende também do conhecimento prévio, do esforço adicional provocado pela apresentação. Uma explicação que obriga o estudante a procurar informações dispersas, por exemplo, acrescenta trabalho à compreensão do assunto ([Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). Essa distinção orienta a organização de etapas compreensíveis e relacionadas entre si. O [modelo didático](modelo-didatico.md) desenvolve sua relação com a progressão do curso.

## Autoria com participação humana

A autoria se desenvolve em diálogo: a pessoa define o que pretende ensinar, a IA ajuda a propor e produzir, e a pessoa inspeciona o resultado e orienta as correções. Essa participação ao longo do processo costuma ser chamada de *human-in-the-loop*. No AraLearn, ela se concretiza no controle do escopo, na inspeção do material e de suas fontes e nas decisões humanas de revisão.

| Momento | Participação da pessoa autora | Apoio do aplicativo e da IA |
| --- | --- | --- |
| Definir o curso | estabelecer objetivo, público, materiais e alcance | organizar uma proposta de estrutura e explicitar dependências |
| Desenvolver o material | escolher como apresentar o assunto e decidir a progressão | redigir explicações, compor representações e preparar atividades |
| Inspecionar | ler a sequência, resolver atividades e conferir fontes | apresentar o conteúdo salvo, seus vínculos e as observações pertinentes |
| Corrigir e revisar | decidir o que muda e declarar a revisão realizada | aplicar as alterações autorizadas e permitir nova conferência do resultado |

O escopo de atuação e os momentos de conversa podem variar. A pessoa pode acompanhar recortes pequenos ou autorizar um trabalho maior. Em qualquer cadência, a declaração de revisão registra uma decisão humana expressa sobre o conteúdo inspecionado. Produção, validação estrutural e correção pertencem a outros momentos do trabalho. O [guia de autoria pelo chat](criar-cursos-pelo-chat.md) apresenta o percurso, e [Explicação e revisão humana](explicacao-e-revisao-humana.md) explica como a decisão fica vinculada ao material salvo.

As diretrizes de interação humano–IA de [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai) oferecem fundamento para tornar capacidades e limites compreensíveis, facilitar correções e conservar o controle da pessoa. A orientação da [UNESCO (2023)](referencias.md#ref-unesco2023genai) trata da agência humana — a capacidade de decidir e conduzir o próprio trabalho — e da adequação pedagógica no uso de IA generativa em educação. No AraLearn, essas referências orientam decisões de projeto. A avaliação examina como as pessoas identificam problemas e exercem esse controle durante o uso.

## Integrações e independência de modelos

Para que um assistente consulte um curso ou grave uma alteração autorizada, a aplicação em que ocorre a conversa precisa solicitar essas operações ao AraLearn. O [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) conecta aplicações de IA a ferramentas e dados externos. A [OpenAPI](https://spec.openapis.org/oas/latest.html) descreve de forma padronizada as operações oferecidas por um serviço.

Nos dois casos, as operações pertencem ao AraLearn, e a aplicação de conversa atua como interface autorizada. O curso permanece no aplicativo, com estrutura e fontes próprias, e pode ser retomado em outra sessão ou por outra aplicação compatível. Essa separação orienta a independência de modelos e fornecedores. A documentação de [MCP](autoria-mcp.md) e de [OpenAPI e Actions](autoria-actions.md) apresenta a configuração e as condições atuais de cada canal.

O aplicativo também oferece edição manual e [assistência por IA](assistencia-por-ia.md) junto do conteúdo. Nesse percurso, a pessoa discute uma proposta, examina a prévia e decide se a leva ao rascunho. A validação automática confere o formato que o AraLearn consegue guardar e apresentar; a revisão humana examina a correção factual e a adequação didática.

## Fontes que acompanham o conteúdo

Um curso pode partir de materiais distintos. Uma ementa costuma delimitar o que deve ser ensinado; um livro pode fundamentar uma explicação; uma apresentação pode fornecer um caso ou uma forma de organizar o assunto. Durante a autoria, esse papel precisa ficar explícito para que cada material seja usado de acordo com o que oferece.

Para que a pessoa possa voltar ao material que sustenta o conteúdo, o AraLearn registra a obra como uma **fonte**. Quando há uma localização pertinente, pode indicar nela uma **âncora**, como uma página ou seção. O vínculo da fonte — e, quando houver, dessa localização — com uma explicação ou unidade documenta a origem do conteúdo. Essa relação é a sua **proveniência**. O capítulo [Fontes, citações e referências](fontes-e-citacoes.md) desenvolve o registro, a atribuição e a consulta desses vínculos.

A pessoa autora confronta o texto didático com a obra, avalia se ela sustenta a afirmação e pede uma correção quando necessário. Essa conferência considera tanto o trecho indicado quanto o papel do material. Uma ementa usada para definir o programa, por exemplo, só recebe a atribuição dos fatos que efetivamente sustenta.

## Unidade de organização do estudo

O conteúdo é dividido em vários níveis, do curso completo às unidades de estudo que aparecem na tela. À medida que o alcance diminui, torna-se possível tratar um avanço próximo sem perder sua relação com o percurso maior.

Nesse conjunto, a **microssequência didática** reúne unidades que desenvolvem um objetivo delimitado e compartilham o mesmo contexto. Cada unidade contribui para esse avanço e precisa continuar inteligível em sua posição no percurso. A relação entre os níveis e os critérios de progressão está no [modelo didático](modelo-didatico.md).

A **explicação** é o texto-base da microssequência. Produzida durante a autoria, ela desenvolve o assunto e o vincula às fontes que fundamentam o conjunto. Pode ser elaborada e revisada antes das unidades. Cada unidade conserva as escolhas feitas na sua produção e a referência à base utilizada.

Durante o estudo, a explicação permanece acessível a partir das unidades, inclusive das práticas. Abri-la conserva o ponto do percurso e consulta conteúdo já salvo. Sua autoria, composição, fontes e revisão são tratadas em [Explicação e revisão humana](explicacao-e-revisao-humana.md); a relação entre decisões e unidades está em [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md).

## Teoria construída progressivamente

O conteúdo deve partir do repertório previsto para o público. Quando um conceito é novo, a sequência precisa situar o problema, introduzir o vocabulário e construir as relações necessárias antes de exigir seu uso.

Exemplos resolvidos tornam visíveis decisões intermediárias que um resultado final pode ocultar ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples)). O apoio pode ser retirado gradualmente conforme a tarefa passa a exigir mais trabalho do estudante ([Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Analogias ajudam na aproximação inicial quando suas correspondências e limites estão claros.

Os [parâmetros de autoria](parametros-de-autoria.md) permitem expressar escolhas sobre o desenvolvimento das ideias, a prática e a apresentação. Ao preparar um assunto novo, por exemplo, a pessoa pode pedir explicações desenvolvidas e exemplos resolvidos. Essa orientação expressa sua **intenção** para a produção. Cada unidade conserva a **configuração aplicada**, isto é, as escolhas efetivamente usadas para produzi-la. Uma nova intenção passa a orientar os trabalhos seguintes; as unidades salvas conservam a configuração usada em sua produção até que sejam alteradas.

A pessoa pode fixar uma decisão ou deixar que ela seja ajustada ao público, ao conteúdo e à tarefa; esse ajuste é chamado de **calibração contextual**. Uma investigação também pode estabelecer escolhas que devem permanecer fixas para comparar materiais produzidos em condições diferentes. O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md) explica cada decisão e seus limites.

## Prática como parte da explicação

As atividades devem corresponder ao que o estudante precisa aprender a fazer. Distinguir duas situações, justificar uma relação e calcular um resultado exigem práticas diferentes. O objetivo e a operação esperada orientam a quantidade de oportunidades e a variedade dos casos.

Tentar recordar o que se estudou antes de consultar a resposta é uma **prática de recuperação**. Essa prática pode contribuir para a aprendizagem; sua escolha e suas condições de uso precisam corresponder ao objetivo do curso ([Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval)).

Depois da tentativa, o retorno pode indicar a resposta esperada, explicar o raciocínio e tornar um erro compreensível. Seu papel é formativo quando ajuda o estudante a rever o que fez e melhorar sua compreensão ou seu desempenho ([Shute (2008)](referencias.md#ref-shute2008feedback)). No produto, o modo de resposta determina que conferências podem ser feitas automaticamente. Nas respostas abertas, a pessoa compara o que escreveu com a orientação disponível e examina seu significado.

## Componentes e representações

O conteúdo pode combinar formas de apresentação e atividade conforme a relação que precisa tornar compreensível. Uma tabela permite comparar informações, um fluxograma acompanha etapas e um áudio oferece outra forma de acesso ao conteúdo. As atividades e ferramentas seguem a tarefa que o estudante precisa realizar.

A escolha depende da função de cada representação. Quando duas formas expressam o mesmo assunto, o curso precisa explicar como elas se correspondem. O modelo de [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft) relaciona a forma como as representações são desenhadas, a função que cumprem e as tarefas necessárias para utilizá-las. A [fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md) aprofunda essas escolhas.

Cada forma de apresentação é implementada por um **componente didático**, que define como organizar, exibir e, quando pertinente, manipular o conteúdo. O capítulo [Componentes didáticos](componentes-didaticos.md) explica como essas formas de apresentação podem evoluir e quais cuidados exigem com legibilidade, interação e validação. [Áudio](audio.md) e [Ferramentas de cálculo e consulta](ferramentas-calculo-e-consulta.md) apresentam seus usos específicos.

## Interação que preserva orientação e contexto

A pessoa precisa reconhecer onde está, o que está lendo ou alterando e como voltar. O AraLearn usa a estrutura do curso como referência entre estudo e autoria, mantém o contexto junto das ações e procura preservar foco e posição após uma interrupção.

A organização do conteúdo, de suas relações e dos nomes usados para encontrá-lo constitui a **arquitetura da informação**; a navegação oferece caminhos pela interface para acessar essa organização ([Cardello, 2014](https://www.nngroup.com/articles/ia-vs-navigation/)). No AraLearn, os níveis do curso orientam esses caminhos entre estudo e autoria.

A **visibilidade do estado** comunica o que está acontecendo e o resultado das ações ([Harley, 2018](https://www.nngroup.com/articles/visibility-system-status/)). Ela ajuda a distinguir, por exemplo, uma alteração ainda no rascunho de outra já salva. A **divulgação progressiva** mantém as ações mais frequentes em evidência e apresenta opções especializadas quando solicitadas ([Nielsen, 2006](https://www.nngroup.com/articles/progressive-disclosure/)). O [sistema visual](sistema-visual.md) explica como essas escolhas orientam os controles e os percursos do aplicativo.

O estudo privilegia o conteúdo e a continuidade. A autoria oferece a inspeção da estrutura, das explicações, das fontes e das configurações junto do objeto pertinente. O [uso do aplicativo](uso-do-app.md) apresenta a navegação, e os guias do [estudante](guia-estudante.md) e do [professor e autor](guia-professor-autor.md) desenvolvem as tarefas de cada contexto.

## Continuidade entre dispositivo e servidor

O aplicativo funciona no navegador e pode ser instalado no celular. O conteúdo de cursos já carregados permanece no dispositivo, permitindo ler, praticar e retomar o estudo sem conexão. Arquivos e serviços externos dependem de sua própria disponibilidade; abrir um curso ainda não obtido e gravar alterações autorais exige rede.

Há duas responsabilidades complementares. O servidor conserva os dados compartilhados e verifica quem pode acessá-los ou alterá-los. O dispositivo conserva uma cópia para estudo e o estado pessoal necessário à continuidade. Quando a rede retorna, os dados pertinentes podem ser sincronizados. [Persistência relacional](persistencia-relacional.md) explica armazenamento, filas, atualização e conflitos; [Arquitetura](arquitetura.md) situa esses mecanismos no sistema.

O estado pessoal permite responder a perguntas como “onde continuar?” e “quais unidades marquei para rever?”. Os registros de navegação, conclusão e resposta são usados para essa continuidade. Inferir atenção ou domínio exigiria outros dados e critérios. A opção de limitar a coleta à finalidade funcional é desenvolvida em [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md), em diálogo com a discussão sobre responsabilidade e interpretação de dados educacionais ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical)).

## Propriedade, acesso e revisão

Todo curso nasce privado e possui uma pessoa proprietária, responsável por sua edição e por definir o acesso. Ela pode compartilhar a leitura com contas identificadas ou tornar o curso público. A permissão para copiar o curso e a disponibilidade de seus arquivos são decisões próprias. O [guia de autoria](guia-professor-autor.md) apresenta essas escolhas.

Cada explicação e unidade pode receber uma marca de revisão humana ligada ao conteúdo salvo. Uma mudança material desatualiza a marca correspondente. Por padrão, quem tem acesso pode estudar o conteúdo completo salvo; a pessoa proprietária pode escolher disponibilizar somente conteúdo revisado. O compromisso de inspecionar o material e a política de disponibilização são, portanto, decisões relacionadas, com efeitos distintos no aplicativo.

## Públicos e contextos

O AraLearn atende pessoas que estudam por conta própria e autores que precisam preparar material para um público definido. Graduação, preparação para concursos e formação profissional são três contextos possíveis, entre outros percursos individuais ou institucionais. A aprendizagem no trabalho depende também das oportunidades e condições do ambiente ([Tynjälä (2008)](referencias.md#ref-tynjala2008workplace)). Organizar e compartilhar material pode apoiar processos de gestão do conhecimento, cujo alcance envolve práticas organizacionais mais amplas que as funções de um aplicativo ([Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge)).

O produto concentra-se na autoria e no estudo do conteúdo. Numa adoção institucional, a gestão de matrículas, competências e certificação permanece a cargo dos sistemas responsáveis por essas funções.

Educadores e pesquisadores podem examinar a relação entre a intenção da autoria e o material produzido. Engenheiros podem verificar como essas relações são preservadas nos dados e na implementação. Em uma adoção institucional, a análise inclui [privacidade](privacidade.md), [operação e implantação](implantacao.md) e adequação ao público e às tarefas. As [Capacidades e limites atuais](estado-atual-e-roadmap.md) delimitam o alcance vigente do produto.

## Avaliar o uso

A investigação pode estudar três pontos complementares: o trabalho de autoria, a compreensão do percurso e os efeitos sobre a aprendizagem. A confiança na IA precisa corresponder à sua capacidade na tarefa. Para examinar a qualidade da supervisão, a avaliação deve observar o processo de inspeção, e não apenas se a pessoa aceitou uma sugestão ([Lee e See (2004)](referencias.md#ref-lee2004trust); [Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation)). A [revisão de literatura](revisao-de-literatura.md) reúne esses fundamentos e suas controvérsias.

O [guia de investigação](guia-pesquisador.md) e o [protocolo de avaliação](protocolo-avaliacao-artefato.md) orientam perguntas, instrumentos e critérios de análise. O funcionamento pode ser demonstrado por testes de software; usabilidade e resultados educacionais requerem avaliação com pessoas em condições definidas.

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
