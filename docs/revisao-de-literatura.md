# Revisão de literatura orientada ao desenho do AraLearn

## Finalidade, pergunta e limites

Esta revisão reúne conhecimentos que ajudam a justificar, questionar e avaliar
as decisões educacionais e sociotécnicas do AraLearn. Sua pergunta orientadora
é:

> Que conhecimentos publicados são relevantes para projetar e avaliar uma
> plataforma móvel, local-first, baseada em progressão didática,
> representações externas, prática, feedback e autoria assistida?

O texto é uma **revisão narrativa orientada ao desenho do artefato**. Isso significa que as
fontes foram organizadas em torno de problemas do artefato e de mecanismos
plausíveis. Não se trata de revisão sistemática, revisão de escopo concluída ou
meta-análise própria. Uma síntese que pretenda cobertura reproduzível deve
registrar bases consultadas, estratégias de busca, datas, critérios de
elegibilidade, duplicatas, processo de seleção e avaliação crítica, seguindo o
método apropriado; JBI e PRISMA-ScR oferecem orientações para revisões de escopo
([Peters et al. (2024)](referencias.md#ref-peters2024scoping); [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr)).

A revisão também não demonstra que o AraLearn melhora a aprendizagem. Ela
oferece:

- **evidência externa**, produzida em populações, tarefas e ambientes próprios;
- **inferências limitadas**, que relacionam essa evidência ao problema de
  desenho;
- **decisões fundamentadas**, adotadas no produto por razões explícitas;
- **hipóteses**, que permanecem abertas à avaliação e à refutação.

As referências completas estão em [`referencias.bib`](referencias.bib). A
[Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
liga cada eixo desta revisão a requisitos, implementação e episódios de
avaliação.

Neste texto, **local-first** designa uma arquitetura em que a cópia local
sustenta a operação corrente e a sincronização com o servidor ocorre sem
bloquear a interação.

## Como interpretar a força de uma fonte

Uma hierarquia simples ajuda a evitar que qualquer publicação seja tratada como
prova suficiente:

| Tipo de fonte | Contribuição possível | Limite principal |
| --- | --- | --- |
| revisão sistemática ou meta-análise | sintetizar consistência, heterogeneidade e moderadores | depende da qualidade e comparabilidade dos estudos incluídos |
| estudo experimental ou quase experimental | examinar relações causais sob condições delimitadas | generalização para outro público, conteúdo ou dispositivo não é automática |
| estudo qualitativo ou de campo | explicar processos, interpretações, contexto e casos negativos | não estima efeito populacional sem desenho complementar |
| teoria ou quadro conceitual | definir construtos e mecanismos plausíveis | coerência conceitual não constitui confirmação empírica |
| norma ou orientação institucional | estabelecer critérios de acessibilidade, ética ou governança | conformidade não demonstra aprendizagem |
| documentação e testes do artefato | demonstrar estrutura ou comportamento implementado | correção técnica não valida construtos pedagógicos |

O tipo da fonte não basta. É necessário verificar a correspondência entre
população, tarefa, intervenção, comparação, resultado, duração e contexto. Uma
meta-análise distante da situação investigada pode oferecer fundamento mais
indireto do que um estudo de campo bem alinhado à pergunta local.

## Procedimento de composição do corpus

O corpus atual foi composto por:

1. identificação das alegações pedagógicas e sociotécnicas presentes no
   desenho do AraLearn;
2. busca de revisões, meta-análises, estudos fundamentais, quadros conceituais,
   normas e orientações institucionais relevantes a essas alegações;
3. conferência de DOI, ISBN ou endereço institucional persistente;
4. classificação de cada fonte por tema, tipo de evidência, população, tarefa
   e limite de transferência;
5. separação entre o que a fonte sustenta, a inferência feita para o artefato e
   o que ainda precisa ser avaliado.

Foram excluídos como fundamento de eficácia: materiais promocionais,
comparações sem identidade bibliográfica verificável, inferências que tratam
satisfação ou conclusão como aprendizagem e afirmações sobre sistemas cujo
mecanismo não pode ser separado do conjunto da intervenção.

Essa estratégia oferece rastreabilidade, mas não garante exaustividade. Novas
fontes devem entrar na bibliografia somente depois de conferência e devem
alterar a síntese quando contradizem, limitam ou refinam o argumento vigente.

O corpus inicial não conserva um diário completo das consultas que o
originaram. Portanto, não é possível reconstruir retrospectivamente, com
precisão, todas as bases, expressões, datas e contagens usadas. Essa limitação
é declarada em vez de preencher lacunas com buscas presumidas.

### Protocolo prospectivo de busca e atualização

A partir desta versão, toda busca destinada a ampliar ou revisar o corpus segue
o protocolo **ARA-LIT-1**. Ele aumenta a reprodutibilidade da revisão narrativa,
mas não a converte automaticamente em revisão sistemática ou de escopo. Um
estudo que reivindique um desses métodos precisa de protocolo próprio e das
etapas exigidas pelo método escolhido.

1. formular uma pergunta delimitada e associá-la a um eixo desta revisão;
2. escolher bases adequadas ao eixo, por exemplo, ERIC ou PsycINFO para
   educação e psicologia, Scopus ou Web of Science para cobertura
   interdisciplinar, ACM Digital Library ou IEEE Xplore para interação e
   computação, e fontes institucionais primárias para normas;
3. registrar, antes da seleção, a base, a consulta exatamente como executada,
   a data e hora em UTC, os filtros e a contagem informada pela base;
4. deduplicar primeiro por DOI e, quando ele não existir, por título, ano e
   autoria, conservando a decisão em caso de dúvida;
5. avaliar título e resumo segundo os critérios abaixo; registrar o motivo da
   exclusão quando a decisão depender do texto integral;
6. conferir identidade bibliográfica e, conforme o desenho da fonte, examinar
   população, contexto, tarefa, comparação, resultados, limitações e risco de
   viés;
7. incluir os metadados confirmados em `referencias.bib`, atualizar a síntese e
   a matriz de rastreabilidade e explicar quando a nova fonte contradiz ou
   restringe uma afirmação anterior.

Consultas em mecanismos de busca gerais e rastreamento de referências para
trás ou para a frente podem complementar as bases. Eles devem ser identificados
como tal no registro; não substituem silenciosamente uma base declarada.

### Critérios ARA-LIT-1

Uma fonte pode ser incluída quando tem identidade verificável, relação direta
com a pergunta registrada e informação suficiente para avaliar o alcance da
afirmação utilizada. Conforme a pergunta, são elegíveis estudos primários,
sínteses de evidência, trabalhos teóricos, normas e documentação técnica
primária. Não há corte cronológico geral: cada filtro de data precisa de
justificativa registrada.

São excluídos como fundamento científico materiais promocionais, fontes sem
proveniência verificável e textos cuja relação com a pergunta dependa apenas de
analogia. Uma fonte não é excluída por contradizer a decisão atual; resultados
nulos, adversos e explicações rivais são necessários para avaliar o argumento.
Idioma, acesso ao texto integral e tipo de publicação não devem ser usados como
filtros ocultos: quando afetarem a seleção, aparecem no campo `filtros` ou nas
observações.

### Registro reprodutível

O arquivo
[`evidence/registro-buscas-bibliograficas.csv`](evidence/registro-buscas-bibliograficas.csv)
recebe uma linha por consulta realmente executada. Seu cabeçalho inicial, sem
linhas retrospectivas inventadas, preserva a distinção entre o corpus recebido
e as consultas prospectivas. As linhas datadas registram apenas buscas de fato
executadas sob este protocolo; uma fonte conferida por DOI não é apresentada
como se tivesse sido descoberta por uma consulta temática que não a recuperou.

| Campo | Significado |
| --- | --- |
| `registro_id` | identificador estável da consulta |
| `data_hora_utc` | instante da execução em ISO 8601 e UTC |
| `eixo` | pergunta ou seção desta revisão atendida |
| `base_ou_indice` | serviço consultado, sem agrupar bases diferentes numa linha |
| `consulta_exata` | expressão copiada da interface ou API consultada |
| `filtros` | limites de data, idioma, campo, tipo ou outros, inclusive “nenhum” |
| campos de contagem | total informado, deduplicação, triagens e inclusões daquele fluxo |
| `motivos_exclusao_texto_integral` | categorias e contagens das exclusões decididas após leitura integral |
| `versao_criterios` | versão aplicada, inicialmente `ARA-LIT-1` |
| `responsavel` | identificador ou papel definido no protocolo da investigação |
| `observacoes` | falhas, limites, motivo de nova execução ou ligação para evidência complementar |

Se a mesma consulta for repetida, recebe nova linha: resultados de uma base
podem mudar ao longo do tempo. Correções preservam o valor anterior no histórico
do Git e explicam a mudança em `observacoes`.

## 1. Aprendizagem móvel, interrupção e retomada

### Conceitos necessários

**Aprendizagem móvel** não significa apenas conteúdo curto em uma tela pequena.
O conceito remete a atividades de aprendizagem mediadas por dispositivos que
podem ocorrer em ambientes, tempos e condições variáveis. A pessoa pode estudar
em trânsito, alternar tarefas, perder conectividade e retomar depois.

**Retomada** é o restabelecimento do objetivo e do estado necessários para
continuar uma atividade suspensa. Abrir novamente a aplicação não prova que a
pessoa compreendeu onde estava ou o que precisava fazer.

### Evidência externa

Uma revisão sistemática encontrou diversidade de quadros para interfaces em
aplicações de aprendizagem móvel, o que desaconselha a ideia de um layout
universalmente adequado ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)). Uma revisão sobre aprendizagem
autodirigida de línguas com tecnologia móvel identificou estratégias
cognitivas, metacognitivas, sociais e afetivas, mas seu domínio limita a
generalização ([Lai et al. (2022)](referencias.md#ref-lai2022mobile)).

Estudos experimentais sobre interrupção mostram custos para retomar objetivos
suspensos e diferenças relacionadas à duração, à demanda da interrupção e à
capacidade de memória de trabalho ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Esses resultados não examinam o AraLearn nem
demonstram efeito educacional de armazenamento local.

### Decisão e hipótese para o AraLearn

- **Problema:** uma sessão interrompida ou sem rede pode exigir reconstrução do
  percurso e introduzir espera em ações que deveriam ser locais.
- **Alternativas e requisitos:** depender do servidor, manter somente uma cópia temporária da
  página ou conservar réplica e cursor locais; a solução requer resposta
  imediata, conteúdo já sincronizado
  disponível, estado corrente inteligível e sincronização fora do caminho
  crítico da interação.
- **Decisão:** manter localmente o conteúdo sincronizado e o estado mínimo
  necessário à continuidade; não tratar abertura ou tempo como atenção. Estudo
  e Autoria usam a mesma aplicação web no celular e no computador, com exposição
  progressiva e restauração explícita de contexto, em vez de relegar a Autoria a
  uma interface desktop separada.
- **Fundamentação:** interrupções podem impor custo de retomada, enquanto a
  diversidade de situações móveis desaconselha solução universal
  ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption); [Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).
- **Operacionalização:** o estudo lê conteúdo e estado corrente localmente; a
  sincronização ocorre fora do caminho crítico. Na Autoria, o servidor continua
  sendo a autoridade para alterações; listas conhecidas e uma página exata da
  sequência de Conteúdo podem permanecer visíveis sem conexão, identificadas como cópia
  local, sem autorizar mutação.
- **Consequências e hipótese:** uma réplica local e um cursor compreensível
  podem reduzir erros operacionais de retomada.
- **Limites e evidência necessária:** funcionamento sem conexão é propriedade
  técnica; continuidade de estudo e aprendizagem são resultados empíricos
  distintos. A avaliação requer tarefa interrompida com intervalo e condições de
  rede definidos, medindo localização correta, continuação, erros, ajuda e
  explicação da pessoa. A paridade de funções e a ausência de overflow em
  larguras automatizadas não demonstram que uma pessoa leiga descubra a
  alternância entre Estudo e Autoria, retome o ponto correto ou compreenda o
  estado sem orientação; isso exige teste humano prioritariamente móvel.

## 2. Autorregulação, autodireção e agência

### Conceitos necessários

Aprender sozinho não é sinônimo de **aprendizagem autorregulada**. Modelos de
autorregulação incluem planejamento, execução, monitoramento e reflexão
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). **Aprendizagem
autodirigida** acrescenta iniciativa na definição de objetivos, recursos e
processos ([Knowles (1975)](referencias.md#ref-knowles1975selfdirected)). **Agência** envolve capacidade de agir de
modo intencional e produzir efeitos, sempre em condições sociais e materiais
([Bandura (2001)](referencias.md#ref-bandura2001agency)).

Esses conceitos impedem uma inferência comum: disponibilizar opções ou permitir
navegação não prova autonomia. Uma meta-análise sobre controle do aprendiz em
tecnologia educacional encontrou efeitos heterogêneos
([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)). A teoria da autodeterminação também distingue
escolha significativa e apoio à autonomia de abandono ou ausência de estrutura
([Ryan e Deci (2020)](referencias.md#ref-ryan2020motivation)).

### Decisão e hipótese para o AraLearn

- **Problema:** um percurso completamente fechado pode impedir decisões
  legítimas; um ambiente sem estrutura pode transferir ao estudante toda a
  organização que deveria apoiá-lo.
- **Alternativas e requisitos:** percurso fechado, liberdade sem estrutura ou
  suporte com escolhas significativas; são necessários objetivos visíveis, consequências
  compreensíveis, possibilidade real de escolha, revisão e recusa, além de
  suporte suficiente.
- **Decisão:** oferecer organização explícita do percurso, retomada, marcação de
  revisão, anotação ancorada e autoria reversível.
- **Fundamentação:** autorregulação envolve planejamento, monitoramento e
  reflexão; controle disponível na interface apresenta resultados heterogêneos
  ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated); [Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)).
- **Operacionalização:** percurso, consequências, revisão e reversão permanecem
  visíveis e são exercidos por ações explícitas.
- **Consequências e hipótese:** estrutura compreensível associada a escolhas significativas
  pode apoiar planejamento e revisão melhor do que controle meramente
  simbólico.
- **Limites e evidência necessária:** autonomia é construto a ser
  operacionalizado, não atributo produzido por botões. A avaliação deve observar decisões, justificativas, rejeições,
  mudanças de estratégia e compreensão das consequências; não usar frequência
  de acesso como medida substituta.

## 3. Carga cognitiva, segmentação e profundidade

### Conceitos necessários

A memória de trabalho possui capacidade limitada, e parte da dificuldade de
uma tarefa pode ser criada pelo modo como informação e ações são apresentadas
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). **Carga cognitiva
extrínseca** designa demanda dispensável à aprendizagem do conteúdo-alvo, como
procurar dados espalhados, interpretar rótulos ambíguos ou alternar entre fontes
que precisam ser integradas.

Segmentar uma explicação pode ajudar, mas não equivale a cortar texto em
fragmentos. Uma meta-análise encontrou heterogeneidade e moderadores no efeito
de segmentação ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)). A literatura de microaprendizagem (*microlearning*) também reúne
definições e intervenções diversas ([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)). Portanto, não há
base para as regras “um conceito por unidade” ou “quanto menor, melhor”.

### Texto, discurso e extensão editorial

Modelos de compreensão textual distinguem relações locais e organização global;
teorias e métodos de segmentação delimitam unidades por critérios como relação
retórica, intenção discursiva ou mudança de subtópico
([Kintsch e van Dijk (1978)](referencias.md#ref-kintsch1978model);
[Mann e Thompson (1988)](referencias.md#ref-mann1988rst);
[Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation);
[Hearst (1997)](referencias.md#ref-hearst1997texttiling)). Uma revisão recente
da linguística do texto também mostra que “unidade discursiva” não designa um
átomo universal independente de teoria e procedimento
([Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades)).

Parágrafo, sentença, quantidade de caracteres, número de palavras, altura e
tempo estimado de leitura são **medidas editoriais observáveis**. Podem apoiar
renderização e ergonomia, mas não demonstram por si mesmas unidade de sentido,
densidade conceitual, dificuldade ou completude. Ferramentas de complexidade
textual integram propriedades lexicais, sintáticas, discursivas e de coesão;
mesmo assim, seus valores dependem do corpus, da população, da tarefa e da
interpretação pretendida
([Graesser et al. (2004)](referencias.md#ref-graesser2004cohmetrix);
[Leal et al. (2024)](referencias.md#ref-leal2024nilcmetrix);
[Gazzola et al. (2022)](referencias.md#ref-gazzola2022textcomplexity)).

Para investigar **densidade conceitual**, o AraLearn precisa declarar o que
conta como conceito, relação e ocorrência, conservar as anotações semânticas
brutas e versionar o denominador e o cálculo. Usar caracteres ou palavras como
substitutos silenciosos produziria uma medida fácil de calcular, mas incapaz de
sustentar a interpretação pedagógica desejada.

### Decisão e hipótese para o AraLearn

- **Problema:** teoria condensada oculta pré-requisitos; fragmentação excessiva
  destrói relações e amplia navegação.
- **Alternativas e requisitos:** resumir, acumular exposição ou distribuir uma
  progressão conceitual; o desenho requer contexto local, relações
  preservadas, densidade compatível com leitura móvel e profundidade definida
  pelo escopo.
- **Decisão:** dimensionar microssequências e unidades de estudo e
  interação depois do planejamento, sem
  quantidade fixa de teoria ou prática; tratar microteoria como recorte local
  suficiente, não resumo.
- **Fundamentação:** memória de trabalho e segmentação dependem da tarefa e do
  desenho; a literatura de microaprendizagem não estabelece cota universal
  ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture); [Rey et al. (2019)](referencias.md#ref-rey2019segmenting); [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).
- **Operacionalização:** pré-requisitos, relações, exemplos e evidências de
  aprendizagem são planejados antes da materialização das unidades; medidas
  editoriais e anotações semânticas permanecem categorias distintas.
- **Consequências e hipótese:** explicação progressiva com pré-requisitos explícitos pode reduzir
  carga extrínseca e preservar profundidade.
- **Limites e evidência necessária:** quantidade de unidades, tamanho do texto e
  aparência minimalista não medem carga nem qualidade. São necessárias auditoria de especialistas e tarefas com novatos,
  examinando saltos, compreensão, integração e navegação.

## 4. Unidades, evidência e parâmetros de desenho

### Unidades de conhecimento não são observações diretas

O quadro KLI relaciona tipos de componentes de conhecimento, eventos de
aprendizagem e princípios instrucionais, mas trata os componentes como
entidades não observáveis inferidas a partir de tarefas. A granularidade da
análise depende da população e do desempenho que se pretende explicar
([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)).
Esse fundamento não autoriza um sistema de autoria a declarar que um tópico é
um componente psicológico validado ou que conhece o domínio de cada estudante.

Para planejar conteúdo de modo rastreável, o AraLearn adota uma
**unidade de análise instrucional**. Ela é um recorte editorial revisável,
ligado a fonte e objetivo. O conhecimento prévio presumido pode ser descrito
como novo, parcial, integrado ou desconhecido, desde que a base da suposição
permaneça explícita. Trata-se de operacionalização própria, não de diagnóstico,
proficiência ou probabilidade de domínio.

O objeto materializado diretamente apresentado em Estudo recebe, nesta
taxonomia, o nome **unidade de estudo**: a menor unidade persistida, ordenável,
endereçável e renderizável que pode ser somente expositiva ou também reunir uma
ou mais representações, solicitação de resposta e feedback. Esse é um termo
operacional do AraLearn, não um gênero discursivo reconhecido nem um construto
psicológico. Sua aparência corrente em bloco retangular não deve definir a
ontologia, e o nome não pressupõe interação quando ela não existe.

**Flashcard** fica reservado ao item realmente organizado em torno de uma pista
e de uma resposta para recuperação. Uma revisão de escopo sobre flashcards
eletrônicos nas profissões da saúde ilustra usos e resultados dentro desse
domínio específico; não autoriza classificar explicações, diagramas,
simulações ou toda a plataforma como flashcards
([Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards)).

Uma **microssequência didática** ordena unidades de estudo em
torno de um objetivo instrucional delimitado. Uma **Parte de autoria** reúne,
por sua vez, trabalho de planejamento, produção e revisão que pode abranger
várias microssequências. Ambas são construções próprias do produto: a primeira
é didática; a segunda é uma unidade operacional de materialização. A faixa
orientativa de Partes pode ser configurada e nunca constitui uma regularidade
pedagógica universal.

Estudos de sistemas recentes oferecem evidência situada para manter o plano
intermediário visível e editável, sem transferir a decisão pedagógica inteira
ao modelo. O VIVID organizou geração, avaliação e modificação de diálogos
educacionais por instrutores; sua avaliação com doze participantes tratou uma
tarefa e um formato específicos, não a produção de Cursos em geral
([Choi et al. (2024)](referencias.md#ref-choi2024vivid)). O Shiksha Copilot
combinou geração, curadoria humana e adaptação docente de planos de aula; o
estudo misto envolveu 1.043 docentes e 23 curadores num contexto multilíngue e
de recursos limitados, no qual profissionais continuaram avaliando e
contextualizando o material produzido
([Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha)). Esses
resultados sustentam investigar planejamento revisável, intervenção humana e
uso móvel no AraLearn. Eles não validam a entidade Parte, não determinam sua
quantidade e não demonstram que a faixa de sete a doze melhora aprendizagem ou
qualidade autoral; essa faixa permanece um valor padrão do produto a ser estudado.

### Interatividade depende da estrutura e do público

Na teoria da carga cognitiva, elemento designa a unidade que precisa ser
processada para aprender ou executar algo, e interatividade se refere aos
elementos que precisam ser coordenados simultaneamente. A estimativa depende
da estrutura da informação e do conhecimento prévio, é necessariamente
aproximada e não equivale à dificuldade geral da tarefa
([Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity)).

A consequência para o desenho é preservar relações, em vez de criar uma
pontuação de carga. Unidades e
relações que precisam permanecer juntas são registradas como conjuntos de
coordenação; sua cardinalidade pode ser calculada com unidade e escopo
explícitos. Relações de pré-requisito, causalidade, contraste, composição ou
mapeamento representacional permanecem grafos ou conjuntos, porque reduzi-las a
um escalar elimina a informação necessária à revisão.

### Requisito de evidência não é medida validada

O desenho centrado em evidências (*Evidence-Centered Design*) organiza a avaliação como argumento entre
alegações, evidência observável e tarefas capazes de produzir essa evidência
([Mislevy et al. (2003)](referencias.md#ref-mislevy2003ecd)). O
AraLearn aproveita a separação para ligar objetivo, operação, requisito de
evidência e forma aceitável de desempenho. A transposição serve à coerência
autoral; não cria instrumento psicométrico, não estima variável latente e não
autoriza inferência de domínio.

O 4C/ID acrescenta distinções úteis entre tarefas integrais, informação de
apoio, informação procedimental e prática de partes quando a automatização é
necessária. Variação, apoio e fidelidade dependem da tarefa e do estágio de
aprendizagem; não compõem uma receita universal
([van Merriënboer (2019)](referencias.md#ref-vanmerrienboer2019fourcomponent)).
Por isso, formas de desempenho e fidelidade devem permanecer categorias e
relações com limitações declaradas, em vez de uma escala ordinal artificial.

### Explicação, prática e materialização

Autoexplicações podem elaborar condições de aplicação e relacionar passos a
princípios, mas seus efeitos e formas variam entre participantes e tarefas
([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations);
[Chi et al. (1994)](referencias.md#ref-chi1994eliciting)). Explicações
instrucionais também podem falhar quando não se ajustam ao conhecimento prévio,
aos conceitos relevantes ou à atividade cognitiva em curso
([Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)). Não há,
portanto, base para um checklist universal ou para uma nota de “qualidade da
explicação”.

A implementação registra requisitos aplicáveis, como definição, mecanismo,
condição de aplicação, limite, contraste, exemplo ou justificativa de
procedimento, ligados às unidades e relações pertinentes. O mesmo princípio
se aplica à prática: oportunidades distintas são reconhecidas por alvo,
operação e estrutura semântica, não por troca cosmética de texto ou componente.

- **Decisão:** separar Fontes e objetivo, análise instrucional, parâmetros,
  política de componentes, atribuição aos itens do plano e conteúdo
  materializado.
- **Operacionalização:** usar categorias, conjuntos, vetores e relações quando
  preservam a estrutura; aceitar números somente com unidade, denominador,
  escopo, algoritmo e versão explícitos.
- **Hipóteses:** limites locais de novidade e coordenação, faixas de
  oportunidades de prática e requisitos explícitos podem ajudar a revelar
  compressão, desalinhamento e repetição superficial.
- **Limites:** essas unidades e parâmetros são criações do AraLearn. Sua
  utilidade, compreensão por autores e relação com resultados educacionais
  exigem avaliação empírica.

A fundamentação e o modelo operacional de contratos estão detalhados em
[Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md).

## 5. Exemplos resolvidos e retirada de apoio

Exemplos resolvidos podem ser mais adequados do que resolução não apoiada para
novatos em determinadas tarefas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples)). A retirada
gradual de etapas pode articular a passagem entre estudo do exemplo e solução
independente ([Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). O benefício depende do conhecimento prévio e da
natureza da operação.

- **Problema:** exigir desempenho completo antes de modelar a operação pode
  produzir busca improdutiva; manter a solução permanentemente visível pode
  produzir dependência.
- **Alternativas e requisitos:** problema completo desde o início, imitação constante ou
  exemplo seguido de apoio progressivamente menor.
- **Decisão:** usar exemplo resolvido e retirada de apoio quando a tarefa e o
  público justificarem; preservar na unidade todos os dados particulares
  necessários.
- **Fundamentação:** exemplos resolvidos e retirada gradual podem beneficiar
  aquisição inicial em condições delimitadas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)).
- **Operacionalização:** passos, dicas ou decisões são retirados sem remover os
  dados necessários à solução.
- **Consequências e hipótese:** essa progressão pode apoiar aquisição inicial sem impedir
  desempenho independente.
- **Limites e evidência necessária:** a sequência não é obrigatória para toda
  aprendizagem; apoio pode tornar-se redundante ou insuficiente. É necessário comparar compreensão do procedimento, solução sem
  apoio e transferência, controlando tempo e experiência.

## 6. Representações externas e múltiplas representações

### Representar não é decorar

Uma representação externa torna perceptíveis relações que podem ser difíceis
de conservar mentalmente: posição num plano, incidência num grafo, hierarquia
numa árvore, alinhamento numa glosa, estrutura numa fórmula ou comparação numa
tabela. O quadro DeFT propõe analisar representações por desenho, funções e
tarefas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Uma representação pode complementar informação,
restringir interpretações ou ajudar a construir novas relações; também pode
introduzir convenções desconhecidas e trabalho de coordenação.

A teoria da aprendizagem multimídia e a evidência de contiguidade sustentam
integrar elementos que precisam ser compreendidos em conjunto
([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)). Elas não sustentam que adicionar
imagens ou aumentar a variedade visual melhora automaticamente a aprendizagem.

Representações diferentes não são traduções transparentes umas das outras. O
modo de representar pode apoiar determinada inferência e interferir em outra;
relações entre texto e imagem podem envolver complementaridade, especialização,
redundância ou outras funções que precisam ser declaradas
([Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations);
[Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext)).
Sinalização pode apoiar a coordenação de texto e imagem em condições
delimitadas, com moderadores e heterogeneidade; não corrige conteúdo
incompatível nem torna qualquer arranjo instrucionalmente adequado
([Richter et al. (2016)](referencias.md#ref-richter2016signaling);
[Schneider et al. (2018)](referencias.md#ref-schneider2018signaling)).

### Decisão e hipótese para o AraLearn

- **Problema:** prosa e tabela podem apagar relações próprias de um domínio;
  representações especializadas também podem criar uma gramática visual artificial.
- **Alternativas e requisitos:** prosa, componente geral ou componente especializado;
  a escolha requer justificativa semântica, convenção acadêmica,
  correspondência com a operação-alvo da tarefa, legibilidade, acessibilidade e
  capacidade de representar casos complexos.
- **Decisão:** admitir uma representação especializada somente quando preserva uma
  estrutura que componentes gerais não expressam adequadamente; escolher primeiro
  pela intenção e consultar depois o contrato específico.
- **Fundamentação:** representações podem complementar, restringir, apoiar ou
  interferir em relações, e sua coordenação também cria demanda
  ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft); [Mayer (2009)](referencias.md#ref-mayer2009multimedia);
  [Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations);
  [Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext)).
- **Operacionalização:** catálogo semântico, contrato específico, mecanismo de
  renderização disciplinar, caso de estresse e auditoria compõem o pacote de
  componente.
- **Consequências e hipótese:** seleção por intenção e renderização disciplinar podem reduzir
  ambiguidade e tradução mental.
- **Limites e evidência necessária:** contrato válido, ausência de sobreposição
  e biblioteca consolidada são evidências técnicas, não prova de compreensão. A avaliação deve comparar texto, representação geral e especializada para
  a mesma tarefa; incluir especialista do domínio, novato e caso de estresse.

## 7. Gênero discursivo e descrição do artefato

Na tradição retórica e organizacional, gênero é uma forma recorrente de ação
social reconhecida numa comunidade, não um contorno visual ou um tipo de arquivo
([Miller (1984)](referencias.md#ref-miller1984genre);
[Yates e Orlikowski (1992)](referencias.md#ref-yates1992genres)). Por isso, uma
interface em blocos retangulares não estabelece por si um gênero discursivo, e
uma unidade curta não se torna flashcard apenas pela aparência.

O AraLearn é um **ambiente de aprendizagem, autoria
e pesquisa com unidades de estudo estruturadas**. A fórmula
explica funções do artefato; não reivindica a descoberta de um gênero
discursivo estabelecido. Dentro dele podem coexistir gêneros e atividades
diversos, como explicação, definição, exemplo resolvido, comparação, pergunta de
recuperação ou anotação especializada. Eles precisam ser identificados por sua
função comunicativa e instrucional, não apenas pelo mecanismo de renderização.

- **Problema:** chamar toda unidade de “flashcard” apaga diferenças entre
  exposição, representação, resposta e feedback; inventar um gênero próprio
  sem comunidade e prática reconhecíveis transforma hipótese em conclusão.
- **Decisão:** separar classe funcional do produto, gênero discursivo do
  conteúdo, unidade persistida e formato de atividade.
- **Hipótese:** uma taxonomia explícita dessas camadas pode melhorar a conversa
  entre especialista, pesquisador e processo assistido de autoria.
- **Limites e evidência necessária:** a utilidade dessa taxonomia exige análise
  de corpus, concordância entre anotadores e estudo com autores. História do
  produto e semelhança visual não demonstram validade das categorias.

## 8. Leitura móvel, ação e inferências sobre atenção

Layout, tamanho de tela e movimento do texto podem afetar leitura e esforço, mas
os resultados dependem da tarefa, do material e do modo de interação
([Dyson (2004)](referencias.md#ref-dyson2004layout);
[Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens);
[Li et al. (2021)](referencias.md#ref-li2021interaction)). Isso não estabelece
que rolagem, paginação ou encaixe automático seja universalmente superior. A Autoria móvel
adota como hipótese de interface uma **sequência vertical de inspeção**: fluxo finito,
curricularmente ordenado, com posição, hierarquia, retomada e marcos explícitos.
Ela deve ser avaliada pela capacidade de localizar, revisar e anotar unidades,
não por semelhança com um fluxo contínuo de publicações.

Twitter/X ajuda a explicar a genealogia de fluxos curtos e continuamente
roláveis, mas não fornece fundamento pedagógico para copiá-los. Estudos de sua
linguagem e de usos educacionais descrevem fenômenos situados, enquanto pesquisa
de interação mostra riscos próprios de consumo de mídia social
([Zappavigna (2011)](referencias.md#ref-zappavigna2011ambient);
[Tang e Hew (2017)](referencias.md#ref-tang2017twitter);
[Baughan et al. (2022)](referencias.md#ref-baughan2022dissociation)). O
precedente genealógico permanece separado da evidência educacional.

Uma expressão única para gesto e cognição reúne indevidamente níveis
diferentes. A análise distingue:

1. **gesto de entrada**, movimento observável, como toque ou deslize;
2. **ação de interface**, mudança de estado disparada, como avançar ou abrir;
3. **operação-alvo da tarefa**, como comparar, ordenar, explicar ou provar;
4. **ação epistêmica**, ação externa que revela informação ou simplifica o
   trabalho cognitivo sob condições demonstradas; e
5. **processo cognitivo hipotético**, que não é observado diretamente.

A distinção entre ações pragmáticas e epistêmicas oferece base conceitual, mas
não autoriza classificar todo toque como ação epistêmica
([Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic);
[Kirsh (2010)](referencias.md#ref-kirsh2010external)). Atenção compreende
processos seletivos internos e externos com mecanismos próprios
([Chun et al. (2011)](referencias.md#ref-chun2011attention)). Cliques, foco de
teclado, posição visível, rolagem e tempo de permanência são eventos técnicos,
não medidas diretas de atenção; explicações neurocientíficas exigem cautela
adicional ([Howard-Jones (2014)](referencias.md#ref-howardjones2014neuroscience)).

Engajamento também é multidimensional, e revisões da aprendizagem mediada por
tecnologia mostram diversidade de definições e instrumentos
([Henrie et al. (2015)](referencias.md#ref-henrie2015engagement)). Nem relato nem
log deve ser promovido sozinho a verdade psicológica; divergências sistemáticas
entre uso digital registrado e autorrelatado reforçam a necessidade de declarar
o que cada fonte observa
([Parry et al. (2021)](referencias.md#ref-parry2021digitalmedia)).

## 9. Prática de recuperação e formato de resposta

**Prática de recuperação** exige produzir conhecimento ou tomar uma decisão sem
reexposição integral ao conteúdo-alvo. Estudos experimentais e revisões
encontraram benefícios em diferentes condições escolares, com variação por
tarefa, conteúdo e medida ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). Transferência para estruturas novas é possível, mas
moderada ([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

Reconhecer uma alternativa, preencher uma lacuna, digitar uma resposta,
explicar e ordenar blocos não são operações equivalentes. A dificuldade maior
de um formato não o torna automaticamente mais educativo.

- **Problema:** qualquer toque pode ser classificado indevidamente como
  recuperação; formatos repetidos podem medir apenas reconhecimento.
- **Alternativas e requisitos:** formato fixo, rotação aleatória ou resposta
  escolhida pela operação; são necessários correspondência entre objetivo e resposta,
  dados suficientes na unidade, feedback e possibilidade de ação posterior.
- **Decisão:** escolher a resposta pela operação-alvo da tarefa e materializar lacunas
  dentro do objeto representado; cada lacuna possui estado e opções próprios.
- **Fundamentação:** recuperação apresenta benefícios em diferentes contextos,
  mas formatos e transferência possuem moderadores
  ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).
- **Operacionalização:** cada prática declara o que verifica e posiciona a
  resposta no lugar estrutural da decisão.
- **Consequências e hipótese:** articular reconhecimento e produção de forma planejada pode
  apoiar resultados diferentes.
- **Limites e evidência necessária:** acerto imediato não demonstra retenção e
  dificuldade percebida não demonstra aprendizagem. É necessário medir compreensão imediata, retenção e transferência
  separadamente.

## 10. Prática distribuída e intercalação

A prática distribuída apresenta base empírica ampla, mas o intervalo favorável
depende do horizonte de retenção e de outras características
([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing)). **Intercalação** não é sinônimo de
espaçamento: alterna categorias ou procedimentos e pode favorecer
discriminação, com moderadores como similaridade
([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).

- **Problema:** prática concentrada pode sustentar desempenho imediato sem
  retenção; mistura aleatória pode apenas confundir.
- **Alternativas e requisitos:** concentrar, distribuir ou intercalar; o
  intervalo precisa corresponder ao horizonte de retenção e a intercalação deve
  exigir discriminação real.
- **Decisão:** registrar dependências e retomadas sem intervalo universal;
  intercalar quando decidir entre categorias é parte do objetivo.
- **Fundamentação:** efeitos de distribuição dependem do intervalo, e efeitos de
  intercalação dependem das categorias e tarefas
  ([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing); [Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).
- **Operacionalização:** o planejamento registra a retomada e a razão para
  alternar categorias relacionadas.
- **Consequências e hipótese:** retomada e discriminação planejadas podem apoiar retenção e
  seleção de procedimento.
- **Limites e evidência necessária:** variedade de unidades não equivale a
  intercalação. É necessária tarefa posterior em intervalo justificado e casos
  que realmente exigem discriminação.

## 11. Feedback, ação e baixa consequência

O feedback não é eficaz apenas por ser imediato. Seus efeitos variam conforme
foco, conteúdo, momento, tarefa e possibilidade de ação
([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). A competência para interpretar e usar feedback
(*feedback literacy*) desloca a atenção da mensagem entregue para a capacidade de
interpretar, julgar e usar essa informação ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). Feedback também pode corrigir avaliações metacognitivas
equivocadas, como respostas corretas dadas com baixa confiança
([Butler et al. (2008)](referencias.md#ref-butler2008confidence)).

Testes frequentes de baixa consequência apresentam efeito médio positivo em
certos contextos educacionais, com heterogeneidade
([Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes)). “Baixa consequência” descreve ausência de nota, ranking ou
penalização acumulada; não significa ausência de desafio ou demonstração de
redução de ansiedade.

- **Problema:** feedback binário pode não orientar ação; avaliação automática a
  cada toque revela informação cedo demais.
- **Alternativas e requisitos:** avaliar a cada toque, revelar resposta, apenas
  registrar resultado ou oferecer retorno específico depois de confirmação.
- **Decisão:** avaliar após confirmação, oferecer explicação específica,
  permitir repetir e revelar a resposta somente por ação explícita; não
  transformar tentativas em punição ou diagnóstico.
- **Fundamentação:** foco, conteúdo, momento e oportunidade de agir moderam o
  feedback ([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)).
- **Operacionalização:** confirmar, receber feedback, tentar novamente, revelar
  e avançar são estados distintos.
- **Consequências e hipótese:** esse fluxo pode apoiar interpretação do erro e decisão de
  revisão.
- **Limites e evidência necessária:** receber ou concordar com uma mensagem não
  demonstra uso do feedback. A avaliação precisa pedir que a pessoa explique o feedback, revise sua
  estratégia e aplique o aprendizado em outro item.

## 12. Participação, responsabilidade e acesso

A aprendizagem ocorre por mediações, instrumentos e relações sociais
([Vygotsky (1978)](referencias.md#ref-vygotsky1978mind)). O apoio pode ser contingente e retirado à medida que a pessoa
assume partes da tarefa ([Wood et al. (1976)](referencias.md#ref-wood1976tutoring)). Comunidades de prática ajudam a
compreender participação e construção de significado, mas também podem
habilitar ou inibir agência ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)). Essas fontes não
permitem tratar acesso comum a um Curso como colaboração ou comunidade.

- **Problema:** compartilhar um Curso para estudo precisa preservar acesso
  revogável sem tornar difusa a responsabilidade por sua autoria.
- **Alternativas e requisitos:** edição coletiva por papéis, isolamento pessoal
  completo ou propriedade do Curso com compartilhamento direto para Estudo.
- **Decisão:** reservar a Autoria à pessoa proprietária e conceder a outras
  pessoas somente o Estudo e o estado pessoal associado.
- **Fundamentação:** participação e agência coletiva dependem do contexto e das
  relações sociais ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)). A distinção entre propriedade e acesso
  torna explícito que participação social não decorre de um papel cadastrado.
- **Operacionalização:** a autorização é calculada por Curso e operação; o
  acesso direto pode ser concedido ou revogado, e as mudanças autorais preservam
  origem e revisão.
- **Consequências e hipótese:** uma fronteira compreensível entre autoria e
  Estudo pode apoiar responsabilidade e reduzir erros de permissão.
- **Limites e evidência necessária:** acesso, copresença ou quantidade de
  Observações não demonstram colaboração. A avaliação precisa incluir tarefas
  de compartilhamento, revogação e explicação de responsabilidade. Autoria
  coletiva continua sendo uma questão de pesquisa, não uma capacidade vigente.

## 13. Inteligência artificial generativa, recuperação de contexto e controle humano

Um **modelo de linguagem de grande porte** (LLM, do inglês *large language
model*) estima e produz sequências de linguagem a partir de instruções e
contexto. **Inteligência artificial generativa** (IA generativa) é a categoria
mais ampla de sistemas capazes de produzir conteúdo; fluência não implica
correção factual ou adequação pedagógica.

A geração aumentada por recuperação condiciona a geração a informação
recuperada ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)). Ela não elimina erros de fonte, recuperação,
interpretação ou geração. Nem todo mecanismo de consulta de contexto deve ser
chamado de RAG; o termo exige que a recuperação integre a arquitetura de
geração de modo identificável.

Diretrizes para interação entre pessoas e IA recomendam comunicar capacidades e limites,
oferecer feedback e permitir correção ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Funções que exigem
reflexão podem reduzir dependência excessiva em alguns cenários, mas também
introduzem custo e não se transferem automaticamente
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). Orientações de UNESCO e NIST destacam avaliação de
risco, transparência, proteção de dados e responsabilidade humana
([UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)).

- **Problema:** uma LLM pode produzir estrutura válida com conteúdo incorreto,
  selecionar representação inadequada ou alterar fora do escopo.
- **Alternativas e requisitos:** geração livre, contrato monolítico ou
  recuperação progressiva de ferramentas; são necessários contexto suficiente e econômico, contratos
  especializados, escopo gravável explícito, validação, auditoria, iteração e
  reversão.
- **Decisão:** apresentar primeiro o catálogo de intenções, recuperar o contrato
  do componente escolhido, separar contexto somente leitura de alvos editáveis e
  manter decisão editorial humana.
- **Fundamentação:** recuperação de contexto não elimina erro
  ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)); interação responsável exige limites, correção e controle
  ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai); [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance); [UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)).
- **Operacionalização:** catálogo, contrato específico, contexto de leitura,
  alvos graváveis, validação e versões reversíveis formam etapas distintas.
- **Consequências e hipótese:** essa delimitação pode reduzir deriva estrutural e retrabalho.
- **Limites e evidência necessária:** JSON válido e resposta fluente não
  garantem qualidade factual, pedagógica ou acadêmica. São necessárias tarefas com modelos e contextos variados, incluindo
  erro factual, lacuna do catálogo, mudança de escopo, rejeição e reversão.

## 14. Análise de dados educacionais, privacidade e interpretação

A análise de dados educacionais, também conhecida como *learning analytics*,
envolve mais que coletar e exibir dados. Transparência, controle,
responsabilidade e finalidade são princípios éticos relevantes
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). Abordagens centradas nas pessoas
tratam feedback informado por dados como processo humano e dialógico
([Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)).

Cliques, tempo, conclusão e resposta revelada são manifestações ambíguas. Podem
refletir interrupção, acessibilidade, curiosidade, estratégia, familiaridade ou
falha técnica. Sem modelo e validação, não medem atenção, esforço, domínio ou
qualidade docente.

- **Problema:** dados disponíveis tecnicamente tendem a ser promovidos a
  indicadores sem pergunta ou intervenção legítima.
- **Alternativas e requisitos:** coletar tudo, proibir qualquer dado ou definir
  finalidade, interpretação e ação antes da coleta.
- **Decisão:** a área Pesquisa expõe fatos do processo de Autoria e contagens
  descritivas por conjunto, tipo e estado. Ela não acrescenta telemetria
  comportamental de Estudo e retira identidade de conta, texto bruto de
  Observações e cópias integrais de conteúdo.
- **Fundamentação:** a ética da análise de dados exige finalidade, transparência,
  proporcionalidade e participação ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)).
- **Operacionalização:** cada consulta fixa Curso, revisão, filtros e instante de
  corte. Gráfico, tabela, lista, CSV, JSON e MCP usam o mesmo recorte. As
  métricas correntes declaram pergunta, unidade, denominador, tratamento de
  ausências e inferências vedadas.
- **Consequências e hipótese:** fatos rastreáveis e definições explícitas podem
  tornar análises do processo autoral mais reprodutíveis e proporcionais, com
  menor risco de vigilância.
- **Limites e evidência necessária:** coletar menos é decisão normativa e
  técnica; efeitos sobre confiança, uso ou aprendizagem precisam ser
  investigados por desenho participativo, teste de interpretação, utilidade para
  decisões reais e análise de efeitos adversos.

## 15. Métrica, indicador, desfecho e validade

Guardar um evento com precisão não valida a interpretação construída sobre ele.
Validade diz respeito à sustentação das interpretações e dos usos de uma medida
em determinada população, tarefa e decisão; não é um selo permanente do campo
de banco, do instrumento ou do algoritmo
([Messick (1995)](referencias.md#ref-messick1995validity);
[American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards)).

Para a pesquisa no AraLearn, os níveis ficam separados:

- **dado bruto** é o observável preservado com contexto, unidade e proveniência;
- **métrica** é uma regra de cálculo versionada;
- **medida** é o valor observado ou derivado pela aplicação dessa regra;
- **indicador** é uma interpretação declarada para apoiar uma finalidade;
- **desfecho de pesquisa** é a variável escolhida como resultado no protocolo.

Uma contagem de anotações, por exemplo, pode ser dado e medida de frequência.
Ela só se torna indicador de carga de revisão sob uma justificativa explícita e
não mede automaticamente dificuldade, qualidade, engajamento ou atenção. O
mesmo vale para proporção teoria–prática, distribuição de componentes,
quantidade de conceitos anotados, tempo de materialização e taxa de correção.

- **Decisão:** conservar fatos de autoria e planejamento em granularidade
  suficiente para recalcular métricas; versionar definição, fórmula,
  denominador e filtros; registrar interpretação permitida e proibida.
- **Hipótese:** ligar configuração, fonte, anotação, correção e versão do
  conteúdo pode permitir análises reprodutíveis do processo de autoria.
- **Limites e evidência necessária:** reprodutibilidade técnica não demonstra
  validade educacional ou causalidade. Cada estudo precisa justificar
  instrumento, população, momento, dados ausentes, incerteza, comparações e
  consequências do uso.

## 16. Construção e avaliação do artefato

Design-Based Research (DBR) investiga intervenções educacionais por ciclos em
contextos autênticos e busca explicar relações entre teoria, design e prática
([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)). Design Science Research (DSR)
organiza construção, demonstração e avaliação de artefatos e do conhecimento de
design que incorporam ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)).

Gregor e Hevner ajudam a posicionar a contribuição conforme a maturidade do
problema e da solução ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). O quadro FEDS distingue
finalidade formativa ou somativa e ambiente artificial ou naturalístico
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

Para o AraLearn, as tradições são complementares:

- DBR é apropriada para investigar como uma intervenção opera com estudantes,
  autores e instituições em situações reais;
- DSR é apropriada para investigar o artefato, seus mecanismos, sua utilidade,
  sua correção e o conhecimento de design produzido;
- testes de software podem integrar DSR como evidência técnica, mas não
  substituem avaliação educacional;
- iterar uma interface, sem pergunta e explicação, não constitui DBR.

## Síntese das alegações

| Alegação simplificada | Estado desta revisão | Consequência responsável |
| --- | --- | --- |
| unidades menores são sempre melhores | não sustentada | dimensionar por objetivo, relações e conhecimentos prévios |
| cardinalidade de unidades mede carga cognitiva | não sustentada | conservar estrutura, público e relações; usar contagem apenas como descrição operacional |
| parágrafo, caracteres ou palavras delimitam unidade de sentido | falso como regra geral | declarar critério discursivo, anotação, denominador e versão |
| toda unidade visual do AraLearn é um flashcard | falso | reservar flashcard para organização pista–resposta; separar unidade, gênero e atividade |
| toda dimensão pedagógica deve receber pontuação | falso | manter categorias, conjuntos, vetores e relações quando preservam melhor a decisão |
| mais representações melhoram aprendizagem | não sustentada | exigir função e adequação de cada representação |
| transformar texto em imagem preserva necessariamente o mesmo conteúdo | falso | registrar relação, fonte, perdas, acréscimos e finalidade da transformação |
| componente disponível foi selecionado e usado | falso | distinguir política vigente, escolha local e instância materializada |
| recuperação e distribuição podem beneficiar aprendizagem | sustentada em múltiplos contextos, com moderadores | escolher operação, intervalo, feedback e medida |
| oferecer controle produz autonomia | não sustentada como regra | articular escolha significativa, estrutura e avaliação de agência |
| feedback funciona por ser imediato | simplificação indevida | estudar conteúdo, foco, interpretação e ação |
| armazenamento local reduz atrito e melhora aprendizagem | primeira relação é hipótese; segunda requer estudo separado | medir retomada antes de inferir efeito educacional |
| rolagem vertical demonstra atenção ou engajamento | falso | registrar gesto, ação e contexto; validar separadamente qualquer inferência psicológica |
| contrato e RAG garantem correção | falso | validar, auditar, revisar e conservar controle humano |
| rastros de uso medem aprendizagem | falso sem validação | partir de construto e finalidade, não do dado disponível |
| uma fórmula reproduzível torna a métrica válida | falso | validar interpretação e uso para população, tarefa e decisão declaradas |

## Lacunas de conhecimento

O corpus atual ainda precisa ser ampliado para:

- comparar sistemas de gestão da aprendizagem, itens de recuperação por pista–resposta, tutores, sistemas de microaprendizagem, ferramentas de
  autoria, sistemas local-first e catálogos extensíveis sem reduzir suas
  diferenças;
- caracterizar estudantes-trabalhadores e situações reais de conectividade;
- selecionar e validar medidas de retomada, carga, agência, competência para usar feedback e
  qualidade autoral;
- mapear gêneros discursivos, critérios de segmentação, convenções
  representacionais e operações-alvo em mais áreas do
  conhecimento;
- estudar composição e transformação de múltiplas representações numa mesma
  unidade de estudo;
- investigar explicação progressiva para novatos sem perda de profundidade;
- avaliar se autores compreendem e corrigem unidades, conjuntos de coordenação,
  requisitos de explicação e requisitos de evidência;
- validar limites locais de novidade, coordenação e oportunidades de prática
  sem promovê-los a escalas psicológicas;
- comparar políticas de componentes e registrar quando nenhuma representação
  disponível é adequada;
- separar compreensão imediata, retenção e transferência em formatos de
  prática diferentes;
- comparar sequência vertical, paginação e outras formas de inspeção autoral
  sem usar rolagem ou permanência como medidas substitutas de atenção;
- validar definições e instrumentos para densidade conceitual, complexidade
  textual, engajamento e qualidade autoral;
- investigar modelos de IA de capacidades e custos distintos na autoria;
- estudar governança, proveniência, poder e autoria coletiva;
- registrar mecanismos que falham, resultados nulos e efeitos adversos.

## Documentos de operacionalização

- [Modelo didático](modelo-didatico.md)
- [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
- [Fundamentos de pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
- [Quadro teórico](quadro-teorico.md)
- [Glossário de construtos](glossario-construtos.md)
- [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
- [Protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md)
- [Fundamentação pedagógica das representações](fundamentacao-pedagogica-dos-resources.md)
- [Contribuição e originalidade](contribuicao-originalidade.md)

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui): Masyura Ahmad Faudzi; Zaihisma Che Cob; Ridha Omar; Sharul Azim Sharudin; Masitah Ghazali (2023). **Investigating the User Interface Design Frameworks of Current Mobile Learning Applications: A Systematic Review.** *Education Sciences*, 13(1), p. 94.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards): American Educational Research Association; American Psychological Association; National Council on Measurement in Education (2014). **Standards for Educational and Psychological Testing.** Washington, DC, American Educational Research Association.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Autio et al. (2024)](referencias.md#ref-nist2024genai): Chloe Autio; Reva Schwartz; Jesse Dunietz; Shomik Jain; Martin Stanley; Elham Tabassi; Patrick Hall; Kamie Roberts (2024). **Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile.** National Institute of Standards and Technology, NIST AI 600-1.
- [Bandura (2001)](referencias.md#ref-bandura2001agency): Albert Bandura (2001). **Social Cognitive Theory: An Agentic Perspective.** *Annual Review of Psychology*, 52, p. 1–26.
- [Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards): Philip D. Barrison; Emily A. Balczewski; Emily Capellari; Zach Landis-Lewis; Alexandra H. Vinson (2025). **Electronic Flashcards in Health Professions Education: A Scoping Review.** *Academic Medicine*, 100(4), p. 497–506.
- [Baughan et al. (2022)](referencias.md#ref-baughan2022dissociation): Amanda Baughan; Mingrui Ray Zhang; Raveena Rao; Kai Lukoff; Anastasia Schaadhardt; Lisa D. Butler; Alexis Hiniker (2022). **I Don't Even Remember What I Read: How Design Influences Dissociation on Social Media.** In: *Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems*, ACM, p. 1–13.
- [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative): E. N. Bridwell-Mitchell (2016). **Collaborative Institutional Agency: How Peer Learning in Communities of Practice Enables and Inhibits Micro-Institutional Change.** *Organization Studies*, 37(2), p. 161–192.
- [Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving): Markus Brunmair; Tobias Richter (2019). **Similarity Matters: A Meta-Analysis of Interleaved Learning and Its Moderators.** *Psychological Bulletin*, 145(11), p. 1029–1052.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1).
- [Butler et al. (2008)](referencias.md#ref-butler2008confidence): Andrew C. Butler; Jeffrey D. Karpicke; Henry L. Roediger (2008). **Correcting a Metacognitive Error: Feedback Increases Retention of Low-Confidence Correct Responses.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 34(4), p. 918–928.
- [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy): David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325.
- [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing): Shana K. Carpenter; Steven C. Pan; Andrew C. Butler (2022). **The Science of Effective Learning with Spacing and Retrieval Practice.** *Nature Reviews Psychology*, 1, p. 496–511.
- [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed): Nicholas J. Cepeda; Harold Pashler; Edward Vul; John T. Wixted; Doug Rohrer (2006). **Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.** *Psychological Bulletin*, 132(3), p. 354–380.
- [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing): Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102.
- [Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity): Ouhao Chen; Fred Paas; John Sweller (2023). **A Cognitive Load Theory Approach to Defining and Measuring Task Complexity Through Element Interactivity.** *Educational Psychology Review*, 35, p. 63.
- [Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations): Michelene T. H. Chi; Miriam Bassok; Matthew W. Lewis; Peter Reimann; Robert Glaser (1989). **Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.** *Cognitive Science*, 13(2), p. 145–182.
- [Chi et al. (1994)](referencias.md#ref-chi1994eliciting): Michelene T. H. Chi; Nicholas de Leeuw; Mei-Hung Chiu; Christian LaVancher (1994). **Eliciting Self-Explanations Improves Understanding.** *Cognitive Science*, 18(3), p. 439–477.
- [Choi et al. (2024)](referencias.md#ref-choi2024vivid): Seulgi Choi; Hyewon Lee; Yoonjoo Lee; Juho Kim (2024). **VIVID: Human–AI Collaborative Authoring of Vicarious Dialogues from Lecture Videos.** In: *Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems*, Association for Computing Machinery, p. 1–26.
- [Chun et al. (2011)](referencias.md#ref-chun2011attention): Marvin M. Chun; Julie D. Golomb; Nicholas B. Turk-Browne (2011). **A Taxonomy of External and Internal Attention.** *Annual Review of Psychology*, 62(1), p. 73–101.
- [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning): Jennie Chang De Gagne; Hyeyoung Kate Park; Katherine Hall; Amanda Woodward; Sandra Yamane; Sang Suk Kim (2019). **Microlearning in Health Professions Education: Scoping Review.** *JMIR Medical Education*, 5(2), p. e13997.
- [Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha): Deepak Varuvel Dennison; Bakhtawar Ahtisham; Kavyansh Chourasia; Nirmit Arora; Rahul Singh; René F. Kizilcec; Akshay Nambi; Tanuja Ganu; Aditya Vashistha (2026). **Shiksha Copilot: Teacher–AI Collaboration for Curating and Customizing Lesson Plans in Low-Resource Schools.** *Proceedings of the ACM on Human-Computer Interaction*, 10(2), p. 1–47.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Dyson (2004)](referencias.md#ref-dyson2004layout): Mary C. Dyson (2004). **How Physical Text Layout Affects Reading from Screen.** *Behaviour & Information Technology*, 23(6), p. 377–393.
- [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption): Cyrus K. Foroughi; Nicole E. Werner; Elizabeth T. Nelson; Deborah A. Boehm-Davis (2016). **Individual Differences in Working-Memory Capacity and Task Resumption Following Interruptions.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*.
- [Gazzola et al. (2022)](referencias.md#ref-gazzola2022textcomplexity): Murilo Gazzola; Sidney Leal; Breno Pedroni; Fábio Theoto Rocha; Sabine Pompéia; Sandra Aluísio (2022). **Text Complexity of Open Educational Resources in Portuguese: Mixing Written and Spoken Registers in a Multi-task Approach.** *Language Resources and Evaluation*, 56(2), p. 621–650.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [Graesser et al. (2004)](referencias.md#ref-graesser2004cohmetrix): Arthur C. Graesser; Danielle S. McNamara; Max M. Louwerse; Zhiqiang Cai (2004). **Coh-Metrix: Analysis of Text on Cohesion and Language.** *Behavior Research Methods, Instruments, & Computers*, 36(2), p. 193–202.
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback): John Hattie; Helen Timperley (2007). **The Power of Feedback.** *Review of Educational Research*, 77(1), p. 81–112.
- [Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens): Ymkje E. Haverkamp; Ivar Bråten; Natalia Latini; Ladislao Salmerón (2023). **Is It the Size, the Movement, or Both? Investigating Effects of Screen Size and Text Movement on Processing, Understanding, and Motivation When Students Read Informational Text.** *Reading and Writing*, 36(7), p. 1589–1608.
- [Hearst (1997)](referencias.md#ref-hearst1997texttiling): Marti A. Hearst (1997). **TextTiling: Segmenting Text into Multi-paragraph Subtopic Passages.** *Computational Linguistics*, 23(1), p. 33–64.
- [Henrie et al. (2015)](referencias.md#ref-henrie2015engagement): Curtis R. Henrie; Lisa R. Halverson; Charles R. Graham (2015). **Measuring Student Engagement in Technology-mediated Learning: A Review.** *Computers & Education*, 90, p. 36–53.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Howard-Jones (2014)](referencias.md#ref-howardjones2014neuroscience): Paul A. Howard-Jones (2014). **Neuroscience and Education: Myths and Messages.** *Nature Reviews Neuroscience*, 15(12), p. 817–824.
- [Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol): Angela C. Karich; Matthew K. Burns; Kathrin E. Maki (2014). **Updated Meta-Analysis of Learner Control Within Educational Technology.** *Review of Educational Research*, 84(3), p. 392–410.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Kintsch e van Dijk (1978)](referencias.md#ref-kintsch1978model): Walter Kintsch; Teun A. van Dijk (1978). **Toward a Model of Text Comprehension and Production.** *Psychological Review*, 85(5), p. 363–394.
- [Kirsh (2010)](referencias.md#ref-kirsh2010external): David Kirsh (2010). **Thinking with External Representations.** *AI & Society*, 25(4), p. 441–454.
- [Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic): David Kirsh; Paul Maglio (1994). **On Distinguishing Epistemic from Pragmatic Action.** *Cognitive Science*, 18(4), p. 513–549.
- [Knowles (1975)](referencias.md#ref-knowles1975selfdirected): Malcolm S. Knowles (1975). **Self-Directed Learning: A Guide for Learners and Teachers.** New York, Association Press.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [Lai et al. (2022)](referencias.md#ref-lai2022mobile): Yuzhi Lai; Nadira Saab; Wilfried Admiraal (2022). **Learning Strategies in Self-Directed Language Learning Using Mobile Technology in Higher Education: A Systematic Scoping Review.** *Education and Information Technologies*, 27, p. 7749–7780.
- [Leal et al. (2024)](referencias.md#ref-leal2024nilcmetrix): Sidney Evaldo Leal; Magali Sanches Duran; Carolina Evaristo Scarton; Nathan Siegle Hartmann; Sandra Maria Aluísio (2024). **NILC-Metrix: Assessing the Complexity of Written and Spoken Language in Brazilian Portuguese.** *Language Resources and Evaluation*, 58(1), p. 73–110.
- [Lewis et al. (2020)](referencias.md#ref-lewis2020rag): Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474.
- [Li et al. (2021)](referencias.md#ref-li2021interaction): Jutao Li; Jiutai Song; Yanqun Huang; Yuzhen Wang; Jie Zhang (2021). **Effects of Different Interaction Modes on Fatigue and Reading Effectiveness with Mobile Phones.** *International Journal of Industrial Ergonomics*, 85, p. 103189.
- [Mann e Thompson (1988)](referencias.md#ref-mann1988rst): William C. Mann; Sandra A. Thompson (1988). **Rhetorical Structure Theory: Toward a Functional Theory of Text Organization.** *Text*, 8(3), p. 243–281.
- [Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext): Radan Martinec; Andrew Salway (2005). **A System for Image–Text Relations in New (and Old) Media.** *Visual Communication*, 4(3), p. 337–371.
- [Mayer (2009)](referencias.md#ref-mayer2009multimedia): Richard E. Mayer (2009). **Multimedia Learning.** 2. ed., Cambridge University Press.
- [Messick (1995)](referencias.md#ref-messick1995validity): Samuel Messick (1995). **Validity of Psychological Assessment: Validation of Inferences from Persons' Responses and Performances as Scientific Inquiry into Score Meaning.** *American Psychologist*, 50(9), p. 741–749.
- [Miller (1984)](referencias.md#ref-miller1984genre): Carolyn R. Miller (1984). **Genre as Social Action.** *Quarterly Journal of Speech*, 70(2), p. 151–167.
- [Mislevy et al. (2003)](referencias.md#ref-mislevy2003ecd): Robert J. Mislevy; Russell G. Almond; Janice F. Lukas (2003). **A Brief Introduction to Evidence-Centered Design.** Educational Testing Service, RR-03-16.
- [Monk et al. (2008)](referencias.md#ref-monk2008resumption): Christopher A. Monk; J. Gregory Trafton; Deborah A. Boehm-Davis (2008). **The Effect of Interruption Duration and Demand on Resuming Suspended Goals.** *Journal of Experimental Psychology: Applied*, 14(4), p. 299–313.
- [Morris et al. (2021)](referencias.md#ref-morris2021formative): Rebecca Morris; Thomas Perry; Lindsey Wardle (2021). **Formative Assessment and Feedback for Learning in Higher Education: A Systematic Review.** *Review of Education*, 9(3), p. e3292.
- [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer): Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756.
- [Panadero (2017)](referencias.md#ref-panadero2017selfregulated): Ernesto Panadero (2017). **A Review of Self-Regulated Learning: Six Models and Four Directions for Research.** *Frontiers in Psychology*, 8, p. 422.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Parry et al. (2021)](referencias.md#ref-parry2021digitalmedia): Douglas A. Parry; Brittany I. Davidson; Craig J. R. Sewall; Jacob T. Fisher; Hannah Mieczkowski; Daniel S. Quintana (2021). **A Systematic Review and Meta-analysis of Discrepancies between Logged and Self-reported Digital Media Use.** *Nature Human Behaviour*, 5(11), p. 1535–1547.
- [Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation): Rebecca J. Passonneau; Diane J. Litman (1997). **Discourse Segmentation by Human and Automated Means.** *Computational Linguistics*, 23(1), p. 103–139.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Peters et al. (2024)](referencias.md#ref-peters2024scoping): Micah D. J. Peters; Christina Godfrey; Patricia McInerney; Zachary Munn; Andrea C. Tricco; Hanan Khalil (2024). **Scoping Reviews.** In: *JBI Manual for Evidence Synthesis*, JBI.
- [Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades): Salvador Pons Bordería; Margarita Borreguero Zuloaga (2024). **Unidades discursivas del texto escrito: revisión crítica del estado de la cuestión y directrices para una nueva propuesta.** *Círculo de Lingüística Aplicada a la Comunicación*, 99, p. 7–21.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Richter et al. (2016)](referencias.md#ref-richter2016signaling): Juliane Richter; Katharina Scheiter; Alexander Eitel (2016). **Signaling Text–Picture Relations in Multimedia Learning: A Comprehensive Meta-analysis.** *Educational Research Review*, 17, p. 19–36.
- [Ryan e Deci (2020)](referencias.md#ref-ryan2020motivation): Richard M. Ryan; Edward L. Deci (2020). **Intrinsic and Extrinsic Motivation from a Self-Determination Theory Perspective: Definitions, Theory, Practices, and Future Directions.** *Contemporary Educational Psychology*, 61, p. 101860.
- [Schneider et al. (2018)](referencias.md#ref-schneider2018signaling): Sascha Schneider; Maik Beege; Steve Nebel; Günter Daniel Rey (2018). **A Meta-analysis of How Signaling Affects Learning with Media.** *Educational Research Review*, 23, p. 1–24.
- [Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations): Wolfgang Schnotz; Maria Bannert (2003). **Construction and Interference in Learning from Multiple Representation.** *Learning and Instruction*, 13(2), p. 141–156.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.
- [Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes): Lukas K. Sotola; Marcus Credé (2021). **Regarding Class Quizzes: A Meta-Analytic Synthesis of Studies on the Relationship between Frequent Low-Stakes Testing and Class Performance.** *Educational Psychology Review*, 33(2), p. 407–426.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Tang e Hew (2017)](referencias.md#ref-tang2017twitter): Ying Tang; Khe Foon Hew (2017). **Using Twitter for Education: Beneficial or Simply a Waste of Time?.** *Computers & Education*, 106, p. 97–118.
- [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved): Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848.
- [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr): Andrea C. Tricco; Erin Lillie; Wasifa Zarin; Kelly K. O'Brien; Heather Colquhoun; Danielle Levac; David Moher; Micah D. J. Peters; Tanya Horsley; Laura Weeks; Susanne Hempel; others (2018). **PRISMA Extension for Scoping Reviews (PRISMA-ScR): Checklist and Explanation.** *Annals of Internal Medicine*, 169(7), p. 467–473.
- [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered): Yi-Shan Tsai; Roberto Martinez-Maldonado (2022). **Human-Centered Approaches to Data-Informed Feedback.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 213–222.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.
- [van Merriënboer (2019)](referencias.md#ref-vanmerrienboer2019fourcomponent): Jeroen J. G. van Merriënboer (2019). **The Four-Component Instructional Design Model: An Overview of Its Main Design Principles.** School of Health Professions Education, Maastricht University.
- [Venable et al. (2016)](referencias.md#ref-venable2016feds): John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89.
- [Vygotsky (1978)](referencias.md#ref-vygotsky1978mind): Lev S. Vygotsky (1978). **Mind in Society: The Development of Higher Psychological Processes.** Harvard University Press.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.
- [Wenger (1998)](referencias.md#ref-wenger1998communities): Etienne Wenger (1998). **Communities of Practice: Learning, Meaning, and Identity.** Cambridge University Press.
- [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations): Jörg Wittwer; Alexander Renkl (2008). **Why Instructional Explanations Often Do Not Work: A Framework for Understanding the Effectiveness of Instructional Explanations.** *Educational Psychologist*, 43(1), p. 49–64.
- [Wood (2021)](referencias.md#ref-wood2021dialogic): John Wood (2021). **A Dialogic Technology-Mediated Model of Feedback Uptake and Literacy.** *Assessment & Evaluation in Higher Education*, 46(8), p. 1173–1190.
- [Wood et al. (1976)](referencias.md#ref-wood1976tutoring): David Wood; Jerome S. Bruner; Gail Ross (1976). **The Role of Tutoring in Problem Solving.** *Journal of Child Psychology and Psychiatry*, 17(2), p. 89–100.
- [Yates e Orlikowski (1992)](referencias.md#ref-yates1992genres): Joanne Yates; Wanda J. Orlikowski (1992). **Genres of Organizational Communication: A Structurational Approach to Studying Communication and Media.** *Academy of Management Review*, 17(2), p. 299–326.
- [Zappavigna (2011)](referencias.md#ref-zappavigna2011ambient): Michele Zappavigna (2011). **Ambient Affiliation: A Linguistic Perspective on Twitter.** *New Media & Society*, 13(5), p. 788–806.
- [Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated): Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70.

<!-- referências locais: fim -->
