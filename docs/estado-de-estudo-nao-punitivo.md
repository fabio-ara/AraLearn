# Estado de estudo não punitivo

O AraLearn conserva decisões funcionais correntes para a pessoa interromper e
retomar o estudo. Não registra abertura de card, tempo, permanência, número de
tentativas, acertos, erros ou último resultado. Esses sinais não são usados
como substitutos de atenção, esforço, domínio ou qualidade do trabalho.

## O que existe

| Estado corrente | Pergunta que responde | Unidade e agregação | Uso permitido | Inferência proibida | Persistência |
| --- | --- | --- | --- | --- | --- |
| ponto de continuação | onde a pessoa escolheu continuar a lição? | um `cursor` corrente por pessoa, seleção e lição | reabrir a lição no card correspondente | atenção, tempo, engajamento, dificuldade ou domínio | uma linha de lição, sobrescrita |
| conclusão estrutural | quais cards a pessoa já fez avançar nesta cópia do curso? | `completedAt` corrente por card e conclusão corrente da lição | não repetir involuntariamente uma etapa e calcular a continuidade local | acerto, qualidade da resposta, nota ou aprendizagem | no máximo uma linha por card e uma por lição |
| **Rever** | que card a própria pessoa decidiu revisitar? | `reviewMarkedAt` corrente por card | montar uma lista pessoal e abrir o alvo exato | erro, dificuldade, déficit, prioridade docente ou risco | no máximo uma linha por card; retirar a marca apaga a linha vazia |
| observação | o que a pessoa declarou sobre este card? | uma categoria e um texto correntes por pessoa e card | reencontrar dúvida, possível erro, confusão, sugestão ou observação | a presença ou ausência do texto não mede compreensão | uma linha corrente; sem histórico da conversa |

`lastStudyStateAt` é somente a data de atualização desse estado funcional. Ela
serve para apresentar a atualidade da réplica, não para construir frequência,
sessão, jornada temporal ou perfil comportamental.

## Contexto e papéis

**Rever** e as observações pertencem à réplica da própria conta e ao card exato.
O estudante não é classificado, comparado ou ranqueado.

Papéis de revisão de um workspace recebem somente as observações que foram
explicitamente situadas naquele espaço, com contagens correntes e até vinte
cards prioritários calculados na leitura para triagem.
Eles não recebem curso frequentado, tempo, tentativas, resultado nem uma visão
individual de “desempenho”. Conclusão estrutural continua sendo uma ajuda
pessoal de retomada, não uma avaliação do estudante.

## Custo e sincronização

O navegador e o Android usam o mesmo IndexedDB. Cada decisão substitui a linha
corrente e entra numa outbox idempotente. `lessonProgress` e `cardProgress` são
aceitos apenas por `apply_non_punitive_study_state_batch_v1`; observações usam
`apply_situated_comment_batch_v1`. O endpoint genérico rejeita esses contratos.
O bootstrap transfere somente as linhas correntes, sem eventos de visualização
ou histórico de respostas.

## Regra para novos indicadores

Um indicador futuro só pode entrar no produto depois de registrar na matriz de
rastreabilidade: pergunta educacional, construto, unidade, agregação, decisão
que apoiará, responsável pela decisão, inferências proibidas, método de
avaliação, prazo de retenção e custo. Conveniência técnica não basta. Dados
comportamentais não devem ser coletados “para uso posterior”.
