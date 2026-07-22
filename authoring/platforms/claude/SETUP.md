# Configuração no Claude

## Project

1. Crie um Project.
2. Use `PROJECT_INSTRUCTIONS.md` como instruções.
3. Adicione `core/`, `knowledge/` e `schemas/` ao conhecimento do projeto.
4. Sem conector, use o fluxo por arquivos e importe o documento v3 final como curso privado pelo AraLearn.

## Skill e conector

Em um ambiente compatível com Agent Skills, instale `SKILL.md` junto com os arquivos comuns. Para escrita direta, conecte uma ferramenta confiável que exponha a API de autoria. Um Project não transforma o OpenAPI em ferramenta automaticamente. A escrita requer um conector remoto compatível com MCP, disponível no plano e no ambiente usados, ou outra integração mantida pelo operador.

Use OAuth ou uma credencial restrita armazenada no conector. Configure a URL `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api`; a chave de autoria usa o cabeçalho `X-AraLearn-API-Key`. Não coloque a chave no Project ou no Skill. Revise pedidos de escrita e habilite somente as ferramentas necessárias.

Documentação oficial:

- [What are Projects?](https://support.anthropic.com/en/articles/9517075-what-are-projects)
- [Getting Started with Custom Connectors Using Remote MCP](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
- [Model Context Protocol](https://docs.anthropic.com/en/docs/mcp)
