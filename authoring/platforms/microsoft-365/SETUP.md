# Configuração no Microsoft 365

Este roteiro ainda precisa ser validado em um locatário Microsoft 365 do
AraLearn. Licenças, políticas e nomes de telas podem variar.

1. Implante o gateway MCP conforme `docs/implantacao.md`.
2. Habilite o servidor OAuth 2.1, o hook de audience e o consentimento.
3. Crie o agente e use `AGENT_INSTRUCTIONS.md` como instrução principal.
4. Adicione `core/`, `knowledge/`, `schemas/`, o contrato v4 e a documentação
   de recursos como conhecimento.
5. Em **Tools**, conecte o endpoint MCP remoto do AraLearn por OAuth. Nunca use
   a credencial administrativa do Supabase.
6. Teste leitura, mutação com `expectedRevision`, replay do mesmo `requestId`,
   isolamento entre contas e negação da publicação editorial sem a permissão
   efetiva no banco.

O pacote do Agents Toolkit contém fontes de instrução e manifesto; valide-o
com a versão do CLI adotada antes de provisionar.

Documentação:

- [Add tools to custom agents](https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent)
- [Declarative agent schema](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.6)
- [Microsoft 365 Agents Toolkit CLI](https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli)
