# Persistência relacional e sincronização

O AraLearn conserva um único Curso vivo no PostgreSQL e replica no dispositivo
apenas o necessário para continuidade do estudo. Esta separação evita dois
problemas: uma cópia local não pode sobrescrever silenciosamente uma revisão
autoral mais recente, e uma interrupção de rede não deve apagar conteúdo já
validado nem trabalho pessoal pendente.

## Autoridades de dados

Cada família possui uma autoridade definida:

| Dado | Autoridade | Cópia ou fila local |
|---|---|---|
| identidade, sessão e perfil | Supabase Auth e perfil relacional | sessão própria do cliente de autenticação |
| raiz, acesso e hierarquia do Curso | PostgreSQL | lista leve e última composição íntegra |
| plano, desenho, política e materialização | PostgreSQL | projeções de leitura para a Autoria |
| fontes, ancoragens e anexos | PostgreSQL e Storage | metadados consultados; arquivo só após solicitação |
| progresso e itens para rever | PostgreSQL | estado pessoal v2 e fila específica |
| Anotações e citações | PostgreSQL | dados paginados e fila específica de comandos |
| auditoria, correções, variantes e Pesquisa | PostgreSQL | estado transitório de interface |
| posição atual de navegação | dispositivo | sincronização apenas quando o contrato pessoal exigir |

O [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) é
um banco de objetos transacional oferecido pelo navegador. No AraLearn, ele
mantém uma réplica limitada; não é uma segunda autoridade relacional nem uma
fila universal de mutações.

## Modelo relacional do Curso

O [PostgreSQL](https://www.postgresql.org/docs/current/) conserva relações que
precisam permanecer coerentes mesmo quando uma operação alcança várias tabelas.
Uma [transação](https://www.postgresql.org/docs/current/tutorial-transactions.html)
confirma todas as mudanças previstas ou as desfaz em conjunto. Nesse modelo,
`public.courses` contém identidade, título, objetivo, proprietário, revisão e
metadados de ciclo de vida. A composição ordenada vive em
`private.course_entities`, com tipos e pais restritos pela hierarquia:

```text
module         → raiz do Curso
lesson         → module
topic          → lesson
microsequence  → lesson
study_unit     → microsequence
```

As chaves incluem o Curso para impedir relações entre árvores distintas.
Posição é parte do contrato persistido, e restrições verificam tipo do pai,
conteúdo e unicidade. Excluir ou mover uma entidade passa pelas operações
canônicas, que mantêm o conjunto coerente.

Plano instrucional, Partes de autoria, parâmetros, orientações e política de
componentes ficam em relações próprias. A materialização transforma uma Parte
em Unidades de estudo na mesma árvore. Ela registra sua origem e permite
inspeção posterior, sem criar um Curso provisório separado.

## Revisões, comparação e idempotência

A raiz do Curso possui uma revisão monotônica. Leituras compostas devolvem essa
revisão; escritas autorais recebem `expectedRevision`. Uma alteração só é
aceita se a expectativa coincidir com o estado corrente.

Toda solicitação mutável recebe ainda um identificador de pedido. O servidor
registra o resultado e devolve o mesmo recibo quando a repetição é legítima.
Uma operação que não altera o estado conserva a revisão. Assim:

- a revisão esperada detecta concorrência entre editores;
- o identificador do pedido trata repetição por queda de conexão;
- o recibo demonstra qual efeito foi aplicado;
- a ausência de mudança evita eventos e invalidações artificiais.

As janelas de retenção são próprias de cada família. Um cliente que ficou
ausente por tempo indefinido relê a autoridade correspondente, em vez de
depender de um histórico universal de eventos.

Na interface, uma resposta ambígua mantém em memória o rascunho e o envelope da
operação. Reenviar o formulário sem modificá-lo conserva comando, versões,
identidades geradas e identificador de pedido; editar os campos representa uma
nova intenção. Esse estado é transitório da sessão da Autoria e não amplia o
contrato geral do IndexedDB nem cria uma fila autoral universal.

Na edição contextual de Unidade, o primeiro envio também fixa em memória o
conjunto efetivo de Fontes sob o mesmo `requestId`. Uma nova tentativa da mesma
intenção reutiliza esse instantâneo, mesmo se a resposta da primeira escrita se
perdeu; usar a mesma identidade com outro conteúdo é recusado. O controlador
limita esse conjunto a 16 pedidos e o elimina ao perder autoridade sobre o
Curso ou encerrar a sessão. O instantâneo não vai para o IndexedDB.

## Gravação contextual da composição

A operação do aplicativo substitui exatamente uma Unidade existente e exige a
revisão esperada do Curso, a versão esperada da Unidade, a Microssequência pai,
o envelope validado e a origem `manual` ou `provider_assistance`. Somente a API
de Cursos autenticada alcança a função SQL concedida ao papel de servidor. A
função registra o canal `application` e a origem no recibo e no evento, sem
alterar a forma pública da operação usada pelo MCP.

Conteúdo, atribuição de Fontes, revisão, evento e recibo pertencem à mesma
transação. Uma edição apenas textual pode carregar a proveniência efetiva
anterior, inclusive relações históricas ou uma lista vazia, somente quando o
JSONB recebido coincide com aquele conjunto. Qualquer vínculo novo ou alterado
precisa usar Fonte e Âncora ativas nas revisões exatas. Assim, a compatibilidade
preserva o fato legado sem permitir que clientes criem uma nova
`legacy_reference`.

Depois do recibo 2xx e antes de invalidar as projeções anteriores, o controlador
persiste no IndexedDB do usuário o instantâneo focal confirmado e promove a Unidade,
a revisão e a versão no documento `course.v1`. Essa promoção preserva progresso,
Observações e posição. Só então lista, composição anterior, plano, desenho,
Fontes, a hierarquia e as páginas de Conteúdo e de entidades são invalidados e
recompostos. Estudo e Conteúdo podem ler esse estado sem rede mesmo quando a releitura remota
falha; a interface o apresenta como confirmado, com sincronização pendente, e
não simula uma segunda gravação.

Uma releitura canônica na mesma revisão substitui o instantâneo confirmado e limpa
o estado transitório. Uma revisão superior o elimina como superado. Saída local
ou remota, revogação, limpeza do Curso ou outra perda de autoridade purgam a
projeção. Se uma mudança externa chegar antes da próxima edição, a atualização rebasa revisão
e versão esperadas para que a comparação e troca (`compare-and-swap`, CAS) use
o estado corrente, sem perder a
seleção, o progresso nem as Observações.

### Primeira gravação de uma cópia pessoal

Existe uma exceção delimitada ao estado transitório em memória. Se quem possui
apenas acesso direto salva uma mudança em
Estudo, o repositório conserva no IndexedDB o envelope necessário para criar sua
cópia pessoal: Curso de origem, seleção exata, revisões esperadas, Unidade final,
origem `manual` ou `provider_assistance` e identificador do pedido. Só pode haver
uma intenção pendente dessa família por vez. Conversa, endpoint, modelo e
credencial do provedor ficam fora.

O servidor verifica primeiro se houve mudança material. Sem mudança, devolve um
recibo sem criar Curso, plano, entidades ou relação. Havendo mudança, uma única
transação cria o Curso privado da pessoa, um plano inicial vazio, copia somente
as entidades da composição e aplica a Unidade editada. Fontes, Âncoras, PDFs,
acessos, progresso, marcas para rever e Observações não são copiados.

Uma relação privada associa pessoa, Curso de origem e Curso pessoal. A restrição
garante no máximo uma cópia por pessoa e origem. O mesmo envelope devolve o
recibo anterior; duas intenções diferentes concorrendo pela primeira gravação
resultam em uma confirmação e um conflito. Depois da confirmação, o cliente
promove o novo `course.v1`, volta à mesma Unidade e remove o envelope pendente.
O estado pessoal e as Observações passam a usar a identidade do novo Curso, sem
herdar os registros do original.

## Composição paginada

A consulta inicial retorna cabeçalhos e progresso para alimentar o seletor e a
prévia, sem carregar milhares de Unidades. Ao entrar num Curso, o repositório:

1. lê o cabeçalho e sua revisão;
2. solicita as entidades em páginas limitadas;
3. exige a mesma revisão em todas as páginas;
4. recompõe a hierarquia no cliente;
5. valida tipos, pais, ordem e conteúdo;
6. promove a candidata no IndexedDB;
7. entrega o documento íntegro ao renderizador.

Cabeçalho e páginas da revisão nova permanecem candidatos até a última
validação. Se alguma página estiver ausente, inválida ou pertencer a outra
revisão, o ponteiro persistido não avança. A última composição válida continua
estudável como desatualizada e somente leitura, inclusive após reinício.

Esse protocolo impede uma árvore híbrida, formada pelo começo de uma revisão e
o fim de outra.

## Estrutura local

`CourseLocalStore` abre um banco por conta:

```text
aralearn-course-v1-<identificador-da-conta>
└── course_cache
```

O armazenamento local guarda registros tipados para listas, cabeçalhos, páginas
candidatas, composição promovida, plano, estrutura, páginas recentes de
Conteúdo, estado pessoal, Anotações de Estudo e posição. O catálogo privado de
Fontes, seus metadados e os bytes de PDFs permanecem somente no servidor e no
Storage. A separação lógica é feita por chaves e contratos de repositório. A
sessão de autenticação fica em `aralearn-auth-v1`, fora do banco de Curso.

Trocar de conta troca o espaço local. Uma conta não consulta a réplica de
outra, ainda que ambas usem o mesmo navegador. Encerrar sessão remove o acesso
à sessão; dados locais só podem ser reutilizados quando a mesma identidade for
autenticada novamente.

A inspeção de Autoria conserva até quatro páginas ou 8 MiB por Curso. A tela
solicita normalmente 12 itens por página, admite até 24 e limita a 36 o número
de Unidades simultâneas no documento visual. A paginação remota continua sendo
a fonte do restante.

Cada item da página inclui fatos autorais derivados na mesma consulta: contagem
de Observações pendentes, materialização que produziu a versão e instantâneos
humanos do desenho usado e do desenho vigente. O cliente não precisa consultar
essas autoridades separadamente para cada Unidade, e os fingerprints usados na
comparação permanecem internos ao banco.

A comparação é restrita à microssequência da Unidade. Uma Auditoria só muda o
marcador para verificado quando a rodada resolvida contém o critério estrutural
explícito `current_design_alignment` na mesma revisão do Curso e versão da
Unidade; reparos sem essa prova não ocultam uma diferença de desenho.

### Shell offline e dados do Curso

O cache do service worker e o IndexedDB resolvem interrupções diferentes. O
[service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
conserva arquivos estáticos necessários para abrir a interface, como HTML,
folhas de estilo, módulos JavaScript e recursos declarados pelo manifesto. Ele
usa rede primeiro para requisições `GET` da mesma origem e não guarda endereços
com parâmetros de consulta.

O IndexedDB conserva os documentos e comandos delimitados acima. Assim, abrir
o shell sem conexão não garante que qualquer Curso esteja disponível: o Curso
precisa ter sido replicado e promovido integralmente naquela conta. Da mesma
forma, ter um Curso local não basta se os arquivos da interface nunca foram
instalados. O Android empacota o shell no APK e desativa o registro do service
worker, mas continua usando o IndexedDB da WebView para a réplica por conta.

## Estado pessoal

Estado pessoal v2 contém progresso e marcação para rever por alvo de estudo.
Ele não incorpora Anotações, texto autoral nem uma cópia da Unidade. O
repositório aplica atualizações otimistas, agrupa comandos compatíveis e
reconcilia o recibo remoto.

Quando duas abas estão abertas, a
[`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
comunica que a família
mudou. Cada aba relê o registro persistido; o canal não transporta texto bruto.
Essa escolha reduz exposição e evita que a mensagem entre abas se torne uma
autoridade efêmera.

## Anotações, âncoras e citações

Uma Anotação pertence à pessoa e aponta para um alvo estável do Curso. Seu
assunto pode ser classificado e ligado a uma ou mais âncoras de fonte. Texto,
seleção, citações e estado de sincronização ficam fora do documento de estado
pessoal.

O repositório de Anotações mantém dados locais paginados e uma fila própria.
Criação, alteração e remoção usam identificadores de pedido, e o servidor
aplica as permissões do Curso e da pessoa. A fila é limitada por quantidade e
tamanho; quando o limite é atingido, a interface deve informar o bloqueio em
vez de descartar comandos silenciosamente.

## Fontes e proveniência

Uma fonte possui identidade estável e revisões acrescentadas ao histórico.
Metadados normalizados incluem autoria, data parcial, identificador, idioma
BCP 47, citação, endereço, edição, origem, disponibilidade, estado de
verificação e visibilidade.

Âncoras ligam uma revisão de fonte a um alvo ou trecho. Atribuições registram o
uso da fonte na composição. Como a revisão anterior permanece endereçável, uma
citação não muda de sentido quando os metadados correntes são corrigidos.

## PDFs privados

O banco guarda vínculo, resumo criptográfico SHA-256, tamanho, tipo, nome apresentado e Curso de
origem. O objeto binário fica no bucket privado `course-source-pdfs`, no
caminho `<curso-de-origem>/<sha256>.pdf`.

O vínculo de um envio percorre cinco passos. A leitura posterior é uma operação
separada:

1. o navegador faz a verificação inicial do cabeçalho PDF, calcula o resumo
   criptográfico e envia os metadados à API;
2. a API verifica propriedade, revisão, duplicidade e cota, então devolve o
   caminho associado a uma intenção privada válida por dez minutos;
3. o navegador faz um `POST` autenticado diretamente ao endpoint do Storage,
   sem URL assinada de envio e sem sobrescrita; a política e o gatilho conferem
   sessão, caminho e consumo único da intenção;
4. a API lê o objeto com a credencial do servidor, limita a leitura, confere o
   tamanho, o cabeçalho `%PDF-` e recalcula SHA-256;
5. somente após essa conferência a operação relacional confirma o vínculo entre
   fonte e objeto.

Aberturas futuras recebem URL assinada de leitura depois de confirmar que a
pessoa é proprietária do Curso vinculado.

O objeto vinculado é imutável e aceita até 20 MiB. O conjunto de conteúdo único por Curso aceita até
64 MiB, e uma leitura detalhada retorna até oito anexos por fonte. Objetos com o
mesmo resumo criptográfico são reaproveitados dentro da origem. Uma variante referencia o
objeto por seu próprio vínculo autorizado; conhecer o caminho físico não
concede acesso.

Falha entre envio e confirmação pode deixar objeto órfão. A detecção e a
remoção desses objetos usam inventário e plano próprios, sem apagar um PDF que
ainda tenha vínculo válido.

## Avatares privados

Avatares ficam no bucket `person-avatars`, sob a pasta da própria conta. O
cliente autenticado pode enviar JPEG, PNG ou WebP até 512 KiB. Leitura depende
da relação permitida entre pessoas, não de uma URL pública permanente.

## Auditoria, variantes e Pesquisa

Auditoria e correções mantêm ciclos, achados, decisões, comandos e vínculos com
Anotações no servidor. Não existe fila local para essas alterações. A interface
pode preservar apenas o estado transitório necessário para repetir uma leitura.
Verificar um achado também resolve ou reabre, atomicamente, as Observações
vinculadas conforme o resultado. A mesma identidade idempotente cobre o comando
inteiro, inclusive em repetição depois de uma resposta ambígua.

Variantes guardam ponto de controle imutável do plano, conjunto de comparação e
membros. Cada membro é um Curso independente. Plano, desenho, fontes,
ancoragens e vínculos de PDF podem partir do mesmo ponto de controle; Unidades
de estudo são materializadas em cada Curso. Desvincular um membro remove a
relação de comparação, não o Curso nem seus acessos.

Pesquisa é calculada sob demanda a partir das autoridades atuais. A função,
disponível apenas ao proprietário, materializa sete conjuntos factuais, aplica
filtros e pagina até duzentas linhas. Ela exclui identidade da pessoa, e-mail,
texto bruto e cópias integrais de conteúdo. Exportações percorrem as páginas e
preservam definições, denominadores e dados ausentes.

## Acesso e exclusão

O proprietário concede ou revoga acesso ao Curso por relações explícitas. Uma
conta compartilhada recebe a leitura necessária ao Estudo e não recebe escrita
no Curso original. A operação de cópia pessoal pode criar um Curso pessoal
privado na primeira gravação contextual; as demais operações de Autoria,
auditoria, comparação e Pesquisa continuam verificando propriedade no contrato
SQL, mesmo quando são chamadas por uma função com credencial administrativa.

Exclusão da própria conta passa por uma operação dedicada. Restrições e ações
em cascata foram desenhadas para remover dados pessoais sem converter conteúdo
de terceiros em órfão acessível. Storage exige tratamento correspondente para
objetos que não são eliminados automaticamente pelo PostgreSQL.

## Evolução do esquema

Migrações em `supabase/migrations/` são a história reproduzível do banco. A
revisão hospedada corrente e a revisão implantável declarada em
`supabase/runtime-manifest.json` são `20260827185748`. Uma migração que
acrescenta capacidade deve:

- fazer verificações prévias e falhar diante de estado incompatível;
- preservar Cursos válidos e suas revisões;
- instalar restrições, privilégios e políticas de segurança por linha;
- atualizar o manifesto somente depois do contrato completo;
- incluir testes locais e verificação do ambiente hospedado.

O esquema implantável contém apenas as autoridades correntes de Curso. Estruturas
substituídas não permanecem como caminho alternativo; recuperação depende de
backup e das versões anteriores preservadas no Git.

## Verificação

Os contratos são exercitados em camadas:

| Risco | Evidência principal |
|---|---|
| recomposição e promoção local | testes de `CourseLocalStore`, controlador e repositório de Estudo |
| estado pessoal e Anotações | testes dos repositórios, duas abas e retomada de fila |
| concorrência e idempotência | testes PGlite, PostgreSQL real e chamadas repetidas |
| edição contextual e proveniência carregada | testes de domínio, controlador, adaptador, roteador, PGlite e paridade IndexedDB |
| instantâneo confirmado, uso sem rede e expiração | testes do controlador, repositório de Estudo, Estudo/Conteúdo e CAS externo |
| fontes, PDFs e proveniência | testes de domínio, painel, PGlite, Storage e segurança |
| auditoria, variantes e Pesquisa | testes de domínio, painéis, roteador e PGlite |
| Autoria integrada | jornada autenticada por `public/main.js`, IndexedDB, API, PostgreSQL, Storage, RLS, MCP e Actions no Supabase local |
| esquema implantado | `supabase db reset`, análise do banco, inventário e manifesto hospedado |

O roteiro de ambiente está em [Supabase](supabase.md) e a ordem de promoção em
[Implantação](implantacao.md).
