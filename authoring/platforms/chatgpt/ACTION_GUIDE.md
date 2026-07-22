# Operações da Action

## Abrir ou retomar

`listarExecucoesDeAutoria` localiza execuções recentes. `criarExecucaoDeAutoria` abre uma execução e exige `publicationIntent`:

```json
{ "mode": "create" }
```

ou:

```json
{
  "mode": "update",
  "existingCourseId": "UUID",
  "expectedContentHash": "SHA-256"
}
```

Guarde o `runId` devolvido. Use `consultarExecucaoDeAutoria` depois de conflitos, retomadas e falhas cuja conclusão seja incerta.

## Planejar sem exceder os limites

1. `gravarPlanoDeAutoria`: envie o esqueleto v3, `ledgerManifest`, resultados, mapa conceitual, critérios e contornos compactos. O plano da Action pode ocupar até 96 KiB.
2. `gravarTrechoDoRegistro`: envie `sources`, `claims` e `terms` em trechos numerados. O corpo pode ocupar até 64 KiB e `items`, até 60 KiB.
3. `finalizarPlanoDeAutoria`: envie o `planHash` quando todas as quantidades coincidirem com o manifesto.

O contorno de cada parte reserva `key`, limites, dependências, propriedade, `cardIds` e `outcomeIds`. Estrutura e plano dos cards são gravados depois.

## Preparar e construir uma parte

1. `consultarProximaParte` identifica a primeira parte causal pendente.
2. `gravarEspecificacaoDaParte` recebe uma orientação detalhada de até 48 KiB. Ela deve coincidir com o contorno reservado.
3. `consultarProximaParte` devolve `aralearn.part-spec`, com a especificação, o recorte do registro, continuidade, tentativa e modo. A resposta da Action tem limite de 90 KiB.
4. `gravarParteDoCurso` recebe `aralearn.part-submission`. O fragmento ocupa menos de 90 KiB.
5. `consultarEntregaDaParte` devolve o fragmento persistido, seu `fragmentHash` e o `submissionReadReceipt` temporário.
6. `auditarParteDoCurso` recebe `aralearn.part-audit`, com o hash e o comprovante lidos, os dez indicadores de `core/quality.md`, decisão, achados e instruções.

## Corrigir

`repair` altera apenas os caminhos indicados. `rebuild` refaz o fragmento sob a mesma especificação. Se a validação final encontrar um defeito em uma parte aprovada, use `reabrirParteDoCurso` antes da nova tentativa.

`bloquearExecucaoDeAutoria` registra uma dúvida indispensável. Depois da resposta do autor, `retomarExecucaoDeAutoria` recebe uma resolução não vazia. `cancelarExecucaoDeAutoria` encerra um plano que precisa ser substituído.

## Encerrar

`validarCursoProduzido` remonta e verifica o documento completo. `publicarCursoNoCatalogo` publica somente uma execução validada e autorizada. HTTP 202 com `status: publishing` confirma o avanço persistido; aguarde `pollAfterSeconds` e repita essa operação com o mesmo `requestId` até HTTP 200 e `status: published`. Cada chamada termina em até 45 segundos. A importação integral de JSON não está exposta nesta Action.

## Idempotência

Cada intenção recebe um `requestId` novo. Uma repetição causada por timeout ou falha temporária conserva o mesmo identificador e o mesmo corpo. Conteúdo corrigido recebe outro identificador.
