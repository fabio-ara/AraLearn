# Matriz backend → operação → UI → Pesquisa

Esta matriz cobre as capacidades que precisam aparecer no produto final. Uma capacidade de produto não é considerada concluída só porque existe no backend: a pessoa autorizada precisa conseguir encontrá-la e usá-la pela interface, salvo quando sua natureza for estritamente interna.

| Capacidade | Tarefa humana | Superfície alvo | Observação |
| --- | --- | --- | --- |
| entrada Estudo/Autoria | escolher entre estudar e editar | Home → switch `Estudo / Autoria` | identidade visual obrigatória |
| runtime, progresso, Rever e offline | estudar, retomar e continuar sem perder contexto | Estudo → Curso → Módulo → Lição → Microssequência → Unidade | estado pessoal não mede aprendizagem |
| edição manual da Unidade | modificar conteúdo no mesmo contexto | Unidade → modo `Editar` | usar mecanismo corrente |
| assistência focal por provider/API | pedir sugestão sem sair da Unidade | Unidade → modo `Assistência por API` | sem telemetria nova por conveniência |
| cópia pessoal | editar compartilhado sem alterar original | Unidade → salvar na minha cópia | Curso privado próprio |
| criar/editar/excluir Curso próprio | manter a própria biblioteca, inclusive Cursos de teste | Autoria → Meus cursos → ações do Curso | exclusão remota ≠ limpeza local ≠ zerar progresso |
| sair de Curso compartilhado | encerrar o próprio acesso | Estudo → ações do Curso | não excluir o Curso do proprietário |
| composição do Curso | entender onde está o conteúdo | Curso → Estrutura | `activity` quando aplicável |
| planejamento + Partes | planejar e materializar | Curso → Planejamento | `materializations` |
| parâmetros de desenho | configurar decisões didáticas | Curso → Parâmetros | `design` |
| catálogo/política de componentes | permitir, excluir ou preferir componentes | Parâmetros → Componentes; Variantes | `design`, `variants` |
| Fontes/revisões/Âncoras | manter evidência e proveniência | Curso → Fontes; Unidade → Fontes | `sources` |
| PDFs de Fonte | enviar, consultar e remover vínculo/arquivo quando válido | Fonte → revisão → PDFs | não apagar Fonte ou outro vínculo por acidente |
| Inspeção | ler material real no contexto curricular | Revisar → Inspeção | renderer de Estudo |
| Observações | registrar, considerar, responder e resolver | Revisar → Discussões e correções | `annotations` |
| Auditoria/correções/reversões | verificar e reparar | Revisar → Auditoria | `audits` |
| Variantes | criar/comparar/desvincular e manter Cursos variantes | Pesquisa → Variantes | `variants`; Curso variante segue ciclo normal de Curso |
| Analytics | explorar fatos e métricas | Pesquisa → Analytics e fatos | sete datasets; gráfico+tabela+definição+fatos+exportação |
| concessão/revogação de acesso | administrar quem estuda diretamente | Pessoas | `activity` |
| MCP / conversa conectada | agir no objeto corrente sem copiar contexto | ação ChatGPT contextual | canal `authoring_chat` |
| GPT personalizado com Actions | operar o AraLearn a partir de um GPT personalizado por chamadas HTTP autorizadas | integração Actions/OpenAPI do GPT personalizado | capacidade distinta de MCP; não presumir substituição entre canais |
| dados locais | remover réplica do dispositivo sem apagar Curso remoto | Conta / ações locais | alcance explícito |
| exclusão da conta | encerrar a própria conta e seus dados conforme contrato final | Conta | ação destrutiva confirmada |
| retenção corrente | executar/verificar manutenção automática do modelo final | Conta → Manutenção, apenas administrador | reutilizar retenção corrente |
| inventário de resíduos correntes | saber se há objetos/vínculos quebrados | Conta → Manutenção, apenas administrador | classificação determinística do backend |
| correção de resíduo seguro | remover/reparar resíduo reconhecido sem SQL/Storage manual | Conta → Manutenção → detalhe/ação | autorização server-side e releitura do estado |

## Regras de cobertura

`←` retorna à tela imediatamente anterior. `↑`, quando existir, sobe somente a hierarquia didática. A Unidade mantém `Visualizar / Editar / Assistência por API` como modos irmãos.

A superfície **Manutenção** é secundária e restrita ao papel administrativo. Ela não é um cliente de banco de dados: expõe somente problemas que o AraLearn sabe classificar e ações de produto correspondentes.

MCP e GPT personalizado com Actions são canais distintos. Um não substitui o outro apenas porque ambos permitem operar o AraLearn a partir de uma conversa. Cada canal preservado deve usar os contratos correntes, autorização adequada e retorno compreensível ao produto.

A matriz não autoriza telemetria nova, arquitetura genérica nem backend especulativo. Pequenas mudanças verticais são permitidas pelo gate #174 quando necessárias para realizar um comportamento já definido.

`research_condition` e Variantes não criam experimento causal com estudantes. Grupos/coortes, regra de atribuição, exposição, instrumentos/outcomes e plano de análise permanecem futuros.