# Conectar seu assistente ao AraLearn

Você conversa no aplicativo de IA que prefere e guarda os cursos no AraLearn. A conexão permite que o assistente consulte e altere seus cursos, conforme sua autorização. MCP é o padrão usado para essa comunicação; seu aplicativo precisa aceitar servidores MCP remotos com OAuth.

## Começar pelo AraLearn

1. Abra o AraLearn e entre em **Configurações → Conectar assistente**. O guia também está disponível antes do login.
2. Escolha **Copiar endereço**. Ele corresponde à instalação do AraLearn que você está usando; não é uma senha. Se o navegador bloquear a cópia, selecione e copie o campo manualmente.
3. Abra o aplicativo de IA e adicione uma conexão MCP com esse endereço. Se aparecer a escolha de autenticação, selecione **OAuth**.
4. Na tela do AraLearn, entre ou crie sua conta, confira as permissões e autorize. Você não precisa entregar sua senha ao assistente nem copiar chaves do banco.
5. Volte à conversa e selecione a conexão AraLearn.

O login no site e a autorização do assistente são etapas distintas. Abrir o ChatGPT pelo botão do AraLearn não instala nem autoriza a conexão. A instalação e o consentimento precisam ser concluídos no aplicativo escolhido.

## No ChatGPT

Abra as configurações de apps ou plugins e procure a opção de adicionar uma conexão MCP. Dependendo da interface e das permissões da conta, pode ser necessário habilitar **Developer Mode** em **Configurações → Segurança e login (Security and login)** e criar a conexão em **Plugins**. Use as [instruções oficiais atuais](https://developers.openai.com/api/docs/guides/developer-mode) para localizar essa opção e conferir disponibilidade no seu plano ou workspace.

Use o endereço copiado do AraLearn e conclua a autorização. Não preencha credenciais de Actions nesse fluxo MCP. Em uma conversa nova, selecione AraLearn entre os apps ou ferramentas disponíveis.

Se o formulário mostrar **Configurações avançadas de OAuth**, aguarde a descoberta automática com **Registro Dinâmico de Cliente (DCR)**. Mantenha `offline_access` entre os escopos padrão, deixe **Escopos básicos** vazio e desmarque **OIDC habilitado**. Essa é a configuração verificada para o MCP do AraLearn; não é necessário fornecer ID ou segredo de cliente.

Não há neste guia um link público de instalação do AraLearn no catálogo. O botão **Abrir ChatGPT** leva ao aplicativo; não informa que a conexão já foi realizada.

## Conferir sem criar conteúdo

Envie, com AraLearn selecionado:

> Consulte os componentes didáticos disponíveis no AraLearn, sem criar ou alterar cursos.

Confira se houve uma consulta à ferramenta e retorno de dados do AraLearn. Uma resposta apenas explicando o que é o serviço não comprova conexão. Esse teste verifica leitura; não comprova a produção completa de um curso.

Depois, siga [Criar cursos pelo chat](criar-cursos-pelo-chat.md).

## Outros aplicativos e conexões existentes

O mesmo endereço pode ser usado por clientes compatíveis com MCP remoto e a autenticação do AraLearn. O nome e a posição dos controles variam, e a disponibilidade de um modelo não garante suporte do aplicativo à integração. Cada cliente precisa ser verificado antes de ser apresentado como compatível.

Após uma atualização das ferramentas, use a atualização da conexão oferecida pelo cliente e abra uma conversa nova. Refazer login só é necessário quando a autorização expira, é revogada ou está associada à conta errada. Se uma leitura informar mudança de contexto, não force uma gravação nem trate reconectar como garantia de correção.

O canal existente de [Actions/OpenAPI](autoria-actions.md) permanece disponível. Seu cadastro OAuth é diferente da descoberta e autorização do MCP. Os detalhes do protocolo estão em [Autoria pelo MCP](autoria-mcp.md).
