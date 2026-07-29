# Configuração no Claude

Este roteiro é uma orientação técnica inicial. O fluxo por arquivos é distinto de uma conexão direta, e o gateway atual não atende clientes que exijam OAuth. A implantação do servidor e a emissão da chave estão no [roteiro do AraLearn](../../../docs/implantacao.md).

## Uso sem conexão direta

1. Crie um Project.
2. Use `PROJECT_INSTRUCTIONS.md` como instruções.
3. Adicione `core/`, `knowledge/`, `schemas/`, `docs/aralearn-contract.md` e `docs/recursos-de-card.md` ao conhecimento do projeto. Se a plataforma limitar a quantidade de anexos, reúna esses textos num único arquivo antes do envio, sem retirar os esquemas.
4. Peça a produção dos artefatos em partes e a montagem do documento AraLearn v4.
5. Valide o documento e importe-o como curso privado pela aba **Trilhas** do AraLearn.

Esse caminho funciona apenas por arquivos. Um Project conserva instruções e conhecimento, mas não passa a chamar a API do AraLearn por causa desses anexos.

## Conexão direta

Há três situações diferentes:

| Ambiente | Situação |
| --- | --- |
| Project no Claude | Produz arquivos; não chama a API por conta própria. |
| Conector remoto do Claude que exige OAuth | Ainda não é compatível com o gateway atual do AraLearn. |
| Cliente que aceita MCP remoto com cabeçalho estático protegido | Pode usar o gateway atual, desde que a chave permaneça no cofre de credenciais do cliente. |

O endereço MCP é:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O transporte é Streamable HTTP. A autenticação usa uma chave pessoal `arl_...` em `Authorization: Bearer` ou `X-AraLearn-API-Key`. Não cole essa chave nas instruções, nos arquivos de conhecimento nem em um Project compartilhado.

O conector remoto oferecido normalmente no Claude exige OAuth. O gateway atual ainda não oferece esse método, portanto não tente contornar a exigência com a chave no texto da conversa. Nesse ambiente, use o fluxo por arquivos até que o AraLearn tenha OAuth.

Uma integração REST própria pode chamar:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api
```

Ela deve enviar `X-AraLearn-API-Key` a partir de um cofre, validar as respostas e limitar as operações concedidas. Essa opção exige desenvolvimento e operação de um conector; não é uma configuração pronta do Project.

Em um ambiente compatível com Agent Skills, instale `SKILL.md` junto com os arquivos comuns. O Skill orienta o processo de autoria, mas a conexão continua dependendo de uma das formas descritas acima.

Documentação oficial:

- [What are Projects?](https://support.anthropic.com/en/articles/9517075-what-are-projects)
- [Getting Started with Custom Connectors Using Remote MCP](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
- [Model Context Protocol](https://docs.anthropic.com/en/docs/mcp)
