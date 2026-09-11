# Fundamentos de pesquisa e governança

## O que está sendo investigado

O AraLearn é, ao mesmo tempo, uma aplicação em desenvolvimento e um objeto de
pesquisa em design instrucional e tecnologia educacional. Nele, uma pessoa cria
um curso com assistência de inteligência artificial (IA), inspeciona o material
e confere sua relação com as fontes. O curso organiza explicações e atividades
para estudo autodidata no celular.

Investigar esse artefato envolve perguntas sobre o software, o desenho
instrucional e seu uso por pessoas. O funcionamento sem conexão pode ser
verificado no software; saber se ele favorece a continuidade ou a aprendizagem
exige pesquisa em condições de uso definidas. A literatura fundamenta conceitos
e hipóteses, enquanto a avaliação examina o que ocorre numa versão do produto.

## Governança da pesquisa

A governança da pesquisa reúne responsabilidades e procedimentos para manter
sua qualidade e integridade ao longo do trabalho. O Código Europeu de Conduta
para a Integridade da Pesquisa organiza esse compromisso em torno de
confiabilidade, honestidade, respeito e responsabilização
([ALLEA (2023)](referencias.md#ref-allea2023integrity)).

No AraLearn, esses princípios orientam o registro da origem e do alcance das
afirmações. Uma decisão do projeto precisa permanecer distinguível do
conhecimento publicado e dos resultados de uma avaliação. A classificação
abaixo é uma convenção documental do projeto para manter essas diferenças.

Para cada afirmação relevante, o registro precisa permitir reencontrar sua
origem e seu alcance. Quando a afirmação depender de uma versão do produto ou
de uma avaliação, essa versão e a evidência correspondente também são
registradas. O protocolo de cada estudo define ainda quais dados serão usados,
quem poderá acessá-los e até onde a conclusão poderá chegar.

## Estados epistêmicos

“Epistêmico” refere-se ao estatuto de uma afirmação como conhecimento.

Considere a afirmação “o funcionamento sem conexão reduz o abandono”. Ela contém
duas relações distintas:

| Afirmação | Evidência necessária |
| --- | --- |
| o conteúdo está disponível sem rede | inspeção e teste da propriedade técnica |
| a disponibilidade sem rede altera continuidade ou abandono | população, comparação e medida definidas num estudo |

O teste de rede pode sustentar a primeira; não pode sustentar a segunda.
A conclusão sobre continuidade precisa identificar as pessoas, as condições
comparadas e o resultado observado. Até essa avaliação, a relação permanece
uma hipótese do projeto.

A documentação distingue seis estados para tornar esse alcance reconhecível:

| Estado | Definição | Evidência necessária | Linguagem adequada |
| --- | --- | --- | --- |
| **evidência externa** | resultado ou argumento publicado fora do AraLearn | fonte identificável e limites de população, tarefa e método | “a revisão encontrou...”, “o estudo observou...” |
| **inferência teórica** | relação argumentada entre literatura e contexto do produto | encadeamento explícito e alternativas | “isso torna plausível...”, “pode ser relevante...” |
| **hipótese de design** | relação falseável entre contexto, mecanismo e resultado | comparação, medida e critério de revisão propostos | “a hipótese é que...” |
| **decisão de produto** | escolha pedagógica, normativa ou arquitetural vigente | problema, alternativas, fundamento e consequências | “o AraLearn adota...” |
| **propriedade implementada** | comportamento demonstrável do artefato | código, esquema de dados, teste, inspeção ou medição | “a versão implementa...” |
| **resultado empírico** | achado produzido em avaliação documentada | participantes ou corpus, procedimento, análise e incerteza | “nestas condições, observou-se...” |

## Objeto, contexto e delimitação

O objeto investigado reúne a autoria de cursos e o estudo no celular. O
conteúdo percorre vários níveis, do curso às unidades de estudo. Entre eles, a
microssequência desenvolve um objetivo delimitado ao longo de etapas, como
descreve o [modelo didático](modelo-didatico.md). Depois de sincronizado, o
material necessário ao estudo permanece no dispositivo, enquanto as trocas com
o servidor ocorrem sem interromper a ação local. Essa arquitetura é chamada
*local-first* e está desenvolvida em [armazenamento e
sincronização](persistencia-relacional.md#sincronização-e-concorrência-no-dispositivo).

O contexto prioritário inclui pessoas adultas que conciliam trabalho e estudo,
usam o celular em períodos breves e podem sofrer interrupções ou perder a
conexão.

Essa prioridade é uma **delimitação de design**, não uma descrição empírica de
todos os usuários. Cada avaliação precisa caracterizar sua própria população,
incluindo experiência com tecnologia, domínio de conhecimento, dispositivo,
condições de rede e contexto de uso.

Disponibilizar conteúdo é apenas uma parte do problema. A investigação precisa
relacionar três frentes:

| Frente | Problema central |
| --- | --- |
| aprendizagem | construir explicações profundas e distribuir suas etapas sem romper relações; escolher representações e atividades que correspondam ao que se pretende aprender |
| continuidade | permitir estudo e retomada sob interrupção ou perda de conexão, com custo e manutenção proporcionais |
| autoria e governança | usar IA sem deslocar a responsabilidade humana e manter propriedade, acesso e dados sob regras compreensíveis |

## Pergunta orientadora e subproblemas

Uma pergunta ampla capaz de organizar o programa é:

> Como projetar e avaliar a autoria assistida por IA, a inspeção humana e o
> estudo autodidata no celular em condições de tempo fragmentado e conectividade
> variável, preservando coerência pedagógica, vínculo com as fontes e controle
> humano sobre o conteúdo?

Uma única pesquisa não conseguiria responder a toda a pergunta. Estudos
delimitados podem concentrar-se em três conjuntos de subproblemas:

| Eixo | Perguntas possíveis |
| --- | --- |
| aprendizagem e continuidade | Como a progressão sustenta compreensão, retenção e transferência? Quando uma representação ajuda a executar a operação pretendida? Como o estado local favorece a retomada depois de uma interrupção? |
| autoria assistida | Como a pessoa compreende o alcance de uma ação da IA, detecta erros de alvo e conserva controle sobre a correção? |
| governança e sustentação | Que regras de propriedade, acesso e uso de dados são legítimas? Como custo, armazenamento e manutenção evoluem sem comprometer segurança, acessibilidade e rigor? |

Cada estudo seleciona uma dessas relações e define sua própria unidade de
análise, suas medidas e as explicações alternativas pertinentes.

## Escolher o enquadramento da pesquisa

A pergunta orienta a escolha do método. Compreender como autores inspecionam
fontes pode requerer observação, entrevista e análise dos materiais de um caso.
Investigar como aperfeiçoar essa prática pode envolver ciclos de intervenção;
estimar o efeito de uma mudança exige uma comparação capaz de examinar outras
explicações. O [guia de investigação](guia-pesquisador.md#da-pergunta-ao-método)
apresenta essas possibilidades, desenvolvidas no [protocolo de avaliação](protocolo-avaliacao-artefato.md#escolher-uma-estratégia-de-investigação).

### Design-Based Research

A pesquisa baseada em design, ou **DBR** (*Design-Based Research*), articula a
criação e a investigação de intervenções educacionais em contexto. Por exemplo,
um estudo pode acompanhar autores, examinar dificuldades na inspeção de
fontes, modificar o apoio oferecido e investigar o que muda num novo ciclo.
A contribuição envolve tanto a intervenção quanto a compreensão das condições
em que ela opera ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased);
[Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).

### Design Science Research

A pesquisa em ciência do design, ou **DSR** (*Design Science Research*),
relaciona um problema relevante à construção e à avaliação de um artefato.
No AraLearn, pode investigar uma solução para conservar conteúdo e fontes
inspecionáveis durante a autoria. Sua avaliação pode reunir testes do software
e uso por pessoas, conforme a contribuição pretendida
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience);
[Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). O posicionamento da
contribuição considera o conhecimento anterior sobre o problema e as soluções
([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)).

### Relação entre DBR e DSR

DBR e DSR podem se complementar, mas a combinação precisa ser justificada.
Sua distinção não distribui automaticamente perguntas educacionais à primeira
e perguntas técnicas à segunda: ambas podem examinar uso, contexto e desenho.
O protocolo explicita a tradição adotada, a contribuição procurada e a relação
entre procedimentos e pergunta. Estudos interpretativos ou críticos também
podem investigar o AraLearn sem adotar nenhuma das duas.

A história do projeto e suas refatorações explicam como o produto se formou.
Para caracterizar um episódio como pesquisa, é preciso poder reconstruir a
pergunta, a versão, o contexto, o procedimento, a análise e a contribuição.
Uma revisão de interface pode fornecer material para um estudo; sua ocorrência,
isoladamente, não documenta um ciclo de investigação.

## Fundamentos que orientam o desenho

### Conteúdo, desenho e evidência

Considere uma microssequência destinada a interpretar uma taxa percentual.
Sua **base explicativa** desenvolve o raciocínio e liga as afirmações às fontes.
O **desenho instrucional** planeja como apresentar esse conhecimento e pedir
seu uso: um exemplo pode anteceder uma comparação de taxas e uma tarefa de
cálculo. As **unidades de estudo** realizam essas etapas no percurso. A
[organização didática](modelo-didatico.md) apresenta a relação completa.

Na revisão, é possível perguntar onde está o problema: a afirmação da base
está incorreta, falta um passo no exemplo ou a prática pede uma operação que
não foi desenvolvida? A [análise instrucional](desenho-instrucional-parametrizado.md)
acompanha o conhecimento que atravessa essas etapas, ajudando a localizar
lacunas. Separar base e realização é uma decisão do AraLearn; a hipótese é que
a distinção ajude autores a inspecionar e reformular o material.

Os registros também distinguem o que foi planejado do que foi produzido. Se a
pessoa muda a quantidade desejada de prática, a nova intenção orienta uma
produção posterior; a configuração das unidades já salvas conserva o que foi
usado nelas. A base possui sua própria versão e fontes. Essa separação permite
conferir qual conteúdo estava disponível numa avaliação e que decisão o
orientou. As [regras de autoria contextual](autoria-contextual.md) explicam o
alcance das mudanças e da declaração humana de revisão.

### Conjecturas da autoria contextual

As relações abaixo são hipóteses de desenho a investigar. Os critérios técnicos
comprovam funcionamento do artefato no cenário executado; os processos e
resultados humanos exigem avaliação com participantes e instrumentos próprios.

| Conjectura | Processo humano esperado | Prova técnica pertinente | Questão humana e risco a investigar |
| --- | --- | --- | --- |
| **Controle contextual:** decisões junto do objeto, com alcance e intenção/aplicado visíveis, podem reduzir erros de alvo | A pessoa prevê o efeito, escolhe o alcance e corrige uma decisão | Alterar apenas o alvo autorizado; manter objeto, foco, rolagem e rascunho ao abrir/fechar detalhes e receber resposta tardia | Autores compreendem a origem e o alcance? Ícones ou valores herdados podem ser interpretados incorretamente |
| **Conteúdo e realização separados:** base identificável e episódios ligados ao desenho podem facilitar inspeção e reformulação | A pessoa localiza a afirmação e decide se precisa mudar base, tarefa ou representação | Produzir/revisar base sem unidades; conservar fontes por alvo; preservar configuração aplicada e indicar reinspeção pertinente após mudança material | A separação ajuda a revisar ou cria duplicação e base excessiva? Unidades podem perder substância ou ficar desatualizadas |
| **Cadência transparente:** foco, cadência, revisão e diálogo independentes podem acomodar modos distintos de trabalho | A pessoa combina produção e inspeção sem perder as condições acordadas | Preferência pessoal nova não altera conteúdo ou condição fixada; cada revisão corresponde ao objeto salvo indicado | A pessoa reconhece os valores da combinação predefinida e o que realmente revisou? Pausa ou aceitação em lote podem gerar confirmação sem inspeção |
| **Apoio no Estudo:** base salva disponível sob demanda pode ajudar a recuperar pressupostos | O estudante reconhece uma lacuna, encontra o apoio e retoma a tarefa | Abrir a instância salva sem gerar conteúdo; manter ponto do percurso e acesso conforme os direitos | Novatos reconhecem quando consultar? Há riscos de recurso invisível, leitura passiva e dependência do apoio |

Uma avaliação particulariza a conjectura e observa o processo humano que ela
propõe. No exemplo do controle contextual, interessa examinar se a pessoa
prevê corretamente o que mudará e por que aceita ou rejeita uma proposta.

### Relação com a fundamentação educacional

A [revisão de literatura](revisao-de-literatura.md) discute carga cognitiva,
representações, prática, autorregulação e retorno. O [quadro teórico](quadro-teorico.md)
relaciona essas ideias a perguntas sobre o AraLearn. Nesta governança, interessa
conservar a razão da escolha e o que poderia levar à sua revisão. Se uma
representação foi escolhida para facilitar uma comparação, por exemplo,
avaliá-la exige examinar essa operação com pessoas e conteúdo pertinentes.
A aparência da tela informa outra dimensão da decisão.

### Responsabilidade na pesquisa assistida por IA

O uso de IA numa investigação sobre o AraLearn também precisa ser documentado:
quais tarefas foram assistidas, quais materiais foram enviados ao serviço e
como os resultados foram conferidos. O referencial do Ministério da Educação
para a pós-graduação e a pesquisa ressalta a avaliação crítica de fontes e
resultados, a transparência do uso e a responsabilidade final dos pesquisadores
(pp. 175–179;
[Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao)).

No protocolo particular, isso exige distinguir conteúdo proposto pelo
assistente, decisão do pesquisador e evidência obtida no estudo. A conferência
bibliográfica precisa alcançar a fonte pertinente à afirmação; uma referência
sugerida pelo modelo permanece candidata até ser verificada. As regras da
instituição, da avaliação ética e da publicação orientam a declaração e a
proteção dos materiais empregados.

## Proveniência bibliográfica

O arquivo [`referencias.bib`](referencias.bib) é a fonte bibliográfica
canônica. Uma referência entra nele depois da conferência de autoria, título,
ano e identificador persistente. Repositórios históricos, notas e buscas podem
servir à descoberta, mas não se tornam evidência externa sem conferência da
fonte original.

Uma revisão reproduzível futura deve registrar o protocolo fora do código do
produto. Isso inclui a consulta exatamente como executada, a deduplicação dos
resultados, a avaliação crítica das fontes e um fluxograma que mostre como os
resultados chegaram ao corpus final
([Peters et al. (2024)](referencias.md#ref-peters2024scoping);
[Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr)). O
[protocolo prospectivo ARA-LIT-1](revisao-de-literatura.md#protocolo-prospectivo-de-busca-e-atualização)
define o registro da base, do momento da busca, dos critérios e das contagens
necessárias para reconstruir esse percurso.

### Proveniência das fontes de um curso

A bibliografia desta documentação e as fontes usadas num curso cumprem funções
diferentes. No curso, cada material usado recebe uma identidade como **fonte**.
Uma **âncora** localiza a parte pertinente desse material, como uma página ou
um trecho. A **atribuição** liga essa localização à explicação, ao planejamento
ou à unidade de estudo que a utiliza e registra o tipo de relação entre eles. O
[capítulo sobre fontes e citações](fontes-e-citacoes.md) desenvolve essa cadeia.

Essa cadeia localiza o material usado e ajuda a reconstruir a decisão autoral.
A qualidade da fonte, a pertinência da atribuição e a fidelidade do conteúdo
derivado continuam dependendo de leitura e julgamento disciplinar. Quando uma
dessas qualidades fizer parte da pergunta de pesquisa, precisa de avaliação
própria.

## Governança de decisões

O [contrato de explicação e revisão humana](explicacao-e-revisao-humana.md)
e o [contrato contextual](autoria-contextual.md) separam conteúdo produzido,
intervenção humana, declaração de revisão e acesso. A implementação registra a
revisão das explicações e das unidades, vinculada ao conteúdo salvo, e distingue
uma declaração vigente daquela desatualizada por mudança material. O
[contrato de revisão](../src/domain/courseContentReview.js) explicita esses
estados; avaliar se a pessoa compreendeu e inspecionou adequadamente o objeto
exige observação do uso.

No contrato contextual, **revisão autoral** é uma declaração reversível ligada
ao conteúdo salvo que a pessoa afirma ter inspecionado. Uma mudança material
pode desatualizá-la. Edição, observação e revisão permanecem ações diferentes:
salvar altera o conteúdo; registrar uma observação preserva um comentário
situado; marcar a revisão registra a declaração. A avaliação do uso precisa
examinar se a inspeção realmente ocorreu e com que qualidade.

Revisão e acesso são decisões independentes. Quem possui acesso pode estudar
conteúdo completo salvo, mesmo quando ainda não há declaração de revisão. Uma
política opcional pode restringir o estudo ao material revisado. Propriedade,
visibilidade e direito aos arquivos seguem regras próprias; rascunhos locais e
gravações parciais permanecem fora do conteúdo disponibilizado. Registros
antigos sem declaração de revisão conservam esse estado de ausência.

### Registro mínimo

O registro de uma decisão permite compreender a escolha e retomá-la. Primeiro
descreve o problema, as alternativas consideradas e o que precisava ser
preservado. Depois identifica a decisão, seu fundamento e onde ela aparece no
produto. Por fim, registra consequências esperadas, custos, limites e o tipo de
evidência que poderia levar a uma revisão.

### Rastreabilidade separada

Uma mudança deixa rastros em lugares diferentes porque cada registro responde
a uma pergunta. A documentação pública conserva sua justificativa conceitual;
o registro operacional acompanha decisões e incidentes; o código e os testes
mostram como ela foi implementada. Quando há avaliação com pessoas ou cursos,
o protocolo e os dados autorizados registram o procedimento e seus resultados.

Uma justificativa formulada depois da decisão é identificada como tal. Essa
distinção conserva a história da escolha, inclusive quando uma hipótese falha
e o projeto precisa ser revisto.

## Governança de dados e ética

Coletar um dado só faz sentido depois de definir a pergunta que ele ajudará a
responder. A governança organiza essa preparação em três momentos:

| Momento | O que precisa ser definido |
| --- | --- |
| relação com a pesquisa | finalidade, resultado investigado, unidade de análise e manifestação que será observada |
| interpretação e ação | usos permitidos da medida, explicações alternativas e intervenção que ela poderia fundamentar |
| proteção e ciclo de vida | informação e consentimento necessários, acesso, retenção, exclusão, descarte, custo e risco |

Quando uma investigação brasileira em Ciências Humanas e Sociais estiver no
escopo da Resolução CNS nº 510/2016, informação, consentimento ou assentimento,
privacidade, confidencialidade, retirada e proteção diante de riscos seguem a
norma aplicável
([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)).
Essa autoridade é normativa; não demonstra que uma medida seja válida nem que
uma intervenção produza aprendizagem.

Disponibilidade técnica, portanto, não é critério de coleta. Registros como
cliques, tempo e conclusão precisam passar pelo mesmo exame de finalidade e
risco. A ética integra o desenho da análise desde esse primeiro momento
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)). Dados de pesquisa devem permanecer separados do banco
operacional sempre que o desenho e o risco assim exigirem.

### Finalidades educacionais e reutilização institucional

A governança precisa tornar discutíveis também os fins da tecnologia. As
[lentes críticas do quadro teórico](quadro-teorico.md#lentes-críticas-sobre-informação-e-poder),
apoiadas em [Lyotard (1984)](referencias.md#ref-lyotard1984postmodern) e
[Foucault (1995)](referencias.md#ref-foucault1995discipline), orientam perguntas
do projeto: que conhecimento é valorizado, quem define uma norma e quais
consequências seguem de tornar uma atividade visível?

Na análise do AraLearn, essas perguntas alcançam usos bastante concretos. A
quantidade de unidades descreve um material, e não a produtividade de quem o
criou. A conclusão de um percurso registra um estado do curso, e não o esforço
da pessoa. A disponibilidade no celular tampouco transforma todo intervalo
livre em tempo devido ao estudo. Esses limites precisam acompanhar qualquer
proposta de adoção institucional.

Um estudo sobre reutilização institucional precisa examinar as decisões
efetivas da organização e ouvir as pessoas afetadas. Condições de recusa e
contestação, efeitos adversos e distribuição do trabalho fazem parte do
resultado. Assim, uma alegação de benefício também identifica para quem ele
ocorre e que dependências ou restrições de autonomia o acompanham.
O [guia de investigação](guia-pesquisador.md#formular-caminhos-de-investigação)
apresenta uma forma de estudar essas relações sem tratá-las como efeitos já
constatados.

### Governança de condições comparáveis

Uma investigação pode usar cursos privados independentes para produzir
condições diferentes. O protocolo externo registra o que deve permanecer comum,
o que será alterado e qual versão foi efetivamente apresentada. Também define
quem participa, como cada condição é atribuída, quais instrumentos serão usados
e como a análise tratará dados ausentes.

Nesse registro, quatro relações continuam distinguíveis porque respondem a
perguntas diferentes. A **intenção atual** informa o que a pessoa autora deseja;
a **configuração aplicada** identifica o que efetivamente produziu cada unidade.
A **proveniência** permite reconstruir a origem e o histórico do material, e a
**declaração de revisão** registra qual versão uma pessoa conferiu. Uma nova
geração pode mudar linguagem, exemplos ou dificuldade junto com o parâmetro
escolhido. Por isso, copiar um curso e alterar um controle ainda requer conferir
todo o material exposto: sua explicação, fontes, unidades e formas de consultar
apoio. Modelo e configuração são registrados quando conhecidos; lacunas
permanecem indicadas como dados ausentes.

No produto, essas condições continuam sendo cursos editáveis independentes, e
não variantes experimentais bloqueadas. A separação reduz misturas acidentais;
equivalência semântica, fidelidade da exposição e validade causal dependem do
protocolo. Consulte [Comparar condições de
desenho](experimentos-instrucionais-parametrizados.md).

## Limitações atuais do programa

A revisão bibliográfica atual é narrativa, e cada estudo ainda precisa
caracterizar o público que efetivamente participa. O programa não dispõe de
evidência consolidada sobre eficácia educacional, nem sobre a transferência de
resultados entre áreas do conhecimento e instituições.

As versões também mudam: modelos, provedores e instruções de IA podem diferir
entre avaliações. Testes e inspeções do software sustentam propriedades
técnicas, enquanto compreensão e outras experiências humanas requerem medidas
próprias. Frugalidade depende de acompanhamento longitudinal.

Autoria coletiva, participação e usos institucionais do poder permanecem
frentes específicas de investigação. Resultados negativos e mecanismos
retirados precisam integrar o registro para que o programa não seja descrito
apenas por seus casos bem-sucedidos.

## Mapa do corpus acadêmico

| Função | Documento | Limite principal |
| --- | --- | --- |
| síntese do conhecimento externo | [Revisão de literatura](revisao-de-literatura.md) | revisão narrativa, não exaustiva |
| modelo conceitual e hipóteses | [Quadro teórico](quadro-teorico.md) | proposições ainda não são resultados |
| definições operacionais | [Glossário de construtos](glossario-construtos.md) | nomes do produto não se tornam construtos universais |
| teoria, decisão, código e avaliação | [Matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md) | teste técnico não demonstra aprendizagem |
| desenho de episódios | [Protocolo de avaliação](protocolo-avaliacao-artefato.md) | precisa ser particularizado e aprovado quando houver participantes |
| justificativa dos componentes | [Fundamentação pedagógica das representações](fundamentacao-pedagogica-dos-resources.md) | representação correta ainda exige avaliação de compreensão |
| contribuição possível | [Contribuição e originalidade](contribuicao-originalidade.md) | originalidade e superioridade não são presumidas |
| bibliografia canônica | [`referencias.bib`](referencias.bib) | presença na lista não determina força da evidência |

## Governança dos dados de autoria

A área **Dados de autoria** resume propriedades observáveis do curso atual, como
a distribuição das unidades e as intervenções humanas registradas. Somente a
pessoa proprietária pode consultá-la. A tela quantitativa omite o texto das
observações, a identidade da conta e a conversa usada na autoria. Quando a
pessoa escolhe **Exportar curso e análise**, o arquivo inclui também o conteúdo
salvo e os registros disponíveis de fontes, configuração aplicada e revisão.
Esse alcance está detalhado na
[referência da exportação](dicionario-metricas-datasets.md#comparação-e-exportação).

Uma contagem precisa declarar o conjunto ao qual se refere, chamado
**denominador**. Duas correções em duas unidades descrevem uma situação bem
diferente de duas correções em duzentas. O [guia de
investigação](guia-pesquisador.md#escolher-unidade-de-análise-e-medida) explica
como relacionar esses registros à pergunta e aos dados ausentes.

Essas contagens descrevem a autoria; aprendizagem, atenção, esforço e qualidade
exigem protocolo e instrumentos próprios. Consentimento e avaliação ética são
aplicados quando pertinentes ao estudo. Mesmo sem a identidade da conta, o
conteúdo e seus metadados podem revelar pessoas ou contextos. Por isso, a
exportação precisa seguir regras de acesso, retenção e avaliação do risco de
reidentificação.

## Revisão focal da autoria contextual

A conferência bibliográfica de **9 de setembro de 2026 (UTC)** examinou as bases
usadas para justificar decisões sobre autoria contextual. Ela partiu de
referências já relacionadas ao problema e consultou páginas das editoras,
repositórios dos autores e fontes oficiais. A busca foi encerrada quando cada
decisão desta seção possuía um fundamento e um limite identificáveis. Trata-se
de uma revisão focal, e não de uma busca exaustiva ou comparação sistemática de
estudos.

O alcance efetivamente consultado está registrado abaixo. Quando uma página
editorial não abriu diretamente, usou-se o resumo que ela disponibilizava na
busca ou o repositório institucional indicado; isso não foi contado como leitura
integral. As [referências completas](referencias.md) permitem localizar as obras.

| fonte primária | Escopo consultado | Papel na decisão | Limite de inferência |
| --- | --- | --- | --- |
| [Biggs (1996)](referencias.md#ref-biggs1996alignment) | Resumo e metadados na página da Springer; texto integral não consultado | Articular objetivos, atividades e avaliação ao delimitar o desenho | Não prescreve a interface, a extensão da base ou um número de unidades |
| [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli) | Resumo e seções 1.2, sobre níveis de análise, e 2.1, sobre eventos, no HTML da Wiley | Distinguir recorte de conhecimento, episódio instrucional e aprendizagem inferida | Não valida a unidade de análise instrucional do AraLearn como componente cognitivo nem como medida |
| [Laurillard et al. (2018)](referencias.md#ref-laurillard2018learningdesigner) | Resumo e metadados da editora e do depósito UCL; não leitura integral | Precedente de ferramenta que representa escolhas de desenho e apoia professores como designers | Resultados do Learning Designer pertencem à ferramenta e aos contextos estudados; não são resultados deste produto |
| [Sandoval (2014)](referencias.md#ref-sandoval2014conjecture) | Resumo e metadados editoriais retornados pela busca; artigo integral não consultado | Separar conjectura sobre o funcionamento do desenho da relação teórica com resultados | O resumo sustenta a distinção geral; não basta para alegar aplicação integral do método |
| [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai) e [Microsoft (s.d.)](referencias.md#ref-microsofthaxcorrection) | Página da publicação dos autores e orientação oficial HAX G9 para correção; sem leitura integral do artigo ou estudo dos exemplos de produtos | Tornar intervenções de IA compreensíveis e permitir editar, corrigir e recuperar | Diretrizes de interação não comprovam inspeção crítica ou eficácia das decisões humanas no AraLearn |
| [Four-Component Instructional Design (s.d.)](referencias.md#ref-fourcidmodel) | Página oficial, descrição dos quatro componentes | Comparação parcial entre tarefas e informações de suporte | A base explicativa é definição própria; não é equivalência canônica com *supportive information* nem adoção integral do 4C/ID |
| [World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22) | WCAG 2.2, critério 1.4.10; texto dos critérios e intenção nas páginas oficiais Understanding de 1.4.3, 1.4.11, 2.5.8 e 4.1.2, listadas abaixo | Restrições verificáveis de apresentação e operação dos controles | WCAG é referência normativa; Understanding é explicação informativa. Esta consulta não é auditoria integral de conformidade |
| [World Wide Web Consortium (s.d.)](referencias.md#ref-w3capgtoolbar), padrão Toolbar | Agrupamento, interação por teclado, foco, papéis e nomes no APG | Orientar grupos que de fato adotem o padrão de barra de ferramentas | Fileira visual de ícones não recebe automaticamente esse papel; o padrão não comprova reconhecimento do símbolo |
| [World Wide Web Consortium (s.d.)](referencias.md#ref-w3capgdialog), padrão Dialog (Modal) | Interação por teclado, foco inicial, fechamento, retorno do foco e semântica no APG | Orientar detalhes modais que preservem a continuidade do contexto | O padrão não é componente pronto nem certificação da implementação |

As páginas informativas consultadas foram
[Contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[Contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
[Tamanho mínimo do alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
e [Nome, papel e valor](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html).
As referências de interface restringem escolhas de produto: ações principais
por ícone precisam conservar nome e estado acessíveis, ajuda acessível por
teclado e toque e área de ativação adequada. Ícone menor não exige alvo menor;
cinza ou corpo menor não dispensam legibilidade e contraste. A preferência
visual por esses recursos permanece uma decisão a inspecionar com conteúdo real,
sem alegação de redução de carga cognitiva ou melhora de aprendizagem.

<!-- referências locais: início -->

## Referências

- [ALLEA (2023)](referencias.md#ref-allea2023integrity): ALLEA (2023). **The European Code of Conduct for Research Integrity: Revised Edition 2023.** All European Academies.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Biggs (1996)](referencias.md#ref-biggs1996alignment): John Biggs (1996). **Enhancing Teaching through Constructive Alignment.** *Higher Education*, 32, p. 347–364.
- [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao): Brasil. Ministério da Educação (2026). **Referencial para Desenvolvimento e Uso Responsáveis de Inteligência Artificial na Educação.** Ministério da Educação.
- [Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510): Conselho Nacional de Saúde (2016). **Resolução nº 510, de 7 de abril de 2016.** Conselho Nacional de Saúde.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Foucault (1995)](referencias.md#ref-foucault1995discipline): Michel Foucault (1995). **Discipline and Punish: The Birth of the Prison.** New York, Vintage Books.
- [Four-Component Instructional Design (s.d.)](referencias.md#ref-fourcidmodel): Four-Component Instructional Design (s.d.). **About the 4C/ID Model.**
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [Laurillard et al. (2018)](referencias.md#ref-laurillard2018learningdesigner): Diana Laurillard; Eileen Kennedy; Patricia Charlton; Joanna Wild; Dionisis Dimakopoulos (2018). **Using Technology to Develop Teachers as Designers of TEL: Evaluating the Learning Designer.** *British Journal of Educational Technology*, 49(6), p. 1044–1058.
- [Lyotard (1984)](referencias.md#ref-lyotard1984postmodern): Jean-François Lyotard (1984). **The Postmodern Condition: A Report on Knowledge.** Minneapolis, University of Minnesota Press.
- [Microsoft (s.d.)](referencias.md#ref-microsofthaxcorrection): Microsoft (s.d.). **Guideline 9: Support Efficient Correction.**
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Peters et al. (2024)](referencias.md#ref-peters2024scoping): Micah D. J. Peters; Christina Godfrey; Patricia McInerney; Zachary Munn; Andrea C. Tricco; Hanan Khalil (2024). **Scoping Reviews.** In: *JBI Manual for Evidence Synthesis*, JBI.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Sandoval (2014)](referencias.md#ref-sandoval2014conjecture): William Sandoval (2014). **Conjecture Mapping: An Approach to Systematic Educational Design Research.** *Journal of the Learning Sciences*, 23(1), p. 18–36.
- [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr): Andrea C. Tricco; Erin Lillie; Wasifa Zarin; Kelly K. O'Brien; Heather Colquhoun; Danielle Levac; David Moher; Micah D. J. Peters; Tanya Horsley; Laura Weeks; Susanne Hempel; et al. (2018). **PRISMA Extension for Scoping Reviews (PRISMA-ScR): Checklist and Explanation.** *Annals of Internal Medicine*, 169(7), p. 467–473.
- [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered): Yi-Shan Tsai; Roberto Martinez-Maldonado (2022). **Human-Centered Approaches to Data-Informed Feedback.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 213–222.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.
- [World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22): World Wide Web Consortium (2023). **Web Content Accessibility Guidelines (WCAG) 2.2.**
- [World Wide Web Consortium (s.d.)](referencias.md#ref-w3capgdialog): World Wide Web Consortium (s.d.). **Dialog (Modal) Pattern: ARIA Authoring Practices Guide.**
- [World Wide Web Consortium (s.d.)](referencias.md#ref-w3capgtoolbar): World Wide Web Consortium (s.d.). **Toolbar Pattern: ARIA Authoring Practices Guide.**

<!-- referências locais: fim -->
