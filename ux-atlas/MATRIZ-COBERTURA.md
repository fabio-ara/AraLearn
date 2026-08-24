# Matriz backend → operação → UI → Pesquisa

| Capacidade implementada | Problema/tarefa humana | Superfície alvo | Fatos de Pesquisa |
| --- | --- | --- | --- |
| entrada Estudo/Autoria | escolher rapidamente entre estudar e editar | Home → switch `Estudo / Autoria` | — |
| runtime, progresso, Rever e offline | estudar, retomar e continuar sem perder contexto | Estudo → Curso → Módulo → Lição → Microssequência → Unidade | estado pessoal; não inferir aprendizagem |
| edição manual da Unidade | aprender/modificar conteúdo simples no mesmo contexto | Unidade → modo `Editar` | somente fatos que o contrato atual efetivamente registrar |
| assistência focal por provider/API | pedir alteração/explicação sem sair da Unidade | Unidade → modo `Assistência por API` | não criar telemetria nova |
| cópia pessoal de Curso compartilhado | editar sem alterar o Curso alheio | Estudo → Unidade → salvar na minha cópia | `activity` quando projetado pelo contrato atual |
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

A matriz é uma **cobertura de produto**, não autorização para criar telemetria ou backend. Para Estudo, preservar os mecanismos atuais de runtime, edição manual, provider/API, cópia pessoal, progresso e offline. A identidade visual desses fluxos está em `STUDY-VISUAL-BASELINE.md`.

`research_condition` e Variantes não criam experimento causal com estudantes. Grupos/coortes, regra de atribuição, exposição, instrumentos/outcomes e plano de análise permanecem explicitamente futuros.
