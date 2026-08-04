# Matriz de rastreabilidade pedagógica

Esta matriz liga problemas educacionais, hipóteses, implementação e avaliação.
`Evidência` não significa prova de eficácia do AraLearn. Quando a literatura não
sustenta diretamente uma decisão do produto, a linha é marcada como hipótese a
ser avaliada.

## Entradas iniciais da renovação do front-end

| ID | Problema e contexto | Evidência ou construto | Hipótese de design | Mecanismo | Interpretação permitida | Interpretação proibida | Avaliação e custo | Rastreabilidade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | estudante-trabalhador usa celular pequeno em ambiente sujeito a interrupção | carga cognitiva extrínseca; revisão sistemática de UI para mobile learning | menor densidade e hierarquia progressiva reduzem esforço operacional sem retirar funções | base visual neutra, poucos elementos simultâneos, painel progressivo e ações contextuais | passos, erros de operação e percepção podem indicar usabilidade | aparência minimalista não prova aprendizagem nem menor carga cognitiva | teste de jornada, escala subjetiva e entrevista; nenhum dado histórico novo | #60; `docs/auditoria-front-end.md`; testes Playwright |
| UX-02 | a pessoa precisa acompanhar planejamento e conteúdo estudável sem aprender estados técnicos | visibilidade do sistema; learner agency como linha de investigação | mostrar a composição corrente em dois espaços reconhecíveis reduz burocracia sem ocultar o conteúdo | `Trilhas` reúne planos e cursos; `Coleções` reúne cursos oficiais; ações atuam diretamente na árvore corrente | capacidade de localizar e organizar partes pode indicar compreensão do fluxo | abrir o painel ou permanecer nele não indica atenção, domínio ou engajamento | tarefas de localização, edição e organização; projeção paginada e cache leve, sem persistência adicional | #60, #74; `list_trail_items_v1`; `learning-spaces-panel.spec.js`; testes PGlite e Playwright |
| COL-01 | a oposição entre espaço pessoal e catálogo não permite colaboração contextual sem privilégio global | participação em comunidades de prática e agência colaborativa; hipótese de governança | papéis locais e revogáveis permitem que uma pessoa participe de contextos diferentes sem universalizar poder | workspace composto com membros, capacidades calculadas no banco e composição corrente acessível por `Trilhas`; mesmo contrato no MCP | conclusão de tarefas de convite, localização de uma parte e compreensão do papel podem avaliar usabilidade e responsabilidade | papel, presença, abertura, clique, materialização e tempo não provam colaboração, aprendizagem, atenção ou qualidade docente | teste com estudante, autor e administrador em workspaces distintos; isolamento, revogação e entrevista; projeção sem tabela nova, uma linha por membro, convite temporário e recibo de sete dias | #58; `educational_workspace_members`; `educational_workspace_can_v1`; `integrated-trails-v1`; `gerirWorkspaceEducacional`; testes PostgreSQL, MCP e Playwright; Wenger (1998); Bridwell-Mitchell (2016) |
| UX-03 | tema único pode ser inadequado ao ambiente, preferência ou necessidade visual | evidência de polaridade é dependente de tarefa, iluminação e pessoa | oferecer claro, escuro e sistema é mais defensável que declarar um modo universal | tokens semânticos, escolha local e contraste verificado nos dois modos | preferência, legibilidade percebida e desempenho na tarefa podem ser comparados por contexto | modo escuro não é automaticamente mais acessível; modo claro não é universalmente superior | testes de leitura e recursos em iluminação variada; poucos bytes locais para a preferência | #60; `docs/sistema-visual.md`; galeria de resources |
| UX-04 | assistência em aba separada retira o estudante do card que motivou a correção | contiguidade e divisão de atenção; a transferência da literatura instrucional para uma ferramenta de revisão continua hipótese do artefato | edição contextual reduz troca de contexto e torna o escopo compreensível | modo Editar, seleção no card, caixa inferior e sincronização privada por microssequência após aplicação explícita | tempo, erros e relato da jornada podem avaliar atrito | uso da IA não prova dificuldade ou aprendizagem; pedido não autoriza aplicação automática nem publicação no catálogo | um/múltiplos cards, offline, falhas, reversão e troca catalog→private; até doze caminhos sem cópia de card no estado auxiliar | #61; `card-assistance.spec.js`; `contextual-authoring-sync.test.js` |
| UX-05 | controles autorais durante estudo podem competir com teoria e prática | coerência, carga extrínseca e acessibilidade; hipótese a validar no AraLearn | separar Ler e Editar preserva foco sem retirar agência | Ler limpo; Editar explícito, operável por teclado e reversível | compreensão dos modos e incidência de ações acidentais podem ser avaliadas | menos controles visíveis não prova menor carga nem melhor aprendizagem | teste comparativo das jornadas; uma entrada local compacta, sem histórico comportamental | #60, #61; `card-assistance-local-state.test.js`; testes mobile e acessibilidade |
| UX-06 | ícones misturados e sem rótulo visível podem ser ambíguos para pessoas leigas | consistência, reconhecimento e acessibilidade | um vocabulário SVG coerente com nomes acessíveis reduz ambiguidade | set único, `currentColor`, `aria-label` e rótulo quando necessário; auditoria impede retorno de glifos e paletas paralelas | reconhecimento de ações e erros de escolha podem indicar clareza | familiaridade do projetista não prova compreensão do usuário | teste por persona, teclado e leitor de tela; auditoria de resíduos; impacto estático pequeno | #60, #75; `auditFrontendResidues.mjs`; testes Playwright |
| UX-07 | dúvidas, possíveis erros e sugestões surgem no contexto do card e podem se perder fora dele | avaliação formativa, autorregulação, feedback literacy, diálogo e agência discente | uma observação curta, categorizada e situada, com retorno específico, pode dar voz à pessoa sem interromper o estudo | uma observação corrente por pessoa e card; cinco categorias; sync offline; observações autorais anexadas à parte exata em `Trilhas`; correção vinculada somente após mutação confirmada | conteúdo qualitativo e retorno podem orientar perguntas, revisão humana e ação posterior | presença, resposta ou ausência não provam dificuldade, compreensão, atenção, domínio, qualidade docente nem autorização automática para corrigir | tarefas de registrar, reencontrar, responder e vincular correção; entrevistas e análise qualitativa; sem cópia do card, histórico de conversa ou agregado comportamental | #62; `pedagogical-comment.test.js`; `workspace-pedagogical-comments.test.js`; `educational-workspace-comments-api.test.js`; `learning-spaces-panel.spec.js`; Nicol & Macfarlane-Dick (2006); Shute (2008); Carless & Boud (2018); Wood (2021) |
| LA-01 | interrupções tornam difícil reencontrar o ponto escolhido numa lição | continuidade da atividade; hipótese de usabilidade, não medida de aprendizagem | um cursor corrente reduz o custo de retomada | uma linha por pessoa, seleção e lição, sobrescrita; `lastStudyStateAt` indica apenas atualização do estado | reabrir no ponto corrente e avaliar sucesso da tarefa de retomada | cursor ou data não indicam atenção, tempo, esforço, dificuldade, engajamento ou domínio | teste de interrupção e retomada em web/Android e entrevista; nenhum evento de abertura | #63; `estado-de-estudo-nao-punitivo.md`; `apply_non_punitive_study_state_batch_v1`; Playwright |
| LA-02 | a pessoa quer separar cards que decidiu revisitar | agência e autorregulação como hipótese a examinar | uma marca pessoal explícita é mais interpretável que inferir dificuldade de erros ou repetição | `reviewMarkedAt` corrente e retomada do alvo exato no curso | a marca significa somente intenção declarada de rever | não significa erro, déficit, risco, prioridade docente, nota ou recomendação automática | tarefa de marcar, reencontrar e retirar; análise qualitativa; no máximo uma linha corrente por card | #63; `estado-de-estudo-nao-punitivo.md`; `study-card-progression.spec.js` |
| LA-03 | responsáveis precisam tratar manifestações explícitas sem vigiar comportamento | feedback formativo, feedback literacy e agência discente | agregados de observações correntes podem apoiar triagem humana contextual | contagens e filtros por categoria/estado e até vinte cards prioritários calculados na leitura, sem progresso individual ou agregado persistido | quantidade descreve somente a fila corrente de textos declarados | não mede qualidade docente, aprendizagem, atenção, presença ou desempenho do grupo | teste de triagem e entrevistas; orçamento de armazenamento por linha corrente | #62, #63; `observacoes-pedagogicas.md`; `workspace-pedagogical-comments.test.js`; `workspace-comment-aggregates-v1` |

## Fontes verificadas para estas entradas

- Ahmad Faudzi, M., Che Cob, Z., Omar, R., Sharudin, S. A., & Ghazali, M.
  (2023). Investigating the user interface design frameworks of current mobile
  learning applications: A systematic review. *Education Sciences, 13*(1), 94.
  <https://doi.org/10.3390/educsci13010094>
- Piepenbrock, C., Mayr, S., & Buchner, A. (2014). Smaller pupil size and better
  proofreading performance with positive than with negative polarity displays.
  *Ergonomics, 57*(11), 1670–1677.
  <https://doi.org/10.1080/00140139.2014.948496>
- Xie, X., Song, F., Liu, Y., Wang, S., & Yu, D. (2021). Study on the effects of
  display color mode and luminance contrast on visual fatigue. *IEEE Access, 9*,
  35915–35923. <https://doi.org/10.1109/ACCESS.2021.3061770>
- World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines
  (WCAG) 2.2*. <https://www.w3.org/TR/WCAG22/>
- Ginns, P. (2006). Integrating information: A meta-analysis of the spatial
  contiguity and temporal contiguity effects. *Learning and Instruction,
  16*(6), 511–525. <https://doi.org/10.1016/j.learninstruc.2006.10.001>
- Nicol, D. J., & Macfarlane-Dick, D. (2006). Formative assessment and
  self-regulated learning: a model and seven principles of good feedback
  practice. *Studies in Higher Education, 31*(2), 199–218.
  <https://doi.org/10.1080/03075070600572090>
- Carless, D., & Boud, D. (2018). The development of student feedback literacy:
  enabling uptake of feedback. *Assessment & Evaluation in Higher Education,
  43*(8), 1315–1325. <https://doi.org/10.1080/02602938.2018.1463354>
- Nicol, D., & Kushwah, L. (2024). Shifting feedback agency to students by
  having them write their own feedback comments. *Assessment & Evaluation in
  Higher Education, 49*(3), 419–439.
  <https://doi.org/10.1080/02602938.2023.2265080>
- Wenger, E. (1998). *Communities of practice: Learning, meaning, and
  identity*. Cambridge University Press.
  <https://doi.org/10.1017/CBO9780511803932>
- Bridwell-Mitchell, E. N. (2016). Collaborative institutional agency: How
  peer learning in communities of practice enables and inhibits
  micro-institutional change. *Organization Studies, 37*(2), 161–192.
  <https://doi.org/10.1177/0170840615593589>

As fontes de sistemas de design orientam engenharia e acessibilidade, mas não
são tratadas como evidência de aprendizagem. Elas constam em
`docs/sistema-visual.md`.
