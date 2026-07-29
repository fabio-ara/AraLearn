# Integração genérica

Um cliente compatível precisa de:

- chamadas HTTPS com corpo JSON;
- autenticação segura;
- leitura da especificação OpenAPI ou configuração equivalente;
- armazenamento de `runId`, `partKey` e `requestId`;
- capacidade de anexar ou consultar as fontes usadas no planejamento.

O orçamento de aproximadamente 90 KiB pertence às Actions REST que o exigem.
O gateway MCP usa envelopes maiores e grava o conteúdo volumoso como artefatos
no Storage. Ainda assim, divida o curso por partes e o ledger por seções para
reduzir retransmissões e permitir retomada segura.

## Credencial

Crie uma credencial da API de autoria com o menor conjunto de escopos e guarde-a no cofre da plataforma. Nunca a inclua no prompt, nos arquivos de conhecimento ou em um repositório. Uma implantação futura poderá oferecer OAuth, mas o gateway distribuído nesta versão usa a chave individual `arl_...`.

Antes de importar o OpenAPI, copie o arquivo e substitua `default: seu-projeto` pelo Project Ref real. Confirme que o servidor resultante é `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api`. Para a chave de autoria, use o cabeçalho `X-AraLearn-API-Key`; não use a `service_role`.

Um cliente MCP usa `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp` por Streamable HTTP, não o endereço REST. A chave `arl_...` pode seguir em `Authorization: Bearer` ou `X-AraLearn-API-Key`. Esta versão do gateway não implementa OAuth; um cliente que o exija precisa aguardar essa integração.

## Controle do fluxo

O cliente deve seguir o estado devolvido pela API. Se o ambiente não mantiver estado entre conversas, conserve apenas `runId`, `partKey` e os `requestId` ainda sujeitos a repetição em armazenamento seguro e recupere o restante pela API.

Cada fase termina com uma entrega e aprovação explícita do autor. O cliente lê a execução, executa apenas a fase aprovada, relê o servidor, registra a entrega e para. A nova mensagem do autor libera a próxima fase e exige nova leitura persistida antes da mudança entre Planejador, Construtor e Auditor. Uma interrupção é retomada pelo mesmo `runId`, sem outro chat.

As únicas paradas intermediárias legítimas são decisão humana indispensável, autenticação ausente, limite real da ferramenta ou do modelo, rejeição determinística não corrigível e confirmação final de publicação. A publicação nunca começa sem essa confirmação.

Depois de gravar o plano, o cliente envia o registro em trechos e o finaliza. Para cada parte, grava a especificação detalhada antes de consultar o contexto de produção. Depois de gravar uma tentativa, chama `consultarEntregaDaParte` antes da auditoria. A auditoria examina o `fragment` devolvido, copia `fragmentHash` para `submissionSha256` e envia o `submissionReadReceipt` temporário da mesma resposta; não calcula o hash do arquivo enviado.

Na publicação, HTTP 202 confirma que a intenção já está aceita ou em execução.
Respeite `pollAfterSeconds` e repita a mesma operação com o mesmo `requestId`
até HTTP 200 e `status: published`.

Em timeout, resposta perdida ou falha temporária, o cliente repete o corpo original com o mesmo `requestId`. Uma correção usa outro identificador. Conflito ou conclusão incerta exige releitura da execução antes de qualquer novo comando.

## Adaptação de ferramentas

Os nomes internos das ferramentas podem variar. Preserve o significado das operações descritas no OpenAPI. Uma ponte MCP, um conector visual ou uma função local é aceitável desde que:

- não amplie permissões;
- não exponha tabelas;
- valide os mesmos corpos;
- preserve idempotência;
- devolva erros estruturados;
- mantenha a publicação atômica.
