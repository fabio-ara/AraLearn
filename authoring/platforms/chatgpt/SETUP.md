# Configuração do Chatbot e do Plugin

O AraLearn oferece duas superfícies independentes sobre o mesmo motor de autoria:

- **Chatbot**: GPT personalizado com instruções, dois arquivos de conhecimento e Action OpenAPI;
- **Plugin**: MCP nativo para chamar o AraLearn em qualquer conversa do ChatGPT.

## Chatbot

No construtor de GPT:

1. no AraLearn, abra **Chatbot** e toque em **OAuth**;
2. copie para a Action o **ID do cliente**, **Segredo**, **URL de autorização**,
   **Token URL** e **Escopo**; use **Padrão (solicitação POST)**;
3. em **Actions**, escolha o template em branco, cole `ACTION_OPENAPI.yaml` e
   informe esses valores em **OAuth**;
4. cole `INSTRUCTIONS.md` e envie `KNOWLEDGE_CORE.md` e
   `KNOWLEDGE_RESOURCES.md`;
5. em **Capacidades**, ative **Pesquisa na Web** para assuntos atuais e
   **Intérprete de código e Análise de Dados** para examinar PDFs, planilhas e
   outros anexos;
6. salve o GPT e copie seu identificador `g-...`;
7. volte ao AraLearn, informe esse identificador e toque em **Vincular**.

O GPT só recebe seu ID depois do primeiro salvamento. Por isso a credencial é
criada antes, e o vínculo posterior registra os callbacks exatos desse GPT.

O Chatbot chama um adaptador OpenAPI pequeno. Esse adaptador valida sua
concessão OAuth confidencial e
executa exatamente o mesmo registro de ferramentas, schemas, autorização e
motor de workspace usados pelo MCP; não existe um segundo modelo de autoria.

## Plugin

No ChatGPT:

1. abra **Plugins → Novo plugin**;
2. copie do painel **Plugin** do AraLearn o nome, a descrição e o endpoint;
3. selecione **URL do servidor** e **OAuth**;
4. confirme a instalação e conecte a conta AraLearn.

O Plugin recebe instruções curtas na inicialização MCP e usa
`prepararAutoriaAraLearn` para recuperar somente o conhecimento pertinente ao
pedido e ao contexto da conversa. Os guias completos também são publicados
como resources MCP. Assim ele pode criar ou consultar cursos a partir de uma
conversa comum sem carregar toda a documentação a cada turno.

## Backend

Implante `aralearn-authoring-mcp`, `aralearn-authoring-action` e a entrega
protegida de revisões. O Supabase OAuth 2.1 Server permanece com Dynamic Client
Registration, PKCE `S256`, chave assimétrica, consentimento e o hook
`public.aralearn_mcp_access_token_hook` para o Plugin MCP.

A Action usa os endpoints `/oauth/authorize` e `/oauth/token` da própria
`aralearn-authoring-action`. O construtor atual de GPT Actions não expõe os
parâmetros PKCE exigidos pelo OAuth Server do Supabase; por isso essa fachada
confidencial valida `client_secret_post` e `state`, usa código de uso único,
rotação de refresh token e persiste somente hashes. A autorização continua
sendo confirmada na conta AraLearn e as permissões continuam sendo resolvidas
no mesmo banco.

As credenciais administrativas existem somente nas Edge Functions. O Chatbot e
o Plugin recebem tokens OAuth curtos da conta conectada; permissões efetivas
continuam resolvidas no banco.

## Teste mínimo

1. liste workspaces;
2. prepare um pedido de criação com `prepararAutoriaAraLearn`;
3. crie um workspace vazio;
4. leia o `outline`;
5. percorra `explore`, `search`, `inspect` e `contracts` em
   `consultarBibliotecaDeResources`;
6. componha um card, execute `validate_card` e `audit_representation` e confira
   que `preview_card` informa `rendered: false`;
7. insira uma estrutura canônica pequena e materialize os cards validados;
8. renomeie e mova entidades usando a revisão atual;
9. consulte as microteorias de uma lição;
10. confira que o plano apareceu em Trilhas sem publicação;
11. abra o curso na biblioteca e teste o conteúdo pronto.

Confirme que o chat mostra microteorias, não despeja todas as práticas e que
uma revisão antiga produz conflito sem sobrescrever a atual.

O smoke hospedado recebe um access token OAuth de uma conta descartável:

```powershell
./scripts/testAuthoringMcpHosted.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Origin https://chatgpt.com
```

Execute esse conjunto uma vez no Chatbot e outra no Plugin.

## Pacotes

```powershell
npm run authoring:packages
npm run test:authoring-packages
```

Os artefatos gerados ficam em `docs/downloads/authoring/`.
