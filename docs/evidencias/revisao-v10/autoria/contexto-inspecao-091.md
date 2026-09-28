# Contexto focal de inspeção — ajuste 091

O contexto de inspeção repetia a mesma observação sob a unidade e sob a Explicação. Também apresentava `operation` sem explicitar, no nome do bloco, que seu valor vinha da operação declarada pelo autor. A orientação existente já exigia confrontar essa declaração com pergunta, resposta e feedback em seis dimensões. O ajuste organiza os dados desse confronto; não acrescenta critério pedagógico nem calcula uma operação efetivamente realizada.

A [projeção humana](../../../../supabase/functions/_shared/aralearn-authoring/courseHumanAuditContext.js) reutiliza o foco de auditoria existente. Dentro da mesma identidade de curso/revisão/microssequência e base/instrução literal, observações iguais da mesma unidade passam a ocupar uma única posição em `unidadesParaConfronto`. Cada alvo mantém sua seleção ordenada de posições, começando em 1. Títulos iguais não unem identidades; observações divergentes da mesma unidade permanecem distintas. A seleção e sua lista pertencem à mesma página lógica, sem estado persistente ou referência global nova.

Em cada observação, `declarado` reúne os requisitos vinculados e a operação declarada. `tarefaApresentada` reúne os campos de enunciado, alternativas, respostas previstas, conteúdo e feedback já disponíveis. Objetivo, revisão orientadora, indícios e campos adicionais permanecem. O guia esclarece localização e proveniência; não certifica suficiência. Dados sem identidade ou com estrutura incompatível conservam `units` localmente, sem sobrescrever campos desconhecidos.

Conteúdo literal, citações e referências por alvo, configuração aplicada/histórica, doze parâmetros com definições, origens, motivos, escopos, condições, repertório e vizinhança pertinente são preservados. A base canônica, o hash de inspeção e o validador de pareceres não mudam. `preparar_revisao` e `retomar_curso` usam essa projeção antes da retirada de metadados internos e da paginação, tanto em MCP quanto em Actions.

## Provas locais

Comando focal: `node --test tests/runtime/course-human-audit-context.test.js tests/runtime/course-human-read-context.test.js` — **40/40 testes passaram**, em aproximadamente 20,36 s.

- [Projeção](../../../../tests/runtime/course-human-audit-context.test.js): ida e volta por igualdade profunda, entrada não modificada, identidades e bases distintas, ordem das listas, observações variantes, campos desconhecidos, ausência, `null`, histórico e condição de pesquisa preservados.
- [Consumidores e paginação](../../../../tests/runtime/course-human-read-context.test.js): MCP e Actions locais, revisão e retomada, conteúdo literal, citações/referências próprias, parâmetros históricos desconhecidos e condição `before_and_after`; reconstrução em duas páginas lógicas, focos independentes e fragmentos com digest e limites existentes. Os adaptadores são de teste; isso não comprova o MCP hospedado.

A medição reutilizou uma resposta arquivada da revisão329, com cinco unidades e uma Explicação, sem nova coleta. O arquivo original, incluindo LF final, tem 181.080 bytes e SHA-256 `0d95f481c8adf19ca724071787c0078d080d81e9bf3312fb19aa11da94d56054`. Sua entrada foi recomposta apenas para a projeção; a projeção Git anterior reproduziu integralmente o objeto salvo antes de aplicar o código novo. A associação usa IDs dos alvos e correspondência literal única, nunca títulos. Não se reconstruiu uma base canônica de inspeção.

| Medida do JSON compacto, sem LF final | Original | Implementação |
| --- | ---: | ---: |
| Unidades UTF-16 | 177.577 | 156.143 |
| Bytes UTF-8 | 181.079 | 159.177 |
| Fragmentos pelo paginador de produto, executado localmente | 17 | 15 |

Dez ocorrências tornam-se cinco observações compartilhadas. A redução líquida é de 21.434 unidades UTF-16 (12,07%) e 21.902 bytes. Os 17 intervalos originais coincidiram com o recibo arquivado; a representação nova se reconstituiu dentro dos mesmos limites de 12.000 unidades UTF-16 e 16 KiB por contexto. A consulta local usa identificador sintético de mesmo comprimento.

A inversão da organização reconstituiu todo o objeto original, repondo apenas o guia estrutural anterior. Igualdade profunda e SHA-256 canônico coincidem: `2bc67ef495fb5299fe59726103d49048b6359e72f227c659c46277738fa6e3b4`. Esse hash por valor não é o hash dos bytes originais. Foram preservados os 60 registros de parâmetros nos alvos, seus 60 correspondentes na base e as 12 definições, inclusive a posição `after_explanation` automática desta amostra. Não se atribui a ela uma condição de pesquisa ausente; a fixação de pesquisa é coberta pelos testes sintéticos.

## Limites

São medidas de unidades UTF-16 e bytes, não de tokens, latência ou atenção do modelo. O pacote arquivado é uma releitura de engenharia, não o histórico integral de chamadas da autoria. Não há demonstração de causalidade dos pareceres anteriores nem de melhora do julgamento. Após o deploy aprovado pelos gates técnicos, uma leitura focal no MCP real deve verificar a projeção hospedada antes do encerramento da intervenção. Este recorte não registrou inspeção, alterou curso, executou UI ou produziu validação humana; também não executou gate amplo, CI ou publicação.
