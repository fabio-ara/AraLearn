# Revisão de literatura orientada ao design

## Finalidade, pergunta e limites

Esta revisão reúne conhecimentos que ajudam a justificar, questionar e avaliar
as decisões educacionais e sociotécnicas do AraLearn. Sua pergunta orientadora
é:

> Que conhecimentos publicados são relevantes para projetar e avaliar uma
> plataforma móvel, local-first, baseada em progressão didática,
> representações externas, prática, feedback e autoria assistida?

O texto é uma **revisão narrativa orientada ao design**. Isso significa que as
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
  design;
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

Uma revisão sistemática encontrou diversidade de frameworks de interface em
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
- **Alternativas e requisitos:** depender do servidor, manter somente cache de
  página ou conservar réplica e cursor locais; a solução requer resposta
  imediata, conteúdo já sincronizado
  disponível, estado corrente inteligível e sincronização fora do caminho
  crítico da interação.
- **Decisão:** manter localmente o conteúdo sincronizado e o estado mínimo
  necessário à continuidade; não tratar abertura ou tempo como atenção.
- **Fundamentação:** interrupções podem impor custo de retomada, enquanto a
  diversidade de situações móveis desaconselha solução universal
  ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption); [Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).
- **Operacionalização:** o estudo lê conteúdo e estado corrente localmente; a
  sincronização ocorre fora do caminho crítico.
- **Consequências e hipótese:** uma réplica local e um cursor compreensível
  podem reduzir erros operacionais de retomada.
- **Limites e evidência necessária:** funcionamento offline é propriedade
  técnica; continuidade de estudo e aprendizagem são resultados empíricos
  distintos. A avaliação requer tarefa interrompida com intervalo e condições de
  rede definidos, medindo localização correta, continuação, erros, ajuda e
  explicação da pessoa.

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
  revisão, observação situada e autoria reversível.
- **Fundamentação:** autorregulação envolve planejamento, monitoramento e
  reflexão; controle disponível na interface apresenta resultados heterogêneos
  ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated); [Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)).
- **Operacionalização:** percurso, consequências, revisão e reversão permanecem
  visíveis e são exercidos por ações explícitas.
- **Consequências e hipótese:** estrutura compreensível combinada a escolhas significativas
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
de segmentação ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)). A literatura de microlearning também reúne
definições e intervenções diversas ([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)). Portanto, não há
base para as regras “um conceito por card” ou “quanto menor, melhor”.

### Decisão e hipótese para o AraLearn

- **Problema:** teoria condensada oculta pré-requisitos; fragmentação excessiva
  destrói relações e amplia navegação.
- **Alternativas e requisitos:** resumir, acumular exposição ou distribuir uma
  progressão conceitual; o desenho requer contexto local, relações
  preservadas, densidade compatível com leitura móvel e profundidade definida
  pelo escopo.
- **Decisão:** dimensionar microssequências e cards depois do planejamento, sem
  quantidade fixa de teoria ou prática; tratar microteoria como recorte local
  suficiente, não resumo.
- **Fundamentação:** memória de trabalho e segmentação dependem da tarefa e do
  desenho; a literatura de microlearning não estabelece cota universal
  ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture); [Rey et al. (2019)](referencias.md#ref-rey2019segmenting); [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).
- **Operacionalização:** pré-requisitos, relações, exemplos e evidências de
  aprendizagem são planejados antes da materialização dos cards.
- **Consequências e hipótese:** explicação progressiva com pré-requisitos explícitos pode reduzir
  carga extrínseca e preservar profundidade.
- **Limites e evidência necessária:** quantidade de cards, tamanho do texto e
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

Para planejar conteúdo de modo rastreável, o AraLearn adota como proposta uma
**unidade de análise instrucional**. Ela é um recorte editorial revisável,
ligado a fonte e objetivo. O conhecimento prévio presumido pode ser descrito
como novo, parcial, integrado ou desconhecido, desde que a base da suposição
permaneça explícita. Trata-se de operacionalização própria, não de diagnóstico,
proficiência ou probabilidade de domínio.

### Interatividade depende da estrutura e do público

Na teoria da carga cognitiva, elemento designa a unidade que precisa ser
processada para aprender ou executar algo, e interatividade se refere aos
elementos que precisam ser coordenados simultaneamente. A estimativa depende
da estrutura da informação e do conhecimento prévio, é necessariamente
aproximada e não equivale à dificuldade geral da tarefa
([Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity)).

A consequência para o desenho não é criar um score de carga. Unidades e
relações que precisam permanecer juntas são registradas como conjuntos de
coordenação; sua cardinalidade pode ser calculada com unidade e escopo
explícitos. Relações de pré-requisito, causalidade, contraste, composição ou
mapeamento representacional permanecem grafos ou conjuntos, porque reduzi-las a
um escalar elimina a informação necessária à revisão.

### Requisito de evidência não é medida validada

O *Evidence-Centered Design* organiza a avaliação como argumento entre
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

A proposta registra requisitos aplicáveis — como definição, mecanismo,
condição de aplicação, limite, contraste, exemplo ou justificativa de
procedimento — ligados às unidades e relações pertinentes. O mesmo princípio
se aplica à prática: oportunidades distintas são reconhecidas por alvo,
operação e estrutura semântica, não por troca cosmética de texto ou componente.

- **Decisão:** separar fontes e objetivo, análise instrucional, parâmetros,
  seleção de resources, blueprint contextual e conteúdo materializado.
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
  público justificarem; preservar no card todos os dados particulares
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

### Decisão e hipótese para o AraLearn

- **Problema:** prosa e tabela podem apagar relações próprias de um domínio;
  recursos especializados também podem criar uma gramática visual artificial.
- **Alternativas e requisitos:** prosa, recurso geral ou package especializado;
  a escolha requer justificativa semântica, convenção acadêmica,
  correspondência com o gesto cognitivo, legibilidade, acessibilidade e
  capacidade de representar casos complexos.
- **Decisão:** admitir um recurso especializado somente quando preserva uma
  estrutura que recursos gerais não expressam adequadamente; escolher primeiro
  pela intenção e consultar depois o contrato específico.
- **Fundamentação:** representações podem complementar, restringir ou apoiar
  relações, mas sua coordenação também cria demanda
  ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft); [Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)).
- **Operacionalização:** catálogo semântico, contrato específico, mecanismo de renderização
  disciplinar, caso de estresse e auditoria compõem o package.
- **Consequências e hipótese:** seleção por intenção e renderização disciplinar podem reduzir
  ambiguidade e tradução mental.
- **Limites e evidência necessária:** contrato válido, ausência de sobreposição
  e biblioteca consolidada são evidências técnicas, não prova de compreensão. A avaliação deve comparar texto, recurso geral e especializado para
  a mesma tarefa; incluir especialista do domínio, novato e caso de estresse.

## 7. Prática de recuperação e formato de resposta

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
  dados suficientes no card, feedback e possibilidade de ação posterior.
- **Decisão:** escolher a resposta pelo gesto cognitivo e materializar lacunas
  dentro do objeto representado; cada lacuna possui estado e opções próprios.
- **Fundamentação:** recuperação apresenta benefícios em diferentes contextos,
  mas formatos e transferência possuem moderadores
  ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).
- **Operacionalização:** cada prática declara o que verifica e posiciona a
  resposta no lugar estrutural da decisão.
- **Consequências e hipótese:** combinar reconhecimento e produção de forma planejada pode
  apoiar resultados diferentes.
- **Limites e evidência necessária:** acerto imediato não demonstra retenção e
  dificuldade percebida não demonstra aprendizagem. É necessário medir compreensão imediata, retenção e transferência
  separadamente.

## 8. Prática distribuída e intercalação

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
- **Limites e evidência necessária:** variedade de cards não equivale a
  intercalação. É necessária tarefa posterior em intervalo justificado e casos
  que realmente exigem discriminação.

## 9. Feedback, ação e baixa consequência

O feedback não é eficaz apenas por ser imediato. Seus efeitos variam conforme
foco, conteúdo, timing, tarefa e possibilidade de ação
([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). A noção de
*feedback literacy* desloca a atenção da mensagem entregue para a capacidade de
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

## 10. Participação, colaboração e autoria

Aprendizagem ocorre por mediações, instrumentos e relações sociais
([Vygotsky (1978)](referencias.md#ref-vygotsky1978mind)). Apoio pode ser contingente e retirado à medida que a pessoa
assume partes da tarefa ([Wood et al. (1976)](referencias.md#ref-wood1976tutoring)). Comunidades de prática ajudam a
compreender participação e construção de significado, mas também podem
habilitar ou inibir agência ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)).

Um **workspace** é um espaço de trabalho com membros, conteúdo e permissões
locais. Essas fontes não permitem chamar qualquer workspace de comunidade ou qualquer
comentário de colaboração.

- **Problema:** autoria individual ou coletiva precisa de contexto, permissão,
  responsabilidade e possibilidade de revisão sem poder global.
- **Alternativas e requisitos:** papéis globais, espaços pessoais isolados ou
  capacidades locais e revogáveis com proveniência.
- **Decisão:** organizar permissões localmente, conservar proveniência e manter
  publicação, estrutura e contribuição como ações distintas.
- **Fundamentação:** participação e agência coletiva dependem do contexto e das
  relações sociais ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)).
- **Operacionalização:** cada workspace delimita membros, papéis, capacidades e
  autoria de mudanças.
- **Consequências e hipótese:** papéis compreensíveis e revogáveis podem apoiar coordenação e
  responsabilidade.
- **Limites e evidência necessária:** acesso comum, copresença ou quantidade de
  mensagens não demonstram colaboração. São necessárias tarefas de convite, contribuição, revisão,
  revogação e explicação de papéis, acompanhadas de análise qualitativa.

## 11. Inteligência artificial generativa, recuperação de contexto e controle humano

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

Diretrizes de interação humano–IA recomendam comunicar capacidades e limites,
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
  do recurso escolhido, separar contexto somente leitura de alvos editáveis e
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

## 12. Learning analytics, privacidade e interpretação

Learning analytics envolve mais que coletar e exibir dados. Transparência,
controle, responsabilidade e finalidade são princípios éticos relevantes
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
- **Decisão:** definir pergunta, construto, manifestação, interpretação,
  alternativas, intervenção, retenção, acesso e custo antes de coletar.
- **Fundamentação:** ética de analytics exige finalidade, transparência,
  proporcionalidade e participação ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)).
- **Operacionalização:** cada indicador precisa de ficha que relacione dado,
  construto, decisão autorizada, retenção e responsabilidade.
- **Consequências e hipótese:** essa governança pode produzir informação mais compreensível e
  proporcional com menor risco de vigilância.
- **Limites e evidência necessária:** coletar menos é decisão normativa e
  técnica; efeitos sobre confiança, uso ou aprendizagem precisam ser
  investigados por co-design, teste de interpretação, utilidade para
  decisões reais e análise de efeitos adversos.

## 13. Construção e avaliação do artefato

Design-Based Research (DBR) investiga intervenções educacionais por ciclos em
contextos autênticos e busca explicar relações entre teoria, design e prática
([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)). Design Science Research (DSR)
organiza construção, demonstração e avaliação de artefatos e do conhecimento de
design que incorporam ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)).

Gregor e Hevner ajudam a posicionar a contribuição conforme a maturidade do
problema e da solução ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). O framework FEDS distingue
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
| toda dimensão pedagógica deve receber score | falso | manter categorias, conjuntos, vetores e relações quando preservam melhor a decisão |
| mais representações melhoram aprendizagem | não sustentada | exigir função e adequação de cada representação |
| resource disponível foi selecionado e usado | falso | distinguir conjunto permitido, escolha local e instância materializada |
| recuperação e distribuição podem beneficiar aprendizagem | sustentada em múltiplos contextos, com moderadores | escolher operação, intervalo, feedback e medida |
| oferecer controle produz autonomia | não sustentada como regra | combinar escolha significativa, estrutura e avaliação de agência |
| feedback funciona por ser imediato | simplificação indevida | estudar conteúdo, foco, interpretação e ação |
| armazenamento local reduz atrito e melhora aprendizagem | primeira relação é hipótese; segunda requer estudo separado | medir retomada antes de inferir efeito educacional |
| contrato e RAG garantem correção | falso | validar, auditar, revisar e conservar controle humano |
| rastros de uso medem aprendizagem | falso sem validação | partir de construto e finalidade, não do dado disponível |

## Lacunas de conhecimento

O corpus atual ainda precisa ser ampliado para:

- comparar LMS, flashcards, tutores, sistemas de microlearning, ferramentas de
  autoria, sistemas local-first e catálogos extensíveis sem reduzir suas
  diferenças;
- caracterizar estudantes-trabalhadores e situações reais de conectividade;
- selecionar e validar medidas de retomada, carga, agência, feedback literacy e
  qualidade autoral;
- mapear convenções representacionais e operações cognitivas em mais áreas do
  conhecimento;
- estudar composição de múltiplas representações num mesmo card;
- investigar explicação progressiva para novatos sem perda de profundidade;
- avaliar se autores compreendem e corrigem unidades, conjuntos de coordenação,
  requisitos de explicação e requisitos de evidência;
- validar limites locais de novidade, coordenação e oportunidades de prática
  sem promovê-los a escalas psicológicas;
- comparar condições de `ResourceSet` e registrar quando nenhuma representação
  permitida é adequada;
- separar compreensão imediata, retenção e transferência em formatos de
  prática diferentes;
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
- [Fundamentação pedagógica dos recursos](fundamentacao-pedagogica-dos-resources.md)
- [Contribuição e originalidade](contribuicao-originalidade.md)
