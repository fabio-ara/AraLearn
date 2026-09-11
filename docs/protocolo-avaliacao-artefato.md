# Protocolo de avaliação do AraLearn

## Planejar a avaliação

Uma avaliação do AraLearn precisa definir que propriedade será examinada e para
qual finalidade: funcionamento do software, qualidade do curso, trabalho de
autoria ou aprendizagem. O protocolo relaciona a pergunta à versão do artefato,
aos métodos, aos resultados e à decisão de manter, alterar ou remover um
mecanismo.

Cada estudo precisa de projeto próprio, plano de amostragem e análise,
instrumentos com evidências adequadas de validade e procedimentos de proteção,
retenção e descarte de dados. Avaliação ética, autorização institucional,
consentimento e registro prévio seguem o contexto e o método adotados. No Brasil,
a Resolução CNS nº 510/2016 estabelece normas para as pesquisas em Ciências
Humanas e Sociais abrangidas por seu escopo
([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)).

O tipo de evidência acompanha a pergunta. Testes demonstram propriedades do
software; satisfação informa uma dimensão da experiência de uso; compreensão,
retenção e transferência exigem tarefas e medidas próprias. Um resultado
pertence à versão, à população e às condições em que foi obtido.

## Escolher o objeto da avaliação

A pergunta define o que será observado. Se uma pessoa não consegue retomar o
estudo, pode haver falha no conteúdo disponível, dificuldade para encontrar o
ponto em que parou ou esquecimento do raciocínio em curso. Um teste do software,
uma observação da navegação e uma tarefa de compreensão examinam aspectos
diferentes desse episódio.

| Objeto | Pergunta delimitada | Evidência pertinente |
| --- | --- | --- |
| Software | O curso já sincronizado abre e conserva o ponto sem conexão? | Teste de perda e retorno de rede, com verificação do estado salvo. |
| Curso | A prática solicita algo que a explicação desenvolveu para esse público? | Análise do conteúdo e das fontes; interpretação da tarefa por estudantes. |
| Autoria | A pessoa identifica uma atribuição incorreta e sabe corrigi-la? | Observação da conferência, decisão justificada e conteúdo depois da revisão. |
| Estudo | A pessoa consegue aplicar uma relação em outro problema? | Tarefa nova e critérios de avaliação coerentes com a relação investigada. |

Uma avaliação do software pode focalizar o **núcleo comum**, que coordena o
aplicativo, ou um **pacote de componente**, que reúne dados, validação e
apresentação de uma representação ou resposta. A [arquitetura](arquitetura.md)
explica essa organização, e [armazenamento e sincronização](persistencia-relacional.md#sincronização-e-concorrência-no-dispositivo)
desenvolve o funcionamento da cópia local.

## Escolher uma estratégia de investigação

A estratégia depende do conhecimento pretendido. Compreender práticas de uma
instituição, refinar uma intervenção com educadores e estimar o efeito de uma
mudança são propósitos distintos. Os procedimentos seguintes são possibilidades
a particularizar; uma investigação pode seguir outro enquadramento justificado.

### Compreender uma situação por estudo de caso

Um estudo de caso delimita um fenômeno em contexto e relaciona fontes de dados
que ajudam a compreendê-lo. [Baxter e Jack (2008)](referencias.md#ref-baxter2008casestudy)
apresentam escolhas sobre a pergunta, os limites do caso e o uso de múltiplas
fontes. No AraLearn, um caso poderia ser a autoria e a revisão de um curso numa
equipe durante um período definido. Materiais, entrevistas e observação
permitiriam investigar decisões e dificuldades. A interpretação resultante
precisaria conservar as condições daquele caso.

### Trilha educacional: Design-Based Research

Quando interessa desenvolver uma intervenção educacional e compreender como
ela funciona em contexto, a **pesquisa baseada em design**, ou
*Design-Based Research* (DBR), organiza ciclos de desenho, uso e revisão
([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased);
[Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).

Por exemplo, educadores e estudantes podem investigar uma sequência em que a
ajuda é pouco consultada. Uma primeira observação pode revelar dificuldade para
reconhecer quando ela é necessária. O ciclo seguinte modifica a apresentação e
examina novamente o uso. A análise relaciona a mudança às condições e aos
processos observados; a contribuição inclui tanto a intervenção quanto uma
explicação sobre as condições em que esse apoio é útil.

### Trilha do artefato: Design Science Research

A **pesquisa orientada à construção e avaliação de artefatos**, ou *Design
Science Research* (DSR), relaciona um problema relevante à solução construída e
ao conhecimento produzido por sua avaliação
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience);
[Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). A contribuição é
situada em relação ao que já se conhece sobre o problema e suas soluções
([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)).

Uma investigação pode comparar formas de reunir texto, fonte e decisão de
revisão. Além do funcionamento dos controles, interessa avaliar se eles ajudam
as pessoas a realizar a tarefa. DSR admite avaliação em uso e aspectos humanos;
sua distinção em relação à DBR está na tradição, na pergunta e na contribuição
pretendida, sem reservar toda pergunta educacional à DBR.

### Comparar efeitos

Se a finalidade for atribuir uma diferença de resultado à intervenção, o
protocolo precisa justificar como enfrenta causas alternativas. O conhecimento
prévio, o tempo de estudo e a dificuldade dos materiais podem mudar junto com
a condição investigada. O [guia de investigação](guia-pesquisador.md#da-pergunta-ao-método)
introduz a diferença entre comparação experimental, quase experimental e
observacional. A escolha requer pressupostos e análise compatíveis
([Shadish et al. (2002)](referencias.md#ref-shadish2002experimental)).

### Relacionar estratégias

Uma observação de uso pode revelar um requisito técnico; uma falha técnica
pode explicar por que a intervenção prevista não ocorreu. Compartilhar dados
entre etapas da pesquisa é útil quando sua função permanece clara. Estudo de
caso, DBR, DSR e comparação de efeitos não são etapas obrigatórias de uma mesma
escada: a pergunta determina quais relações precisam ser investigadas.

## Formulação de uma avaliação

Antes da coleta, preencher:

| Campo | Pergunta operacional |
| --- | --- |
| problema | que situação concreta exige investigação? |
| pergunta ou proposição | qual relação ou processo se pretende compreender? As P1–P10 do [Quadro teórico](quadro-teorico.md) são possibilidades para estudos de desenho. |
| contexto | quem, onde, com qual domínio, dispositivo, rede e experiência? |
| mecanismo, quando pertinente | como se supõe que uma propriedade do desenho opere nesse contexto? |
| resultado | que fenômeno será observado e como foi definido? |
| comparação, quando pertinente | qual alternativa, referência, critério ou estado anterior? |
| rivais | que outras explicações poderiam produzir o mesmo resultado? |
| revisão da interpretação | que achado poderia contrariar a explicação inicial ou exigir outra leitura? |
| unidade de análise | pessoa, tarefa, unidade de estudo, sequência, curso ou componente? |
| versão | quais são as revisões do Git, do artefato executável, dos contratos, dos pacotes de componente, do conteúdo e do modelo de IA? |
| risco | que dano, exposição, custo ou consequência precisa ser controlado? |

### Exemplo de formulação responsável

Pergunta vaga:

> O funcionamento sem conexão melhora a aprendizagem?

Pergunta delimitada:

> Entre estudantes adultos que interrompem uma microssequência de redes por
> vinte e quatro horas, um cursor local com conteúdo sincronizado, comparado à
> reabertura no início da lição, altera o sucesso e os erros de retomada?

A segunda pergunta ainda não mede aprendizagem. Ela investiga retomada. Uma
tarefa posterior de compreensão ou retenção precisaria ser planejada
separadamente.

### Quando a avaliação compara condições

Use cursos privados independentes para condições distintas e registre fora do
produto o que deve permanecer comum. Essa separação sustenta a descrição
técnica da intervenção, mas não constitui experimento. Antes da investigação, o
protocolo particular precisa identificar:

- o planejamento comum e sua revisão;
- as revisões de cada curso na produção e na exposição;
- cada diferença pretendida como definição e valor interpretáveis;
- os invariantes e os desvios não declarados que afetam a comparação;
- a população e a regra de atribuição, quando houver;
- a política de consentimento;
- os instrumentos, desfechos, momentos e procedimentos de análise;
- as perdas, os dados ausentes e os critérios de correção ou invalidação.

Cada condição continua sendo um curso mutável. O protocolo precisa exportar o
artefato efetivamente apresentado, registrar desvios, efeitos adversos e
explicações rivais; o AraLearn não congela exposição nem atribui participantes.
Veja [Comparar condições de desenho](experimentos-instrucionais-parametrizados.md).

## Progressão de episódios de avaliação

O **FEDS** (*Framework for Evaluation in Design Science*) ajuda a planejar a
avaliação de artefatos. Uma avaliação **formativa** orienta mudanças durante o
desenvolvimento; uma **somativa** julga uma versão segundo critérios definidos.
O ambiente pode ser **artificial**, preparado para examinar certas condições,
ou **naturalístico**, próximo do uso cotidiano
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

A progressão abaixo é uma organização possível do projeto. Começar pela
inspeção técnica reduz o risco de levar falhas conhecidas a participantes. A
seleção de episódios acompanha a pergunta e o risco, sem exigir que todo estudo
percorra a tabela.

| Episódio | Finalidade e ambiente | Pergunta principal | Evidência mínima | Critério para avançar |
| --- | --- | --- | --- | --- |
| E0: argumento e inspeção | formativa, artificial | problema, mecanismo e risco são coerentes? | revisão conceitual, contrato e caso adverso | hipótese e requisitos explícitos |
| E1: verificação técnica | formativa, artificial | a versão implementa o comportamento? | testes, análise, medição e inspeção visual | falhas críticas resolvidas e artefato reproduzível |
| E2: avaliação de especialistas | formativa, artificial | conteúdo e representação são academicamente válidos? | rubrica, justificativas e divergências | erros conceituais e representacionais graves corrigidos |
| E3: jornada formativa | formativa, artificial ou situada | pessoas compreendem e operam o fluxo? | sucesso, erro, ajuda, verbalização e entrevista | jornada crítica executável e compreendida |
| E4: ciclo situado | formativa, naturalística | como o mecanismo opera no uso real? | dados de processo, produto, entrevista e casos negativos | explicação do mecanismo e do contexto revisada |
| E5: avaliação de resultado | somativa, naturalística ou comparativa | a versão atende ao resultado delimitado? | análise predefinida, incerteza e limites | conclusão condicionada à versão e contexto |
| E6: acompanhamento | somativa, naturalística | resultado, custo e governança se sustentam no tempo? | retenção, transferência, incidentes e custo | decisão longitudinal de manter, alterar ou remover |

Não se avança por calendário. Perda de dados, alteração de escopo pela IA,
inacessibilidade ou conteúdo oculto devolvem o artefato à verificação técnica,
mesmo que outras medidas sejam favoráveis.

## Participantes e amostragem

### Perfis relevantes

O público prioritário no desenho inclui adultos que conciliam estudo e trabalho,
com variação de experiência digital, área de conhecimento, dispositivo e
conectividade. Outros papéis, como especialistas, docentes, autores, revisores
e administradores, respondem a perguntas distintas.

Uma pessoa especialista não substitui uma novata quando a pergunta trata de
pressupostos ocultos; uma pessoa novata não substitui especialista na avaliação
de convenção acadêmica.

### Decisões de amostragem

- estudos formativos podem usar amostragem intencional para localizar
  mecanismos e falhas, sem alegar generalização estatística;
- estudos quantitativos comparativos exigem tamanho amostral coerente com
  efeito esperado, desenho, dependência e perdas;
- estudos qualitativos justificam suficiência pela pergunta, diversidade do
  corpus e qualidade analítica, não por número universal;
- variação relevante deve ser descrita: conhecimento prévio, domínio,
  dispositivo, acessibilidade, rede e contexto de uso;
- exclusões e desistências precisam ser registradas e interpretadas como dados
  potencialmente informativos, não apagadas.

## Cenários de avaliação

### Continuidade e estudo

1. localizar um percurso sem orientação verbal externa;
2. iniciar e continuar conteúdo previamente sincronizado sem conexão;
3. interromper em ponto definido e retomar depois do intervalo;
4. alternar entre exposição, prática, retorno e nova resposta;
5. revelar resposta somente por ação explícita;
6. resolver tarefa equivalente e problema de transferência em momentos
   separados.

### Progressão pedagógica

1. verificar se a primeira explicação situa uma pessoa leiga;
2. localizar termos, símbolos ou pré-requisitos introduzidos cedo demais;
3. relacionar cada prática à teoria que a torna respondível;
4. examinar exemplo resolvido, apoio e retirada;
5. identificar condensação, fragmentação, redundância e salto;
6. comparar explicação simples e profunda com resumo superficial.

### Representações e componentes

A amostra deve cobrir funções distintas do
[catálogo de componentes](componentes-didaticos.md), incluindo representações de
conteúdo e formatos de resposta, em vez de repetir apenas variações do mesmo tipo.

1. interpretar exposição simples e caso acadêmico complexo;
2. comparar representação especializada, componente geral e texto para a mesma
   operação;
3. preencher lacunas independentes e digitar dentro do objeto;
4. ordenar ou associar somente quando essa é a operação pretendida;
5. testar temas, larguras móveis, teclado, toque e tecnologia assistiva;
6. propor uma correção focal sem alterar a hierarquia da unidade;
7. articular componentes sem atenção dividida ou ambiguidade.

### Autoria assistida por IA

1. localizar componente por intenção antes de consultar contrato;
2. produzir uma parte, auditar e revisar a escolha;
3. carregar o contexto focal antes de registrar uma auditoria;
4. propor uma correção, rejeitar ou aplicar, verificar e reverter quando
   necessário;
5. introduzir deliberadamente esquema de dados válido com erro factual;
6. registrar a ausência de componente adequado e aplicar a política explícita
   de bloqueio ou aproximação;
7. testar uma solicitação de alteração fora do escopo;
8. registrar modelo, provedor, parâmetros, contexto e custo.

### Propriedade, acesso e autoria

1. compartilhar um curso para estudo, confirmar que o acesso não concede
   autoria e depois revogá-lo;
2. identificar autoria, origem e revisão de uma mudança;
3. registrar uma observação, reencontrar a resposta e compreender a correção
   vinculada;
4. distinguir conteúdo do curso, estado pessoal, fontes e dados da autoria;
5. anexar e reabrir um PDF na revisão correta da fonte, sob acesso autorizado;
6. explicar quais dados existem, para que servem e quem pode acessá-los.

## Resultados e instrumentos candidatos

| Resultado | Manifestação | Instrumento candidato | Momento | Não interpretar como |
| --- | --- | --- | --- | --- |
| usabilidade | sucesso, erro, ajuda e compreensão de estado | roteiro, observação e entrevista | durante e imediato | aprendizagem ou beleza |
| retomada | localização e reconstrução do objetivo | cenário interrompido e explicação | depois de intervalo | abertura ou atenção |
| carga extrínseca | busca, atenção dividida e demanda percebida | comparação e escala validada apropriada | durante e imediato | dificuldade inerente |
| compreensão | explicação, discriminação e aplicação | item aberto, rubrica e entrevista | imediato | confiança ou conclusão |
| retenção | desempenho posterior equivalente | tarefa adiada | intervalo justificado | repetição imediata |
| transferência | aplicação a problema estruturalmente novo | problema de generalização e rubrica | imediato ou adiado | troca de valores |
| competência para interpretar e usar feedback | interpretação, julgamento e ação | cenário e tarefa subsequente | durante e adiado | recebimento da mensagem |
| agência e controle | escolha justificada, rejeição e reversão | tarefa, entrevista e instrumento apropriado | durante e imediato | número de opções |
| qualidade pedagógica | cobertura, progressão e prática pertinente | rubrica e análise independente | por versão | fluência ou volume |
| qualidade representacional | fidelidade, legibilidade e adequação | especialista + tarefa com público | por representação e caso | captura de tela isolada |
| frugalidade | bytes, volume transferido, latência, falha e custo | instrumentação técnica agregada | por versão e longitudinalmente | comportamento pessoal |

Instrumentos padronizados só devem ser adotados depois de verificar construto,
licença, idioma, população e evidências psicométricas. Traduzir uma escala não
equivale a validá-la.

## Procedimento de um ciclo DBR

1. caracterizar o problema com participantes e atores da prática;
2. selecionar proposição e explicitar contexto, mecanismo e resultado;
3. descrever conteúdo, intervenção, mediação e condições;
4. identificar a versão e as mudanças desde o ciclo anterior;
5. coletar apenas processo e resultado autorizados;
6. incluir casos negativos, desistências e efeitos não previstos;
7. analisar mecanismo, contexto e explicações rivais;
8. revisar a intervenção **e** a explicação;
9. devolver síntese compreensível quando aplicável;
10. registrar princípio provisório e limite de transferência.

## Procedimento de um ciclo DSR

1. explicitar problema, relevância e lacuna do artefato;
2. formular objetivos verificáveis e critérios de aceitação;
3. documentar alternativas e justificar a decisão;
4. construir versão identificável;
5. demonstrar mecanismo em cenário nominal e adverso;
6. escolher estratégia de avaliação proporcional ao risco;
7. medir correção, utilidade, qualidade e custo separadamente;
8. comparar resultado com objetivo e alternativa;
9. registrar contribuição e limites;
10. decidir manter, alterar, remover ou iniciar novo episódio.

## Análise qualitativa

Na análise da revisão humana, pode interessar como a pessoa justifica a
aceitação de uma afirmação. Um trecho da entrevista pode ser marcado como
“conferência da fonte” e relacionado à ação observada. Marcar trechos com
categorias de significado é **codificar**. A escolha da categoria precisa ser
explicada e o trecho deve conservar seu contexto.

O plano identifica o material analisado, o modo de construir categorias, a
participação de quem pesquisa e o tratamento de divergências. Se a pessoa
disser que conferiu a fonte, mas a observação mostrar apenas a leitura do título,
a divergência é parte da análise. Relacionar entrevista, ação e material é uma
possibilidade de **triangulação**, discutida para estudos de caso por
[Baxter e Jack (2008)](referencias.md#ref-baxter2008casestudy).

A suficiência do material depende da pergunta e da estratégia. Alegar
**saturação**, isto é, que novas coletas deixaram de acrescentar elementos
relevantes segundo o critério adotado, requer mostrar como essa decisão foi
alcançada. Outros métodos podem justificar o encerramento de outra forma.

## Análise quantitativa

Uma comparação numérica começa pela definição do resultado. Para investigar
identificação de erros, por exemplo, a pesquisa pode calcular a proporção de
propostas incorretas reconhecidas por cada participante. É preciso conservar
também rejeições indevidas de propostas corretas, oportunidades não avaliadas e
as condições em que a tarefa foi feita.

O plano define a escala, a comparação, o tratamento de dados ausentes e a
relação entre observações. Dez decisões da mesma pessoa compartilham
experiência e contexto; analisá-las como dez participantes independentes pode
produzir certeza excessiva. O **tamanho de efeito** expressa a magnitude da
diferença ou associação; sua **incerteza** informa a precisão da estimativa.
O relatório distingue análises previstas daquelas formuladas depois de observar
os dados e considera o risco de encontrar diferenças ao realizar muitas
comparações ([Shadish et al. (2002)](referencias.md#ref-shadish2002experimental)).

## Ética, privacidade e segurança

- coletar somente o necessário à pergunta;
- separar dados de pesquisa dos dados operacionais quando apropriado;
- informar serviços externos, modelos de IA e conteúdo transmitido;
- nunca registrar credenciais nem solicitar sua revelação;
- evitar telemetria contínua por conveniência;
- pseudonimizar ou anonimizar conforme desenho e risco;
- definir acesso, retenção, exclusão, descarte e resposta a incidente;
- garantir retirada a qualquer momento, sem prejuízo, e explicitar no protocolo
  o tratamento dos dados já coletados;
- interromper tarefa diante de ansiedade relevante, perda de trabalho,
  exposição de dados ou consequência não prevista;
- oferecer canal de esclarecimento e informação compreensível.

Os direitos de participantes no escopo brasileiro são normatizados pela
Resolução CNS nº 510/2016
([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)).
Princípios de transparência, controle e responsabilidade na análise de dados
educacionais e na IA complementam essa obrigação no desenho do estudo
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics);
[UNESCO (2023)](referencias.md#ref-unesco2023genai);
[Autio et al. (2024)](referencias.md#ref-nist2024genai)).

## Versionamento e reprodutibilidade

Cada episódio registra:

- revisão do Git, versão web ou APK, esquemas de dados, catálogo e pacotes de componente;
- revisão do curso e do conteúdo usado;
- revisões das fontes, âncoras e atribuições usadas pelo conteúdo;
- módulos de instrução, conhecimento recuperado, modelo, provedor e parâmetros;
- dispositivo, largura de tela, sistema, rede e cópia local relevante;
- roteiro, instrumentos e materiais;
- plano de análise e desvios;
- dados autorizados, dicionário e transformações;
- achados, incertezas, casos negativos e decisão;
- custo técnico e armazenamento introduzido.

Um resultado pertence à versão avaliada. Mudança substancial de modelo,
instrução enviada ao modelo, pacote de componente, fluxo ou conteúdo exige
análise de comparabilidade ou novo episódio.

## Ameaças à validade

A validade concerne à sustentação da interpretação e de seu uso. Uma melhora
na segunda tarefa, por exemplo, pode decorrer da familiaridade adquirida na
primeira, mesmo que a interface tenha mudado entre ambas. O protocolo examina
essas explicações alternativas e conserva o que limita a conclusão.

| Relação a examinar | Exemplo e implicação para o estudo |
| --- | --- |
| participantes, tarefa e contexto | uma amostra experiente, rede estável ou sessão contínua pode representar mal o uso previsto; o estudo descreve essas condições e limita a transferência da conclusão |
| comparação e tempo | novidade, repetição da tarefa ou mudança de modelo de IA podem acompanhar a condição comparada; ordem, versões e experiência prévia precisam ser registradas |
| dados e análise | várias respostas da mesma pessoa compartilham sua experiência; tratá-las como observações independentes pode subestimar a incerteza |
| participação de quem pesquisa | a presença do pesquisador e sua autoria do material podem influenciar conduta e julgamento; o procedimento explicita esses papéis e examina interpretações divergentes |
| seleção e comunicação dos resultados | procurar apenas confirmações e publicar só sucessos oculta falhas; critérios anteriores à análise, casos contrários e desvios preservados permitem avaliar a conclusão |

Uma avaliação formativa modifica o artefato para aperfeiçoá-lo; uma somativa
julga uma versão segundo critérios definidos. Se o conteúdo muda durante o
estudo, é preciso identificar quem encontrou cada versão e como a mudança
participa da análise. O [glossário metodológico](glossario-construtos.md#distinções-metodológicas)
explica essas finalidades; o [guia de investigação](guia-pesquisador.md#da-pergunta-ao-método)
relaciona a escolha do método à pergunta.

## Modelo de relatório

```text
Identificador e versão:
Estratégia de investigação e justificativa:
Finalidade e ambiente:
Problema e pergunta; proposição quando pertinente:
Contexto e participantes:
Relações investigadas; mecanismo ou comparação quando pertinentes:
Medidas e instrumentos:
Procedimento e desvios:
Resultados, incerteza e dados ausentes:
Casos negativos e efeitos adversos:
Explicações rivais:
Limites de transferência:
Decisão: manter | alterar | remover | investigar
Nova pergunta:
```

## Referências metodológicas

As fontes metodológicas incluem estudo de caso ([Baxter e Jack (2008)](referencias.md#ref-baxter2008casestudy)), DBR ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)), DSR
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)), posicionamento da contribuição
([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)) e estratégias de avaliação
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

<a id="evidência-exportada-por-analytics"></a>

## Evidência exportada por Dados de autoria

Ao usar a [exportação de curso e análise](analytics-instrucionais.md#exportar),
registre o contrato, o curso, sua revisão, o escopo escolhido e a data. Preserve
as distribuições que sustentaram a comparação, suas definições, denominadores
e ausências. O arquivo inclui conteúdo salvo e metadados disponíveis de fontes,
configuração aplicada e revisão; os PDFs e áudios precisam ser conservados
separadamente quando integrarem a condição apresentada.

As contagens descrevem o desenho e as intervenções observáveis no estado
corrente. Não reconstituem uma história completa de autoria nem a exposição dos
participantes. Testes inferenciais e alegações causais dependem do plano do
estudo, de seus instrumentos e de suas premissas.

<!-- referências locais: início -->

## Referências

- [Autio et al. (2024)](referencias.md#ref-nist2024genai): Chloe Autio; Reva Schwartz; Jesse Dunietz; Shomik Jain; Martin Stanley; Elham Tabassi; Patrick Hall; Kamie Roberts (2024). **Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile.** National Institute of Standards and Technology, NIST AI 600-1.
- [Baxter e Jack (2008)](referencias.md#ref-baxter2008casestudy): Pamela Baxter; Susan Jack (2008). **Qualitative Case Study Methodology: Study Design and Implementation for Novice Researchers.** *The Qualitative Report*, 13(4), p. 544–559.
- [Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510): Conselho Nacional de Saúde (2016). **Resolução nº 510, de 7 de abril de 2016.** Conselho Nacional de Saúde.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Shadish et al. (2002)](referencias.md#ref-shadish2002experimental): William R. Shadish; Thomas D. Cook; Donald T. Campbell (2002). **Experimental and Quasi-Experimental Designs for Generalized Causal Inference.** 2. ed., Houghton Mifflin.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.
- [Venable et al. (2016)](referencias.md#ref-venable2016feds): John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.

<!-- referências locais: fim -->
