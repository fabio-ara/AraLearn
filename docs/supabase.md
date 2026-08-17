# Supabase no AraLearn

## O que o Supabase faz no produto

O Supabase reúne quatro serviços usados pelo AraLearn:

- **Auth**, que comprova a identidade da conta e mantém a sessão;
- **PostgreSQL**, que conserva Cursos, composição, acesso e estado pessoal;
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
| `public.courses` | identidade, proprietário, título, objetivo, revisão e datas | somente o proprietário edita |
| `private.course_instructional_plans` | público, escopo, orientação, faixa preferencial e versão do plano | uma linha por Curso; título/objetivo não são duplicados |
| `private.course_instructional_plan_items` | resultados pretendidos, unidades de análise e requisitos de evidência ordenados | leitura e escrita passam pelo contrato do plano |
| `private.course_authoring_parts` | recortes operacionais ordenados, com título, intenção e versão | não integra a hierarquia curricular |
| `private.course_authoring_part_didactic_microsequences` | vínculo exclusivo e ordem de produção de Microssequência por Parte | não altera `course_entities.position` |
| `private.course_authoring_part_materializations` | tentativas retomáveis e fatos limitados de materialização | somente uma tentativa em andamento por Parte |
| `private.course_authoring_part_materialization_steps` | etapas ordenadas e versionadas de uma tentativa | na etapa didática, entidades e vínculo confirmam atomicamente |
| `private.course_entities` | módulos, lições, tópicos, microssequências e unidades de estudo | leitura e escrita passam por RPCs validadas |
| `public.course_access` | vínculo direto entre Curso e pessoa autorizada a estudar | não concede Autoria |
| `public.course_personal_states` | continuidade, conclusões, marcações **Rever** e observações da própria pessoa | isolado por pessoa |
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
- `card`.

O nome técnico `card` ainda faz parte do contrato corrente; a discussão
acadêmica de nomenclatura não deve ser resolvida por um alias silencioso no
banco.

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
| `list_course_review_items_v1` | fila **Rever** paginada sem baixar todos os Cursos |
| `load_course_personal_state_v1` | estado pessoal remoto |
| `mutate_course_personal_state_v1` | alteração pessoal com CAS e idempotência |

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

`verify_jwt = false` no arquivo de configuração não significa ausência de
autenticação. Cada função verifica o protocolo apropriado na própria entrada:
token de sessão na API e OAuth no MCP. A opção da plataforma apenas evita uma
segunda verificação incompatível antes desse código.

## Escrita de Curso

Criar um Curso recebe título e objetivo, cria a raiz privada vazia e cria seu
plano normalizado na mesma transação. A escrita posterior se divide em três
famílias explícitas:

1. **plano instrucional:** recebe comando semântico, revisão esperada do Curso
   e versão esperada do plano; calcula e valida o estado-alvo antes do commit;
2. **composição:** recebe inserções/alterações e exclusões de entidades sob a
   revisão esperada, sem reescrever o plano;
3. **materialização de Parte:** inicia tentativa, registra uma etapa ou finaliza
   a tentativa sob revisão e versões esperadas.

Todas autenticam a pessoa, confirmam propriedade, procuram repetição segura,
aplicam CAS, validam limites, calculam diferenças, avançam a revisão somente
quando há mudança e devolvem recibo mínimo. Começar uma tentativa fixa a versão
da Parte e entre 1 e 64 etapas. Registrar uma etapa admite até 64 mudanças de
entidade no total e confirma conteúdo, vínculo, fatos e progresso numa única
transação. Contexto e fatos possuem limites pequenos no banco e na Edge
Function.

Plano e materialização incluem comando, versões esperadas e canal no hash;
composição inclui o lote exato e a revisão esperada. O servidor consulta o
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
corte, composição, plano instrucional, materialização e acesso. Eventos de
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
receber acesso negado purga as listas, o cabeçalho e as entidades daquele Curso
do cache local.

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
`accountDeleted`. O estado pessoal dessa conta é removido pelo cascade. Isso
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
banco precisam compartilhar. A revisão local deste corte é `20260817160000`,
contrato v1. Entre as capacidades observáveis estão:

- identidade única e viva de Curso;
- plano instrucional normalizado e editável;
- Partes de autoria e materialização retomável;
- composição paginada;
- acesso direto e restrito ao Estudo;
- estado pessoal;
- CAS e idempotência;
- MCP autoral somente por OAuth;
- perfil humano;
- avatar privado;
- exclusão da própria conta.

`scripts/validateCourseRuntime.mjs` compara o JSON versionado, as migrations e
os contratos fonte. Uma versão do site não deve ser publicada contra um banco
que anuncie outra revisão.

## Por que este desenho é compatível com recursos limitados

O desenho reduz trabalho e armazenamento sem criar infraestrutura paralela:

- listas devolvem projeções finas, sem plano instrucional ou composição;
- composição e fila **Rever** são paginadas;
- plano é lido sob demanda e traz atividade recente limitada;
- tentativas conservam apenas contexto e fatos limitados, sem transcrição de
  chat;
- o navegador de Autoria não pede `outline` e depois as mesmas entidades;
- estado pessoal permanece compacto por pessoa e Curso;
- recibos expiram e são limpos em lotes;
- avatar tem limite pequeno e upload direto;
- API e MCP reutilizam as mesmas RPCs e o mesmo executor;
- não existe backend separado para perfil, compartilhamento ou observabilidade.

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
staging e as migrations `20260817140000`, `20260817150000` e
`20260817160000` precisam usar a mesma conexão e transação e não podem ser
aplicadas isoladamente por `db push`. O importador transitório descrito abaixo
executa esse corte. Uma instalação vazia continua usando o fluxo comum.

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
staging + conjunto ordenado de migrations na mesma conexão e na mesma
transação. Sem `--apply`, o comando não escreve no banco.

Antes de qualquer aplicação, o runner grava fora do repositório público uma
atestação privada sem conteúdo, token, senha ou chave. Ela contém somente hash
do snapshot, hash das resoluções semânticas, hash do conjunto de migrations e,
para cada
Curso, identidade, hashes de manifesto/documento/linhas/estado técnico e
contagens. O diretório padrão é
`../AraLearn_private/evidence/course-cutover/`; um caminho dentro do
repositório público é recusado.

Depois do commit, o runner relê os Cursos, recompõe cada documento e confere
novamente `documentHash`, `rowHash`, `entityStateHash` e contagens. Só então
grava a atestação `verified`. Os manifestos não viram tabela nem campo de
runtime: são evidência privada de uma operação única.

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
- `supabase/functions/_shared/aralearn-authoring/`;
- `supabase/runtime-manifest.json`;
- `tests/runtime/course-identity-cutover-pglite.test.js`;
- `tests/runtime/course-authoring-plan.test.js`;
- `tests/runtime/course-api-client.test.js`;
- `tests/runtime/course-mcp-tools.test.js`;
- `supabase/tests/course-runtime-local-smoke.mjs`.

Um teste aprovado demonstra o cenário codificado. Ele não prova disponibilidade
permanente do provedor, segurança absoluta ou restauração de um backup que
nunca foi ensaiado.
