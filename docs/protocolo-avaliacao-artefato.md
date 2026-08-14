# Protocolo de avaliação do artefato

## Finalidade e estatuto

Este protocolo orienta ciclos de investigação do AraLearn como artefato
sociotécnico e intervenção educacional. Deve ser particularizado e submetido às
exigências éticas e institucionais antes de envolver participantes. Não
substitui projeto de pesquisa, consentimento, parecer ético, plano de análise,
registro prévio nem cálculo amostral.

O protocolo evita três atalhos:

- teste de software não demonstra aprendizagem;
- satisfação não demonstra compreensão, retenção ou transferência;
- iteração de produto não é DBR ou DSR sem pergunta, método, evidência e
  contribuição explícitos.

## Arquitetura metodológica

### Trilha A — Design-Based Research (DBR)

DBR investiga a intervenção educacional em contexto autêntico e produz
explicações situadas e princípios de design. Baseia-se em Design-Based Research
Collective (2003) e Wang e Hannafin (2005).

```text
análise do problema com atores
→ desenho da intervenção e conjecturas
→ implementação em contexto autêntico
→ coleta e análise de processo e resultado
→ revisão da intervenção e da explicação
```

Unidades típicas: card, microssequência, percurso, atividade de autoria,
estudante e workspace. Produtos: descrição do contexto, conjectura C–M–O,
evidências, casos negativos, princípio revisado e limite de transferência.

### Trilha B — Design Science Research (DSR)

DSR investiga construção, demonstração, avaliação e contribuição do artefato.
Baseia-se em Hevner et al. (2004), Peffers et al. (2007), Gregor e Hevner
(2013) e Venable et al. (2016).

```text
problema e relevância
→ objetivos verificáveis
→ desenho e construção
→ demonstração
→ avaliação
→ comunicação da contribuição
```

Unidades típicas: kernel, package, contrato, catálogo, operação, persistência e
fluxo. Produtos: artefato versionado, requisito, demonstração, evidência de
conformidade, avaliação de utilidade e conhecimento de design.

### Relação entre as trilhas

DBR e DSR podem compartilhar uma versão do artefato e um episódio de campo,
mas respondem a perguntas diferentes. O relatório deve identificar, para cada
dado, qual trilha o usa e por quê. Um achado de DBR pode exigir mudança no
artefato; uma avaliação de DSR pode revelar que o mecanismo não sustenta a
intervenção. As tradições permanecem complementares, não sinônimas.

## Perguntas e proposições

Cada estudo seleciona uma ou mais proposições P1–P10 do [Quadro
teórico](quadro-teorico.md) e preenche antes da coleta:

| Campo | Registro obrigatório |
| --- | --- |
| pergunta | uma relação específica, não “o AraLearn funciona?” |
| contexto | população, domínio, dispositivo, rede, ambiente e experiência |
| mecanismo | propriedade do desenho que se espera operar |
| resultado | variável ou tema claramente definido |
| comparação | alternativa, baseline, caso anterior ou critério |
| explicações rivais | pelo menos duas alternativas plausíveis |
| evidência de enfraquecimento | resultado que exige revisar ou abandonar a hipótese |
| unidade de análise | pessoa, tarefa, card, sequência, curso, workspace ou componente |
| versão | commit, build, contratos, packages, conteúdo e modelo de IA |

## Programa de episódios

O Framework for Evaluation in Design Science distingue finalidade formativa ou
somativa e ambiente artificial ou naturalístico (Venable et al., 2016). O
AraLearn adota progressão de risco, sem exigir que todo estudo passe por todos
os episódios.

| Episódio | Trilha principal | Finalidade/ambiente | Pergunta | Evidência mínima | Porta de saída |
| --- | --- | --- | --- | --- | --- |
| E0 — argumento e inspeção | DSR | formativa/artificial | o mecanismo é coerente com teoria, contrato e risco? | revisão por critérios, schema e caso adverso | requisito e hipótese explícitos |
| E1 — verificação técnica | DSR | formativa/artificial | a versão implementa o comportamento? | testes, medição, análise estática e screenshots | falhas críticas resolvidas; artefato reproduzível |
| E2 — avaliação especialista | DSR/DBR | formativa/artificial | representação e conteúdo são academicamente válidos? | rubrica, justificativas e discordâncias | erros conceituais/visuais graves corrigidos |
| E3 — teste formativo de jornada | DSR | formativa/artificial ou naturalística | pessoas compreendem e operam o fluxo? | sucesso, erro, ajuda, verbalização e entrevista | jornada crítica executável e entendida |
| E4 — ciclo situado | DBR | formativa/naturalística | como o mecanismo opera no estudo real? | processo, produto, entrevista e casos negativos | conjectura C–M–O revisada |
| E5 — avaliação de resultado | DBR/DSR | somativa/naturalística ou comparativa | a versão atende resultado e finalidade delimitados? | análise predefinida, incerteza e limites | conclusão condicionada; contribuição comunicável |
| E6 — acompanhamento | DBR/DSR | somativa/naturalística | efeito, custo e uso se sustentam no tempo? | retenção, transferência, incidentes, custo e governança | decisão de manter, alterar, remover ou investigar |

Não se avança por calendário. Uma falha crítica de acessibilidade, perda de
dados, overflow que oculta conteúdo ou alteração de escopo pela IA devolve o
artefato a E1, ainda que outros testes tenham passado.

## Participantes e amostragem

O público prioritário é composto por estudantes adultos que conciliam estudo e
trabalho, com variação de experiência digital, área, dispositivo e
conectividade. Essa prioridade não dispensa critérios de inclusão e descrição
da amostra. Especialistas de conteúdo, professores, autores, revisores e
administradores participam de jornadas distintas.

- estudos formativos podem usar amostragem intencional pequena para localizar
  mecanismos e falhas, sem alegar saturação automaticamente;
- estudos comparativos quantitativos exigem estimativa de tamanho amostral
  coerente com efeito, desenho, dependência e perdas esperadas;
- estudos qualitativos justificam suficiência pela pergunta, diversidade do
  corpus e qualidade analítica, não por número universal;
- participantes avançados não substituem novatos quando a hipótese trata de
  premissas ocultas ou leitura inicial de representação.

## Cenários de avaliação

### Continuidade e estudo

1. localizar e iniciar curso sem instrução procedural;
2. perder conexão e continuar conteúdo já sincronizado;
3. interromper, alternar processo/dispositivo quando previsto e retomar;
4. percorrer teoria progressiva e práticas variadas;
5. revelar resposta, limpar e tentar novamente sem penalização;
6. resolver tarefa equivalente adiada e problema de transferência.

### Representações e resources

1. interpretar exposição simples e caso acadêmico complexo;
2. comparar resource especializado, package geral e texto para mesma operação;
3. preencher gaps independentes, digitar e ordenar dentro do objeto;
4. operar em 360, 390 e 412 px, claro/escuro, teclado e tecnologia assistiva;
5. editar somente rótulos textuais e selecionar alvos para assistência;
6. combinar dois resources sem sobrecarga ou ambiguidade.

### Autoria e IA

1. escolher intenção no catálogo antes de consultar contrato;
2. construir parte, auditar e revisar seleção de resource;
3. editar texto manualmente sem expor estrutura;
4. pedir correção em chat, rejeitar, iterar, desfazer, refazer e restaurar;
5. testar schema válido com erro factual/pedagógico intencional;
6. testar lacuna de cobertura do catálogo sem bloquear produção;
7. trocar modelo/provedor e registrar versão, custo e diferenças.

### Governança e colaboração

1. criar workspace, convidar, alterar papel e revogar;
2. identificar proveniência e responsabilidade por mudança;
3. registrar observação, reencontrar resposta e vínculo com reparo;
4. distinguir Trilhas, workspace e Coleções sem estados burocráticos ocultos;
5. explicar quais dados existem, por que existem e quem pode acessá-los.

## Matriz de resultados e instrumentos

| Resultado | Manifestação e fonte | Instrumento candidato | Momento | Evitar |
| --- | --- | --- | --- | --- |
| usabilidade | sucesso, erro, ajuda e compreensão de estado | roteiro de tarefas, observação e entrevista | durante/imediato | rapidez isolada como qualidade |
| retomada | localização e reconstrução do objetivo | cenário interrompido e explicação | após intervalo definido | abertura ou tempo como atenção |
| carga extrínseca | busca, atenção dividida e demanda percebida | comparação controlada e escala validada apropriada | durante/imediato | confundir dificuldade do conteúdo |
| compreensão | explicação, discriminação e aplicação | itens abertos, rubrica e entrevista | imediato | confiança ou conclusão |
| retenção | desempenho posterior equivalente | tarefa adiada | intervalo justificado | repetição imediata idêntica |
| transferência | aplicação a problema estruturalmente novo | problema de generalização e rubrica | imediato/adiado | mera troca de valores |
| feedback literacy | interpretação, julgamento e ação | cenário de feedback e tarefa subsequente | durante/adiado | recebimento da mensagem |
| agência/controle | escolha justificada, rejeição e reversão | tarefa, entrevista e instrumento validado | durante/imediato | quantidade de opções |
| qualidade pedagógica | cobertura, progressão e prática pertinente | rubrica independente e análise de conteúdo | por versão | fluência ou volume |
| qualidade representacional | fidelidade, legibilidade e adequação | especialista do domínio + tarefa com novato | por resource/caso | screenshot como prova suficiente |
| frugalidade | bytes, payload, latência, falha e custo | instrumentação técnica agregada | build/longitudinal | coletar comportamento pessoal |

Instrumentos padronizados só devem ser adotados após verificar construto,
licença, idioma, população e qualidade psicométrica. Tradução livre de escala
não é validação.

## Procedimento de um ciclo DBR

1. caracterizar problema com estudantes e atores da prática;
2. selecionar proposição e explicitar conjectura C–M–O;
3. descrever intervenção, conteúdo, mediação e contexto;
4. registrar quais mudanças ocorreram desde o ciclo anterior;
5. coletar processo e resultado autorizados, incluindo casos negativos;
6. analisar mecanismo, contexto, rival e consequência não prevista;
7. revisar intervenção **e** explicação teórica;
8. devolver síntese compreensível aos participantes quando aplicável;
9. registrar princípio provisório e limite de transferência.

## Procedimento de um ciclo DSR

1. explicitar problema, relevância e lacuna do artefato;
2. formular objetivos verificáveis e critérios de aceitação;
3. desenhar e construir a versão;
4. demonstrar o mecanismo em cenário nominal e adverso;
5. escolher estratégia de avaliação FEDS adequada ao risco;
6. medir correção, utilidade, qualidade e custo sem colapsá-los;
7. comparar resultado com objetivo e alternativa;
8. registrar contribuição de artefato e conhecimento de design;
9. decidir manter, alterar, remover ou iniciar novo episódio.

## Análise qualitativa

O plano deve declarar unidade de codificação, construção do código, posição do
pesquisador, revisão de interpretação e tratamento de divergências. Relatar
exemplos, variação e casos negativos. Triangulação combina manifestações para
responder à mesma pergunta; não serve para fabricar concordância. Saturação só
deve ser alegada com definição e evidência compatíveis.

## Análise quantitativa

O plano deve declarar variável, escala, hipótese, comparação, distribuição,
dependência entre observações, dados ausentes, exclusões, multiplicidade,
incerteza e tamanho de efeito. Resultados exploratórios são identificados como
tais. A unidade de análise não pode mudar de card para pessoa sem modelar a
dependência.

## Ética, privacidade e segurança

- coletar apenas o necessário à pergunta declarada;
- separar dados de pesquisa do banco operacional;
- informar serviços externos, modelos de IA e conteúdo transmitido;
- não registrar credenciais nem pedir que participante as revele;
- não usar telemetria contínua por conveniência;
- pseudonimizar ou anonimizar conforme o desenho e o risco;
- definir acesso, retenção, exclusão, descarte e resposta a incidente;
- permitir retirada conforme protocolo aprovado;
- interromper tarefa diante de ansiedade relevante, perda de trabalho,
  exposição de dados ou consequência externa não prevista;
- preparar contas e ambientes próprios para publicação, exclusão e mudança de
  papel.

## Versionamento e reprodutibilidade

Cada episódio registra:

- commit, build, APK/web, schemas, catálogo e versões de packages;
- conteúdo e revisão do curso utilizado;
- prompt, módulos de conhecimento, modelo, provedor e parâmetros de IA;
- dispositivo, viewport, sistema, rede e cache relevante;
- roteiro, instrumentos e materiais;
- plano de análise e desvios;
- dados autorizados, dicionário e transformação;
- achados, casos negativos, limitações e decisão;
- custo técnico e armazenamento introduzido.

Um resultado pertence à versão avaliada. Mudança substancial de prompt,
modelo, package, fluxo ou conteúdo exige análise de comparabilidade ou novo
episódio.

## Ameaças à validade

- novidade e presença do pesquisador;
- amostra mais experiente que o público;
- curso, domínio ou notação específicos;
- sessão artificialmente contínua;
- conectividade melhor que a cotidiana;
- conteúdo produzido ou revisado pelo pesquisador;
- efeito de prática ao repetir tarefas;
- mudança de modelo de IA entre condições;
- contaminação entre avaliação formativa e somativa;
- tratamento de cards como observações independentes;
- viés de confirmação após investimento no artefato;
- publicação seletiva de sucessos e ocultação de recursos removidos.

## Template de relatório de episódio

```text
ID e versão:
Trilha: DBR | DSR | ambas, com papéis separados
Finalidade/ambiente FEDS:
Pergunta e proposição:
Contexto e participantes:
Mecanismo e comparação:
Medidas/instrumentos:
Procedimento e desvios:
Resultados e incerteza:
Casos negativos/efeitos adversos:
Explicações rivais:
Limites de transferência:
Decisão: manter | alterar | remover | investigar
Nova pergunta:
```

## Referências metodológicas centrais

- Design-Based Research Collective (2003),
  <https://doi.org/10.3102/0013189X032001005>.
- Wang e Hannafin (2005), <https://doi.org/10.1007/BF02504682>.
- Hevner et al. (2004), <https://doi.org/10.2307/25148625>.
- Peffers et al. (2007),
  <https://doi.org/10.2753/MIS0742-1222240302>.
- Gregor e Hevner (2013),
  <https://doi.org/10.25300/MISQ/2013/37.2.01>.
- Venable et al. (2016), <https://doi.org/10.1057/ejis.2014.36>.
