# Supabase no AraLearn

O Supabase fornece autenticação, PostgreSQL, Storage e Edge Functions ao
AraLearn. O navegador usa apenas a URL do projeto e a chave pública. Operações
autorais privilegiadas passam pelas funções remotas, que validam a pessoa antes
de usar a credencial administrativa.

Na entrega 0.0.25, o Supabase não mudou. Antes da publicação dos clientes
0.0.26, o backend foi promovido para o esquema `20260821145358`, a API de Cursos
na revisão 9 e o MCP na revisão 124. A ordem completa segue o roteiro de
[Implantação](implantacao.md).

Na implantação verificada, o projeto hospedado estava no plano Free, ativo na
região `sa-east-1`, com PostgreSQL 17.6 e revisão de esquema
`20260821191340`, que declara 36 capacidades obrigatórias. A API de Cursos
estava ativa na revisão 13 e o MCP, na revisão 128.
Depois do corte 0.0.23, o banco ocupava 97.053.843 bytes e continha oito Cursos
e 5.056 entidades correntes; esses números continuam sendo a medição pontual
documentada, não uma leitura permanente do consumo.

A versão publicada 0.0.27 acrescenta `current-data-lifecycle-v1` e
`authenticated-course-source-pdf-upload-v1` ao contrato hospedado.

## Componentes usados

| Serviço | Uso no AraLearn |
|---|---|
| Auth | conta por e-mail, sessão, recuperação e OAuth 2.1 do MCP |
| PostgreSQL | Curso, acesso, plano, composição, Fontes, estado pessoal, Anotações, Variantes, Pesquisa e Autoria |
| API de dados | leituras e funções SQL autenticadas do Estudo |
| Storage | avatares e PDFs privados de fontes |
| Edge Functions | API de Cursos e servidor MCP |
| Studio local | inspeção do banco descartável durante desenvolvimento |

O ambiente hospedado conserva somente `aralearn-course-api` e
`aralearn-authoring-mcp`. As funções da versão 0.0.22 foram retiradas depois da
verificação do Pages 0.0.23.

O Realtime permanece desabilitado. Sincronização entre abas usa mecanismos do
navegador, e a reconciliação remota ocorre pelos contratos específicos de cada
família.

## Versões e configuração local

O projeto usa Supabase CLI 2.115.0, PostgreSQL 17, Node.js 22, Java 17 e Deno
2.x. Os comandos versionados invocam a CLI com a versão fixa para que a máquina
local e a integração contínua executem o mesmo contrato.

O arquivo `supabase/config.toml` define:

- API em `http://127.0.0.1:54321`;
- PostgreSQL em `127.0.0.1:54322`;
- Studio em `http://127.0.0.1:54323`;
- caixa de e-mail local em `http://127.0.0.1:54324`;
- OAuth Server e o gancho de token do MCP;
- as funções `aralearn-course-api` e `aralearn-authoring-mcp`;
- Auth com confirmação de e-mail e rotação de token.

Docker precisa estar em execução. Para recriar o ambiente:

```powershell
npx.cmd --yes supabase@2.115.0 start
npx.cmd --yes supabase@2.115.0 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

`db reset` é apropriado somente para o banco local descartável. O script de
validação obtém as credenciais efêmeras do ambiente local, verifica Deno, faz
análise do banco, inicia cada Edge Function e executa testes de funcionamento
da API de Cursos, PostgREST, segurança por linha, e-mails de Auth e MCP por
OAuth.

Ao terminar:

```powershell
npx.cmd --yes supabase@2.115.0 stop
```

## Esquemas e exposição

A API de dados expõe apenas `public` e `graphql_public`. Relações internas ficam
em `private`. Uma tabela em esquema exposto só é utilizável quando há, ao mesmo
tempo, privilégio SQL para o papel e política de segurança por linha. Criar uma
política não concede o privilégio, e conceder o privilégio não substitui a
política.

As tabelas públicas destinadas ao cliente têm segurança por linha habilitada.
As políticas usam `auth.uid()` e relações de acesso para limitar:

- perfil à própria pessoa ou à relação pública permitida;
- Curso ao proprietário e às pessoas com compartilhamento ativo;
- estado pessoal à própria conta;
- Anotações e citações ao autor e ao Curso acessível;
- objetos de avatar à pasta e às relações autorizadas.

As relações privadas não recebem acesso direto de `anon` ou `authenticated`.
Funções públicas expõem operações estreitas e verificam a identidade novamente
no PostgreSQL.

Desde a versão 0.0.27, inserts de avatar e PDF conferem também se o
`session_id` do JWT permanece em `auth.sessions` e se `not_after` ainda não
venceu. Essas escritas e a exclusão da conta compartilham o mesmo bloqueio
transacional. A exclusão conserva a sessão quando ainda precisa remover objetos
e, somente na transação final, apaga todas as sessões imediatamente antes de
`auth.users`. Isso fecha novas escritas com um token de sessão revogada; uma URL
de download já assinada ainda pode durar até 60 segundos.

Depois que essa transação responde com sucesso, a exclusão remota é terminal.
Uma falha posterior ao apagar o IndexedDB, inclusive bloqueio por outra aba,
admite somente repetir a limpeza local; não autoriza repetir a operação remota
nem afirmar que a conta foi preservada.

Orientação oficial: [segurança por linha](https://supabase.com/docs/guides/database/postgres/row-level-security)
e [privilégios da API de dados](https://supabase.com/docs/guides/api/using-custom-schemas).

## Migrações e manifesto

Migrações versionadas ficam em `supabase/migrations/`. A revisão hospedada
corrente e `supabase/runtime-manifest.json` declaram `20260821191340` e 36
capacidades obrigatórias. A recriação local aprovou pgTAP 103/103, concorrência
PostgreSQL 13/13, os testes PGlite, o smoke de Curso e o fluxo OAuth/MCP real;
a promoção e as provas hospedadas confirmaram o mesmo contrato.

A migração `20260820224424_canonical_study_unit_composition_edits.sql` acrescenta
uma forma de composição exclusiva do papel de servidor. Ela limita o canal do
aplicativo a uma Unidade existente, exige revisões do Curso e da Unidade e
registra `manual` ou `provider_assistance` no recibo e no evento. O canal MCP
mantém a forma pública anterior de resposta.

O mesmo contrato permite carregar a proveniência efetiva de uma edição textual
somente quando o JSONB coincide com o conjunto anterior. Um vínculo novo ou
alterado continua exigindo Fonte e Âncora ativas nas revisões exatas. A função
restringe a execução ao `service_role`; `anon`, `authenticated` e `PUBLIC` não
recebem essa capacidade.

A migração
`20260821145358_personal_course_copy_edit.sql` mantém a operação canônica acima
exclusiva do proprietário e acrescenta outra função de papel de servidor para a
primeira gravação de quem possui acesso direto. A função:

1. exige acesso compartilhado e compara a revisão do Curso e a versão da Unidade;
2. não cria cópia quando o conteúdo não mudou;
3. serializa a criação por pessoa e Curso de origem;
4. cria um Curso privado, copia somente as entidades curriculares e aplica a
   mudança na mesma transação;
5. registra a relação privada e um recibo idempotente;
6. recusa execução direta por `anon`, `authenticated` e `PUBLIC`.

A relação não concede ao cliente acesso direto às tabelas privadas. A API de
Cursos deriva o ator do JWT e chama a função com credencial de servidor; a
interface nunca envia `actorId`. Naquela migração, o catálogo MCP e suas permissões
permaneceram inalterados. Essa migração trabalha exclusivamente na arquitetura
Supabase atual e não implementa Git ou `VersionedCourseStore`.

Uma mudança de banco completa deve conter:

1. verificação prévia das dependências e do estado que será transformado;
2. criação ou alteração de relações, funções, restrições e índices;
3. privilégios mínimos e políticas de segurança por linha;
4. verificações posteriores do contrato instalado;
5. avanço do manifesto somente após todas as capacidades existirem;
6. teste focal de domínio, PGlite ou PostgreSQL real conforme o risco.

O manifesto é consumido pelo aplicativo, pelos verificadores de implantação e
pela cópia publicada no site. Alterá-lo sem instalar o contrato correspondente
faz o ambiente parecer compatível quando não é.

### Ciclo de dados corrente

`20260821191340_harden_current_data_lifecycle.sql` introduz controles sobre a
arquitetura atual, sem criar Git ou infraestrutura de pesquisa:

- concessão por e-mail com resposta genérica e até dez tentativas por ator em
  dez minutos; replay idêntico é resolvido antes do limite;
- contadores agregados por ator, sem e-mail nem hash de e-mail, removíveis após
  30 dias;
- rotina privada diária às 03:17, com limite padrão de 512 por classe e
  contagens de Anotações retiradas, recibos, intenções de PDF e janelas de
  concessão;
- revogação de todas as sessões imediatamente antes de excluir o usuário Auth;
- inventário limitado de órfãos de avatar e PDF, sem remoção automática.

Os prazos técnicos mantidos são 14 dias para Anotações retiradas, recibos de
Anotação e recibos de mudança de Curso; sete dias para recibos de estado
pessoal; dez minutos para intenções de PDF; e 30 dias para janelas agregadas de
concessão. Logs, backups, conteúdo autoral e pesquisa dependem da política da
implantação.

Para conferir o histórico remoto sem escrever:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co
```

O modo padrão vincula o projeto, lista migrações e executa
`db push --dry-run`. Ele não promove esquema nem função.

## Migração da identidade de Curso hospedada

Um ambiente que ainda contém Cursos anteriores ao modelo corrente precisa usar
o executor dedicado antes da implantação normal:

```powershell
node .\scripts\courseCutover\runCourseIdentityCutover.mjs --help
```

Sem `--apply`, o executor lê o estado hospedado, valida a fonte e grava uma
atestação privada de preparação. Com `--apply`, ele relê o mesmo resumo criptográfico e executa
as migrações previstas em uma única transação PostgreSQL. Depois recompõe os
Cursos, compara os hashes semânticos e registra a atestação verificada.

Segredos chegam por entrada padrão ou variáveis efêmeras descritas em `--help`.
Eles não devem aparecer em arquivo versionado nem em linha de comando que seja
persistida pelo terminal. Uma divergência de fonte, identidade, quantidade ou
resumo criptográfico interrompe a transação.

Após a migração de identidade, `migration list` e `db push --dry-run` devem demonstrar paridade.

## API de Cursos

`supabase/functions/aralearn-course-api/` atende o navegador da Autoria. A rota
identifica a operação solicitada, valida origem e token Supabase, converte a
entrada no contrato comum e chama o executor de Curso.

A função atende somente as origens exatas configuradas em
`ARALEARN_COURSE_API_ALLOWED_ORIGINS`. Produção inclui a origem do Pages e do
WebView Android; desenvolvimento inclui `localhost` e `127.0.0.1` na porta
prevista. Uma origem adicional precisa ser declarada durante a implantação.

O fluxo de PDF também passa por esta função. Desde a versão 0.0.27, ela autoriza
a Fonte, aplica revisão e cotas e cria uma intenção exata de dez minutos. O
navegador faz POST no Storage com a sessão corrente; a política confere
`session_id`, validade da sessão, caminho, tamanho, tipo e intenção, que é
consumida na inserção. A função confirma o cabeçalho e o SHA-256 antes de criar
o vínculo. Um objeto incompatível de mesmo tamanho e tipo fica sem vínculo e é
classificado pelo inventário administrativo, sem exclusão automática. O download
continua assinado por 60 segundos.

A edição manual e a sugestão aplicada ao rascunho usam a rota contextual de
composição da mesma API. O navegador não chama a função SQL diretamente. A API
valida a sessão; o adaptador envia a identidade comprovada, o canal
`application`, a origem fechada e as versões esperadas. Conteúdo, atribuição de
Fontes, revisão, evento e recibo pertencem à mesma transação.

## Servidor MCP

`supabase/functions/aralearn-authoring-mcp/` implementa o protocolo MCP base
2025-11-25. O recurso visual
`ui://aralearn/course-inspector/0.0.23.html` negocia separadamente a extensão
MCP Apps estável 2026-01-26. As duas versões identificam camadas distintas do
mesmo atendimento.

O cliente usa OAuth 2.1 com PKCE. O Supabase Auth atua como servidor de
autorização. Desde a versão 0.0.27, os metadados anunciam somente
`offline_access`; a troca por código e a renovação não emitem `id_token`. O
gancho `aralearn_mcp_access_token_hook` substitui `sub` e `session_id` por
aliases pareados distintos para o cliente e retira UUID da pessoa, e-mail,
perfil e metadados. O resultado é uma credencial de recurso para o MCP, não uma
sessão da aplicação. O JWT preserva `aralearn_session_id`, UUID real e
correlacionável da sessão de origem usado pela RPC de vida. Ele não aparece em
respostas ou logs públicos, mas impede tratar a credencial inteira como anônima
ou plenamente desvinculável.

A função verifica a assinatura ES256 com chave EC P-256 pela JWKS do emissor,
além de emissor, destinatário, tempos, cliente e escopo exato. Só depois o
adaptador chama `resolve_mcp_oauth_principal_v1` com papel de serviço. Essa RPC
resolve a pessoa pela sessão de origem e exige usuário, perfil, sessão, cliente
e consentimento ainda ativos. O bearer com `client_id` é bloqueado pela
pré-requisição da API de dados; as políticas do Storage recusam sua sessão
pareada, e o GoTrue não encontra usuário nem sessão pelos aliases.

A migração da 0.0.27 revogou consentimentos e removeu sessões OAuth anteriores,
sem encerrar sessões comuns da aplicação. Isso eliminou a continuidade por
refresh token, mas não recolheu um ID token `openid` já assinado, que permaneceu
válido até `exp`. A implantação aguardou pelo menos a duração JWT configurada ou
duas horas desde a última emissão possível de URL v1 de upload, o que fosse
maior, com margem operacional. Depois, repetiu as negativas e conferiu o
inventário de objetos sem vínculo antes de declarar a fronteira fechada.

A função aceita CORS somente para as origens de
`ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS`. A URL pública do aplicativo vem de
`ARALEARN_PUBLIC_APP_URL` e participa dos metadados de autorização.

O `verify_jwt = false` da configuração da Edge Function permite receber os
formatos exigidos pelo OAuth e responder aos metadados do protocolo. Isso não
dispensa autenticação: a função de entrada faz a validação completa antes de
chamar o executor.

O navegador e o MCP convergem em `courseRouter`, `courseToolExecutor` e
`courseSupabaseAdapter`. Essa convergência mantém autorização, revisão,
idempotência e forma da resposta iguais entre as duas entradas.

Referência oficial: [Supabase Auth como servidor OAuth 2.1](https://supabase.com/docs/guides/auth/oauth-server).

Proteção contra senhas vazadas e MFA permanecem decisões de implantação. Os
avisos do advisor devem ser confrontados com risco, população, recuperação de
conta e operação institucional; não constituem, isoladamente, uma prova de
conformidade nem uma ordem para habilitar todo mecanismo disponível.

## Chaves e segredos

O artefato público recebe somente:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

A chave pública identifica o projeto; a autorização real vem da sessão, dos
privilégios e das políticas. O verificador de artefatos recusa `service_role`,
`sb_secret_` e outras chaves administrativas.

No ambiente hospedado, as Edge Functions usam uma chave `sb_secret_` fornecida
por `SUPABASE_SECRET_KEY` ou pelo conjunto nomeado `SUPABASE_SECRET_KEYS`. O
ambiente local aceita a `SUPABASE_SERVICE_ROLE_KEY` efêmera criada pela CLI.
Essas credenciais administrativas podem ignorar a segurança por linha, por
isso permanecem no servidor e só são usadas depois que a função de entrada
comprova a pessoa e chama operações exclusivas do proprietário.

A consulta da sessão no Auth usa `SUPABASE_PUBLISHABLE_KEY` ou
`SUPABASE_PUBLISHABLE_KEYS`. Quando um conjunto contém mais de uma chave,
`ARALEARN_SUPABASE_SECRET_KEY_NAME` e
`ARALEARN_SUPABASE_PUBLISHABLE_KEY_NAME` selecionam os pares correspondentes.

Segredos de banco, assinatura Android, sessão de teste e token da CLI ficam em
cofres, variáveis efêmeras ou entrada padrão. Logs de falha devem omitir JWTs,
senhas e chaves.

Desde a versão 0.0.27, envelopes públicos projetam somente diagnósticos
estruturais permitidos e não refletem e-mail, cabeçalho de autorização, token ou
corpo bruto. Uma verificação estática também reprova `console` nas Edge
Functions e rastreamento ou impressão direta de credenciais nos workflows.

## Storage privado

O AraLearn usa dois buckets correntes:

| Bucket | Conteúdo | Regra principal |
|---|---|---|
| `person-avatars` | JPEG, PNG ou WebP até 512 KiB | escrita na pasta da própria conta; leitura por relação permitida |
| `course-source-pdfs` | PDF até 20 MiB | 0.0.26: upload e download assinados; 0.0.27: upload autenticado com intenção de dez minutos e download assinado por 60 segundos |

Os buckets substituídos `course-revisions` e `authoring-artifacts` permanecem
isolados até a limpeza física autorizada. No corte, continham 20 objetos e
14.674.570 bytes no total; o uso corrente não os consulta.

O limite global local do Storage é maior para permitir testes, mas as regras do
aplicativo continuam mais restritas. Para PDFs, o total de conteúdo único por
Curso é 64 MiB e o detalhe de uma fonte retorna até oito anexos.

URLs de download assinadas expiram, mas uma URL já emitida não pode ser
revogada individualmente antes dos 60 segundos. Atualização de objeto não é
usada no envio de PDF; um
novo conteúdo recebe novo resumo criptográfico. A confirmação relacional depois do envio torna
o vínculo visível ao Curso.

Na compatibilidade mantida pela 0.0.27, `download` emite v1 somente para
preservar a leitura do Android 0.0.26, enquanto `prepare_upload` emite apenas v2 autenticado e nunca
uma URL assinada. O upload antigo falha fechado ao receber v2. Essa
compatibilidade depende da operação, não de `User-Agent`, e a retirada de v1
exige uma decisão explícita de encerrar o suporte ao 0.0.26. Uma URL v1 de
upload emitida antes do corte não é revogada por essa mudança e pode permanecer
ativa por até duas horas; nenhum cliente recebe outra depois da promoção.

Políticas de `storage.objects` e verificações da API resolvem camadas distintas.
No fluxo padrão do Supabase, um envio com sobrescrita também exige permissões de
seleção e atualização, além da inserção. O AraLearn evita sobrescrita no bucket
de PDFs e controla duplicidade pelo resumo criptográfico.

Referência oficial: [controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Implantação do banco e das funções

Depois que o corte aplicável estiver verificado, a promoção normal usa:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Mode Apply `
  -DeployAuthoringFunctions
```

O script sempre começa com lista de migrações e simulação. No modo de
aplicação, exige a confirmação literal `APLICAR`, executa `db push`, repete o
inventário e reprova qualquer aviso da análise hospedada do banco.

Com `-DeployAuthoringFunctions`, ele configura as origens e a URL pública,
implanta a API de Cursos e o MCP, testa a verificação prévia de CORS do Pages e
executa o teste OAuth hospedado. Funções substituídas podem permanecer
implantadas durante a janela de atualização, mas deixam de ser compatíveis com
o banco depois do corte. Sua retirada é explícita e ocorre somente depois da
verificação do Pages novo.

Na promoção da 0.0.24, o banco chegou a `20260820224424` e as duas funções
foram implantadas e verificadas antes do Pages e do APK. Os clientes recusam o
manifesto anterior; inverter essa ordem publicaria uma interface que anuncia
edição contextual sem o contrato remoto correspondente.

Na promoção do backend da versão 0.0.26, o modo Apply levou o banco a
`20260821145358`, a API de Cursos à revisão 9 e o MCP à revisão 124. A análise
hospedada permaneceu limitada aos 88 avisos legados; CORS, OAuth/MCP e o
verificador público da revisão e de `package-library-v1` passaram. Pages e
Android 0.0.26 foram publicados depois dessa confirmação.

Na promoção do backend da versão 0.0.27, o modo Apply levou o banco a
`20260821191340`, com 36 capacidades obrigatórias, a API de Cursos à revisão 13
e o MCP à revisão 128. O catálogo hospedado passou a cinco ferramentas. CORS,
manifesto, rotina de retenção, inventário, OAuth com autorização e renovação e o
fluxo autenticado de PDF foram verificados antes dos clientes.

Uma nova origem pode ser acrescentada com `-AllowedOrigin`. O valor deve ser
uma origem HTTPS sem caminho, consulta ou fragmento; HTTP é aceito somente em
`localhost` e `127.0.0.1`.

## Limpeza física controlada

A migração funcional e a remoção de estruturas antigas são operações
separadas. O conjunto em `scripts/courseCutover/` prepara:

- instantâneo SQL do inventário;
- varredura de consumidores no código em execução;
- cópia do banco e dos buckets, com verificação;
- ensaio de restauração apenas em destino local descartável;
- plano ligado ao manifesto, inventário, cópia e teste de funcionamento observados;
- SQL final que aceita somente o token de confirmação daquele plano;
- planos independentes para buckets substituídos e PDFs órfãos.

O comando de entrada é:

```powershell
node .\scripts\courseCutover\prepareLegacyCleanup.mjs --help
```

Se a cópia, a restauração ou o inventário não puderem ser comprovados, a
limpeza para. Banco e funções já validados podem ser publicados sem executar
essa etapa destrutiva.

## Verificação hospedada

Defina apenas a configuração pública no processo e execute:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
npm.cmd run deployment:verify-hosted
```

O verificador consulta o manifesto remoto com a chave pública, compara revisão,
versão e capacidades e recusa configuração administrativa. Na promoção da
versão 0.0.26, o manifesto `20260821145358`, `package-library-v1`, o CORS e o
OAuth MCP foram aprovados. O teste hospedado da 0.0.24 percorreu Fonte,
Observação, ciclo de auditoria e autoria incremental e encerrou sem resíduos.
Uma jornada anterior, no corte 0.0.23,
usou três identidades temporárias para verificar acesso de Estudo, negação a
terceiro, PDF íntegro e adulterado, Variantes e Pesquisa, também com remoção
integral dos dados de ensaio.

Na 0.0.27, o verificador hospedado confirmou `20260821191340`, as 36
capacidades e as revisões 13 e 128 das Edge Functions. O smoke OAuth percorreu
autorização, chamada MCP, renovação e nova chamada MCP sem `id_token`; o mesmo
bearer foi recusado pelo GoTrue, pela API de dados e pelo Storage. O smoke de PDF
percorreu preparo v2, envio autenticado, confirmação, download temporário e
limpeza sem resíduo.

O plano Free admite 500 MB de banco por projeto, 1 GB de Storage, 500 mil
invocações de funções e 5 GB de transferência incluída na organização. No
estado medido, banco e Storage ocupavam cerca de 18,5% e 1,4% dessas cotas. Uma
sequência hospedada de 41 chamadas MCP respondeu sem erro, com mediana de 291 ms
e percentil 95 de 587 ms. Transferência mensal e crescimento precisam continuar
sob acompanhamento; uma medição pontual não projeta uso continuado.

Referências oficiais: [cotas e cobrança](https://supabase.com/docs/guides/platform/billing-on-supabase),
[tamanho do banco](https://supabase.com/docs/guides/platform/database-size) e
[transferência do Storage](https://supabase.com/docs/guides/storage/serving/bandwidth).
