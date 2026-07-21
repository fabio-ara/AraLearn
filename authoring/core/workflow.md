# Fluxo de autoria

Uma execução transforma fontes e objetivos em um curso publicável sem tentar produzir o documento inteiro de uma vez. O mesmo assistente pode planejar, construir e auditar, desde que exerça uma função por vez e releia o que o servidor persistiu antes de aprovar.

## 1. Delimitação

Antes de criar a execução, confirme público, conhecimentos prévios, resultados esperados, conteúdos incluídos e excluídos, profundidade, idioma, convenções e fontes permitidas. Uma lacuna que altere essas decisões deve bloquear o trabalho até o autor responder.

Ao criar a execução, declare também a intenção de publicação:

- `create` para um curso novo;
- `update` para substituir um curso existente, acompanhado de `existingCourseId` e do `expectedContentHash` observado antes da autoria.

Essa comparação impede que uma atualização apague silenciosamente uma publicação feita por outra execução.

## 2. Plano compacto

O plano contém:

- o esqueleto `project` do contrato v3, com módulos e lições, mas sem microssequências;
- público, escopo e resultados de aprendizagem;
- mapa conceitual e critérios de aceitação;
- `ledgerManifest`, que declara quantos trechos e itens haverá em `sources`, `claims` e `terms`;
- contornos ordenados das partes.

Cada contorno reserva apenas limites, dependências, propriedade estrutural, identificadores dos cards e resultados atendidos. A orientação detalhada dos cards não pertence ao plano. Isso mantém a primeira chamada dentro do limite das integrações e evita repetir todo o curso a cada etapa.

Grave o plano, conserve o `planHash` devolvido e envie o registro nas rotas:

```text
PUT /v1/runs/{runId}/ledger/sources/{position}
PUT /v1/runs/{runId}/ledger/claims/{position}
PUT /v1/runs/{runId}/ledger/terms/{position}
```

Cada trecho leva `requestId`, `planHash` e `items`. A posição começa em zero. O corpo inteiro da requisição pode ocupar até 64 KiB e `items`, até 60 KiB. O número de trechos e de itens deve coincidir com o manifesto.

Depois do último trecho, chame `POST /v1/runs/{runId}/plan/finalize` com o mesmo `planHash`. A construção não começa enquanto o plano e o registro não estiverem completos.

## 3. Especificação da próxima parte

Consulte a próxima parte. A API libera sempre a primeira pendência causal. Antes de produzir seu conteúdo, grave em
`PUT /v1/runs/{runId}/parts/{partKey}/specification` uma especificação de até 48 KiB.

A especificação detalha somente essa parte: estrutura, microssequências, plano dos cards, fontes, termos e caminhos que devem ser preservados. Seus identificadores, limites, dependências, propriedade e resultados precisam coincidir exatamente com o contorno reservado no plano.

Consulte a próxima parte novamente. A resposta `aralearn.part-spec` combina a especificação com tentativa, modo, continuidade, auditoria anterior e o recorte necessário do registro. Para clientes por chave, essa resposta não pode ultrapassar 90 KiB. Se ultrapassar, cancele a execução e crie um plano com partes menores.

## 4. Construção

Produza exatamente os cards previstos e envie um `aralearn.part-submission`. O fragmento deve:

- preservar identificadores, posições e limites;
- usar somente fontes e afirmações autorizadas;
- apresentar cada termo antes de exigi-lo;
- manter as dependências;
- incluir as cinco listas de `stateDelta`;
- ocupar menos de 90 KiB.

Depois do envio, não avance imediatamente. Leia a entrega persistida em `GET /v1/runs/{runId}/parts/{partKey}/submission`. A resposta inclui `submissionReadReceipt`, um comprovante assinado e temporário ligado à execução, à parte, à tentativa, ao hash e à identidade que fez a leitura.

## 5. Auditoria

A auditoria examina o fragmento devolvido pelo servidor, copia seu `fragmentHash` para `submissionSha256` e devolve o `submissionReadReceipt` sem alterá-lo. Um comprovante expirado exige nova leitura. Ela preenche os dez indicadores definidos em `core/quality.md`: alinhamento ao plano, contrato, cobertura, fontes, continuidade, coerência da interação, linguagem, preservação de campos, elementos estruturados e feedback.

- `approve`: os dez critérios foram atendidos e não há achados;
- `repair`: problemas localizados podem ser corrigidos sem mudar a especificação;
- `rebuild`: o fragmento precisa ser refeito sob a mesma especificação;
- `blocked`: falta uma decisão externa ou a base aprovada teria de mudar.

Um reparo indica caminhos JSON, estado observado, mudança exigida, campos preservados e teste de aceitação. Uma reconstrução conserva propriedade, limites, fontes, dependências, identificadores e posições.

## 6. Bloqueio, retomada e cancelamento

Use `block` quando uma decisão indispensável não puder ser tomada com segurança. Depois da resposta do autor, envie uma resolução não vazia em `resume` e consulte a execução antes de prosseguir.

Use `cancel` quando o plano precisar ser substituído, uma parte exceder os limites ou o autor desistir. Cancelamento é definitivo para aquela execução; um novo planejamento começa em outra execução.

## 7. Validação, reabertura e publicação

Quando todas as partes estiverem aprovadas, peça a validação integral. Se ela localizar um defeito em parte já aprovada, reabra essa parte pela rota `reopen`, com decisão `repair` ou `rebuild`, tentativa e hash da submissão examinada. Corrija, releia e audite novamente.

A publicação só ocorre quando todas as partes voltam a estar aprovadas e a validação confirma o contrato v3, a integridade relacional e as referências. A materialização pode exigir várias chamadas, mas o catálogo só muda na confirmação final; uma falha conserva o rascunho e não expõe curso parcial.

Cada chamada de `POST /v1/runs/{runId}/publish` termina em até 45 segundos. Se a API devolver HTTP 202 e `status: publishing`, aguarde o intervalo de `pollAfterSeconds`, conserve o mesmo `requestId` e repita essa operação. O cursor persistido retoma do ponto confirmado. Prossiga até receber HTTP 200 e `status: published`; não espere uma única requisição por mais de 45 segundos.

## Repetições seguras

Cada intenção recebe um `requestId`. Em timeout, limite de requisições ou falha temporária, repita o mesmo corpo com o mesmo identificador. Para conteúdo corrigido, use outro `requestId`. Em conflito, releia a execução antes de decidir. Nunca repita indefinidamente uma rejeição determinística.
