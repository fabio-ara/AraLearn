# Referências bibliográficas

Esta página apresenta, em formato legível, as fontes citadas na documentação do AraLearn. Os links de citação levam diretamente à entrada correspondente e conservam, em sua âncora, a chave usada pela bibliografia canônica.

O arquivo [`referencias.bib`](referencias.bib) é a fonte canônica dos metadados e permanece disponível para editores bibliográficos, processadores como Pandoc e outros fluxos acadêmicos. Esta página é gerada a partir dele; portanto, não deve ser editada manualmente.

## Como interpretar as entradas

Cada entrada informa autoria ou responsabilidade institucional, ano, título, veículo de publicação e identificadores persistentes disponíveis. O DOI é preferido como ligação estável; ISBN e endereço oficial são mantidos quando pertinentes.

## Como manter a bibliografia

1. Edite somente `referencias.bib` para acrescentar ou corrigir metadados.
2. Execute `npm run docs:references` para reconstruir esta página.
3. Nas páginas públicas, use o rótulo legível de autoria e ano com um link para a âncora `ref-<chave>`. Ao incorporar texto que ainda contenha citações Pandoc, `npm run docs:references:convert` realiza essa conversão de forma determinística.
4. Execute `npm run docs:references:check` antes de concluir a alteração. A conferência rejeita página gerada divergente, citação Pandoc exposta, chave desconhecida e rótulo de autoria ou ano desatualizado.

Como a chave permanece no destino de cada link, um processamento futuro pode recuperar a notação `[@chave]` sem inferir a fonte a partir do texto visível.

## Percursos temáticos de leitura

Os percursos abaixo oferecem entradas possíveis no corpus. A ordem é uma orientação de estudo, não uma classificação de qualidade. Função e limite são curadoria editorial; autoria, título, veículo e identificadores continuam derivados exclusivamente de `referencias.bib`.

### Aprendizagem e desenho instrucional

Comece pelos mecanismos que organizam planejamento, carga, prática e representação. A ordem vai do quadro geral às decisões mais específicas do AraLearn.

1. [Panadero (2017)](#ref-panadero2017selfregulated). **Função da leitura:** situa os ciclos de planejamento, monitoramento e reflexão em seis modelos de aprendizagem autorregulada. **Limite principal:** é uma revisão de modelos; não demonstra que controles de interface produzam autorregulação.
2. [Sweller et al. (1998)](#ref-sweller1998architecture). **Função da leitura:** introduz a arquitetura cognitiva usada para discutir demanda do desenho instrucional. **Limite principal:** a teoria não fornece um limite universal de tamanho para unidades de estudo.
3. [Ainsworth (2006)](#ref-ainsworth2006deft). **Função da leitura:** oferece um quadro para analisar desenho, função e tarefa em múltiplas representações. **Limite principal:** não estabelece que variedade visual ou um componente especializado seja sempre superior.
4. [Carpenter et al. (2022)](#ref-carpenter2022spacing). **Função da leitura:** sintetiza prática de recuperação e espaçamento e ajuda a distinguir os dois mecanismos. **Limite principal:** intervalo, conteúdo, população e medida moderam a transferência para outro contexto.

### Pesquisa, avaliação e validade

Este percurso separa construção do artefato, investigação educacional, desenho causal e validade das interpretações.

1. [Messick (1995)](#ref-messick1995validity). **Função da leitura:** explica validade como sustentação das interpretações e dos usos de uma medida. **Limite principal:** não valida por si nenhum instrumento ou indicador do AraLearn.
2. [Shadish et al. (2002)](#ref-shadish2002experimental). **Função da leitura:** fundamenta desenhos experimentais e quase experimentais e suas ameaças à inferência causal. **Limite principal:** um esquema de variantes ou uma origem comum não satisfaz automaticamente esses desenhos.
3. [Design-Based Research Collective (2003)](#ref-dbrc2003designbased). **Função da leitura:** introduz a pesquisa baseada em design em contextos educacionais autênticos. **Limite principal:** iteração de produto sem pergunta, dados e explicação não constitui DBR.
4. [Hevner et al. (2004)](#ref-hevner2004designscience). **Função da leitura:** situa a construção e a avaliação de artefatos em Design Science Research. **Limite principal:** evidência técnica do artefato não substitui avaliação de aprendizagem ou usabilidade.
5. [Conselho Nacional de Saúde (2016)](#ref-cns2016resolucao510). **Função da leitura:** delimita direitos e requisitos éticos para pesquisas brasileiras em Ciências Humanas e Sociais abrangidas por seu escopo. **Limite principal:** a norma não valida desenho, medida ou análise e não demonstra efeito educacional.

### IA generativa e colaboração entre pessoas e IA

As leituras avançam de princípios de interação e dependência apropriada para erro de geração, heterogeneidade de desempenho e trabalho docente de revisão.

1. [Amershi et al. (2019)](#ref-amershi2019humanai). **Função da leitura:** organiza diretrizes de comunicação, correção e controle na interação entre pessoas e IA. **Limite principal:** diretriz de desenho não demonstra que uma pessoa compreendeu ou exerceu o controle.
2. [Lee e See (2004)](#ref-lee2004trust). **Função da leitura:** relaciona confiança, contexto e dependência apropriada de automação imperfeita. **Limite principal:** confiança declarada não equivale a dependência calibrada numa tarefa concreta.
3. [Ji et al. (2023)](#ref-ji2023hallucination). **Função da leitura:** sintetiza tipos, causas, avaliação e mitigação de alucinações na geração de linguagem. **Limite principal:** os resultados variam por tarefa e não demonstram que recuperação ou validação elimine erro.
4. [Vaccaro et al. (2024)](#ref-vaccaro2024humanai). **Função da leitura:** quantifica heterogeneidade e moderadores de desempenho em combinações pessoa–IA. **Limite principal:** as tarefas e medidas da meta-análise não predizem a qualidade da autoria no AraLearn.
5. [Selwyn et al. (2025)](#ref-selwyn2025prompting). **Função da leitura:** mostra o trabalho de conferir, reparar, reescrever e rejeitar saídas de IA relatado por docentes. **Limite principal:** o estudo qualitativo cobre 57 docentes de oito escolas na Austrália e na Suécia.
6. [Han et al. (2025)](#ref-han2025genaimeta). **Função da leitura:** sintetiza resultados educacionais experimentais e seus moderadores. **Limite principal:** a heterogeneidade substancial impede transportar o efeito agregado para o AraLearn.

### Aprendizagem no trabalho e circulação de conhecimento

Estas fontes ajudam a distinguir aprendizagem individual, formação profissional e processos organizacionais de conhecimento.

1. [Tynjälä (2008)](#ref-tynjala2008workplace). **Função da leitura:** diferencia formas, níveis e condições de aprendizagem no trabalho. **Limite principal:** a revisão não demonstra adequação de uma plataforma específica a toda organização.
2. [Alavi e Leidner (2001)](#ref-alavi2001knowledge). **Função da leitura:** situa sistemas de informação dentro de processos de criação, transferência e aplicação de conhecimento. **Limite principal:** armazenar e distribuir cursos não constitui por si gestão do conhecimento.
3. [UNESCO (2015)](#ref-unesco2015tvet). **Função da leitura:** delimita educação e formação técnica e profissional numa perspectiva de aprendizagem ao longo da vida. **Limite principal:** é uma norma orientadora, não evidência de eficácia educacional do AraLearn.

### Interface móvel, interrupção e modos de cor

O percurso liga diversidade de interfaces móveis, retomada de tarefas, polaridade de tela e acessibilidade normativa.

1. [Ahmad Faudzi et al. (2023)](#ref-faudzi2023mobileui). **Função da leitura:** mapeia quadros usados no desenho de interfaces de aprendizagem móvel. **Limite principal:** a diversidade encontrada não identifica um layout universalmente superior.
2. [Monk et al. (2008)](#ref-monk2008resumption). **Função da leitura:** examina como duração e demanda da interrupção afetam a retomada de objetivos. **Limite principal:** a tarefa experimental não avalia aprendizagem nem armazenamento local.
3. [Piepenbrock et al. (2014)](#ref-piepenbrock2014polarity). **Função da leitura:** examina polaridade de tela numa tarefa delimitada de revisão de texto. **Limite principal:** desempenho nessa tarefa não estabelece superioridade universal do modo claro.
4. [Xie et al. (2021)](#ref-xie2021colormode). **Função da leitura:** contrasta fadiga objetiva e preferência subjetiva em baixa iluminação. **Limite principal:** a condição noturna e os níveis de luminância restringem a generalização.
5. [World Wide Web Consortium (2023)](#ref-w3c2023wcag22). **Função da leitura:** fornece critérios normativos de acessibilidade para conteúdo web. **Limite principal:** conformidade técnica não demonstra compreensão, conforto ou aprendizagem.

## Lista de referências

<a id="ref-agarwal2021retrieval"></a>

### Agarwal et al. (2021)

Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453. [DOI 10.1007/s10648-021-09595-9](https://doi.org/10.1007/s10648-021-09595-9).

Chave bibliográfica: `agarwal2021retrieval`.

<a id="ref-faudzi2023mobileui"></a>

### Ahmad Faudzi et al. (2023)

Masyura Ahmad Faudzi; Zaihisma Che Cob; Ridha Omar; Sharul Azim Sharudin; Masitah Ghazali (2023). **Investigating the User Interface Design Frameworks of Current Mobile Learning Applications: A Systematic Review.** *Education Sciences*, 13(1), p. 94. [DOI 10.3390/educsci13010094](https://doi.org/10.3390/educsci13010094).

Chave bibliográfica: `faudzi2023mobileui`.

<a id="ref-ainsworth2006deft"></a>

### Ainsworth (2006)

Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198. [DOI 10.1016/j.learninstruc.2006.03.001](https://doi.org/10.1016/j.learninstruc.2006.03.001).

Chave bibliográfica: `ainsworth2006deft`.

<a id="ref-alavi2001knowledge"></a>

### Alavi e Leidner (2001)

Maryam Alavi; Dorothy E. Leidner (2001). **Review: Knowledge Management and Knowledge Management Systems: Conceptual Foundations and Research Issues.** *MIS Quarterly*, 25(1), p. 107–136. [DOI 10.2307/3250961](https://doi.org/10.2307/3250961).

Chave bibliográfica: `alavi2001knowledge`.

<a id="ref-aera2014standards"></a>

### American Educational Research Association et al. (2014)

American Educational Research Association; American Psychological Association; National Council on Measurement in Education (2014). **Standards for Educational and Psychological Testing.** Washington, DC, American Educational Research Association. [acesso ao documento](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf).

Chave bibliográfica: `aera2014standards`.

<a id="ref-amershi2019humanai"></a>

### Amershi et al. (2019)

Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13. [DOI 10.1145/3290605.3300233](https://doi.org/10.1145/3290605.3300233).

Chave bibliográfica: `amershi2019humanai`.

<a id="ref-nist2024genai"></a>

### Autio et al. (2024)

Chloe Autio; Reva Schwartz; Jesse Dunietz; Shomik Jain; Martin Stanley; Elham Tabassi; Patrick Hall; Kamie Roberts (2024). **Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile.** National Institute of Standards and Technology, NIST AI 600-1. [DOI 10.6028/nist.ai.600-1](https://doi.org/10.6028/nist.ai.600-1).

Chave bibliográfica: `nist2024genai`.

<a id="ref-bandura2001agency"></a>

### Bandura (2001)

Albert Bandura (2001). **Social Cognitive Theory: An Agentic Perspective.** *Annual Review of Psychology*, 52, p. 1–26. [DOI 10.1146/annurev.psych.52.1.1](https://doi.org/10.1146/annurev.psych.52.1.1).

Chave bibliográfica: `bandura2001agency`.

<a id="ref-barrison2025flashcards"></a>

### Barrison et al. (2025)

Philip D. Barrison; Emily A. Balczewski; Emily Capellari; Zach Landis-Lewis; Alexandra H. Vinson (2025). **Electronic Flashcards in Health Professions Education: A Scoping Review.** *Academic Medicine*, 100(4), p. 497–506. [DOI 10.1097/acm.0000000000005968](https://doi.org/10.1097/acm.0000000000005968).

Chave bibliográfica: `barrison2025flashcards`.

<a id="ref-baughan2022dissociation"></a>

### Baughan et al. (2022)

Amanda Baughan; Mingrui Ray Zhang; Raveena Rao; Kai Lukoff; Anastasia Schaadhardt; Lisa D. Butler; Alexis Hiniker (2022). **I Don't Even Remember What I Read: How Design Influences Dissociation on Social Media.** In: *Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems*, ACM, p. 1–13. [DOI 10.1145/3491102.3501899](https://doi.org/10.1145/3491102.3501899).

Chave bibliográfica: `baughan2022dissociation`.

<a id="ref-bjork2011desirable"></a>

### Bjork e Bjork (2011)

Elizabeth L. Bjork; Robert A. Bjork (2011). **Making Things Hard on Yourself, but in a Good Way: Creating Desirable Difficulties to Enhance Learning.** In: *Psychology and the Real World: Essays Illustrating Fundamental Contributions to Society*, Worth Publishers, p. 56–64. [acesso ao documento](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf) · ISBN 9781429230438.

Chave bibliográfica: `bjork2011desirable`.

<a id="ref-bridwellmitchell2016collaborative"></a>

### Bridwell-Mitchell (2016)

E. N. Bridwell-Mitchell (2016). **Collaborative Institutional Agency: How Peer Learning in Communities of Practice Enables and Inhibits Micro-Institutional Change.** *Organization Studies*, 37(2), p. 161–192. [DOI 10.1177/0170840615593589](https://doi.org/10.1177/0170840615593589).

Chave bibliográfica: `bridwellmitchell2016collaborative`.

<a id="ref-broadbent2015selfregulated"></a>

### Broadbent e Poon (2015)

Jaclyn Broadbent; Walter L. Poon (2015). **Self-Regulated Learning Strategies and Academic Achievement in Online Higher Education Learning Environments: A Systematic Review.** *The Internet and Higher Education*, 27, p. 1–13. [DOI 10.1016/j.iheduc.2015.04.007](https://doi.org/10.1016/j.iheduc.2015.04.007).

Chave bibliográfica: `broadbent2015selfregulated`.

<a id="ref-brunmair2019interleaving"></a>

### Brunmair e Richter (2019)

Markus Brunmair; Tobias Richter (2019). **Similarity Matters: A Meta-Analysis of Interleaved Learning and Its Moderators.** *Psychological Bulletin*, 145(11), p. 1029–1052. [DOI 10.1037/bul0000209](https://doi.org/10.1037/bul0000209).

Chave bibliográfica: `brunmair2019interleaving`.

<a id="ref-bucinca2021overreliance"></a>

### Buçinca et al. (2021)

Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21. [DOI 10.1145/3449287](https://doi.org/10.1145/3449287).

Chave bibliográfica: `bucinca2021overreliance`.

<a id="ref-butler2008confidence"></a>

### Butler et al. (2008)

Andrew C. Butler; Jeffrey D. Karpicke; Henry L. Roediger (2008). **Correcting a Metacognitive Error: Feedback Increases Retention of Low-Confidence Correct Responses.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 34(4), p. 918–928. [DOI 10.1037/0278-7393.34.4.918](https://doi.org/10.1037/0278-7393.34.4.918).

Chave bibliográfica: `butler2008confidence`.

<a id="ref-carless2018feedbackliteracy"></a>

### Carless e Boud (2018)

David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325. [DOI 10.1080/02602938.2018.1463354](https://doi.org/10.1080/02602938.2018.1463354).

Chave bibliográfica: `carless2018feedbackliteracy`.

<a id="ref-carpenter2022spacing"></a>

### Carpenter et al. (2022)

Shana K. Carpenter; Steven C. Pan; Andrew C. Butler (2022). **The Science of Effective Learning with Spacing and Retrieval Practice.** *Nature Reviews Psychology*, 1, p. 496–511. [DOI 10.1038/s44159-022-00089-1](https://doi.org/10.1038/s44159-022-00089-1).

Chave bibliográfica: `carpenter2022spacing`.

<a id="ref-cepeda2006distributed"></a>

### Cepeda et al. (2006)

Nicholas J. Cepeda; Harold Pashler; Edward Vul; John T. Wixted; Doug Rohrer (2006). **Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.** *Psychological Bulletin*, 132(3), p. 354–380. [DOI 10.1037/0033-2909.132.3.354](https://doi.org/10.1037/0033-2909.132.3.354).

Chave bibliográfica: `cepeda2006distributed`.

<a id="ref-cepeda2008spacing"></a>

### Cepeda et al. (2008)

Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102. [DOI 10.1111/j.1467-9280.2008.02209.x](https://doi.org/10.1111/j.1467-9280.2008.02209.x).

Chave bibliográfica: `cepeda2008spacing`.

<a id="ref-chen2025genaimeta"></a>

### Chen e Cheung (2025)

Shuzhen Chen; Alan C. K. Cheung (2025). **Effect of Generative Artificial Intelligence on University Students Learning Outcomes: A Systematic Review and Meta-Analysis.** *Educational Research Review*, 49, p. 100737. [DOI 10.1016/j.edurev.2025.100737](https://doi.org/10.1016/j.edurev.2025.100737).

Chave bibliográfica: `chen2025genaimeta`.

<a id="ref-chen2023elementinteractivity"></a>

### Chen et al. (2023)

Ouhao Chen; Fred Paas; John Sweller (2023). **A Cognitive Load Theory Approach to Defining and Measuring Task Complexity Through Element Interactivity.** *Educational Psychology Review*, 35, p. 63. [DOI 10.1007/s10648-023-09782-w](https://doi.org/10.1007/s10648-023-09782-w).

Chave bibliográfica: `chen2023elementinteractivity`.

<a id="ref-chi1989selfexplanations"></a>

### Chi et al. (1989)

Michelene T. H. Chi; Miriam Bassok; Matthew W. Lewis; Peter Reimann; Robert Glaser (1989). **Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.** *Cognitive Science*, 13(2), p. 145–182. [DOI 10.1207/s15516709cog1302_1](https://doi.org/10.1207/s15516709cog1302_1).

Chave bibliográfica: `chi1989selfexplanations`.

<a id="ref-chi1994eliciting"></a>

### Chi et al. (1994)

Michelene T. H. Chi; Nicholas de Leeuw; Mei-Hung Chiu; Christian LaVancher (1994). **Eliciting Self-Explanations Improves Understanding.** *Cognitive Science*, 18(3), p. 439–477. [DOI 10.1207/s15516709cog1803_3](https://doi.org/10.1207/s15516709cog1803_3).

Chave bibliográfica: `chi1994eliciting`.

<a id="ref-choi2024vivid"></a>

### Choi et al. (2024)

Seulgi Choi; Hyewon Lee; Yoonjoo Lee; Juho Kim (2024). **VIVID: Human–AI Collaborative Authoring of Vicarious Dialogues from Lecture Videos.** In: *Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems*, Association for Computing Machinery, p. 1–26. [DOI 10.1145/3613904.3642867](https://doi.org/10.1145/3613904.3642867).

Chave bibliográfica: `choi2024vivid`.

<a id="ref-chun2011attention"></a>

### Chun et al. (2011)

Marvin M. Chun; Julie D. Golomb; Nicholas B. Turk-Browne (2011). **A Taxonomy of External and Internal Attention.** *Annual Review of Psychology*, 62(1), p. 73–101. [DOI 10.1146/annurev.psych.093008.100427](https://doi.org/10.1146/annurev.psych.093008.100427).

Chave bibliográfica: `chun2011attention`.

<a id="ref-cns2016resolucao510"></a>

### Conselho Nacional de Saúde (2016)

Conselho Nacional de Saúde (2016). **Resolução nº 510, de 7 de abril de 2016.** Conselho Nacional de Saúde. [acesso ao documento](https://www.gov.br/conselho-nacional-de-saude/pt-br/atos-normativos/resolucoes/2016/resolucao-no-510.pdf/view).

Chave bibliográfica: `cns2016resolucao510`.

<a id="ref-degagne2019microlearning"></a>

### De Gagne et al. (2019)

Jennie Chang De Gagne; Hyeyoung Kate Park; Katherine Hall; Amanda Woodward; Sandra Yamane; Sang Suk Kim (2019). **Microlearning in Health Professions Education: Scoping Review.** *JMIR Medical Education*, 5(2), p. e13997. [DOI 10.2196/13997](https://doi.org/10.2196/13997).

Chave bibliográfica: `degagne2019microlearning`.

<a id="ref-dennison2026shiksha"></a>

### Dennison et al. (2026)

Deepak Varuvel Dennison; Bakhtawar Ahtisham; Kavyansh Chourasia; Nirmit Arora; Rahul Singh; René F. Kizilcec; Akshay Nambi; Tanuja Ganu; Aditya Vashistha (2026). **Shiksha Copilot: Teacher–AI Collaboration for Curating and Customizing Lesson Plans in Low-Resource Schools.** *Proceedings of the ACM on Human-Computer Interaction*, 10(2), p. 1–47. [DOI 10.1145/3788074](https://doi.org/10.1145/3788074).

Chave bibliográfica: `dennison2026shiksha`.

<a id="ref-dbrc2003designbased"></a>

### Design-Based Research Collective (2003)

Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8. [DOI 10.3102/0013189x032001005](https://doi.org/10.3102/0013189x032001005).

Chave bibliográfica: `dbrc2003designbased`.

<a id="ref-dyson2004layout"></a>

### Dyson (2004)

Mary C. Dyson (2004). **How Physical Text Layout Affects Reading from Screen.** *Behaviour & Information Technology*, 23(6), p. 377–393. [DOI 10.1080/01449290410001715714](https://doi.org/10.1080/01449290410001715714).

Chave bibliográfica: `dyson2004layout`.

<a id="ref-foroughi2016resumption"></a>

### Foroughi et al. (2016)

Cyrus K. Foroughi; Nicole E. Werner; Elizabeth T. Nelson; Deborah A. Boehm-Davis (2016). **Individual Differences in Working-Memory Capacity and Task Resumption Following Interruptions.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 42(9), p. 1480–1488. [DOI 10.1037/xlm0000251](https://doi.org/10.1037/xlm0000251).

Chave bibliográfica: `foroughi2016resumption`.

<a id="ref-gazzola2022textcomplexity"></a>

### Gazzola et al. (2022)

Murilo Gazzola; Sidney Leal; Breno Pedroni; Fábio Theoto Rocha; Sabine Pompéia; Sandra Aluísio (2022). **Text Complexity of Open Educational Resources in Portuguese: Mixing Written and Spoken Registers in a Multi-task Approach.** *Language Resources and Evaluation*, 56(2), p. 621–650. [DOI 10.1007/s10579-021-09571-3](https://doi.org/10.1007/s10579-021-09571-3).

Chave bibliográfica: `gazzola2022textcomplexity`.

<a id="ref-gilardi2023annotation"></a>

### Gilardi et al. (2023)

Fabrizio Gilardi; Meysam Alizadeh; Maël Kubli (2023). **ChatGPT Outperforms Crowd Workers for Text-Annotation Tasks.** *Proceedings of the National Academy of Sciences*, 120(30), p. e2305016120. [DOI 10.1073/pnas.2305016120](https://doi.org/10.1073/pnas.2305016120) · [acesso ao documento](https://pmc.ncbi.nlm.nih.gov/articles/PMC10372638/).

Chave bibliográfica: `gilardi2023annotation`.

<a id="ref-ginns2006contiguity"></a>

### Ginns (2006)

Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525. [DOI 10.1016/j.learninstruc.2006.10.001](https://doi.org/10.1016/j.learninstruc.2006.10.001).

Chave bibliográfica: `ginns2006contiguity`.

<a id="ref-graesser2004cohmetrix"></a>

### Graesser et al. (2004)

Arthur C. Graesser; Danielle S. McNamara; Max M. Louwerse; Zhiqiang Cai (2004). **Coh-Metrix: Analysis of Text on Cohesion and Language.** *Behavior Research Methods, Instruments, & Computers*, 36(2), p. 193–202. [DOI 10.3758/bf03195564](https://doi.org/10.3758/bf03195564).

Chave bibliográfica: `graesser2004cohmetrix`.

<a id="ref-gregor2013positioning"></a>

### Gregor e Hevner (2013)

Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355. [DOI 10.25300/misq/2013/37.2.01](https://doi.org/10.25300/misq/2013/37.2.01).

Chave bibliográfica: `gregor2013positioning`.

<a id="ref-greimas1966recit"></a>

### Greimas (1966)

Algirdas Julien Greimas (1966). **Éléments pour une théorie de l'interprétation du récit mythique.** *Communications*, 8(1), p. 28–59. [DOI 10.3406/comm.1966.1114](https://doi.org/10.3406/comm.1966.1114) · [acesso ao documento](https://www.persee.fr/doc/comm_0588-8018_1966_num_8_1_1114).

Chave bibliográfica: `greimas1966recit`.

<a id="ref-han2025genaimeta"></a>

### Han et al. (2025)

Xiaoli Han; Hongchao Peng; Mingzhuo Liu (2025). **The Impact of GenAI on Learning Outcomes: A Systematic Review and Meta-Analysis of Experimental Studies.** *Educational Research Review*, 48, p. 100714. [DOI 10.1016/j.edurev.2025.100714](https://doi.org/10.1016/j.edurev.2025.100714).

Chave bibliográfica: `han2025genaimeta`.

<a id="ref-hattie2007feedback"></a>

### Hattie e Timperley (2007)

John Hattie; Helen Timperley (2007). **The Power of Feedback.** *Review of Educational Research*, 77(1), p. 81–112. [DOI 10.3102/003465430298487](https://doi.org/10.3102/003465430298487).

Chave bibliográfica: `hattie2007feedback`.

<a id="ref-haverkamp2023screens"></a>

### Haverkamp et al. (2023)

Ymkje E. Haverkamp; Ivar Bråten; Natalia Latini; Ladislao Salmerón (2023). **Is It the Size, the Movement, or Both? Investigating Effects of Screen Size and Text Movement on Processing, Understanding, and Motivation When Students Read Informational Text.** *Reading and Writing*, 36(7), p. 1589–1608. [DOI 10.1007/s11145-022-10328-9](https://doi.org/10.1007/s11145-022-10328-9).

Chave bibliográfica: `haverkamp2023screens`.

<a id="ref-hearst1997texttiling"></a>

### Hearst (1997)

Marti A. Hearst (1997). **TextTiling: Segmenting Text into Multi-paragraph Subtopic Passages.** *Computational Linguistics*, 23(1), p. 33–64. [acesso ao documento](https://aclanthology.org/J97-1003/).

Chave bibliográfica: `hearst1997texttiling`.

<a id="ref-henrie2015engagement"></a>

### Henrie et al. (2015)

Curtis R. Henrie; Lisa R. Halverson; Charles R. Graham (2015). **Measuring Student Engagement in Technology-mediated Learning: A Review.** *Computers & Education*, 90, p. 36–53. [DOI 10.1016/j.compedu.2015.09.005](https://doi.org/10.1016/j.compedu.2015.09.005).

Chave bibliográfica: `henrie2015engagement`.

<a id="ref-hevner2004designscience"></a>

### Hevner et al. (2004)

Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105. [DOI 10.2307/25148625](https://doi.org/10.2307/25148625).

Chave bibliográfica: `hevner2004designscience`.

<a id="ref-howardjones2014neuroscience"></a>

### Howard-Jones (2014)

Paul A. Howard-Jones (2014). **Neuroscience and Education: Myths and Messages.** *Nature Reviews Neuroscience*, 15(12), p. 817–824. [DOI 10.1038/nrn3817](https://doi.org/10.1038/nrn3817).

Chave bibliográfica: `howardjones2014neuroscience`.

<a id="ref-iso2018usability"></a>

### International Organization for Standardization (2018)

International Organization for Standardization (2018). **ISO 9241-11:2018: Ergonomics of Human-System Interaction — Part 11: Usability: Definitions and Concepts.** ISO 9241-11:2018. [acesso ao documento](https://www.iso.org/standard/63500.html).

Chave bibliográfica: `iso2018usability`.

<a id="ref-ji2023hallucination"></a>

### Ji et al. (2023)

Ziwei Ji; Nayeon Lee; Rita Frieske; Tiezheng Yu; Dan Su; Yan Xu; Etsuko Ishii; Ye Jin Bang; Andrea Madotto; Pascale Fung (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys*, 55(12), p. 1–38. [DOI 10.1145/3571730](https://doi.org/10.1145/3571730).

Chave bibliográfica: `ji2023hallucination`.

<a id="ref-kalyuga2007expertisereversal"></a>

### Kalyuga (2007)

Slava Kalyuga (2007). **Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction.** *Educational Psychology Review*, 19(4), p. 509–539. [DOI 10.1007/s10648-007-9054-3](https://doi.org/10.1007/s10648-007-9054-3).

Chave bibliográfica: `kalyuga2007expertisereversal`.

<a id="ref-karich2014learnercontrol"></a>

### Karich et al. (2014)

Angela C. Karich; Matthew K. Burns; Kathrin E. Maki (2014). **Updated Meta-Analysis of Learner Control Within Educational Technology.** *Review of Educational Research*, 84(3), p. 392–410. [DOI 10.3102/0034654314526064](https://doi.org/10.3102/0034654314526064).

Chave bibliográfica: `karich2014learnercontrol`.

<a id="ref-karpicke2008retrieval"></a>

### Karpicke e Roediger (2008)

Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968. [DOI 10.1126/science.1152408](https://doi.org/10.1126/science.1152408).

Chave bibliográfica: `karpicke2008retrieval`.

<a id="ref-kintsch1978model"></a>

### Kintsch e van Dijk (1978)

Walter Kintsch; Teun A. van Dijk (1978). **Toward a Model of Text Comprehension and Production.** *Psychological Review*, 85(5), p. 363–394. [DOI 10.1037/0033-295x.85.5.363](https://doi.org/10.1037/0033-295x.85.5.363).

Chave bibliográfica: `kintsch1978model`.

<a id="ref-kirsh2010external"></a>

### Kirsh (2010)

David Kirsh (2010). **Thinking with External Representations.** *AI & Society*, 25(4), p. 441–454. [DOI 10.1007/s00146-010-0272-8](https://doi.org/10.1007/s00146-010-0272-8).

Chave bibliográfica: `kirsh2010external`.

<a id="ref-kirshmaglio1994epistemic"></a>

### Kirsh e Maglio (1994)

David Kirsh; Paul Maglio (1994). **On Distinguishing Epistemic from Pragmatic Action.** *Cognitive Science*, 18(4), p. 513–549. [DOI 10.1207/s15516709cog1804_1](https://doi.org/10.1207/s15516709cog1804_1).

Chave bibliográfica: `kirshmaglio1994epistemic`.

<a id="ref-knowles1975selfdirected"></a>

### Knowles (1975)

Malcolm S. Knowles (1975). **Self-Directed Learning: A Guide for Learners and Teachers.** New York, Association Press. [acesso ao documento](https://eric.ed.gov/?id=ED114653) · ISBN 9780809619023.

Chave bibliográfica: `knowles1975selfdirected`.

<a id="ref-koedinger2012kli"></a>

### Koedinger et al. (2012)

Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798. [DOI 10.1111/j.1551-6709.2012.01245.x](https://doi.org/10.1111/j.1551-6709.2012.01245.x).

Chave bibliográfica: `koedinger2012kli`.

<a id="ref-lai2022mobile"></a>

### Lai et al. (2022)

Yuzhi Lai; Nadira Saab; Wilfried Admiraal (2022). **Learning Strategies in Self-Directed Language Learning Using Mobile Technology in Higher Education: A Systematic Scoping Review.** *Education and Information Technologies*, 27, p. 7749–7780. [DOI 10.1007/s10639-022-10945-5](https://doi.org/10.1007/s10639-022-10945-5).

Chave bibliográfica: `lai2022mobile`.

<a id="ref-leal2024nilcmetrix"></a>

### Leal et al. (2024)

Sidney Evaldo Leal; Magali Sanches Duran; Carolina Evaristo Scarton; Nathan Siegle Hartmann; Sandra Maria Aluísio (2024). **NILC-Metrix: Assessing the Complexity of Written and Spoken Language in Brazilian Portuguese.** *Language Resources and Evaluation*, 58(1), p. 73–110. [DOI 10.1007/s10579-023-09693-w](https://doi.org/10.1007/s10579-023-09693-w).

Chave bibliográfica: `leal2024nilcmetrix`.

<a id="ref-lee2004trust"></a>

### Lee e See (2004)

John D. Lee; Katrina A. See (2004). **Trust in Automation: Designing for Appropriate Reliance.** *Human Factors*, 46(1), p. 50–80. [DOI 10.1518/hfes.46.1.50_30392](https://doi.org/10.1518/hfes.46.1.50_30392).

Chave bibliográfica: `lee2004trust`.

<a id="ref-lewis2020rag"></a>

### Lewis et al. (2020)

Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474. [acesso ao documento](https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html).

Chave bibliográfica: `lewis2020rag`.

<a id="ref-li2021interaction"></a>

### Li et al. (2021)

Jutao Li; Jiutai Song; Yanqun Huang; Yuzhen Wang; Jie Zhang (2021). **Effects of Different Interaction Modes on Fatigue and Reading Effectiveness with Mobile Phones.** *International Journal of Industrial Ergonomics*, 85, p. 103189. [DOI 10.1016/j.ergon.2021.103189](https://doi.org/10.1016/j.ergon.2021.103189).

Chave bibliográfica: `li2021interaction`.

<a id="ref-mann1988rst"></a>

### Mann e Thompson (1988)

William C. Mann; Sandra A. Thompson (1988). **Rhetorical Structure Theory: Toward a Functional Theory of Text Organization.** *Text*, 8(3), p. 243–281. [DOI 10.1515/text.1.1988.8.3.243](https://doi.org/10.1515/text.1.1988.8.3.243).

Chave bibliográfica: `mann1988rst`.

<a id="ref-martinec2005imagetext"></a>

### Martinec e Salway (2005)

Radan Martinec; Andrew Salway (2005). **A System for Image–Text Relations in New (and Old) Media.** *Visual Communication*, 4(3), p. 337–371. [DOI 10.1177/1470357205055928](https://doi.org/10.1177/1470357205055928).

Chave bibliográfica: `martinec2005imagetext`.

<a id="ref-mayer2009multimedia"></a>

### Mayer (2009)

Richard E. Mayer (2009). **Multimedia Learning.** 2. ed., Cambridge University Press. [DOI 10.1017/cbo9780511811678](https://doi.org/10.1017/cbo9780511811678) · ISBN 9780521735353.

Chave bibliográfica: `mayer2009multimedia`.

<a id="ref-mcnamara1996coherence"></a>

### McNamara e Kintsch (1996)

Danielle S. McNamara; Walter Kintsch (1996). **Learning from Texts: Effects of Prior Knowledge and Text Coherence.** *Discourse Processes*, 22(3), p. 247–288. [DOI 10.1080/01638539609544975](https://doi.org/10.1080/01638539609544975).

Chave bibliográfica: `mcnamara1996coherence`.

<a id="ref-messick1995validity"></a>

### Messick (1995)

Samuel Messick (1995). **Validity of Psychological Assessment: Validation of Inferences from Persons' Responses and Performances as Scientific Inquiry into Score Meaning.** *American Psychologist*, 50(9), p. 741–749. [DOI 10.1037/0003-066x.50.9.741](https://doi.org/10.1037/0003-066x.50.9.741).

Chave bibliográfica: `messick1995validity`.

<a id="ref-miller1984genre"></a>

### Miller (1984)

Carolyn R. Miller (1984). **Genre as Social Action.** *Quarterly Journal of Speech*, 70(2), p. 151–167. [DOI 10.1080/00335638409383686](https://doi.org/10.1080/00335638409383686).

Chave bibliográfica: `miller1984genre`.

<a id="ref-mislevy2003ecd"></a>

### Mislevy et al. (2003)

Robert J. Mislevy; Russell G. Almond; Janice F. Lukas (2003). **A Brief Introduction to Evidence-Centered Design.** Educational Testing Service, RR-03-16. [DOI 10.1002/j.2333-8504.2003.tb01908.x](https://doi.org/10.1002/j.2333-8504.2003.tb01908.x) · [acesso ao documento](https://www.ets.org/research/policy_research_reports/publications/report/2003/hsgs.html).

Chave bibliográfica: `mislevy2003ecd`.

<a id="ref-monk2008resumption"></a>

### Monk et al. (2008)

Christopher A. Monk; J. Gregory Trafton; Deborah A. Boehm-Davis (2008). **The Effect of Interruption Duration and Demand on Resuming Suspended Goals.** *Journal of Experimental Psychology: Applied*, 14(4), p. 299–313. [DOI 10.1037/a0014402](https://doi.org/10.1037/a0014402).

Chave bibliográfica: `monk2008resumption`.

<a id="ref-morris2021formative"></a>

### Morris et al. (2021)

Rebecca Morris; Thomas Perry; Lindsey Wardle (2021). **Formative Assessment and Feedback for Learning in Higher Education: A Systematic Review.** *Review of Education*, 9(3), p. e3292. [DOI 10.1002/rev3.3292](https://doi.org/10.1002/rev3.3292).

Chave bibliográfica: `morris2021formative`.

<a id="ref-nicol2024feedbackagency"></a>

### Nicol e Kushwah (2024)

David Nicol; Lovleen Kushwah (2024). **Shifting Feedback Agency to Students by Having Them Write Their Own Feedback Comments.** *Assessment & Evaluation in Higher Education*, 49(3), p. 419–439. [DOI 10.1080/02602938.2023.2265080](https://doi.org/10.1080/02602938.2023.2265080).

Chave bibliográfica: `nicol2024feedbackagency`.

<a id="ref-nicol2006formative"></a>

### Nicol e Macfarlane-Dick (2006)

David J. Nicol; Debra Macfarlane-Dick (2006). **Formative Assessment and Self-Regulated Learning: A Model and Seven Principles of Good Feedback Practice.** *Studies in Higher Education*, 31(2), p. 199–218. [DOI 10.1080/03075070600572090](https://doi.org/10.1080/03075070600572090).

Chave bibliográfica: `nicol2006formative`.

<a id="ref-pan2018transfer"></a>

### Pan e Rickard (2018)

Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756. [DOI 10.1037/bul0000151](https://doi.org/10.1037/bul0000151).

Chave bibliográfica: `pan2018transfer`.

<a id="ref-panadero2017selfregulated"></a>

### Panadero (2017)

Ernesto Panadero (2017). **A Review of Self-Regulated Learning: Six Models and Four Directions for Research.** *Frontiers in Psychology*, 8, p. 422. [DOI 10.3389/fpsyg.2017.00422](https://doi.org/10.3389/fpsyg.2017.00422).

Chave bibliográfica: `panadero2017selfregulated`.

<a id="ref-pangakis2023validation"></a>

### Pangakis et al. (2023)

Nicholas Pangakis; Samuel Wolken; Neil Fasching (2023). **Automated Annotation with Generative AI Requires Validation.** arXiv. [DOI 10.48550/arxiv.2306.00176](https://doi.org/10.48550/arxiv.2306.00176) · [acesso ao documento](https://arxiv.org/abs/2306.00176).

Chave bibliográfica: `pangakis2023validation`.

<a id="ref-parasuraman2010automation"></a>

### Parasuraman e Manzey (2010)

Raja Parasuraman; Dietrich H. Manzey (2010). **Complacency and Bias in Human Use of Automation: An Attentional Integration.** *Human Factors*, 52(3), p. 381–410. [DOI 10.1177/0018720810376055](https://doi.org/10.1177/0018720810376055).

Chave bibliográfica: `parasuraman2010automation`.

<a id="ref-pardo2014ethical"></a>

### Pardo e Siemens (2014)

Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450. [DOI 10.1111/bjet.12152](https://doi.org/10.1111/bjet.12152).

Chave bibliográfica: `pardo2014ethical`.

<a id="ref-parry2021digitalmedia"></a>

### Parry et al. (2021)

Douglas A. Parry; Brittany I. Davidson; Craig J. R. Sewall; Jacob T. Fisher; Hannah Mieczkowski; Daniel S. Quintana (2021). **A Systematic Review and Meta-analysis of Discrepancies between Logged and Self-reported Digital Media Use.** *Nature Human Behaviour*, 5(11), p. 1535–1547. [DOI 10.1038/s41562-021-01117-5](https://doi.org/10.1038/s41562-021-01117-5).

Chave bibliográfica: `parry2021digitalmedia`.

<a id="ref-passonneau1997segmentation"></a>

### Passonneau e Litman (1997)

Rebecca J. Passonneau; Diane J. Litman (1997). **Discourse Segmentation by Human and Automated Means.** *Computational Linguistics*, 23(1), p. 103–139. [acesso ao documento](https://aclanthology.org/J97-1005/).

Chave bibliográfica: `passonneau1997segmentation`.

<a id="ref-peffers2007dsrm"></a>

### Peffers et al. (2007)

Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77. [DOI 10.2753/mis0742-1222240302](https://doi.org/10.2753/mis0742-1222240302).

Chave bibliográfica: `peffers2007dsrm`.

<a id="ref-peters2024scoping"></a>

### Peters et al. (2024)

Micah D. J. Peters; Christina Godfrey; Patricia McInerney; Zachary Munn; Andrea C. Tricco; Hanan Khalil (2024). **Scoping Reviews.** In: *JBI Manual for Evidence Synthesis*, JBI. [DOI 10.46658/jbimes-24-09](https://doi.org/10.46658/jbimes-24-09) · [acesso ao documento](https://synthesismanual.jbi.global/).

Chave bibliográfica: `peters2024scoping`.

<a id="ref-piepenbrock2014polarity"></a>

### Piepenbrock et al. (2014)

Cosima Piepenbrock; Susanne Mayr; Axel Buchner (2014). **Smaller Pupil Size and Better Proofreading Performance with Positive than with Negative Polarity Displays.** *Ergonomics*, 57(11), p. 1670–1677. [DOI 10.1080/00140139.2014.948496](https://doi.org/10.1080/00140139.2014.948496).

Chave bibliográfica: `piepenbrock2014polarity`.

<a id="ref-ponsborderia2024unidades"></a>

### Pons Bordería e Borreguero Zuloaga (2024)

Salvador Pons Bordería; Margarita Borreguero Zuloaga (2024). **Unidades discursivas del texto escrito: revisión crítica del estado de la cuestión y directrices para una nueva propuesta.** *Círculo de Lingüística Aplicada a la Comunicación*, 99, p. 7–21. [DOI 10.5209/clac.96949](https://doi.org/10.5209/clac.96949).

Chave bibliográfica: `ponsborderia2024unidades`.

<a id="ref-prinsloo2017ethics"></a>

### Prinsloo e Slade (2017)

Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57. [DOI 10.18608/hla17.004](https://doi.org/10.18608/hla17.004) · ISBN 9780995240803.

Chave bibliográfica: `prinsloo2017ethics`.

<a id="ref-reisslein2006expertisereversal"></a>

### Reisslein et al. (2006)

Jana Reisslein; Robert K. Atkinson; Patrick Seeling; Martin Reisslein (2006). **Encountering the Expertise Reversal Effect with a Computer-Based Environment on Electrical Circuit Analysis.** *Learning and Instruction*, 16(2), p. 92–103. [DOI 10.1016/j.learninstruc.2006.02.008](https://doi.org/10.1016/j.learninstruc.2006.02.008).

Chave bibliográfica: `reisslein2006expertisereversal`.

<a id="ref-renkl2002learning"></a>

### Renkl (2002)

Alexander Renkl (2002). **Worked-Out Examples: Instructional Explanations Support Learning by Self-Explanations.** *Learning and Instruction*, 12(5), p. 529–556. [DOI 10.1016/s0959-4752(01)00030-5](https://doi.org/10.1016/s0959-4752%2801%2900030-5).

Chave bibliográfica: `renkl2002learning`.

<a id="ref-renkl2004fading"></a>

### Renkl et al. (2004)

Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82. [DOI 10.1023/b:truc.0000021815.74806.f6](https://doi.org/10.1023/b:truc.0000021815.74806.f6).

Chave bibliográfica: `renkl2004fading`.

<a id="ref-rey2019segmenting"></a>

### Rey et al. (2019)

Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419. [DOI 10.1007/s10648-018-9456-4](https://doi.org/10.1007/s10648-018-9456-4).

Chave bibliográfica: `rey2019segmenting`.

<a id="ref-richter2016signaling"></a>

### Richter et al. (2016)

Juliane Richter; Katharina Scheiter; Alexander Eitel (2016). **Signaling Text–Picture Relations in Multimedia Learning: A Comprehensive Meta-analysis.** *Educational Research Review*, 17, p. 19–36. [DOI 10.1016/j.edurev.2015.12.003](https://doi.org/10.1016/j.edurev.2015.12.003).

Chave bibliográfica: `richter2016signaling`.

<a id="ref-ryan2020motivation"></a>

### Ryan e Deci (2020)

Richard M. Ryan; Edward L. Deci (2020). **Intrinsic and Extrinsic Motivation from a Self-Determination Theory Perspective: Definitions, Theory, Practices, and Future Directions.** *Contemporary Educational Psychology*, 61, p. 101860. [DOI 10.1016/j.cedpsych.2020.101860](https://doi.org/10.1016/j.cedpsych.2020.101860).

Chave bibliográfica: `ryan2020motivation`.

<a id="ref-saussure1916cours"></a>

### Saussure (1916)

Ferdinand de Saussure (1916). **Cours de linguistique générale.** Lausanne and Paris, Payot. [acesso ao documento](https://fr.wikisource.org/wiki/Cours_de_linguistique_g%C3%A9n%C3%A9rale/Deuxi%C3%A8me_partie).

Chave bibliográfica: `saussure1916cours`.

<a id="ref-schneider2018signaling"></a>

### Schneider et al. (2018)

Sascha Schneider; Maik Beege; Steve Nebel; Günter Daniel Rey (2018). **A Meta-analysis of How Signaling Affects Learning with Media.** *Educational Research Review*, 23, p. 1–24. [DOI 10.1016/j.edurev.2017.11.001](https://doi.org/10.1016/j.edurev.2017.11.001).

Chave bibliográfica: `schneider2018signaling`.

<a id="ref-schnotz2003representations"></a>

### Schnotz e Bannert (2003)

Wolfgang Schnotz; Maria Bannert (2003). **Construction and Interference in Learning from Multiple Representation.** *Learning and Instruction*, 13(2), p. 141–156. [DOI 10.1016/s0959-4752(02)00017-8](https://doi.org/10.1016/s0959-4752%2802%2900017-8).

Chave bibliográfica: `schnotz2003representations`.

<a id="ref-selwyn2025prompting"></a>

### Selwyn et al. (2025)

Neil Selwyn; Marita Ljungqvist; Anders Sonesson (2025). **When the Prompting Stops: Exploring Teachers' Work Around the Educational Frailties of Generative AI Tools.** *Learning, Media and Technology*, 50(3), p. 310–323. [DOI 10.1080/17439884.2025.2537959](https://doi.org/10.1080/17439884.2025.2537959).

Chave bibliográfica: `selwyn2025prompting`.

<a id="ref-sennrich2016subwords"></a>

### Sennrich et al. (2016)

Rico Sennrich; Barry Haddow; Alexandra Birch (2016). **Neural Machine Translation of Rare Words with Subword Units.** In: *Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, Association for Computational Linguistics, p. 1715–1725. [DOI 10.18653/v1/p16-1162](https://doi.org/10.18653/v1/p16-1162) · [acesso ao documento](https://aclanthology.org/P16-1162/).

Chave bibliográfica: `sennrich2016subwords`.

<a id="ref-shadish2002experimental"></a>

### Shadish et al. (2002)

William R. Shadish; Thomas D. Cook; Donald T. Campbell (2002). **Experimental and Quasi-Experimental Designs for Generalized Causal Inference.** 2. ed., Houghton Mifflin. [acesso ao documento](https://www.cengage.com/c/experimental-and-quasi-experimental-designs-for-generalized-causal-inference-2e-shadish-cook-campbell/9780395615560/) · ISBN 9780395615560.

Chave bibliográfica: `shadish2002experimental`.

<a id="ref-shute2008feedback"></a>

### Shute (2008)

Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189. [DOI 10.3102/0034654307313795](https://doi.org/10.3102/0034654307313795).

Chave bibliográfica: `shute2008feedback`.

<a id="ref-sotola2021quizzes"></a>

### Sotola e Credé (2021)

Lukas K. Sotola; Marcus Credé (2021). **Regarding Class Quizzes: A Meta-Analytic Synthesis of Studies on the Relationship between Frequent Low-Stakes Testing and Class Performance.** *Educational Psychology Review*, 33(2), p. 407–426. [DOI 10.1007/s10648-020-09563-9](https://doi.org/10.1007/s10648-020-09563-9).

Chave bibliográfica: `sotola2021quizzes`.

<a id="ref-sweller1988cognitiveload"></a>

### Sweller (1988)

John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285. [DOI 10.1207/s15516709cog1202_4](https://doi.org/10.1207/s15516709cog1202_4).

Chave bibliográfica: `sweller1988cognitiveload`.

<a id="ref-sweller1985workedexamples"></a>

### Sweller e Cooper (1985)

John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89. [DOI 10.1207/s1532690xci0201_3](https://doi.org/10.1207/s1532690xci0201_3).

Chave bibliográfica: `sweller1985workedexamples`.

<a id="ref-sweller1998architecture"></a>

### Sweller et al. (1998)

John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296. [DOI 10.1023/a:1022193728205](https://doi.org/10.1023/a:1022193728205).

Chave bibliográfica: `sweller1998architecture`.

<a id="ref-tang2017twitter"></a>

### Tang e Hew (2017)

Ying Tang; Khe Foon Hew (2017). **Using Twitter for Education: Beneficial or Simply a Waste of Time?** *Computers & Education*, 106, p. 97–118. [DOI 10.1016/j.compedu.2016.12.004](https://doi.org/10.1016/j.compedu.2016.12.004).

Chave bibliográfica: `tang2017twitter`.

<a id="ref-taylor2010interleaved"></a>

### Taylor e Rohrer (2010)

Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848. [DOI 10.1002/acp.1598](https://doi.org/10.1002/acp.1598).

Chave bibliográfica: `taylor2010interleaved`.

<a id="ref-tricco2018prismascr"></a>

### Tricco et al. (2018)

Andrea C. Tricco; Erin Lillie; Wasifa Zarin; Kelly K. O'Brien; Heather Colquhoun; Danielle Levac; David Moher; Micah D. J. Peters; Tanya Horsley; Laura Weeks; Susanne Hempel; et al. (2018). **PRISMA Extension for Scoping Reviews (PRISMA-ScR): Checklist and Explanation.** *Annals of Internal Medicine*, 169(7), p. 467–473. [DOI 10.7326/m18-0850](https://doi.org/10.7326/m18-0850).

Chave bibliográfica: `tricco2018prismascr`.

<a id="ref-tsai2022humancentered"></a>

### Tsai e Martinez-Maldonado (2022)

Yi-Shan Tsai; Roberto Martinez-Maldonado (2022). **Human-Centered Approaches to Data-Informed Feedback.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 213–222. [DOI 10.18608/hla22.021](https://doi.org/10.18608/hla22.021) · ISBN 9780995240834.

Chave bibliográfica: `tsai2022humancentered`.

<a id="ref-tynjala2008workplace"></a>

### Tynjälä (2008)

Päivi Tynjälä (2008). **Perspectives into Learning at the Workplace.** *Educational Research Review*, 3(2), p. 130–154. [DOI 10.1016/j.edurev.2007.12.001](https://doi.org/10.1016/j.edurev.2007.12.001).

Chave bibliográfica: `tynjala2008workplace`.

<a id="ref-unesco2015tvet"></a>

### UNESCO (2015)

UNESCO (2015). **Recommendation concerning Technical and Vocational Education and Training (TVET).** UNESCO. [acesso ao documento](https://www.unesco.org/en/legal-affairs/recommendation-concerning-technical-and-vocational-education-and-training-tvet).

Chave bibliográfica: `unesco2015tvet`.

<a id="ref-unesco2023genai"></a>

### UNESCO (2023)

UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO. [DOI 10.54675/ewzm9535](https://doi.org/10.54675/ewzm9535).

Chave bibliográfica: `unesco2023genai`.

<a id="ref-vaccaro2024humanai"></a>

### Vaccaro et al. (2024)

Michelle Vaccaro; Abdullah Almaatouq; Thomas Malone (2024). **When Combinations of Humans and AI Are Useful: A Systematic Review and Meta-Analysis.** *Nature Human Behaviour*, 8, p. 2293–2303. [DOI 10.1038/s41562-024-02024-1](https://doi.org/10.1038/s41562-024-02024-1).

Chave bibliográfica: `vaccaro2024humanai`.

<a id="ref-vanmerrienboer2019fourcomponent"></a>

### van Merriënboer (2019)

Jeroen J. G. van Merriënboer (2019). **The Four-Component Instructional Design Model: An Overview of Its Main Design Principles.** School of Health Professions Education, Maastricht University. [acesso ao documento](https://www.4cid.org/wp-content/uploads/2021/04/vanmerrienboer-4cid-overview-of-main-design-principles-2021.pdf) · ISBN 9789463806008.

Chave bibliográfica: `vanmerrienboer2019fourcomponent`.

<a id="ref-venable2016feds"></a>

### Venable et al. (2016)

John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89. [DOI 10.1057/ejis.2014.36](https://doi.org/10.1057/ejis.2014.36).

Chave bibliográfica: `venable2016feds`.

<a id="ref-vygotsky1978mind"></a>

### Vygotsky (1978)

Lev S. Vygotsky (1978). **Mind in Society: The Development of Higher Psychological Processes.** Harvard University Press. ISBN 9780674576292.

Chave bibliográfica: `vygotsky1978mind`.

<a id="ref-wang2005designbased"></a>

### Wang e Hannafin (2005)

Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23. [DOI 10.1007/bf02504682](https://doi.org/10.1007/bf02504682).

Chave bibliográfica: `wang2005designbased`.

<a id="ref-wenger1998communities"></a>

### Wenger (1998)

Etienne Wenger (1998). **Communities of Practice: Learning, Meaning, and Identity.** Cambridge University Press. [DOI 10.1017/cbo9780511803932](https://doi.org/10.1017/cbo9780511803932) · ISBN 9780521663632.

Chave bibliográfica: `wenger1998communities`.

<a id="ref-wittwer2008explanations"></a>

### Wittwer e Renkl (2008)

Jörg Wittwer; Alexander Renkl (2008). **Why Instructional Explanations Often Do Not Work: A Framework for Understanding the Effectiveness of Instructional Explanations.** *Educational Psychologist*, 43(1), p. 49–64. [DOI 10.1080/00461520701756420](https://doi.org/10.1080/00461520701756420).

Chave bibliográfica: `wittwer2008explanations`.

<a id="ref-wood2021dialogic"></a>

### Wood (2021)

John Wood (2021). **A Dialogic Technology-Mediated Model of Feedback Uptake and Literacy.** *Assessment & Evaluation in Higher Education*, 46(8), p. 1173–1190. [DOI 10.1080/02602938.2020.1852174](https://doi.org/10.1080/02602938.2020.1852174).

Chave bibliográfica: `wood2021dialogic`.

<a id="ref-wood1976tutoring"></a>

### Wood et al. (1976)

David Wood; Jerome S. Bruner; Gail Ross (1976). **The Role of Tutoring in Problem Solving.** *Journal of Child Psychology and Psychiatry*, 17(2), p. 89–100. [DOI 10.1111/j.1469-7610.1976.tb00381.x](https://doi.org/10.1111/j.1469-7610.1976.tb00381.x).

Chave bibliográfica: `wood1976tutoring`.

<a id="ref-w3c2023wcag22"></a>

### World Wide Web Consortium (2023)

World Wide Web Consortium (2023). **Web Content Accessibility Guidelines (WCAG) 2.2.** [acesso ao documento](https://www.w3.org/TR/WCAG22/).

Chave bibliográfica: `w3c2023wcag22`.

<a id="ref-xie2021colormode"></a>

### Xie et al. (2021)

Xiaojiao Xie; Fanghao Song; Yan Liu; Shurui Wang; Dong Yu (2021). **Study on the Effects of Display Color Mode and Luminance Contrast on Visual Fatigue.** *IEEE Access*, 9, p. 35915–35923. [DOI 10.1109/access.2021.3061770](https://doi.org/10.1109/access.2021.3061770).

Chave bibliográfica: `xie2021colormode`.

<a id="ref-yates1992genres"></a>

### Yates e Orlikowski (1992)

Joanne Yates; Wanda J. Orlikowski (1992). **Genres of Organizational Communication: A Structurational Approach to Studying Communication and Media.** *Academy of Management Review*, 17(2), p. 299–326. [DOI 10.5465/amr.1992.4279545](https://doi.org/10.5465/amr.1992.4279545) · [acesso ao documento](https://journals.aom.org/doi/10.5465/amr.1992.4279545).

Chave bibliográfica: `yates1992genres`.

<a id="ref-zappavigna2011ambient"></a>

### Zappavigna (2011)

Michele Zappavigna (2011). **Ambient Affiliation: A Linguistic Perspective on Twitter.** *New Media & Society*, 13(5), p. 788–806. [DOI 10.1177/1461444810385097](https://doi.org/10.1177/1461444810385097).

Chave bibliográfica: `zappavigna2011ambient`.

<a id="ref-zimmerman2002selfregulated"></a>

### Zimmerman (2002)

Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70. [DOI 10.1207/s15430421tip4102_2](https://doi.org/10.1207/s15430421tip4102_2).

Chave bibliográfica: `zimmerman2002selfregulated`.
