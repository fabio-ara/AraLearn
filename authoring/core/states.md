# Estados da execução

## Execução

| Estado | Significado | Próximos estados válidos |
|---|---|---|
| `planning` | Estrutura, fontes e partes estão sendo definidas. | `building`, `blocked`, `cancelled` |
| `building` | Há uma parte liberada para produção. | `auditing`, `blocked`, `cancelled` |
| `auditing` | A parte persistida está em exame. | `building`, `repair`, `rebuild`, `ready_for_validation`, `blocked` |
| `repair` | Uma tentativa reparável aguarda correção localizada. | `auditing`, `blocked`, `cancelled` |
| `rebuild` | O fragmento aguarda reconstrução sob a mesma especificação. | `auditing`, `blocked`, `cancelled` |
| `ready_for_validation` | Todas as partes estão aprovadas. | `validated`, `blocked`, `cancelled` |
| `validated` | O documento remontado passou pelas validações. | `publishing`, `blocked`, `cancelled` |
| `publishing` | A publicação da revisão está em andamento; o ponteiro vigente ainda não mudou. | `published` |
| `published` | A revisão imutável passou a ser a versão vigente no destino escolhido. | estado final |
| `blocked` | Uma decisão externa é indispensável. | estado anterior registrado pela API, `cancelled` |
| `cancelled` | A execução foi encerrada sem publicação. | estado final |

## Parte

| Estado | Significado |
|---|---|
| `planned` | Especificação registrada, ainda não liberada. |
| `building` | Parte atual liberada para construção. |
| `awaiting_audit` | Tentativa recebida e aguardando auditoria. |
| `repair_required` | A mesma especificação admite correções localizadas. |
| `rebuild_required` | O fragmento precisa ser refeito sob a mesma especificação. |
| `approved` | Uma tentativa passou pela auditoria. |
| `blocked` | A parte depende de uma decisão externa. |

## Regras de transição

- Uma execução tem no máximo uma parte ativa em `building`, `awaiting_audit`, `repair_required` ou `rebuild_required`.
- Uma tentativa enviada não é alterada. Reparo e reconstrução criam nova tentativa.
- A aprovação aponta para o `fragmentHash` canônico da tentativa persistida e examinada.
- A parte seguinte só passa a `building` depois da aprovação da atual.
- Repetir uma requisição comum com o mesmo `requestId` e o mesmo corpo devolve o resultado persistido. Na publicação, a repetição também pode avançar o cursor até `published`.
- Reutilizar a chave com conteúdo diferente é rejeitado.
- `published` só é alcançado por uma operação de publicação bem-sucedida.
- `nextAction` determina a próxima operação, não um ponto de parada. O cliente a executa e relê a execução no mesmo pedido enquanto não houver uma condição legítima de parada.
- A mudança entre Planejador, Construtor e Auditor exige uma nova leitura persistida, mas não outra conversa.
- Uma interrupção não cria outra execução. A retomada consulta o mesmo `runId` e segue o estado encontrado.
- A primeira chamada de publicação exige confirmação final do autor, mesmo quando a intenção inicial previa publicar.
