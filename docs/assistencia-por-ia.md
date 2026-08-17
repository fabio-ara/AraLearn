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

A edição contextual dentro de uma Unidade de estudo ainda não está integrada à
superfície canônica de Curso. Contratos de package continuam delimitando textos
editáveis e alvos de prática, mas isso não deve ser apresentado como uma ação
disponível na Inspeção: ali, respostas e edição ficam desativadas.

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

## Autoridade e confirmação

As regras correntes são estreitas:

- somente o proprietário vê o Curso na Autoria e no MCP autoral;
- acesso direto concede somente Estudo;
- OAuth identifica a pessoa, mas não substitui a checagem de propriedade;
- mutações exigem escopo de escrita;
- conceder ou revogar acesso exige confirmação humana explícita;
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
etapa e finalizar são operações explícitas. Uma etapa de Microssequência pode
confirmar entidades, vínculo, fatos, evento e recibo na mesma transação. O
próximo passo vem do estado persistido, não da memória da conversa.

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
de `study_units` e PostgreSQL real. Um teste aprovado demonstra somente o
cenário codificado; não avalia qualidade educacional do conteúdo produzido.
