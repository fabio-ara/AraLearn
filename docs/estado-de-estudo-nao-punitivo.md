# Estado de estudo não punitivo

O AraLearn conserva decisões funcionais correntes para a pessoa interromper e
retomar o estudo. Não registra abertura de card, tempo, permanência, número de
tentativas, acertos, erros ou último resultado. Esses sinais não são usados
como substitutos de atenção, esforço, domínio ou qualidade do trabalho.

## O que existe

| Estado corrente | Pergunta que responde | Unidade e agregação | Uso permitido | Inferência proibida | Persistência |
| --- | --- | --- | --- | --- | --- |
| ponto de continuação | onde a pessoa escolheu continuar a lição? | um `cursor` corrente por pessoa, item de Trilhas e lição | reabrir a lição no card correspondente | atenção, tempo, engajamento, dificuldade ou domínio | campo corrente na única linha do item |
| conclusão estrutural | quais cards a pessoa já fez avançar neste item? | conjunto compacto de ids por `lessonId` estável | não repetir involuntariamente uma etapa e calcular a continuidade local | acerto, qualidade da resposta, nota ou aprendizagem | `completedCardIds` corrente; sem evento ou data por card |
| **Rever** | que card a própria pessoa decidiu revisitar? | marca corrente por `cardId` estável | montar uma lista pessoal e abrir o alvo exato | erro, dificuldade, déficit, prioridade docente ou risco | mapa corrente; retirar a marca remove a chave |
| observação | o que a pessoa declarou sobre este card? | uma categoria e um texto correntes por pessoa, item e `cardId` estável | reencontrar dúvida, possível erro, confusão, sugestão ou observação | a presença ou ausência do texto não mede compreensão | texto no estado corrente e thread leve de triagem; sem histórico da conversa |

`updatedAt` é somente a data de atualização desse estado funcional. Ela serve
para controlar a revisão e apresentar a atualidade do cache, não para construir
frequência, sessão, jornada temporal ou perfil comportamental.

## Contexto e papéis

**Rever** e as observações pertencem à réplica da própria conta e ao card exato.
O estudante não é classificado, comparado ou ranqueado.

Papéis de revisão de um workspace recebem somente as observações cujo
`trailItemId` aponta para uma composição acessível naquele espaço, com contagens
correntes e até vinte cards prioritários calculados na leitura para triagem.
Eles não recebem curso frequentado, tempo, tentativas, resultado nem uma visão
individual de “desempenho”. Conclusão estrutural continua sendo uma ajuda
pessoal de retomada, não uma avaliação do estudante.

## Custo e sincronização

O navegador e o Android usam o mesmo IndexedDB. Progresso, **Rever** e texto da
observação ocupam uma linha JSON corrente por pessoa e `trailItemId`, com
orçamento operacional de 256 KiB. O progresso v3 agrupa `cursorCardId` e
`completedCardIds` pelo `id` estável da lição, sem repetir o caminho completo
nem uma data para cada card. O dispositivo envia somente operações `set|delete` por chave,
agrupadas em lotes de até 512 operações ou 64 KiB e protegidas por CAS e
`mutationId`.

A thread da observação guarda apenas identidade, estado, resposta, resolução e
vínculo de correção; categoria e texto continuam em uma única fonte. A mesma
transação cria ou remove a thread quando o texto corrente muda. O bootstrap
relacional não transporta esse estado nem eventos de visualização; o item é
carregado pela RPC própria quando necessário.

Como lições e cards são identificados pelos próprios ids, mover uma parte dentro
da composição não desloca nem regrava o estado dos estudantes. Uma alteração no
workspace também não modifica o estado de quem ainda estuda uma distribuição
anterior; a associação continua válida quando os mesmos ids chegarem à próxima
distribuição.

## Regra para novos indicadores

Um indicador futuro só pode entrar no produto depois de registrar na matriz de
rastreabilidade: pergunta educacional, construto, unidade, agregação, decisão
que apoiará, responsável pela decisão, inferências proibidas, método de
avaliação, prazo de retenção e custo. Conveniência técnica não basta. Dados
comportamentais não devem ser coletados “para uso posterior”.
