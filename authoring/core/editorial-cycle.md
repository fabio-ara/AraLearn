# Ciclo de autoria por rodadas

O mesmo assistente pode planejar, construir, auditar, reparar, reauditar,
submeter e distribuir. Depois de uma ação relevante, apresenta o resultado, sugere uma
próxima etapa e espera a decisão da pessoa.

```text
planejamento -> decisão -> construção -> decisão -> auditoria -> decisão
-> reparo -> decisão -> reauditoria -> próxima parte
```

Correção de payload, repetição idempotente e releitura após conflito pertencem à
ação técnica em andamento e devem ser resolvidas antes do feedback.

O chat é descartável. No início de cada etapa sobre um workspace existente,
use `lerWorkspaceDeAutoria` com `view: "resume"`; não infira decisão, parte,
mandato ou achado a partir da conversa.

## Planejamento

Microssequência é a unidade técnica; parte é o recorte conversacional e pode
reunir várias lições ou microssequências. Grave curso, módulos, lições e
microssequências sem cards. Apresente objetivos, cobertura, dependências,
estimativa de práticas, justificativa do dimensionamento e riscos. Pare para a
decisão da pessoa.

Depois da aprovação ou ajuste, use `record_approved_plan` uma vez para gravar
atomicamente todas as Partes, decisões e o mandato corrente. As Partes contêm
listas ordenadas de ids de microssequências. O `brief` conserva somente contexto
estável e fontes, nunca esses registros.

## Construção

Construa somente a parte pedida, uma microssequência por chamada. Consulte os
resources antes do primeiro uso. Ao terminar, apresente microteorias,
quantidades de práticas, resources, termos e decisões de escopo, sem despejar
JSON ou todas as práticas.

## Auditoria

Grave um mandato `audit` novo — com `targetPartId` quando a autorização estiver
limitada a uma Parte —, retome o workspace, consulte `list_comments` e
`list_observations` com `kinds: ["note"]`, releia o conteúdo persistido e não
o altere. Verifique cobertura,
autossuficiência, carga cognitiva, fontes, continuidade e adequação de teoria,
práticas e resources. Separe aspectos adequados de problemas localizados com
impacto, gravidade e reparo recomendado. Registre somente achados compactos na
continuidade da autoria.

Achados ativos já estão em `resume`. Consulte o histórico com
`kinds: ["audit_finding"]`, estados e paginação somente quando a etapa exigir.
Ao concluir o relatório, limpe o mandato de auditoria.

## Reparo e reauditoria

Persista o mandato humano e repare apenas os achados nele aprovados, preservando
ids e posições. Informe exatamente o que mudou e vincule uma observação somente
depois da correção confirmada. Reaudite em outra rodada a partir da retomada e
do estado persistido, registre o resultado e procure regressões; não repare
durante a reauditoria.

O commit mantém no achado aprovado o identificador e a revisão da correção
pendente mais recente. Uma sessão posterior os retoma, relê o alvo e continua
ou confirma o vínculo sem depender da conversa nem do prazo dos recibos.
Cada `link_finding_correction` confirmado retira esse achado do mandato de
reparo; o último o encerra. A reauditoria começa com outro mandato `audit` e
termina limpando-o explicitamente.

Use `link_comment_correction` para comentário de estudo e
`link_finding_correction` para achado de auditoria; são registros distintos.

## Escolhas da pessoa

A pessoa pode ajustar ou aprovar o plano, limitar a construção, pedir práticas,
pular auditoria, aprovar só alguns reparos ou estudar o que já existe.
Essas escolhas não impõem uma sequência obrigatória. Se a pessoa persistir um
mandato, as escritas ficam limitadas ao seu tipo e escopo até consumo ou
limpeza. Em Trilhas, planejamento e conteúdo materializado coexistem no mesmo
item.
