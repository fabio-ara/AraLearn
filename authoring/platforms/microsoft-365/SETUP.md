# Configurar autoria no Microsoft 365

Este roteiro descreve como o pacote do AraLearn se relaciona com agentes do
Microsoft 365 e com uma ferramenta MCP no Copilot Studio. Ele ainda não foi
validado em um locatário Microsoft 365 do projeto. Licença, política de dados e
nomes de tela precisam ser confirmados no ambiente de destino antes de uso
institucional.

Um manifesto declarativo descreve o agente; arquivos de conhecimento ajudam a
interpretar o domínio; e a ferramenta MCP fornece leitura e escrita no estado
real. Nenhuma dessas três peças substitui as outras.

## Pré-condições

- gateway MCP implantado em HTTPS;
- servidor OAuth 2.1, consentimento e hook de audience ativos;
- conta Microsoft autorizada a criar ou editar o agente;
- conta AraLearn com o papel necessário no workspace;
- política organizacional que permita conector MCP remoto.

Nunca use credencial administrativa do Supabase como segredo do agente. A
pessoa deve autorizar sua própria conta AraLearn pelo fluxo OAuth. Neste guia,
workspace é o espaço persistente que guarda a árvore e a revisão corrente do
curso.

## Criar e conectar o agente

### Passos

1. Gere o pacote de autoria com `npm run authoring:packages`.
2. Crie o agente no ambiente Microsoft adotado.
3. Use `AGENT_INSTRUCTIONS.md` como fonte das instruções principais, sem
   duplicar ou ampliar seu conteúdo no campo de configuração.
4. Adicione `core/`, `knowledge/`, `schemas/` e a documentação de resources ao
   conhecimento. A lista instalada e os contratos correntes continuam sendo
   descobertos pela ferramenta, não por uma cópia fixa desse catálogo.
5. Em **Tools**, escolha **Add a tool**, crie uma ferramenta **Model Context
   Protocol** e informe o endpoint remoto do AraLearn.
6. Configure OAuth conforme a descoberta oferecida pelo gateway e autorize uma
   conta de teste.
7. Salve o agente e abra uma sessão nova para os testes mínimos.

Endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

### Resultado esperado

O agente lista somente os workspaces acessíveis à conta e usa os schemas
anunciados pelo servidor. Uma escrita pequena devolve nova revisão e aparece
em Trilhas.

### Offline e recuperação

O conector remoto exige rede. Se uma chamada for interrompida, abra `resume` e
compare a revisão antes de repetir. O conteúdo anexado ao agente não funciona
como cópia offline do workspace.

## Validar o pacote do Agents Toolkit

O repositório gera fontes de manifesto e instrução; provisionamento depende da
versão do Microsoft 365 Agents Toolkit adotada.

### Pré-condição

Instale o CLI oficial e autentique-se no locatário de teste de acordo com a
política da organização.

### Passos

1. Gere novamente o pacote.
2. Execute a validação do CLI, por exemplo `atk validate`, no diretório exigido
   pela versão instalada.
3. Corrija avisos de schema antes de provisionar.
4. Só então execute o procedimento de provisionamento da plataforma.

### Resultado esperado

O manifesto é aceito pelo schema atual e não contém credenciais ou endpoint de
ambiente errado.

## Teste mínimo

1. Liste workspaces e confirme o isolamento entre duas contas.
2. Leia `outline` e um recorte `entity`.
3. Percorra `explore`, `search`, `inspect`, `contracts`, `validate_card` e
   `audit_representation` em `consultarBibliotecaDeResources`.
4. Faça uma mutação com `expectedRevision` atual.
5. Repita a mesma tentativa com o mesmo `requestId` e argumentos idênticos.
6. Use uma revisão antiga e confirme que a escrita é recusada.
7. Tente publicar sem capacidade editorial e confirme a negação.

## Diagnóstico

| Sintoma | Causa provável | Recuperação |
| --- | --- | --- |
| **Model Context Protocol** não aparece em Tools | Licença, região ou política não oferece a ferramenta | Confirme a documentação e a administração do locatário. |
| OAuth não conclui | Redirect, descoberta ou política organizacional bloqueada | Inspecione a configuração do conector e os logs do gateway sem expor tokens. |
| O manifesto não valida | Schema ou CLI diferente da versão usada no pacote | Consulte o schema atual, gere novamente e ajuste a fonte do pacote. |
| O agente conhece o contrato, mas não grava | Conhecimento foi anexado, mas a ferramenta não está conectada | Configure e autorize o MCP remoto. |
| Publicação é negada | Papel local não concede capacidade editorial global | Mantenha o curso em Trilhas ou solicite revisão pelo fluxo correto. |

As fontes e a limitação de validação estão registradas em
[Fontes das integrações](../SOURCES.md). Consulte também o roteiro de
[implantação](../../../docs/implantacao.md).
