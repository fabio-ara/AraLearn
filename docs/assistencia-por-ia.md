# Assistência por modelo de linguagem

O AraLearn usa modelos de linguagem como instrumentos de autoria, não como
fontes automáticas de verdade. A pessoa descreve a intenção; um cliente
conectado lê o Curso vivo, propõe uma operação tipada e pede confirmação quando
necessário; domínio e PostgreSQL determinam o que pode ser gravado.

Essa divisão resolve um problema concreto. Linguagem natural é adequada para
planejar e revisar, mas pode ser ambígua, ultrapassar o alvo pedido ou produzir
estrutura inválida. O modelo não recebe autoridade por gerar JSON plausível.

## Capacidade corrente

Nesta revisão, a assistência acessível de ponta a ponta é a **Autoria por MCP**
sobre Curso próprio. A interface visual pode copiar o pedido de uma Parte para
o chat conectado, mas copiar texto:

- não inicia uma tentativa;
- não materializa conteúdo;
- não muda o status da Parte;
- não persiste conversa ou raciocínio.

A Inspeção continua sendo leitura fiel, com respostas e edição direta
desativadas. Quando um achado autoriza reparo, porém, o ciclo de auditoria pode
propor e aplicar uma correção focal no conteúdo e nas atribuições exatas de
Fontes de uma Unidade existente. Esse fluxo não é um editor livre: não cria,
remove, move ou reorganiza entidades.

## Uma realidade compartilhada

A interface e o MCP operam o mesmo Curso no PostgreSQL. Não existe workspace,
publicação ou cópia paralela criada só para a conversa. O fluxo normal é:

1. localizar um Curso próprio;
2. ler a projeção necessária e sua revisão;
3. apresentar uma proposta compreensível;
4. chamar uma operação fechada com as versões esperadas;
5. receber o recibo e reler o estado;
6. conferir o resultado na Autoria e, quando pertinente, em Estudo.

O [guia de Autoria por MCP](autoria-mcp.md) descreve as ferramentas e os
argumentos completos.

## Seleção de contexto

O cliente não deve carregar o Curso inteiro por conveniência. `lerCurso`
oferece projeções distintas:

- `summary` para identidade e cabeçalho;
- `outline` para hierarquia compacta;
- `instructional_plan` para plano, Partes, vínculos e atividade recente;
- `course_design` para parâmetros, orientações e política de componentes no
  escopo escolhido e, numa Microssequência, os itens do plano atribuídos;
- `course_sources` para Fontes, revisões, Âncoras e atribuições;
- `anchored_annotations` para Observações em caixa de entrada, alvo ou detalhe;
- `audit_cycle` para contexto focal, achados, rodadas e detalhe de exatamente um
  achado ou uma rodada;
- `part_materialization` para retomar uma tentativa e suas etapas;
- `study_units` para inspecionar Unidades em ordem curricular;
- `entities` para uma página estrutural sob revisão fixada.

Para revisar conteúdo, `study_units` mantém paridade com a Inspeção visual. O
cliente escolhe Curso, Parte, Unidades sem Parte, Módulo, Lição ou
Microssequência, usa uma âncora inclusiva para entrada ou restauração e cursores
para continuar para frente ou para trás. Âncora e cursor não coexistem.

Conteúdo adjacente pode ser necessário para coerência, mas leitura não concede
escrita. A operação enviada continua limitada ao Curso próprio, à revisão
esperada e às identidades explicitamente incluídas no comando.

Em `audit_cycle`, achados e rodadas são paginados e aceitam filtro opcional por
Unidade. A lista de rodadas também enumera execuções limpas, sem achados. O
detalhe por `auditRunId` entrega todos os checks e suas evidências; no modo
`detail`, `findingId` e `auditRunId` são mutuamente exclusivos.

## Autoridade e confirmação

As regras correntes são estreitas:

- somente o proprietário vê o Curso na Autoria e no MCP autoral;
- acesso direto concede somente Estudo;
- OAuth identifica a pessoa, mas não substitui a checagem de propriedade;
- mutações exigem escopo de escrita;
- conceder ou revogar acesso exige confirmação humana explícita;
- aplicar uma correção ou executar rollback exige confirmação humana explícita;
- identificadores fornecidos pelo cliente nunca ampliam autoridade.

Uma decisão pedagógica não deve ser escondida num lote. O cliente apresenta o
efeito pretendido em linguagem natural e separa alteração do plano de alteração
da composição.

## Operações de autoria

### Plano e Partes

O plano é alterado por comandos semânticos: atualizar campos naturais, gerir
itens, criar ou reorganizar Partes e mover vínculos de Microssequência. Título e
objetivo continuam pertencendo à raiz do Curso. Reorganizar uma Parte não apaga
conteúdo didático.

### Parâmetros, orientações e componentes

O desenho é lido e alterado por escopo. Parâmetros possuem valores efetivos e
proveniência visível; orientações preservam o texto original e uma
interpretação estruturada separada; a política de componentes distingue
disponibilidade, exclusão e preferência. Defaults são hipóteses de produto, e
uma atribuição automática precisa de justificativa. Nenhuma automação
sobrescreve silenciosamente uma decisão explícita.

Unidades de análise e requisitos de evidência são atribuídos explicitamente a
cada Microssequência. `targetPlanItems` mostra as duas listas no alvo, e
`set_target_plan_items` as substitui de forma atômica. Essa relação
muitos-para-muitos impede que uma etapa seja obrigada a declarar cobertura de
itens destinados a outra Microssequência.

### Composição

A composição usa o contrato `aralearn.course.v1`, coleção `studyUnits` e
discriminador persistido `study_unit`, sem alias. A escrita é segmentada. Cada
linha é validada conforme
`module|lesson|topic|microsequence|study_unit`, e o banco verifica dependências
somente nas Lições afetadas pelo lote.

Packages são descobertos progressivamente por
`consultarComponentesDidaticos`:

1. `explore` apresenta famílias e facetas;
2. `search` encontra candidatos por intenção;
3. `inspect` compara poucos packages;
4. `contracts` entrega o contrato exato;
5. `validate_study_unit` valida `studyUnitJson`;
6. `audit_representation` confronta intenção e composição;
7. `preview_study_unit` prepara a inspeção fiel.

A validação comprova forma, referências e compatibilidade. Ela não comprova
verdade científica, adequação ao público ou eficácia educacional.

### Materialização retomável

Uma Parte pode ter tentativa persistida com etapas pequenas. Iniciar, registrar
etapa e finalizar são operações explícitas. Ao iniciar, o servidor resolve e
sela os parâmetros, as revisões de orientação e a política efetivos; o cliente
não declara esse contexto. O selo inclui enunciado e versão dos itens
atribuídos, e cada etapa é auditada somente contra o subconjunto do seu alvo.
Uma etapa de Microssequência confirma entidades, vínculo, fatos limitados de
aplicação, evento e recibo na mesma transação. Formas, oportunidades e
variações continuam sendo declarações validadas internamente; a reconciliação
material do banco cobre IDs de Unidades, pai/alvo e `componentRefs`. O próximo
passo vem do estado persistido, não da memória da conversa.

### Auditoria, correção e verificação

Uma rodada confronta uma Unidade focal nas dimensões estrutural, pedagógica,
factual e editorial. A interface envia exatamente três checks humanos; o servidor
acrescenta o check estrutural determinístico e limita o total a 32. Resultados
são `passed|failed|uncertain|not_applicable|not_checked`. A rodada é imutável e
continua enumerável mesmo sem achado.

Um achado não altera o Curso. Seus estados são
`open|awaiting_verification|resolved|dismissed`, e suas decisões são novas
versões. A correção v1 atua somente na Unidade focal: pode substituir seu
conteúdo e seu conjunto completo e ordenado de Fontes, preserva `topics`
legítimos e não cria, exclui, move, reposiciona ou troca o pai. Proposta,
rejeição, aplicação, verificação e rollback são fatos separados. Aplicação e
rollback usam checkpoint `before|after`, CAS e a mesma autoridade de recibos do
Curso; somente essas duas operações criam `course_events`.

Verificar exige outra rodada. `resolved` só é válido quando o critério focal
passou; `still_open` reabre o achado. Para resultado factual positivo ou
resolução factual, a evidência precisa apontar Fonte e Âncora ativas e exatas.
`supported_by` sustenta afirmações; `quoted_from` só serve ao critério
`quotation_fidelity`.

O MCP mantém seis ferramentas. `alterarCurso update_audit_cycle` recebe sete
comandos: registrar auditoria, propor ou rejeitar correção, decidir achado,
aplicar correção, verificar achado e executar rollback. O campo
`auditCommand.confirmed: true` é aceito apenas na aplicação e no rollback; os
outros cinco comandos o recusam, e o transporte o remove antes do domínio.
Sugestões de resolver ou reabrir uma Observação são apenas ações sugeridas:
exigem um comando explícito e versionado da capacidade de Anotações.

## Concorrência e repetição segura

Cada mutação informa `expectedRevision`; plano, Parte, tentativa ou etapa usam
também suas versões específicas. O PostgreSQL aplica compare-and-swap (CAS): se
o estado mudou desde a leitura, a escrita é recusada e o cliente precisa reler e
reconciliar.

`requestId` identifica uma intenção dentro da janela de retenção. Repetir o
mesmo pedido e o mesmo conteúdo recupera o recibo; reutilizar a chave com outro
conteúdo é conflito. Um no-op não avança revisão nem cria atividade falsa.

## Persistência, offline e privacidade

Alterações autorais exigem servidor disponível e revisão corrente. Não existe
outbox universal de Autoria. Sem conexão, a pessoa pode estudar conteúdo já
carregado e a Inspeção pode reutilizar somente uma página exata em cache,
marcada offline ou desatualizada; isso não autoriza mutação.

Auditoria, achados e correções são online-only. Não possuem store, cache
autoritativo ou outbox no IndexedDB; esse limite não remove o cache e a outbox
próprios das Observações.

Prompt, resposta e raciocínio do cliente não são persistidos como estado do
Curso. O produto conserva somente dados confirmados, eventos pequenos e recibos
temporários necessários à operação. O cliente e o provider continuam sujeitos
a seus próprios termos, retenção e localização de dados.

## Limites proporcionais

Limites impedem que contexto amplo vire carga irrestrita:

- pedido do transporte: até 1 MiB;
- lote geral de composição: até 200 itens;
- etapa de materialização: até 64 mudanças e 256 KiB;
- plano: até 192 vínculos e alvo de 512 KiB;
- Inspeção: 12 itens por padrão, 24 no máximo e resposta de até 1,75 MiB.
- páginas e resultados do ciclo de auditoria: até 240 KiB; comando: até
  192 KiB; página: até 24 itens e cursor opaco de até 240 caracteres;
- contexto: até 12 Observações selecionadas; rodada: até 16 achados e 32 checks
  após a inclusão estrutural do servidor;
- checkpoint: snapshot de até 48 KiB por lado e conjunto `before|after` de até
  96 KiB; recibo: até 64 KiB;
- retenção delimitada: até 256 rodadas por Curso, com reserva para correções
  aplicadas, 1.024 identidades de achado e 64 correções por Curso, no máximo
  oito por achado; projeções de históricos também são limitadas.

Essas cercas reduzem risco de memória, transação e egress, mas não demonstram
que o Free Plan sustenta uso prolongado. Essa afirmação depende de medição real.

## Validação não é avaliação pedagógica

O sistema verifica schema, identidades, posições, hierarquia, dependências,
packages, slots, referências e autoridade. Ele não prova que uma explicação é
verdadeira, suficiente ou adequada. Recomendações de interação humano–IA
enfatizam visibilidade, controle e possibilidade de correção
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). A
responsabilidade factual e pedagógica continua humana, conforme também
recomendado para IA generativa em educação
([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Verificação

Os testes comuns usam respostas determinísticas e não consomem APIs pagas. A
verificação focal deve cobrir OAuth, autorização owner-only, schemas MCP,
roteamento comum à interface, CAS, idempotência, validação por tipo, paginação
de `study_units`, enumeração de rodadas limpas, detalhe de rodada, correção
focal, nova rodada de verificação, rollback e PostgreSQL real. Um teste aprovado
demonstra somente o cenário codificado; não avalia qualidade educacional do
conteúdo produzido.
