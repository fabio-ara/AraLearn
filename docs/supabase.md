# Supabase no AraLearn

O AraLearn precisa conservar relações, identificar pessoas, guardar arquivos
privados e receber operações que não devem ser executadas somente no
navegador. [Supabase](https://supabase.com/docs) reúne esses serviços em um
projeto, mas não os transforma numa única tecnologia. No AraLearn, cada parte
tem responsabilidade e fronteira próprias:

| Parte da plataforma | Problema que resolve no AraLearn | Autoridade |
| --- | --- | --- |
| [PostgreSQL](https://supabase.com/docs/guides/database/overview) | relações, transações, estado corrente e repetição segura de escritas | dados relacionais correntes |
| [Auth](https://supabase.com/docs/guides/auth/architecture) | cadastro, sessão, recuperação e identidade da aplicação | conta e sessão |
| [Storage](https://supabase.com/docs/guides/storage) | objetos binários privados, como avatar e PDF | bytes; vínculo e acesso continuam no banco |
| [Edge Functions](https://supabase.com/docs/guides/functions) | fronteiras HTTP da aplicação, do MCP e de Actions | transporte e orquestração; regras finais continuam nos contratos de domínio e SQL |

Realtime está desativado. Atualização entre abas usa `BroadcastChannel`. No modo
automático, foco, visibilidade e retorno da conexão permitem reconciliação; no
manual, conteúdo e filas pessoais aguardam a sincronização explícita. As
verificações de sessão, acesso e revogação permanecem ativas.

## PostgreSQL, esquemas e autorização

O banco conserva o curso vivo, seu mapa curricular, partes operacionais,
repertório de unidades de análise, requisitos de evidência, parâmetros, direção
editorial, fontes, âncoras, vínculos de PDF, áudios, observações, acesso e estado pessoal. Cada unidade de estudo
guarda o recorte de desenho que efetivamente recebeu. Analytics deriva números
dessas autoridades correntes; não mantém uma história da execução.

Fontes, Âncoras e atribuições também possuem uma única linha corrente por
objeto. O número público chamado de revisão funciona como versão para
concorrência e deep links; não implica uma coleção consultável de versões
anteriores.

Uma pessoa autenticada ainda precisa estar autorizada para a linha e para a
operação pedida. Nas tabelas expostas pela API de dados, privilégios explícitos
e [segurança em nível de linha, ou RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
atuam em conjunto. Um privilégio ausente impede que a operação alcance a
política; uma política restringe quais linhas o papel já autorizado pode ler ou
alterar. O esquema `private` não integra a API exposta. A configuração publica
somente `public` e `graphql_public`.

Operações privilegiadas usam funções SQL estreitas. Quando uma função precisa
agir com os direitos de seu proprietário (`security definer`), ela fixa
`search_path`, valida a identidade recebida e revoga execução dos papéis que
não pertencem ao contrato. Escritas relacionadas são confirmadas na mesma
[transação do PostgreSQL](https://www.postgresql.org/docs/current/tutorial-transactions.html),
para que conteúdo, revisão e recibo temporário avancem ou sejam revertidos juntos.

Revisão esperada e identificador de pedido resolvem falhas distintas. A revisão
impede sobrescrita de trabalho concorrente; um recibo temporário permite repetir
a mesma intenção depois de uma resposta perdida sem duplicar o efeito.

### Revisão do conteúdo e cópia de Estudo

O Estudo obtém a Explicação de `microsequence.explanation` na composição já
aberta. `loadExplanationContext` devolve o caminho de origem, a revisão e o
metadado protegido de revisão da linha; não consulta um gerador nem escreve
progresso. Ausência de apoio, rascunho e conteúdo disponível são estados
distintos. Uma aprovação antiga permanece identificada como `stale`, e um
registro anterior sem aprovação permanece `unregistered`.

Após uma leitura autorizada, o repositório salva o DTO redigido de citações do
apoio em `course.v1.explanation-citations:<courseId>`, separado por revisão e
microssequência. A leitura offline, a cópia anterior conservada e o modo Manual
reutilizam esse DTO quando disponível. Falha transitória de serviço também
permite usar a mesma revisão salva, com estado explícito de indisponibilidade;
conflito de revisão ou revogação não recebe esse fallback. O cache é removido
com o curso. Uma resposta tardia não substitui a revisão aberta.

O documento offline já contém o texto e os componentes próprios da Explicação.
As citações ficam disponíveis offline depois de sua primeira leitura online;
se ainda não foram salvas, o Estudo informa essa condição em vez de declarar
que não existem fontes. Esse cache não contém catálogo privado, trechos de
verificação autoral, bytes de mídia ou URLs assinadas. Áudio e PDF externos
continuam exigindo conexão e autorização corrente. O áudio do apoio usa o alvo
`microsequence_explanation`, com a microssequência e a revisão abertas, e passa
pela mesma validação de identidade, tamanho, formato e hash antes do player.

O cliente da aplicação lê a impressão do conjunto de uma microssequência por
`get_course_microsequence_review_v1` e envia a decisão explícita por
`approve_course_microsequence_content_v1`. A aprovação exige sessão da pessoa
proprietária na aplicação; o servidor não concede essa autoridade ao OAuth de
MCP/Actions. A impressão corresponde ao conteúdo inspecionado. O cliente
conserva a identidade da decisão para uma retomada e não repete automaticamente
uma escrita incerta. Um recibo recuperado confirma a decisão original; a
situação corrente precisa ser relida caso o conteúdo tenha mudado depois.
Na leitura de entidades, `contentReview` fica fora de `content` e contém apenas
situação e data públicas. A composição do documento exportável não incorpora
esse metadado, de modo que reimportar conteúdo não reaplica a aprovação da origem.

A projeção de Estudo informa quais microssequências aguardam revisão, sem
distribuir seu novo texto ao estudante. Antes de promover uma composição no
cache, o controlador verifica se ela retiraria conteúdo disponível na cópia
anterior. Nesse caso conserva o curso inteiro e sua revisão, incluindo o
progresso local. A diferença conhecida acompanha a cópia após reiniciar o
aplicativo. Não mistura microssequências de revisões distintas nem interpreta
essa retenção como falta de Internet. Uma projeção posterior elegível permite
a substituição íntegra; o modo manual continua aguardando atualização explícita.
O acesso a arquivos continua sujeito à autorização corrente.

As citações do apoio usam `get_course_explanation_citations_v1`, com curso,
microssequência e revisão da cópia efetivamente aberta. Compartilham o contrato
bibliográfico das unidades e identificam o alvo como `microsequence_explanation`.
Na exportação autoral, o texto aparece uma vez na microssequência e as
atribuições de cada apoio são lidas na mesma revisão do curso. Ausência da
leitura de proveniência, repetição ou alvo/revisão divergentes impedem exportar
um artefato que pareça completo.

Na Autoria, o mesmo endpoint de fontes aceita esse alvo para catálogo contextual,
obra, âncora e atribuição. As ocorrências da Explicação usam somente conteúdo,
com seleção literal; resposta e feedback pertencem às unidades. A versão da
microssequência vem de uma leitura remota na revisão inspecionada, inclusive
quando ainda não há atribuição bibliográfica.

A edição manual da Explicação usa a composição existente, com comparação da
revisão do curso e da versão da microssequência. Troca somente `explanation`,
conserva os demais campos e reaplica os vínculos correntes. O recibo registra
origem humana dessa mudança, sem atribuir à pessoa todo o conteúdo prévio da
microssequência. O controlador guarda o pedido exato antes de enviar; resposta
perdida conserva identidade, conteúdo e proveniência para recuperar o mesmo
resultado após reabrir. Esse estado local é removido após confirmação ou recusa
definitiva e acompanha a limpeza por revogação de acesso. Ele não é aprovação.
O recibo distingue alteração do curso e versão do texto: declarar pela primeira
vez um conjunto vazio de vínculos pode avançar a revisão do curso sem alterar
a entidade da microssequência. Nesse caso `changed` é verdadeiro e
`microsequenceVersion` permanece igual; não se registra uma edição de texto
que não aconteceu. Antes dessa declaração, a leitura de atribuição ausente
retorna uma lista vazia, sem item de identidade nula.
Inspeção e aprovação usam os RPCs autenticados protegidos já existentes; a
escrita de aprovação não tem repetição automática nem retorno por cache.

Essas regras são verificadas por testes locais de cliente e persistência;
a migração e as conversas hospedadas precisam de comprovação própria antes da
publicação. Ver o [contrato de Explicação e revisão humana](explicacao-e-revisao-humana.md).

## Auth: conta da aplicação e OAuth do MCP

Auth mantém cadastro por e-mail, confirmação, recuperação, sessão e rotação de
refresh token. A configuração local exige confirmação de e-mail, protege troca
de senha e não habilita contas anônimas. Em ambiente hospedado, Site URL, SMTP
e redirecionamentos devem corresponder aos endereços realmente publicados. O
site local, a origem interna do Android e `aralearn://auth/callback` são os
retornos previstos no ambiente de desenvolvimento.

O [servidor OAuth 2.1 do Supabase](https://supabase.com/docs/guides/auth/oauth-server)
é usado pelo MCP. O cadastro dinâmico de clientes fica habilitado; o caminho de
autorização é `/`, porque a tela de consentimento pertence ao shell do AraLearn.
O projeto precisa usar chave JWT assimétrica e o hook
`public.aralearn_mcp_access_token_hook`. Esse hook minimiza o access token,
substitui identificadores diretos por aliases pareados e anuncia somente
`offline_access`. O servidor MCP ainda valida assinatura ES256, emissor,
destinatário, tempos, cliente, escopo, sessão de origem e consentimento vivo.

Actions não reutiliza esse bearer. A função de Actions mantém um OAuth próprio,
com cliente confidencial ligado ao GPT, código de autorização, escopos
`openid email`, access token opaco e refresh token rotativo. A conta AraLearn
aprova ou nega a conexão na mesma interface, mas o protocolo, o consentimento e
os tokens pertencem ao canal de Actions.

## Chaves publicáveis e segredos

O site e o APK recebem somente:

- `ARALEARN_SUPABASE_URL`;
- `ARALEARN_SUPABASE_PUBLISHABLE_KEY`.

A chave publicável identifica o projeto; ela não concede administração. Sua
exposição só é segura quando acompanhada por RLS e privilégios mínimos. A
[orientação de segurança do Supabase](https://supabase.com/docs/guides/database/secure-data)
distingue essa chave das chaves secretas, que ignoram RLS e pertencem apenas ao
servidor.

No ambiente hospedado, as Edge Functions exigem `SUPABASE_SECRET_KEY` ou a
entrada correspondente em `SUPABASE_SECRET_KEYS`; uma chave administrativa
precisa ter o formato `sb_secret_`. A configuração recusa a antiga JWT
`service_role` hospedada. Para instalações com mais de um projeto, os mapas
nomeados associam URL, chave publicável e chave secreta do mesmo destino. No
Supabase local descartável, a chave `service_role` gerada pelo stack ainda pode
ser usada pelos testes.

Os verificadores de build interrompem a montagem quando encontram
`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_DB_PASSWORD` no
processo que gera site ou APK. Chaves efêmeras de providers de IA permanecem
somente na memória da sessão, não no Supabase nem no artefato público.

## Storage: bytes privados e vínculo relacional

Os buckets `person-avatars`, `course-source-pdfs` e `course-media` são privados. O Storage
guarda bytes; o PostgreSQL conserva caminho, resumo criptográfico, tamanho,
tipo e vínculo corrente com a fonte. Conhecer um caminho não concede leitura.
[Políticas do Storage](https://supabase.com/docs/guides/storage/security/access-control)
protegem `storage.objects` e complementam as verificações relacionais.

Avatar usa a pasta da própria conta e admite JPEG, PNG ou WebP até 512 KiB. O
PDF segue outro contrato:

1. a borda de Autoria recebe os bytes com limite explícito;
2. o serviço calcula SHA-256 e pede ao banco um preparo curto, que verifica
   propriedade, revisão, duplicidade e cota;
3. o serviço envia o objeto ao caminho exato pela Storage API, sem sobrescrever
   conteúdo existente;
4. o serviço relê o objeto e confere tamanho, cabeçalho e SHA-256;
5. a transação relacional salva ou atualiza a fonte e ativa o vínculo do PDF;
6. o preparo é consumido ou cancelado; preparos vencidos saem pela retenção.

A fonte e o vínculo são uma única mudança confirmada e, por isso, avançam a
revisão do curso uma vez.

Download é uma operação separada. Depois de verificar o vínculo ativo e a
permissão de leitura do curso, a API emite URL assinada de curta duração. PDFs e
áudios aceitam até 20 MiB por arquivo e compartilham a cota de 64 MiB de conteúdo
único por curso. Áudio admite WAV PCM e MP3, é validado pelos bytes e precisa de
referência lógica na unidade para download de Estudo. A biblioteca do autor não
é exposta ao visitante. Configuração de voz não contém credenciais.

Remover um PDF primeiro desativa o vínculo e cria uma intenção de exclusão. O
serviço reivindica essa intenção, remove o objeto pela Storage API e confirma a
conclusão. Se outro vínculo ativo usar os mesmos bytes, a remoção física não é
autorizada. Reanexar o conteúdo reativa o vínculo e volta a verificar os bytes.
Essa proteção considera também outras cópias e reservas de envio. Um caminho
cujo curso de origem deixou de existir continua válido se outra cópia o utiliza;
não é classificado como órfão apenas pelo prefixo. O áudio usa as mesmas
fronteiras de revisão, intenção, objeto imutável e confirmação da limpeza.

## Edge Functions e autenticação no handler

A escolha da origem de uma cópia usa `list_copyable_courses_for_actor_v1`,
concedida somente a `service_role`. A Edge fornece o ator autenticado; o banco
exige seu perfil e aplica a mesma política de cópia da operação final. Busca,
paginação e consulta por UUID só retornam cursos próprios ou com autorização
explícita de cópia, usando a projeção de metadados vigente. O filtro antecede
o limite, para que cursos não autorizados não esvaziem páginas nem componham
seu cursor. A leitura não concede edição, acesso adicional a arquivos ou
aprovação de conteúdo, e a confirmação da cópia volta a validar a autorização.

| Função | Entrada | Identidade aceita |
| --- | --- | --- |
| `aralearn-course-api` | aplicação web e Android | sessão AraLearn validada pelo handler |
| `aralearn-authoring-mcp` | catálogo corrente de tarefas humanas pelo MCP | JWT OAuth minimizado do MCP |
| `aralearn-authoring-action` | o mesmo catálogo projetado em OpenAPI | access token opaco do OAuth de Actions |

As três funções usam `verify_jwt = false` na configuração. Isso não as torna
anônimas. Cada handler precisa receber formatos que o verificador genérico da
plataforma não trata da mesma maneira e, por isso, valida explicitamente o
transporte antes de chamar o executor compartilhado. A API resolve a sessão
Supabase; o MCP verifica JWT e principal; Actions resolve o hash do token opaco.
Uma credencial de um canal é recusada nos outros.

As origens CORS são exatas. API e MCP admitem somente as origens da aplicação
configuradas. Actions acrescenta apenas `https://chatgpt.com` e
`https://chat.openai.com`. Nenhum conjunto de produção aceita `*`. O callback
de Actions precisa usar HTTPS e o formato `/aip/g-.../oauth/callback`; o
redirect real registrado para o cliente precisa coincidir durante a concessão
e a troca de token.

## Ambiente local reproduzível

`supabase/config.toml` fixa PostgreSQL 17, portas 54321 a 54324, e-mail local,
Storage, Auth, OAuth, hook e as três Edge Functions. Com
[Docker](https://docs.docker.com/desktop/) e
[Supabase CLI 2.115.0](https://supabase.com/docs/guides/local-development/cli/getting-started)
disponíveis:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O reset aplica migrations e seed somente no stack local descartável. A
validação exerce PostgreSQL, RLS, Auth por e-mail, PostgREST, Storage, API,
MCP, OAuth e revisão do esquema.
[Deno](https://docs.deno.com/runtime/getting_started/installation/) é necessário
para a autoria das Edge Functions. O teste local demonstra o estado recriado; não comprova que o
projeto hospedado recebeu a mesma revisão.

A migração `20260908000533_refresh_network_component_catalog.sql` sincroniza a
descoberta de hub e repetidor com o catálogo SQL. A versão do catálogo passa a
`1-70b27609`; as referências, opções e o fingerprint dos schemas permanecem
iguais. As políticas atuais avançam somente `catalogVersion`, conservando
disponibilidade, listas de componentes, origem, motivo e data. Conteúdo,
snapshots de aplicação e decisões de revisão humana não são regravados.
Preflight e postflight recusam divergência do catálogo precursor ou alteração
dessas escolhas. O manifesto avança sua revisão sem acrescentar capacidades.
O teste de atualização local verifica também a estabilidade das bases de
revisão; essa prova não substitui a aplicação e os gates do ambiente hospedado.

As provas focais de Storage e recuperação usam somente ambientes locais:

```powershell
npm run test:storage:lifecycle:local
npm run test:backup-restore:local
```

A primeira percorre PDF ativo, removido, reativado e órfão, sempre pela Storage
API. A segunda restaura uma fixture por dump lógico, verifica o corte histórico
e continua por todas as migrations até o manifesto corrente. Compara estado
útil e leitores atuais; a medição de redução técnica pertence ao corte histórico.

## Retenção e Manutenção

A rotina de retenção remove, por classe e em lotes, Observações retiradas depois
do prazo lógico, recibos expirados, intenções de PDF vencidas e
janelas antigas de limitação de acesso. O [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron)
a executa diariamente às 03:17, no fuso do banco, com limite de 512 itens por
classe. Leituras e escritas também podem limpar dados vencidos nos caminhos
previstos. Uma identidade administrativa pode executar a mesma rotina com
confirmação explícita.

Manutenção apresenta o estado do agendamento e um inventário classificado de
objetos. A remoção de órfão revalida classe, caminho e estado imediatamente
antes de excluir pela Storage API. O schema `storage` é somente consultado pelo
banco; código do AraLearn não insere nem apaga suas linhas diretamente.

## Backup e restauração

Backup lógico do PostgreSQL conserva relações e metadados do Storage, mas não
os bytes dos objetos. Uma recuperação completa precisa de dois conjuntos
coerentes: dump do banco e cópia dos objetos privados. Essa separação é
documentada pelo [Supabase](https://supabase.com/docs/guides/platform/backups).

O ensaio local cria duas instâncias descartáveis sem rede. A primeira recebe uma fixture
com curso, mapa, parte, desenho, unidade de estudo, fonte, âncora, PDF, observações e
operações ainda abertas. Depois do dump, a segunda restaura o banco, aplica a
migration de corte e toda a cadeia posterior até a revisão corrente. O relatório
separa os checkpoints e confere a preservação do estado útil, os DTOs atuais e
a ausência de migrations pendentes numa segunda seleção. Na preparação
histórica, dados de Storage da stack atual não são importados: esse ensaio
sintético não substitui um backup de desastre. Nenhuma instância modifica o
projeto hospedado ou a stack usada como origem.

Os objetos reais são exercitados separadamente pela Storage API. O relatório de
restauração marca explicitamente que metadados restaurados não provam a presença
dos bytes.

## Promoção e prova hospedada

Antes de aplicar migrations, o procedimento vincula o destino, lista o
histórico e executa `db push --dry-run`. O modo de aplicação exige confirmação
literal, aplica sem seed nem reset, repete a lista e executa o analisador do
banco. Se as funções forem publicadas, o script cadastra origens, implanta API,
MCP e Actions e verifica CORS, OAuth e descoberta MCP hospedados. Downloads,
escritas e clientes reais exigem a prova de integração do corte; o script de
deploy não executa sozinho todas essas jornadas.

Depois disso, `npm run deployment:verify-hosted` confronta o manifesto exigido
pelos clientes com o backend. Uma falha exige diagnóstico do estado efetivo;
repetir uma escrita às cegas pode confundir ausência de resposta com ausência
de efeito.

O procedimento integral, incluindo site, Android e recuperação, está em
[Implantação](implantacao.md). O modelo de dados e a réplica local estão em
[Persistência relacional e sincronização](persistencia-relacional.md).


### Sincronização da impressão gerada dos pacotes

A migração `20260908023156_refresh_generated_package_fingerprint.sql` acompanha o autoíndice regenerado dos pacotes. O catálogo SQL conserva versão `1-70b27609` e opções; somente `schemaFingerprint` passa a concordar com o registro gerado. A pré-condição verifica a revisão anterior e sua impressão, e a pós-condição impede alteração incidental das opções, identidade ou concessões da função. Nenhuma política, unidade, explicação ou decisão aplicada é regravada. A revisão do manifesto identifica a projeção sincronizada; os testes históricos de catálogos continuam comparando o estado da migração que exercitam, enquanto o check do gerador verifica o catálogo vigente.
