# Configuração no Gemini

Este roteiro é uma orientação técnica inicial. O fluxo por arquivos não depende de conexão direta; ferramentas HTTP e MCP variam conforme o ambiente e ainda precisam ser validadas na instalação escolhida. A implantação do servidor e a emissão da chave estão no [roteiro do AraLearn](../../../docs/implantacao.md).

## Gem no aplicativo Gemini

1. Crie uma Gem no aplicativo Gemini.
2. Cole `GEM_INSTRUCTIONS.md` nas instruções.
3. Adicione `core/`, `knowledge/`, `schemas/`, `docs/aralearn-contract.md` e `docs/recursos-de-card.md` ao conhecimento. Se a plataforma limitar a quantidade de anexos, reúna esses textos num único arquivo antes do envio, sem retirar os esquemas.
4. Use a Gem para produzir os artefatos em partes e montar o documento v3 final.
5. Se não houver ferramenta de escrita, importe o documento final como curso privado pelo AraLearn. A publicação no catálogo continua dependendo da API e de permissão editorial.

Uma Gem conserva instruções e arquivos, mas essa configuração não lhe dá acesso à API do AraLearn. Nesse modo, o resultado é um arquivo para importação. Não coloque uma chave `arl_...` nas instruções ou nos anexos.

## Ambiente com ferramentas

Ambientes de desenvolvimento que aceitam ferramentas HTTP ou MCP podem escrever diretamente no AraLearn. Essa configuração é diferente da Gem do aplicativo e exige conhecimento para proteger a credencial e revisar as operações habilitadas.

- REST: `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api`, com a chave `arl_...` em `X-AraLearn-API-Key`.
- MCP sobre Streamable HTTP: `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp`, com a chave em `Authorization: Bearer` ou `X-AraLearn-API-Key`.

Guarde a chave no armazenamento seguro do ambiente. Não a grave no `SKILL.md`, nas instruções, em arquivos de configuração versionados ou na conversa. O gateway MCP ainda não oferece OAuth; um cliente que exija esse método não é compatível com esta versão.

`SKILL.md` pode orientar ambientes compatíveis com Agent Skills, como o Gemini CLI. Ele não instala o conector nem concede acesso por si só. Se o ambiente escolhido não oferecer um cofre de credenciais e controle das ferramentas, use a Gem por arquivos e faça a importação privada no aplicativo.

Documentação oficial:

- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)
- [Set up your coding assistant with Gemini MCP and Skills](https://ai.google.dev/gemini-api/docs/coding-agents)
