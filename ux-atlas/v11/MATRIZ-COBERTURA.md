# Matriz backend → operação → UI → Pesquisa

| Capacidade implementada | Problema/tarefa humana | Superfície v11 | Fatos de Pesquisa |
| --- | --- | --- | --- |
| composição do Curso | entender onde está o conteúdo | Curso → Estrutura | `activity` |
| planejamento + Partes | planejar e materializar | Curso → Planejamento | `materializations` |
| parâmetros de desenho | configurar decisões didáticas | Curso → Parâmetros | `design` |
| catálogo/política de componentes | permitir, excluir ou preferir componentes | Parâmetros → Componentes; Variantes | `design`, `variants` |
| Fontes, revisões, Âncoras, atribuições e PDFs | reconhecer e ancorar evidência | Curso → Fontes; Unidade → Fontes | `sources` |
| Inspeção | ler material real no contexto curricular | Revisar → Inspeção | `activity` quando houver operação registrada |
| Observações | registrar, considerar, responder e resolver questões | Revisar → Discussões e correções | `annotations` |
| Auditoria/correções/reversões | verificar e reparar | Revisar → Auditoria | `audits` |
| Variantes | comparar desenho e materialização de Cursos de origem comum | Pesquisa → Variantes | `variants` |
| Analytics | explorar fatos, métricas, ausências e limitações | Pesquisa → Analytics e fatos | sete datasets |
| concessão/revogação de acesso | administrar quem estuda diretamente | Pessoas | `activity` |
| MCP / conversa conectada | agir sobre o objeto corrente sem copiar contexto | ação ChatGPT contextual | canal `authoring_chat` |

## Delimitação

`research_condition` e Variantes não criam experimento causal com estudantes. Grupos/coortes, regra de atribuição, exposição, instrumentos/outcomes e plano de análise permanecem explicitamente futuros no atlas.
