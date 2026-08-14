# Fontes oficiais das integrações

Esta página registra a documentação externa usada para descrever as
integrações de autoria. Sua função é separar fatos do AraLearn de nomes de tela,
limites de conta e procedimentos definidos por cada plataforma.

Interfaces comerciais mudam com frequência. Antes de atualizar um guia:

1. consulte a fonte oficial correspondente;
2. verifique se o endereço ainda resolve para a página citada;
3. distinga um recurso da plataforma de um recurso do AraLearn;
4. registre limitações ainda não verificadas em ambiente real;
5. atualize o guia e esta lista na mesma alteração.

Última conferência: 14 de agosto de 2026.

## Protocolo comum

- [Introdução ao Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro): conceitos de cliente, servidor, ferramentas, resources e transporte.

O protocolo define a interoperabilidade. Autenticação, autorização e regras de
autoria continuam pertencendo ao AraLearn e ao serviço que hospeda o gateway.

## ChatGPT e produtos OpenAI

- [Model Context Protocol](https://developers.openai.com/api/docs/mcp): uso de servidores MCP remotos por produtos OpenAI.
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server): desenho de ferramentas, schemas de saída e anotações de servidor.
- [Creating a GPT](https://help.openai.com/en/articles/8554397-creating-a-gpt): criação e configuração de GPTs personalizados.
- [Configuring actions in GPTs](https://help.openai.com/en/articles/9442513-configuring-actions-in-gpts): schema OpenAPI, autenticação e teste de Actions.

O AraLearn oferece duas integrações distintas: servidor MCP remoto e Action
OpenAPI. Elas usam o mesmo registro interno de ferramentas, mas a configuração
na plataforma e o fluxo OAuth não são iguais.

## Claude

- [What are Projects?](https://support.claude.com/en/articles/9517075-what-are-projects): instruções e arquivos de conhecimento em Projects.
- [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): criação e conexão de um conector remoto.
- [Introdução ao Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro): comportamento comum de clientes e servidores MCP.

Um Project com arquivos não se torna um cliente MCP automaticamente. O conector
remoto é uma configuração separada e sua disponibilidade depende da conta e da
política da organização.

## Gemini

- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603): instruções e arquivos de conhecimento em Gems.
- [Set up your coding assistant with Gemini MCP and Skills](https://ai.google.dev/gemini-api/docs/coding-agents): MCP e Skills em ambientes de desenvolvimento compatíveis.

Uma Gem organiza instruções e conhecimento, mas não estabelece por si só uma
conexão MCP remota. O cliente escolhido precisa oferecer transporte e OAuth
compatíveis.

## Microsoft 365

- [Add tools to custom agents](https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent): adição de ferramentas e servidores MCP no Copilot Studio.
- [Declarative agent manifest schema](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.6): contrato atual do manifesto declarativo.
- [Microsoft 365 Agents Toolkit CLI](https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli): validação e provisionamento de pacotes.

O roteiro do AraLearn ainda não foi validado em um locatário Microsoft 365 do
projeto. Nomes de tela, licenças e políticas organizacionais devem ser
confirmados no ambiente de destino.
