# Continuidade didática

Continuidade pertence ao documento v4, não a um cursor de execução.

## Dependências

`dependsOn` declara quais microssequências oferecem base para a atual.
`branchOf` identifica apoio local. Movimentos e junções devem preservar ou
remapear essas referências; exclusões removem dependências órfãs.

Uma prática recupera apenas conteúdo apresentado antes na mesma
microssequência ou numa dependência alcançável. A proximidade no array, a
semelhança de título ou a presença em outro curso não criam relação causal.

## Cobertura

- `covers`: tópicos apresentados ou exercitados;
- `checks`: evidências observáveis esperadas;
- `errors`: equívocos tratados;
- `lesson.topics`: vocabulário conceitual compartilhado.

Ao mover uma microssequência entre lições ou cursos, verifique se os tópicos e
guias do novo contexto continuam suficientes. Ao juntar, una metadados sem
duplicação. Ao separar, distribua cobertura e verificações conforme os cards
que foram transferidos.

## Microteoria e prática

Cards teóricos apresentam conceitos, representações e exemplos resolvidos.
Cards de exercício recuperam e aplicam essa base. Uma prática não pode
introduzir silenciosamente notação, regra, ferramenta ou procedimento novo.

Variações de prática mudam dados, contexto, representação ou grau de apoio,
mas continuam vinculadas à mesma microteoria. Uma necessidade conceitual nova
gera outra microteoria.

## Revisões

Cada mudança de continuidade cria revisão imutável do workspace. O histórico
permite comparar ou restaurar, enquanto `expectedRevision` impede que uma
decisão antiga sobrescreva reorganização mais recente.
