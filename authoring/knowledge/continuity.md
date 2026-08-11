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

Teoria não é resumo do material-fonte. Na ausência de pré-requisito
comprovado, introduza a necessidade ou a situação em linguagem comum, mostre um
exemplo concreto quando ele tornar a ideia observável e só então apresente o
termo formal e suas relações. Um termo novo não pode ser definido por vários
outros termos ainda não explicados. Quando uma frase ou card precisar coordenar
conceitos novos independentes, distribua a progressão em mais cards ou em outra
microssequência. A quantidade resultante não é penalidade nem deve ser reduzida
por condensação; o limite técnico de oito cards por gravação exige decomposição
da unidade, não omissão de passos.

Variações de prática mudam dados, contexto, representação ou grau de apoio,
mas continuam vinculadas à mesma microteoria. Uma necessidade conceitual nova
gera outra microteoria.

## Alterações correntes

Cada mudança de continuidade altera somente as partes afetadas no estado
corrente do workspace. `expectedRevision` impede que uma decisão antiga
sobrescreva reorganização mais recente. O feed de alterações guarda resumos
recentes para orientar a conversa, sem snapshots comparáveis nem restauração
de versões anteriores.
