# Checklist de UX da Autoria integrada

Use esta lista para registrar a validação da #109. “Automatizado” indica uma
regressão exercitada por testes; “humano pendente” indica algo que só pode ser
confirmado com pessoa real. Não transformar o estado de uma linha em alegação
de eficácia pedagógica.

| Persona e tarefa | Evidência automatizada | Estado humano | Sinal de falha |
| --- | --- | --- | --- |
| Autodidata encontra Estudo e Autoria | jornadas de navegação, 360–1280 px e claro/escuro | pendente | não distinguir aprender de construir |
| Autodidata acompanha Parte em produção e estuda conteúdo pronto | projeção do workspace, retorno ao leitor e cache offline | pendente | precisar abrir desenho técnico para saber o estado |
| Autodidata retoma sem repetir o contexto | continuidade, MCP e conversas compostas | pendente | contexto do chat ser a única fonte de verdade |
| Instrutor encontra Mapa, Desenho, Conteúdo e Auditoria | superfície de workspace, foco, teclado e retorno | pendente | abas/destinos sem rótulo ou contexto perdido |
| Instrutor fixa um parâmetro e volta para Auto | formulário estruturado, CAS, offline somente leitura e override | pendente | pedir JSON, ID ou vocabulário de banco |
| Instrutor consulta Resources por família/faceta | paginação, seleção restrita e `ResourceSet` efetivo | pendente | configurar cards um a um ou perder membros fora da página |
| Instrutor localiza e decide finding atual | auditoria paginada, alvo removido, currentness e reauditoria | pendente | CTA em rodada histórica ou alvo impossível de abrir |
| Pesquisador cria condições e congela variantes | PGlite: locks, diff, decisões, freeze, assignment e retirada | revisão especializada pendente | seed, participante ou condição expostos fora da autoridade correta |
| Participante abre somente a variante atribuída | PGlite e E2E: seleção privada, revogação e offline da seleção | pendente | catálogo, condição alheia ou roster visível |
| Resultados preservam ausência e proveniência | datasets versionados, tabela/gráfico e exportação CSV/JSON | interpretação humana pendente | score, causalidade ou dado pessoal inferido pela interface |
| Curso grande continua navegável | Chromium: 3,43 MB, 175 micros e 1.052 cards; paginação/cache | uso real prolongado pendente | bloqueio perceptível, crescimento sem limite ou perda de seleção |

## Decisão de encerramento

Para marcar a #109 como concluída, cada linha humana pendente precisa de uma
sessão registrada pelo [roteiro de aceitação](roteiro-aceitacao-humana-autoria.md).
As linhas de pesquisa e resultados também exigem revisão especializada sobre a
finalidade dos dados e a interpretação, sem converter o checklist em aprovação
ética ou científica automática.
