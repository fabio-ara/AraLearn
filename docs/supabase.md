# Supabase no AraLearn

O Supabase fornece autenticação, PostgreSQL, Storage e Edge Functions ao
AraLearn. O navegador usa apenas a URL do projeto e a chave pública. Operações
autorais privilegiadas passam pelas funções remotas, que validam a pessoa antes
de usar a credencial administrativa.

Na entrega 0.0.23, a ordem completa de publicação segue o roteiro de
[Implantação](implantacao.md).

O projeto hospedado está no plano Free, ativo na região `sa-east-1`, com
PostgreSQL 17.6 e revisão de esquema `20260820101500`. Depois do corte, o banco
ocupava 97.053.843 bytes e continha oito Cursos e 5.056 entidades correntes.

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

O projeto usa Supabase CLI 2.109.1, PostgreSQL 17, Node.js 22, Java 17 e Deno
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
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

`db reset` é apropriado somente para o banco local descartável. O script de
validação obtém as credenciais efêmeras do ambiente local, verifica Deno, faz
análise do banco, inicia cada Edge Function e executa testes de funcionamento
da API de Cursos, PostgREST, segurança por linha, e-mails de Auth e MCP por
OAuth.

Ao terminar:

```powershell
npx.cmd --yes supabase@2.109.1 stop
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

Orientação oficial: [segurança por linha](https://supabase.com/docs/guides/database/postgres/row-level-security)
e [privilégios da API de dados](https://supabase.com/docs/guides/api/using-custom-schemas).

## Migrações e manifesto

Migrações versionadas ficam em `supabase/migrations/`. A revisão corrente é
`20260820101500`. `supabase/runtime-manifest.json` associa essa revisão ao
contrato 1 e às capacidades exigidas pelo aplicativo.

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

O fluxo de PDF também passa por esta função. Ela autoriza a fonte, aplica
revisão e cotas, emite URL assinada e confirma o vínculo depois do envio.

## Servidor MCP

`supabase/functions/aralearn-authoring-mcp/` implementa o protocolo MCP base
2025-11-25. O recurso visual
`ui://aralearn/course-inspector/0.0.23.html` negocia separadamente a extensão
MCP Apps estável 2026-01-26. As duas versões identificam camadas distintas do
mesmo atendimento.

O cliente usa OAuth 2.1 com PKCE. O Supabase Auth atua como servidor de
autorização; o gancho `aralearn_mcp_access_token_hook` acrescenta as
informações necessárias ao token. O servidor consulta a sessão no Auth e
verifica emissor, destinatário, recurso, cliente, sujeito e validade temporal
antes de executar uma ferramenta. O cliente confere estado e código PKCE no
retorno da autorização.

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

## Storage privado

O AraLearn usa dois buckets correntes:

| Bucket | Conteúdo | Regra principal |
|---|---|---|
| `person-avatars` | JPEG, PNG ou WebP até 512 KiB | escrita na pasta da própria conta; leitura por relação permitida |
| `course-source-pdfs` | PDF até 20 MiB | acesso pelo vínculo relacional e por URL assinada |

Os buckets substituídos `course-revisions` e `authoring-artifacts` permanecem
isolados até a limpeza física autorizada. No corte, continham 20 objetos e
14.674.570 bytes no total; o uso corrente não os consulta.

O limite global local do Storage é maior para permitir testes, mas as regras do
aplicativo continuam mais restritas. Para PDFs, o total de conteúdo único por
Curso é 64 MiB e o detalhe de uma fonte retorna até oito anexos.

URLs assinadas expiram. Atualização de objeto não é usada no envio de PDF; um
novo conteúdo recebe novo resumo criptográfico. A confirmação relacional depois do envio torna
o vínculo visível ao Curso.

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
versão e capacidades e recusa configuração administrativa. Na publicação
0.0.23, o manifesto, o CORS e o OAuth MCP foram aprovados. Uma jornada separada
usou três identidades temporárias para verificar acesso de Estudo, negação a
terceiro, PDF íntegro e adulterado, Variantes e Pesquisa, com remoção integral
dos dados de ensaio.

O plano Free admite 500 MB de banco por projeto, 1 GB de Storage, 500 mil
invocações de funções e 5 GB de transferência incluída na organização. No
estado medido, banco e Storage ocupavam cerca de 18,5% e 1,4% dessas cotas. Uma
sequência hospedada de 41 chamadas MCP respondeu sem erro, com mediana de 291 ms
e percentil 95 de 587 ms. Transferência mensal e crescimento precisam continuar
sob acompanhamento; uma medição pontual não projeta uso continuado.

Referências oficiais: [cotas e cobrança](https://supabase.com/docs/guides/platform/billing-on-supabase),
[tamanho do banco](https://supabase.com/docs/guides/platform/database-size) e
[transferência do Storage](https://supabase.com/docs/guides/storage/serving/bandwidth).
