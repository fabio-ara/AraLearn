# Fluxo de autoria

Uma execução transforma fontes e objetivos em um curso publicável sem tentar produzir o documento inteiro de uma vez. O mesmo assistente pode planejar, construir e auditar, desde que exerça uma função por vez e releia o que o servidor persistiu antes de aprovar.

## Laço orientado pelo estado persistido

Depois de obter o `runId`, continue no mesmo pedido enquanto houver uma ação segura e determinada pelo servidor. Uma mudança de etapa não exige outra mensagem do autor nem uma nova conversa.

1. Consulte a execução e leia estado, `nextAction`, parte ativa, tentativa e hashes.
2. Execute a ação indicada. Não pare apenas para anunciar `nextAction`.
3. Releia a execução depois de cada alteração persistida e antes de mudar de função.
4. Assuma somente uma função por operação: o Planejador especifica, o Construtor produz e o Auditor examina a entrega relida do servidor.
5. Repita o ciclo até concluir a execução ou encontrar uma condição legítima de parada.

A separação entre Planejador, Construtor e Auditor protege a revisão, mas não divide o trabalho em vários pedidos. Ao passar de uma função para outra, descarte suposições transitórias e use a nova leitura persistida. O Auditor nunca aprova a cópia que o Construtor ainda conserva no contexto; ele examina a entrega devolvida pela API.

Pare somente quando:

- faltar uma decisão humana indispensável;
- a autenticação estiver ausente ou inválida;
- a ferramenta, o serviço ou o modelo atingir um limite real que impeça a continuação;
- uma rejeição determinística não puder ser corrigida sem mudar uma base já aprovada ou obter dados ausentes;
- a execução validada aguardar a confirmação final de publicação.

Estados terminais também encerram o ciclo. Não peça autorização entre etapas comuns. Nunca publique apenas porque o pedido inicial mencionou publicação: apresente o resultado validado e obtenha a confirmação final antes da primeira chamada de publicação.

Para retomar, consulte o `runId` informado e prossiga pela ação persistida. Isso funciona na mesma conversa ou em outra; abrir um novo chat não é requisito. A memória da conversa ajuda a redação, mas não substitui o estado da API.

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
- mapa conceitual, relações formais, operações ensinadas, recursos preferenciais e permitidos por operação, equívocos previsíveis e critérios de aceitação;
- `ledgerManifest`, que declara quantos trechos e itens haverá em `sources`, `claims` e `terms`;
- contornos ordenados das partes.

Cada contorno reserva apenas limites, dependências, propriedade estrutural, identificadores dos cards e resultados atendidos. A orientação detalhada dos cards não pertence ao plano. Isso mantém a primeira chamada dentro do limite das integrações e evita repetir todo o curso a cada etapa.

Antes de gravar, faça a revisão de cobertura de `core/quality.md` e `knowledge/semantic-audit.md`. O plano deve mostrar, para cada unidade substantiva do escopo, onde ela é apresentada, aplicada, praticada e retomada. Dimensione lições, microssequências, cards e partes por essa progressão e pelos pré-requisitos, nunca por uma meta de brevidade. Como o plano se torna imutável depois da gravação, uma lacuna de cobertura exige novo plano, não uma compensação improvisada na construção.

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

A especificação detalha somente essa parte: estrutura, microssequências, plano dos cards, fontes, termos e caminhos que devem ser preservados. Seus identificadores, limites, dependências, propriedade, resultados, conceitos, operações e equívocos precisam coincidir exatamente com o contorno reservado no plano.

Consulte a próxima parte novamente. A resposta `aralearn.part-spec` combina a especificação com tentativa, modo, continuidade, auditoria anterior e o recorte necessário do registro. Para clientes por chave, essa resposta não pode ultrapassar 90 KiB. Se ultrapassar, cancele a execução e crie um plano com partes menores.

A continuidade não é inferida pela semelhança entre frases. Ela leva somente identificadores declarados, relações causais, operações já exemplificadas, equívocos já tratados e mudanças de estado aprovadas. Uma retomada indica em `retrievedConceptIds` quais conceitos anteriores serão mobilizados; cada um precisa ter sido apresentado antes na mesma cadeia causal ou numa dependência aprovada. Uma correção indica em `misconceptionIds` o erro conceitual examinado.

## 4. Construção

Produza exatamente os cards previstos e envie um `aralearn.part-submission`. O fragmento deve:

- preservar identificadores, posições e limites;
- consultar o contrato do recurso antes de produzir cada representação prevista e usar apenas os campos formais devolvidos;
- usar somente fontes e afirmações autorizadas;
- apresentar cada termo antes de exigi-lo;
- manter as dependências;
- escolher o recurso que representa a operação estudada, sem converter por conveniência uma tabela, um código, uma árvore, um grafo, uma matriz ou uma fórmula em `paragraph` ou `choice`;
- descrever lacunas de texto e valor pela notação autoral formal `{gap:id}` e pelo campo `gaps`; a posição decorre do campo estruturado que contém o marcador, sem instrução em linguagem natural nem delimitador interno do runtime; forma e rótulo de `flow` usam somente o objeto estruturado `practice`; em resposta digitada, enumerar somente variantes literais necessárias, até o limite previsto pelo contrato, sem regex nem equivalência inferida;
- variar dados, representações e grau de apoio entre práticas da mesma operação, preservando no próprio card todos os dados particulares necessários para resolvê-lo;
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

Cada intenção recebe um `requestId` antes da chamada mutável. Conserve o corpo exato até conhecer o resultado. Em timeout, resposta perdida, limite de requisições ou falha temporária, repita o mesmo corpo com o mesmo identificador. Não gere outro conteúdo durante essa repetição.

O envio de um trecho do registro é recuperável e não autoriza encerrar a autoria. Em falha temporária, repita silenciosamente a mesma chamada; se a plataforma devolver controle antes de confirmar o resultado, releia a execução. Se o trecho já tiver sido aceito, avance pela ação persistida; se o estado ainda pedir o trecho, reenvie o mesmo corpo e `requestId`. Só comunique interrupção depois de uma rejeição determinística ou de um limite real da plataforma que persista após essa releitura.

Se a resposta se perder depois de o servidor gravar a alteração, a repetição idempotente recupera o resultado sem duplicá-la. Em conflito ou conclusão incerta, releia a execução. Uma correção de conteúdo constitui outra intenção e recebe outro `requestId`. Nunca reutilize o identificador antigo com corpo diferente nem repita indefinidamente uma rejeição determinística.
