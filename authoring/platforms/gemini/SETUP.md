# Configuração no Gemini

## Gem clássica

1. Crie uma Gem no aplicativo Gemini.
2. Cole `GEM_INSTRUCTIONS.md` nas instruções.
3. Adicione os arquivos de `core/`, `knowledge/` e `schemas/` ao conhecimento.
4. Use a Gem para produzir os artefatos em partes e montar o documento v3 final.
5. Se não houver ferramenta de escrita, importe o documento final como curso privado pelo AraLearn. A publicação no catálogo continua dependendo da API e de permissão editorial.

A documentação pública das Gems descreve instruções persistentes e arquivos de conhecimento, mas não oferece uma configuração equivalente às Actions por OpenAPI. Por isso, o modo clássico deste pacote não promete publicação direta.

## Ambiente com ferramentas

`SKILL.md` pode ser usado em ambientes compatíveis com Agent Skills, como o Gemini CLI, ou adaptado para um projeto que tenha função HTTP ou MCP. Configure a URL `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api` e uma credencial restrita da API de autoria no armazenamento seguro do ambiente. A chave usa o cabeçalho `X-AraLearn-API-Key`; não a grave no Skill.

Documentação oficial:

- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)
- [Set up your coding assistant with Gemini MCP and Skills](https://ai.google.dev/gemini-api/docs/coding-agents)
