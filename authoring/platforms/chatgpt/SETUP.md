# Configurar autoria no ChatGPT

O AraLearn pode ser conectado ao ChatGPT de duas maneiras. As duas alcançam o
mesmo registro de 30 ferramentas e o mesmo estado relacional, mas usam
interfaces e fluxos OAuth distintos:

- o **GPT personalizado com Action** recebe instruções, arquivos de
  conhecimento e um schema OpenAPI; no AraLearn, essa opção aparece na aba
  **Chatbot**;
- a **integração MCP remota** conecta o servidor diretamente em um ambiente do
  ChatGPT que aceite servidores MCP personalizados; no AraLearn, essa opção
  aparece na aba **Plugin**.

Escolha uma única forma para cada configuração. Action e MCP não devem ser
tratados como dois estados autorais: ambos operam os mesmos workspaces, espaços
persistentes que guardam a árvore e a revisão corrente do curso, e as
permissões continuam vinculadas à conta AraLearn autenticada.

## Antes de configurar

O backend precisa ter as Edge Functions `aralearn-authoring-mcp` e
`aralearn-authoring-action` implantadas, além do serviço de entrega protegida
das revisões. O banco precisa conter migrações, políticas e o servidor OAuth
correspondentes ao código desta versão.

No AraLearn, abra a assistência de autoria. As abas fornecem os artefatos e os
valores que pertencem ao ambiente implantado:

- **Chatbot**: Instructions, Knowledge, Resources, schema da Action, criação de
  credencial OAuth e vínculo do identificador do GPT;
- **Plugin**: nome, descrição, endpoint MCP e indicação de OAuth.

Nunca copie `service_role`, senha do banco ou segredo administrativo para o
ChatGPT. A integração recebe somente credenciais OAuth destinadas à conta que
autoriza o uso.

## Criar um GPT personalizado com Action

### Pré-condição

Tenha permissão na plataforma para criar um GPT e acesso ao painel **Chatbot**
do AraLearn. A Action precisa estar implantada em HTTPS.

### Passos

1. No AraLearn, abra **Chatbot** e use **OAuth** para criar uma credencial.
2. Guarde **ID do cliente**, **Segredo**, **URL de autorização**, **Token URL**,
   **Escopo** e o método **Padrão (solicitação POST)**.
3. Baixe os quatro artefatos: Instructions, Knowledge, Resources e schema da
   Action.
4. No editor de GPTs, crie uma nova configuração.
5. Cole o conteúdo de `INSTRUCTIONS.md` no campo de instruções.
6. Adicione `KNOWLEDGE_CORE.md` e `KNOWLEDGE_RESOURCES.md` ao conhecimento.
7. Em **Actions**, crie uma Action e cole `ACTION_OPENAPI.yaml`.
8. Configure OAuth com os valores fornecidos pelo AraLearn. Use troca de token
   por solicitação POST.
9. Se a tarefa autoral precisar consultar informações atuais, habilite pesquisa
   na web. Se precisar examinar anexos estruturados, habilite análise de dados.
   Essas capacidades não substituem as ferramentas do AraLearn.
10. Salve o GPT, copie seu identificador `g-...`, volte ao AraLearn, informe o
    identificador e use **Vincular**.
11. Abra a visualização do GPT, invoque uma leitura simples e conclua o
    consentimento OAuth com a conta AraLearn correta.

### Resultado esperado

O GPT lista apenas os workspaces acessíveis à conta conectada. Uma escrita
retorna a nova revisão e o resultado aparece em Trilhas sem exigir publicação.

### Por que o vínculo ocorre depois do primeiro salvamento

O identificador `g-...` só existe depois que a plataforma salva o GPT. O
AraLearn usa esse identificador para limitar os callbacks associados à
credencial criada. Criar a credencial primeiro e vinculá-la depois evita usar
um redirect genérico.

### Offline e recuperação

Actions exigem conexão. Se a plataforma interromper uma escrita, não envie
imediatamente outra tentativa: o servidor pode ter concluído a primeira.
Retome o workspace, confira a revisão atual e repita o mesmo `requestId` apenas
se os argumentos forem idênticos.

## Conectar o servidor MCP remoto

### Pré-condição

O ambiente do ChatGPT precisa oferecer modo de desenvolvedor e conexão de
servidor MCP remoto. A disponibilidade e os nomes de tela dependem do plano e
das políticas da organização.

### Passos

1. Nas configurações do ChatGPT, em **Security and login**, habilite o modo de
   desenvolvedor quando essa opção estiver disponível.
2. Abra a página de **Plugins** e escolha adicionar uma conexão em modo de
   desenvolvedor.
3. No AraLearn, abra **Plugin** e copie nome, descrição e endpoint.
4. Informe o endpoint como URL do servidor remoto e selecione OAuth.
5. Conclua a conexão e autorize a conta AraLearn desejada.
6. Inicie uma conversa nova e peça uma leitura de workspaces antes de qualquer
   gravação.

Endpoint esperado:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O transporte é Streamable HTTP. O cliente descobre o recurso protegido e usa
OAuth 2.1 com PKCE e registro dinâmico de cliente, conforme suportado pelo
servidor OAuth do Supabase.

### Resultado esperado

As ferramentas aparecem com schemas fechados. O cliente pode chamar
`prepararAutoriaAraLearn`, descobrir resources progressivamente e operar o
workspace autorizado.

### Offline e recuperação

Uma conexão MCP remota não funciona offline. Após reconectar, abra uma nova
etapa com `lerWorkspaceDeAutoria` em `view: "resume"`. O chat não é a fonte do
estado autoral.

## Por que Action e MCP têm OAuth diferentes

O servidor MCP usa os mecanismos OAuth 2.1 esperados pelo protocolo, incluindo
PKCE `S256`, descoberta de protected resource e registro dinâmico. O construtor
de GPT Actions não oferece os parâmetros PKCE exigidos por esse caminho. A
Edge Function da Action, por isso, fornece uma fachada confidencial própria,
com `client_secret_post`, validação de `state`, código de uso único, rotação de
refresh token e persistência somente de hashes.

Essa diferença termina no transporte. Depois da autenticação, Action e MCP
usam o mesmo registro de ferramentas, schemas, políticas e motor de workspace.
As capacidades efetivas são resolvidas no banco em cada operação.

## Testar a integração

### Pré-condição

Conclua uma das configurações e use uma conta de teste sem autoridade
administrativa global.

### Passos

1. Liste os workspaces.
2. Chame `prepararAutoriaAraLearn` para uma intenção de criação.
3. Crie um workspace vazio e leia seu `outline`.
4. Em `consultarBibliotecaDeResources`, percorra `explore`, `search`,
   `inspect` e `contracts`.
5. Monte um card e execute `validate_card` e `audit_representation`.
6. Confirme que `preview_card` informa `rendered: false`; ele não é uma imagem.
7. Crie uma estrutura pequena e salve os cards validados de uma
   microssequência.
8. Renomeie ou mova uma entidade com a revisão atual.
9. Consulte `revisarMicroteoriasDoWorkspace`.
10. Abra Trilhas e confirme que a parte pronta pode ser estudada sem publicação.
11. Tente escrever com uma revisão antiga e confirme o conflito sem
    sobrescrita.

Para um smoke hospedado por token OAuth de conta descartável:

```powershell
./scripts/testAuthoringMcpHosted.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Origin https://chatgpt.com
```

### Resultado esperado

Leituras retornam apenas o âmbito autorizado; escritas exigem a revisão atual;
e a interface humana apresenta microteorias e contagens sem despejar todas as
práticas no chat.

## Gerar e conferir os pacotes

```powershell
npm run authoring:packages
npm run test:authoring-packages
```

Os arquivos gerados ficam em `docs/downloads/authoring/`. Não edite esses
artefatos como fonte: altere os documentos e schemas de origem e gere o pacote
novamente.

## Diagnóstico

| Sintoma | Causa provável | Recuperação |
| --- | --- | --- |
| A Action não autentica | Redirect, cliente, segredo ou método de troca divergente | Gere outra credencial no AraLearn, copie todos os valores e vincule o `g-...` salvo. |
| O servidor MCP não aparece | Modo de desenvolvedor ou servidor personalizado indisponível | Confira plano e política da organização; use a Action quando ela estiver disponível. |
| A ferramenta responde sem permissão | A conta conectada não possui a capacidade exigida | Entre com a conta correta ou peça acesso ao workspace; não altere o token manualmente. |
| O modelo inventa um contrato de resource | O fluxo pulou `inspect` ou `contracts` | Refaça a descoberta e use somente a definição devolvida pelo catálogo. |
| A escrita relata conflito | Outra sessão avançou a revisão | Releia o alvo, preserve a alteração externa e prepare uma nova operação. |
| O curso não aparece no catálogo | Criar em Trilhas não publica em Coleções | Estude em Trilhas ou siga o fluxo editorial com autorização explícita. |

As fontes externas usadas neste roteiro estão registradas em
[Fontes das integrações](../SOURCES.md). O comportamento das ferramentas está
descrito no [Guia das ferramentas MCP](MCP_GUIDE.md).
