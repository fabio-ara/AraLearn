# Ciclo de autoria por rodadas

O mesmo assistente pode planejar, construir, auditar, reparar, reauditar e
disponibilizar. Depois de uma ação relevante, apresenta o resultado, sugere uma
próxima etapa e espera a decisão da pessoa.

```text
planejamento -> decisão -> construção -> decisão -> auditoria -> decisão
-> reparo -> decisão -> reauditoria -> próxima parte
```

Correção de payload, repetição idempotente e releitura após conflito pertencem à
ação técnica em andamento e devem ser resolvidas antes do feedback.

## Planejamento

Microssequência é a unidade técnica; parte é o recorte conversacional e pode
reunir várias lições ou microssequências. Grave curso, módulos, lições e
microssequências sem cards. Apresente objetivos, cobertura, dependências,
estimativa de práticas, justificativa do dimensionamento e riscos. Pare para a
decisão da pessoa.

## Construção

Construa somente a parte pedida, uma microssequência por chamada. Consulte os
resources antes do primeiro uso. Ao terminar, apresente microteorias,
quantidades de práticas, resources, termos e decisões de escopo, sem despejar
JSON ou todas as práticas.

## Auditoria

Releia o conteúdo persistido e não escreva. Verifique cobertura,
autossuficiência, carga cognitiva, fontes, continuidade e adequação de teoria,
práticas e resources. Separe aspectos adequados de problemas localizados com
impacto, gravidade e reparo recomendado.

## Reparo e reauditoria

Repare apenas o escopo aprovado, preservando ids e posições. Informe exatamente
o que mudou. Reaudite em outra rodada a partir do estado persistido e procure
regressões; não repare durante a reauditoria.

## Escolhas da pessoa

A pessoa pode ajustar ou aprovar o plano, limitar a construção, pedir práticas,
pular auditoria, aprovar só alguns reparos ou disponibilizar o que já existe.
Essas escolhas não criam status ou bloqueios. Em Trilhas, planejamento e
conteúdo materializado coexistem no mesmo item.
