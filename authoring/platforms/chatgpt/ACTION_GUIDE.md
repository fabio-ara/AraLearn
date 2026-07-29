# Operações da Action

## Laço de operações

Depois de cada fase, use `consultarExecucaoDeAutoria` ou a leitura indicada para recuperar o estado persistido, entregue o resultado e aguarde aprovação explícita. Não execute a nova `nextAction` no mesmo pedido. A passagem de Planejador para Construtor e de Construtor para Auditor exige nova leitura do servidor e nova mensagem do autor.

O `runId` permite retomar uma interrupção sem criar outra execução e sem abrir novo chat. Além de toda entrega, pare quando faltar uma decisão humana indispensável, a autenticação falhar, houver limite real da ferramenta ou do modelo, ocorrer rejeição determinística não corrigível ou faltar a confirmação final de publicação. Nunca publique sem essa confirmação.

## Abrir ou retomar

`listarExecucoesDeAutoria` localiza execuções recentes. `criarExecucaoDeAutoria` abre uma execução e exige `publicationIntent`.

No perfil pessoal, o destino é fixo em `private` e o modo é sempre:

```json
{ "mode": "create" }
```

No perfil editorial, o destino é fixo em `catalog`. Um curso novo usa o mesmo modo `create`; uma atualização usa:

```json
{
  "mode": "update",
  "existingCourseId": "UUID",
  "expectedContentHash": "SHA-256"
}
```

Guarde o `runId` devolvido. Use `consultarExecucaoDeAutoria` depois de conflitos, retomadas e falhas cuja conclusão seja incerta.

## Planejar sem exceder os limites

1. `gravarPlanoDeAutoria`: envie o esqueleto v4, `ledgerManifest`, resultados, mapa conceitual, critérios e contornos compactos. O plano da Action pode ocupar até 96 KiB.
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

`entregarFaseDeAutoria` fecha uma fase em espera de revisão humana e impede outra mutação até o autor decidir. Depois da aprovação, `aprovarEntregaDeAutoria` recebe a confirmação explícita e devolve a execução ao estado anterior. `bloquearExecucaoDeAutoria` permanece reservado para dúvida indispensável; `cancelarExecucaoDeAutoria` encerra um plano que precisa ser substituído.

## Encerrar

`validarCursoProduzido` remonta e verifica o documento completo. No perfil
pessoal, `concluirCursoPessoal` aponta o curso da conta para a revisão validada.
No perfil editorial, `publicarCursoNoCatalogo` troca a revisão vigente do
catálogo depois da confirmação do autor. HTTP 202 confirma uma intenção aceita
ou em execução; aguarde `pollAfterSeconds` e repita a operação com o mesmo
`requestId` até HTTP 200 e `status: published`. A importação integral de JSON não
está exposta nestas Actions.

## Idempotência

Cada intenção recebe um `requestId` novo antes do envio. Uma repetição causada por timeout, resposta perdida ou falha temporária conserva o mesmo identificador e o mesmo corpo. Se o resultado estiver incerto, consulte a execução. Conteúdo corrigido recebe outro identificador; nunca reutilize o anterior com corpo diferente.
