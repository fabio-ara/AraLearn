# Contribuição e originalidade do AraLearn

## 1. O que significa contribuição em pesquisa orientada ao desenho de artefatos

Em uma pesquisa orientada à construção de artefatos, a contribuição pode estar
na solução implementada, no conhecimento produzido sobre seu desenho ou na
forma de investigá-la. A avaliação pode acrescentar ainda resultados empíricos
sobre uma versão e um contexto definidos.

| Lugar da contribuição | O que o trabalho acrescenta |
| --- | --- |
| artefato | sistema, método ou modelo implementado |
| conhecimento de desenho | explicação sobre como e em que condições uma solução enfrenta uma classe de problemas |
| instrumento de investigação | regras explícitas, rubricas, conjuntos de casos ou protocolos para examinar o fenômeno |
| resultado empírico | evidência produzida na avaliação do artefato |

A pesquisa em ciência do design, ou DSR (*Design Science Research*), relaciona
a relevância do problema, o conhecimento disponível, a construção e a avaliação
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). Uma contribuição de desenho ganha
força quando ultrapassa a descrição da instância e explicita princípios,
contextos e limites de transferência ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). Ciclos de pesquisa baseada em design, ou DBR (*Design-Based Research*), também valorizam refinamento em situações educacionais e
produção de conhecimento associado ao desenho, sem supor que uma intervenção
funcione igualmente em qualquer contexto ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).

O AraLearn já pode ser examinado como artefato implementado. Alegações sobre
originalidade pedagógica, utilidade em uso ou aprendizagem dependem de
comparações e avaliações compatíveis com cada pergunta.

A [arquitetura](arquitetura.md) descreve como o aplicativo coordena componentes,
conteúdo e armazenamento. As contribuições a seguir relacionam essas escolhas
a problemas de autoria e estudo, distinguindo o mecanismo implementado da
utilidade e dos efeitos que ainda precisam ser avaliados.

## 2. Distinções necessárias

| Conceito | Pergunta | Evidência apropriada |
| --- | --- | --- |
| novidade técnica | existe diferença verificável em relação a soluções anteriores? | comparação da arquitetura, das regras implementadas e das soluções anteriores documentadas |
| utilidade | a solução ajuda alguém a realizar uma tarefa relevante? | tarefas com usuários, erros, tempo, satisfação e análise qualitativa |
| usabilidade | pessoas específicas alcançam objetivos com eficácia, eficiência e satisfação em contexto definido? | avaliação baseada em contexto de uso e medidas correspondentes ([International Organization for Standardization (2018)](referencias.md#ref-iso2018usability)) |
| adequação pedagógica | objetivos, fundamentos, prática, feedback e representação estão coerentes? | rubrica, especialistas, estudantes e análise das tarefas |
| eficácia de aprendizagem | a intervenção melhora compreensão, retenção ou transferência? | desenho empírico com comparação, medidas válidas e incerteza |
| originalidade científica | o trabalho acrescenta conhecimento defensável além da instância? | síntese da literatura, avaliação e abstração dos resultados |

Uma implementação pode ser nova e pouco útil. Uma interface pode ser usável e
não melhorar aprendizagem. Um curso pode ser coerente segundo especialistas e
ainda produzir dificuldades imprevistas. Essas distinções impedem que testes de
software sejam apresentados como resultados educacionais.

## 3. Decisão sobre a unidade de contribuição

O AraLearn articula autoria, fontes e estudo. Uma pessoa pode conferir uma
explicação, revisar as unidades que a desenvolvem e examinar como o estudante
é convidado a usar o conhecimento. A contribuição pretendida envolve essa
relação: o planejamento precisa continuar reconhecível no conteúdo, nas
representações e na prática, inclusive durante o estudo no celular.

Essa coordenação aparece em três conjuntos de escolhas:

- **Desenho e realização:** o objetivo e o conhecimento necessário orientam a
  explicação e a produção das unidades, sem quantidade fixa de etapas. O
  [modelo didático](modelo-didatico.md) explica essas relações.
- **Autoria e inspeção:** o assistente consulta o contexto e os recursos
  disponíveis; a pessoa examina conteúdo, fontes e alcance das mudanças. As
  [regras de autoria](autoria-contextual.md) tornam essas decisões
  identificáveis.
- **Continuidade e responsabilidade:** a cópia local sustenta o estudo; as
  regras de acesso e de dados delimitam quem pode agir e que registros podem
  ser usados. A [arquitetura](arquitetura.md) e os [fundamentos de governança](fundamentos-pesquisa-e-governanca.md)
  desenvolvem essas escolhas.

A [revisão de literatura](revisao-de-literatura.md) reúne fundamentos para cada
relação. Como as fontes estudam outros artefatos e contextos, a configuração do
AraLearn precisa de avaliação própria. Um estudo pode isolar um mecanismo ou
examinar a coordenação entre vários deles. A segunda opção se aproxima do uso
completo, mas torna mais difícil atribuir o resultado a uma escolha específica.
Originalidade, utilidade, custo e aprendizagem continuam sendo perguntas
distintas.

## 4. Contribuições potenciais

### C1: arquitetura extensível de componentes didáticos

Incluir uma matriz, um fluxograma ou outra representação exige regras próprias
de conteúdo, apresentação e resposta. O AraLearn reúne essas regras em pacotes
independentes que seguem o mesmo contrato técnico. Esse contrato informa ao
aplicativo como reconhecer, validar e apresentar cada pacote, sem concentrar os
detalhes de todas as representações num único módulo. O [catálogo de
componentes](componentes-didaticos.md) descreve seus usos.

A contribuição potencial é um padrão de organização que facilite acrescentar
representações disciplinares preservando coerência e acessibilidade. Para
examiná-la, interessa comparar esforço de inclusão, dependências e estabilidade
com outras arquiteturas, inclusive em extensões realizadas por equipes
independentes. A DSR oferece um enquadramento para relacionar essa solução ao
problema e à avaliação ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience);
[Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)).

### C2: descoberta progressiva de contratos para autoria assistida

O assistente primeiro encontra recursos pela operação pretendida, como
comparar valores ou representar um procedimento, e depois recebe as regras do
componente escolhido. Essas regras formam o **contrato** do componente: dizem
que dados ele aceita e como deve ser usado. A consulta progressiva permite
começar pela necessidade didática, sem exigir que a pessoa conheça de antemão
todos os nomes e formatos técnicos. O [catálogo](componentes-didaticos.md)
explica as representações disponíveis.

A contribuição potencial é um método para recuperar informação de autoria
conforme a necessidade. Buscar documentos para compor o contexto de geração
é discutido por [Lewis et al. (2020)](referencias.md#ref-lewis2020rag); os erros
continuam dependendo da tarefa ([Ji et al. (2023)](referencias.md#ref-ji2023hallucination)).
Uma avaliação do AraLearn pode comparar a consulta progressiva à apresentação
do catálogo completo, examinando adequação da escolha, volume de contexto e
retrabalho humano.

Estudos situados de autoria educacional mostram instrutores e docentes
planejando, avaliando, adaptando e contextualizando saídas de IA
([Choi et al. (2024)](referencias.md#ref-choi2024vivid);
[Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha)). Esses estudos
situados não autorizam presumir ganho uniforme. Uma meta-análise encontrou
efeitos heterogêneos para combinações pessoa–IA e ausência de sinergia média
contra o melhor desempenho isolado; nas tarefas de criação, o efeito positivo
não foi estatisticamente significativo
([Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai)). Entrevistas com
57 docentes de oito escolas também descreveram conferência, reparo, reescrita,
rejeição e reconstrução de materiais produzidos por IA
([Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting)).

### C3: modelo didático operacional de microssequência

Uma unidade curta pode esconder pressupostos; uma sequência extensa pode
repetir informação sem aprofundar relações. O AraLearn dimensiona as etapas
pelo objetivo, pelos conhecimentos necessários e pela prática planejada. A
base explicativa conserva o desenvolvimento do conteúdo e suas fontes; as
unidades realizam o percurso de estudo.

A contribuição potencial é um modelo que permita discutir e revisar essa
passagem da base ao percurso. Os estudos sobre segmentação e microaprendizagem
mostram resultados e condições heterogêneos, sem uma cota universal de conteúdo
([Rey et al. (2019)](referencias.md#ref-rey2019segmenting);
[De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).

A avaliação pode começar pela coerência entre explicação, exemplos, prática e
retorno, usando critérios de julgamento explícitos. Perguntas posteriores
podem examinar compreensão, retenção ou transferência, conforme o objetivo.
Casos em que a segmentação quebra relações ajudam a delimitar o modelo.

### C4: prática incorporada a representações disciplinares

Uma tarefa pode pedir que o estudante complete uma célula da matriz, um termo
da fórmula ou uma etapa do diagrama. A resposta ocupa o lugar em que a relação
é lida. Os [componentes didáticos](componentes-didaticos.md) coordenam a notação,
os locais de resposta e o retorno; uma correspondência, por exemplo, pode ser
respondida por lacunas independentes dentro de um texto ou tabela.

A contribuição potencial é essa coordenação entre representação e interação.
Ela pode ser comparada a respostas apresentadas fora do objeto, observando
interpretação, erros e adequação à operação. A literatura sobre recuperação e
transferência ajuda a formular a tarefa, mas o benefício do mecanismo
específico permanece por avaliar ([Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval);
[Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)). A verificação técnica
confere separadamente se cada local de resposta mantém sua identidade e estado.

### C5: autoria estrutural e correção focal com escopo explícito

Planejar um curso e corrigir um exemplo exigem alcances diferentes. A autoria
começa por uma estrutura que a pessoa pode inspecionar; a produção prossegue
em partes. Ao revisar um ponto, o contexto inclui as unidades relacionadas,
para que uma correção de conceito possa alcançar também exemplos ou práticas
que dependem dele. As [observações](observacoes-pedagogicas.md) conservam a
localização das dúvidas e dos problemas apontados.

A contribuição potencial é um modo de coordenar autoria ampla e revisão
localizada, tornando visível o alcance da ação. Uma avaliação pode acompanhar
se autores preveem corretamente o que mudará, detectam alterações indevidas e
revisam conteúdo e fontes depois da gravação. O curso permanece editável, o que
permite retornar a pontos anteriores; o [protocolo de avaliação](protocolo-avaliacao-artefato.md)
explica como conservar a versão usada no estudo.

Diretrizes de interação entre pessoas e IA tratam de limites compreensíveis e
correção ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).
Um estudo de decisão assistida mostrou que solicitar reflexão pode reduzir
dependência excessiva e também acrescentar custo
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). Esse
resultado motiva examinar tanto o julgamento quanto o trabalho de inspeção,
sem pressupor que uma confirmação na interface assegure controle efetivo.

### C6: continuidade local e sincronização não bloqueante

O estudo móvel pode ocorrer sob conexão instável. O AraLearn conserva conteúdo
já sincronizado e ponto de estudo no dispositivo; a comunicação com o servidor
ocorre sem fazer a interação corrente esperar pela rede. A contribuição
potencial está em tratar continuidade e retomada como requisitos da arquitetura
educacional.

Testes de perda e retorno da conexão examinam disponibilidade, conflitos,
tempo de resposta e armazenamento. A continuidade humana exige outra
observação: encontrar o ponto e reconstruir o que se fazia. Estudos sobre
interrupção ajudam a formular essa pergunta
([Monk et al. (2008)](referencias.md#ref-monk2008resumption);
[Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)), enquanto
as condições específicas do AraLearn precisam ser examinadas em tarefas de
estudo e retomada.

### C7: propriedade, proveniência e dados proporcionais

Cada curso tem uma pessoa proprietária, que pode conceder acesso para estudo
e, separadamente, permitir uma cópia privada e independente. Fontes e âncoras
localizam os materiais usados; os [dados de autoria](analytics-instrucionais.md)
descrevem o conteúdo e as intervenções observáveis, sem coletar o comportamento
de estudo. Essas escolhas coordenam responsabilidade autoral, compartilhamento
e redução dos dados coletados.

Sua contribuição potencial depende de como operam em contextos reais. É
possível examinar compreensão das permissões, capacidade de revogação,
reconstrução das relações com fontes e consequências do uso dos registros.
Finalidade, transparência e responsabilidade são critérios pertinentes à
análise ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). Conflitos,
trabalho adicional e interpretações indevidas também integram a avaliação.

### C8: instrumentos reprodutíveis de auditoria

Um teste de apresentação pode revelar texto oculto; uma análise disciplinar
pode revelar uma relação incorreta; uma tarefa com participantes pode mostrar
como a representação é interpretada. A [matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md)
relaciona esses exames conservando o que cada evidência sustenta.

A contribuição potencial inclui critérios, casos e procedimentos que outras
equipes possam usar para investigar artefatos educacionais. Seu valor precisa
ser examinado pela clareza das definições, pela capacidade de identificar
problemas e, quando houver classificação, pela consistência entre avaliadores.
A finalidade formativa ou somativa e o contexto da avaliação orientam essa
escolha ([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

## 5. Relação com classes de sistemas existentes

Para alegar vantagem, é preciso definir quais soluções serão comparadas e por
quais critérios. A tabela organiza classes funcionais que ajudam a formular
essa comparação; ela não funciona como inventário de todos os produtos nem como
afirmação de exclusividade.

| Classe | Capacidade frequentemente central | Questão comparativa para o AraLearn |
| --- | --- | --- |
| sistema de gestão da aprendizagem (LMS) | matrícula, distribuição, atividade e registro institucional | propriedade do curso e acesso direto preservam responsabilidade sem burocratizar o estudo? |
| flashcards e prática | recuperação, repetição e retorno após a resposta | microssequências e componentes estruturados acrescentam profundidade sem perder fluidez? |
| ferramentas de autoria | edição visual e publicação | catálogo progressivo e contratos tornam escolhas representacionais mais coerentes? |
| bibliotecas de visualização | renderização especializada | pacotes de componente integram convenção, prática, edição e acessibilidade além da figura isolada? |
| aplicações com cópia local | trabalho no dispositivo e envio posterior ao servidor | a arquitetura mantém continuidade e resolve conflitos com custo proporcional? |
| assistência por modelo de linguagem | geração e transformação de conteúdo | escopo explícito, validação e revisão contextual reduzem mudanças indevidas sem criar controle apenas simbólico? |
| análise de dados educacionais | descrição, previsão e intervenção | que perguntas úteis podem ser respondidas com dados mínimos, definições explícitas e participação adequada? |

Uma revisão comparativa deve definir corpus, critérios de inclusão, data de
busca e unidade de comparação. “Não foi encontrado” é diferente de “não
existe”.

## 6. Níveis de alegação

### 6.1 Alegações sustentáveis por inspeção e teste técnico

Inspeção e teste técnico sustentam afirmações sobre o que o artefato faz numa
versão e num cenário reproduzíveis. Podem demonstrar, por exemplo, que o núcleo
e os pacotes de componente estão separados, que a autoria consulta o catálogo
antes de receber o contrato escolhido e que um percurso previamente
sincronizado permanece acessível nos cenários testados sem conexão. O mesmo
tipo de evidência verifica regras dos dados, limites de edição, estados de revisão e
apresentação geométrica. O teste registra sempre a versão e o caso coberto.

### 6.2 Alegações que exigem avaliação de uso

Compreender o efeito dessas propriedades sobre uma tarefa exige observar
pessoas. Uma avaliação de uso pode investigar, por exemplo, se autores leigos
compreendem o catálogo e o alcance de uma revisão, se a assistência reduz
retrabalho ou se o estado local ajuda alguém a retomar o estudo. Questões sobre
responsabilidade e utilidade das observações também pertencem a esse nível.

### 6.3 Alegações sobre aprendizagem, esforço e experiência

A medida acompanha o resultado alegado. Para examinar aprendizagem, a pesquisa
pode observar compreensão, retenção ou transferência em tarefas pertinentes.
Para examinar carga cognitiva ou ansiedade, precisa de definições e
instrumentos próprios desses construtos. Tempo ou nota, isoladamente, não
resolvem essa escolha.

| Alegação a investigar | Evidência a planejar |
| --- | --- |
| a progressão ajuda a compreender relações | tarefa de explicação ou aplicação, com comparação adequada |
| a prática favorece retenção | desempenho posterior, com intervalo e apoio identificados |
| o retorno ajuda a usar o conhecimento em outro problema | tarefa que demande transferência e análise da ação após o retorno |
| uma representação reduz demanda dispensável | comparação de apresentações com tarefa equivalente e avaliação da carga |
| a política sem penalização altera estratégia ou ansiedade | observação das estratégias e instrumento pertinente à experiência afetiva |

### 6.4 Alegações que exigem comparação definida com alternativas pertinentes

Uma afirmação de novidade situa a solução entre antecedentes encontrados por
uma busca documentada. Uma afirmação de vantagem compara alternativas segundo
critérios relevantes, como esforço de autoria, qualidade do conteúdo ou custo
de manutenção. O resultado conserva as versões, tarefas, pessoas e condições
examinadas; não estabelece superioridade universal.

Cada critério limita a conclusão alcançada. Um esquema de dados válido sustenta
a estrutura da gravação; correção factual e fidelidade às fontes exigem inspeção
do conteúdo. A redução da telemetria comportamental diminui uma categoria de
coleta; justiça e privacidade dependem também das finalidades, dos acessos e das
consequências do uso. Os [fundamentos de
governança](fundamentos-pesquisa-e-governanca.md) desenvolvem essas relações.

## 7. Resultados contrários e contribuição negativa

Conhecimento de desenho também pode surgir quando uma solução não funciona.
Um componente pode introduzir uma convenção que o público não compreende; uma
segmentação pode romper relações conceituais; um controle de IA pode produzir
apenas a aparência de decisão humana. Falhas de sincronização e indicadores sem
interpretação legítima pertencem ao mesmo conjunto de resultados contrários.

Esses resultados devem registrar contexto, mecanismo esperado, observação,
explicações rivais e decisão resultante: manter, restringir, fundir, redesenhar
ou retirar. Relatar casos negativos reduz viés de sobrevivência e delimita onde
um princípio pode ser transferido.

## 8. Estrutura de uma alegação responsável

Uma alegação responsável conserva o caminho entre problema, solução e
evidência:

| Etapa | Registro necessário |
| --- | --- |
| delimitação | problema, contexto, alternativas e requisitos |
| desenho | decisão, mecanismo implementado e fundamento externo |
| avaliação | procedimento, resultado observado, incerteza e explicações rivais |
| alcance | consequências e limites de transferência |

Quando não houver resultado empírico, a cadeia termina em hipótese e protocolo.
O [Protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md) define
como avançar dessa hipótese para evidência. A [Revisão de
literatura](revisao-de-literatura.md), o [Quadro teórico](quadro-teorico.md) e a
[Matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md) sustentam a
cadeia documental. As referências completas estão em
[`referencias.bib`](referencias.bib).

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [Choi et al. (2024)](referencias.md#ref-choi2024vivid): Seulgi Choi; Hyewon Lee; Yoonjoo Lee; Juho Kim (2024). **VIVID: Human–AI Collaborative Authoring of Vicarious Dialogues from Lecture Videos.** In: *Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems*, Association for Computing Machinery, p. 1–26.
- [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning): Jennie Chang De Gagne; Hyeyoung Kate Park; Katherine Hall; Amanda Woodward; Sandra Yamane; Sang Suk Kim (2019). **Microlearning in Health Professions Education: Scoping Review.** *JMIR Medical Education*, 5(2), p. e13997.
- [Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha): Deepak Varuvel Dennison; Bakhtawar Ahtisham; Kavyansh Chourasia; Nirmit Arora; Rahul Singh; René F. Kizilcec; Akshay Nambi; Tanuja Ganu; Aditya Vashistha (2026). **Shiksha Copilot: Teacher–AI Collaboration for Curating and Customizing Lesson Plans in Low-Resource Schools.** *Proceedings of the ACM on Human-Computer Interaction*, 10(2), p. 1–47.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption): Cyrus K. Foroughi; Nicole E. Werner; Elizabeth T. Nelson; Deborah A. Boehm-Davis (2016). **Individual Differences in Working-Memory Capacity and Task Resumption Following Interruptions.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 42(9), p. 1480–1488.
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [International Organization for Standardization (2018)](referencias.md#ref-iso2018usability): International Organization for Standardization (2018). **ISO 9241-11:2018: Ergonomics of Human-System Interaction — Part 11: Usability: Definitions and Concepts.** ISO 9241-11:2018.
- [Ji et al. (2023)](referencias.md#ref-ji2023hallucination): Ziwei Ji; Nayeon Lee; Rita Frieske; Tiezheng Yu; Dan Su; Yan Xu; Etsuko Ishii; Ye Jin Bang; Andrea Madotto; Pascale Fung (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys*, 55(12), p. 1–38.
- [Lewis et al. (2020)](referencias.md#ref-lewis2020rag): Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474.
- [Monk et al. (2008)](referencias.md#ref-monk2008resumption): Christopher A. Monk; J. Gregory Trafton; Deborah A. Boehm-Davis (2008). **The Effect of Interruption Duration and Demand on Resuming Suspended Goals.** *Journal of Experimental Psychology: Applied*, 14(4), p. 299–313.
- [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer): Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting): Neil Selwyn; Marita Ljungqvist; Anders Sonesson (2025). **When the Prompting Stops: Exploring Teachers' Work Around the Educational Frailties of Generative AI Tools.** *Learning, Media and Technology*, 50(3), p. 310–323.
- [Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai): Michelle Vaccaro; Abdullah Almaatouq; Thomas Malone (2024). **When Combinations of Humans and AI Are Useful: A Systematic Review and Meta-Analysis.** *Nature Human Behaviour*, 8, p. 2293–2303.
- [Venable et al. (2016)](referencias.md#ref-venable2016feds): John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.

<!-- referências locais: fim -->
