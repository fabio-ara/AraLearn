# Implantação

O AraLearn precisa de uma aplicação estática, um projeto Supabase e, quando houver autoria assistida, da API editorial. O mesmo código atende à web e ao APK Android. O banco é necessário para conta, catálogo, progresso, comentários, trilhas, importação e sincronização; não há um banco de dados local alternativo para substituir o Supabase em produção.

## Escolher o ambiente

Para uma instituição que quer começar sem administrar servidores, use Supabase hospedado e um site estático. GitHub Pages, SharePoint ou qualquer servidor HTTPS podem hospedar os arquivos gerados. A instituição controla o domínio da aplicação, os usuários, o SMTP e o projeto Supabase.

Para uma intranet isolada, a instituição precisa hospedar uma instância compatível com Supabase, incluindo PostgreSQL, Auth, PostgREST, gateway, Edge Functions, armazenamento de e-mail e certificados HTTPS. Esse cenário exige equipe de infraestrutura. O AraLearn não oferece um instalador de banco para Windows nem transforma o IndexedDB em servidor: IndexedDB é apenas a cópia offline de cada dispositivo.

SharePoint Online pode servir os arquivos estáticos quando a política do tenant permitir. O caminho mais simples é publicar o build em um site ou biblioteca de documentos com HTTPS e cadastrar essa origem nos redirecionamentos do Auth. Um pacote SPFx próprio exige um trabalho de integração separado, com revisão das políticas do tenant; ele não é necessário para usar o AraLearn numa intranet.

## Preparar um projeto Supabase

1. Crie um projeto na região mais próxima dos estudantes.
2. Instale a Supabase CLI, faça login e mantenha a senha do banco e a service role fora do repositório.
3. No painel de Auth, habilite e-mail e senha, confirmação de e-mail, rotação de refresh token e alteração segura de senha. Desabilite login anônimo.
4. Em **Authentication → URL Configuration**, cadastre somente as origens reais da aplicação, por exemplo `https://intranet.exemplo.org/aralearn/`, `https://intranet.exemplo.org/aralearn/**` e o callback Android `aralearn://auth/callback`. Para desenvolvimento, inclua `http://localhost:4182/` e `http://127.0.0.1:4182/` com seus respectivos caminhos `/**`.
5. Mantenha os modelos de confirmação e recuperação com `{{ .ConfirmationURL }}`. Antes de abrir o cadastro ao público, configure SMTP institucional, remetente e domínio adequados.

O Project Ref, a Project URL e a publishable key podem aparecer no build. Senha do banco, service role, token pessoal, refresh token e chave de assinatura Android não podem.

## Aplicar o banco e a API

No PowerShell, a partir da raiz do repositório:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 -ProjectRef <project-ref>
```

O modo padrão só vincula o projeto, compara migrations e executa o dry-run. Leia a lista. Não continue se houver objetos ou migrations inesperados no projeto remoto.

Para aplicar as migrations e implantar a API editorial, depois da revisão:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectRef <project-ref> `
  -Mode Apply `
  -DeployAuthoringApi `
  -AllowedOrigin https://intranet.exemplo.org,http://localhost:4182,http://127.0.0.1:4182
```

O script pede a confirmação literal `APLICAR`. Ele nunca usa reset, seed, `db pull` ou `migration repair`; só aplica migrations versionadas. Se a CLI pedir senha do banco, informe-a diretamente no terminal. Nenhum segredo é escrito pelo script.

Depois, confirme o histórico e o lint:

```powershell
npx.cmd --yes supabase@2.109.1 migration list --linked
npx.cmd --yes supabase@2.109.1 db lint --linked --level warning --fail-on warning
```

As três fixtures em `supabase/fixtures/catalog/` são exemplos administrativos. Elas não entram pelo deploy nem são incluídas no app. A publicação inicial do catálogo está em [Supabase](supabase.md#publicação-inicial-das-fixtures-oficiais).

## Configurar e publicar a aplicação

Defina somente a Project URL e a publishable key no processo de build:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
npm.cmd run pages:build
npm.cmd run android:release
```

Publique o conteúdo de `.pages/` no host HTTPS escolhido, preservando o caminho público configurado no Auth. Para GitHub Pages, use as Actions Variables `ARALEARN_SUPABASE_URL` e `ARALEARN_SUPABASE_PUBLISHABLE_KEY`; elas são configurações públicas. Não crie uma variável de service role.

Antes de distribuir o APK, use uma chave de assinatura de produção guardada pelo responsável. A chave debug preserva apenas instalações de desenvolvimento e não é adequada para distribuição institucional ampla.

## Ativar a autoria assistida

A API editorial só deve ser ativada depois que o banco, a função e a autenticação estiverem funcionando. O primeiro proprietário e a chave restrita são criados localmente, sem enviar a service role ao navegador ou ao assistente:

```powershell
pwsh -NoProfile -File .\scripts\bootstrapAuthoringAccess.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -OwnerEmail responsavel@exemplo.org
```

O terminal pede a service role de modo protegido e mostra uma única vez a chave `arl_...` do cliente editorial. Guarde-a em cofre. Uma configuração com essa chave deve permanecer privada ou restrita ao espaço de trabalho. Os passos de cada plataforma ficam em [material de autoria](../authoring/README.md).

## Verificar antes da abertura

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run pages:build
npm.cmd run android:debug
.\android\gradlew.bat -p .\android :app:lintDebug --no-daemon
```

Com Docker disponível, valide também o banco iniciado do zero e os testes SQL:

```powershell
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
npx.cmd --yes supabase@2.109.1 test db
npm.cmd run test:supabase:smoke
npm.cmd run test:authoring:smoke
```

O smoke editorial publica material temporário; execute-o somente no Supabase local. No projeto hospedado, valide primeiro conta, confirmação de e-mail, login, seleção de curso, estudo offline, retorno de conexão, progresso, comentário e troca de dispositivo.
