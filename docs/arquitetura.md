# Arquitetura do AraLearn

Este documento explica como o AraLearn distribui responsabilidades entre a
aplicação executada no navegador ou no Android e os serviços remotos. O objetivo
não é ensinar a sintaxe dos arquivos-fonte, mas tornar compreensíveis as
decisões que determinam segurança, funcionamento sem conexão, custo de
armazenamento, concorrência de autoria e extensibilidade dos recursos de card.

Arquitetura de software é a organização das partes relevantes de um sistema,
das relações entre elas e das restrições que orientam sua evolução. Uma
descrição arquitetural, portanto, precisa responder a três perguntas:

1. qual componente é responsável por cada dado ou operação;
2. por que essa responsabilidade foi colocada ali;
3. o que acontece quando rede, autorização ou concorrência falham.

## Vocabulário necessário

As definições abaixo bastam para acompanhar este capítulo. O
[glossário técnico](glossario-tecnico.md) apresenta distinções e referências
adicionais.

- **Android Package (APK)**: arquivo instalável que distribui o aplicativo no
  Android;
- **HTML, CSS e JavaScript**: tecnologias que, respectivamente, estruturam,
  apresentam e dão comportamento à aplicação web;
- **WebView**: componente do Android que incorpora um motor de navegador dentro
  do APK e permite executar a mesma interface web;
- **Supabase**: plataforma de serviços remotos usada pelo AraLearn; seu Auth
  verifica identidade e sessão, seu Storage conserva objetos e suas Edge
  Functions executam código protegido no servidor;
- **PostgreSQL**: banco de dados relacional que conserva estado compartilhado;
- **PostgREST**: componente que oferece operações do PostgreSQL por uma
  interface web;
- **Hypertext Transfer Protocol (HTTP)**: protocolo usado nas requisições entre
  a aplicação e os serviços; uma **interface de programação de aplicações
  (API)** define quais operações e dados podem ser trocados por esse protocolo;
- **Remote Procedure Call (RPC)**: função do banco chamada pela API para
  executar uma operação transacional de domínio;
- **Indexed Database API (IndexedDB)**: banco de objetos local oferecido pelo
  navegador para conservar dados estruturados no dispositivo;
- **fonte de autoridade**: componente cujo estado decide o valor válido numa
  determinada operação;
- **workspace**: espaço de autoria mutável, composto por entidades correntes no
  PostgreSQL;
- **artefato**: documento integral e imutável produzido por materialização;
- **materialização**: composição e validação das partes de um curso para gerar
  um documento concreto;
- **snapshot efetivo de desenho**: registro compacto e imutável dos parâmetros,
  fontes de resolução e `ResourceSet`s usados no desenho de um escopo; não é
  cópia restaurável do workspace;
- **conjunto de resources** (`ResourceSet`): lista versionada de
  `package@version` que estava disponível numa condição, distinta do package
  selecionado e da instância materializada;
- **hash**: resumo de tamanho fixo calculado a partir de bytes; no AraLearn,
  SHA-256 identifica o conteúdo canônico e permite detectar se o documento
  recebido difere daquele que foi publicado;
- **projeção**: representação derivada, organizada para uma consulta ou tela;
- **réplica local**: subconjunto sincronizado necessário para operar no
  dispositivo; não é cópia integral do backend;
- **cache**: dado derivado que pode ser descartado e reconstruído e, por isso,
  não concede permissão;
- **Service Worker**: script controlado pelo navegador que pode interceptar
  requisições da aplicação e responder com arquivos previamente armazenados;
  no AraLearn, ele mantém o shell estático disponível sem conexão, mas não
  substitui o IndexedDB nem concede acesso a dados protegidos;
- **pacote de recurso** (`package`): módulo versionado que define contrato,
  validação, renderização e
  comportamento de uma representação ou resposta de card;
- **núcleo** (`kernel`): componente que conhece a composição geral dos cards e a
  interface dos pacotes, sem conhecer o formato interno de cada representação.

## Visão geral

O AraLearn executa a mesma aplicação web na hospedagem estática e no APK. O
APK contém um WebView Android e os mesmos arquivos JavaScript, CSS e HTML da
versão web; não há uma segunda implementação nativa do domínio.

```text
interface web ou WebView Android
├── núcleo de cards e pacotes de recursos
├── regras de estudo e autoria situada
├── IndexedDB por conta
└── cliente HTTP autenticado
        │
        ▼
Supabase gerenciado
├── Auth: identidade e sessão
├── PostgreSQL/PostgREST: estado corrente, permissões e RPCs
├── Storage: revisões imutáveis de cursos
└── Edge Functions: autoria externa e entrega protegida de revisões
```

Essa composição não significa que todas as camadas sejam intercambiáveis. O
PostgreSQL, o Auth, o PostgREST, o Storage e as Edge Functions formam os
serviços remotos operacionais vigentes. Um servidor PostgreSQL isolado ou outro
conjunto de serviços somente seria equivalente depois de implementar e testar
esses contratos.

## Decisão 1 — aplicação estática com serviços remotos especializados

### Problema

O produto precisa funcionar na web e no Android, continuar leve no dispositivo
e oferecer autenticação, autorização por usuário, sincronização, autoria
concorrente e distribuição de cursos.

### Alternativas consideradas

- manter duas aplicações nativas independentes, uma web e outra Android;
- executar um servidor de aplicação próprio que renderizasse todas as telas;
- distribuir uma aplicação estática e delegar persistência e identidade a um
  backend gerenciado.

### Decisão e funcionamento

O AraLearn adota a terceira alternativa. A interface é um artefato estático; a
mesma base é empacotada no APK. Operações locais usam APIs do navegador. As
operações que exigem identidade, coordenação entre contas ou publicação passam
pelas interfaces do Supabase.

### Consequências

- correções de interface e de domínio chegam aos dois destinos pela mesma base;
- a hospedagem do front-end não precisa executar código do servidor;
- o APK pode estudar material já sincronizado sem depender da disponibilidade
  imediata do site;
- o funcionamento completo depende dos serviços remotos declarados no contrato
  de implantação.

### Limites e evidência

O repositório valida GitHub Pages e Supabase gerenciado. Servidor estático
institucional é um caminho disponível que ainda precisa de ensaio no destino.
Supabase auto-hospedado, SharePoint/SPFx e outro backend não possuem automação
nem suíte de conformidade. A verificação executável está em
`scripts/verifyDeploymentArtifacts.ps1`, nos testes Android e no roteiro de
[Implantação](implantacao.md#formas-de-implantação).

## Decisão 2 — três formas de persistência, cada uma com uma função

### Problema

Um único armazenamento teria de atender simultaneamente a quatro necessidades
incompatíveis: alteração frequente de partes pequenas, distribuição eficiente
de cursos integrais, estudo offline e dados pessoais por conta.

### Alternativas consideradas

- guardar todo o curso em uma única coluna JSON do PostgreSQL e regravá-la a
  cada edição;
- decompor também cada publicação em uma segunda árvore relacional remota;
- guardar snapshots integrais de todas as operações de autoria;
- separar estado mutável, artefato publicado e réplica do dispositivo.

### Decisão e funcionamento

O AraLearn separa responsabilidades:

| Componente | Conteúdo mantido | Razão principal |
| --- | --- | --- |
| PostgreSQL | partes correntes do workspace, estado instrucional versionado, metadados, permissões, seleções, grupos, estado pessoal e ponteiros de publicação | transações, relações, restrições e coordenação concorrente |
| Supabase Storage | documento JSON integral de cada revisão publicada | distribuição de objetos imutáveis sem duplicar a árvore no banco |
| IndexedDB | projeção dos cursos necessários, estado local e filas pendentes da conta autenticada | leitura e escrita transacionais no dispositivo, inclusive sem rede |

Durante a autoria, `private.authoring_workspace_entities` conserva uma linha
por projeto, curso, módulo, lição, tópico, microssequência ou card. Na
publicação, o servidor recompõe a árvore, valida `aralearn.library.v1`, calcula
o SHA-256 e grava uma única revisão integral no Storage. No dispositivo, essa
revisão é validada e projetada em object stores do IndexedDB. Análises,
assignments, `ResourceSet`s, snapshots efetivos, blueprints v2 e manifestos usam
tabelas relacionais próprias: são referências de desenho e proveniência, não
uma duplicação da árvore publicada.

### Consequências

- editar um título não reenvia o curso inteiro;
- estudar um curso não exige remontar sua árvore no PostgreSQL;
- a tela pode consultar entidades por identidade e posição localmente;
- o banco remoto conserva relações e autoridade, enquanto o Storage absorve o
  volume dos documentos publicados;
- a réplica local continua disponível quando a conexão desaparece.

### Limites e evidência

IndexedDB oferece object stores, índices e transações; não oferece SQL nem
converte a aplicação num SGBD relacional. A réplica também não contém todos os
workspaces ou cursos da instalação. A separação é implementada em
`src/persistence/IndexedDbRelationalStore.js`,
`private.authoring_workspace_entities` e
`supabase/functions/_shared/aralearn-authoring/artifactStore.js`. A
especificação do navegador está em [Indexed Database API
3.0](https://www.w3.org/TR/IndexedDB/).

## Decisão 3 — cursos publicados como artefatos endereçados pelo conteúdo

### Problema

Uma publicação precisa identificar exatamente o documento distribuído. Um
nome de arquivo mutável permite que o conteúdo mude sem que a referência mude,
o que dificulta validação, cache, submissão editorial e diagnóstico.

### Alternativas consideradas

- sobrescrever sempre `curso.json`;
- usar somente um número sequencial de versão;
- derivar a identidade física do objeto de um hash criptográfico do conteúdo
  canônico.

### Decisão e funcionamento

O documento é serializado de forma determinística e recebe um hash SHA-256. O
caminho no bucket deriva desse hash:

```text
artifacts/sha256/ab/cd/abcdef...json
```

O objeto não é sobrescrito. Um registro no PostgreSQL aponta para o hash
corrente do curso; uma submissão editorial aponta para o hash exato que foi
enviado. Atualizar um curso significa produzir outro artefato e trocar o
ponteiro mediante comparação da base esperada.

Esse modelo é chamado **armazenamento endereçado por conteúdo**: a identidade
do objeto depende dos bytes que ele contém. O princípio é semelhante ao dos
objetos do Git, embora o formato e o protocolo do AraLearn sejam próprios.

### Consequências

- o cliente confere integridade antes de instalar uma revisão;
- duas publicações byte a byte iguais podem reutilizar o mesmo objeto;
- caches não confundem conteúdo novo com um caminho antigo;
- a revisão examinada editorialmente permanece identificável mesmo depois de
  nova edição no workspace.

### Limites e evidência

SHA-256 comprova igualdade dos bytes canônicos recebidos; não comprova autoria,
qualidade pedagógica ou ausência de conteúdo malicioso. O artefato continua
dependente de validação contratual e autorização. A implementação e os testes
estão no `artifactStore.js`, em `canonicalJson.js`, na migration
`20260728010000_storage_artifact_control_plane.sql` e em
`tests/runtime/authoring-artifact-store.test.js`.

## Decisão 4 — workspace composto em vez de snapshots por comando

### Problema

Cursos podem crescer para milhares de partes. Guardar o documento integral
depois de cada correção multiplicaria armazenamento, CPU de serialização e
tráfego, especialmente sob limites de um projeto compartilhado.

### Alternativas consideradas

- snapshot integral por alteração;
- log completo de eventos capaz de reconstituir qualquer estado;
- uma linha corrente por entidade, acrescida de recibos de idempotência e
  resumos operacionais limitados.

### Decisão e funcionamento

O workspace conserva somente a versão corrente de cada entidade. Uma mutação
informa a revisão global e as versões esperadas das partes tocadas. O servidor
bloqueia a raiz, compara essas revisões, aplica a alteração mínima, recompõe e
valida o documento e então avança a revisão.

Eventos recentes registram operação e resumo; não são snapshots nem permitem
restaurar arbitrariamente um estado antigo. O histórico temporário da
assistência no card também é volátil e não se confunde com versionamento do
curso.

### Estado instrucional versionado

O documento corrente do curso continua mutável por entidade. Em paralelo, os
artefatos que registram **qual desenho fundamentou uma materialização** são
imutáveis e versionados:

```text
InstructionalAnalysis
  → valores resolvidos + ResourceSet(s) no EffectiveDesignSnapshot
  → binding do blueprint pedagógico v2
  → MaterializationManifest
```

Definições de parâmetros são catalogadas por identidade e versão. Assignments
formam um histórico append-only: uma remoção é outra operação versionada, não a
reescrita do registro anterior. A resolução deriva no servidor o caminho
`workspace → course → module → lesson → microsequence`; o cliente não escolhe a
ancestria. Parte não aparece nessa cadeia porque coordena trabalho humano–GPT,
mas não é unidade pedagógica nem entidade de herança.

A resolução prioriza `research_lock`, `manual_override`, `auto` e default. Em
cada classe de autoridade, o ancestral aplicável mais próximo substitui o valor
completo (`nearest_scope_replaces`), inclusive para conjuntos, vetores e
relações. Duas atribuições atuais do mesmo modo no mesmo escopo são conflito. Um
lock é barreira independente e impede substituição inferior. Ausência de valor
requerido permanece não resolvida; ordem de propriedades JSON nunca decide
precedência.

Cada blueprint persistido preserva o contrato pedagógico v2 e referencia a
análise e o snapshot exatos. O binding liga unidades e requisitos aos passos sem
copiar ou reduzir o blueprint. Depois da materialização, o manifesto referencia
um único snapshot, o blueprint e as revisões materializadas. Uma projeção de
diff compara apenas identidades, passos, cobertura declarada e resources; a
auditoria semântico-instrucional continua responsabilidade separada.

### Estado experimental e variantes congeladas

O contador corrente do workspace não preserva uma versão histórica. Para um
experimento, a base precisa apontar para a publicação imutável aprovada e seu
hash. O servidor deriva cada condição num workspace filho privado, preserva o
mapeamento da subárvore e grava locks ligados à revisão do protocolo. A base
autoral continua separada e nenhum participante se torna membro desses espaços.

```text
base publication artifact
  -> protocol revision + explicit condition
  -> child workspace/course + research locks
  -> design artifacts + audit + diff
  -> frozen variant artifact
  -> pseudonymous enrollment assignment
```

O freeze revalida conteúdo, snapshots, manifesto, auditoria e diff no mesmo
fence e então impede novas escritas de conteúdo, desenho e publicação daquela
revisão. Um reparo cria outro workspace/revisão filha. Essa escolha evita que a
linha corrente do curso adultere retroativamente uma intervenção já atribuída.

O control plane humano usa uma Action exclusiva do aplicativo e uma capacidade
`research`. Ela não entra no registry MCP/OpenAPI. O GPT recebe apenas o
contexto bounded de uma variante já criada e continua usando as operações
comuns de materialização sob locks. Uma operação semântica pode classificar
hunks factuais, mas decisão, seed, consentimento, atribuição e freeze permanecem
fora dessa superfície.

Enrollment e assignment são tabelas separadas do membership. O primeiro liga
consentimento versionado a um pseudônimo local; o segundo é append-only e fixa
curso, hash e revisão. A distribuição usa a seleção privada já compreendida por
Trilhas, por isso a variante sincronizada abre offline sem revelar outras
condições. Novo enrollment ou assignment exige rede e serialização do servidor.

### Consequências

- o custo cresce com a estrutura atual, não com o número histórico de
  comandos;
- cópia e movimento podem operar sobre subárvores específicas;
- a aplicação consegue detectar concorrência sem executar merge silencioso;
- auditoria operacional existe, mas não equivale a um repositório Git.

### Limites e evidência

O workspace aceita até 10 mil partes, 1 MiB por parte e 32 MiB recomposto. Os
eventos recentes têm limite de 200 por workspace. Não existe restauração geral
de revisões. Esses limites são aplicados em `workspaceEngine.js`,
`workspaceIncremental.js` e nas migrations de autoria. O modelo completo está
em [Workspaces compostos e artefatos](plano-de-controle-e-artefatos.md).

## Decisão 5 — concorrência otimista, CAS e idempotência

### Problema

Duas abas ou duas ferramentas podem editar a mesma base. Além disso, uma
operação pode ser confirmada no servidor e a resposta se perder na rede. Sem
proteções distintas, o primeiro caso sobrescreve trabalho; o segundo duplica a
intenção ao repetir a requisição.

### Decisão e funcionamento

O AraLearn combina dois mecanismos:

- **compare-and-swap (CAS)**: a gravação só ocorre se a revisão corrente ainda
  for a revisão que o cliente leu;
- **idempotência**: `requestId` ou `mutationId` identifica a intenção, e o
  servidor associa esse identificador ao hash do payload e ao recibo.

CAS protege contra base obsoleta. Idempotência protege contra repetição da
mesma intenção depois de timeout. Reutilizar a mesma chave com payload diferente
é conflito, não uma nova operação.

### Consequências

- conteúdo concorrente não é combinado sem conhecimento da pessoa;
- uma resposta perdida pode ser consultada novamente sem duplicar a escrita;
- o cliente precisa reler e reaplicar conscientemente quando a base avançou;
- recibos possuem políticas de retenção próprias e não formam histórico
  permanente.

### Limites e evidência

CAS não resolve semanticamente duas edições conflitantes; apenas impede a
sobrescrita. Idempotência só vale no escopo e na janela definidos pelo fluxo.
As transações e bloqueios seguem as garantias do PostgreSQL descritas em
[Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
e [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html).

## Decisão 6 — réplica local para continuidade, não autoridade offline

### Problema

O uso móvel inclui perda de sinal, retomada depois de interrupções e latência
variável. Fazer cada toque esperar uma consulta remota prejudicaria a leitura e
impediria estudo no metrô ou em redes instáveis.

### Decisão e funcionamento

Cursos já baixados, cursor, conclusão estrutural, marca **Rever**, observações e
operações pendentes permanecem no IndexedDB da conta. A interação de estudo é
confirmada localmente e a sincronização ocorre em canal posterior. Cada conta
usa banco identificado por UUID; trocar de conta abre outro namespace.

O estado de desenho previamente sincronizado usa fatias por workspace e
microssequência no `syncState`, sem criar um segundo banco local. A fatia remota
é o único estado apresentado como canônico. Uma fila separada pode conservar
apenas a intenção de definir override manual ou restaurar Auto; ela não altera o
snapshot em cache, não cria `ResourceSet`, não concede autoridade de pesquisa e
não modifica locks.

`AuthoringWorkspaceClient` coordena lista, Mapa, fatias, findings e editor de
Resources sobre a réplica explicitamente vinculada ao usuário. O índice global
das filas permite sincronização limitada na inicialização, reconexão e saída,
inclusive para um workspace aberto por link direto. Caches de lista e overview
são best-effort e monotônicos: falhar ao gravá-los não invalida a resposta
remota, e uma leitura antiga não substitui revisão mais nova de outra aba.

Ao recuperar conexão, o cliente envia pendências, recebe mudanças remotas em
páginas e instala novas revisões somente depois de validar contrato e hash. Um
cache offline nunca concede edição, exclusão ou capacidade editorial: essas
capacidades ficam falsas até nova leitura autenticada completa. Para o desenho,
a sincronização relê revisão, capacidade e locks antes do envio e só retira a
intenção da fila depois de armazenar a nova fatia confirmada pelo servidor.

### Consequências

- o caminho crítico do estudo não depende da rede;
- fechar o aplicativo não descarta operações já registradas;
- a pessoa pode continuar com a revisão válida anterior se um download falhar;
- revogação de acesso somente pode ser conhecida na próxima sincronização.

### Limites e evidência

Primeiro login, primeiro download, autoria externa, governança, alterações de
lock e publicação continuam dependentes de rede. A implementação está em
`IndexedDbRelationalStore.js`, `RelationalSyncEngine.js` e
`TrailPersonalStateRepository.js`, além de `WorkspaceDesignOfflineStore.js` para
o desenho parametrizado; os testes relevantes incluem
`workspace-design-offline-store.test.js`, `workspace-offline-authoring.spec.js`
e `study-card-progression.spec.js`.

## Decisão 7 — kernel pequeno e packages autônomos

### Problema

Representações acadêmicas têm estruturas diferentes. Uma matriz, um grafo, uma
glosa interlinear e uma reação química não deveriam compartilhar um contrato
monolítico cheio de campos opcionais nem exigir alteração do núcleo a cada novo
tipo.

### Alternativas consideradas

- um contrato geral com uma enumeração crescente de tipos;
- renderizadores condicionais dentro do leitor;
- envelope estável de card e packages versionados, registrados por interface.

### Decisão e funcionamento

O kernel conhece os slots `content`, `response` e `feedback`, a identidade da
instância e a interface obrigatória de um package. Cada package declara seu
manifest, contrato autoral de alto nível, schema, validação semântica,
renderer, acessibilidade, alvos textuais e, quando aplicável, alvos de prática
ou avaliação.

O catálogo deriva descrições e facetas dos packages instalados. A autoria busca
pela intenção, inspeciona poucos candidatos e carrega somente os contratos
escolhidos. Acrescentar um package compatível exige atualizar o índice gerado e
os testes do package, não introduzir um ramo no kernel.

### Consequências

- o crescimento da biblioteca não amplia indefinidamente um contrato central;
- correções de um renderer ficam localizadas;
- a ferramenta de autoria recebe linguagem de alto nível antes de receber JSON
  detalhado;
- compatibilidade entre conteúdo e resposta é validada explicitamente.

### Limites e evidência

Modularidade não garante, por si, adequação acadêmica ou acessibilidade. Cada
package ainda precisa de corpus, testes visuais e revisão pedagógica. O kernel
implementa apenas o subconjunto de JSON Schema usado pelo catálogo, sem alegar
conformidade integral com JSON Schema 2020-12. Consulte [Contratos públicos de
conteúdo](aralearn-contract.md) e [Packages de card](recursos-de-card.md).

## Decisão 8 — autorização derivada de relações e estado

### Problema

Um nome de papel isolado não responde a perguntas como “esta pessoa pode editar
este card deste workspace nesta revisão?”. A autorização depende do papel, do
vínculo com o workspace, do objeto-alvo, do destino da publicação e do estado
corrente.

### Decisão e funcionamento

O PostgreSQL deriva capacidades contextuais e as revalida em cada operação.
Row-Level Security (RLS) restringe as linhas visíveis ou graváveis pelo cliente;
RPCs e Edge Functions sensíveis conferem também a operação e o alvo. A ausência
de capacidade confirmada resulta em negação.

O aplicativo recebe somente a URL do projeto e a chave publicável. Segredos
administrativos permanecem em processos protegidos. A documentação do
PostgreSQL explica que, com RLS habilitada e sem política aplicável, o
comportamento é de negação por padrão: [Row Security
Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### Consequências

- papel editorial global não expõe automaticamente progresso ou observações
  pessoais;
- um membro pode ter capacidades diferentes em workspaces distintos;
- a interface pode apresentar controles a partir da projeção autenticada, mas
  o servidor continua sendo a autoridade;
- cache, erro de rede ou capacidade desconhecida não liberam escrita.

### Limites e evidência

RLS é parte da defesa, não sua totalidade. Funções `SECURITY DEFINER` precisam
fixar `search_path`, limitar `EXECUTE` e verificar a conta internamente. Esses
aspectos são exercitados pelos testes pgTAP, PostgREST e pelas jornadas com duas
contas descritas em [Supabase](supabase.md).

## Organização didática e publicação

A árvore didática segue esta hierarquia:

```text
curso
└── módulo
    └── lição
        ├── tópicos
        └── microssequências
            └── cards
```

O envelope `aralearn.library.v1` transporta a árvore completa. O estado de
autoria não introduz categorias burocráticas dentro do documento didático:
uma microssequência com cards já pode ser estudada. A publicação é uma operação
separada que materializa e referencia uma revisão.

Uma revisão privada pode ser `partial` ou `complete`; o destino de catálogo
aceita apenas `complete`. Esses valores pertencem ao controle de publicação,
não à navegação cotidiana do estudante. O percurso editorial é:

```text
workspace privado estudável
→ revisão privada exata
→ submissão editorial
→ revisão em workspace independente
→ publicação em Coleções
```

Estudo projeta em Trilhas os cursos selecionados. Autoria projeta Workspaces
acessíveis e Coleções organiza o catálogo global. A semelhança visual entre
cartões não transfere autoridade: grupos de Trilhas pertencem à conta;
workspaces dependem da relação local e coleções pertencem ao plano editorial.

## Superfície responsiva de Autoria

`AuthoringWorkspaceSurface` é uma fachada visual sobre o mesmo estado operado
por MCP/Action. Mapa, Desenho, Conteúdo e Auditoria são destinos registrados,
não um dashboard simultâneo. O registro admite Resultados como extensão
contextual. `authoringWorkspaceProjection` converte outline, resume e desenho
em estados de produto; `authoringWorkspaceViewModel` normaliza essa projeção
para renderização sem perder referências estruturadas.

O PostgreSQL calcula uma projeção compacta de estado por workspace e, quando
solicitado, por microssequência. O engine cerca essa leitura com a revisão do
outline; a UI não depende de uma fatia já visitada nem de contagem de cards como
meta. Conteúdo usa `lessonEditorApp`, a composição paginada vinculada ao curso
do workspace e um snapshot transitório de navegação para abrir workspaces que
não estão visíveis em Trilhas e restaurar Estudo ao sair.

No celular, apenas um destino ocupa a área principal; no desktop, os mesmos
destinos usam rail vertical. O código e o APK são os mesmos. Resources combina
paginação remota do conjunto efetivo com busca/facetas do catálogo local da
mesma versão, preserva membros invisíveis e aplica mudanças por escopo sob CAS.

## Autoria situada e integrações externas

Na interface, a edição manual e a assistência selecionam apenas objetos e
caminhos textuais autorizados. O contexto adjacente pode ser lido, mas não
amplia a área gravável. No card, uma conversa volátil mantém até oito turnos e
nove versões para desfazer, refazer e restaurar; esse histórico não é enviado
ao Supabase.

A autoria extensa pode chegar por dois adaptadores:

- servidor MCP protegido por OAuth 2.1 com PKCE;
- Action descrita por OpenAPI, com fachada OAuth confidencial compatível com o
  cliente correspondente.

Os adaptadores convergem para o mesmo registro de ferramentas e o mesmo
executor. Protocolos de autenticação diferentes não significam motores de
autoria diferentes. A autoridade efetiva continua sendo calculada pela conta
conectada e pelo alvo da operação.

O fluxo GPT–AraLearn preserva quatro responsabilidades separadas:

| Camada | Responsabilidade |
| --- | --- |
| prompt de sistema | protocolo e invariantes estáveis; não enumera parâmetros nem teoria |
| knowledge JIT | ciência, critérios, exemplos e políticas recuperáveis para o passo corrente |
| MCP/Action | operações tipadas de leitura e mutação, com revisão, idempotência e autoridade |
| workspace | estado persistente canônico; conversa e cache offline não são autoridade |

`gerirDesenhoInstrucional` expõe o mesmo serviço fechado pelos dois
adaptadores. `read_slice` entrega o menor contexto suficiente de uma
microssequência; as demais operações consultam um contrato promovido, gravam
análise e assignments, persistem `ResourceSet`, resolvem o snapshot, vinculam o
blueprint v2 e registram o manifesto. O ciclo é retomável sem transcript e
mantém a ordem análise → parâmetros → snapshot → disponibilidade → descoberta
progressiva → blueprint → cards derivados → manifesto. Quando Auto precisa de
um conjunto novo, o servidor expande facetas contra o catálogo instalado e
congela referências exatas antes de o assignment citá-lo.

Na biblioteca, `workspaceId` e `snapshotRef` formam contexto confiável. A busca
é filtrada pelos conjuntos efetivos, cada chamada `contracts` devolve somente
uma versão e a seleção identifica o conjunto que autorizou package, papel e
ajuste. Sem contexto, o modo legado é explicitamente irrestrito e não prova
conformidade com desenho parametrizado.

## Mapa do código

| Diretório | Responsabilidade arquitetural |
| --- | --- |
| `src/domain/` | contrato da árvore didática e invariantes de domínio |
| `src/authoring/` | contratos, validação, resolução, `ResourceSet`, binding, diff e protocolo experimental |
| `src/resources/kernel/` | envelope de card, registro de packages e validação comum |
| `src/resources/catalog/` | vocabulário controlado, busca e política de seleção |
| `src/resources/packages/` | contratos, validação e renderização de cada package |
| `src/render/` | composição das instâncias no card |
| `src/persistence/` | projeção, montagem e transações locais |
| `src/sync/` | identidade do dispositivo e canais de sincronização |
| `src/supabase/` | Auth, HTTP, catálogo e configuração pública |
| `src/assist/` e `src/generation/` | escopos, providers e assistência contextual |
| `src/ui/` | navegação, estudo, edição, superfície responsiva de Autoria e retorno contextual |
| `supabase/migrations/` | evolução versionada do esquema e das funções SQL |
| `supabase/functions/` | interfaces HTTP protegidas e entrega de artefatos |

## Propriedades demonstradas e propriedades ainda abertas

Os testes automatizados demonstram contratos executáveis, isolamento entre
contas nos cenários cobertos, troca atômica da réplica, validação de hashes,
recusa de revisões obsoletas, resolução determinística do desenho, fronteiras de
`ResourceSet`, integração MCP/Action do slice e das mutações tipadas,
funcionamento offline em jornadas definidas e ausência de segredos nos
artefatos examinados.

Eles não demonstram adequação pedagógica universal, qualidade semântica do
blueprint ou da materialização, usabilidade com todas as populações,
disponibilidade prolongada, custo real em escala ou equivalência com outro
backend. A #104 demonstra a exposição por MCP e Action e a #105, sua projeção
visual responsiva; a auditoria semântico-instrucional completa pertence à #106. Os
cenários A–H são regressões determinísticas de engenharia, não validação
educacional. A regressão integral fica concentrada no fechamento da #109;
etapas intermediárias executam testes proporcionais ao risco. Essas afirmações
exigem métodos próprios de avaliação. A
[Matriz de conformidade técnica](matriz-conformidade-tecnica.md) relaciona cada
propriedade com código, migrations e testes; [Persistência relacional e
sincronização](persistencia-relacional.md) aprofunda a réplica, a outbox e as
falhas esperadas.
