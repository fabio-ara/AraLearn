# Fundamentos e evidências

Este documento explica por que o AraLearn existe do modo como existe. Ele não foi escrito para carimbar decisões com um selo abstrato de legitimidade, nem para esconder escolhas do produto atrás de um vocabulário técnico excessivamente seco. O propósito é mais simples e mais exigente: explicitar de onde vêm as direções do projeto, em que literatura elas se apoiam, que experiências de produto e de estudo elas procuram responder e até onde convém falar com segurança.

O AraLearn parte de uma situação histórica relativamente clara. A dificuldade contemporânea já não está apenas em acessar informação. A dificuldade está em convertê-la em percurso. A web, a documentação pública, as redes, os vídeos, as plataformas de curso e os modelos de linguagem multiplicaram a disponibilidade de explicações, exemplos e respostas. Mesmo assim, quem quer aprender continua frequentemente preso a um impasse muito concreto: há material demais, formatos demais, promessas demais e organização de menos. O estudante pode encontrar quase tudo, mas ainda não sabe por onde começar, como sequenciar, o que praticar primeiro, o que retomar depois e como transformar abundância em continuidade.

O AraLearn responde a esse problema organizando o estudo em níveis explícitos e em unidades de progressão local. Isso o aproxima mais de uma tecnologia de externalização da organização cognitiva do que de um simples gerador de texto. Em vez de competir com a web em abundância informacional, a aplicação tenta oferecer forma estudável.

## Estrutura, percurso e unidade

A hierarquia `curso -> módulo -> lição -> microssequência -> card` não é apenas escolha de navegação. Ela traduz uma posição epistemológica e didática. Em termos próximos do estruturalismo, uma unidade não se define só por sua matéria, mas também pela posição que ocupa em um sistema de relações. Saussure mostrou, no campo da linguagem, que o valor de um signo depende de diferenças e articulações internas. No AraLearn, algo análogo aparece no nível do produto: um card isolado perde grande parte de seu valor se não estiver inscrito numa microssequência; uma microssequência perde parte de sua função se não estiver situada numa lição; e assim por diante.

Essa opção também responde a uma realidade prática. Muitas ferramentas tratam o estudo como acúmulo de itens ou como repositório indiferenciado de notas. O AraLearn tenta evitar os dois extremos: nem coleção plana de perguntas, nem acervo passivo de páginas. O que interessa é a passagem de material disponível para progressão executável.

## Microunidades e microlearning

O AraLearn trabalha com microunidades, mas não adere a uma caricatura de microlearning segundo a qual qualquer fragmentação seria automaticamente boa. A literatura sobre microlearning sugere utilidade de unidades pequenas sobretudo em contextos móveis, em ambientes de retomada frequente e em cenários em que o estudante precisa encaixar sessões de estudo em rotinas fragmentadas. Ao mesmo tempo, a mesma literatura mostra que fragmentar não basta. Uma unidade pequena pode ser precisa, progressiva e produtiva; mas pode ser também superficial, arbitrária ou desconectada.

Por isso, o AraLearn não trata o pequeno como valor em si. O valor está em uma unidade pequena o bastante para caber no uso real, mas densa o bastante para ensinar alguma coisa. Em termos de produto, isso significa que a microssequência precisa ter tema delimitado, progressão local e alguma forma de evidência de domínio. O objetivo não é miniaturizar qualquer assunto, mas decompor o necessário para que o estudante consiga operar.

Essa direção encontra respaldo em estudos sobre microlearning em ensino superior e aprendizagem móvel, mas o app a articula com uma hierarquia maior justamente para evitar o falso dilema entre fragmento e percurso amplo.

## Recuperação ativa, prática e revisão

Uma influência central do AraLearn está no conjunto de estudos sobre retrieval practice, test-enhanced learning e estratégias de estudo de maior utilidade. Roediger e Karpicke mostraram que a recuperação ativa pode melhorar retenção de longo prazo. Dunlosky e colegas, em revisão amplamente citada, colocam `practice testing` e `distributed practice` entre as técnicas mais promissoras em comparação com releitura passiva ou resumo genérico.

No plano do produto, isso ajuda a justificar uma decisão forte: o AraLearn não deve ter como finalidade principal condensar um tema em prosa ampla. Ele deve converter partes do conteúdo em ações cognitivas executáveis: reconhecer, completar, discriminar, escolher, resolver, explicar, comparar, retomar. Isso não elimina explicação; desloca sua função. Explicação deixa de ser ponto final e passa a ser mediação para ação.

Essa escolha também ajuda a entender a proximidade do AraLearn com produtos como Anki, embora o projeto não se reduza a um sistema de flashcards espaçados. O que ele retoma desse universo é a centralidade da recuperação ativa e da revisão; o que procura acrescentar é contexto didático, progressão local e integração com organização autoral.

## Exemplo resolvido, mediação e carga cognitiva

A literatura sobre worked examples e carga cognitiva ajuda a explicar outra decisão importante do produto: evitar, sobretudo para iniciantes, o salto abrupto de definição abstrata para cobrança autônoma. Sweller e Cooper, assim como a literatura posterior sobre example-based learning e instructional design, sustentam que exemplos resolvidos e casos guiados podem reduzir dificuldade improdutiva em fases iniciais da aprendizagem. A questão não é proteger o estudante de todo esforço, mas calibrar o esforço para que ele ocorra onde interessa.

Isso se articula com a insistência do AraLearn em manter contexto operacional junto da tarefa. Em termos de teoria da carga cognitiva, a separação desnecessária entre enunciado, notação, valores, figura, regra e solicitação aumenta carga extrínseca e exige integração mental adicional. Trabalhos sobre split-attention effect e integração instrucional reforçam essa preocupação. Quando o contexto necessário está disperso, a tarefa pode ficar mais difícil sem que essa dificuldade ensine algo relevante.

É por isso que o app insiste tanto em manter, no mesmo ponto de estudo, os elementos voláteis necessários à execução. Não se trata de capricho visual. Trata-se de reduzir custo desnecessário de memória de trabalho e de facilitar a continuidade do raciocínio, especialmente em uso móvel e em condições de fadiga.

## Meticulosidade contra resumo raso

Uma consequência direta dessas influências é a noção de meticulosidade adotada pelo AraLearn. Meticulosidade, aqui, não é prolixidade. Também não é o acúmulo de cards sem critério. O termo nomeia uma disciplina de decomposição: dizer o ponto certo, preparar a notação, mostrar um caso, trabalhar erro comum, variar a prática quando a variação acrescenta algo, verificar domínio e registrar lacunas reais.

Essa posição tem parentesco com uma crítica já presente em muitos ambientes de aprendizagem contemporâneos: explicações fluentes demais podem produzir sensação de entendimento sem que o estudante tenha de fato operado com o conteúdo. Em um cenário saturado por respostas imediatas, o risco não é só a falta de informação; é o excesso de texto aparentemente satisfatório e didaticamente inerte. O AraLearn reage a esse risco preferindo percurso a síntese indistinta.

## Top-down e bottom-up

Outra decisão central do produto é combinar dois movimentos. O primeiro é top-down: estruturar cursos, módulos e lições quando o problema é a organização de um conjunto maior de materiais. O segundo é bottom-up: atuar localmente sobre uma dúvida, uma operação, um erro ou uma lacuna já identificados dentro de uma lição.

Esse desenho responde a duas formas reais de desorientação. A primeira é macro: a pessoa tem material demais e não sabe montar uma trilha. A segunda é micro: a trilha existe, mas um ponto local trava o estudo. Em ambos os casos, a ferramenta precisa ajudar sem obrigar o usuário a reconstruir tudo do zero.

A escolha também se relaciona ao comportamento observado em modelos de linguagem. Na prática, pedidos muito amplos tendem a produzir deriva, repetição e perda de precisão, principalmente em modelos leves. Pedidos localizados, com contexto já calibrado e restrições fortes, tendem a sair melhores. Isso ajuda a explicar por que o AraLearn, mesmo oferecendo geração top-down, opera de modo especialmente cuidadoso no fluxo bottom-up de cards e microssequências.

## Modelos de linguagem, linguagem controlada e decomposição da tarefa

O papel da IA no AraLearn não pode ser entendido sem essa constatação: fluência textual não equivale a confiabilidade estrutural, fidelidade conceitual ou qualidade didática. A literatura sobre controlled natural language mostra há muito tempo que a passagem confiável entre linguagem natural livre e estrutura formal é problemática; por isso, sistemas que exigem robustez frequentemente reduzem vocabulário, formato e escopo. Trabalhos como RECON e RuleCNL ilustram bem essa direção.

Ao mesmo tempo, pesquisas sobre heurísticas superficiais em NLP, como HANS, mostram que mesmo modelos fortes podem acertar por pistas frágeis ou razões erradas. Isso não torna os modelos inúteis, mas impede tratá-los como intérpretes transparentes do significado.

No AraLearn, a consequência é clara: o modelo de linguagem não desenha livremente a didática. O app define hierarquia, contexto, plano determinístico dos cards, formatos permitidos, validação local e aplicação do resultado. A LLM entra como componente gerador sob restrição. Essa opção é tanto técnica quanto metodológica. Técnica, porque melhora previsibilidade com modelos baratos ou leves. Metodológica, porque desloca parte da inteligência da operação para a arquitetura, em vez de atribuí-la ao mistério do prompt.

## A justificação técnica das checagens locais

A camada que o produto passou a tratar como checagens locais de qualidade didática precisa ser descrita com precisão. Se for apresentada como se o app compreendesse pedagogicamente qualquer texto livre, a formulação perde crédito. Se for apresentada como mera perfumaria sem efeito operacional, a descrição também fica falsa.

O ponto correto está no meio. O AraLearn combina:

- checagens estruturais, como forma, posição, esquema e coerência local do resultado;
- checagens declarativas, como cobertura registrada, prática ausente, variação insuficiente e redundância sem nova função;
- sinais textuais fracos, como referências instáveis, linguagem de bastidor, genericidade evidente ou resposta revelada de maneira imprópria.

As duas primeiras camadas são mais defensáveis para uma máquina determinística. A terceira não deve ser exagerada. Ela serve como indício e contenção, não como leitura semântica forte. Essa arquitetura não elimina limitação; ela a torna explícita. Em vez de fingir interpretação humana, o AraLearn trabalha com o que um motor local pode verificar de modo plausível e usa a continuação automática apenas quando a base da decisão é suficientemente forte.

## Local-first, autonomia e rastreabilidade

O compromisso local-first também não é detalhe. A literatura recente sobre local-first software insiste em autonomia do usuário, posse dos dados, continuidade offline e resistência a dependências excessivas da nuvem. No caso do AraLearn, isso interessa duplamente. Interessa por razões técnicas, porque estudo e revisão não deveriam desaparecer quando a conexão oscila. E interessa por razões políticas, porque uma ferramenta educacional que registra percurso, erro, progresso e revisão deve tratar esses dados com cuidado especial.

Aqui a reflexão crítica continua pertinente. Foucault lembra que tecnologias de registro e acompanhamento não são neutras só porque parecem úteis. Em ambiente educacional, qualquer infraestrutura que acompanhe trajetórias pode ampliar autonomia ou reforçar normalização. O AraLearn responde a isso privilegiando controle local, exportabilidade, reversibilidade e documentação explícita do que a IA faz e do que o app valida.

## Experiência de uso e redução de atrito

A direção de UI e UX do AraLearn também deve ser lida à luz desse contexto. O público imaginado pelo projeto não é um usuário descansado, com tempo ilimitado para aprender a própria ferramenta antes de começar a estudar. A figura mais forte aqui é a do estudante trabalhador cansado, que já lida com excesso de demanda, interrupção e pouco tempo disponível.

Desse ponto de vista, reduzir atrito não é apenas “embelezar a interface”. É oferecer estrutura externa utilizável com curva de uso mínima. Isso explica várias escolhas do app: hierarquia estável, ações concentradas no nível adequado, separação entre rascunho e estudo, geração contextual em vez de conversa livre, revisão no mesmo ambiente e persistência local. Produtos como Duolingo, Obsidian, Wikipédia e Git aparecem aqui não como modelos a serem copiados integralmente, mas como referências de problemas e soluções: recorrência, organização pessoal, estrutura aberta, versionamento, reversibilidade.

## O que o AraLearn pode afirmar com segurança

O AraLearn pode afirmar com segurança que foi desenhado para restringir o papel da LLM, transformar informação em percurso estruturado, favorecer prática ativa, reduzir parte da carga extrínseca desnecessária e manter o controle do projeto no lado local do usuário. Pode afirmar também que suas escolhas dialogam com literatura robusta sobre recuperação ativa, feedback, worked examples, carga cognitiva, microlearning, linguagem controlada e software local-first.

O que ele não deve afirmar é que já provou empiricamente, em seu próprio contexto, todos os ganhos específicos que promete como horizonte. Há questões que continuam abertas e que merecem avaliação situada: quantidade ideal de etapas por domínio, limiares finos das checagens textuais, efeito dos presets de rigor, ganho líquido da continuação automática sobre revisão apenas manual e impacto do `domainMap` sobre retenção real. Reconhecer isso não enfraquece o projeto. Ao contrário: torna sua documentação mais séria.

## Referências

Aprendizagem, prática e feedback:

- Roediger, H. L., & Karpicke, J. D. (2006). *Test-enhanced learning: taking memory tests improves long-term retention*. Psychological Science. https://pubmed.ncbi.nlm.nih.gov/16507066/
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). *Improving Students’ Learning With Effective Learning Techniques*. APS. https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html/comment-page-1
- Hattie, J., & Timperley, H. (2007). *The Power of Feedback*. Review of Educational Research. https://assess.ucr.edu/sites/g/files/rcwecm2336/files/2019-02/hattietimperley_2007.pdf
- Wisniewski, B., Zierer, K., & Hattie, J. (2020). *The Power of Feedback Revisited: A Meta-Analysis of Educational Feedback Research*. Frontiers in Psychology. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.03087/full
- Sweller, J., & Cooper, G. A. (1985). *The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra*. https://onderwijs.felienne.nl/vakdidactiek/materiaal/sweller_worked_examples.pdf
- van Gog, T. (2018). *Learning How to Solve Problems by Studying Examples*. https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/632DFF3E1B3166EB325A59BD6028B6EA/9781108416016c8_183-208.pdf/learning-how-to-solve-problems-by-studying-examples.pdf
- Paas, F., & van Merriënboer, J. J. G. (2020). *Cognitive-Load Theory: Methods to Manage Working Memory Load in the Learning of Complex Tasks*. Current Directions in Psychological Science. https://journals.sagepub.com/doi/10.1177/0963721420922183
- Chandler, P., & Sweller, J. (1991). *Cognitive Load Theory and the Format of Instruction*. Cognition and Instruction. https://www.tandfonline.com/doi/abs/10.1207/s1532690xci0804_2

Microlearning e aprendizagem móvel:

- Mohammed, G. S., Wakil, K., & Nawroly, S. S. (2018). *The effectiveness of microlearning to improve students’ learning ability*. https://doi.org/10.3991/ijim.v12i3.7983
- Rof, A., et al. (2024). *Exploring learner satisfaction and the effectiveness of microlearning in higher education*. The Internet and Higher Education, 62, 100952. https://repositori.tecnocampus.cat/bitstream/handle/20.500.12367/2941/rof_internethigheduc_expl.pdf?isAllowed=y&sequence=1
- Sankaranarayanan, S., et al. (2024). *A systematic review of mobile-based microlearning in adult learner contexts*. https://doaj.org/article/b6b940948b034e489c5bd28c73307897

LLM, linguagem controlada e limites semânticos:

- Neuhaus, F., & Barkmeyer Jr., E. (2013). *RECON -- A Controlled English for Business Rules*. NIST. https://www.nist.gov/publications/recon-controlled-english-business-rules
- Njonko, P. B. F., Cardey, S., Greenfield, P., & El Abed, W. (2014). *RuleCNL: A Controlled Natural Language for Business Rule Specifications*. https://arxiv.org/abs/1406.2096
- McCoy, T., Pavlick, E., & Linzen, T. (2019). *Right for the Wrong Reasons: Diagnosing Syntactic Heuristics in Natural Language Inference*. ACL Anthology. https://aclanthology.org/P19-1334/

Arquitetura local-first e accountability:

- Kleppmann, M., Wiggins, A., van Hardenberg, P., & McGranaghan, M. (2019). *Local-first software: You own your data, in spite of the cloud*. https://www.inkandswitch.com/essay/local-first/
- Haas, D., et al. (2023). *LoRe: A Programming Model for Verifiably Safe Local-First Software*. https://arxiv.org/abs/2304.07133
- Høiland-Jørgensen, M., et al. (2021). *Augmenting SQLite for Local-First Software*. https://munin.uit.no/handle/10037/24430
- Garshi, A., Jakobsen, M. W., Nyborg-Christensen, J., Ostnes, D., & Ovchinnikova, M. (2020). *Smart technology in the classroom: a systematic review. Prospects for algorithmic accountability*. https://arxiv.org/abs/2007.06374

Referências intelectuais e de contexto:

- Saussure, F. de. *Curso de Linguística Geral*.
- Foucault, M. *Vigiar e Punir*; *A Arqueologia do Saber*.
- Lyotard, J.-F. *A condição pós-moderna*.
