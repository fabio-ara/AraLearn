# Experimentos instrucionais parametrizados

## Finalidade e limite

O AraLearn permite preparar comparações reproduzíveis entre variantes de um
mesmo curso sem transformar parâmetros de desenho, `ResourceSet`s ou rastros de
uso em resultados de aprendizagem. Um experimento registra uma hipótese, uma
base comum, condições explícitas, invariantes, uma regra de atribuição e
referências de instrumentos. Coleta, análise e exportação de resultados
pertencem à etapa de Resultados/Analytics e não são inferidas pelo desenho.

Esta fronteira separa quatro fatos:

- **permitido:** o valor ou `package@version` autorizado pela condição;
- **selecionado:** a decisão registrada no blueprint;
- **materializado:** o conteúdo e os resources realmente presentes nos cards;
- **observado:** um outcome produzido por instrumento e procedimento
  governados, nunca deduzido dos três itens anteriores.

## Autoridade

A capacidade `research` é própria do workspace e, na versão atual, pertence a
proprietários e administradores. Ela não é inferida pelo papel na interface e
não é substituída silenciosamente por `manage`.

Somente o control plane experimental do servidor cria, remove ou substitui
`research_lock`. O editor comum de parâmetros e o GPT não podem fabricar uma
condição, trocar uma pessoa de variante, escolher uma seed, registrar
consentimento, congelar uma revisão ou iniciar coleta. O GPT recebe apenas o
contexto já autorizado da variante e pode materializar conteúdo ou classificar
semanticamente diferenças sob mandato exato.

As mutações humanas usam uma action exclusiva do aplicativo. Ela não é uma
ferramenta MCP nem um path adicional no OpenAPI. Assim, a lista pública continua
compacta e a descoberta por um cliente externo não oferece operações de
protocolo, participantes ou atribuição.

## Objetos e proveniência

```text
Experiment
  -> ProtocolRevision
      -> BaseRevision
      -> Factor + explicit Conditions
      -> frozen ScopeMembers + Invariants
  -> Variant -> VariantRevision -> private child workspace/course
      -> research locks -> snapshots -> materialization -> audit
      -> factual diff -> semantic classification -> human decision
      -> frozen course artifact
  -> Enrollment + consent
      -> append-only ParticipantAssignment -> exact VariantRevision
```

`Experiment` conserva a identidade estável e o estado do estudo. Uma
`ProtocolRevision` é imutável e referencia definições ordinárias de parâmetro;
não cria parâmetros paralelos “de pesquisa”. Cada condição informa o valor de
todos os fatores. Adicionar dois fatores nunca gera automaticamente um produto
cartesiano: somente as combinações declaradas existem.

`BaseRevision` aponta para uma publicação privada aprovada, sua revisão, hash
de conteúdo e referências de desenho e auditoria. Uma revisão corrente do
workspace, sozinha, não é histórico reproduzível. O servidor deriva cada
`VariantRevision` dessa mesma base, em um workspace filho privado, e conserva o
mapeamento de escopo. IDs pedagógicos podem ser preservados porque sua
identidade é local ao workspace.

Se a conta autora da base for excluída depois desse pin, a publicação-base é
anonimizada e permanece privada como evidência experimental. Ela não entra no
catálogo nem em Trilhas e só pode ser reutilizada por outra pessoa com
capacidade `research` no workspace. Isso preserva a correção/regeneração sem
alterar a cascata aplicada aos cursos privados comuns.

O curso privado da revisão nasce com o artefato comum da base. Mudanças da
condição acontecem somente no workspace filho. O congelamento fixa o artefato
final, os snapshots, manifestos, auditorias e diferenças decididas. Depois do
freeze, nenhuma escrita altera aquela revisão; uma correção cria outra
`VariantRevision` e exige decisão explícita sobre a continuidade da coleta.

## Fatores, condições e `ResourceSet`

Um fator aponta para uma `DesignParameterDefinition@version` existente e usa o
tipo, a unidade, o domínio e os escopos dessa definição. Valores escalares,
intervalos, enums, conjuntos, vetores e relações mantêm sua semântica original.
Rótulos como “baixo” e “alto” não substituem um valor mensurável ou categoria
governada.

`available_resource_set_refs` torna `ResourceSet` fator categórico de primeira
classe. Cada condição referencia conjuntos versionados e, portanto, membros
exatos `package@version`. A disponibilidade permitida não prova seleção nem
uso. Antes do freeze, a auditoria confronta a condição com os resources reais
dos cards; package externo, papel incompatível, versão diferente ou fallback
não autorizado bloqueiam a revisão. A falta de representação ideal permanece
limitação explícita e não vira equivalência.

Os `research_lock`s são assignments ordinários ligados à revisão de protocolo
e à condição. Eles respeitam a resolução por escopo já existente e impedem
override inferior. Sua proveniência canônica identifica experimento, protocolo
e condição; texto livre ou autoridade do cliente não cria um lock válido.

## Ciclo operacional

O fluxo humano é progressivo e fica dentro de **Desenho**:

```text
salvar rascunho
-> validar base, escopo, fatores, condições e instrumentos
-> gerar workspaces de variante a partir da base comum
-> materializar sob locks e auditar cada variante
-> comparar diferenças factuais e semânticas
-> corrigir, aceitar ou invalidar diferenças não previstas
-> congelar cada revisão de variante
-> se necessário, solicitar outra revisão sem alterar a congelada
-> iniciar, pausar, encerrar ou invalidar a coleta
```

Validar não materializa. Gerar não congela. Auditar não decide. Freeze não
inicia coleta. Cada transição usa CAS, request ID e replay idempotente; o replay
é consultado antes de currentness ou autoridade que possam ter mudado depois da
resposta original.

Uma correção descoberta depois do freeze usa `request_correction` sobre a
`VariantRevision` exata, com motivo público, CAS do experimento e do workspace
filho e confirmação `retain_existing`. A revisão e as atribuições já entregues
permanecem imutáveis; novos ingressos aguardam a nova revisão, e comparações
posteriores que dependiam da variante corrigida precisam ser refeitas. A
interface não oferece edição direta do artefato congelado.

O diff separa:

- `directly_required`: mudança exigida pelo valor do fator;
- `inevitable_derived`: consequência derivada e justificada da mudança
  requerida;
- `accidental_unplanned`: divergência que não estava no protocolo.

O backend compara identidades, valores, hashes, refs, ordem e resources reais.
Interpretação semântica registra evidência pública curta, sem cadeia de
pensamento. Uma pessoa com capacidade de pesquisa decide corrigir, aceitar a
divergência como parte da condição ou invalidar a variante.

Cada decisão também identifica a `differenceRunRef` e a `differenceRef`. O
mesmo hunk factual pode aparecer legitimamente em rodadas ou condições
diferentes sem transformar sua decisão em autorização global.

### Limites operacionais

O protocolo completo sanitizado possui teto de **60.000 bytes UTF-8**. Os
limites de 8 fatores, 500 alvos por fator, 32 condições, 32 referências de
instrumento e 32 de outcome são máximos de cada campo e não uma promessa de
que todos caibam juntos. O teto do documento prevalece; a interface precisa
carregar as páginas sob o mesmo pin e nunca salvar uma versão truncada. Quando
o escopo não couber, divide-se o experimento de forma explícita.

O contexto público pagina, sob referências imutáveis, alvos de fatores, locks,
`ResourceSet`s, caminhos e rodadas de diferença, com até 20 itens por página.
Uma rodada factual aceita no máximo 5.000 hunks e os persiste em páginas de 20.
Cada invocação registra no máximo 40 páginas e devolve progresso retomável;
repetir a operação consulta a primeira página ausente, sem reaplicar o prefixo.
Esses limites protegem payload e tempo de execução e não possuem significado
pedagógico ou estatístico.

## Participação, atribuição e privacidade

Participante não se torna membro do workspace autoral. Um enrollment online
registra a política e a revisão de consentimento aceitas e cria um pseudônimo
local ao experimento; o vínculo com a conta é anulável. Leituras de pesquisa e
o MCP não expõem conta, roster, seed, consentimento individual ou outcomes.

A atribuição é server-authoritative, única e append-only para cada enrollment:

- `manual`: a pessoa pesquisadora escolhe uma condição válida;
- `seeded_random`: algoritmo versionado aplica uma seed privada ao pseudônimo;
- `balanced_simple`: uma transação escolhe a menor contagem e usa desempate
  determinístico.

Nenhuma regra troca silenciosamente uma atribuição existente. O recibo fixa a
`VariantRevision`, o curso e o hash do artefato. A conta recebe somente a
seleção privada desse curso, não as outras condições nem a base autoral.

Uma variante já atribuída pode ser estudada offline pelo mecanismo normal de
Trilhas. Criar enrollment, atribuir, trocar revisão ou decidir continuidade
exige o servidor. Reconectar não muda a condição; revogação de acesso impede
novas leituras e sincronizações conforme a política vigente.

## Interface e acessibilidade

**Experimentos** é uma ação avançada dentro de Desenho, disponível antes da
seleção de microssequência porque o escopo pode ser curso, lição ou micro. Não é
uma quinta área do produto, dashboard, editor JSON nem chat interno.

No celular, uma etapa ocupa a superfície por vez. No desktop, lista, etapa e
resumo podem compartilhar espaço sem mudar as ações. O editor usa controles
estruturados, mostra referências humanas e mantém detalhes técnicos sob
disclosure. Estado e diferenças nunca dependem apenas de cor. Foco, teclado,
reflow a 200%, toque de pelo menos 44 px, temas, safe areas e Back do Android
seguem as mesmas regras da Autoria.

Gestão experimental é somente online. O último protocolo sincronizado pode ser
lido como stale, mas botões de escrita explicam a necessidade de reconexão. Não
existe outbox capaz de criar condição, lock, freeze ou assignment localmente.

## Propriedades demonstráveis e alegações proibidas

Testes podem demonstrar versionamento, isolamento, rejeição de lock, seed
reprodutível, balanceamento transacional, freeze, replay, entrega offline do
artefato atribuído e recusa de package externo. Eles não demonstram eficácia,
equivalência educacional entre condições, validade de instrumento ou ausência
de viés na população.

O protocolo conserva referências de instrumentos e outcomes governados, mas a
instrumentação e a análise permanecem separadas. Um card concluído, tempo de
uso, quantidade de tentativas ou finding de autoria não se tornam outcome sem
definição, consentimento, procedimento e interpretação autorizados.

Depois do início da coleta, outcomes explícitos entram no dataset experimental
somente enquanto o experimento está em `collecting`. Resultados mostra N por
condição, completude e ausência sem expor a conta da pessoa participante, o
seed ou o roster. A leitura continua descritiva: consulte [Analytics
instrucionais](analytics-instrucionais.md) e o [Dicionário de métricas e
datasets](dicionario-metricas-datasets.md).
