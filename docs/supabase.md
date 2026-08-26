# Supabase no AraLearn

O AraLearn precisa conservar relações, identificar pessoas, guardar arquivos
privados e receber operações que não devem ser executadas somente no
navegador. [Supabase](https://supabase.com/docs) reúne esses serviços em um
projeto, mas não os transforma numa única tecnologia. No AraLearn, cada parte
tem responsabilidade e fronteira próprias:

| Parte da plataforma | Problema que resolve no AraLearn | Autoridade |
| --- | --- | --- |
| [PostgreSQL](https://supabase.com/docs/guides/database/overview) | relações, transações, revisões, recibos e projeções do Curso | dados relacionais correntes |
| [Auth](https://supabase.com/docs/guides/auth/architecture) | cadastro, sessão, recuperação e identidade da aplicação | conta e sessão |
| [Storage](https://supabase.com/docs/guides/storage) | objetos binários privados, como avatar e PDF | bytes; vínculo e acesso continuam no banco |
| [Edge Functions](https://supabase.com/docs/guides/functions) | fronteiras HTTP da aplicação, do MCP e de Actions | transporte e orquestração; regras finais continuam nos contratos de domínio e SQL |

Realtime está desativado. Atualização entre abas usa `BroadcastChannel`, e a
reconciliação remota ocorre por leituras explícitas, eventos de foco,
visibilidade e retorno da conexão.

## PostgreSQL, esquemas e autorização

O banco conserva o Curso vivo, sua hierarquia, planejamento, materializações,
parâmetros, política de componentes, Fontes, Âncoras, vínculos de PDF,
Observações, Auditoria, Variantes, acesso, estado pessoal e fatos projetados
para Pesquisa. As migrations reproduzem o esquema, e o manifesto corrente
termina em `20260826094500_preserve_inspection_v1_and_scope_design_verification.sql`.

A inspeção contínua de Autoria agrega na página das Unidades os marcadores de
Observações, a materialização de origem e a comparação entre desenho usado e
vigente. A verificação de Auditoria coordena, na mesma transação, o estado das
Observações vinculadas. Esses comportamentos reutilizam as autoridades
existentes e não criam uma fila ou entidade de revisão em lote.
Durante o corte único da sequência, a projeção v1 permanece estável para a
release publicada e a inspeção contínua usa a projeção v2 separada. A API do
aplicativo negocia v2 pelo media type da inspeção; clientes anteriores sem essa
declaração continuam na rota e na projeção v1.

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
para que conteúdo, revisão, evento e recibo avancem ou sejam revertidos juntos.

Revisão esperada e identificador de pedido resolvem falhas distintas. A revisão
impede sobrescrita de trabalho concorrente; o identificador permite repetir a
mesma intenção depois de uma resposta perdida sem duplicar o efeito.

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

Os buckets `person-avatars` e `course-source-pdfs` são privados. O Storage
guarda bytes; o PostgreSQL conserva autoria, caminho autorizado, hash, tamanho,
tipo, revisão e vínculo com a Fonte. Conhecer um caminho não concede leitura.
[Políticas do Storage](https://supabase.com/docs/guides/storage/security/access-control)
protegem `storage.objects` e complementam as verificações relacionais.

Avatar usa a pasta da própria conta e admite JPEG, PNG ou WebP até 512 KiB. O
PDF segue outro contrato:

1. o navegador confere o cabeçalho e calcula SHA-256;
2. a API verifica propriedade, revisão, duplicidade e cota e cria uma intenção
   privada válida por dez minutos;
3. o navegador faz `POST` autenticado no caminho exato do bucket, sem URL
   assinada de envio;
4. política e gatilho exigem sessão viva e consomem a intenção na inserção;
5. a API relê o objeto com credencial de servidor, limita os bytes, confere
   tamanho, `%PDF-` e SHA-256 e só então cria o vínculo relacional.

Download é uma operação separada. Depois de verificar o vínculo e a propriedade
do Curso, a API emite URL assinada de leitura por sessenta segundos. Cada PDF
aceita até 20 MiB; o conteúdo único vinculado a um Curso aceita até 64 MiB.

## Edge Functions e autenticação no handler

| Função | Entrada | Identidade aceita |
| --- | --- | --- |
| `aralearn-course-api` | aplicação web e Android | sessão AraLearn validada pelo handler |
| `aralearn-authoring-mcp` | protocolo MCP e cinco ferramentas canônicas | JWT OAuth minimizado do MCP |
| `aralearn-authoring-action` | cinco operações HTTP importadas por OpenAPI | access token opaco do OAuth de Actions |

As três funções usam `verify_jwt = false` na configuração. Isso não as torna
anônimas. Cada handler precisa receber formatos que o verificador genérico da
plataforma não trata da mesma maneira e, por isso, valida explicitamente o
transporte antes de chamar o executor compartilhado. A API resolve a sessão
Supabase; o MCP verifica JWT e principal; Actions resolve o hash do token opaco.
Uma credencial de um canal é recusada nos outros.

As origens CORS são exatas. API e MCP admitem somente as origens da aplicação
configuradas. Actions acrescenta `https://chatgpt.com` e
`https://chat.openai.com`. Nenhum conjunto de produção aceita `*`.

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

## Retenção e Manutenção

A rotina `current-data-lifecycle-v1` remove, por classe e em lotes, Observações
retiradas depois do prazo lógico, recibos expirados, intenções de PDF vencidas e
janelas antigas de limitação de acesso. O [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron)
a executa diariamente às 03:17, no fuso do banco, com limite de 512 itens por
classe. Leituras e escritas também podem limpar dados vencidos nos caminhos
previstos. Uma identidade administrativa pode executar a mesma rotina com
confirmação explícita.

Manutenção apresenta o estado do agendamento e um inventário classificado de
objetos. A remoção de órfão revalida classe, caminho e estado imediatamente
antes de excluir. Objeto ausente é informado; metadados não são apagados para
ocultar a divergência. Objeto desconhecido não é removido por semelhança de
prefixo.

## Promoção e prova hospedada

Antes de aplicar migrations, o procedimento vincula o destino, lista o
histórico e executa `db push --dry-run`. O modo de aplicação exige confirmação
literal, aplica sem seed nem reset, repete a lista e executa o analisador do
banco. Se as funções forem publicadas, o script cadastra origens, implanta API,
MCP e Actions e verifica CORS, OAuth hospedado e o fluxo de PDF.

Depois disso, `npm run deployment:verify-hosted` confronta o manifesto exigido
pelos clientes com o backend. Uma falha exige diagnóstico do estado efetivo;
repetir uma escrita às cegas pode confundir ausência de resposta com ausência
de efeito.

O procedimento integral, incluindo site, Android e recuperação, está em
[Implantação](implantacao.md). O modelo de dados e a réplica local estão em
[Persistência relacional e sincronização](persistencia-relacional.md).
