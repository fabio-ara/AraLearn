# Matriz de conformidade técnica

Esta matriz liga propriedades correntes a mecanismos e verificações. Teste de
software demonstra o comportamento exercitado; não demonstra aprendizagem,
qualidade pedagógica global nem usabilidade com participantes.

| Propriedade | Mecanismo corrente | Evidência focal | Limite |
| --- | --- | --- | --- |
| Autoria abre diretamente no conteúdo | rota canônica `content` e superfície sem overview | `course-authoring-route.test.js`, `course-authoring-surface.test.js` | inspeção local não substitui jornada hospedada |
| Uma StudyUnit domina o leitor | sequência focal, índice/pesquisa e deep links | `course-inspection-sequence.test.js`, E2E de Autoria | conteúdo real ainda pode revelar problemas de densidade |
| Planejamento é incremental | uma parte por resposta, releitura do plano e parte anterior reabrível | `incremental-authoring-conversation-acceptance.test.js` | 7–12 é heurística, não gate |
| AnalysisUnit preserva granularidade semântica | inventário antes da produção e distribuição por teto | `instructional-analysis-granularity-eval.test.js` e fixtures correspondentes | o banco não julga equivalência semântica |
| Quatro parâmetros pedagógicos e dois alvos editoriais têm efeito | configuração focal e efetiva por escopo | `course-design-parameters.test.js`, Analytics e fixture de calibração | alvos são flexíveis e não podem reduzir conteúdo necessário |
| MCP e Actions oferecem os mesmos casos de uso | catálogo `COURSE_HUMAN_TASKS` projetado nos dois transportes | `course-human-mcp.test.js`, `chatgpt-action-human-schema.test.js`, gate OpenAPI | cliente real precisa ser reconectado após publicação |
| Contrato público usa referências humanas | camada confiável resolve identidades e concorrência | testes do executor humano e do roteador | ambiguidade material volta à conversa |
| Revisão alcança o contexto afetado | Observações abertas, preparação contextual e correções em conjunto | `contextual-review-repair-acceptance.test.js` | aplicação exige reinspeção humana ou assistida |
| Fontes permanecem localizáveis e contestáveis | Fonte, Âncora e atribuição correntes | testes de fontes, painel e ingestão PDF | proveniência não prova verdade nem qualidade científica |
| Analytics descreve desenho e autoria correntes | contrato v2 com escopo, Desenho e Autoria | testes de domínio, painel e PGlite | contagens não são scores nem efeito educacional |
| JSON e painel apresentam o mesmo snapshot | exportação do objeto v2 normalizado exibido | `course-analytics-panel.test.js` | snapshot não contém o curso completo |
| PDF permanece privado | download server-side e mutação de bytes somente pela Storage API | `course-storage-lifecycle-local-smoke.mjs` | backup do banco não contém os bytes |
| Remoção, reativação e órfão são recuperáveis | attachment corrente, tombstone e intents abertas | smoke de lifecycle e testes de ingestão | limpeza física exige a API e autorização de serviço |
| Upgrade preserva o estado útil | dump, restore em PostgreSQL descartável e migração de corte | `verifyBackupRestoreUpgrade.mjs`, `backup-restore-upgrade.test.js` | fixture é representativa, não cópia de dados hospedados |
| RLS e menor privilégio permanecem ativos | políticas, grants e funções com autoridade delimitada | Supabase local, PGlite e testes de autorização | ocultar controle na UI não substitui recusa do servidor |

## Gate de integração

Uma mudança atravessa camadas quando altera contrato, schema ou autorização.
Nesse caso, valide a regra pura, a projeção do transporte, o banco descartável e
o consumidor real correspondente. O gate final acrescenta fresh, upgrade,
restore, Chrome em tamanhos e temas definidos, MCP reconectado e OpenAPI
efetivamente reimportado.

Consulte [Verificação da interface](auditoria-front-end.md), [Persistência
relacional](persistencia-relacional.md) e [Supabase](supabase.md).
