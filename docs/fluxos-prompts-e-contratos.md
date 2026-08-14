# Fluxos, instruções e contratos

Um modelo de linguagem recebe texto e produz uma saída probabilística. Um
sistema de autoria precisa preservar identidades, relações, permissões e
revisões de forma determinística. O AraLearn não tenta eliminar essa diferença;
ele a transforma numa fronteira explícita entre **intenção em linguagem
natural** e **mudança estruturada**.

Este capítulo ensina os componentes dessa fronteira, os dois fluxos de autoria
e as razões para separá-los.

## Vocabulário básico

### Instrução e prompt

Uma **instrução** estabelece comportamento estável, como “não cobre um conceito
antes de ensiná-lo”. Um **prompt** é a mensagem completa entregue numa chamada
específica e pode reunir instruções, pedido, contexto e formato de saída.

O prompt orienta o modelo, mas não concede autorização. Mesmo uma instrução
cuidadosa pode ser interpretada incorretamente; por isso, o sistema verifica a
saída depois da geração.

### Contexto

**Contexto** é a informação necessária para interpretar o pedido: objetivos,
posição na árvore, conteúdo vizinho, fontes e decisões anteriores. Contexto
somente para leitura ajuda a manter coerência sem se tornar gravável.

### Schema, contrato e envelope

Um **schema** descreve a forma válida de um dado: campos, tipos, limites e
combinações permitidas. Um **contrato** acrescenta significado operacional:
quem produz, quem consome, que invariantes devem ser preservadas e como a
versão evolui. Um **envelope** é o objeto externo que transporta conteúdo e
metadados de identificação segundo esse contrato.

O schema responde “este JSON tem a forma admitida?”. Regras semânticas
respondem perguntas que a forma isolada não resolve, como “a lacuna aponta para
um campo que este package autoriza praticar?”.

### Compilação

No AraLearn, **compilar** uma resposta significa convertê-la em uma mudança
canônica, resolver referências e validar invariantes antes da persistência. Não
é a compilação de uma linguagem de programação para código de máquina; é a
passagem de uma proposta para o modelo de dados autorizado.

## Por que não gravar a resposta do modelo diretamente

Gravação direta teria quatro riscos:

1. campos inesperados poderiam entrar no curso;
2. identidades ou referências poderiam ser trocadas;
3. conteúdo fora do alvo poderia ser alterado;
4. uma resposta parcial poderia deixar o documento incoerente.

O fluxo adotado mantém o resultado em memória, compila-o, valida-o e somente
então confirma a mudança integral. Uma falha não produz gravação parcial.

## Duas fronteiras de autoria

O manifesto técnico distingue dois fluxos:

- `atomic-card-assistance`: assistência contextual iniciada por seleção no
  aplicativo;
- `atomic-resource-authoring`: autoria estrutural por integração externa sobre
  um workspace.

Esses nomes são identificadores técnicos. Conceitualmente, a diferença é de
escala e autoridade.

| Propriedade | Assistência contextual | Autoria estrutural |
| --- | --- | --- |
| início | card, microssequência ou lição selecionada | finalidade e árvore do curso |
| alcance | recorte visual autorizado | cursos e partes acessíveis no workspace |
| conversa | curta e volátil no card | continuidade compacta persistida |
| operações | edição, recomposição ou criação delimitada | planejamento, recombinação, auditoria e publicação |
| autenticação | sessão do aplicativo e chave do provider | OAuth da integração de autoria |

Uma capacidade não funciona como fallback da outra. Mudança de módulo ou curso
não é silenciosamente reduzida a uma edição de card; uma correção pontual não
precisa carregar o fluxo editorial completo.

## Fluxo da assistência contextual

```text
seleção visível
→ autoridade calculada
→ operação fechada
→ contexto delimitado
→ saída estruturada
→ compilação e validação
→ confirmação atômica
→ nova renderização
```

### Classificar antes de transmitir conteúdo

A primeira decisão escolhe uma operação entre alternativas permitidas pela
seleção. Ela recebe apenas o pedido e a lista de operações autorizadas, não o
curso inteiro. `unsupported` é uma resposta válida. Isso impede converter um
pedido fora do escopo na única mutação que restou disponível.

### Separar alvo gravável e contexto

Em edição textual, cada alvo gravável aparece uma única vez com seu caminho.
As instâncias irmãs e os vizinhos aparecem como leitura. O modelo devolve
somente os pares que deseja mudar; o compilador aplica-os sobre o card
congelado.

Em recomposição, o sistema busca uma composição no catálogo, apresenta ao
modelo uma lista curta e carrega somente os contratos escolhidos. Criar cards
ou microssequência é outra operação e só aparece quando a seleção concedeu
autoridade sobre o recipiente.

Os limites completos por nível estão em [Assistência por modelo de
linguagem](assistencia-por-ia.md#autoridade-por-nível).

## Fluxo da autoria estrutural

```text
contexto disponível e fontes
→ diálogo somente sobre lacunas materiais
→ diagnóstico contextual e planejamento local
→ aprovação humana
→ materialização incremental
→ revisão conceitual
→ auditoria somente para leitura
→ reparo autorizado
→ reauditoria
→ submissão ou publicação
```

O **brief** registra contexto estável: público, objetivo, fontes, inclusões,
exclusões, idioma e convenções. Ele não é texto de card. Estrutura, decisões,
mandatos e achados possuem registros próprios, para que uma conversa não seja
a única memória do trabalho.

Antes do diálogo, o modelo consulta o que já existe no pedido, no workspace, no
curso e nas fontes. Uma pergunta só é necessária quando a resposta ausente ou
uma contradição puder mudar materialmente objetivo, escopo, pré-requisito,
sequência, representação, prática ou dependência de ambiente externo. Não há
questionário fixo de diagnóstico.

### Planejar antes de produzir

O planejamento pedagógico precede o custo de geração. Para cada
microssequência, ele explicita condições de aprendizagem pertinentes, exigências
do conteúdo, dificuldades previstas e respostas de desenho vinculadas às
dificuldades, aos passos/packages que as concretizam e a critérios observáveis. A
condição descreve o cenário; a resposta é uma decisão local sobre explicação,
exemplo, representação, prática, apoio ou sequência. Uma não determina
automaticamente a outra.

A quantidade de cards não é escolhida por cota fixa: decorre dos conceitos,
pré-requisitos, dificuldades, respostas aprovadas, formas de prática e
necessidade de revisão. A pessoa autora examina essa síntese antes da
materialização. Depois da aprovação, a produção ocorre por microssequência, em
lotes que podem ser validados e retomados.

### Separar auditoria e reparo

Auditar e corrigir na mesma chamada cria um conflito: o mesmo agente pode
deixar de relatar um problema que já começou a racionalizar como solução. No
AraLearn, auditoria é somente leitura e gera achados localizados. Reparos
exigem autorização posterior; a reauditoria relê o resultado e procura tanto
resolução quanto regressões.

Essa separação não garante independência epistemológica completa — o mesmo
modelo ainda pode ser usado —, mas torna ações e decisões observáveis e
permite rejeitar apenas parte dos reparos.

## Descoberta progressiva de recursos

Um catálogo crescente não pode ser transmitido integralmente em todo prompt.
Também não é seguro depender da memória do modelo para schemas que mudam. A
consulta usa uma única biblioteca com operações progressivas:

1. `explore` apresenta famílias e facetas;
2. `search` procura representações pela intenção;
3. `inspect` compara perfis sem carregar schemas;
4. `contracts` devolve somente os contratos exatos escolhidos;
5. `validate_card` verifica estrutura;
6. `audit_representation` verifica ajuste declarado e limitações;
7. `preview_card` fornece um descritor, sem fingir uma renderização visual.

O resultado de busca usa três classificações técnicas:

- `canonical`: o perfil corresponde diretamente à intenção declarada;
- `versatile`: um recurso mais geral preserva a estrutura necessária;
- `substitute`: falta uma representação ideal e o melhor substituto possui
  limitações que precisam ser informadas.

Esses tokens expressam o ajuste dentro do catálogo; `canonical` não certifica
consenso acadêmico externo. Um substituto não bloqueia a produção. A integração
o utiliza, informa brevemente a limitação e registra qual representação seria
preferível, permitindo evolução posterior do catálogo.

## Recuperação de conhecimento

Instruções operacionais precisam ser curtas e estáveis. Regras extensas sobre
fontes, práticas, continuidade e domínios são recuperadas conforme a tarefa.
Esse arranjo é uma forma de **Retrieval-Augmented Generation (RAG)**: a geração
recebe conhecimento recuperado de uma coleção externa ao contexto-base
([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)).

No AraLearn, a recuperação autoral atual é lexical, versionada e
determinística. Ela seleciona até oito unidades pequenas; não usa embedding
remoto nem banco vetorial. Essa escolha reduz infraestrutura, torna a seleção
auditável e atende ao corpus controlado atual. Busca semântica vetorial seria
justificada quando a escala, a variedade lexical e a avaliação demonstrarem
vantagem suficiente para compensar custo, opacidade e manutenção adicionais.

Conhecimento recuperado orienta o modelo. Contratos e validadores continuam
determinando o que pode ser salvo.

## Invariantes protegidos e decisões pedagógicas locais

Limites de autorização, fechamento de schema, integridade referencial,
proibição de pistas indevidas, preservação de identidade, cobertura e revisão
humana são invariantes do produto. Eles não são preferências editáveis e não
podem ser anulados por conversa ou configuração.

Também é invariante consultar o contexto existente, explicitar dificuldades e
respostas e obter revisão humana antes da materialização. O conteúdo dessas
hipóteses e decisões, porém, permanece contextual e revisável.

Idioma, notação, acesso a meios e conhecimentos prévios presumíveis são dados do
contexto. Explicação, exemplo, representação, prática, apoio e sequência são
decisões de desenho tomadas por microssequência. O AraLearn não aplica preset,
perfil ou “pedagogia calibrada” ao curso inteiro: a autoria liga cada decisão a
uma dificuldade pertinente e submete o conjunto à pessoa responsável.

Essa responsabilidade diagnóstica organiza hipóteses para planejamento; ela não
mede estudantes nem certifica adequação ou eficácia. Contratos e validadores
controlam o que pode ser persistido, mas julgamento factual, disciplinar e
pedagógico permanece humano.

## Confirmação, concorrência e idempotência

Cada mutação informa a revisão que foi lida. A confirmação usa
**compare-and-swap**: se a revisão mudou, a operação relê o alvo e decide se a
intenção ainda se aplica. Não há merge silencioso.

Uma **chave de idempotência** identifica a mesma tentativa. Se a resposta do
servidor se perder, repetir a requisição com o mesmo conteúdo recupera o mesmo
resultado em vez de duplicá-lo. Uma intenção ou payload diferente recebe outra
chave.

No workspace estrutural, somente as partes atingidas são escritas; o servidor
recompõe o documento e valida a composição antes de avançar sua revisão. Na
assistência local, o change set inteiro é aplicado numa transação. As duas
implementações preservam atomicidade, mas em escalas diferentes.

## Proveniência e conversa

O curso registra resultados e decisões estruturadas que precisam sobreviver à
sessão. A conversa curta da assistência contextual não é proveniência. Na
autoria estrutural, decisões sobre representações substitutivas podem registrar
intenção, package escolhido, ajuste, limitação e versão do catálogo sem inserir
esses metadados no card público.

O mesmo vale para diagnóstico e planejamento: condições estáveis ficam no
brief; a decisão resume condição e demanda; somente pares relevantes de
dificuldade e resposta seguem em `pedagogicalDiagnosis.difficultyResponses`.
Não se persistem ids locais do blueprint, raciocínio privado do modelo nem o
transcript integral do diálogo. Essa separação economiza armazenamento e permite
analisar a evolução autoral sem transformar toda conversa em dado permanente.
Quando uma investigação exigir preservar conversas, isso deve ser outro
protocolo de coleta, com finalidade, consentimento e retenção próprios.

## Falhas e recuperação

| Falha | Resposta segura |
| --- | --- |
| JSON inválido | uma tentativa orientada de correção; nenhuma gravação parcial |
| contrato incompatível | consultar o contrato exato e corrigir o menor lote |
| revisão desatualizada | reler o alvo e reaplicar somente a intenção ainda válida |
| resposta perdida | repetir a mesma tentativa idempotente |
| pedido fora da seleção | retornar como não suportado, sem adaptar o escopo |
| conta sem capacidade | conservar o conteúdo no estado autorizado e explicar a dependência |

Falhar de modo explícito é preferível a trocar silenciosamente de provider,
modelo, representação ou autoridade.

## Limites

Saída estruturada reduz ambiguidade e corrupção de estado; não garante verdade
factual, suficiência da progressão ou qualidade da prática. Auditoria por
modelo pode encontrar problemas, mas não substitui revisão disciplinar e
pedagógica. A publicação no catálogo permanece uma decisão humana autorizada.

Os envelopes e identificadores públicos são detalhados no [Contrato de
conteúdo](aralearn-contract.md), e a operação remota aparece em [Autoria por
Model Context Protocol](autoria-mcp.md).
