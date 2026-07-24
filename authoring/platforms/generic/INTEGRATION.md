# Integração genérica

Um cliente compatível precisa de:

- chamadas HTTPS com corpo JSON;
- autenticação segura;
- leitura da especificação OpenAPI ou configuração equivalente;
- armazenamento de `runId`, `partKey` e `requestId`;
- capacidade de anexar ou consultar as fontes usadas no planejamento.

O cliente também precisa respeitar os limites: plano de 96 KiB para integrações por chave, trechos de registro com `items` de até 60 KiB, especificação de parte de até 48 KiB, fragmento com menos de 90 KiB e resposta da próxima parte de até 90 KiB.

## Credencial

Crie uma credencial da API de autoria com o menor conjunto de escopos. Guarde-a no cofre da plataforma ou use OAuth. Nunca a inclua no prompt, nos arquivos de conhecimento ou em um repositório.

Antes de importar o OpenAPI, copie o arquivo e substitua `default: seu-projeto` pelo Project Ref real. Confirme que o servidor resultante é `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api`. Para a chave de autoria, use o cabeçalho `X-AraLearn-API-Key`; não use a `service_role`.

## Controle do fluxo

O cliente deve seguir o estado devolvido pela API. Se o ambiente não mantiver estado entre conversas, conserve apenas `runId`, `partKey` e os `requestId` ainda sujeitos a repetição em armazenamento seguro e recupere o restante pela API.

O cliente continua no mesmo pedido: lê a execução, executa `nextAction`, relê o servidor e repete. `nextAction` não é uma mensagem de encerramento. A mudança entre Planejador, Construtor e Auditor exige uma nova leitura persistida, mas não outro pedido nem outra conversa. Uma interrupção é retomada pelo mesmo `runId`.

As únicas paradas intermediárias legítimas são decisão humana indispensável, autenticação ausente, limite real da ferramenta ou do modelo, rejeição determinística não corrigível e confirmação final de publicação. A publicação nunca começa sem essa confirmação.

Depois de gravar o plano, o cliente envia o registro em trechos e o finaliza. Para cada parte, grava a especificação detalhada antes de consultar o contexto de produção. Depois de gravar uma tentativa, chama `consultarEntregaDaParte` antes da auditoria. A auditoria examina o `fragment` devolvido, copia `fragmentHash` para `submissionSha256` e envia o `submissionReadReceipt` temporário da mesma resposta; não calcula o hash do arquivo enviado.

Na publicação, HTTP 202 com `status: publishing` confirma o avanço persistido. Respeite `pollAfterSeconds` e repita a mesma operação com o mesmo `requestId` até HTTP 200 e `status: published`. Cada chamada termina em até 45 segundos.

Em timeout, resposta perdida ou falha temporária, o cliente repete o corpo original com o mesmo `requestId`. Uma correção usa outro identificador. Conflito ou conclusão incerta exige releitura da execução antes de qualquer novo comando.

## Adaptação de ferramentas

Os nomes internos das ferramentas podem variar. Preserve o significado das operações descritas no OpenAPI. Uma ponte MCP, um conector visual ou uma função local é aceitável desde que:

- não amplie permissões;
- não exponha tabelas;
- valide os mesmos corpos;
- preserve idempotência;
- devolva erros estruturados;
- mantenha a publicação atômica.
