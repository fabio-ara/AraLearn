# Configuração no Claude

Este roteiro é uma orientação técnica inicial. O fluxo por arquivos é distinto de uma conexão direta. A implantação do servidor está no [roteiro do AraLearn](https://github.com/fabio-ara/AraLearn/blob/main/docs/implantacao.md).

## Uso sem conexão direta

1. Crie um Project.
2. Use `PROJECT_INSTRUCTIONS.md` como instruções.
3. Adicione `core/`, `knowledge/`, `schemas/`, `docs/aralearn-contract.md` e `docs/recursos-de-card.md` ao conhecimento do projeto. Se a plataforma limitar a quantidade de anexos, reúna esses textos num único arquivo antes do envio, sem retirar os esquemas.
4. Peça a criação ou revisão em um workspace v4 e acompanhe suas revisões.
5. Valide o documento e importe-o como curso privado pela aba **Trilhas** do AraLearn.

Esse caminho funciona apenas por arquivos. Um Project conserva instruções e conhecimento, mas não passa a chamar o gateway MCP do AraLearn por causa desses anexos.

## Conexão direta

Há três situações diferentes:

| Ambiente | Situação |
| --- | --- |
| Project no Claude | Produz arquivos; não chama o gateway MCP por conta própria. |
| Conector remoto do Claude que aceita OAuth 2.1 | Pode conectar ao gateway e autenticar a conta do autor. |
| Cliente sem OAuth 2.1 para MCP remoto | Use o fluxo por arquivos. |

O endereço MCP é:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O transporte é Streamable HTTP e a autenticação é OAuth 2.1 com descoberta de
protected resource e PKCE. O gateway resolve no banco a autoridade efetiva da
conta autenticada.

Em um ambiente compatível com Agent Skills, instale `SKILL.md` junto com os arquivos comuns. O Skill orienta o processo de autoria, mas a conexão continua dependendo de uma das formas descritas acima.

Documentação oficial:

- [What are Projects?](https://support.anthropic.com/en/articles/9517075-what-are-projects)
- [Getting Started with Custom Connectors Using Remote MCP](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
- [Model Context Protocol](https://docs.anthropic.com/en/docs/mcp)
