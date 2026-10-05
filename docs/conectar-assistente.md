# Conectar seu assistente ao AraLearn

Você conversa no aplicativo de IA que prefere e guarda os cursos no AraLearn. A conexão permite que o assistente consulte e altere seus cursos, conforme sua autorização. MCP é o padrão usado para essa comunicação; seu aplicativo precisa aceitar servidores MCP remotos com OAuth.

## Começar pelo AraLearn

1. Abra o AraLearn e entre em **Configurações → Conectar assistente**. O endereço também está disponível antes do login.
2. Escolha **Copiar endereço**. Ele corresponde à instalação do AraLearn que você está usando. Se o navegador bloquear a cópia, selecione e copie o campo manualmente.
3. Abra o aplicativo de IA e adicione uma conexão MCP com esse endereço. Se aparecer a escolha de autenticação, selecione **OAuth**.
4. Na tela do AraLearn, entre ou crie sua conta, confira as permissões e autorize. A senha é usada apenas na entrada da conta; o assistente recebe a autorização da conexão.
5. Volte à conversa e selecione a conexão AraLearn.

O login no site e a autorização do assistente são etapas distintas. Conclua a instalação no aplicativo escolhido e o consentimento na página do AraLearn aberta por ele.

## No ChatGPT

Siga o [manual ilustrado de configuração do ChatGPT](chatgpt.md). Ele mostra o formulário MCP, as opções de autorização, a seleção na conversa e o teste de leitura. Também apresenta o caminho Actions/OpenAPI para quem usa um GPT que pode editar, com suas condições de disponibilidade.

Para MCP, o registro do cliente é feito automaticamente durante a conexão.
Você fornece o endereço e autoriza a conta pelo aplicativo escolhido. O manual
apresenta essa instalação por endereço nas configurações do ChatGPT.

## Conferir sem criar conteúdo

Envie, com AraLearn selecionado:

> Consulte os componentes didáticos disponíveis no AraLearn, sem criar ou alterar cursos.

Abra os detalhes da chamada e confira se a ferramenta devolveu dados do
AraLearn. Esse resultado confirma a leitura pela conexão. A produção de um
curso é verificada depois, no percurso de autoria.

Depois, siga [Criar cursos pelo chat](criar-cursos-pelo-chat.md).

## Outros aplicativos e conexões existentes

O mesmo endereço pode ser usado por clientes compatíveis com MCP remoto e a
autenticação do AraLearn. O nome e a posição dos controles variam. Confira no
aplicativo de conversa o suporte à integração e faça o
[teste de leitura](#conferir-sem-criar-conteúdo).

Após uma atualização das ferramentas, use a atualização da conexão oferecida pelo cliente e abra uma conversa nova. Refazer login só é necessário quando a autorização expira, é revogada ou está associada à conta errada. Se uma leitura informar mudança de contexto, siga seu diagnóstico e retome o
recorte atualizado antes da gravação.

O canal de [Actions/OpenAPI](autoria-actions.md) permanece disponível. Seu cadastro OAuth é diferente da descoberta e autorização do MCP; o [manual ilustrado](chatgpt.md#actions-em-um-gpt-personalizado) apresenta a configuração pela interface. Os detalhes do protocolo estão em [Autoria pelo MCP](autoria-mcp.md).
