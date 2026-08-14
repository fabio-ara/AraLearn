# Quadro teórico e proposições de design

## Para que serve um quadro teórico

Um quadro teórico organiza conceitos e relações que orientam uma investigação.
Ele não é uma lista de funcionalidades nem uma coleção de citações. Sua função
é explicar **por que** determinada propriedade do desenho poderia produzir uma
manifestação observável, em quais condições essa explicação seria plausível e
que resultado a enfraqueceria.

No AraLearn, a unidade de raciocínio é uma relação entre:

```text
contexto (C)
  → mecanismo proposto (M)
  → manifestação ou resultado observável (O)
  ↘ explicações rivais (R)
  → critérios para manter, revisar ou abandonar a proposição
```

Uma cadeia C–M–O é uma **hipótese de design**. Ela não autoriza linguagem
causal antes de um desenho de avaliação compatível. O mecanismo precisa ser
mais específico que “usar tecnologia”, e o resultado precisa ser mais preciso
que “engajamento” ou “eficácia”.

## Estados de conhecimento usados

| Estado | Pergunta respondida | Exemplo |
| --- | --- | --- |
| evidência externa | o que outros estudos observaram ou argumentaram? | interrupções podem impor custo de retomada |
| inferência teórica | como esse conhecimento pode se relacionar ao contexto do AraLearn? | um marco visível pode ajudar a reconstruir o objetivo suspenso |
| hipótese de design | que relação falseável será examinada? | cursor local pode reduzir erros de retomada em tarefa móvel |
| decisão de produto | que escolha está vigente e por quê? | manter o estado corrente no dispositivo |
| propriedade implementada | o que código e testes demonstram? | o estado sincronizado pode ser lido sem conexão |
| resultado empírico | o que uma avaliação observou numa versão e população? | somente pode ser preenchido após estudo documentado |

Esses estados não formam uma escada automática. Uma implementação não vira
resultado empírico pelo acúmulo de testes; uma hipótese não vira evidência
externa porque parece coerente.

Quatro termos técnicos reaparecem nas proposições. **Kernel** é o núcleo comum
que coordena os módulos do aplicativo. **Package** é um módulo de recurso com
contrato, validação e renderização próprios. **Workspace** é um espaço de
trabalho com membros e permissões locais. **Inteligência artificial (IA)**
designa aqui os modelos e serviços que auxiliam autoria; *learning analytics*
designa o uso intencional de dados educacionais para informar decisões. Uma
arquitetura **local-first** mantém a operação corrente apoiada na cópia local e
sincroniza com o servidor fora do caminho crítico da interação.

## Teoria de mudança provisória

O modelo de mudança pode ser lido da esquerda para a direita:

```text
tempo fragmentado, interrupção e conectividade variável
  ↓
disponibilidade local, retomada explícita e percurso compreensível
  ↓
explicação progressiva e representação adequada à operação
  ↓
prática pertinente, feedback acionável e ausência de punição automática
  ↓
revisão, autoria e colaboração sob responsabilidade humana
  ↓
continuidade, compreensão, retenção, transferência e qualidade autoral
avaliadas como resultados diferentes
```

Cada seta expressa relação a investigar. A cadeia não afirma que o primeiro
elemento causa o último. Por exemplo, disponibilidade local pode melhorar a
continuidade técnica sem produzir qualquer diferença de compreensão; prática
abundante pode ser irrelevante se cobrar operações que a teoria não ensinou.

IA, workspaces e analytics atravessam a cadeia como mediações sociotécnicas.
Eles modificam condições de autoria, coordenação e decisão, mas não substituem
aprender, ensinar, julgar ou assumir responsabilidade.

## Níveis de análise

O mesmo dado não responde a perguntas de todos os níveis:

| Nível | Unidade principal | Pergunta típica | Evidência compatível |
| --- | --- | --- | --- |
| pessoa–tarefa | pessoa executando uma operação | a tarefa foi compreendida e realizada? | desempenho, justificativa, observação e entrevista |
| card | função didática e representação local | texto, recurso e interação preservam o objetivo? | análise de conteúdo, auditoria representacional e teste de jornada |
| microssequência | progressão de teoria e prática | há base suficiente, coerência e retirada adequada de apoio? | rubrica, explicação, prática imediata e tarefa posterior |
| percurso | lição, módulo e curso | dependências e retomadas mantêm continuidade? | auditoria curricular e acompanhamento longitudinal |
| autoria | pessoa, modelo, contrato e revisão | escopo, qualidade e responsabilidade são compreendidos? | tarefa de autoria, rubrica, reversão e entrevista |
| workspace | membros, papéis e contribuições | coordenação e acesso são compreensíveis e seguros? | tarefas de permissão, análise qualitativa e auditoria de acesso |
| infraestrutura | kernel, packages, armazenamento e sincronização | o artefato é correto, resiliente e proporcional? | testes, medições técnicas, custos e incidentes |

Um clique pertence ao nível de interação. Ele não mede compreensão, percurso,
autorregulação ou colaboração sem uma cadeia de operacionalização validada.

## Construtos centrais

| Construto ou resultado | Definição de trabalho | Manifestação possível | Interpretação proibida |
| --- | --- | --- | --- |
| agência | capacidade situada de escolher e agir intencionalmente ([Bandura (2001)](referencias.md#ref-bandura2001agency)) | escolher, justificar, rejeitar, revisar e reverter | quantidade de opções ou personalizações |
| aprendizagem autorregulada | planejamento, execução, monitoramento e reflexão ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)) | meta, estratégia, monitoramento e ajuste | progresso salvo ou estudo solitário |
| carga cognitiva extrínseca | demanda dispensável introduzida pela apresentação ou operação ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload)) | busca visual, atenção dividida, passos e erros comparados | dificuldade inerente do conteúdo |
| feedback literacy | capacidade de apreciar, julgar e usar feedback ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)) | interpretação e ação posterior | abrir ou concordar com mensagem |
| retomada | reconstrução do objetivo e do estado após interrupção | localizar, explicar e continuar corretamente | apenas reabrir a tela |
| compreensão | construção de significado demonstrada em explicação, discriminação ou aplicação | resposta justificada e uso coerente | confiança ou conclusão do card |
| retenção | disponibilidade posterior do conhecimento | desempenho adiado em tarefa equivalente | repetição imediata |
| transferência | aplicação a situação estruturalmente nova | solução e justificativa em problema novo | troca superficial de valores |
| qualidade pedagógica | alinhamento entre objetivo, pré-requisitos, explicação, prática e feedback | rubrica, ausência de saltos e prática pertinente | quantidade de cards ou fluência textual |
| qualidade representacional | fidelidade disciplinar e apoio à operação sem ambiguidade evitável | julgamento de especialista e interpretação em tarefa | ausência de overflow ou uso de biblioteca gráfica |
| controle humano da IA | autoridade efetiva sobre intenção, escopo, revisão e consequência | rejeitar, iterar, reverter e justificar | botão de confirmação isolado |
| colaboração situada | coordenação e construção de prática ou significado ([Wenger (1998)](referencias.md#ref-wenger1998communities)) | negociação, revisão e responsabilidade compartilhada | acesso comum ou papel cadastrado |
| frugalidade | proporcionalidade de custo, armazenamento, payload e manutenção | bytes, latência, custo e crescimento | redução de qualidade ou segurança |

As definições ampliadas estão no [Glossário de
construtos](glossario-construtos.md).

## Proposições de design

Todas as proposições P1–P10 têm o estado de **hipótese**. Cada uma segue o
mesmo roteiro: problema, alternativas ou requisitos, decisão, fundamentação,
operacionalização, consequências esperadas, explicações rivais e limites.

### P1 — retomada local após interrupção

- **Problema e contexto:** estudo móvel suspenso ou conexão ausente pode exigir
  reconstrução do objetivo e introduzir espera.
- **Alternativas ou requisitos:** depender do servidor; manter apenas cache de
  tela; conservar réplica e estado corrente. A ação local deve responder sem
  aguardar rede.
- **Decisão:** manter conteúdo sincronizado e cursor mínimo no dispositivo;
  sincronizar sem bloquear a interação principal.
- **Fundamentação:** interrupções podem impor custo de retomada
  ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)).
- **Operacionalização:** conteúdo e estado corrente legíveis offline; cenário
  automatizado de perda de rede; tarefa humana de localizar e continuar.
- **Consequência esperada:** menos erros operacionais e maior sucesso de
  retomada.
- **Explicações rivais:** tarefa simples, memória recente, familiaridade com o
  curso ou instrução recebida.
- **Limite e evidência de enfraquecimento:** se o cursor não for compreendido,
  não superar alternativa ou divergir entre dispositivos, a proposição deve ser
  revista. O offline técnico não demonstra aprendizagem.

### P2 — progressão suficiente sem condensação

- **Problema e contexto:** uma pessoa novata encontra teoria densa, siglas e
  pressupostos ocultos.
- **Alternativas ou requisitos:** resumo curto, exposição extensa de uma vez ou
  progressão em camadas; a profundidade final e as relações precisam ser
  preservadas.
- **Decisão:** planejamento antecede quantidade de cards; não há tamanho fixo de
  microteoria ou prática.
- **Fundamentação:** carga e segmentação dependem de tarefa e desenho
  ([Sweller et al. (1998)](referencias.md#ref-sweller1998architecture); [Rey et al. (2019)](referencias.md#ref-rey2019segmenting)); microlearning é um campo
  heterogêneo ([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).
- **Operacionalização:** pré-requisitos, referentes, termos, relações, exemplos
  e verificações são declarados antes da materialização.
- **Consequência esperada:** menos saltos conceituais e melhor capacidade de
  explicar e aplicar.
- **Explicações rivais:** maior tempo total, repetição, qualidade do autor ou
  conhecimento prévio não medido.
- **Limite e evidência de enfraquecimento:** redundância improdutiva, perda de
  relações ou incompreensão persistente exigem revisão; mais cards não
  sustentam a proposição.

### P3 — representação escolhida pela operação

- **Problema e contexto:** relações espaciais, formais, tabulares ou
  hierárquicas se perdem em prosa; diagramas inadequados também criam carga.
- **Alternativas ou requisitos:** texto, recurso geral ou representação
  especializada; a escolha deve preservar convenção e gesto cognitivo.
- **Decisão:** admitir packages por justificativa semântica, descobrir primeiro
  por intenção e consultar depois o contrato específico.
- **Fundamentação:** representações possuem funções, restrições e demandas de
  coordenação ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft); [Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)).
- **Operacionalização:** catálogo facetado, contrato de alto nível, mecanismo de renderização
  mecanismo de renderização determinístico, caso acadêmico complexo e auditoria disciplinar.
- **Consequência esperada:** interpretação mais precisa e menor tradução para
  prosa ou tabelas improvisadas.
- **Explicações rivais:** novidade, familiaridade com a notação, dica no
  enunciado ou qualidade visual geral.
- **Limite e evidência de enfraquecimento:** se texto ou package geral produzir
  desempenho igual ou melhor, ou se a gramática exigir explicação maior que seu
  benefício, o recurso deve ser revisto, fundido ou removido.

### P4 — apoio seguido de produção independente

- **Problema e contexto:** novato precisa compreender uma operação complexa sem
  permanecer dependente de solução pronta.
- **Alternativas ou requisitos:** resolução não apoiada, exemplo permanente ou
  retirada gradual.
- **Decisão:** combinar exemplo resolvido, prática guiada e prática com menos
  apoio quando a tarefa justificar.
- **Fundamentação:** exemplos resolvidos e *fading* apresentam benefícios em
  condições delimitadas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)).
- **Operacionalização:** dados particulares permanecem no card; passos, dicas ou
  decisões são retirados progressivamente.
- **Consequência esperada:** transição mais compreensível entre observação e
  execução.
- **Explicações rivais:** tempo maior na tarefa, repetição ou item mais fácil.
- **Limite e evidência de enfraquecimento:** passividade, dependência ou ausência
  de desempenho sem apoio enfraquecem a proposição.

### P5 — prática variada por função e não por aparência

- **Problema e contexto:** formatos repetidos podem medir apenas reconhecimento;
  variedade ornamental não muda a operação.
- **Alternativas ou requisitos:** formato fixo, rotação aleatória ou seleção
  pela evidência de aprendizagem.
- **Decisão:** escolher entre seleção, lacuna, digitação e ordenação conforme o
  gesto cognitivo; expressar correspondências simples por lacunas e posicionar
  cada resposta dentro do objeto, inclusive os trechos permutados pela
  ordenação.
- **Fundamentação:** recuperação pode beneficiar aprendizagem, com moderadores e
  limites de transferência ([Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).
- **Operacionalização:** cada prática declara o que verifica; lacunas são
  independentes; tarefas posteriores distinguem retenção e transferência.
- **Consequência esperada:** correspondência mais clara entre objetivo e ação do
  estudante.
- **Explicações rivais:** dificuldade, tempo, familiaridade ou pistas do formato.
- **Limite e evidência de enfraquecimento:** prática artificial, resposta fora do
  objeto ou ausência de transferência exigem revisão.

### P6 — feedback acionável de baixa consequência

- **Problema e contexto:** resultado binário não explica o erro; punição
  acumulada pode ser irrelevante ao objetivo de prática.
- **Alternativas ou requisitos:** avaliação por toque, revelação automática ou
  confirmação seguida de feedback específico e nova tentativa.
- **Decisão:** confirmar antes de avaliar, revelar resposta apenas por ação
  explícita, permitir repetição e não converter tentativas em nota ou ranking.
- **Fundamentação:** feedback depende de conteúdo, foco e possibilidade de ação
  ([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)).
- **Operacionalização:** feedback por distinção, distratores plausíveis, limpar,
  repetir e aplicar depois.
- **Consequência esperada:** melhor interpretação e ação sobre o erro.
- **Explicações rivais:** mera repetição, resposta fornecida ou item mais fácil.
- **Limite e evidência de enfraquecimento:** feedback incompreensível, revelação
  precoce ou dependência de ajuda enfraquecem a proposição. Redução de ansiedade
  não é alegada sem medida.

### P7 — autoria contextual e reversível

- **Problema e contexto:** editar fora do card pode ocultar o alvo e misturar
  texto visível com estrutura.
- **Alternativas ou requisitos:** editor estrutural completo, instrução sem escopo
  ou seleção de folhas textuais com contexto protegido.
- **Decisão:** tornar editáveis apenas textos autorizados; oferecer assistência
  conversacional iterável e versões reversíveis.
- **Fundamentação:** controle humano exige comunicação de capacidade, correção e
  ação compreensível ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)); interpretação e uso de feedback são
  processos, não entrega isolada ([Wood (2021)](referencias.md#ref-wood2021dialogic)).
- **Operacionalização:** contexto somente leitura, alvos graváveis explícitos,
  validação, desfazer, refazer e restaurar.
- **Consequência esperada:** menos erros de alvo e maior compreensão do escopo.
- **Explicações rivais:** edição mais curta, experiência técnica ou tarefa
  trivial.
- **Limite e evidência de enfraquecimento:** estrutura exposta como texto,
  alteração lateral ou reversão incompreensível exigem bloquear e revisar.

### P8 — observação situada e ciclo de retorno

- **Problema e contexto:** dúvida ou possível erro pode se perder quando
  separado do card que lhe dá sentido.
- **Alternativas ou requisitos:** telemetria inferida, comentário geral ou
  manifestação voluntária ligada ao objeto.
- **Decisão:** registrar observação situada, resposta e vínculo opcional com
  reparo confirmado, mantendo-os semanticamente distintos.
- **Fundamentação:** feedback formativo e sua apropriação dependem de informação
  e oportunidade de ação ([Nicol e Macfarlane-Dick (2006)](referencias.md#ref-nicol2006formative); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Nicol e Kushwah (2024)](referencias.md#ref-nicol2024feedbackagency)).
- **Operacionalização:** registrar, reencontrar, responder e decidir ação sem
  copiar todo o card nem diagnosticar o estudante.
- **Consequência esperada:** retorno compreensível e melhoria editorial
  rastreável.
- **Explicações rivais:** memória do problema, contato externo ou seleção de
  casos fáceis.
- **Limite e evidência de enfraquecimento:** observação perdida, tratada como
  diagnóstico ou sem responsável pelo retorno exige revisão.

### P9 — governança local e assistência de IA delimitada

- **Problema e contexto:** autoria coletiva e geração automática podem ampliar
  poder, escopo e consequência sem responsabilidade compreensível.
- **Alternativas ou requisitos:** permissões globais, automação irrestrita ou
  capacidades locais, contratos e proveniência.
- **Decisão:** calcular permissões no workspace; separar contribuição,
  publicação e estrutura; restringir a IA por catálogo, contrato, escopo e
  validação.
- **Fundamentação:** comunidades podem habilitar ou inibir agência
  ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)); recuperação e
  geração não garantem factualidade ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)); governança de IA exige
  responsabilidade e risco explícitos ([UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)).
- **Operacionalização:** papéis revogáveis, trilha de proveniência, contrato
  especializado, auditoria e revisão humana.
- **Consequência esperada:** coordenação e autoria mais delimitadas, com menor
  deriva estrutural.
- **Explicações rivais:** modelo maior, instrução intensiva, cenário artificial
  ou baixa complexidade.
- **Limite e evidência de enfraquecimento:** confusão de papel, falsa sensação de
  controle, erro pedagógico persistente ou seleção inadequada exigem revisão.

### P10 — dados definidos pela finalidade

- **Problema e contexto:** logs disponíveis podem ser convertidos em proxies de
  atenção, domínio ou risco sem validade.
- **Alternativas ou requisitos:** coletar tudo, não coletar nada ou registrar
  somente dados ligados a pergunta e ação legítimas.
- **Decisão:** definir construto, manifestação, interpretação, intervenção,
  retenção, acesso e custo antes da coleta; recusar tempo e cliques como proxies
  por padrão.
- **Fundamentação:** analytics requer transparência, controle, responsabilidade
  e processo centrado nas pessoas ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)).
- **Operacionalização:** matriz de finalidade, orçamento de armazenamento,
  acesso proporcional e teste de interpretação.
- **Consequência esperada:** informação mais acionável com menor risco de
  vigilância e inferência indevida.
- **Explicações rivais:** utilidade menor apenas por haver menos dados ou
  interpretação equivocada por participantes.
- **Limite e evidência de enfraquecimento:** se decisões legítimas não puderem
  ser sustentadas, o conjunto deve ser revisto; a revisão não autoriza coleta
  irrestrita.

## Resultados que permanecem separados

Uma avaliação pode combinar medidas, mas não deve colapsar:

- usabilidade;
- continuidade e retomada;
- carga cognitiva durante a tarefa;
- compreensão conceitual imediata;
- retenção posterior;
- transferência;
- qualidade factual, pedagógica e representacional;
- agência e controle humano;
- colaboração e coordenação;
- correção, resiliência e frugalidade técnica.

“Eficácia do AraLearn” não é uma variável única. Cada resultado exige unidade,
instrumento, momento e interpretação próprios.

## Inferências proibidas

- abertura ou tempo como atenção;
- progresso como domínio;
- ausência de observação como compreensão;
- erro, ajuda ou resposta revelada como fracasso;
- uso de IA como falta de conhecimento;
- quantidade de cards ou recursos como qualidade;
- papel de workspace como colaboração;
- materialização técnica como validação pedagógica;
- esquema de dados válido como correção factual;
- preferência estética como usabilidade;
- correlação de uso como efeito causal.

## Passagem do quadro à avaliação

A [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
liga P1–P10 a decisões, implementação e instrumentos. O [Protocolo de avaliação
do artefato](protocolo-avaliacao-artefato.md) define episódios de DBR e DSR.
Uma proposição só pode ser descrita como resultado sustentado quando versão,
contexto, população, procedimento, análise, incerteza e limites estiverem
registrados.
