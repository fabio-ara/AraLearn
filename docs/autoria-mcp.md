# Gateway MCP de autoria

O AraLearn oferece um gateway MCP remoto para agentes capazes de usar esse protocolo. Ele conduz o mesmo ciclo da API REST: planeja o curso, grava o registro de fontes e conceitos, produz uma parte por vez, revisa, corrige, valida e conclui. As duas portas usam os mesmos validadores, escopos, regras de idempotência e funções transacionais do banco.

A API REST continua disponível para Actions, conectores REST e importações feitas pelo aplicativo. O gateway MCP não a substitui e não faz chamadas HTTP internas para ela.

## Endereço e transporte

Depois da implantação, o endereço remoto é:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O gateway implementa MCP `2025-11-25` sobre Streamable HTTP sem sessão persistida pelo transporte. Cada mensagem usa `POST` com JSON. O servidor responde diretamente com `application/json`, não emite `MCP-Session-Id` e aceita somente as capacidades de ferramentas. Recursos e modelos de mensagem do MCP não são anunciados.

Chamadas posteriores a `initialize` devem enviar:

```http
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Protocol-Version: 2025-11-25
```

Navegadores acrescentam `Origin: https://origem-permitida.example`; quando presente, o valor precisa coincidir integralmente com uma origem configurada. Origem curinga, prefixos e subdomínios parecidos são recusados. Clientes servidor-servidor podem omitir esse cabeçalho, como prevê o transporte MCP, mas continuam obrigados a apresentar uma chave válida. Uma requisição sem `Origin` não recebe permissões adicionais e não contorna autenticação, escopos ou limites.

## Autenticação

O cliente usa uma chave `arl_...` pessoal ou editorial. Ela pode ser enviada de uma destas formas:

```http
Authorization: Bearer arl_...
```

```http
X-AraLearn-API-Key: arl_...
```

Envie somente uma delas. JWT de usuário, service role e senha do banco não são aceitos pelo gateway MCP. Uma chave pessoal acessa apenas execuções privadas da própria conta. Uma chave editorial só realiza as operações descritas em seus escopos.

O banco armazena o resumo SHA-256 da chave, não seu valor original. Revogação, validade e limite por minuto são conferidos antes da interpretação da ferramenta. Os códigos de transporte são:

| Código | Significado |
| --- | --- |
| `401` | chave ausente, inválida, expirada ou revogada |
| `403` | origem ou escopo não autorizado |
| `429` | limite temporário da chave atingido |

Erros de conteúdo, estado ou contrato retornam um resultado de ferramenta com `isError: true`. Assim, o agente consegue corrigir os dados sem confundir uma rejeição determinística com falha de autenticação.

## Ferramentas

O gateway apresenta somente o fluxo que uma chave `arl_...` pode executar:

1. listar, criar e consultar execuções;
2. gravar e finalizar o plano;
3. gravar trechos do registro de fontes, afirmações e termos;
4. consultar a próxima parte e gravar sua especificação;
5. produzir, reler, revisar e reabrir partes;
6. bloquear, retomar ou cancelar uma execução;
7. validar e concluir um curso.

Administração de chaves e importação manual não são ferramentas MCP. A primeira exige uma sessão do AraLearn; a segunda permanece na interface e na API REST autorizada.

Toda chamada de ferramenta exige `requestId`, com 8 a 128 caracteres seguros. Repita o valor somente ao repetir os mesmos argumentos. A mesma regra vale na API REST, portanto uma resposta perdida pode ser recuperada por qualquer uma das duas portas sem duplicar a operação. A reutilização com outro conteúdo é rejeitada.

## Implantação

Aplique as migrations antes das funções. O roteiro automatizado implanta as duas portas de autoria e cadastra as origens informadas:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl "https://<project-ref>.supabase.co" `
  -Mode Apply `
  -DeployAuthoringApi `
  -InitializeAuthoringSecrets `
  -AllowedOrigin "https://sua-aplicacao.example"
```

O script solicita confirmação antes de alterar o banco hospedado, cria os dois segredos próprios da autoria e não grava credenciais no repositório. Use `-InitializeAuthoringSecrets` somente na primeira implantação ou numa rotação deliberada; em atualizações comuns, omita essa opção. O roteiro completo e a alternativa para uma função já implantada estão em [Implantação](implantacao.md#8-api-de-autoria-e-gateway-mcp).

`--no-verify-jwt` permite que a própria função receba a chave `arl_...`. Isso não torna a função anônima: ela valida origem, formato, hash, revogação, validade, escopos e limite antes de executar uma ferramenta.

## Testes

Os testes de protocolo e paridade não precisam de Docker:

```powershell
node --test .\tests\v3\authoring-mcp.test.js
```

O smoke local cria duas contas e duas chaves temporárias, confirma o isolamento, cancela a execução de teste, revoga as chaves e tenta remover as contas ao final. A etapa seguinte descarta o stack local sem backup, portanto nenhum resíduo do ensaio é conservado. O script se recusa a executar contra um host que não seja `localhost` ou `127.0.0.1`:

```powershell
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
npx.cmd --yes supabase@2.109.1 functions serve aralearn-authoring-mcp --no-verify-jwt
npm.cmd run test:authoring:mcp:local
```

O smoke hospedado apenas negocia o protocolo, envia `ping` e lista ferramentas. Ele não cria nem altera dados e recusa a presença de service role:

```powershell
pwsh -NoProfile -File .\scripts\testAuthoringMcpHosted.ps1 `
  -ProjectUrl "https://<project-ref>.supabase.co" `
  -Origin "https://origem-permitida.example"
```

A chave `arl_...` é solicitada de forma oculta e removida das variáveis do processo ao término.

## Compatibilidade futura

Esta versão usa chaves restritas. OAuth para clientes MCP que o exijam será acrescentado em outra etapa, com autorização por usuário e descoberta protegida. Até lá, não configure uma service role como substituta e não anuncie o gateway como compatível com um cliente que aceite somente OAuth.

O protocolo seguido está documentado nas páginas oficiais do MCP: [transporte Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [ciclo de vida](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [ferramentas](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) e [autorização](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
