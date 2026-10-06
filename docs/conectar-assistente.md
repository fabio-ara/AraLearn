# Conectar seu assistente ao AraLearn

Você pode conversar em um aplicativo de inteligência artificial (IA) compatível e guardar os cursos no AraLearn. A conexão permite que o assistente consulte e altere seus cursos dentro da autorização concedida.

O **Model Context Protocol (MCP)** é o padrão pelo qual o aplicativo de conversa descobre e utiliza as ferramentas oferecidas pelo AraLearn. Para essa conexão, ele precisa aceitar servidores MCP remotos com **OAuth**, um mecanismo de autorização pelo qual você concede acesso à sua conta sem entregar a senha ao assistente.

## Começar pelo AraLearn

1. Abra o AraLearn e entre em **Configurações → Conectar assistente**. O endereço também está disponível antes do login.
2. Escolha **Copiar endereço**. Ele corresponde à instalação do AraLearn que você está usando. Se o navegador bloquear a cópia, selecione e copie o campo manualmente.
3. Abra o aplicativo de IA e adicione uma conexão MCP com esse endereço. Se aparecer a escolha de autenticação, selecione **OAuth**.
4. Na tela do AraLearn, entre ou crie sua conta, confira as permissões e autorize. A senha é usada na entrada da conta; o assistente recebe a autorização da conexão.
5. Volte à conversa e selecione a conexão AraLearn.

Entrar no site identifica sua conta no AraLearn. Autorizar o assistente concede acesso à aplicação conectada. Conclua a instalação no aplicativo escolhido e o consentimento na página do AraLearn aberta por ele.

## No ChatGPT

Siga o [manual ilustrado de configuração do ChatGPT](chatgpt.md). Ele apresenta o formulário MCP, as opções de autorização, a seleção na conversa e o teste de leitura. Também descreve o caminho **Actions/OpenAPI** para quem utiliza um GPT que pode editar. Nesse canal, a OpenAPI descreve as operações oferecidas pelo AraLearn, e Actions permite ao GPT utilizá-las. O manual informa as condições de disponibilidade.

Na conexão MCP, o registro do aplicativo cliente é feito automaticamente. Você fornece o endereço e autoriza o acesso à conta pelo aplicativo escolhido. O manual apresenta essa instalação por endereço nas configurações do ChatGPT.

## Conferir sem criar conteúdo

Envie, com AraLearn selecionado:

> Consulte os componentes didáticos disponíveis no AraLearn, sem criar ou alterar cursos.

Abra os detalhes da chamada e confira se a ferramenta devolveu dados do AraLearn. Esse resultado confirma a leitura pela conexão. A produção de um curso é verificada depois, no percurso de autoria.

Depois, siga [Criar cursos pelo chat](criar-cursos-pelo-chat.md).

## Outros aplicativos e conexões existentes

O mesmo endereço pode ser usado por clientes compatíveis com MCP remoto e a autenticação do AraLearn. O nome e a posição dos controles variam. Confira no aplicativo de conversa o suporte à integração e faça o [teste de leitura](#conferir-sem-criar-conteúdo).

Após uma atualização das ferramentas, use a atualização da conexão oferecida pelo cliente e abra uma conversa nova. Refazer login é necessário quando a autorização expira, é revogada ou está associada à conta errada. Se uma leitura informar mudança de contexto, siga seu diagnóstico e retome o recorte atualizado antes da gravação.

O canal de [Actions/OpenAPI](autoria-actions.md) também está disponível. Seu cadastro OAuth segue um procedimento próprio, distinto da descoberta e autorização do MCP. O [manual ilustrado](chatgpt.md#actions-em-um-gpt-personalizado) apresenta a configuração pela interface. Os detalhes do protocolo estão em [Autoria pelo MCP](autoria-mcp.md).
