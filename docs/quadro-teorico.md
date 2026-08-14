# Quadro teórico

## Função e unidade de explicação

Este quadro transforma literatura e decisões do produto em proposições
examináveis. Ele não afirma que funcionalidades do AraLearn causam
aprendizagem. A unidade de explicação adotada é:

```text
contexto (C) → mecanismo proposto (M) → manifestação observável (O)
             ↘ explicação rival (R) → teste e limite
```

Uma cadeia C–M–O organiza a investigação sem converter correlação em causa. A
manifestação observável deve ser mais específica que “engajamento” ou
“eficácia”, e as explicações rivais precisam ser registradas antes da análise.

## Teoria de mudança provisória

```text
tempo fragmentado + interrupção + conectividade variável
  ↓
disponibilidade local + retomada explícita + percurso compreensível
  ↓
progressão suficiente + representação adequada à operação
  ↓
prática variada + feedback acionável + baixa consequência
  ↓
observação, revisão e autoria sob controle humano
  ↓
continuidade, compreensão, retenção, transferência e qualidade autoral
avaliadas separadamente
```

IA, workspaces e analytics atravessam a cadeia como mediações sociotécnicas.
Não substituem aprender, ensinar, julgar ou assumir responsabilidade.

## Níveis analíticos

| Nível | Unidade | Pergunta típica | Evidência adequada |
| --- | --- | --- | --- |
| pessoa–tarefa | estudante executando operação num card | a representação foi compreendida? | desempenho, explicação e entrevista |
| microssequência | progressão local de teoria e prática | há base suficiente e coerência? | análise de conteúdo, tarefa e retenção |
| percurso | lição, módulo e curso | dependências e retomadas preservam continuidade? | auditoria curricular e estudo longitudinal |
| autoria | pessoa, LLM, contrato e versão | o escopo e a responsabilidade são compreendidos? | erros de alvo, rubrica, reversão e entrevista |
| workspace | papéis e contribuições situadas | a coordenação é compreensível e segura? | tarefa, análise qualitativa e auditoria de acesso |
| infraestrutura | kernel, package, armazenamento e sync | o artefato é correto, frugal e resiliente? | teste, medição técnica e incidente |

Não se deve usar uma medida de nível inferior para inferir automaticamente um
construto de nível superior. Um clique num card, por exemplo, não mede
continuidade do percurso nem colaboração.

## Construtos centrais e operacionalização

| Construto | Definição no quadro | Manifestação possível | Medida ou instrumento candidato | Limite |
| --- | --- | --- | --- | --- |
| agência do estudante | capacidade e possibilidade percebida de escolher, justificar e agir | decisão de escopo, rejeição, revisão e reversão | entrevista, tarefa de decisão e escala validada adequada | opções visíveis não provam agência |
| aprendizagem autorregulada | planejamento, desempenho, monitoramento e reflexão | meta declarada, ajuste de estratégia e revisão escolhida | entrevista episódica, diário consentido e instrumento validado | progresso não mede autorregulação |
| carga cognitiva extrínseca | demanda criada pelo modo de apresentação ou operação | busca desnecessária, atenção dividida e erro de leitura | tarefa comparativa, relato e escala apropriada | dificuldade do conteúdo não é carga extrínseca |
| coerência pedagógica | alinhamento entre objetivo, pré-requisito, explicação, prática e feedback | ausência de salto e prática coberta pela teoria | rubrica de especialista e explicação do estudante | sequência formal não garante coerência |
| prática de recuperação | produção de conhecimento ou decisão sem reexposição integral | resposta construída, discriminação ou ordenação | acurácia e justificativa em tarefa inicial e adiada | toque e reconhecimento isolados não bastam |
| feedback literacy | capacidade de apreciar, julgar e usar feedback | interpretação e ação posterior justificadas | tarefa de uso do feedback e entrevista | receber mensagem não prova apropriação |
| retomada | restabelecimento do objetivo e do estado necessários para continuar | localização correta e explicação do ponto corrente | sucesso, erro e relato após interrupção | abertura não mede retenção |
| qualidade representacional | fidelidade acadêmica e apoio ao gesto cognitivo | relação visual interpretada sem ambiguidade | auditoria de domínio, tarefa e caso complexo | ausência de overflow não prova didática |
| controle humano da IA | autoridade efetiva sobre intenção, escopo e consequência | rejeitar, iterar, reverter e justificar | tarefa de autoria, log consentido e entrevista | botão de confirmação pode ser controle simbólico |
| colaboração situada | coordenação e construção de prática ou significado | negociação, revisão e responsabilidade compartilhada | análise de interação e produto coletivo | papel ou presença não provam colaboração |
| frugalidade | adequação de custo, dados e manutenção ao contexto | armazenamento e payload proporcionais | bytes, latência, custo e crescimento | economia não autoriza perda de qualidade |

Definições completas e distinções estão no [Glossário de
construtos](glossario-construtos.md).

## Proposições de design

Todas as proposições abaixo têm estado **hipótese de design**. Os identificadores
são estáveis para ligar teoria, implementação e avaliação.

### P1 — retomada local após interrupção

- **Contexto:** atividade móvel suspensa, conexão ausente ou instável.
- **Mecanismo proposto:** réplica local, cursor corrente e contexto visível.
- **Resultado esperado:** maior sucesso para localizar e continuar a tarefa,
  com menos erro operacional.
- **Explicações rivais:** familiaridade prévia, tarefa simples, memória recente.
- **Evidência que enfraquece:** cursor não é compreendido ou não melhora a
  retomada frente a uma alternativa.

### P2 — microssequência coerente, sem teoria condensada

- **Contexto:** aprendiz novato diante de assunto técnico complexo.
- **Mecanismo proposto:** pré-requisitos explícitos, aproximação progressiva,
  exemplos e práticas distribuídos em quantidade variável.
- **Resultado esperado:** melhor explicação conceitual e menos saltos
  identificados por estudantes e especialistas.
- **Explicações rivais:** tempo total maior, repetição ou qualidade do autor.
- **Evidência que enfraquece:** conteúdo permanece incompreensível, redundante
  ou perde profundidade apesar da divisão.

### P3 — representação escolhida pela operação

- **Contexto:** tarefa depende de relação espacial, temporal, hierárquica,
  formal ou notacional.
- **Mecanismo proposto:** resource canônico selecionado por intenção e contrato
  especializado consultado depois da escolha.
- **Resultado esperado:** interpretação mais precisa e menos tradução para
  prosa ou tabelas improvisadas.
- **Explicações rivais:** efeito de novidade, familiaridade com a notação ou
  dica presente no enunciado.
- **Evidência que enfraquece:** texto/package geral produz compreensão igual ou
  superior, ou o diagrama exige explicação adicional maior que seu benefício.

### P4 — apoio seguido de produção

- **Contexto:** aquisição inicial seguida de prática.
- **Mecanismo proposto:** exemplo resolvido, retirada gradual e alternância de
  reconhecimento, produção e ordenação conforme o objetivo.
- **Resultado esperado:** melhora separada em compreensão imediata, retenção e
  transferência.
- **Explicações rivais:** maior tempo na tarefa ou maior quantidade de itens.
- **Evidência que enfraquece:** apoio gera passividade ou prática não transfere
  para problema novo.

### P5 — feedback acionável de baixa consequência

- **Contexto:** resposta incompleta ou incorreta em estudo autodidata.
- **Mecanismo proposto:** feedback específico, possibilidade de revelar,
  limpar, repetir e agir sem nota ou ranking.
- **Resultado esperado:** melhor interpretação do erro e ação posterior.
- **Explicações rivais:** repetição do mesmo item ou resposta explicitamente
  fornecida.
- **Evidência que enfraquece:** feedback não é compreendido, não muda a ação ou
  introduz dependência de revelação.

### P6 — autoria contextual e reversível

- **Contexto:** pessoa detecta problema no card durante o estudo.
- **Mecanismo proposto:** seleção apenas de campos textuais visíveis, contexto
  somente leitura, chat iterável e versões reversíveis.
- **Resultado esperado:** menos erros de alvo, menor troca de contexto e maior
  percepção de controle.
- **Explicações rivais:** edição é simplesmente mais curta ou usuário já conhece
  a estrutura.
- **Evidência que enfraquece:** código estrutural aparece como texto editável,
  a LLM altera alvo não autorizado ou a reversão não é compreendida.

### P7 — observação situada e ciclo de retorno

- **Contexto:** estudante identifica dúvida, ambiguidade ou possível erro.
- **Mecanismo proposto:** observação ligada ao card, resposta situada e vínculo
  opcional com reparo confirmado.
- **Resultado esperado:** a pessoa reencontra, compreende e pode agir sobre o
  retorno; autores distinguem manifestações de inferências.
- **Explicações rivais:** contato externo ou memória do problema.
- **Evidência que enfraquece:** observações se perdem, são tratadas como
  diagnóstico ou não produzem decisão compreensível.

### P8 — governança local em workspaces

- **Contexto:** autoria individual ou coletiva com responsabilidades variadas.
- **Mecanismo proposto:** papéis locais, capacidades explícitas e revogáveis,
  proveniência de contribuições.
- **Resultado esperado:** tarefas de coordenação e acesso são concluídas sem
  privilégio global ou burocracia de publicação.
- **Explicações rivais:** instrução prévia intensa ou cenário artificial.
- **Evidência que enfraquece:** participantes confundem papel, propriedade,
  visibilidade ou consequência de ações.

### P9 — assistência de IA delimitada

- **Contexto:** autoria extensa por MCP ou reparo local por API.
- **Mecanismo proposto:** catálogo por intenção, contratos progressivos, escopo
  gravável, validação, auditoria e responsabilidade humana.
- **Resultado esperado:** menos deriva estrutural e menor retrabalho sem perda
  de expressividade.
- **Explicações rivais:** modelo maior, prompt específico ou tarefa simples.
- **Evidência que enfraquece:** schema válido contém erro pedagógico persistente,
  seleção inadequada de resource ou falsa sensação de controle.

### P10 — analytics por finalidade e recusa de proxies

- **Contexto:** decisão pedagógica ou de governança que demanda informação.
- **Mecanismo proposto:** pergunta, construto, manifestação, intervenção e
  retenção definidos antes da coleta.
- **Resultado esperado:** informação compreensível e acionável com menor risco
  de vigilância e inferência indevida.
- **Explicações rivais:** menor utilidade apenas porque se coleta menos.
- **Evidência que enfraquece:** decisões legítimas não podem ser sustentadas ou
  dados ainda são reinterpretados como atenção, domínio ou qualidade docente.

## Resultados que não podem ser colapsados

- usabilidade e compreensão da interface;
- continuidade e retomada;
- conforto, ameaça ou ansiedade percebida;
- carga cognitiva durante uma tarefa;
- compreensão conceitual imediata;
- retenção posterior;
- transferência para estrutura nova;
- qualidade factual, pedagógica e representacional do conteúdo;
- agência e responsabilidade percebidas;
- colaboração e coordenação;
- correção, resiliência e frugalidade técnica.

Uma avaliação pode tratar vários resultados, mas precisa declarar a relação e
o risco de multiplicidade. “Eficácia do AraLearn” não é variável única.

## Interpretações proibidas

- abertura ou tempo como atenção;
- progresso como domínio;
- ausência de observação como compreensão;
- erro, ajuda ou resposta revelada como fracasso;
- uso de IA como falta de conhecimento;
- quantidade de cards ou resources como qualidade;
- papel de workspace como colaboração;
- publicação como validação pedagógica;
- schema válido como correção factual;
- preferência estética como usabilidade;
- correlação de uso como efeito causal.

## Do quadro à avaliação

A [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
liga cada proposição a requisitos, código e instrumentos. O [Protocolo de
avaliação](protocolo-avaliacao-artefato.md) separa episódios de DBR e DSR. Uma
proposição só muda de hipótese para resultado sustentado quando a versão, o
contexto, a população, a análise e os limites estão registrados.
