# Glossário técnico

Este glossário fixa o sentido dos termos de computação usados na documentação
do AraLearn. Quando um identificador público aparece entre crases, sua grafia
faz parte do contrato e não deve ser traduzida. Os conceitos pedagógicos e de
pesquisa têm glossários próprios.

O glossário é um material de consulta, não o ponto inicial da leitura. Quem
busca compreender o sistema pela primeira vez deve começar por [Visão do
produto](visao-do-produto.md) e seguir o percurso de engenharia indicado no
[índice da documentação](README.md). Cada capítulo introduz os conceitos antes
de empregar os termos abaixo.

## Fundamentos de software e infraestrutura

**API (Application Programming Interface).** Interface pela qual dois
componentes de software trocam operações e dados segundo regras publicadas.
Uma API não precisa ter interface visual. No AraLearn, o navegador usa APIs do
próprio navegador, como IndexedDB; o aplicativo também usa APIs HTTP do
Supabase. A existência de uma API não concede acesso: autenticação e autorização
continuam necessárias.

**Backend.** Parte do sistema executada fora do dispositivo da pessoa usuária e
responsável por operações compartilhadas. O backend do AraLearn combina
PostgreSQL, autenticação, armazenamento de objetos e Edge Functions no
Supabase. Ele não renderiza os cards nem substitui a réplica local.

**Frontend.** Parte do sistema com a qual a pessoa interage. No AraLearn, é o
mesmo runtime web executado no navegador e dentro do WebView Android. “Mesmo
runtime” significa que regras de domínio, renderização e persistência local são
compartilhadas; o invólucro Android ainda possui responsabilidades nativas
próprias.

**Runtime.** Conjunto de código e serviços efetivamente carregado durante a
execução. Ele se distingue do código-fonte, dos scripts de build e dos
artefatos gerados. O runtime do AraLearn contém kernel, packages, telas,
persistência e sincronização que chegaram ao site ou ao APK validado.

**JSON.** Formato textual de intercâmbio composto por objetos, arrays, strings,
números, booleanos e `null`, padronizado pela
[RFC 8259](https://www.rfc-editor.org/rfc/rfc8259). JSON define uma sintaxe, não
o significado pedagógico dos campos. Por isso, o AraLearn combina JSON com
contratos, schemas e validadores semânticos.

**HTTP.** Protocolo de aplicação usado para pedidos e respostas entre clientes
e serviços, definido pela [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110).
Código de estado, cabeçalhos e corpo têm funções diferentes: um corpo JSON bem
formado não transforma uma resposta de erro em sucesso.

**Origem web (`origin`).** Combinação de protocolo, host e porta que delimita
uma fronteira de segurança no navegador. `https://exemplo.org` e
`http://exemplo.org` são origens distintas; portas diferentes também as
distinguem. Site, desenvolvimento local e WebView Android possuem origens
próprias para que armazenamento e permissões não se misturem.

**Banco de dados relacional.** Sistema que organiza dados em relações —
representadas operacionalmente por tabelas — com tipos, chaves, restrições e
transações. “Relacional” não significa apenas “dados em tabelas”: o modelo
permite declarar identidades e vínculos que o banco pode verificar. No
AraLearn, o PostgreSQL guarda o estado compartilhado; o IndexedDB guarda a
projeção e as filas locais.

**PostgreSQL.** Sistema gerenciador de banco de dados relacional usado como
fonte canônica do estado compartilhado. Ele executa transações, restrições,
funções e políticas de segurança. A [documentação do
PostgreSQL](https://www.postgresql.org/docs/current/) é a referência primária
para esses mecanismos.

**Supabase.** Plataforma que fornece, sobre PostgreSQL, autenticação, API de
dados, Storage, Edge Functions e ferramentas de implantação. O AraLearn usa
esses serviços como uma composição, e não como uma substituição do modelo de
domínio: contratos e regras do produto continuam no repositório e no banco.

**IndexedDB.** Banco transacional de objetos oferecido pelo navegador para
armazenamento persistente no dispositivo. Diferentemente de `localStorage`,
admite volumes maiores, índices e transações assíncronas. O AraLearn o escolhe
para manter réplica relacional, progresso e filas sem bloquear a interface. A
especificação é mantida pelo [W3C](https://www.w3.org/TR/IndexedDB/).

**Migration de banco de dados.** Alteração versionada que leva o schema e as
regras do banco de um estado conhecido ao seguinte. Pode criar tabelas,
restrições, índices, funções ou políticas e também transformar dados. Manter
migrations ordenadas permite reproduzir e auditar a evolução; editar apenas o
banco hospedado produziria um estado que o repositório não consegue explicar.

**Transação.** Unidade de trabalho confirmada integralmente ou desfeita
integralmente. Ela evita que uma operação composta deixe metade dos dados no
estado novo e metade no antigo. Transação não resolve, por si só, conflito entre
duas edições concorrentes; por isso o AraLearn também usa revisão e CAS.

**RLS (`Row-Level Security`).** Segurança em nível de linha do PostgreSQL. Uma
política RLS decide quais linhas uma identidade pode ler ou modificar mesmo que
o cliente tente formular outro pedido. É a última barreira de autorização no
banco, não um substituto para uma interface clara ou para validação anterior.
Consulte a [documentação oficial de
RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**RPC (`Remote Procedure Call`).** Chamada remota de uma operação implementada
como função do backend. No AraLearn, RPCs concentram mutações que precisam de
transação, autorização e invariantes comuns. Isso reduz a chance de clientes
diferentes recomporem regras críticas de maneiras divergentes.

**Storage de objetos.** Serviço para armazenar objetos integrais identificados
por uma chave, como os artefatos JSON imutáveis de publicação. É apropriado para
documentos grandes e endereçados por hash; já consultas relacionais e políticas
de vínculo permanecem no PostgreSQL. “Storage” sem qualificação pode também
designar armazenamento local, por isso a documentação explicita o serviço.

**Edge Function.** Função HTTP implantada na infraestrutura do Supabase e
executada próxima à borda da rede. No AraLearn, Edge Functions expõem autoria,
integração e leitura de revisões sem entregar credenciais administrativas ao
cliente. “Edge” descreve o local de execução; não elimina latência, validação ou
dependência de rede.

**WebView Android.** Componente nativo que executa conteúdo web dentro de um
aplicativo Android. O APK do AraLearn usa um WebView com origem HTTPS interna e
o mesmo frontend da web. Isso evita duas implementações do domínio, mas exige
configurar navegação, armazenamento, autenticação e comunicação nativa de modo
explícito.

**Service Worker.** Programa associado a uma origem web que pode interceptar
requisições e servir arquivos já armazenados. No site, ele mantém o shell da
aplicação disponível sem conexão. No APK, os arquivos já estão empacotados e
servidos pelo carregador nativo, portanto o funcionamento offline não depende
de um Service Worker.

**CORS (`Cross-Origin Resource Sharing`).** Mecanismo HTTP pelo qual um servidor
declara quais origens de navegador podem ler suas respostas. CORS limita a
leitura pelo frontend; não autentica a pessoa nem deve proteger sozinho uma
operação administrativa.

**CSP (`Content Security Policy`).** Política enviada ou declarada pela página
para restringir fontes de scripts, estilos, imagens e outras capacidades. No
AraLearn, ela reduz execução inesperada e impede avaliação dinâmica de código.
Renderizadores que normalmente dependeriam dessa avaliação usam variantes
compatíveis com a política, mantendo o funcionamento offline.

**Hash criptográfico.** Resumo de tamanho fixo calculado a partir de bytes. O
AraLearn usa SHA-256 para identificar conteúdo serializado
deterministicamente. Igualdade de hash é usada como identidade do artefato e
verificação de integridade; hash não cifra o conteúdo nem concede autorização.

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
renderer. É devolvido junto com o manifest e o schema por `contracts`, um
package e versão por chamada. Não é um contrato monolítico de todos os
resources.

**Contratos de desenho instrucional parametrizado.** Família versionada que
separa `InstructionalAnalysis`, `DesignParameterDefinition`,
`DesignParameterAssignment`, `EffectiveDesignSnapshot`,
`MaterializationManifest` e `ResourceSet`. Os schemas, validadores e entidades
relacionais já constituem estado aceito pelo backend; ainda não são schemas de
publicação ou de interface. A #104 os expõe por uma operação agrupada no MCP e
na Action; a #105 os projeta em linguagem comum na superfície visual. O modelo está em
[Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md).

**Análise instrucional (`InstructionalAnalysis`).** Documento imutável e
versionado que relaciona fontes, objetivo, unidades editoriais, pressupostos,
relações, conjuntos de coordenação e requisitos de explicação, evidência,
variação, fidelidade e representação. Não contém cards, conversa ou diagnóstico
de domínio individual.

**Definição de parâmetro (`DesignParameterDefinition`).** Descrição versionada
da identidade, tipo, unidade, escopos válidos, resolução, estatuto e limites de
um parâmetro. Seus tipos admitem inteiro, faixa, categoria, conjunto, vetor ou
relação; a definição não é o valor efetivo.

**Atribuição de parâmetro (`DesignParameterAssignment`).** Valor explícito e
versionado num escopo: proposta automática (`auto`), alteração estruturada
(`manual_override`) ou lock de pesquisa (`research_lock`), sempre com autoridade
e proveniência. “Herdado” não é uma atribuição gravada; é proveniência calculada
ao resolver o valor efetivo. Remoção é operação append-only, não edição da
versão anterior.

**Resolvedor de parâmetros.** Componente determinístico que percorre
`workspace → course → module → lesson → microsequence` e aplica
`nearest_scope_replaces`: primeiro prioriza `research_lock`, `manual_override`,
`auto` e default; dentro da classe vencedora, o ancestral aplicável mais próximo
substitui o valor completo. Duplicidade do mesmo modo no mesmo escopo falha e o
lock atua como barreira de autoridade separada. Parte não integra essa cadeia.

**Instantâneo efetivo de desenho (`EffectiveDesignSnapshot`).** Documento
compacto, imutável e persistido com valores já resolvidos, referências às
definições e atribuições, caminho, proveniência e versões exatas. Apesar do nome,
não é snapshot integral restaurável do workspace e não guarda conversa ou
raciocínio privado.

**Conjunto de resources (`ResourceSet`).** Conjunto imutável e versionado de
identidades exatas `package@version` que delimita o que pode ser escolhido num
escopo. Disponibilidade no conjunto, seleção autorizada no planejamento e
instância materializada são estados diferentes. O conjunto não copia todos os
contracts, não escolhe um package por card e não torna representações
equivalentes.

Na interface comum, o rótulo é **Resources**. O editor mostra resumo, famílias,
facetas e seleção paginada; não exige que a pessoa conheça `package@version` ou
configure cards individualmente. Quando há vários conjuntos efetivos, a pessoa
escolhe qual inspecionar: a UI não cria uma união implícita.

**Experimento instrucional (`Experiment`).** Agregado estável que coordena
revisões de protocolo, base comum, condições, variantes, enrollments e
atribuições. Não contém outcomes como se fossem propriedades do curso e não
transforma um teste técnico em resultado empírico.

**Revisão de protocolo (`ProtocolRevision`).** Registro imutável de hipótese,
base, fatores, condições explícitas, escopo, invariantes, regra de atribuição e
referências governadas de consentimento/instrumentos. Alterar qualquer desses
elementos cria outra revisão.

**Condição experimental (`ExperimentCondition`).** Tupla explícita que fornece
um valor para cada fator de uma revisão de protocolo. Não é inferida do nome da
variante e não nasce de produto cartesiano automático.

**Revisão de variante (`VariantRevision`).** Workspace/curso privado derivado
da base comum para uma condição, com mapa de escopo, locks, refs de desenho,
auditoria, diff e artefato próprios. Uma revisão congelada é imutável; reparo
gera outra revisão.

**Congelamento experimental (`VariantFreeze`).** Transição que fixa conteúdo,
hash, protocolo, condição, snapshots, manifesto, auditoria e diferenças
decididas antes da atribuição. Freeze é propriedade de reprodutibilidade, não
prova de eficácia ou fidelidade de uso.

**Enrollment experimental.** Vínculo de participação online que registra
política/revisão de consentimento e cria pseudônimo local ao experimento. O
vínculo de conta é anulável e não aparece no contexto MCP.

**Atribuição de participante (`ParticipantAssignment`).** Recibo append-only
que liga um enrollment a uma revisão congelada usando regra manual, aleatória
com seed versionada ou balanceada simples. A decisão é do servidor e nunca do
GPT ou do dispositivo offline.

**Knowledge autoral JIT.** Trechos versionados e recuperáveis que concentram
ciência, critérios, exemplos e políticas necessários ao passo corrente. O
seletor usa intenção, alvo e contexto para devolver no máximo oito trechos; não
transforma o prompt de sistema em catálogo de parâmetros ou revisão de
literatura e não substitui validação executável.

**Slice de desenho.** Projeção mínima de uma microssequência devolvida por
`gerirDesenhoInstrucional` com `read_slice`: brief e fontes pertinentes,
análise, assignments e locks aplicáveis, definições necessárias, snapshot e
`ResourceSet`s efetivos, blueprint, manifesto e findings relacionados. É
retomável sem conversa e não concede autoridade além do workspace.

**Binding do blueprint pedagógico.** Registro versionado que referencia uma
análise, um snapshot efetivo e um blueprint v2 e liga unidades e requisitos aos
passos correspondentes. Não duplica o blueprint nem o substitui por outro
contrato pedagógico.

**Diff factual de materialização.** Comparação determinística entre análise,
snapshot, binding e manifesto. Aponta incompatibilidades de identidade, passos,
cobertura declarada, seleção e uso de resources, sem gerar score nem decidir se
a explicação ou a prática é semanticamente adequada.

**Rodada de auditoria (`audit run`).** Registro imutável de uma auditoria sobre
uma revisão e materialização exatas. Conserva escopo, hash, algoritmo,
referências, checks e métricas; para Parte, congela também as microssequências
incluídas. Uma rodada sem finding distingue “checado nas regras cobertas” de
“não auditado”. Não é nota, publicação nem snapshot restaurável.

**Finding de conformidade.** Achado localizado que contém código, origem,
gravidade operacional, alvo, regra e evidência pública. Pode ter proposta de
reparo, mas não concede autorização para executá-la. Finding determinístico
decorre de regra calculável; finding `semantic_audit` decorre de julgamento
contextual explícito. Nenhum dos dois é medida de aprendizagem.

**Reauditoria.** Nova rodada posterior a uma correção confirmada. Relê o estado
corrente, verifica o finding reparado e procura regressões. Não é a reexibição do
relatório anterior nem uma nota livre anexada à correção.

**Estado legado não resolvido.** Projeção de workspace anterior ao desenho
parametrizado. Usa `unresolved` para análise e, quando já há conteúdo sem
manifesto, `legacy_untracked` para materialização e `legacy_unrestricted` para
disponibilidade, sem inventar valores ou `ResourceSet` retroativos.

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
operações-alvo das tarefas, taxonomia acadêmica, compatibilidades, limitações,
acessibilidade e permissões autorais. O manifest é metadado do package; não é
o manifesto de implantação da aplicação.

**Package.** Unidade instalável de representação ou resposta. Um package
implementa manifest, contrato autoral, schema, normalização, validação,
renderização, texto acessível e alvos editáveis. Packages de conteúdo também
declaram alvos de prática; packages de resposta implementam avaliação. Os ids
seguem `aralearn.resource.*` ou `aralearn.response.*` e as versões seguem
SemVer estrito. Implementação: `src/resources/packages/` e
`src/resources/kernel/packageRegistry.js`.

**Sessão textual observável (`terminal_session`).** Resource de conteúdo
`aralearn.resource.terminal_session` que preserva uma sequência ordenada de
entradas, respostas textuais e efeitos sob ambiente e contexto declarados. É um
registro para leitura e prática determinística por lacuna de escolha na entrada;
não executa ou interpreta comandos, não acessa ambiente externo e não substitui
prática real. Difere de `code` (fonte ou configuração estática), `table`
(registros comparáveis) e `paragraph` (prosa expositiva). Implementação:
`src/resources/packages/terminal-session/`.

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
“substituição”. Os tokens descrevem cobertura, mas não autorizam seleção: a
política efetiva e o mesmo `ResourceSet` precisam admitir package, papel e
ajuste. Implementação: `src/resources/catalog/resourceCatalog.js`.

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

**Manifesto de materialização (`MaterializationManifest`).** Documento
imutável e versionado que liga análise, parâmetros efetivos, blueprint, resources
selecionados e conteúdo realmente produzido. Pode registrar cobertura com
numerador, denominador e referências, limitações e métricas derivadas com
algoritmo versionado. Não é artefato de publicação, avaliação de estudante nem
parecer semântico concluído. Cada seleção identifica o `ResourceSet` que a
autorizou; a instância materializada referencia a seleção.

**Outbox.** Fila durável de intenções locais ainda não confirmadas pelo
servidor. No banco IndexedDB corrente, a outbox relacional transporta a seleção
leve de cursos oficiais; outros estados pessoais possuem filas compactas
próprias. `pending`, `inflight`, `rejected` e `blocked` são estados não
resolvidos, não versões do curso.

**Fila offline do desenho.** Entrada fracionada de `syncState` que conserva
somente intenções de override manual ou restauração de Auto. É não canônica,
fica separada do snapshot remoto e precisa revalidar revisão, capacidade e
locks ao sincronizar. Não cria `ResourceSet`, não altera lock e não concede
autoridade de pesquisa.

**Projeção.** Forma derivada, otimizada para uma leitura ou interface. As
tabelas do IndexedDB são uma projeção normalizada do documento; Trilhas e
Coleções, o Mapa de Autoria e o estado compacto de Workspaces são projeções de
navegação. Uma projeção não cria uma segunda fonte de autoridade.

**Estado de produto do workspace.** Projeção revisionada usada na lista de
Autoria: `planning`, `building`, `audit_pending` ou `ready`. O estado deriva da
composição corrente, análises vigentes e findings ativos; não é score, não usa
contagem de cards como meta e não depende de a pessoa ter visitado o workspace
naquele dispositivo.

**Fatia offline de desenho.** Última projeção sincronizada de uma
microssequência, mantida por conta no IndexedDB. Pode sustentar leitura e uma
fila limitada de override/Auto, mas não concede autoridade, não cria condição
de pesquisa e não substitui o snapshot efetivo remoto.

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
uma composição integral, mas tem finalidade editorial e distributiva. O termo
`EffectiveDesignSnapshot` é uma exceção nominal explícita: ele congela apenas os
valores e referências do desenho efetivo, não o workspace inteiro.

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
e uma Action. Ele é uma interface externa de linguagem natural para a Autoria;
o aplicativo não contém chat autoral interno. Clientes MCP independentes usam o
mesmo executor e os mesmos contratos, ainda que seu procedimento de instalação
seja diferente.

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
## Analytics versionados

- **DatasetSetRef**: referência opaca que fixa dataset, escopo e revisões
  relevantes durante paginação ou exportação.
- **OverviewSetRef**: pin do resumo visual; mudança de progresso ou outcome
  produz outra versão mesmo sem alterar o conteúdo autoral.
- **Outcome explícito**: observação append-only ligada a instrumento, onda,
  condição, variante e pseudônimo, ou motivo de ausência.
- **Dicionário de métrica**: definição imutável/versionada de pergunta, unidade,
  derivação, denominador, ausências, interpretação e limites.
- **Pseudônimo local**: identificador de participante válido somente dentro do
  experimento e não equivalente a `user_id`.
