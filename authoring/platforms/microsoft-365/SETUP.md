# Configuração no Microsoft 365

## Copilot Studio

1. Crie um agente e use `AGENT_INSTRUCTIONS.md` como instrução principal.
2. Adicione os documentos do núcleo como conhecimento, respeitando a política do ambiente.
3. Faça uma cópia de `docs/openapi/aralearn-authoring-api-copilot-v2.json`. Substitua `seu-projeto` no campo `host` pelo Project Ref real e confirme a base `/functions/v1/aralearn-authoring-api`.
4. Em Tools, adicione uma ferramenta REST ou um conector personalizado e importe essa cópia OpenAPI 2.0. Ela usa somente a chave restrita de autoria e não inclui a importação integral de JSON.
5. Configure autenticação com o cabeçalho `X-AraLearn-API-Key` e uma chave de autoria restrita, ou com OAuth quando a implantação oferecer esse fluxo. Não use a credencial administrativa do Supabase.
6. Selecione somente as operações de autoria necessárias.
7. Teste as transições e a negação de publicação sem permissão editorial.

Ferramentas REST, conectores, fluxos e MCP têm disponibilidade e consumo próprios no ecossistema Microsoft. Verifique licença, créditos e políticas do locatário antes da implantação. O pacote não presume gratuidade nem disponibilidade em todos os planos.

## Microsoft 365 Agents Toolkit

`declarative-agent/declarativeAgent.json` e `declarative-agent/instructions.txt` são fontes para um projeto criado pelo Agents Toolkit. Copie-os para o projeto gerado e acrescente a ferramenta de API pelo mecanismo recomendado para a versão instalada. Valide o pacote com o CLI antes de provisionar.

Documentação oficial:

- [Add tools to custom agents](https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent)
- [REST APIs and custom connectors in Copilot Studio](https://learn.microsoft.com/en-us/training/modules/take-action-external-systems-connector-rest-api-tools-copilot-studio/)
- [Declarative agent schema](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.6)
- [Microsoft 365 Agents Toolkit CLI](https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli)
