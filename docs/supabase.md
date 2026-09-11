# Supabase no AraLearn

O curso compartilhado precisa de um lugar que continue acessível quando a pessoa muda
de dispositivo. Esse serviço também precisa identificar quem faz cada pedido e
proteger arquivos que não pertencem ao documento público da página. O AraLearn usa
[Supabase](https://supabase.com/docs) para reunir essas funções no servidor:

| Parte da plataforma | Problema que resolve no AraLearn | O que conserva ou executa |
| --- | --- | --- |
| [PostgreSQL](https://supabase.com/docs/guides/database/overview) | guarda o conteúdo em tabelas relacionadas e confirma alterações em conjunto | dados relacionais correntes |
| [Auth](https://supabase.com/docs/guides/auth/architecture) | cadastro, sessão, recuperação e identidade da aplicação | conta e sessão |
| [Storage](https://supabase.com/docs/guides/storage) | guarda arquivos privados, como avatar, PDF e áudio | bytes; vínculo e acesso continuam no banco |
| [Edge Functions](https://supabase.com/docs/guides/functions) | recebe pedidos pela rede, verifica identidade e chama as operações comuns | funções do servidor; as regras de conteúdo e do banco validam a alteração |

O serviço de notificações Realtime está desativado na configuração local. Em seu
lugar, `BroadcastChannel`, recurso do navegador para comunicar abas da mesma origem,
avisa que um dado pode ter mudado. No modo automático, voltar à aba ou recuperar a
conexão inicia a conferência com o servidor. No modo manual, conteúdo e filas pessoais
aguardam a ação de sincronizar; sessão, acesso e revogação continuam sendo conferidos.

## PostgreSQL, esquemas e autorização

O banco conserva o curso, seu planejamento e as decisões usadas na produção.
Cada unidade de estudo guarda o recorte de desenho que efetivamente recebeu:
os parâmetros e as relações instrucionais aplicados a ela. Conteúdo e estado
pessoal de estudo são registros separados, pois a prática de um estudante não
altera o material dos demais. A [persistência relacional](persistencia-relacional.md)
detalha a organização do mapa, das partes de produção e do conteúdo.
[Analytics](analytics-instrucionais.md) calcula contagens a partir desses registros,
sem manter uma história da execução.

As [fontes](fontes-e-citacoes.md) identificam os materiais, as âncoras localizam
passagens e as atribuições registram o uso no conteúdo. Cada objeto possui uma única
linha corrente. O número público chamado de revisão identifica o estado usado na
leitura e protege alterações concorrentes; não implica uma coleção consultável de
versões anteriores.

A API de dados é a interface pela qual clientes consultam ou alteram registros. Uma
pessoa autenticada ainda precisa estar autorizada para o registro e para a operação
pedida. Nas tabelas expostas pela API de dados, privilégios explícitos e [segurança em
nível de linha, ou
RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), atuam em
conjunto. Um privilégio ausente impede que a operação alcance a política; uma política
restringe quais linhas o papel já autorizado pode ler ou alterar. Um esquema agrupa
tabelas e funções do banco. O esquema `private` não integra a API exposta. A
configuração local publica somente `public` e `graphql_public`.

SQL é a linguagem usada para consultar e alterar o banco. Operações privilegiadas usam
funções SQL com uma finalidade delimitada. Quando uma função precisa agir com os
direitos de seu proprietário (`security definer`), ela fixa `search_path`, a lista de
esquemas em que procura tabelas e funções, valida a identidade recebida e revoga
execução dos papéis que não pertencem ao contrato. Escritas relacionadas são
confirmadas na mesma [transação do
PostgreSQL](https://www.postgresql.org/docs/current/tutorial-transactions.html), para
que conteúdo, revisão e recibo temporário avancem ou sejam revertidos juntos.

Revisão esperada e identificador de pedido resolvem falhas distintas. A revisão impede
sobrescrita de trabalho concorrente; um recibo temporário permite repetir a mesma
intenção depois de uma resposta perdida sem duplicar o efeito.

### Explicação, revisão humana e leitura de estudo

A microssequência guarda uma explicação em `microsequence.explanation`. Ela pode ser
desenvolvida e inspecionada antes da produção das unidades, que registram a base
explicativa efetivamente usada. `loadExplanationContext` lê o conteúdo da composição
aberta e seu estado de revisão, sem gerar texto nem alterar progresso. O [contrato de
explicação e revisão humana](explicacao-e-revisao-humana.md) distingue essa base, as
unidades produzidas e as decisões da pessoa autora.

A explicação e cada unidade têm uma declaração própria de revisão. O estado mostra a
relação entre essa declaração e a base material atual:

| Estado | Situação registrada |
| --- | --- |
| `current` | A declaração corresponde ao conteúdo e às fontes atuais. |
| `stale` | A base mudou depois da declaração. |
| `draft` | Não existe declaração vigente, inclusive porque uma anterior foi retirada. |
| `unregistered` | O objeto veio do acervo anterior sem esse metadado. |

Esses metadados ficam fora do conteúdo editável e importável.

A interface lê o alvo por `get_course_content_review_v1` e registra ou retira a
declaração por `set_course_content_review_v1`. Os canais de autoria usam as variantes
`get_course_content_review_for_actor_v1` e `set_course_content_review_for_actor_v1`,
acessíveis somente ao serviço, que fornece o ator autenticado. Nos dois caminhos, o
banco confere propriedade e a impressão digital da base inspecionada. MCP e Actions
oferecem `declarar_revisao` para executar uma manifestação expressa da pessoa; uma
correção ou geração bem-sucedida não autoriza o assistente a declarar revisão por
conta própria.

A política do curso é independente dessa marca. O padrão `saved` distribui o conteúdo
salvo a quem tem acesso; `reviewed_only` exige revisão atual. A mudança usa
`set_course_content_review_policy_v1` na interface e sua variante de serviço nos
canais. Público, concessões individuais, cópia e arquivos continuam sujeitos às
respectivas autorizações.

O cache é a cópia local usada para evitar novas leituras desnecessárias. Na
projeção de estudo, uma revisão mais recente pode indicar que microssequências
com conteúdo antes disponível ficaram pendentes de revisão. Nesse caso, o
controlador conserva o curso inteiro da cópia anterior, com sua revisão e
progresso, em vez de combinar trechos antigos com a nova projeção filtrada. Essa
retenção não se aplica à leitura exclusiva do proprietário nem substitui as
regras de revogação ou exclusão.

A diferença conhecida acompanha a cópia após reiniciar o aplicativo. Uma
projeção posterior elegível permite a substituição íntegra; no modo manual, a
atualização aguarda solicitação. O aplicativo distingue essa retenção de uma
perda de Internet. A autorização de arquivos continua sendo conferida no servidor.

### Citações e arquivos na cópia local

Após uma leitura autorizada, o repositório salva os dados de citações permitidos para
estudo em `course.v1.explanation-citations:<courseId>`, separados por revisão e
microssequência. Essa resposta contém somente os dados permitidos ao estudo,
omitindo os campos privados da autoria. A leitura sem rede e o modo manual reutilizam
a resposta salva quando disponível. Falha
transitória também permite usar a mesma revisão salva, com indicação do estado;
conflito de revisão ou revogação não recebe esse recurso. O cache é removido com o
curso, e uma resposta tardia não substitui a revisão aberta.

O documento local já contém o texto e os componentes da explicação. As citações ficam
disponíveis sem rede depois da primeira leitura conectada. Quando ainda não foram
salvas, o estudo informa essa condição, sem declarar ausência de fontes. Esse cache
não contém catálogo privado, trechos de verificação autoral, bytes de mídia ou URLs
assinadas. PDF e áudio hospedado exigem conexão e autorização corrente. O áudio da
explicação usa `microsequence_explanation`, com o alvo e a revisão abertos, e passa
por validação de identidade, tamanho, formato e hash.

As citações são lidas por `get_course_explanation_citations_v1`, com curso,
microssequência e revisão da composição aberta. Compartilham o contrato bibliográfico
das unidades. Na exportação autoral, a explicação aparece uma vez na microssequência;
suas fontes, bases aplicadas e estados de revisão acompanham o artefato em campos
próprios. Uma leitura incompleta, repetida ou de outra revisão impede apresentar essa
exportação como completa. Importar o documento de conteúdo não reaplica a declaração
de revisão da origem.

Na autoria, o endereço de serviço (endpoint) de fontes aceita
`microsequence_explanation` para catálogo contextual, obra, âncora e atribuição. As
ocorrências apontam para trechos literais da explicação; resposta e feedback pertencem
às unidades. A versão da microssequência é obtida na revisão inspecionada, inclusive
sem atribuição bibliográfica.

### Escritas de explicação e decisões incertas

A edição manual compara revisão do curso e versão da microssequência, troca somente
`explanation`, preserva os demais campos e reaplica os vínculos correntes. O recibo
atribui origem humana ao ato manual, sem atribuir à pessoa todo o texto anterior nem
registrar revisão por consequência da edição.

O controlador guarda o pedido antes de enviá-lo. Uma resposta perdida conserva
identidade, conteúdo e proveniência para recuperar o mesmo resultado ao reabrir. A
pendência termina com confirmação ou recusa definitiva e é removida junto aos dados
privados na revogação de acesso. Uma alteração de fontes pode mudar a revisão do curso
sem reescrever o texto;
a confirmação distingue esses efeitos.

A decisão de revisão também conserva o pedido original, separado por curso e
objeto inspecionado. O recibo pode
confirmar uma declaração já superada por outra edição; somente a releitura determina
sua atualidade. Os testes locais de cliente, transporte e SQL verificam essas
relações. A execução hospedada deve ser conferida na versão que será publicada,
conforme [Implantação](implantacao.md).

## Auth: conta da aplicação e OAuth do MCP

Auth mantém cadastro por e-mail, confirmação, recuperação e sessão. Para que a pessoa
não precise fornecer a senha a cada operação, um token de renovação (*refresh token*)
permite obter outra credencial de acesso; a rotação substitui esse token durante o
uso. A configuração local exige confirmação de e-mail, protege a troca de senha e
desabilita contas anônimas. No ambiente hospedado, o endereço principal (Site URL), o
serviço de envio de e-mail (SMTP) e os redirecionamentos
precisam corresponder aos endereços publicados. O desenvolvimento prevê o site local,
a origem interna do Android e `aralearn://auth/callback`.

OAuth permite autorizar um cliente a agir em nome da conta sem lhe entregar a senha. O
MCP usa o [servidor OAuth 2.1 do
Supabase](https://supabase.com/docs/guides/auth/oauth-server), com cadastro dinâmico de
clientes e tela de consentimento no próprio AraLearn. Sua credencial é um JWT: um
conjunto de dados assinado. O projeto usa uma chave assimétrica: uma chave privada
assina a credencial, e a chave pública permite ao MCP conferir essa assinatura sem
receber o segredo.

Na emissão, o Supabase chama `public.aralearn_mcp_access_token_hook`. Esse ponto de
extensão, chamado *hook*, retira dados desnecessários, substitui identificadores
diretos por identificadores específicos de cada cliente e anuncia apenas o escopo
`offline_access`. Antes de aceitar a credencial, o servidor MCP confere a assinatura
ES256, o emissor, o destinatário e os horários de validade. Também verifica cliente,
escopo, sessão de origem e consentimento vigente, que ligam o token à autorização
concedida.

Actions usa uma autorização OAuth separada. Um cliente confidencial ligado ao GPT
troca um código de autorização por uma credencial de acesso opaca, cujo significado
fica no servidor, e por um token de renovação rotativo; os escopos pedidos são
`openid email`. A conta aprova ou nega a conexão na mesma interface do AraLearn, mas
protocolo, consentimento e credenciais pertencem somente a esse canal.

## Chaves publicáveis e segredos

O site e o pacote instalável Android (APK) recebem somente:

- `ARALEARN_SUPABASE_URL`;
- `ARALEARN_SUPABASE_PUBLISHABLE_KEY`.

A chave publicável identifica o projeto; ela não concede administração. Sua exposição
só é segura quando acompanhada por RLS e privilégios mínimos. A [orientação sobre
chaves do Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
distingue essa chave das chaves secretas, que ignoram RLS e pertencem apenas ao
servidor.

No ambiente hospedado, as Edge Functions exigem `SUPABASE_SECRET_KEY` ou a entrada
correspondente em `SUPABASE_SECRET_KEYS`; uma chave administrativa precisa ter o
formato `sb_secret_`. A configuração recusa a antiga JWT `service_role` hospedada.
Para instalações com mais de um projeto, os mapas nomeados associam URL, chave
publicável e chave secreta do mesmo destino. No Supabase local descartável, a chave
`service_role` gerada pelo stack ainda pode ser usada pelos testes.

Os verificadores de build interrompem a montagem quando encontram
`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_DB_PASSWORD` no
processo que gera site ou APK. Chaves efêmeras de provedores de IA permanecem somente
na memória da sessão, não no Supabase nem no artefato público.

## Storage: bytes privados e vínculo relacional

Guardar um arquivo envolve duas responsabilidades: conservar seus bytes e decidir a
que pessoa ou curso eles estão ligados. O Storage assume a primeira; o PostgreSQL
registra a relação usada para identificar e autorizar o arquivo. As áreas de
arquivos, chamadas *buckets*, `person-avatars`, `course-source-pdfs` e
`course-media` são privadas.

O PostgreSQL conserva caminho,
impressão digital SHA-256, tamanho, tipo e vínculo corrente com a fonte. Conhecer um
caminho não concede leitura. [Políticas do
Storage](https://supabase.com/docs/guides/storage/security/access-control) protegem
`storage.objects` e complementam as verificações relacionais.

Avatar usa a pasta da própria conta e admite JPEG, PNG ou WebP até 512 KiB. O PDF
segue outro contrato:

1. a função remota de autoria recebe os bytes com limite explícito;
2. o serviço calcula SHA-256 e pede ao banco um preparo curto, que verifica
   propriedade, revisão, duplicidade e cota;
3. o serviço envia o objeto ao caminho exato pela Storage API, sem sobrescrever
   conteúdo existente;
4. o serviço relê o objeto e confere tamanho, cabeçalho e SHA-256;
5. a transação relacional salva ou atualiza a fonte e ativa o vínculo do PDF;
6. o preparo é consumido ou cancelado; preparos vencidos saem pela retenção.

A fonte e o vínculo são uma única mudança confirmada e, por isso, avançam a revisão do
curso uma vez.

Download é uma operação separada. Depois de verificar o vínculo ativo e a permissão de
leitura do curso, a API emite URL assinada de curta duração. PDFs e áudios aceitam até
20 MiB por arquivo e compartilham a cota de 64 MiB de conteúdo único por curso. Áudio
admite WAV PCM e MP3, é validado pelos bytes e precisa de referência lógica na unidade
ou explicação para download de estudo. A biblioteca do autor não é exposta ao
visitante. Configuração de voz não contém credenciais.

Remover um PDF primeiro desativa o vínculo e cria uma intenção de exclusão. O serviço
reivindica essa intenção, remove o objeto pela Storage API e confirma a conclusão. Se
outro vínculo ativo usar os mesmos bytes, a remoção física não é autorizada. Reanexar
o conteúdo reativa o vínculo e volta a verificar os bytes. Essa proteção considera
também outras cópias e reservas de envio. Um caminho cujo curso de origem deixou de
existir continua válido se outra cópia o utiliza; não é classificado como órfão apenas
pelo prefixo. O áudio usa as mesmas fronteiras de revisão, intenção, objeto imutável e
confirmação da limpeza.

## Edge Functions e autenticação dos pedidos

Cada Edge Function possui um handler, o código que recebe o pedido e verifica a
credencial antes de chamar as operações do curso.

A escolha da origem de uma cópia usa `list_copyable_courses_for_actor_v1`, concedida
somente a `service_role`. A Edge fornece o ator autenticado; o banco exige seu perfil
e aplica a mesma política de cópia da operação final. Busca, paginação e consulta por
UUID, o identificador estável do curso, só retornam cursos próprios ou com autorização
explícita de cópia, usando a projeção de metadados vigente. O filtro antecede o
limite, para que cursos não autorizados não esvaziem páginas nem componham seu cursor.
A leitura não concede edição, acesso adicional a arquivos ou aprovação de conteúdo, e
a confirmação da cópia volta a validar a autorização.

| Função | Entrada | Identidade aceita |
| --- | --- | --- |
| `aralearn-course-api` | aplicação web e Android | sessão AraLearn validada pelo handler |
| `aralearn-authoring-mcp` | catálogo corrente de tarefas humanas pelo MCP | JWT OAuth minimizado do MCP |
| `aralearn-authoring-action` | o mesmo catálogo projetado em OpenAPI | access token opaco do OAuth de Actions |

As três funções usam `verify_jwt = false` na configuração. Isso não as torna anônimas.
Cada handler precisa receber formatos que o verificador genérico da plataforma não
trata da mesma maneira e, por isso, valida explicitamente o transporte antes de chamar
o executor compartilhado. A API resolve a sessão Supabase; o MCP verifica o token JWT
e a identidade autorizada; Actions resolve o hash do token opaco. Uma credencial de um
canal é recusada nos outros.

CORS é o mecanismo pelo qual um servidor informa ao navegador quais páginas podem
ler suas respostas. Uma origem reúne protocolo, domínio e porta da página. As origens
permitidas são exatas. API e MCP admitem somente as origens da aplicação configuradas.
Actions acrescenta apenas `https://chatgpt.com` e `https://chat.openai.com`. Nenhum
conjunto de produção aceita `*`. O callback de Actions precisa usar HTTPS e o formato
`/aip/g-.../oauth/callback`; o redirect real registrado para o cliente precisa
coincidir durante a concessão e a troca de token.

## Ambiente local reproduzível

Para testar banco, arquivos e autorização sem alterar o ambiente hospedado, o
repositório reproduz localmente os serviços necessários. `supabase/config.toml` fixa
PostgreSQL 17, portas 54321 a 54324, e-mail local,
Storage, Auth, OAuth, hook e as três Edge Functions. Com
[Docker](https://docs.docker.com/desktop/) e [Supabase CLI
2.115.0](https://supabase.com/docs/guides/local-development/cli/getting-started)
disponíveis:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O reset recria o banco local e aplica as migrações e os dados iniciais (*seed*) nesse
ambiente descartável. A validação percorre banco e autorização — PostgreSQL, RLS,
PostgREST e revisão do esquema —, a conta por Auth e e-mail, os arquivos no Storage e
as integrações pela API, pelo MCP e pelo OAuth.
[Deno](https://docs.deno.com/runtime/getting_started/installation/) é necessário para
desenvolver as Edge Functions. O teste local demonstra o estado recriado; não comprova
que o projeto hospedado recebeu a mesma revisão.

O catálogo de componentes e sua impressão digital precisam concordar no navegador,
nas funções e no banco. Os verificadores conferem a fonte corrente, enquanto os testes
de migração reconstroem as etapas históricas. As mudanças do catálogo estão na
[história do esquema](schema-change-log.md), e o manifesto do cliente informa qual
revisão do serviço é necessária.

As provas focais de Storage e recuperação usam somente ambientes locais:

```powershell
npm run test:storage:lifecycle:local
npm run test:backup-restore:local
```

A primeira percorre PDF ativo, removido, reativado e órfão, sempre pela Storage API. A
segunda restaura um conjunto sintético de teste a partir de um backup lógico, verifica
o corte histórico e continua por todas as migrações até o manifesto corrente. Compara
estado útil e leitores atuais; a medição de redução técnica pertence ao corte
histórico.

## Retenção e manutenção

Recibos e intenções temporárias permitem recuperar operações durante uma janela
definida. Depois dela, a rotina de retenção remove em lotes as observações já retiradas,
os recibos expirados, as intenções de PDF vencidas e as janelas antigas de limitação de
acesso. O
[pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) a executa
diariamente às 03:17, no fuso do banco, com limite de 512 itens por classe. Leituras e
escritas também podem limpar dados vencidos nos caminhos previstos. Uma identidade
administrativa pode executar a mesma rotina com confirmação explícita.

Manutenção apresenta o estado do agendamento e um inventário classificado de objetos.
A remoção de órfão revalida classe, caminho e estado imediatamente antes de excluir
pela Storage API. O esquema `storage` é somente consultado pelo banco; código do
AraLearn não insere nem apaga suas linhas diretamente.

## Backup e restauração

Backup lógico do PostgreSQL conserva relações e metadados do Storage, mas não os bytes
dos objetos. Uma recuperação completa precisa de dois conjuntos coerentes: dump do
banco e cópia dos objetos privados. Essa separação é documentada pelo
[Supabase](https://supabase.com/docs/guides/platform/backups).

O [ensaio de restauração](persistencia-relacional.md#evolução-backup-e-restauração)
confere a recuperação e a atualização dos dados relacionais em bancos
descartáveis. A gravação, leitura e remoção de arquivos são verificadas
separadamente pela API do Storage. Restaurar os metadados não comprova que os
bytes do arquivo foram recuperados.

## Promoção e prova hospedada

Antes de aplicar migrações, o procedimento vincula o destino, lista o histórico e
executa `db push --dry-run`. O modo de aplicação exige confirmação literal, aplica sem
seed nem reset, repete a lista e executa o analisador do banco. Se as funções forem
publicadas, o script cadastra origens, implanta API, MCP e Actions e verifica CORS,
OAuth e descoberta MCP hospedados. Downloads, escritas e clientes reais exigem a prova
de integração do corte; o script de implantação não executa sozinho todas essas
jornadas.

Depois disso, `npm run deployment:verify-hosted` confronta o manifesto exigido pelos
clientes com o backend. Uma falha exige diagnóstico do estado efetivo; repetir uma
escrita às cegas pode confundir ausência de resposta com ausência de efeito.

O procedimento integral, incluindo site, Android e recuperação, está em
[Implantação](implantacao.md). O modelo de dados e a réplica local estão em
[Persistência relacional e sincronização](persistencia-relacional.md).
