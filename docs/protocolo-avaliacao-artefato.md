# Protocolo de avaliação do AraLearn

## Finalidade e estatuto

Este protocolo ensina como planejar avaliações do AraLearn como artefato
sociotécnico e intervenção educacional. Ele oferece uma estrutura comum para
formular perguntas, escolher métodos, registrar versões, analisar resultados e
decidir se um mecanismo deve ser mantido, alterado ou removido.

O documento não substitui:

- projeto particular de pesquisa;
- avaliação ética e autorização institucional;
- consentimento livre e esclarecido;
- plano de amostragem e análise;
- registro prévio quando apropriado;
- instrumentos com evidência de validade;
- procedimentos de proteção, retenção e descarte de dados.

O protocolo evita quatro atalhos:

1. teste de software não demonstra aprendizagem;
2. satisfação não demonstra compreensão, retenção ou transferência;
3. repetição de ciclos de desenvolvimento não constitui, sozinha, DBR ou DSR;
4. um resultado positivo numa versão e contexto não sustenta eficácia universal.

## O que precisa ser avaliado

O AraLearn reúne resultados que não podem ser tratados como uma única variável:

- correção e segurança do software;
- resiliência offline e sincronização;
- usabilidade e acessibilidade;
- retomada após interrupção;
- qualidade factual, pedagógica e representacional;
- compreensão imediata;
- retenção posterior;
- transferência para tarefa nova;
- agência e controle humano;
- coordenação e colaboração;
- frugalidade de armazenamento, rede e manutenção.

A pergunta “o AraLearn funciona?” é insuficiente porque não define para quem,
em qual tarefa, sob qual comparação e segundo qual resultado.

Para delimitar unidades técnicas, **kernel** é o núcleo comum do aplicativo;
**package** é um módulo de recurso com contrato e mecanismo de renderização próprios;
**workspace** é um espaço de trabalho com membros e permissões locais; e
**inteligência artificial (IA)** designa os modelos e serviços que apoiam a
autoria. **Local-first** designa uma arquitetura em que a operação corrente
depende da cópia local e a sincronização remota ocorre sem bloquear a
interação.

## Duas tradições metodológicas complementares

### Trilha educacional: Design-Based Research

Design-Based Research (DBR) investiga intervenções educacionais em contextos
autênticos por ciclos que relacionam análise, desenho, implementação e revisão
([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)). Seu objetivo não é apenas corrigir
uma interface, mas compreender como um mecanismo opera, para quem, em quais
condições e com quais efeitos previstos ou adversos.

```text
problema educacional situado
  → conjectura sobre mecanismo
  → intervenção versionada
  → uso em contexto
  → dados de processo e resultado
  → revisão da intervenção e da explicação
```

Unidades possíveis: pessoa, card, microssequência, percurso, atividade de
autoria e workspace. Produtos esperados: descrição do contexto, conjectura
C–M–O, evidências, casos negativos, princípio provisório e limite de
transferência.

### Trilha do artefato: Design Science Research

Design Science Research (DSR) investiga construção, demonstração, avaliação e
contribuição de artefatos ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). A
contribuição precisa ser posicionada em relação ao conhecimento existente e à
maturidade do problema e da solução ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)).

```text
problema e relevância
  → objetivos verificáveis
  → desenho e construção
  → demonstração em casos nominais e adversos
  → avaliação
  → conhecimento de design e limites
```

Unidades possíveis: kernel, package, catálogo, contrato, fluxo, operação,
persistência e sincronização. Produtos esperados: versão reproduzível,
requisito, evidência técnica, avaliação de utilidade e contribuição de design.

### Por que não escolher apenas uma

- **Problema:** o mesmo mecanismo pode ser tecnicamente correto e
  pedagogicamente inadequado.
- **Alternativas:** tratar toda avaliação como teste de software, tratar toda
  iteração como pesquisa educacional ou usar trilhas com perguntas diferentes.
- **Decisão:** articular DBR e DSR sem fundi-las.
- **Fundamentação:** DBR examina intervenção situada; DSR examina artefato e
  conhecimento de design ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience)).
- **Operacionalização:** cada dado registra a trilha, a pergunta e a função que
  desempenha.
- **Consequência:** uma falha de uso pode gerar requisito técnico, e uma falha
  técnica pode explicar por que a intervenção não operou.
- **Limite:** compartilhar cenário ou versão não torna as evidências
  intercambiáveis.

## Formulação de uma avaliação

Antes da coleta, preencher:

| Campo | Pergunta operacional |
| --- | --- |
| problema | que situação concreta exige investigação? |
| proposição | qual P1–P10 do [Quadro teórico](quadro-teorico.md) está em foco? |
| contexto | quem, onde, com qual domínio, dispositivo, rede e experiência? |
| mecanismo | que propriedade do desenho se espera que opere? |
| resultado | que fenômeno será observado e como foi definido? |
| comparação | qual alternativa, baseline, critério ou estado anterior? |
| rivais | que outras explicações poderiam produzir o mesmo resultado? |
| enfraquecimento | que achado exigiria rever ou abandonar a hipótese? |
| unidade de análise | pessoa, tarefa, card, sequência, curso, workspace ou componente? |
| versão | quais commit, build, contratos, packages, conteúdo e modelo de IA? |
| risco | que dano, exposição, custo ou consequência precisa ser controlado? |

### Exemplo de formulação responsável

Pergunta vaga:

> O modo offline melhora a aprendizagem?

Pergunta delimitada:

> Entre estudantes adultos que interrompem uma microssequência de redes por
> vinte e quatro horas, um cursor local com conteúdo sincronizado, comparado à
> reabertura no início da lição, altera o sucesso e os erros de retomada?

A segunda pergunta ainda não mede aprendizagem. Ela investiga retomada. Uma
tarefa posterior de compreensão ou retenção precisaria ser planejada
separadamente.

## Progressão de episódios de avaliação

O FEDS distingue finalidade formativa ou somativa e ambiente artificial ou
naturalístico ([Venable et al. (2016)](referencias.md#ref-venable2016feds)). O AraLearn usa uma progressão de risco; nem
todo estudo precisa percorrer todos os episódios.

| Episódio | Trilha | Finalidade e ambiente | Pergunta principal | Evidência mínima | Critério para avançar |
| --- | --- | --- | --- | --- | --- |
| E0 — argumento e inspeção | DSR | formativa, artificial | problema, mecanismo e risco são coerentes? | revisão conceitual, contrato e caso adverso | hipótese e requisitos explícitos |
| E1 — verificação técnica | DSR | formativa, artificial | a versão implementa o comportamento? | testes, análise, medição e inspeção visual | falhas críticas resolvidas e build reproduzível |
| E2 — avaliação de especialistas | DSR/DBR | formativa, artificial | conteúdo e representação são academicamente válidos? | rubrica, justificativas e divergências | erros conceituais e representacionais graves corrigidos |
| E3 — jornada formativa | DSR | formativa, artificial ou situada | pessoas compreendem e operam o fluxo? | sucesso, erro, ajuda, verbalização e entrevista | jornada crítica executável e compreendida |
| E4 — ciclo situado | DBR | formativa, naturalística | como o mecanismo opera no uso real? | dados de processo, produto, entrevista e casos negativos | conjectura C–M–O revisada |
| E5 — avaliação de resultado | DBR/DSR | somativa, naturalística ou comparativa | a versão atende ao resultado delimitado? | análise predefinida, incerteza e limites | conclusão condicionada à versão e contexto |
| E6 — acompanhamento | DBR/DSR | somativa, naturalística | resultado, custo e governança se sustentam no tempo? | retenção, transferência, incidentes e custo | decisão longitudinal de manter, alterar ou remover |

Não se avança por calendário. Perda de dados, alteração de escopo pela IA,
inacessibilidade ou conteúdo oculto devolvem o artefato à verificação técnica,
mesmo que outras medidas sejam favoráveis.

## Participantes e amostragem

### Perfis relevantes

O público de design prioritário inclui adultos que conciliam estudo e trabalho,
com variação de experiência digital, área de conhecimento, dispositivo e
conectividade. Outros papéis — especialistas, docentes, autores, revisores e
administradores — respondem a perguntas distintas.

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

1. localizar um percurso sem instrução de bastidor;
2. iniciar e continuar conteúdo previamente sincronizado sem conexão;
3. interromper em ponto definido e retomar depois do intervalo;
4. alternar entre exposição, prática, feedback e nova tentativa;
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

### Representações e recursos

1. interpretar exposição simples e caso acadêmico complexo;
2. comparar representação especializada, recurso geral e texto para a mesma
   operação;
3. preencher lacunas independentes e digitar dentro do objeto;
4. ordenar ou associar somente quando essa é a operação pretendida;
5. testar temas, larguras móveis, teclado, toque e tecnologia assistiva;
6. editar apenas rótulos textuais e selecionar alvos para assistência;
7. combinar recursos sem atenção dividida ou ambiguidade.

### Autoria assistida por IA

1. localizar recurso por intenção antes de consultar contrato;
2. produzir uma parte, auditar e revisar a escolha;
3. editar texto sem expor estrutura interna;
4. solicitar mudança, rejeitar, iterar, desfazer e restaurar;
5. introduzir deliberadamente esquema de dados válido com erro factual;
6. testar ausência de recurso ideal sem bloquear a autoria;
7. testar tentativa de alteração fora do escopo;
8. registrar modelo, provedor, parâmetros, contexto e custo.

### Governança e colaboração

1. criar workspace, convidar, alterar papel e revogar;
2. identificar autoria e responsabilidade de uma mudança;
3. registrar observação, reencontrar resposta e compreender reparo;
4. distinguir percurso pessoal, composição compartilhada e coleção de referência;
5. explicar que dados existem, para que servem e quem pode acessá-los.

## Resultados e instrumentos candidatos

| Resultado | Manifestação | Instrumento candidato | Momento | Não interpretar como |
| --- | --- | --- | --- | --- |
| usabilidade | sucesso, erro, ajuda e compreensão de estado | roteiro, observação e entrevista | durante e imediato | aprendizagem ou beleza |
| retomada | localização e reconstrução do objetivo | cenário interrompido e explicação | depois de intervalo | abertura ou atenção |
| carga extrínseca | busca, atenção dividida e demanda percebida | comparação e escala validada apropriada | durante e imediato | dificuldade inerente |
| compreensão | explicação, discriminação e aplicação | item aberto, rubrica e entrevista | imediato | confiança ou conclusão |
| retenção | desempenho posterior equivalente | tarefa adiada | intervalo justificado | repetição imediata |
| transferência | aplicação a problema estruturalmente novo | problema de generalização e rubrica | imediato ou adiado | troca de valores |
| feedback literacy | interpretação, julgamento e ação | cenário e tarefa subsequente | durante e adiado | recebimento da mensagem |
| agência e controle | escolha justificada, rejeição e reversão | tarefa, entrevista e instrumento apropriado | durante e imediato | número de opções |
| qualidade pedagógica | cobertura, progressão e prática pertinente | rubrica e análise independente | por versão | fluência ou volume |
| qualidade representacional | fidelidade, legibilidade e adequação | especialista + tarefa com público | por recurso e caso | screenshot isolado |
| frugalidade | bytes, payload, latência, falha e custo | instrumentação técnica agregada | build e longitudinal | comportamento pessoal |

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

O plano deve declarar:

- unidade de codificação e unidade de análise;
- modo de construção do código ou categorias;
- posição e envolvimento de quem pesquisa;
- procedimento de revisão e tratamento de divergências;
- forma de selecionar exemplos e casos negativos;
- relação entre falas, ações, artefatos e contexto.

Triangulação combina manifestações para responder à mesma pergunta; não serve
para fabricar concordância. Saturação só deve ser alegada quando definida e
sustentada pelo desenho.

## Análise quantitativa

O plano deve declarar:

- variável, escala e hipótese;
- unidade de análise e dependência entre observações;
- comparação e distribuição esperada;
- dados ausentes, exclusões e desistências;
- multiplicidade e análises exploratórias;
- tamanho de efeito e incerteza;
- desvios do plano.

Cards da mesma pessoa não se tornam observações independentes por estarem em
linhas diferentes. A estrutura dos dados precisa ser modelada.

## Ética, privacidade e segurança

- coletar somente o necessário à pergunta;
- separar dados de pesquisa dos dados operacionais quando apropriado;
- informar serviços externos, modelos de IA e conteúdo transmitido;
- nunca registrar credenciais nem solicitar sua revelação;
- evitar telemetria contínua por conveniência;
- pseudonimizar ou anonimizar conforme desenho e risco;
- definir acesso, retenção, exclusão, descarte e resposta a incidente;
- permitir retirada conforme o protocolo aprovado;
- interromper tarefa diante de ansiedade relevante, perda de trabalho,
  exposição de dados ou consequência não prevista;
- oferecer canal de esclarecimento e informação compreensível.

Os princípios de transparência, controle e responsabilidade em analytics e IA
fornecem base para essas decisões ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)).

## Versionamento e reprodutibilidade

Cada episódio registra:

- commit, build, versão web ou APK, esquemas de dados, catálogo e packages;
- revisão do curso e do conteúdo usado;
- módulos de instrução, conhecimento recuperado, modelo, provedor e parâmetros;
- dispositivo, viewport, sistema, rede e cache relevante;
- roteiro, instrumentos e materiais;
- plano de análise e desvios;
- dados autorizados, dicionário e transformações;
- achados, incertezas, casos negativos e decisão;
- custo técnico e armazenamento introduzido.

Um resultado pertence à versão avaliada. Mudança substancial de modelo, prompt,
package, fluxo ou conteúdo exige análise de comparabilidade ou novo episódio.

## Ameaças à validade

- efeito de novidade;
- presença de quem pesquisa;
- amostra mais experiente que o público pretendido;
- domínio, curso ou notação específicos;
- sessão artificialmente contínua;
- rede melhor que a cotidiana;
- conteúdo produzido ou revisado por quem avalia;
- efeito de prática pela repetição da tarefa;
- mudança de modelo de IA entre condições;
- mistura entre avaliação formativa e somativa;
- tratamento de cards como observações independentes;
- viés de confirmação após investimento no artefato;
- publicação seletiva de sucessos.

## Modelo de relatório

```text
Identificador e versão:
Trilha: DBR | DSR | ambas, com funções separadas
Finalidade e ambiente:
Problema, pergunta e proposição:
Contexto e participantes:
Mecanismo, alternativa e comparação:
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

As referências completas estão em [`referencias.bib`](referencias.bib). As
fontes centrais são DBR ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)), DSR
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)), posicionamento da contribuição
([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)) e estratégias de avaliação
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).
