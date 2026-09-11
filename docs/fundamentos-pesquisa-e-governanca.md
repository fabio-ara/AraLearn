# Fundamentos de pesquisa e governança

## Objeto e responsabilidade da pesquisa

O AraLearn é um artefato técnico de pesquisa em design instrucional e tecnologia
educacional. A pessoa autora cria cursos com assistência de inteligência
artificial (IA), inspeciona a estrutura e o conteúdo e confere suas relações com
as fontes. Os cursos resultantes organizam explicações, representações e
práticas para estudo autodidata no celular.

Investigar esse artefato envolve perguntas sobre o software, o desenho
instrucional e seu uso por pessoas. O funcionamento sem conexão pode ser
verificado no software; saber se ele favorece a continuidade ou a aprendizagem
exige pesquisa em condições de uso definidas. A literatura fundamenta conceitos
e hipóteses, enquanto a avaliação examina o que ocorre numa versão do produto.

## Governança da pesquisa

A governança da pesquisa envolve responsabilidades e procedimentos para
sustentar sua qualidade e integridade. O Código Europeu de Conduta para a
Integridade da Pesquisa destaca confiabilidade, honestidade, respeito e
responsabilização, com deveres relativos ao ambiente de pesquisa, aos métodos,
aos dados e à comunicação dos resultados
([ALLEA (2023)](referencias.md#ref-allea2023integrity)).

No AraLearn, esses princípios orientam o registro da origem e do alcance das
afirmações. Uma decisão do projeto precisa permanecer distinguível do
conhecimento publicado e dos resultados de uma avaliação. A classificação
abaixo é uma convenção documental do projeto para manter essas diferenças.

Para cada afirmação relevante, o registro deve permitir reencontrar a fonte,
o contexto, a decisão fundamentada e, quando houver implementação ou avaliação,
a versão e a evidência correspondentes. O protocolo também define os dados
necessários, quem pode acessá-los e os limites da conclusão.

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

O objeto investigado reúne autoria de cursos e estudo móvel. O curso é
organizado em módulos e lições; dentro delas, as microssequências desenvolvem
objetivos delimitados por meio de unidades de estudo, como descreve o
[modelo didático](modelo-didatico.md). Conteúdo previamente sincronizado fica
disponível no dispositivo, e a troca de dados com o servidor preserva a
interação local. Essa arquitetura, chamada *local-first*, é desenvolvida em
[armazenamento e sincronização](persistencia-relacional.md#sincronização-e-concorrência-no-dispositivo). O contexto prioritário inclui pessoas adultas que conciliam
trabalho e estudo, utilizam celular, enfrentam interrupções e podem perder
conectividade.

Essa prioridade é uma **delimitação de design**, não uma descrição empírica de
todos os usuários. Cada avaliação precisa caracterizar sua própria população,
incluindo experiência com tecnologia, domínio de conhecimento, dispositivo,
condições de rede e contexto de uso.

O problema de pesquisa não se reduz a disponibilizar conteúdo. Ele envolve:

- construir explicações profundas sem pressupostos ocultos;
- dividir o percurso sem fragmentar relações;
- escolher representações apropriadas às operações;
- articular teoria, prática, feedback e retomada;
- sustentar estudo em condições móveis e sem conexão;
- permitir autoria assistida sem transferir responsabilidade à IA;
- delimitar propriedade e acesso sem vigilância ou poder difuso;
- manter custo, armazenamento e manutenção proporcionais.

## Pergunta orientadora e subproblemas

Uma pergunta ampla capaz de organizar o programa é:

> Como projetar e avaliar a autoria assistida por IA, a inspeção humana e o
> estudo autodidata no celular em condições de tempo fragmentado e conectividade
> variável, preservando coerência pedagógica, vínculo com as fontes e controle
> humano sobre o conteúdo?

Essa pergunta deve ser decomposta em estudos delimitados:

1. **progressão didática:** em que condições a distribuição de explicação,
   exemplo, prática e feedback sustenta compreensão, retenção e transferência?
2. **representação:** quando uma representação especializada ajuda a executar uma
   operação sem introduzir gramática visual ou carga desnecessária?
3. **continuidade:** como disponibilidade local, sincronização e marco de
   retomada afetam a capacidade de continuar após interrupção?
4. **autoria assistida:** como catálogo, contrato, escopo e reversibilidade
   afetam erro de alvo, qualidade e controle humano?
5. **governança:** que formas de propriedade, acesso, dados e intervenções são legítimas e úteis sem
   converter rastros ambíguos em diagnóstico?
6. **frugalidade:** como custo, armazenamento, volume transferido e manutenção evoluem sem
   comprometer segurança, acessibilidade e rigor?

Essas perguntas podem ser investigadas separadamente. Colocá-las num único
estudo produziria unidades, medidas e explicações rivais demais para uma análise
coerente.

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
produto: bases, expressões de busca, datas, critérios, duplicatas, seleção, avaliação
crítica e fluxograma ([Peters et al. (2024)](referencias.md#ref-peters2024scoping); [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr)).

### Proveniência das fontes de um curso

A bibliografia desta documentação e as fontes usadas num curso cumprem funções
diferentes. Dentro do produto, uma fonte possui identidade e estado correntes;
uma âncora localiza página, tempo, fragmento de endereço ou trecho textual; e
uma atribuição liga essa âncora a um item do plano, uma unidade de estudo ou à explicação
compartilhada de uma microssequência. A relação
declara se a fonte informa ou sustenta o alvo, ou se o alvo foi adaptado ou
citado a partir dela.

Essa cadeia permite localizar o material usado e reconstruir a decisão
autoral. Ela não demonstra que a fonte é verdadeira, que a atribuição é
pertinente ou que o conteúdo derivado é fiel. Essas conclusões exigem leitura,
julgamento disciplinar e, quando fizerem parte da pergunta, avaliação própria.

## Governança de decisões

O [contrato de explicação e revisão humana](explicacao-e-revisao-humana.md)
e o [contrato contextual](autoria-contextual.md) separam conteúdo produzido,
intervenção humana, declaração de revisão e acesso. A implementação registra a
revisão das explicações e das unidades, vinculada ao conteúdo salvo, e distingue
uma declaração vigente daquela desatualizada por mudança material. O
[contrato de revisão](../src/domain/courseContentReview.js) explicita esses
estados; avaliar se a pessoa compreendeu e inspecionou adequadamente o objeto
exige observação do uso.

No contrato contextual, revisão é uma declaração reversível ligada ao conteúdo
salvo inspecionado. Mudança material pode desatualizá-la. Salvar uma edição,
registrar observação ou abrir conteúdo mantém significado próprio; nenhum
desses atos declara revisão. Comentário também não aplica nova intenção ao
conteúdo. O clique de revisão registra uma declaração, sem comprovar leitura,
correção ou eficácia.

Revisão e acesso são decisões independentes. Conteúdo completo salvo não
revisado pode ser estudado por quem possui acesso, inclusive visitante de curso
explicitamente público. A política de disponibilizar somente material revisado
é opcional e expressa. Em qualquer política, a revisão não concede propriedade,
publicidade ou direito a arquivos; rascunho local e gravação parcial não se
tornam conteúdo público. Ausência de registro antigo permanece ausência, sem
reconstrução fictícia de aprovação.

### Registro mínimo

O registro de uma decisão permite compreender a escolha e retomá-la. Ele reúne:

1. **problema:** qual situação requer decisão;
2. **alternativas e requisitos:** que soluções eram plausíveis e o que não
   poderia ser perdido;
3. **decisão:** o que foi adotado;
4. **fundamentação:** que literatura, norma, evidência técnica ou valor a
   sustenta;
5. **operacionalização:** onde aparece no produto e como será verificada;
6. **consequências:** benefícios esperados, custos e dependências;
7. **limites e evidência:** o que ainda não se sabe e que achado exigiria
   revisão.

### Rastreabilidade separada

Uma mudança deixa rastros diferentes:

- justificação conceitual e pedagógica na documentação pública;
- decisão operacional e incidentes no registro operacional apropriado;
- implementação no código, contratos e esquemas de dados;
- conformidade em testes e medições técnicas;
- avaliação em protocolo, instrumentos e dados autorizados.

Uma justificativa formulada depois da decisão é identificada como tal. Essa
distinção conserva a história da escolha, inclusive quando uma hipótese falha
e o projeto precisa ser revisto.

## Governança de dados e ética

Antes de coletar um dado, devem ser definidos:

- pergunta e finalidade;
- construto ou resultado;
- unidade de análise;
- manifestação observada;
- interpretações permitidas e proibidas;
- explicações alternativas;
- intervenção possível;
- acesso, retenção, exclusão e descarte;
- custo de armazenamento e risco;
- informação e consentimento necessários.

Quando uma investigação brasileira em Ciências Humanas e Sociais estiver no
escopo da Resolução CNS nº 510/2016, informação, consentimento ou assentimento,
privacidade, confidencialidade, retirada e proteção diante de riscos seguem a
norma aplicável
([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)).
Essa autoridade é normativa; não demonstra que uma medida seja válida nem que
uma intervenção produza aprendizagem.

Cliques, tempo e conclusão não entram apenas por estarem disponíveis. A ética
integra o desenho da análise de dados desde a definição da finalidade
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)). Dados de pesquisa devem permanecer separados do banco
operacional sempre que o desenho e o risco assim exigirem.

### Finalidades educacionais e reutilização institucional

A governança precisa tornar discutíveis também os fins da tecnologia. As
[lentes críticas do quadro teórico](quadro-teorico.md#lentes-críticas-sobre-informação-e-poder),
apoiadas em [Lyotard (1984)](referencias.md#ref-lyotard1984postmodern) e
[Foucault (1995)](referencias.md#ref-foucault1995discipline), orientam perguntas
do projeto: que conhecimento é valorizado, quem define uma norma e quais
consequências seguem de tornar uma atividade visível?

Na análise do AraLearn, essas perguntas têm efeitos concretos. Uma quantidade
de unidades não deve virar meta de produtividade docente; uma conclusão não
deve virar prova de esforço; a disponibilidade móvel não deve legitimar a
expectativa de estudo permanente. São limites de interpretação e uso que
precisam acompanhar qualquer proposta de adoção institucional.

O produto não implementa essas avaliações de pessoas. Um estudo sobre sua
reutilização deve examinar as decisões efetivas da instituição, ouvir autores
e estudantes, verificar condições de recusa e contestação e preservar relatos
de efeitos adversos. Avaliar benefícios inclui perguntar para quem eles
ocorrem e que trabalho, dependência ou restrição de autonomia os acompanha.
O [guia de investigação](guia-pesquisador.md#formular-caminhos-de-investigação)
apresenta uma forma de estudar essas relações sem tratá-las como efeitos já
constatados.

### Governança de condições comparáveis

Uma investigação pode usar cursos privados independentes para produzir
condições diferentes. O protocolo externo registra a pergunta, o inventário
semântico comum, a configuração fixada, o artefato efetivamente exposto, a
população, a atribuição, os instrumentos, os dados ausentes e a análise.

Intenção corrente, configuração aplicada, proveniência e declaração de revisão
precisam permanecer distinguíveis nesse registro. A preferência pessoal de
processo não modifica uma condição fixada. Nova geração pode alterar linguagem,
exemplos e dificuldade junto com o parâmetro escolhido; copiar o curso ou
alterar um controle não demonstra que somente uma variável mudou. A base, suas
fontes, unidades, divergências e regras de consulta do apoio integram a condição
efetivamente apresentada. Modelo e configuração só são registrados quando
conhecidos, sem preencher lacunas por adivinhação.

O produto não cria uma entidade de variante nem bloqueia o curso. Separar os
cursos ajuda a evitar mistura acidental, mas não garante equivalência semântica,
fidelidade de exposição ou validade causal. Consulte [Comparar condições de
desenho](experimentos-instrucionais-parametrizados.md).

## Limitações atuais do programa

- a revisão bibliográfica é narrativa e não exaustiva;
- o público prioritário ainda precisa ser caracterizado em cada estudo;
- não há evidência consolidada de eficácia educacional do AraLearn;
- validade entre áreas do conhecimento, níveis de formação e instituições
  permanece aberta;
- modelos, provedores e instruções de IA podem mudar entre avaliações;
- qualidade visual, esquema de dados e testes não demonstram compreensão;
- frugalidade precisa ser medida longitudinalmente;
- autoria coletiva, poder institucional e participação exigem estudos próprios;
- resultados negativos e mecanismos removidos precisam ser preservados para
  evitar viés de sobrevivência.

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

A área **Dados de autoria** deriva do estado corrente contagens de desenho e intervenções
humanas explicitamente observáveis. A consulta é exclusiva da pessoa
proprietária; a leitura quantitativa não inclui texto de observações, identidade
de conta ou conversa. A ação **Exportar curso e análise** acrescenta o conteúdo
integral salvo do curso, além dos registros disponíveis de fontes, configuração
aplicada e revisão. Esse alcance está detalhado na
[referência da exportação](dicionario-metricas-datasets.md#comparação-e-exportação).

Uma contagem precisa declarar a que conjunto se refere: esse conjunto é seu
**denominador**. Duas correções em duas unidades e duas correções em duzentas
unidades descrevem situações distintas. O [guia de investigação](guia-pesquisador.md#escolher-unidade-de-análise-e-medida)
explica como relacionar esses registros à pergunta e aos dados ausentes. As contagens do
produto não medem aprendizagem, atenção, esforço ou qualidade. Um desfecho exige
protocolo, instrumento e finalidade próprios, com consentimento e avaliação
ética quando aplicáveis. Mesmo sem registros de conta, o conteúdo e seus
metadados podem identificar pessoas ou contextos. A exportação exige controle
de acesso, retenção e avaliação de reidentificação conforme o plano do estudo.

### Revisão focal da autoria contextual

A conferência bibliográfica de **9 de setembro de 2026 (UTC)** examinou decisões de
nomenclatura, separação entre conteúdo e realização, controle autoral e
acessibilidade. Partiu de referências já pertinentes ao problema, conferindo
páginas primárias das editoras, repositório institucional dos autores e fontes
oficiais. O critério de encerramento foi obter fundamento e limite explícitos
para cada decisão desta seção. Não houve busca exaustiva, comparação sistemática
de estudos ou nova avaliação de eficácia do AraLearn.

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
