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

Envie somente uma delas. JWT de usuário, service role e senha do banco não são aceitos pelo gateway MCP. Uma chave pessoal acessa apenas execuções e biblioteca da própria conta. Uma chave editorial só realiza as operações descritas em seus escopos.

O banco armazena o resumo SHA-256 da chave, não seu valor original. Revogação, validade e limite por minuto são conferidos antes da interpretação da ferramenta. Os códigos de transporte são:

| Código | Significado |
| --- | --- |
| `401` | chave ausente, inválida, expirada ou revogada |
| `403` | origem ou escopo não autorizado |
| `429` | limite temporário da chave atingido |

Erros de conteúdo, estado ou contrato retornam um resultado de ferramenta com `isError: true`. Assim, o agente consegue corrigir os dados sem confundir uma rejeição determinística com falha de autenticação.

## Ferramentas

Toda chave `arl_...` recebe apenas as ferramentas permitidas por seus escopos. O fluxo de autoria reúne:

1. consultar a lista de recursos de card e o contrato formal de um recurso;
2. listar, criar e consultar execuções;
3. gravar e finalizar o plano;
4. gravar trechos do registro de fontes, afirmações e termos;
5. consultar a próxima parte e gravar sua especificação;
6. produzir, reler, revisar e reabrir partes;
7. bloquear, retomar ou cancelar uma execução;
8. validar e concluir um curso.

O contrato de um recurso informa sua finalidade, os campos aceitos, os alvos de lacuna e um exemplo válido. A autoria continua sendo JSON formal: o agente escolhe campos e identificadores, e o servidor compila e valida essa estrutura. O gateway não transforma prosa em HTML nem interpreta uma descrição em português para localizar controles.

O mesmo contrato liga cada operação aos recursos preferenciais e permitidos. A API confere se a representação usada preserva essa decisão, se a prática possui base anterior da mesma operação, se a retirada de apoio segue a ordem planejada e se todo conceito recuperado foi apresentado na cadeia causal. Essas regras são idênticas nas ferramentas MCP e nas rotas REST.

Uma chave pessoal com leitura privada pode:

- listar os cursos selecionados e a trilha atual;
- consultar módulos, lições, microssequências ou cards de um curso selecionado, um nível por vez;
- listar as trilhas da conta e a quantidade de cursos em **Sem trilha**.
- listar cursos pessoais íntegros elegíveis para oferta e acompanhar as próprias ofertas ao catálogo.

Com escrita privada, ela também pode criar, renomear e excluir trilhas, mover seleções entre elas, renomear um curso pertencente à conta e corrigir uma microssequência. Excluir uma trilha deixa seus cursos em **Sem trilha** e não remove curso, progresso nem comentário. Se a correção partir de uma publicação oficial selecionada, o servidor cria ou reutiliza uma cópia pessoal completa antes de aplicar a mudança. A publicação oficial permanece intacta.

Com a mesma escrita privada, pode oferecer um curso próprio ao catálogo mediante consentimento, licença, atribuição e procedência explícitos, ou retirar uma oferta ainda pendente. A ferramenta não publica diretamente: a oferta permanece na fila editorial.

Uma chave com `catalog:publish` também recebe ferramentas para:

- listar coleções, inclusive vazias, e paginar seus cursos;
- consultar os metadados de um curso oficial;
- percorrer sua estrutura formal por seções paginadas, inclusive os componentes pedagógicos;
- criar, renomear, aposentar e reordenar coleções;
- corrigir o título ou o objetivo de um curso;
- corrigir uma microssequência sem republicar partes alheias ao recorte;
- mover e reordenar cursos entre coleções.
- listar a fila editorial, iniciar a revisão e aceitar ou rejeitar ofertas.

Ao aceitar, o servidor promove a própria árvore privada para o catálogo na mesma transação: preserva UUID e `contractKey`, remove o vínculo de propriedade e vincula o curso à coleção escolhida. Não há cópia oficial adicional. Rejeições exigem justificativa.

Criar, renomear, aposentar ou reordenar coleções exige `owner`. A consulta e a organização dos cursos aceitam `owner` ou `catalog_publisher`. A API confere o papel no banco a cada chamada; a presença da ferramenta no cliente não substitui essa autorização.

Título e objetivo têm uma operação própria de metadados. Para corrigir conteúdo, o agente abre uma revisão restrita à microssequência, lê o fragmento formal, envia a nova forma completa desse fragmento e pede sua aplicação. O servidor confere o hash de base, compila as lacunas, remonta o curso em memória, executa os validadores e grava somente a microssequência, seus cards e seus filhos. Um campo fora do recorte, um fragmento incompleto ou uma mudança concorrente é recusado.

As ferramentas dessa sequência são `abrirCorrecaoPontual`, `consultarFragmentoDaCorrecaoPontual`, `gravarCorrecaoPontual`, `consultarCorrecaoPontual` e `aplicarCorrecaoPontual`. A revisão é uma transação de preparação, não uma versão histórica oferecida ao estudante. Depois da aplicação, o material transitório segue a mesma política de retenção da autoria. Todas as alterações usam `requestId`; as que podem perder atualização também usam a revisão ou o hash devolvido pela leitura anterior.

Todo curso oficial ativo pertence a uma coleção. `Outros` é a coleção reservada para cursos que ainda não receberam uma classificação específica. Desagrupar significa mover para `Outros`, não deixar o curso sem vínculo. Essa coleção não pode ser aposentada.

Administração de chaves e importação manual não são ferramentas MCP. A primeira exige uma sessão do AraLearn; a segunda permanece na interface e na API REST autorizada. Chaves pessoais não recebem as ferramentas administrativas do catálogo.

Toda ferramenta que altera estado exige `requestId`, com 8 a 128 caracteres seguros. Consultas não usam esse campo. Repita o identificador somente ao repetir os mesmos argumentos de uma mutação. A mesma regra vale na API REST, portanto uma resposta perdida pode ser recuperada por qualquer uma das duas portas sem duplicar a operação. A reutilização com outro conteúdo é rejeitada.

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
