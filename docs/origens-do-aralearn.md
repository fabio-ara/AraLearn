# Origens do AraLearn

## Antes da universidade

Desde a adolescência, eu frequentava bibliotecas e lia muito por interesse próprio. Meu interesse inicial era literatura de ficção, incluindo clássicos, e depois passei a ler também filosofia e obras de outras áreas das humanidades.

Na preparação para o vestibular, surgiu um problema que voltaria em outros momentos da minha vida. Eu precisava adquirir uma formação ampla, mas nem sempre conseguia começar pelos materiais mais difíceis. Procurava então fontes diferentes sobre o mesmo assunto, recorria a comentadores, apostilas e resumos e também produzia meus próprios resumos. Depois de formar uma compreensão inicial, conseguia avançar para textos mais densos.

Isso ocorreu antes de *smartphones* com acesso contínuo à internet fazerem parte do cotidiano. Encontrar e reunir materiais exigia mais preparação, e estudar um assunto novo frequentemente envolvia construir também o caminho pelo qual eu conseguiria compreendê-lo.

## Os primeiros usos do Anki

Entre 2009 e 2013, fiz Bacharelado em Letras, com habilitação em Linguística, na [Universidade de São Paulo (USP)](https://www5.usp.br/institucional/a-usp/). Nessa época eu já conhecia e usava o [Anki](https://apps.ankiweb.net/). Usava *flashcards*: uma pergunta, pista ou item era apresentado primeiro, e a resposta vinha depois.

Um exemplo era a memorização de *kanji*, logogramas de origem chinesa utilizados na escrita japonesa. Para estudá-los, eu precisava associar a forma gráfica, os significados e diferentes leituras de muitos caracteres, e essas associações se perdiam com facilidade sem revisão. O Anki era útil para esse tipo de memorização, mas ainda não ocupava uma posição central na minha forma de estudar.

Naquele período, *smartphones* ainda não faziam parte da minha rotina de estudo. O estudo no celular viria mais tarde com o [AnkiDroid](https://ankidroid.org/), aplicativo para Android que me permitiria acessar os mesmos *decks* do Anki, isto é, suas coleções de cartões.

Entre 2014 e 2020, durante o Bacharelado em Ciências Biológicas na USP, encontrar formas mais eficientes de estudar ganhou muito mais importância. As disciplinas envolviam grande quantidade de conceitos e terminologia especializada, leituras frequentemente em inglês e livros que podiam chegar a centenas ou milhares de páginas. Passei então a usar *flashcards* com muito mais intensidade.

Ao mesmo tempo, continuei procurando materiais mais acessíveis para começar a estudar assuntos difíceis. Por iniciativa própria, encontrei materiais da [Universidade Virtual do Estado de São Paulo (UNIVESP)](https://apps.univesp.br/repositorio/) e [materiais do CEDERJ](https://canal.cecierj.edu.br/conteudo/graduacao/). Em geral, eram menores, estavam em português e eram mais fáceis de percorrer. Eles me ofereciam uma primeira visão do assunto; com essa base, tornava-se mais fácil voltar às fontes extensas e aprofundadas.

## Idiomas, personalização e automação

O estudo de idiomas continuou em paralelo. Usei [Duolingo](https://www.duolingo.com/) e [LingoDeer](https://www.lingodeer.com/), que ofereciam cursos já preparados e reduziam bastante o trabalho necessário antes de começar a estudar. Quando eu queria escolher o conteúdo, acrescentar informações de outras fontes ou organizá-lo de outra forma, porém, acabava voltando ao Anki.

A liberdade de personalização resolvia uma parte do problema, mas criava outra. Produzir *flashcards* personalizados e suficientemente ricos consumia cada vez mais tempo. Comecei então a automatizar a preparação do material.

Foi nesse momento que uma formação anterior ganhou importância prática. Entre 2006 e 2007, eu havia cursado o Técnico em Informática na [Escola Técnica Estadual de São Paulo (ETESP)](https://etecsp.cps.sp.gov.br/). Na ocasião, a principal linguagem que estudei foi [Visual Basic 6.0](https://en.wikipedia.org/wiki/Visual_Basic_(classic)), com a qual eu montava interfaces graficamente, colocando controles em formulários, e escrevia o código executado em resposta a eventos, como o clique em um botão.

No curso, também tive contato com [HTML](https://developer.mozilla.org/pt-BR/docs/Learn_web_development/Core/Structuring_content/Basic_HTML_syntax), [CSS](https://developer.mozilla.org/pt-BR/docs/Web/CSS) e [JavaScript](https://developer.mozilla.org/pt-BR/docs/Learn_web_development/Core/Scripting), tecnologias usadas, respectivamente, para estruturar páginas, definir sua apresentação e programar comportamentos no navegador. Anos depois, a familiaridade com essas tecnologias, embora pouco aprofundada, permitiu que eu explorasse uma possibilidade que o próprio Anki já oferecia: usá-las na construção dos *flashcards*.

Boa parte do trabalho acontecia antes da importação. No [Notepad++](https://notepad-plus-plus.org/), eu usava intensamente [regex](https://en.wikipedia.org/wiki/Regular_expression) (*regular expressions*, “expressões regulares”) para localizar, extrair e transformar padrões de texto em grandes quantidades de conteúdo. Em alguns casos, abria e modificava dezenas ou centenas de arquivos de uma vez.

Parte do resultado era organizada em arquivos CSV, um formato simples para armazenar dados tabulares como texto, muitas vezes com auxílio do [LibreOffice Calc](https://help.libreoffice.org/latest/pt-BR/text/scalc/main0503.html?DbPAR=CALC). Esses arquivos serviam como uma base intermediária para os dados que depois seriam importados para o Anki.

Depois da importação, o JavaScript dos próprios *flashcards* podia recuperar os campos — as partes nomeadas dos dados de cada cartão — e relacionar informações que eu havia preparado anteriormente com regex e CSV.

Outra operação era construir endereços da Web a partir desses dados para criar links diretos para páginas externas. No estudo de japonês, usei dessa forma o [guia de gramática de Tae Kim](https://guidetojapanese.org/learn/grammar/); no de chinês, a [Chinese Grammar Wiki](https://resources.allsetlearning.com/chinese/grammar/Main_Page).

Nessa fase, antes da popularização comercial da IA generativa, meu interesse por [processamento de linguagem natural](https://en.wikipedia.org/wiki/Natural_language_processing) também era muito forte. Lidava com problemas de *parsing* de textos em japonês e mandarim: como reconhecer automaticamente suas unidades linguísticas e a maneira como se organizam. No caso do japonês, explorava o [MeCab](https://taku910.github.io/mecab/), um analisador morfológico que segmenta o texto e identifica informações gramaticais sobre as unidades encontradas.

Outro problema era estudar aspectos da pronúncia japonesa que ultrapassavam sons isolados, sobretudo os padrões de acento e as variações de altura da voz ao longo das frases. Esse é um tema da [fonologia suprassegmental](https://www.cambridge.org/core/books/abs/introducing-phonetic-science/suprasegmentals/3418DF78D7466EC8D9F0127DA5108D22). Eu recorria ao [tutor de prosódia Suzuki-kun](https://www.gavo.t.u-tokyo.ac.jp/ojad/eng/phrasing/index), do [Online Japanese Accent Dictionary (OJAD)](https://www.gavo.t.u-tokyo.ac.jp/ojad/pages/notes), que estima o padrão de acento de um texto e apresenta a curva melódica de sua leitura.

Serviços de [síntese de voz do Microsoft Azure](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech) permitiam também gerar áudio automaticamente para o material.

Mais tarde, passei a usar o [AnkiWeb](https://docs.ankiweb.net/syncing.html), serviço online do Anki para sincronizar uma coleção entre dispositivos. Por meio dele, eu mantinha meus *decks* sincronizados entre o Anki no computador e o AnkiDroid no celular. Depois da sincronização, o material permanecia disponível no dispositivo para estudo.

Nesse ponto, produzir material no Anki já significava transformar fontes e dados em conteúdo pronto para estudar. Eu automatizava a preparação, controlava o comportamento dos *flashcards* e acrescentava recursos como áudio ou links de consulta. A finalidade da programação era diminuir o trabalho manual necessário para produzir conteúdo personalizado para meu próprio estudo.

## Dos idiomas a outros campos de estudo

Durante um período de desemprego, adaptei práticas semelhantes para estudar Administração e Direito na preparação para concursos públicos. Os assuntos eram diferentes, mas reaparecia a necessidade de selecionar grandes volumes de material, reorganizá-los e produzir algo que eu conseguisse estudar em etapas.

Os *flashcards* continuavam úteis, mas o problema já ultrapassava a memorização de itens isolados. Eu precisava manter relações entre conceitos, explicações e partes de materiais extensos. Quanto mais procurava adequar o conteúdo às minhas necessidades, maior se tornava o trabalho de preparação.

Eu continuava diante de uma escolha que já conhecia do estudo de idiomas. Materiais prontos permitiam começar rapidamente; materiais próprios ofereciam mais controle, mas exigiam muito mais trabalho para serem produzidos.

## Automação em situação real

Mais tarde, já trabalhando na [CETESB](https://cetesb.sp.gov.br/), passei a lidar intensamente com automação de processos administrativos. As automações agora participavam de rotinas reais de trabalho, e não apenas da preparação de material que eu mesmo usaria.

Em várias dessas soluções, usei [Visual Basic for Applications (VBA)](https://learn.microsoft.com/office/vba/library-reference/concepts/getting-started-with-vba-in-office), uma linguagem de programação incorporada aos aplicativos do Microsoft Office para automatizar tarefas e controlar seu comportamento. O contato anterior com Visual Basic facilitou essa retomada: conhecimentos de programação que eu ainda dominava de forma incipiente na escola técnica voltavam a ter aplicação em problemas concretos de trabalho.

Automatizar processos usados no dia a dia exigia compreender as regras envolvidas, validar entradas e resultados e manter sistemas que continuavam em uso enquanto procedimentos mudavam. Essa necessidade aumentou meu interesse em aprofundar os conhecimentos de programação e engenharia de software.

## Aprofundar a formação em tecnologia

Quando passei a procurar uma formação mais ampla em tecnologia da informação, busquei também cursos livres e de aperfeiçoamento profissional com tutoria presencial. Os cursos do [SENAI](https://www.senai.portaldaindustria.com.br/) tiveram um papel importante nesse percurso.

Também voltei à UNIVESP, agora como estudante. Os materiais produzidos para a universidade tinham sido muito úteis quando eu estudava Ciências Biológicas na USP, e essa boa experiência influenciou minha decisão de ingressar no [Bacharelado em Tecnologia da Informação](https://univesp.br/bacharelado-em-tecnologia-da-informacao/) da própria instituição.

Estudar um curso completo era diferente de consultar alguns de seus materiais isoladamente. A instituição oferecia um percurso e apoio, enquanto a organização cotidiana continuava dependendo de mim: distribuir o tempo, acompanhar assuntos diferentes e estabelecer relações entre conteúdos apresentados separadamente.

Foi nessa fase que uma dificuldade do aprendizado de desenvolvimento de software ficou especialmente evidente. Eu já tinha alguma experiência com programação para o navegador, mas precisava visualizar o percurso completo de uma aplicação: a interface com a qual a pessoa interage (*frontend*) envia pedidos à lógica executada no servidor (*backend*), que por sua vez lê e grava dados.

Também precisei aprender a acompanhar a evolução do próprio código. O [Git](https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control) registrava as mudanças ao longo do tempo; o [GitHub](https://docs.github.com/en/get-started/start-your-journey/what-is-github) oferecia um ambiente para armazenar os projetos e trabalhar com seus repositórios.

O que me surpreendia era menos a dificuldade de uma tecnologia isolada do que a quantidade de relações necessárias para construir uma aplicação completa. Saber reproduzir uma página, escrever uma função ou acompanhar um exemplo de banco de dados não significava saber como organizar essas partes num sistema.

Havia muitos cursos e tutoriais para cada assunto. Eu conseguia acompanhar explicações locais e reproduzir exemplos, mas continuava com dificuldade para relacionar os conhecimentos separados. Essa situação costuma ser chamada informalmente de [*tutorial hell*](https://www.reddit.com/r/learnprogramming/comments/qrlx5m/what_exactly_is_tutorial_hell/): seguir sucessivos tutoriais e conseguir reproduzir o que eles mostram sem desenvolver ainda a autonomia necessária para construir algo próprio.

Mesmo dentro de uma formação organizada, eu precisava construir parte dessas relações, decidir quando procurar outras fontes e administrar meu próprio estudo. Isso se aproximava, em alguns aspectos, de problemas que eu já encontrava havia anos estudando por conta própria.

## Do estudo de software ao AraLearn

À medida que meus conhecimentos de desenvolvimento de software aumentaram, comecei a transformar essas práticas numa aplicação própria. O AraLearn surgiu inicialmente como uma maneira de organizar e automatizar a produção de material para meu estudo autodidata.

Mais tarde, ingressei no curso de Tecnologia em Análise e Desenvolvimento de Sistemas no [Instituto Federal de São Paulo (IFSP)](https://www.ifsp.edu.br/), que atualmente frequento no período noturno. O que eu aprendia na graduação ajudava a construir o aplicativo; os problemas encontrados durante o desenvolvimento, por sua vez, me obrigavam a compreender melhor as tecnologias que estava estudando.

No início, muitas soluções ainda estavam próximas da experiência com *flashcards*. Com o tempo, o conteúdo deixou de ser pensado apenas dessa forma e começou a ser organizado em unidades de estudo inseridas em estruturas maiores. Eu já não tentava somente automatizar a produção de um formato específico. O próprio caminho de estudo — sua organização, produção, modificação e retomada — tornou-se parte do problema que o aplicativo precisava resolver.

## Grandes modelos de linguagem e novas formas de autoria

Os [grandes modelos de linguagem](https://en.wikipedia.org/wiki/Large_language_model) (*large language models*, LLMs) vieram depois. São modelos de inteligência artificial capazes de trabalhar com linguagem, gerando, transformando e analisando textos a partir das instruções e do contexto que recebem.

Num primeiro momento, o AraLearn começou a chamar esses modelos por meio de uma [interface de programação de aplicações](https://developer.mozilla.org/en-US/docs/Glossary/API) (*application programming interface*, API). Uma API define como um programa pode solicitar uma operação a outro. Assim, o AraLearn podia enviar conteúdo a um serviço de LLM e receber de volta, por exemplo, uma explicação gerada ou uma revisão.

Mais tarde, surgiu também o movimento no sentido contrário: aplicações que usam LLMs puderam chamar operações do próprio AraLearn. Assim, uma conversa autorizada podia consultar a estrutura do curso e usar funções oferecidas pelo sistema. O projeto adotou dois caminhos de conexão: OpenAPI com Actions e MCP.

Com a [OpenAPI Specification](https://www.openapis.org/what-is-openapi), o AraLearn descreve em formato padronizado as operações que oferece, os dados que cada uma recebe e as respostas que devolve. Nos testes atuais desse canal, um GPT personalizado importa a descrição e usa [Actions](https://developers.openai.com/api/docs/actions/introduction), chamadas a serviços externos feitas durante a conversa, para executar essas operações no AraLearn.

O [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) oferece outro caminho. Uma aplicação compatível obtém do AraLearn as ferramentas disponíveis e pode utilizá-las durante a conversa.

Em termos simples, primeiro o AraLearn passou a chamar a IA para gerar e revisar conteúdo. Depois, aplicações com IA também puderam chamar o AraLearn para trabalhar sobre seus cursos.

## O AraLearn hoje

Essa evolução levou o AraLearn além dos *flashcards*: o conteúdo passou a ser desenvolvido em unidades relacionadas dentro de um curso, e o próprio percurso de autoria e estudo tornou-se parte do aplicativo. Hoje o projeto funciona na web e no Android e oferece assistência por IA tanto na interface quanto por aplicações de conversa conectadas.

Minha experiência com educação a distância tornou outro aspecto do problema mais visível. Um curso formal já oferece conteúdo, apoio e um percurso. Ainda assim, o estudante precisa organizar o tempo, retomar assuntos interrompidos e procurar outra explicação quando o material disponível não basta.

Como o AraLearn nasceu de problemas do estudo autodidata, comecei a considerar sua utilidade também nesse contexto. A avaliação deverá estabelecer se, para quem e em que condições uma ferramenta desse tipo pode ajudar estudantes de cursos a distância a organizar, relacionar e retomar o próprio estudo.

Recentemente, ingressei no [Mestrado em Educação e Tecnologias Digitais (METD)](https://www.ie.ulisboa.pt/ensino/mestrados/mestrado-em-educacao-e-tecnologias-digitais-ead), do Instituto de Educação da Universidade de Lisboa. Procurei essa formação para aprofundar meus conhecimentos sobre design instrucional e tecnologia educacional e estudar com mais rigor questões que até então haviam surgido principalmente da minha experiência como estudante e do desenvolvimento do AraLearn.

Essas questões não são novas na minha vida. Antes mesmo da universidade, eu já procurava materiais mais acessíveis para chegar depois a textos difíceis. Mais tarde, os *flashcards* ajudaram a manter conhecimentos fáceis de esquecer, e a automação diminuiu o trabalho necessário para produzir materiais próprios. Ao estudar desenvolvimento de software, o problema reapareceu na dificuldade de relacionar conteúdos ensinados separadamente.

Hoje, essa questão se tornou ainda mais concreta. Concilio trabalho em tempo integral com diferentes formações. O tempo disponível para estudar é dividido entre assuntos e frequentemente interrompido. Retomar rapidamente o contexto, entender onde uma informação nova se encaixa e gastar menos tempo preparando o próprio estudo têm, por isso, importância prática no meu dia a dia.

Hoje, o desenvolvimento de software e o estudo sistemático de educação, design instrucional e tecnologia educacional fazem parte do mesmo projeto. A pergunta que continua me acompanhando é como reduzir o trabalho que fica entre ter acesso à informação e conseguir compreendê-la, relacioná-la ao que já sei e voltar a usá-la depois, especialmente quando o tempo para estudar é curto e fragmentado.
