# Desenho instrucional parametrizado

## Finalidade e estado

Este capítulo reúne a fundamentação e o modelo operacional para representar
análise instrucional, parâmetros locais, disponibilidade de resources e a
comparação entre planejamento e conteúdo materializado. A ordem é deliberada:
primeiro se define o que a literatura permite sustentar; depois se propõem
unidades operacionais e, somente então, contratos de software.

Os contratos descritos aqui possuem schemas promovidos, validadores de runtime,
resolução determinística, persistência relacional e réplica local desde a #103.
Desde a #104, uma ferramenta agrupada os expõe pelo MCP e pela Action no fluxo
JIT por microssequência. A #105 projeta o mesmo estado numa interface responsiva
de Autoria. A #106 acrescenta audit runs imutáveis, checks sobre os cards reais,
findings estruturados, decisão humana, reparo autorizado e reauditoria independente.
Os contratos continuam fora do formato de publicação. Testes estruturais e de integração demonstram
comportamento técnico nos casos cobertos; não demonstram que os parâmetros
medem aprendizagem nem que seus valores são pedagogicamente ótimos.

## Quatro estatutos que não se confundem

| Estatuto | O que significa | Exemplo neste desenho | O que não autoriza afirmar |
| --- | --- | --- | --- |
| construto científico externo | conceito teórico ou variável investigada fora do AraLearn | conhecimento prévio, elemento interativo, proficiência, carga cognitiva | que o sistema observa diretamente o construto |
| operacionalização do AraLearn | unidade ou regra criada para planejar e auditar o artefato | unidade de análise instrucional, requisito de explicação, oportunidade distinta de prática | que a unidade é uma medida científica validada |
| propriedade de software | comportamento verificável do contrato ou do runtime | referências fechadas, versão explícita, contagem derivada reproduzível | que houve aprendizagem ou adequação pedagógica |
| hipótese empírica | relação provisória a ser examinada com tarefas, pessoas e medidas | um teto local de novidades pode reduzir compressão para novatos | que a relação já foi confirmada |

Essa separação vale nos nomes, na interface, nos dados e nos relatórios. Um
número calculável não se torna automaticamente uma escala, e um rótulo
pedagógico não se torna automaticamente um construto mensurado.

## Fundamentos da análise

### Conhecimento e granularidade

O quadro KLI trata componentes de conhecimento como entidades não observáveis,
inferidas a partir de desempenhos em tarefas, e mostra que sua granularidade
depende da população e da análise adotada
([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)).
Por isso, o AraLearn não chama automaticamente seus tópicos de *knowledge
components* e não declara que detectou o que uma pessoa sabe. A autoria trabalha
com **unidades de análise instrucional**: recortes explícitos e revisáveis que
ajudam a relacionar fonte, objetivo, explicação e evidência esperada.

Para cada unidade, o conhecimento prévio presumido pode ser classificado como
novo, parcial, integrado ou desconhecido, sempre com base e proveniência. A
classificação descreve uma suposição de desenho para um público e um contexto;
não é diagnóstico individual, probabilidade de domínio nem score de estudante.

### Coordenação simultânea

A interatividade de elementos depende tanto da estrutura da informação quanto
do conhecimento prévio: contam os elementos que precisam ser processados em
conjunto para compreender ou realizar a tarefa, e não todos os itens presentes
na tela. A própria contagem é aproximada e contextual
([Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity)).
Assim, o desenho registra **conjuntos de coordenação** com unidades e relações
que precisam permanecer simultaneamente disponíveis. Sua cardinalidade pode
ser calculada, mas não recebe o nome de carga cognitiva, dificuldade ou
complexidade psicológica.

Uma relação de pré-requisito, contraste, causalidade, composição, sequência ou
mapeamento representacional permanece uma relação. Transformá-la num único
score destruiria informação necessária para explicar e revisar o desenho.

### Alegação, evidência e tarefa

O *Evidence-Centered Design* separa o que se pretende afirmar, que evidência
observável sustentaria a afirmação e que tarefa poderia produzir essa evidência
([Mislevy et al. (2003)](referencias.md#ref-mislevy2003ecd)). A
transposição para o AraLearn é limitada: um objetivo local precisa se ligar a
um requisito de evidência, a uma operação e a formas aceitáveis de desempenho.
Essa ligação melhora a auditabilidade, mas não transforma uma prática cotidiana
em instrumento validado nem autoriza inferência psicométrica.

### Tarefas, apoio e fidelidade

O 4C/ID distingue tarefas integrais, informação de apoio, informação
procedimental e prática de partes quando a automatização é necessária. Também
trata variação, apoio e fidelidade como escolhas relacionadas à natureza da
tarefa, e não como uma sequência obrigatória para todo conteúdo
([van Merriënboer (2019)](referencias.md#ref-vanmerrienboer2019fourcomponent)).
O AraLearn pode representar essas dimensões quando forem pertinentes, sem
impor uma pedagogia universal nem condensá-las num índice de “autenticidade”.

Fidelidade permanece um conjunto categorial de formas de desempenho,
ambientes, restrições e aspectos preservados ou ausentes. Uma simulação textual
pode ser apropriada para observar uma decisão e insuficiente para demonstrar
execução num ambiente real; a limitação precisa acompanhar o desenho.

### Explicação e elaboração

Estudos de autoexplicação mostram que aprendizes podem elaborar condições de
aplicação e relacionar ações a princípios, com diferenças relevantes entre
participantes e tarefas
([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations);
[Chi et al. (1994)](referencias.md#ref-chi1994eliciting)). Explicações
instrucionais, entretanto, não funcionam de maneira automática: precisam
considerar conhecimento prévio, conceitos e princípios relevantes e a
atividade cognitiva em curso
([Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)).

O desenho registra requisitos aplicáveis — por exemplo, definição, mecanismo,
relação causal, condição de aplicação, limite, contraste, exemplo resolvido,
ligação entre representações ou justificativa de procedimento. A lista não é
um checklist universal. Cada requisito precisa apontar para as unidades e
relações que o tornam necessário; quantidade de requisitos não mede qualidade
da explicação.

### Representações externas

Representações podem complementar informação, restringir interpretações ou
ajudar a construir relações, mas também introduzem tarefas de leitura e
coordenação. Mais representações não são automaticamente melhores
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Por isso, seleção
de resource depende da estrutura e da operação, das limitações conhecidas e da
disponibilidade autorizada. Ausência de uma representação adequada não pode ser
ocultada por uma equivalência fictícia.

## Fluxo e unidades de decisão

O fluxo conceitual é:

```text
fontes e objetivo
  → análise instrucional
  → parâmetros efetivos
  → seleção e composição de resources disponíveis
  → blueprint contextual
  → teoria, prática e cards
  → manifesto de materialização
  → auditoria, reparo e resultados
```

O **blueprint pedagógico v2** continua sendo o plano contextual de uma
microssequência. A análise não o substitui nem antecipa automaticamente seus
passos: ela explicita unidades, relações, pressupostos e requisitos que o
blueprint precisa transformar em progressão concreta. Não há calibração
pedagógica global que determine todas as microssequências.

A **Parte** continua sendo unidade operacional de coordenação humano–modelo em
cursos extensos. Ela agrupa trabalho manejável segundo coesão, dependências,
complexidade das microssequências e carga de revisão. Parte não é unidade
pedagógica, não é definida por número fixo de cards e não integra a cadeia de
resolução dos parâmetros.

Cards, palavras, caracteres e total de resources só existem como métricas
derivadas depois da materialização. Não comandam a decomposição do objetivo.

### Integração progressiva no GPT

O system prompt conserva apenas protocolo, invariantes e disciplina de uso das
ferramentas. Definições, critérios, exemplos e contraexemplos ficam em chunks
recuperáveis de knowledge; MCP e Action leem e escrevem o estado autorizado; o
workspace persiste o resultado canônico. Nenhuma dessas camadas usa a conversa
como banco de dados.

Depois do planejamento estrutural — e da aprovação, quando o mandato ou uma
decisão material exigir —, `gerirDesenhoInstrucional` opera uma
microssequência por vez. Dentro da Parte autorizada, a conclusão de uma unidade
não cria nova parada automática:

```text
read_slice
  → knowledge JIT
  → save_analysis
  → bootstrap/save_resource_set quando Auto precisar de conjunto novo
  → set_parameter
  → resolve_effective
  → descoberta restrita pelo snapshot
  → save_blueprint
  → composição dos cards em memória
  → validate_card + audit_representation
  → persistência e releitura
  → register_manifest
```

O bootstrap por facetas congela referências exatas antes do assignment que as
referencia, mas ainda não autoriza seleção. A autoridade do conjunto começa no
snapshot efetivo. Overrides manuais e locks de pesquisa já persistidos não são
substituídos por Auto; uma mudança em linguagem natural é traduzida para o
mesmo assignment estruturado, sem pedir JSON ou ids técnicos.

## Parâmetros defensáveis como operacionalizações

Os parâmetros abaixo são candidatos de desenho do AraLearn. Nenhum deles é uma
escala científica validada.

| Dimensão | Representação apropriada | Unidade ou denominador explícito | Interpretação permitida | Interpretação proibida |
| --- | --- | --- | --- | --- |
| novidade presumida | categoria por unidade e contagem derivada | unidades presumidas novas por passo teórico | verificar se o plano introduz muitas unidades novas no mesmo passo | medir carga cognitiva, inteligência ou dificuldade pessoal |
| coordenação simultânea | hipergrafo de conjuntos e cardinalidade derivada | unidades que precisam ser coordenadas por conjunto | localizar relações que não podem ser fragmentadas | produzir score universal de complexidade |
| explicação requerida | conjunto de categorias ligado a unidades e relações | requisitos aplicáveis e referências cobertas | auditar se definição, mecanismo ou limite prometido foi desenvolvido | somar itens como nota de qualidade |
| evidência pretendida | relação alvo–operação–tarefa–forma de desempenho | requisitos de evidência atendidos por referência | comparar objetivo e prática observável | declarar domínio ou validar o instrumento |
| oportunidades de prática | faixa numérica e assinaturas semânticas distintas | oportunidades distintas por requisito de evidência | planejar repetição e variação deliberadas | tratar repetição cosmética como dosagem ou aprendizagem |
| variação | vetor ou relação de dimensões alteradas e invariantes | casos, contextos, representações e operações declarados | verificar o que realmente varia entre oportunidades | colapsar diversidade num score sem modelo validado |
| apoio | vetor ordenado de formas presentes e retiradas | apoio por etapa e requisito de evidência | descrever uma progressão contextual | presumir que menos apoio é sempre melhor |
| fidelidade | categorias e conjuntos de formas de desempenho aceitas | aspectos preservados, ausentes e ambiente requerido | declarar o que a tarefa permite observar e sua limitação | usar escala ordinal universal de autenticidade |
| disponibilidade de resources | conjunto exato de `package@version` | membros permitidos no escopo | restringir de modo reproduzível as opções de seleção | tratar disponibilidade como seleção ou uso |

Quando uma grandeza numérica for usada, seu nome, unidade, denominador, escopo,
algoritmo e versão precisam acompanhar o valor. Limites como “até *n* unidades
presumidas novas por passo” ou “entre *a* e *b* oportunidades distintas por
requisito” são políticas locais e hipóteses ajustáveis, não constantes da
aprendizagem humana.

## Contratos operacionais

Seis documentos fechados separam responsabilidades:

| Documento | Responsabilidade | Não deve conter ou substituir |
| --- | --- | --- |
| `InstructionalAnalysis` | fontes, objetivo, unidades, estado prévio presumido, relações, conjuntos de coordenação e requisitos de explicação, evidência, variação, fidelidade e representação | cards, contagem-alvo de cards, diagnóstico individual ou passos finais do blueprint |
| `DesignParameterDefinition` | identidade, tipo (`integer`, `range`, `enum`, `set`, `vector` ou `relation`), unidade, escopos válidos, regra de resolução, estatuto científico e limites | valor efetivo de uma microssequência ou alegação de validade |
| `DesignParameterAssignment` | valor explícito proposto em `auto`, aplicado por `manual_override` ou imposto por `research_lock`, com escopo, autoridade e proveniência | “herdado” como intenção; herança é resultado da resolução |
| `EffectiveDesignSnapshot` | conjunto compacto e imutável de valores resolvidos, com definições, atribuições, referências e proveniência exatas | snapshot restaurável do workspace, conversa ou raciocínio privado |
| `MaterializationManifest` | vínculo entre plano, conteúdo realmente produzido, cobertura, resources usados, limitações e métricas derivadas versionadas | publicação, avaliação de estudante ou auditoria semântico-instrucional concluída |
| `ResourceSet` | disponibilidade permitida como conjunto versionado de `package@version`, escopo, proveniência e restrições de seleção | escolha local de package, instância materializada, lock de pesquisa ou cópia dos contracts dos packages |

A revisão derivadora da análise identifica o estado que foi analisado; a
revisão do snapshot identifica o CAS posterior em que parâmetros e
disponibilidade foram resolvidos. Ela pode avançar após assignments ou
`ResourceSet`s, mas nunca antecede a análise. A versão da entidade pedagógica
permanece igual; mudança de conteúdo torna a análise stale.

Uma definição de parâmetro pode admitir herança entre workspace, curso, módulo,
lição e microssequência, mas o valor efetivo pertence ao escopo resolvido. Atribuição
manual e lock de pesquisa têm autoridades diferentes: uma condição de pesquisa
não pode ser alterada pelo modelo porque outra opção pareça melhor.

O resolvedor aplica primeiro a classe de autoridade: `research_lock` como gate,
depois `manual_override`, `auto` e default. Dentro da mesma classe, usa o
ancestral aplicável mais próximo e substitui o valor completo; duas atribuições
correntes do mesmo modo no mesmo escopo produzem conflito explícito. Assim, um
override manual deliberado não é apagado por uma nova sugestão Auto mais local.
Conjuntos também são valores completos, não deltas combinados pela ordem
acidental de objetos. Locks de pesquisa são verificados antes de qualquer
substituição inferior.

A cadeia v1 é fechada:

```text
workspace → course → module → lesson → microsequence
```

O servidor deriva essa ancestria da árvore corrente. Parte não aparece nela.
Cada modo (`auto`, `manual_override` ou `research_lock`) conserva valor explícito;
`local` ou `inherited` é proveniência do resultado, não outro modo. Definição
requerida sem assignment ou default aplicável permanece não resolvida.

O blueprint pedagógico continua no contrato v2. Um
`PedagogicalBlueprintBinding@1` referencia análise e snapshot e liga suas
unidades e requisitos às camadas, demandas, respostas, teoria e prática do
blueprint. O binding exige cobertura fechada das seções, mas não copia nem
substitui o plano.

A referência versionada identifica a versão imutável do **objeto** blueprint
(por exemplo, `1.0.0`); `blueprintContractVersion: 2` identifica separadamente
o formato pedagógico validado. Esses números não são intercambiáveis.

## `ResourceSet`: disponibilidade não é escolha

Um `ResourceSet` identifica exatamente quais versões de packages podem ser
consideradas num escopo. Ele pode ser composto por seleção facetada, mas a
expansão precisa resultar num conjunto versionado e reproduzível. Há três
estados distintos:

1. **disponível**: o `package@version` pertence ao conjunto permitido;
2. **selecionado**: o planejamento escolheu localmente o package por estrutura,
   operação, adequação, contraindicações e limitações;
3. **materializado**: uma instância concreta do package apareceu no conteúdo
   produzido.

Cada seleção identifica o `ResourceSet` versionado que a autorizou. Package,
ajuste e papel são verificados nesse mesmo conjunto; permissões de conjuntos
diferentes não são unidas artificialmente. A instância materializada referencia
a seleção correspondente.

`canonical`, `versatile` e `substitute` continuam qualificando o ajuste
calculado pelo catálogo; não significam que membros de um conjunto sejam
equivalentes. Se nenhum package disponível preservar a representação
necessária, a política do conjunto bloqueia ou registra a lacuna e suas
consequências. O modelo não seleciona fora do conjunto e não apresenta
substituição como equivalência.

Na operacionalização v1, `block` rejeita `versatile` e `substitute`;
`allow_versatile_with_limitation` pode admitir `versatile`, sempre com
limitação, e rejeita `substitute`; `allow_substitute_with_limitation` pode
admitir ambos, também com limitação. O `ResourceSet` autorizador ainda pode ser
mais restritivo. `canonical` não recebe limitação artificial. A intenção
representacional precisa estar explícita no blueprint/auditoria; o sistema não
inventa falta nem atribui equivalência.

No catálogo remoto, `explore` e `search` permanecem compactos, `inspect` aceita
até oito candidatos e `contracts` entrega exatamente uma versão por chamada.
Com `workspaceId` e `snapshotRef`, a consulta só enxerga os packages permitidos;
sem esse contexto, o modo legado irrestrito não demonstra conformidade com o
desenho parametrizado.

Esse desenho permite condições experimentais com bibliotecas diferentes sem
obrigar o pesquisador a escolher manualmente o resource de cada card. O
algoritmo local continua selecionando entre os membros permitidos; conjunto,
seleção e uso real permanecem auditáveis separadamente.

## Manifesto e métricas derivadas

O manifesto compara intenção e realização por referências exatas, não por uma
nota agregada. Ele pode registrar:

- cobertura de unidades e requisitos, com numerador, denominador e referências;
- passos planejados e cards que os materializaram;
- assinaturas semânticas das oportunidades de prática, para que mudança
  superficial não infle a contagem;
- `package@version` selecionado e realmente usado, seu ajuste e limitações;
- divergências entre `ResourceSet`, seleção e materialização;
- quantidades de cards, palavras, caracteres e resources como observações
  derivadas, com algoritmo e versão.

Cobertura completa demonstra somente que referências exigidas foram
encontradas segundo a regra declarada. Ainda são necessários julgamento
semântico-instrucional, revisão humana e, quando a pergunta for educacional,
avaliação empírica.

O `InstructionalMaterializationDiff@1` automatiza apenas a comparação factual:
compatibilidade entre referências e escopos, passos ausentes ou extras,
divergências de tipo ou unidades no mesmo passo, cobertura declarada, seleções
sem instância, instâncias sem seleção e diferenças de package ou papel entre o
selecionado e o usado. Ele conserva denominadores e listas de referências, não
produz score e não decide se uma explicação foi de fato suficiente ou se a
prática mede a operação pretendida.

A [auditoria de conformidade instrucional](auditoria-de-conformidade-instrucional.md)
parte desse diff, mas relê também os cards e as instâncias reais. Ela separa
fatos determinísticos, julgamento semântico, decisão humana e efeito
educacional; registrar o manifesto não é apresentado como conclusão de
conformidade.

## Projeção no aplicativo

A interface não apresenta os nomes dos contratos deste capítulo como
pré-requisito de operação. Em **Desenho**, cada linha mostra rótulo humano,
valor efetivo, unidade ou categoria pertinente e origem compacta: Auto,
herdado, definido pelo autor ou bloqueado por pesquisa. O controle aceita apenas
valores estruturados já declarados; não há textarea pedagógica nem edição de
JSON.

**Resources** é a projeção de disponibilidade. A primeira camada mostra o
resumo. Ao abrir, páginas e filtros por famílias/facetas permitem inspecionar
centenas de packages sem enviá-los de uma vez nem exigir IDs. Quando existem
múltiplos `ResourceSet`s efetivos, a pessoa escolhe um conjunto exato; a UI não
une permissões. Seleções invisíveis são conservadas entre pesquisa e paginação,
e a aplicação pode ter escopo de curso, lição, microssequência ou conjunto de
microssequências. O GPT continua escolhendo o package de cada card dentro da
disponibilidade permitida.

Mapa e lista de Workspaces consomem projeções compactas revisionadas. O estado
de análise/materialização/finding não depende de ter aberto antes uma fatia no
dispositivo. Esses rótulos descrevem o processo autoral; não constituem score
pedagógico nem medida de aprendizagem.

## Persistência, concorrência e retomada

PostgreSQL é a autoridade compartilhada. Definições, análises, assignments,
`ResourceSet`s, snapshots efetivos, blueprints e manifestos são normalizados e
versionados. Suas tabelas raiz rejeitam atualização in-place; o binding corrente
da microssequência é a única projeção mutável. Uma nova versão preserva a
proveniência anterior; uma remoção de assignment é outra entrada append-only.

Cada mutação reavalia capacidade e usa revisão esperada, hash do pedido e chave
idempotente. A resolução e as gravações de snapshot, blueprint e manifesto são
atômicas com a revisão do workspace. O manifesto referencia exatamente uma
análise, um snapshot efetivo e um blueprint, além das revisões e hashes do
conteúdo materializado.

No IndexedDB, `WorkspaceDesignOfflineStore` reutiliza `syncState` para fatias
por conta, workspace e microssequência. A última fatia `remote_synced` pode ser
lida sem rede. Uma intenção de override manual ou restauração de Auto fica em
fila separada e nunca modifica o snapshot canônico. Ao reconectar, revisão,
capacidade e locks são relidos antes do envio; `ResourceSet`, condição e lock de
pesquisa não podem ser criados ou alterados offline.

A fila é indexada para sincronização limitada na reconexão e na saída, sem
depender de reabrir a microssequência. Set seguido de Auto antes da primeira
tentativa é coalescido no mesmo slot. Cache de lista e overview só avança por
revisão; falha ao escrever o cache não converte uma resposta remota válida em
falha da operação.

Workspaces anteriores permanecem explicitamente `unresolved` para análise. Se
já houver conteúdo sem manifesto, materialização fica `legacy_untracked` e
disponibilidade, `legacy_unrestricted`; sem conteúdo, ambas ficam `unresolved`.
Não há backfill silencioso, inferência retroativa nem `ResourceSet` fictício.

Os limites técnicos atuais incluem 256 KiB por análise, 64 KiB por definição ou
valor parametrizado, até 4.096 packages por `ResourceSet`, 512 KiB por blueprint
e 1 MiB por manifesto. No dispositivo, cada fatia admite 2 MiB e cada fila
512 KiB ou 100 operações; o cache reconstruível de desenho usa até 32 MiB por
workspace e remove primeiro a fatia mais antiga. Esses números protegem a
operação; não determinam quantidade de conteúdo, cards ou resources.

A coleta relacional usa por padrão corte de 180 dias e lotes de 256. Só remove
versões substituídas e sem referência; assignments usados em snapshot,
blueprints ou snapshots ligados, análises referenciadas e `ResourceSet`s usados
permanecem. Manifestos não são coletados por idade na #103. A [medição pública
do cenário de 500 microssequências](evidence/parameterized-authoring-storage-budget-2026-08-15.json)
registra o payload JSON observado e suas exclusões.

## Validação e agenda empírica

O modelo deve ser tensionado por cenários de domínios diferentes, incluindo
conceito verbal, estrutura formal, procedimento, sistema relacional, tarefa
profissional e coordenação entre representações. Fixtures e testes podem
verificar fechamento de referências, tipos não escalares, versionamento,
distinção entre disponibilidade e uso e derivação reproduzível de métricas.

Na sequência de Autoria, cada issue executa testes proporcionais ao seu escopo:
a #103 concentra contratos, resolvedor, binding, persistência SQL e offline; a
#104 cobre seleção JIT de knowledge, prompts, MCP/Action, acesso ao catálogo e
os cenários A–H como regressão de engenharia. A
regressão integral de código, banco, integrações, UI e artefatos distribuídos é
concentrada no fechamento da #109. Falha focada não é adiada; ausência de uma
suíte transversal numa etapa intermediária não deve ser descrita como suporte
que ainda não foi integrado.

Permanecem perguntas empíricas:

- autores compreendem e corrigem as unidades e relações propostas?
- limites locais de novidade e coordenação ajudam a encontrar compressão sem
  promover fragmentação?
- requisitos de explicação e evidência melhoram a correspondência entre teoria
  e prática?
- assinaturas de oportunidade distinguem variação substantiva de repetição
  cosmética?
- `ResourceSet` permite comparar condições sem produzir falsa equivalência
  representacional?
- a parametrização continua simples e compreensível em celular e desktop?

Responder a essas perguntas exige protocolo, participantes, tarefas,
instrumentos, análise e limites declarados. Conformidade de schema, aprovação
do build ou quantidade de cards não responde a nenhuma delas.
