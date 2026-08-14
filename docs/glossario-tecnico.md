# Glossário técnico

Este glossário fixa o sentido dos termos de computação usados na documentação
do AraLearn. Quando um identificador público aparece entre crases, sua grafia
faz parte do contrato e não deve ser traduzida. Os conceitos pedagógicos e de
pesquisa têm glossários próprios.

## Contratos e representação de conteúdo

**Artefato (`artifact`).** Objeto integral produzido por materialização e tratado como uma
unidade de armazenamento, validação e referência. Um artefato pode fixar uma
revisão de publicação ou de submissão; não é sinônimo de workspace, entidade
relacional ou arquivo temporário do build.

**Artefato endereçado por conteúdo (`content-addressed artifact`).** Artefato cuja chave deriva do hash de
seus próprios bytes. O AraLearn serializa JSON deterministicamente, calcula
SHA-256 e usa a chave
`artifacts/sha256/<2>/<2>/<hash>.json`; conteúdo igual converge para o mesmo
endereço, independentemente do nome do curso.

**Artefato de publicação (`publication artifact`).** Documento JSON integral, serializado de forma
determinística e armazenado de modo imutável no Supabase Storage. Seu endereço
é derivado do hash SHA-256 do conteúdo. PostgreSQL mantém metadados, referências
e permissões; não recebe uma segunda decomposição relacional do artefato
publicado. Implementação: `supabase/functions/_shared/aralearn-authoring/artifactStore.js`.

**Contrato.** Forma versionada e fechada de um documento ou de uma mensagem.
No AraLearn, “contrato” não é sinônimo de schema: pode incluir identidade,
semântica entre campos, normalização e invariantes que um schema isolado não
expressa. Há três identificadores próximos, mas não intercambiáveis:

- `aralearn.library.v1`: envelope operacional de projeto ou recorte, com
  `courses` e `scope` opcional; é validado por
  `src/domain/aralearnProject.js` e usado na persistência e na publicação;
- `aralearn.course.v1`: documento unitário aceito pelo kernel independente de
  packages; é validado por `src/resources/kernel/courseContract.js`;
- `aralearn.resource-library.v1`: protocolo das respostas de descoberta do
  catálogo de packages; é emitido por
  `src/resources/catalog/resourceCatalog.js` e não contém um curso.

**Contrato autoral de package.** Descrição de alto nível, exemplo e orientações
que permitem a uma pessoa ou a um modelo preencher `data` sem conhecer o
renderer. É devolvido junto com o manifest e o schema por `contracts`. Não é
um contrato monolítico de todos os resources.

**Envelope.** Estrutura externa que identifica um protocolo e delimita os
campos admitidos antes de validar o conteúdo interno. O envelope operacional de
biblioteca, o envelope unitário de curso, o envelope de card e o envelope de
resposta MCP são objetos diferentes.

**Escopo (`scope`).** Campo contextual do envelope operacional que identifica
o recorte ao qual a árvore recomposta pertence. Não concede autorização e não
equivale ao escopo OAuth, ao alvo selecionado na assistência ou a uma
capacidade efetiva.

**DSL JSON (`JSON DSL`).** Linguagem específica de domínio expressa em JSON. No AraLearn,
cada package define uma pequena DSL declarativa para representar um objeto de
conhecimento. JSON é apenas a sintaxe de intercâmbio; a semântica decorre do
package, de seu manifest, de seus validadores e do renderer. A documentação não
chama essa DSL de “linguagem formal” sem qualificar qual propriedade formal foi
demonstrada.

**Envelope de card.** Estrutura estável com `id`, `position`, `title`, `role`,
`content`, `response`, `feedback`, `topics` e `sources`. Cada item de conteúdo,
resposta ou feedback é uma instância `{ id, package, version, data }`.
Implementação: `src/resources/kernel/cardEnvelope.js`.

**Instância de package.** Ocorrência concreta de um package num card. O par
`package` e `version` seleciona a definição instalada; `data` contém apenas o
documento aceito por aquela versão; `id` distingue ocorrências no card.

**JSON Schema, subconjunto implementado.** O validador local reconhece apenas
as palavras-chave usadas pelos packages: `$id`, referências JSON Pointer
locais em `$ref`, `const`, `enum`, `allOf`, `anyOf`, `oneOf`, `type`, limites e
padrão de string, limites numéricos, restrições de array e propriedades de
objeto. Ele não declara conformidade integral com um dialeto do JSON Schema
2020-12. Implementação: `src/resources/kernel/schemaValidation.js`.

**Schema.** Descrição declarativa da forma sintática de um documento. No
AraLearn, um schema é uma parte do contrato: valida tipos, campos e restrições
expressáveis, mas não substitui normalização, semântica entre entidades,
autorização nem validação pedagógica. O runtime de packages usa o subconjunto
explicitado acima; schemas distribuídos podem declarar um dialeto externo sem
ampliar automaticamente o validador local.

**Kernel de resources.** Núcleo que verifica identidade e versão, slots,
schemas, relações de prática, edição textual, texto acessível, renderização,
hidratação e avaliação. O kernel não conhece a geometria nem o vocabulário de
cada representação. Implementação: `src/resources/kernel/`.

**Manifest de package.** Metadados versionados que descrevem propósito, slots,
operações cognitivas, taxonomia acadêmica, compatibilidades, limitações,
acessibilidade e permissões autorais. O manifest é metadado do package; não é
o manifesto de implantação da aplicação.

**Package.** Unidade instalável de representação ou resposta. Um package
implementa manifest, contrato autoral, schema, normalização, validação,
renderização, texto acessível e alvos editáveis. Packages de conteúdo também
declaram alvos de prática; packages de resposta implementam avaliação. Os ids
seguem `aralearn.resource.*` ou `aralearn.response.*` e as versões seguem
SemVer estrito. Implementação: `src/resources/packages/` e
`src/resources/kernel/packageRegistry.js`.

**Registry de packages.** Mapa, em memória, das definições efetivamente
instaladas, indexadas por `package@version`. O registry rejeita ids, versões,
slots, taxonomias ou funções obrigatórias inválidas e oferece as operações de
runtime. Não deve ser confundido com o catálogo de descoberta.

**Catálogo de resources.** Projeção consultável dos manifests instalados,
organizada por famílias e facetas. Ele oferece exploração, busca, inspeção,
contratos e auditoria sem carregar todos os schemas de uma vez. Implementação:
`src/resources/catalog/`.

**Catálogo de cursos.** Conjunto editorial apresentado em **Coleções**, com
publicações oficiais, classificações, metadados e referências de revisão. Não
contém contratos de packages e não é o catálogo de resources.

**Resource.** Na interface e na autoria de cards, é uma representação de
conteúdo fornecida por um package `aralearn.resource.*`. No protocolo MCP,
“resource” também é o tipo padronizado de conteúdo legível por
`resources/list` e `resources/read`. A documentação usa “resource de card” e
“Resource MCP” quando houver risco de ambiguidade.

**Card de domínio.** Entidade persistida do curso que contém papel pedagógico,
instâncias de packages e, quando aplicável, resposta. É o card regido pelo
envelope canônico; não é um item de menu ou um bloco visual de navegação.

**Card de navegação.** Componente de interface que resume uma entidade ou uma
ação para abrir outra tela. Pode ter aparência de cartão, mas não pertence ao
contrato de conteúdo, não recebe packages e não deve ser contado como card do
curso.

**Tokens de ajuste `canonical`, `versatile` e `substitute`.** Valores públicos
do campo `fit` e de `coverage.status`. `canonical` significa que a busca
considerou preservadas as facetas solicitadas; não prova, sozinho, que a
representação é uma convenção canônica da disciplina. `versatile` indica uma
representação transversal sem perda estrutural detectada; `substitute`, uma
aproximação que não preserva todas as facetas. Fora dos campos de protocolo,
esta documentação prefere “ajuste específico”, “uso transversal” e
“substituição”. Implementação: `src/resources/catalog/resourceCatalog.js`.

## Persistência, concorrência e sincronização

**Cache.** Cópia descartável usada para reduzir leitura ou recomposição. Um
cache nunca concede autoridade. No AraLearn, permissões desconhecidas ou
desatualizadas falham fechadas.

**Compare-and-swap (CAS).** Confirmação condicional que só grava quando a
revisão corrente ainda é a revisão lida pelo cliente. Nos contratos públicos,
o valor costuma aparecer como `expectedRevision`. Conflito exige nova leitura;
não é resolvido por sobrescrita silenciosa.

**Cursor.** Marcador opaco ou chave estável que permite continuar uma leitura
paginada ou um feed a partir do ponto confirmado. Não é a revisão da entidade,
a posição do card nem o cursor pedagógico salvo no progresso.

**Ledger da assistência.** Registro estruturado e limitado, mantido localmente
por card, que relaciona versões, patches, ramificações e o cursor ativo da
assistência por API. Ele permite desfazer, refazer e restaurar de forma
determinística; não é o histórico do workspace, uma trilha de auditoria remota
nem uma cópia integral do curso.

**Thread conversacional.** Sequência limitada de mensagens de usuário e
assistente usada como contexto durante a assistência por API. Pode conter
explicações ou pedidos sem mutação. Não substitui o ledger, não decide qual
versão do card está ativa e não é sincronizada como conversa permanente.

**Draft local (`draft`).** Estado autoral temporário no dispositivo. O prefixo interno
`authoring.localDraft` identifica essa classe de entrada no IndexedDB. Draft
não é publicação, réplica do catálogo nem autoridade remota.

**Idempotência de uma operação.** Propriedade pela qual repetir a mesma
intenção, com a mesma chave e o mesmo payload, recupera o resultado confirmado
sem aplicar a mutação novamente. `requestId` ou `mutationId` é uma chave de
deduplicação, não um “identificador idempotente”. O backend associa a chave a
um hash do pedido; reutilizá-la para outro payload é conflito. A retenção do
recibo varia por fluxo e não deve ser generalizada: por exemplo, operações de
governança educacional e estado pessoal usam sete dias, enquanto recibos de observações
de workspace recebem quatorze dias nas migrations correntes.

**Local-first no AraLearn.** Decisão de UX e persistência segundo a qual ações
suportadas são confirmadas primeiro no dispositivo e o estudo de material já
baixado não depende de rede. É uma qualificação de escopo, não a alegação de
que toda operação existe offline: login, primeira obtenção de conteúdo,
governança, catálogo editorial e autoria remota continuam dependentes do
backend.

**Materialização (`materialization`).** Composição de partes validadas numa representação concreta:
por exemplo, o workspace em um envelope integral para validação/publicação ou o
artefato remoto em linhas locais para estudo. Materializar não significa
publicar, selecionar nem conceder permissão.

**Outbox.** Fila durável de intenções locais ainda não confirmadas pelo
servidor. No banco IndexedDB corrente, a outbox relacional transporta a seleção
leve de cursos oficiais; outros estados pessoais possuem filas compactas
próprias. `pending`, `inflight`, `rejected` e `blocked` são estados não
resolvidos, não versões do curso.

**Projeção.** Forma derivada, otimizada para uma leitura ou interface. As
tabelas do IndexedDB são uma projeção normalizada do documento; Trilhas e
Coleções são projeções de navegação. Uma projeção não cria uma segunda fonte
de autoridade.

**Réplica local.** Conjunto de dados remotos materializado no dispositivo para
consulta e uso offline. Pode incluir uma projeção de um curso oficial, seleção
e estado pessoal. A réplica é atualizada e reconciliada; não é um fork autoral
nem um snapshot histórico.

**Revisão (`revision`).** Contador de concorrência de uma entidade mutável. Não equivale a
versão SemVer, hash de conteúdo, versão de package ou aceitação pedagógica.

**Publicação (`publication`).** Operação explícita que compõe e valida um curso, grava ou
reutiliza seu artefato imutável e atualiza uma referência autorizada. Conteúdo
materializado num workspace pode ser estudável antes disso; portanto,
materialização e publicação não são sinônimos.

**Snapshot.** Cópia integral de um estado em determinado instante. O workspace
remoto mantém composição corrente e eventos compactos, não snapshots
restauráveis a cada mutação. O artefato imutável de uma publicação pode fixar
uma composição integral, mas tem finalidade editorial e distributiva.

**Tombstone.** Registro compacto de retirada que preserva a informação de que
um objeto deixou de estar vigente. Ele impede que uma réplica antiga
ressuscite uma publicação removida; não conserva o conteúdo excluído.

**Watermark.** Maior ponto de um feed que um consumidor confirmou ou o menor
ponto ainda necessário entre consumidores ativos, conforme o contexto. É usado
para paginação e compactação segura; não é revisão de curso nem versão do app.

## Autoria, integração e autorização

**Action do GPT personalizado.** Superfície OpenAPI usada por um GPT
personalizado no ChatGPT. A Action traduz operações para o mesmo registry e o
mesmo executor da autoria MCP. Sua fachada OAuth confidencial existe por causa
do contrato do cliente e não constitui outro motor de autoria.

**Assistência por API.** Autoria contextual executada no aplicativo por um
provider configurado. A autoridade é derivada da seleção visual e limitada a
card, microssequência ou lição. No card, a conversa volátil conserva até oito
turnos e nove versões, suporta desfazer, refazer, restaurar e recompor quando o
card inteiro foi autorizado. Nada desse histórico é sincronizado.

**Autenticação (`authentication`).** Processo que estabelece qual conta está
operando. No app, MCP e Action, autenticar não concede por si só permissão para
um workspace ou para o catálogo: a identidade autenticada ainda passa pela
derivação de capacidades e pela autorização da operação concreta.

**Autorização (`authorization`).** Decisão feita para uma operação concreta sobre um alvo
concreto, considerando identidade autenticada, relações, capacidade efetiva e
estado corrente. A autorização é reavaliada no servidor e não pode ser
inferida de texto produzido por um modelo.

**Capacidade efetiva (`capability`).** Permissão para uma operação concreta, calculada a
partir da conta, do workspace, do papel local, do objeto e do estado corrente.
O fluxo correto é papel e relações → capacidades efetivas → autorização da
operação. Um papel, por si só, não autoriza uma escrita fora de seu contexto.

**GPT personalizado.** GPT configurado no ChatGPT com instruções, conhecimento
e uma Action. “Chatbot” é o rótulo atual da respectiva tela de configuração;
“Plugin” é o rótulo atual da integração MCP independente. Esses rótulos de
interface não alteram as denominações técnicas das duas superfícies.

**MCP.** Model Context Protocol. O AraLearn expõe um servidor/gateway MCP de
autoria por Streamable HTTP sem sessão de servidor, com versão de protocolo
`2025-11-25`, JSON-RPC, ferramentas e Resources MCP. O endpoint autentica cada
requisição com um access token OAuth e não emite `MCP-Session-Id`.

**OAuth 2.1 e PKCE.** O servidor MCP usa Authorization Code com PKCE `S256`
por meio do Supabase Auth. A Action usa uma fachada confidencial separada para
adequar-se ao cliente de GPT Actions; ambos convergem para a mesma identidade e
para as mesmas capacidades calculadas no banco.

**Papel (`role`).** Relação nominal de uma pessoa com um workspace ou com a governança
editorial. Papéis ajudam a derivar capacidades, mas não substituem a
verificação da operação e do recurso alvo.

**Permissão (`permission`).** Termo geral para a possibilidade de realizar uma ação. Na
documentação normativa, prefere-se **capacidade efetiva** para o resultado
calculado e **autorização** para a decisão final; o nome de um papel não é uma
permissão autossuficiente.

**Provider.** Serviço ou adaptador que produz a resposta estruturada da
assistência por API. A resposta do provider é proposta não confiável: schemas,
limites de escopo, validação semântica e CAS ainda precisam aceitá-la.

**Serviço HTTP local de integração com Codex CLI.** Processo de loopback
iniciado por `scripts/aralearnCodexBridge.mjs`, autenticado por token local e
restrito a origens permitidas. Esse é o significado técnico das ocorrências
históricas de “bridge local”; não é um backend alternativo do AraLearn.

**Workspace.** Agregado remoto mutável de autoria e colaboração. PostgreSQL
mantém uma linha corrente por entidade e uma revisão de concorrência. O
workspace pode conter vários cursos e pode aparecer em Trilhas antes de uma
publicação; ele não é um arquivo JSON, uma conversa, uma branch Git ou um
snapshot restaurável.

## Segurança e implantação

**Chave pública de acesso.** Credencial publicável do projeto Supabase,
permitida no site e no APK e sempre subordinada a Auth, RLS e políticas do
backend.

**Chave secreta do Supabase.** Credencial exclusiva do backend protegido. Na
implantação hospedada, o nome da chave é configurado por
`ARALEARN_SUPABASE_SECRET_KEY_NAME`. `SUPABASE_SERVICE_ROLE_KEY` aparece apenas
em automação local compatível com a CLI. O literal PostgreSQL/PostgREST
`service_role` continua sendo o nome de um papel do banco, não a recomendação
de nomenclatura para a credencial hospedada.

**Versão (`version`).** O termo sempre deve vir qualificado: versão SemVer de package,
identificador de contrato, revisão de entidade, `catalogVersion`, versão do
banco IndexedDB, versão do protocolo MCP ou versão do aplicativo. Esses valores
possuem ciclos e garantias distintos.
