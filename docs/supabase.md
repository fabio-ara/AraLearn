# Supabase no AraLearn

## O que o Supabase faz no produto

O Supabase reúne quatro serviços usados pelo AraLearn:

- **Auth**, que comprova a identidade da conta e mantém a sessão;
- **PostgreSQL**, que conserva Cursos, composição, Fontes, acesso e estado
  pessoal, Anotações ancoradas e auditoria/correções;
- **Storage**, que guarda avatares privados;
- **Edge Functions**, que oferecem a API autoral e o servidor MCP.

Web e Android usam o mesmo backend. O aplicativo não possui um segundo modelo
remoto específico para o APK. O stack local é descartável e existe para
desenvolvimento e testes; o roteiro de publicação controlada está em
[Implantação](implantacao.md).

## Vocabulário necessário

**PostgreSQL** é um sistema gerenciador de banco de dados relacional. Ele
conserva dados em tabelas e aplica relações, restrições e transações.

**Structured Query Language** (SQL) é a linguagem usada para definir e
consultar esse banco.

**Remote Procedure Call** (RPC) é uma função do banco chamada pela API. No
AraLearn, uma RPC representa uma consulta ou mudança completa do domínio; ela
não entrega SQL arbitrário ao cliente.

**Row Level Security** (RLS) é a regra que decide quais linhas uma identidade
pode ler ou alterar. Quando nenhuma política autoriza a operação, o acesso é
negado.

**Edge Function** é uma função executada no servidor. Ela adapta HTTP ou MCP ao
mesmo domínio de Curso sem duplicar o modelo de dados.

**Compare-and-swap** (CAS) é a exigência de que uma alteração informe a revisão
que leu. Se outra mudança avançou a revisão, a escrita falha com conflito.

**Idempotência** é a propriedade pela qual repetir o mesmo pedido identificado
devolve o mesmo resultado, sem aplicar a mudança duas vezes.

O [glossário técnico](glossario-tecnico.md) apresenta os demais termos.

## Modelo canônico de dados

Um Curso é um único objeto vivo. Não existe uma identidade diferente para
planejamento, materialização e Estudo.

```text
auth.users
   │
   ├── person_profiles ── referência ──> Storage/person-avatars
   │
   ├── courses (proprietário)
   │      ├── course_instructional_plans
   │      │      ├── course_instructional_plan_items
   │      │      └── course_authoring_parts
   │      │             ├── vínculos com Microssequências didáticas
   │      │             └── materializações e etapas
   │      ├── course_source_* (Fontes, Âncoras e atribuições)
    │      ├── course_anchored_annotation_* (linha, eventos, recibos e versões privadas)
    │      ├── course_instructional_audit_runs (rodadas imutáveis)
    │      ├── course_audit_findings (versões append-only)
    │      ├── course_audit_finding_annotations (junção protegida)
    │      ├── course_authoring_corrections (versões e checkpoints)
   │      ├── course_entities (composição didática)
   │      ├── course_access (acesso direto ao Estudo)
   │      ├── course_events (eventos canônicos)
   │      └── course_change_receipts (repetição segura)
   │
   └── course_personal_states (estado da pessoa em cada Curso)
```

### Tabelas e responsabilidades

| Relação | Responsabilidade | Observação de segurança |
|---|---|---|
| `public.courses` | identidade, proprietário, título, objetivo, revisão, versões globais dos conjuntos de anotações e auditoria e datas | somente o proprietário edita conteúdo; os contadores de projeção são independentes da revisão |
| `private.course_instructional_plans` | público, escopo, faixa preferencial e versão do plano | uma linha por Curso; título, objetivo e orientação não são duplicados |
| `private.course_instructional_plan_items` | resultados pretendidos, unidades de análise e requisitos de evidência ordenados | leitura e escrita passam pelo contrato do plano |
| `private.course_design_target_plan_items` | atribuição muitos-para-muitos de unidades de análise e requisitos de evidência a Microssequências | FKs compostas prendem item e alvo ao mesmo Curso; sem grants diretos |
| `private.course_authoring_parts` | recortes operacionais ordenados, com título, intenção e versão | não integra a hierarquia curricular |
| `private.course_authoring_part_didactic_microsequences` | vínculo exclusivo e ordem de produção de Microssequência por Parte | não altera `course_entities.position` |
| `private.course_design_parameter_definitions` | quatro definições pedagógicas versionadas e imutáveis | defaults são hipóteses de produto; não existem definições livres |
| `private.course_design_parameter_changes` | atribuições e remoções de parâmetros por escopo | append-only; herança e default são calculados |
| `private.course_authoring_guidance_revisions` | texto original ou remoção de orientação por escopo | append-only; não é campo do plano |
| `private.course_authoring_guidance_interpretations` | interpretação estruturada de uma revisão exata | não substitui nem reescreve o original |
| `private.course_component_policy_changes` | política completa de componentes por escopo | catálogo exato, permissão, exclusão e preferência |
| `private.course_authoring_part_materializations` | tentativas retomáveis e fatos limitados de materialização | somente uma tentativa em andamento por Parte |
| `private.course_authoring_part_materialization_steps` | etapas ordenadas e versionadas de uma tentativa | na etapa didática, entidades e vínculo confirmam atomicamente |
| `private.course_source_revisions` | revisões append-only do catálogo de Fontes | catálogo e histórico owner-only; legado não resolvido fica oculto |
| `private.course_source_anchor_revisions` | Âncoras versionadas de página, tempo, fragmento ou trecho | cada Âncora pertence a uma revisão exata da Fonte |
| `private.course_source_attributions` | snapshots append-only por item do plano ou Unidade | no máximo um snapshot é efetivo para a versão/hash corrente do alvo |
| `private.course_source_attribution_sources` | Fontes ordenadas e relação declarada em cada snapshot | escrita nova exige Âncora ativa e exata |
| `private.course_source_attribution_anchors` | Âncoras exatas de cada vínculo | sem catálogo ou trecho privado na projeção de Estudo |
| `private.course_anchored_annotations` | estado corrente e tombstone de cada Anotação ancorada | estudante lê somente as próprias; proprietário recebe identidade protegida |
| `private.course_anchored_annotation_events` | hashes e metadados append-only de revisões e estados | não conserva versões anteriores do texto bruto |
| `private.course_anchored_annotation_receipts` | repetição segura dos comandos de observação | expira logicamente em até 14 dias; limpeza física oportunista |
| `private.course_anchored_annotation_viewer_versions` | contador monotônico da projeção self-only e `protected_ref` aleatório persistido por pessoa e Curso | sem texto; RLS forçada, sem grants e sem autoridade textual |
| `private.course_instructional_audit_runs` | rodadas imutáveis com checks e evidências | owner-only; inclui rodadas limpas e usa RLS forçada sem grants diretos |
| `private.course_audit_findings` | versões append-only de achados | decisão e estado não reescrevem versões anteriores |
| `private.course_audit_finding_annotations` | identidades e versões exatas de Anotações ligadas ao achado | não copia texto/pessoa; cascade da Anotação remove somente o vínculo |
| `private.course_authoring_corrections` | versões de proposta, decisão, checkpoint, verificação e rollback | correção focal; RLS forçada sem grants diretos |
| `private.course_entities` | módulos, lições, tópicos, microssequências e unidades de estudo | leitura e escrita passam por RPCs validadas |
| `public.course_access` | vínculo direto entre Curso e pessoa autorizada a estudar | não concede Autoria |
| `public.course_personal_states` | continuidade, conclusões e marcações **Rever** da própria pessoa | documento v2 isolado por pessoa; não contém observações |
| `public.person_profiles` | nome de apresentação e chave do avatar | e-mail não é copiado para esta tabela |
| `private.course_events` | sequência canônica de mudanças com resumo limitado | não é uma cópia completa do Curso |
| `private.course_change_receipts` | resultado temporário de pedidos idempotentes | tem prazo de expiração |

As tabelas `private` não são uma API para o navegador. As tabelas `public`
expostas pelo Data API têm RLS forçada, privilégios mínimos e, quando
necessário, são acessadas somente por funções. A documentação do Supabase
explica por que tabelas expostas precisam de [RLS
habilitada](https://supabase.com/docs/guides/database/postgres/row-level-security).

`course_personal_states` não persiste uma segunda contagem de Unidades
concluídas. A lista calcula a interseção entre o estado pessoal e as Unidades
vivas; isso impede que a exclusão autoral de uma Unidade deixe uma métrica
derivada desatualizada.

## Plano instrucional e Partes de autoria

O plano é uma projeção única `aralearn.course-instructional-plan.v1`. Ela reúne
título e objetivo lidos de `public.courses` com os campos das relações de
planejamento, os vínculos, o progresso derivado e a atividade recente. A
projeção não cria colunas ou JSONs duplicados para título e objetivo.

O plano novo usa 7–12 como faixa preferencial de Partes e registra se a origem
é automática, da pessoa autora ou de uma condição de pesquisa. A faixa aceita
configuração de 1 a 64 e não é regra pedagógica. Partes podem ser criadas,
editadas, reordenadas, divididas, unidas ou retiradas. Vínculos de
Microssequência podem ser atribuídos, movidos ou removidos. Essas mutações não
apagam `course_entities`. O plano aceita até 192 vínculos no total e 512 KiB;
a projeção enriquecida falha fechada acima de 1,75 MiB, antes do teto de 2 MiB
do transporte.

Uma Parte expõe progresso calculado a partir das Microssequências vinculadas,
Unidades existentes e tentativa mais recente. Os estados visuais não são
campos editáveis. Copiar um pedido de materialização para o chat não grava
evento nem tentativa; somente `start`, `record_step` ou `finish` confirmados
pelo serviço alteram os fatos persistidos.

Separadamente do vínculo de produção, unidades de análise e requisitos de
evidência são atribuídos às Microssequências por uma relação muitos-para-muitos.
`set_target_plan_items` substitui atomicamente as duas listas de um alvo; não há
propagação automática do plano inteiro para cada Microssequência.

## Composição didática paginada

A composição não é guardada como um grande documento repetido a cada edição.
Cada entidade possui tipo, identificador, pai, posição, conteúdo e versão. O
banco valida a hierarquia e impede posições duplicadas entre irmãos. Versão,
criação e atualização pertencem a cada linha: enviar novamente conteúdo,
posição e pai idênticos não altera esses metadados técnicos.

Os tipos correntes são:

- `module`;
- `lesson`;
- `topic`;
- `microsequence`;
- `study_unit`.

O documento final usa `aralearn.course.v1` e
`microsequence.studyUnits`. A migration `1700` converte uma única vez o
discriminador anterior; constraints e funções correntes aceitam somente
`study_unit`. Identidades, posição local na Microssequência e metadados da linha
são preservados, sem alias permanente.

A migration `1900` conclui outro corte único: `StudyUnit.sources` deixa de
existir no conteúdo. Uma composição com esse campo é rejeitada, sem alias,
fallback ou leitura dupla. Para cada Unidade incluída ou substituída, o commit
recebe exatamente uma aplicação separada em `sourceAttributionApplications`,
mesmo vazia, e confirma entidade, atribuição, revisão, evento e recibo na mesma
transação.

A migration `2000` conclui o corte de Observações. Ela converte notas autorais e
observações pessoais legadas uma única vez em Anotações ancoradas, comprova a
transferência por hash e limpa os campos de observação dos documentos pessoais
corrente e legado. O runtime passa a usar somente personal-state v2, com
`progress` e `reviewMarks`; não há dual read ou dual write. A ponte física de
recibos v1 permanece cercada somente até a expiração existente, e
`private.valid_course_personal_state_v1` fica isolada para remoção posterior.

O preflight da `2000` admite apenas pontes legadas previstas de observação e
recibo; qualquer workspace inesperado aborta. A relação
`trail_observation_threads` permanece temporariamente apenas como ponte de
correção sem texto bruto, não como fonte ativa.

A migration `2100` instala o ciclo novo sem converter ou retomar achados e
reparos anteriores. Seu preflight é fail-closed sobre um envelope fixo de 26
contagens: todos os bloqueadores precisam ser zero. Somente a contagem bruta de
`observation_threads` pode ser diferente de zero, e ainda assim suas
referências a correções precisam ser zero. O contrato anterior não é reativado
por alias, fallback ou compatibilidade.

Listas e composição são paginadas por cursores estáveis. Na Autoria, o
navegador busca primeiro o cabeçalho fino e depois recompõe a hierarquia a
partir das páginas de entidades. O cabeçalho não repete o `outline`, evitando
duas consultas e dois JSONs para a mesma tela. Um consumidor autoral de serviço
pode pedir um `outline` compacto quando realmente precisa dele.

Limites de tamanho e quantidade existem no banco, na API e no MCP. Assim, uma
resposta grande demais não depende somente da memória disponível numa Edge
Function ou no modelo de linguagem.

## Duas superfícies, uma autoridade

### Estudo

As RPCs autenticadas de Estudo aceitam Curso próprio ou compartilhado:

| RPC | Resultado |
|---|---|
| `list_courses_v1` | página de cabeçalhos acessíveis |
| `get_course_v1` | cabeçalho fino, sem plano nem orientação privada de autoria |
| `list_course_entities_v1` | página da composição sob uma revisão esperada |
| `get_course_study_citations_v1` | citações visíveis e redigidas de uma Unidade, carregadas sob demanda |
| `list_course_review_items_v1` | fila **Rever** paginada sem baixar todos os Cursos |
| `load_course_personal_state_v2` | estado pessoal remoto com somente progresso e **Rever** |
| `mutate_course_personal_state_v2` | alteração pessoal v2 com CAS e idempotência |
| `get_my_course_anchored_annotations_v1` | página self-only de Anotações ancoradas próprias |
| `execute_my_course_anchored_annotation_command_v1` | criar, revisar ou retirar anotação própria |

### Autoria no navegador

A Autoria usa wrappers que aceitam somente Cursos pertencentes à pessoa:

| RPC | Resultado |
|---|---|
| `list_owned_courses_v1` | página de Cursos próprios |
| `get_owned_course_v1` | cabeçalho e hierarquia compacta, sem planejamento duplicado |
| `get_owned_course_instructional_plan_v1` | plano normalizado, Partes, progresso e atividade recente |
| `list_owned_course_entities_v1` | composição paginada de Curso próprio |

Um link profundo para Curso apenas compartilhado é recusado pela superfície de
Autoria. Isso impede que títulos ou links autorais de conteúdo compartilhado
sejam entregues por engano.

### API e MCP de Autoria

A Edge Function `aralearn-course-api` oferece o mesmo executor autoral à
interface. A Edge Function `aralearn-authoring-mcp` adapta esse executor ao
**Model Context Protocol** (MCP) com OAuth 2.1.

O executor separa consulta/mudança do plano, commit geral da composição e
avanço de materialização. A interface e o MCP não mantêm cópias paralelas: os
dois chegam às mesmas RPCs, recibos e eventos. O canal `application` ou `mcp`
é registrado como fato de transporte, sem alterar regras de autoridade.

Parâmetros, orientações e política resolvidos por escopo são lidos pela Edge
owner-only em `get_owned_course_design_for_actor_v1`; mudanças convergem em
`apply_course_design_command_for_actor_v1`. Essas RPCs exigem `service_role` e
não criam um wrapper autenticado paralelo para o navegador.
No escopo de Microssequência, a leitura inclui `targetPlanItems`; nos demais,
esse campo é `null`. O comando `set_target_plan_items` usa a mesma RPC de
desenho e mantém CAS, receipt e revisão do Curso.

O catálogo e a proveniência owner-only usam
`get_owned_course_sources_for_actor_v1`, com os modos paginados `catalog`,
`source` e `target`, e `execute_course_source_command_for_actor_v1`, que aceita
os cinco comandos fechados de Fonte, Âncora e atribuição. Ambas revalidam ator,
propriedade e revisão; a escrita preserva `requestId`, CAS e recibo. O browser e
o MCP consomem o mesmo DTO estrito `aralearn.course-sources.v1` e o mesmo recibo
`aralearn.course-source-change.v1`.

Anotações usam `get_owned_course_anchored_annotations_for_actor_v1` na caixa de
entrada owner-only e `get_my_course_anchored_annotations_v1` no Estudo
self-only. Ambas projetam o mesmo DTO estrito, mas somente o proprietário pode
ver o Curso inteiro e agir sobre triagem; a identidade do contribuidor é um
pseudônimo protegido aleatório persistido, não derivado de Curso/UUID e nunca
UUID ou e-mail. A UI apresenta somente o `label`
protegido e não expõe `ref`. Os comandos convergem em
`execute_course_anchored_annotation_command_for_actor_v1` ou no wrapper
self-only correspondente. Página máxima 24, cursor máximo 240 caracteres e
resposta máxima 256 KiB são validados no domínio e no SQL.

`courses.annotation_set_version` cerca globalmente a leitura do proprietário.
O Estudo recebe no DTO apenas o contador monotônico privado da própria projeção,
mantido em `course_anchored_annotation_viewer_versions`; atividade alheia não o
altera nem se torna observável. Essa relação guarda `course_id`, `actor_id`,
`protected_ref` aleatório persistido e `version`, com RLS forçada e sem grants
diretos: coordena paginação
e cache, mas não é autoridade textual nem histórico de domínio. A linha
permanece até a exclusão da pessoa ou do Curso para preservar monotonicidade e
não entra no TTL de texto, tombstone ou recibo. Criar e
corrigir assuntos também exigem a revisão do Curso; revisar texto, responder ou
mudar estado não avança a revisão de conteúdo. A classificação automática
escolhe assunto
somente para alvo Tópico, e `human_topic_selection` fica separado. Quotas
incluem tombstones: 128 por ator/Curso/alvo, 512 por ator/Curso e 256 versões ou
eventos em operações ordinárias; retirada e exclusão de conta continuam
permitidas no teto.

O ciclo de auditoria usa somente as RPCs service-role owner-only
`get_owned_course_audit_cycle_for_actor_v1` e
`execute_course_audit_cycle_command_for_actor_v1`. A leitura expõe os modos
`context|findings|runs|detail`. Achados e rodadas são paginados, aceitam
`targetStudyUnitId` opcional e usam cursor opaco; `runs` enumera também rodadas
limpas. O modo `detail` exige exatamente um entre `findingId` e `auditRunId`, e
o detalhe de rodada inclui todos os checks e evidências. A página distingue a
lista `runs` de `runDetail`.

A mudança aceita sete comandos: `record_audit`,
`propose_authoring_correction`, `reject_authoring_correction`,
`decide_finding`, `apply_authoring_correction`, `verify_finding` e
`rollback_authoring_correction`. `auditCommand.confirmed: true` é obrigatório
somente nos dois comandos que mudam o Curso, aplicação e rollback; os outros
cinco o recusam. O adaptador remove a confirmação antes do domínio.

O contexto deriva a Unidade focal, Microssequência, plano, desenho,
Fontes/Âncoras e até 12 Observações selecionadas. A interface fornece três
checks humanos, e o servidor acrescenta o check estrutural determinístico sob
máximo de 32. Rodada imutável, versões append-only de achado, junção e versões
append-only de correção permanecem quatro autoridades distintas.

A junção guarda só identidade e versão. Uma Anotação retirada ainda existente
como tombstone é projetada `available: false`, `deepLink: null`; quando a
limpeza física a apaga, `ON DELETE CASCADE` remove apenas a junção e o ID deixa
as projeções futuras. Rodada, achado e correção permanecem, sem texto,
pseudônimo ou pessoa copiados.

Auditoria/correção é online-only, sem store, cache autoritativo ou outbox no
IndexedDB. Página e resultado de mudança têm até 240 KiB, página até 24 itens,
cursor até 240 caracteres e comando até 192 KiB. Há até 16 achados por rodada,
256 rodadas por Curso com reserva para correções aplicadas, 1.024 identidades
de achado, 64 correções por Curso e oito por achado; históricos projetados são
delimitados. Snapshot, checkpoint e recibo têm 48, 96 e 64 KiB.

A RPC de Estudo é outra projeção, não uma permissão sobre o catálogo. Ela omite
Fontes `hidden` e `unresolved_legacy`; `citation` devolve URL nula e
`citation_and_link` pode devolvê-la. Trecho de verificação, ator, canal,
histórico e controles de edição nunca são enviados. A consulta ocorre somente
quando a pessoa abre Fontes na Unidade, sob a revisão corrente, e falha fechada
acima de 256 KiB.

A leitura detalhada de uma tentativa passa pela RPC service-role owner-only
`get_owned_course_authoring_part_materialization_for_actor_v1`. Ela recebe
Curso, Parte e tentativa, devolve no máximo 64 etapas em até 1,25 MiB e permite
retomada depois de reinício. O navegador e o MCP chegam a ela pelo mesmo
executor `lerCurso`; não existe wrapper autenticada paralela nem listagem
irrestrita do histórico.

As ferramentas canônicas são:

- `listarCursos`;
- `lerCurso`;
- `criarCurso`;
- `alterarCurso`;
- `gerirPessoas`;
- `consultarComponentesDidaticos`.

O service role não recebe as consultas genéricas que aceitam Cursos
compartilhados. Ele recebe somente as variantes `*_for_actor_v1` restritas ao
proprietário e as operações necessárias a perfil e acesso. Desse modo, o MCP
autoral não depende de um filtro opcional feito depois que dados já chegaram à
função.

A Inspeção visual e a vista MCP `study_units` usam a mesma RPC service-role
owner-only `list_owned_course_study_units_for_actor_v1`. Ela pagina em ordem
curricular por Curso, Parte, Unidades sem Parte, Módulo, Lição ou
Microssequência. Uma âncora inclui a Unidade-alvo na página inicial; um cursor
`{studyUnitId}` continua para frente ou para trás, e os dois são mutuamente
exclusivos. A página normal contém 12 itens, o máximo é 24, `maxBytes` fica
entre 64 KiB e 1.500.000 bytes e a resposta falha fechada acima de 1,75 MiB.
A helper privada não possui `EXECUTE` para papéis de cliente, e a função pública
é concedida somente a `service_role`, revalidando ator e propriedade.

`verify_jwt = false` no arquivo de configuração não significa ausência de
autenticação. Cada função verifica o protocolo apropriado na própria entrada:
token de sessão na API e OAuth no MCP. A opção da plataforma apenas evita uma
segunda verificação incompatível antes desse código.

## Escrita de Curso

Criar um Curso recebe título e objetivo, cria a raiz privada vazia e cria seu
plano normalizado na mesma transação. A escrita posterior se divide em cinco
famílias explícitas de conteúdo e uma família de auditoria:

1. **plano instrucional:** recebe comando semântico, revisão esperada do Curso
   e versão esperada do plano; calcula e valida o estado-alvo antes do commit;
2. **desenho por escopo:** altera parâmetro, orientação, interpretação ou
   política sob a revisão esperada e com origem explícita, ou substitui os
   itens do plano atribuídos a uma Microssequência;
3. **Fontes e proveniência:** cria, revisa ou aposenta Fonte, salva ou aposenta
   Âncora, ou substitui o conjunto completo e ordenado de um alvo;
4. **composição:** recebe inserções/alterações e exclusões de entidades, com a
   aplicação completa de Fontes de cada Unidade alterada, sob a revisão
   esperada, sem reescrever o plano;
5. **materialização de Parte:** inicia tentativa, registra uma etapa ou finaliza
   a tentativa sob revisão e versões esperadas;
6. **auditoria e correção:** registra rodada ou decisão, propõe/rejeita/aplica
   correção, verifica numa nova rodada ou executa rollback.

Todas autenticam a pessoa, confirmam propriedade, procuram repetição segura,
aplicam CAS, validam limites, calculam diferenças, avançam a revisão somente
quando há mudança e devolvem recibo mínimo. Começar uma tentativa fixa a versão
da Parte e entre 1 e 64 etapas. Registrar uma etapa admite até 64 mudanças de
entidade no total e confirma conteúdo, vínculo, atribuições, fatos e progresso
numa única transação. Contexto e fatos possuem limites pequenos no banco e na
Edge Function.

Na sexta família, somente aplicação e rollback avançam a revisão do Curso,
criam `course_events` e reutilizam `course_change_receipts`; as outras operações
avançam apenas a projeção de auditoria quando mudam seu estado. A correção v1
só substitui conteúdo e atribuições exatas de Fontes da Unidade focal, preserva
`topics` legítimos e não cria, exclui, move, reposiciona ou muda pai. No-op é
recusado. Aplicação e rollback confrontam checkpoint `before|after` e estado
corrente na mesma transação.

Verificação registra outra rodada e exige `resolved|still_open`. Resolver só é
válido quando o critério focal passou; `still_open` reabre. Resultado factual
positivo e resolução factual exigem Fonte e Âncora ativas na revisão exata:
`supported_by` sustenta afirmação e `quoted_from` só vale para
`quotation_fidelity`. Ações sugeridas sobre Observações não são executadas pela
RPC de auditoria e exigem comando explícito e versionado de Anotações.

Ao iniciar uma materialização, o servidor deriva e sela o desenho efetivo para
as Microssequências-alvo. O cliente não fornece esse contexto. Catálogos de
itens conservam `{id, position, statement, version}`, cada alvo referencia
somente os IDs atribuídos e `aralearn.course-design-context.v2` sela também as
revisões de Fontes e Âncoras desses itens. Ao registrar a etapa, fatos limitados
e aplicações `aralearn.course-source-attribution-application.v1` são auditados
contra esse subconjunto e o hash selado.

Formas explicativas, oportunidades e variações são declarações do agente ou da
pessoa autora; schema, IDs, contagens e coerência interna são validados, mas o
banco não as infere semanticamente do conteúdo. A reconciliação material da
etapa cobre os IDs de Unidades, seu pai/alvo e os `componentRefs` extraídos das
entidades persistidas e confrontados com a política.

Na composição segmentada, o domínio valida cada linha de acordo com
`module|lesson|topic|microsequence|study_unit`; o banco cerca a hierarquia e
verifica `dependsOn` somente nas Lições afetadas pelo lote. Uma escrita não
recompõe o Curso inteiro, mas também não deixa conteúdo de outro tipo passar sem
validação semântica. `sources` dentro da Unidade é inválido; cada upsert de
Unidade possui exatamente uma aplicação separada, inclusive vazia.

Plano, Fontes e materialização incluem comando, versões esperadas e canal no
hash; composição inclui o lote, as aplicações exatas e a revisão esperada. O servidor consulta o
recibo antes de rejeitar CAS: assim, uma repetição idêntica recupera o mesmo
resultado mesmo depois de a primeira chamada ter avançado a revisão. A mesma
chave com outro conteúdo é conflito, não nova operação.

Receipts reutilizam o fluxo canônico de mudança de Curso. Perfil e acesso não
criam um segundo ledger. Recibos expirados são removidos também pelo par exato
ator–pedido antes de uma nova inserção, mesmo quando a limpeza global por lote
não alcançou aquela linha.

Um pedido que apresenta o mesmo plano ou as mesmas entidades é um **no-op**
(operação sem efeito). Ele não avança a revisão do Curso, não aumenta versões e
não cria atividade autoral falsa. Repetir o mesmo `requestId` devolve o
resultado selado com `idempotent=true`.

O gesto visual de copiar um pedido para o chat não chama essas mutações. Por
isso, ele não cria recibo, evento, tentativa ou progresso.

### Tipos de mudança dos eventos

`private.course_events.operation` distingue criação, metadados históricos do
corte, composição, plano instrucional, materialização, aplicação/rollback de
correção e acesso. Eventos de
plano informam `activityKind=plan_changed`, canal, tipo de comando e contagens.
Eventos de materialização distinguem início, etapa registrada e finalização e
referenciam Parte e tentativa. Eventos de composição informam `createdCount`,
`updatedCount` e `deletedCount` calculados sobre diferenças reais. Nenhum deles
replica o plano ou o conteúdo.

O corte reclassifica os 36 eventos existentes por este mapa temporário:

| Operação histórica | Operação canônica | `changeKind` | Quantidade atestada |
|---|---|---|---:|
| `create` | `create_course` | `course_initialized` | 6 |
| `create_structure` | `replace_course_composition` | `didactic_structure_materialized` | 4 |
| `replace_catalog_document` | `replace_course_composition` | `course_composition_replaced` | 4 |
| `save_card` | `replace_course_composition` | `study_unit_updated` | 1 |
| `save_microsequence_cards` | `replace_course_composition` | `didactic_microsequence_study_units_updated` | 16 |
| `update_brief` | `update_course_metadata` | `authoring_guidance_updated` | 4 |
| `update_metadata` | `update_course_metadata` | `course_metadata_updated` | 1 |

Os nomes da primeira coluna existem somente dentro da migration e de seus
testes de corte. O mapa é `TEMP`, desaparece no commit e não é contrato do
runtime. A validação compara identidade, Curso, revisão, ator, instante,
contagens e a distribuição completa antes de aceitar a transação.

## Perfil, acesso e avatar

### Perfil

`public.person_profiles` contém:

- `user_id`;
- `display_name`, que pode permanecer nulo até o onboarding;
- `avatar_object_key`;
- `created_at` e `updated_at`.

Um trigger cria o perfil junto com uma nova conta, sem inferir nome do e-mail.
A API expõe leitura e alteração do próprio perfil pelo mesmo `gerirPessoas`
usado no MCP e na interface.

### Acesso direto ao Estudo

O proprietário localiza uma conta somente pelo e-mail exato. A RPC converte o
e-mail em identificador dentro da transação e não o conserva no vínculo, no
evento nem no recibo. Conceder e revogar exigem `confirmed=true` e um
identificador de pedido.

Revogar apaga apenas `course_access`. O estado pessoal remoto da pessoa
favorecida continua existente. Na próxima validação online, o cliente que
receber acesso negado purga as listas, o cabeçalho, as entidades, o cache, a
outbox e o handoff de anotações daquele Curso do armazenamento local.

### Avatar privado

O bucket `person-avatars`:

- não é público;
- aceita JPEG, PNG e WebP;
- limita cada objeto a 512 KiB;
- usa caminho imutável `<userId>/<uuid>.<ext>`;
- permite upload e exclusão somente na pasta da própria pessoa;
- permite leitura somente à própria pessoa ou numa relação direta
  proprietário–pessoa favorecida.

Pessoas favorecidas pelo mesmo Curso não veem os avatares umas das outras. O
upload é feito diretamente pelo cliente autenticado, com `x-upsert: false`.
Não há Edge Function nem URL assinada criada apenas para esse arquivo pequeno.
As políticas seguem o modelo de [controle de acesso do Supabase
Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Exclusão da própria conta

`delete_my_account_v1` exige a confirmação literal `EXCLUIR MINHA CONTA`. Essa
RPC é oferecida somente ao usuário autenticado e não é uma ferramenta MCP.

Antes da RPC, o cliente lista e remove os próprios objetos em
`person-avatars`. O banco recusa a exclusão enquanto algum desses objetos
existir. A função retira concessões emitidas pela pessoa para que a referência
de autoria da concessão não bloqueie a exclusão e, então, apaga a conta do Auth.
As chaves estrangeiras aplicam as cascatas declaradas.

Quando a conta excluída era alvo de uma concessão ou revogação, o histórico
conserva a operação e o instante, mas deixa de conservar seu UUID: o evento
passa a indicar `targetAccountDeleted`, e o recibo substitui a pessoa por
`accountDeleted`. O estado pessoal dessa conta é removido pelo cascade;
anotações contribuídas em Cursos alheios são retiradas e redigidas
imediatamente e expiram logicamente após a janela de 14 dias; a limpeza física
é oportunista quando o Curso é tocado, em um lote de até 128 tombstones e 256
recibos expirados por toque. Curso inativo pode conservar lixo físico. Isso
preserva a métrica operacional sem manter uma associação pessoal desnecessária.

O servidor não afirma apagar instantaneamente logs ou backups administrados
pelo provedor. Essa retenção deve ser verificada na política da implantação.

## Autorização e privilégios

As regras de segurança são deliberadamente estreitas:

- `anon` conhece apenas o manifesto público do runtime;
- `authenticated` executa as RPCs de Estudo, wrappers de Autoria própria e
  exclusão da própria conta;
- `service_role` executa somente operações de Curso próprio por ator, escrita,
  perfil e acesso necessárias às Edge Functions;
- `supabase_auth_admin` recebe apenas o hook de token do MCP;
- tabelas privadas não concedem leitura direta a esses papéis.

A migration revoga primeiro o `EXECUTE` amplo e concede uma lista explícita de
assinaturas. Funções `security definer` fixam `search_path`, validam o ator e
não confiam em identificadores apresentados pelo cliente sem nova checagem.

RLS protege linhas, não um segredo já enviado ao navegador. Ela também não
corrige uma função privilegiada incorreta. Por isso, os testes verificam em
conjunto privilégios, políticas e comportamento entre contas distintas. Veja a
documentação do PostgreSQL sobre [segurança por
linha](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Manifesto do runtime

`supabase/runtime-manifest.json` descreve o contrato que site, Edge Functions e
banco precisam compartilhar. A revisão local deste corte é `20260817210000`,
contrato v1. Entre as capacidades observáveis estão:

- identidade única e viva de Curso;
- plano instrucional normalizado e editável;
- parâmetros pedagógicos, orientações por escopo e política de componentes;
- Partes de autoria e materialização retomável;
- composição paginada;
- Unidade de estudo canônica e Inspeção vertical owner-only;
- Fontes e Âncoras versionadas, proveniência por alvo e citações redigidas no
  Estudo;
- acesso direto e restrito ao Estudo;
- Anotações ancoradas e classificação de assunto sem inferência semântica;
- ciclo owner-only de auditoria, correção, verificação e vínculos protegidos com
  Anotações;
- estado pessoal v2 com somente progresso e **Rever**;
- CAS e idempotência;
- MCP autoral somente por OAuth;
- perfil humano;
- avatar privado;
- exclusão da própria conta.

As três flags novas deste trecho são `course-audit-cycle-v1`,
`course-authoring-corrections-v1` e `course-audit-annotation-links-v1`. As flags
de Anotações e estado pessoal continuam ativas; site e funções não devem inferir
capacidade somente pela presença de tabelas.

`scripts/validateCourseRuntime.mjs` compara o JSON versionado, as migrations e
os contratos fonte. Uma versão do site não deve ser publicada contra um banco
que anuncie outra revisão.

## Por que este desenho é compatível com recursos limitados

O desenho reduz trabalho e armazenamento sem criar infraestrutura paralela:

- listas devolvem projeções finas, sem plano instrucional ou composição;
- composição e fila **Rever** são paginadas;
- a Inspeção usa páginas de até 24 Unidades, janela de DOM de até 36 e resposta
  de até 1,75 MiB;
- o cache de Inspeção conserva no máximo quatro páginas ou 8 MiB por Curso,
  separado por revisão e pedido exato;
- o catálogo de Fontes pagina até 24 itens e 256 KiB; escritas novas limitam 32
  Fontes por alvo e oito identidades de Âncora por revisão de Fonte;
- o Estudo busca citações somente ao abrir uma Unidade, e o PostgreSQL guarda
  metadados e URLs, não os bytes das Fontes;
- plano é lido sob demanda e traz atividade recente limitada;
- tentativas conservam apenas contexto e fatos limitados, sem transcrição de
  chat;
- o navegador de Autoria não pede `outline` e depois as mesmas entidades;
- estado pessoal permanece compacto por pessoa e Curso;
- páginas de anotações têm até 24 itens/256 KiB; quotas de 128 por alvo e 512
  por ator/Curso limitam linhas correntes, e eventos anteriores não repetem
  texto bruto;
- páginas de auditoria têm até 24 itens/240 KiB, e comandos, rodadas, achados,
  correções, snapshots, checkpoints, recibos e históricos possuem caps
  explícitos;
- recibos expiram logicamente e a limpeza física processa oportunisticamente
  por toque até 128 tombstones e 256 recibos expirados;
- avatar tem limite pequeno e upload direto;
- API e MCP reutilizam as mesmas RPCs e o mesmo executor;
- não existe backend separado para perfil, compartilhamento ou observabilidade.

Esses limites tornam o consumo mensurável, mas não demonstram que o Free Plan
sustenta uso prolongado. Revisões, Âncoras e atribuições são append-only; banco,
egress, Storage, invocações e duração de funções ainda precisam de baseline e
série real após a promoção.

As cotas comerciais do Supabase podem mudar. Antes de uma implantação, confira
as [cotas do plano](https://supabase.com/pricing), o [compute e o
disco](https://supabase.com/docs/guides/platform/compute-and-disk) e os [limites
de Edge Functions](https://supabase.com/docs/guides/functions/limits).

## Ambiente local reproduzível

Pré-requisitos:

- Node.js e npm;
- Docker Desktop ou runtime compatível;
- Deno;
- Supabase CLI na versão fixada pelo projeto.

Inicialize e reconstrua somente o stack local descartável:

```powershell
npm.cmd ci
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
```

Valide primeiro o contrato estático e, quando a mudança exigir a jornada
integrada, o stack local:

```powershell
npm.cmd run validate:course-runtime
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O validador local executa Deno, lint do banco, smoke de API/PostgREST/RLS,
e-mails de Auth e OAuth do MCP. Ao terminar:

```powershell
npx.cmd --yes supabase@2.109.1 stop --no-backup
```

Para abrir o aplicativo, obtenha `API_URL` e a publishable key no
`supabase status`, defina somente as variáveis públicas e execute
`npm.cmd run dev`.

## Configuração pública e segredos

O cliente usa:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

URL e publishable key podem integrar o artefato público porque a autorização
depende de Auth, RLS e funções. Senha do banco, secret key, chaves de assinatura
e credenciais de release nunca entram no site ou APK.

Durante o desenvolvimento, `/runtime-config.js` é gerado em memória. No build,
o arquivo é criado dentro do artefato. A Content Security Policy limita
`connect-src` às origens configuradas. CORS aceita apenas origens explícitas;
nenhum dos dois substitui autenticação ou RLS. As definições normativas estão
no padrão [Fetch](https://fetch.spec.whatwg.org/#http-cors-protocol) e em
[Content Security Policy Level
3](https://www.w3.org/TR/CSP3/).

## Aplicação no projeto remoto

Publicar migrations, Edge Functions ou dados é uma operação remota de impacto.
Use o roteiro detalhado de [Implantação](implantacao.md). O script seguro começa
em modo de verificação:

O projeto hospedado que já contém os oito Cursos é uma exceção operacional: a
staging e as migrations `20260817140000`, `20260817150000`,
`20260817160000`, `20260817170000`, `20260817180000`,
`20260817190000`, `20260817200000` e `20260817210000` precisam usar a mesma
conexão e transação e não podem ser aplicadas isoladamente por `db push`. O
importador transitório descrito abaixo executa esse corte. Uma instalação vazia
continua usando o fluxo comum.

A `1800` falha antes de alterar o schema se encontrar qualquer materialização
ou etapa anterior ao novo contexto. Seu preflight bloqueia essas tabelas e as
relações legadas de desenho antes de contar linhas; estado antigo não vazio ou
uma escrita concorrente aborta a transação, em vez de ser reinterpretado.

A `1900` também falha antes do corte se houver materialização em andamento ou
referência legada malformada. Ela remove `StudyUnit.sources`, cria revisões
`unresolved_legacy` e baselines de atribuição na ordem original, e confere
contagem, identidade, ordem e hash antes de confirmar.

A `2000` falha antes do corte diante de dado legado fora das pontes explícitas
de observação/recibo. Ela converte as observações,
limpa os documentos pessoais depois de prova por hash, instala o estado pessoal
v2 e cerca a ponte de recibos v1 até sua expiração.

A `2100` instala as quatro autoridades novas e falha fechada antes do corte se
qualquer um dos 26 campos do envelope legado violar a regra: todos os
bloqueadores são zero, exceto a contagem bruta permitida de
`observation_threads`, cujas referências a correções também precisam ser zero.
Não há retomada, conversão ou compatibilidade com achado ou reparo antigo. O
domínio congelado do ciclo de auditoria possui SHA-256
`6EB5E85E34FD77D915276DB8FFC9FA3B82E7257025C661ABDBFC923002E92AD9` no browser
e na Edge.

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co
```

Ele vincula o projeto, compara o histórico e executa `db push --dry-run`. A
aplicação exige `-Mode Apply` e a confirmação literal `APLICAR`. Edge Functions
só são implantadas quando `-DeployAuthoringFunctions` é informado.

Depois da aplicação, verifique migration, lint, manifesto e jornadas hospedadas.
Um erro de schema cache normalmente indica que cliente e banco estão em
revisões diferentes; limpar IndexedDB não atualiza migrations remotas.

### Atestação privada do corte de identidade

`scripts/courseCutover/` lê e valida a origem, produz a staging e executa
staging + migrations `1400` → `1500` → `1600` → `1700` → `1800` → `1900` →
`2000` → `2100` na mesma conexão e na mesma transação, e registra as oito versões no
ledger. Sem `--apply`, o comando não escreve no banco. Não há `db push`
separado das migrations desse corte.

Antes de qualquer aplicação, o runner grava fora do repositório público uma
atestação privada sem conteúdo, token, senha ou chave. Ela contém somente hash
do snapshot, hash das resoluções semânticas, hash do conjunto de migrations e,
para cada Curso, identidade, hashes de manifesto/documento/linhas/estado
técnico, `sourceReferenceHash` e contagens. `sourceReferenceHash` é o hash
canônico das tuplas ordenadas
`{studyUnitId, sourceOrdinal, sourceId}` e preserva a identidade literal das
referências. O diretório padrão é
`../AraLearn_private/evidence/course-cutover/`; um caminho dentro do
repositório público é recusado.

Depois do commit, o runner relê os Cursos, recompõe cada documento e confere
novamente `documentHash`, `rowHash`, `entityStateHash`,
`sourceReferenceHash` e contagens. Só então grava a atestação `verified`. Os manifestos não viram tabela nem campo de
runtime: são evidência privada de uma operação única.

O inventário vertical regenerado pós-`2100` possui 2.186 objetos: 591 ligados a
oito casos correntes e 1.595 isolados como legado físico. A distribuição
corrente é 90 de Auditoria e correções, 272 de Autoria, 84 de Anotações
ancoradas, 84 de Fontes, 26 de Estudo, 31 de pessoas/acesso, três de transportes
e um de componentes.
Os doze objetos da versão privada são uma tabela, seu estado RLS forçado, seis
constraints, três índices e um helper privado. O `protected_ref` acrescenta
check, unique e índice unique; a coluna não é objeto inventariado.
`private.valid_course_personal_state_v1` explica o objeto legado adicional e
permanece isolado para remoção posterior; RPCs, constraint e feature v1 não
integram o runtime. Contagens de schemas anteriores não são prova do corte
final.

Entidades que vieram da raiz relacional preservam `version`, `created_at` e
`updated_at`. Para os dois Cursos existentes somente como publicação, a origem
não oferece metadados por entidade; o importador declara `basis=course_record`,
usa versão `1` e os instantes da própria publicação. A atestação diferencia
esse default de uma preservação que a origem não permite provar.

## Publicação inicial das fixtures oficiais

Os arquivos em `supabase/fixtures/catalog/` são material de desenvolvimento e
validação. Eles não são seed remoto, não entram automaticamente no site ou APK
e não devem ser copiados diretamente para tabelas ou buckets.

Quando uma fixture precisar se tornar um Curso real, valide primeiro seu
contrato local e use a mesma criação, o mesmo plano e o mesmo commit separado de
composição oferecidos pela Autoria e pelo MCP. Esse caminho preserva
proprietário, revisão, evento, recibo e validação estrutural. O corte atual não
mantém uma promoção remota paralela que contorne essas regras.

## Evidência e limites da verificação

As afirmações deste documento podem ser confrontadas em:

- `supabase/migrations/20260817140000_course_identity_cutover.sql`;
- `supabase/migrations/20260817150000_course_profiles_access.sql`;
- `supabase/migrations/20260817160000_course_authoring_plan.sql`;
- `supabase/migrations/20260817170000_course_study_unit_inspection.sql`;
- `supabase/migrations/20260817180000_course_design_parameters.sql`;
- `supabase/migrations/20260817190000_course_sources_provenance.sql`;
- `supabase/migrations/20260817200000_course_anchored_annotations.sql`;
- `supabase/migrations/20260817210000_course_audit_corrections.sql`;
- `supabase/functions/_shared/aralearn-authoring/`;
- `supabase/runtime-manifest.json`;
- `tests/runtime/course-identity-cutover-pglite.test.js`;
- `tests/runtime/course-authoring-plan.test.js`;
- `tests/runtime/course-sources.test.js`;
- `tests/runtime/course-sources-panel.test.js`;
- `tests/runtime/course-anchored-annotations-pglite.test.js`;
- `tests/runtime/course-annotation-repository.test.js`;
- `tests/runtime/course-observations-panel.test.js`;
- `tests/runtime/course-audit-cycle.test.js`;
- `tests/runtime/course-audit-panel.test.js`;
- `tests/runtime/course-audit-corrections-pglite.test.js`;
- `tests/runtime/study-unit-observation-sheet.test.js`;
- `tests/runtime/course-cutover-source.test.js`;
- `tests/runtime/course-api-client.test.js`;
- `tests/runtime/course-mcp-tools.test.js`;
- `tests/runtime/course-inspection-sequence.test.js`;
- `tests/runtime/course-postgres-concurrency.test.js`;
- `supabase/tests/course-runtime-local-smoke.mjs`.

Um teste aprovado demonstra o cenário codificado. Ele não prova disponibilidade
permanente do provedor, segurança absoluta ou restauração de um backup que
nunca foi ensaiado.

Anotações ancoradas e auditoria conservam autoridades distintas. O ciclo liga
somente identidade/versão e nunca transforma triagem ou ação sugerida numa
mutação implícita da outra capacidade.
