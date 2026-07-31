# Configuração no Gemini

Este roteiro é uma orientação técnica inicial. O fluxo por arquivos não depende de conexão direta; o suporte a MCP remoto varia conforme o ambiente e ainda precisa ser validado na instalação escolhida. A implantação do servidor está no [roteiro do AraLearn](https://github.com/fabio-ara/AraLearn/blob/main/docs/implantacao.md).

## Gem no aplicativo Gemini

1. Crie uma Gem no aplicativo Gemini.
2. Cole `GEM_INSTRUCTIONS.md` nas instruções.
3. Adicione `core/`, `knowledge/`, `schemas/`, `docs/aralearn-contract.md` e `docs/recursos-de-card.md` ao conhecimento. Se a plataforma limitar a quantidade de anexos, reúna esses textos num único arquivo antes do envio, sem retirar os esquemas.
4. Use a Gem para criar ou revisar o estado composto corrente de um workspace
   v4.
5. Se não houver ferramenta de escrita, importe o documento final como curso privado pelo AraLearn. A publicação no catálogo continua dependendo do gateway MCP e de permissão editorial.

Uma Gem conserva instruções e arquivos, mas essa configuração não lhe dá acesso ao gateway do AraLearn. Nesse modo, o resultado é um arquivo para importação. Não coloque credenciais nas instruções ou nos anexos.

## Ambiente com ferramentas

Ambientes de desenvolvimento que aceitam MCP remoto podem escrever diretamente
no AraLearn pelo endpoint Streamable HTTP:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O cliente deve descobrir os metadados protegidos, executar OAuth 2.1 com PKCE
e conservar o access token no próprio cofre. A autoridade efetiva não vem no
token: o gateway a resolve no banco para a conta autenticada.

`SKILL.md` pode orientar ambientes compatíveis com Agent Skills, como o Gemini CLI. Ele não instala o conector nem concede acesso por si só. Se o ambiente escolhido não oferecer OAuth para MCP remoto e controle das ferramentas, use a Gem por arquivos e faça a importação privada no aplicativo.

Documentação oficial:

- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)
- [Set up your coding assistant with Gemini MCP and Skills](https://ai.google.dev/gemini-api/docs/coding-agents)
