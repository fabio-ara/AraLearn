# Matriz de rastreabilidade pedagógica

Esta matriz liga problemas educacionais, hipóteses, implementação e avaliação.
`Evidência` não significa prova de eficácia do AraLearn. Quando a literatura não
sustenta diretamente uma decisão do produto, a linha é marcada como hipótese a
ser avaliada.

## Como ler e manter a matriz

Cada linha deve distinguir cinco objetos:

1. **evidência externa**, produzida fora do AraLearn;
2. **hipótese de design**, expressa como contexto–mecanismo–resultado;
3. **decisão ou requisito**, que define o artefato vigente;
4. **evidência técnica**, que demonstra implementação ou conformidade;
5. **evidência empírica**, que poderá sustentar ou enfraquecer a hipótese.

Teste unitário, jornada E2E, screenshot e schema pertencem ao quarto objeto.
Eles não migram para o quinto sem participantes, tarefa, medida e análise
compatíveis. A [Matriz de conformidade técnica](matriz-conformidade-tecnica.md)
faz a auditoria código ↔ documentação; esta matriz preserva a ligação teoria ↔
design ↔ avaliação.

## Matriz do programa de pesquisa

| ID | Contexto e problema | Base externa | Hipótese C–M–O | Decisão/requisito vigente | Evidência técnica | Episódio empírico necessário | Critério de revisão |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | estudo móvel interrompido e conexão variável | Monk et al. (2008); Foroughi et al. (2016); Ahmad Faudzi et al. (2023) | cursor e réplica local podem facilitar localização e continuação | estudo sincronizado disponível offline; estado corrente sem telemetria de atenção | `src/storage/progressStore.js`; `src/sync/RelationalSyncEngine.js`; `study-card-progression.spec.js`; `workspace-offline-authoring.spec.js` | tarefa interrompida com condições de rede e intervalos declarados; sucesso, erro, explicação e entrevista | alterar se o cursor não for compreendido, falhar entre dispositivos ou não superar alternativa |
| P2 | novato recebe teoria condensada ou com premissas ocultas | Sweller et al. (1998); Rey et al. (2019); De Gagne et al. (2019) | progressão com pré-requisitos, exemplos e quantidade variável pode preservar profundidade e coerência | planejamento antecede número de cards; microssequência não tem duração fixa; teoria não é resumo | `src/authoring/pedagogicalBlueprint.js`; `authoring/core/quality.md`; `tests/kernel/pedagogical-authoring.test.js`; `academic-stress-courses.spec.js` | auditoria de especialistas e tarefas de explicação/aplicação com novatos | rejeitar sequência que introduz salto, redundância improdutiva ou perda de profundidade |
| P3 | relação espacial, formal ou notacional se perde em prosa/package genérico | Ainsworth (2006); Mayer (2009); Ginns (2006) | resource canônico escolhido pela operação pode reduzir ambiguidade e tradução mental | package só se justifica por estrutura semântica própria; contrato recuperado depois da seleção | `src/resources/kernel/packageRegistry.js`; `src/resources/catalog/resourceCatalog.js`; `academic-resource-catalog.test.js`; `resource-test-matrix.spec.js` | comparar representação especializada, inadequada e texto para mesma tarefa; incluir caso complexo e especialista do domínio | remover ou fundir package sem ganho demonstrável; revisar catálogo quando seleção for imprevisível |
| P4 | aquisição inicial exige apoio, mas prática precisa alcançar produção independente | Sweller & Cooper (1985); Renkl et al. (2004); Agarwal et al. (2021) | exemplo, fading e operações variadas podem apoiar compreensão, retenção e transferência | práticas escolhidas pelo gesto cognitivo; gaps internos e independentes; respostas não viram exposição | packages de resposta; `package-study-rendering-regressions.test.js`; `table-resource.spec.js` | tarefa imediata e adiada, com problema de transferência e controle do tempo total | revisar se apoio induzir passividade, lacunas forem artificiais ou desempenho não transferir |
| P5 | feedback binário ou punitivo não oferece base para ação | Hattie & Timperley (2007); Carless & Boud (2018); Morris et al. (2021) | feedback específico, repetição e baixa consequência podem apoiar interpretação e ação | Play confirma e avança; resposta correta só é revelada por ação explícita; nenhuma nota/ranking | `src/ui/studyCardProgression.js`; `study-card-progression.test.js`; `study-card-progression.spec.js` | interpretar feedback, justificar revisão e resolver item novo; medida de ameaça/ansiedade somente com instrumento apropriado | alterar quando feedback não informar ação, revelar resposta cedo ou criar dependência |
| P6 | edição/assistência fora do card pode ocultar alvo e misturar estrutura com texto | Carless & Boud (2018); Amershi et al. (2019) como fundamentos indiretos | seleção textual contextual, chat e reversibilidade podem reduzir erro de alvo e ampliar controle | somente rótulos/textos autorizados são editáveis; estrutura é contexto; iteração e versões locais | `src/assist/cardAssistanceScope.js`; `cardAssistanceLedger.js`; `card-assistance-semantics.test.js`; `card-assistance.spec.js` | tarefa de reparo, iteração, rejeição, desfazer/refazer e restauração; rubrica do resultado | bloquear entrega se estrutura surgir como texto, alvo extravasar ou pessoa não compreender reversão |
| P7 | dúvida ou possível erro se perde quando separado do card | Nicol & Macfarlane-Dick (2006); Wood (2021); Nicol & Kushwah (2024) | observação situada e retorno no mesmo contexto podem apoiar diálogo e revisão | manifestação voluntária corrente; resposta e reparo confirmados permanecem distinguíveis | `contextual-observations-render.test.js`; `educational-workspace-comments-api.test.js`; schemas relacionais | registrar, reencontrar, compreender retorno e decidir ação; análise qualitativa de casos negativos | revisar se observação virar diagnóstico, não for reencontrável ou não houver responsabilidade pelo retorno |
| P8 | colaboração exige contexto e permissão sem poder global | Wenger (1998); Bridwell-Mitchell (2016) | papéis locais e revogáveis podem tornar coordenação e responsabilidade compreensíveis | capacidades calculadas por workspace; proveniência; revogação | `educational-workspaces.test.js`; `workspace-postgres-concurrency.test.js`; `ui-course-permissions.test.js` | tarefas com estudante, autor e administrador; entrevista sobre papel, propriedade e consequência | alterar se participantes confundirem acesso, autoria, publicação ou responsabilidade |
| P9 | LLM pode escolher resource inadequado, alterar escopo ou produzir conteúdo válido e ruim | Lewis et al. (2020); Amershi et al. (2019); Buçinca et al. (2021); UNESCO (2023) | catálogo progressivo, contrato especializado, validação e auditoria podem reduzir deriva e retrabalho | lista por intenção/faceta antes do schema; alvo gravável separado do contexto; revisão humana | `authoring/knowledge/packages.md`; `authoring/core/quality.md`; `authoring-mcp.test.js`; `authoring-catalog-search-v5.test.js`; `authoring-instruction-profile.test.js` | tarefas autorais com modelos/tamanhos variados; erros factuais, seleção, retrabalho, confiança e casos de cobertura ausente | revisar prompt, conhecimento, catálogo ou package conforme a causa; nunca promover validação estrutural a qualidade |
| P10 | disponibilidade de logs incentiva proxies de atenção, domínio ou qualidade | Pardo & Siemens (2014); Prinsloo & Slade (2017); Tsai & Martinez-Maldonado (2022) | pergunta e intervenção anteriores à coleta podem tornar analytics mais legítimo e compreensível | não coletar tentativas, tempo e cliques por conveniência; observações explícitas não são diagnóstico | orçamento de Storage; schemas de estado corrente; testes de ausência de telemetria; documentação de privacidade | co-design de pergunta/indicador/intervenção e teste de interpretação com participantes | não implementar indicador sem validade, finalidade, retenção, acesso, custo e ação definidos |

## Cobertura da matriz

As linhas P1–P10 são o nível de programa. As entradas UX, colaboração e estado
de estudo abaixo refinam mecanismos já implementados. Novas linhas devem
referenciar uma proposição do [Quadro teórico](quadro-teorico.md) ou justificar
por que uma nova proposição é necessária. Duplicar uma funcionalidade com novo
nome não amplia evidência.

## Entradas iniciais da renovação do front-end

| ID | Problema e contexto | Evidência ou construto | Hipótese de design | Mecanismo | Interpretação permitida | Interpretação proibida | Avaliação e custo | Rastreabilidade |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | estudante-trabalhador usa celular pequeno em ambiente sujeito a interrupção | carga cognitiva extrínseca; revisão sistemática de UI para mobile learning | menor densidade e hierarquia progressiva reduzem esforço operacional sem retirar funções | base visual neutra, poucos elementos simultâneos, painel progressivo e ações contextuais | passos, erros de operação e percepção podem indicar usabilidade | aparência minimalista não prova aprendizagem nem menor carga cognitiva | teste de jornada, escala subjetiva e entrevista; nenhum dado histórico novo | #60; `docs/auditoria-front-end.md`; testes Playwright |
| UX-02 | a pessoa precisa acompanhar planejamento e conteúdo estudável sem aprender estados técnicos | visibilidade do sistema; learner agency como linha de investigação | mostrar a composição corrente em dois espaços reconhecíveis reduz burocracia sem ocultar o conteúdo | a tela inicial de `Trilhas` reúne planos, materializações estudáveis e seus grupos; `Coleções` reúne cursos oficiais; ações atuam diretamente na árvore corrente | capacidade de localizar e organizar partes pode indicar compreensão do fluxo | abrir o painel ou permanecer nele não indica atenção, domínio ou engajamento | tarefas de localização, edição e organização; projeção paginada e cache leve, sem publicação intermediária | #60, #74; `list_trail_items_v1`; `unified-home-trails.spec.js`; testes PGlite e Playwright |
| COL-01 | a oposição entre espaço pessoal e catálogo não permite colaboração contextual sem privilégio global | participação em comunidades de prática e agência colaborativa; hipótese de governança | papéis locais e revogáveis permitem que uma pessoa participe de contextos diferentes sem universalizar poder | workspace composto com membros, capacidades calculadas no banco, identidade estável de item de `Trilhas` e composição corrente acessível pelo app e pelo MCP | conclusão de tarefas de convite, localização de uma parte e compreensão do papel podem avaliar usabilidade e responsabilidade | papel, presença, abertura, clique, materialização e tempo não provam colaboração, aprendizagem, atenção ou qualidade docente | teste com estudante, autor e administrador em workspaces distintos; isolamento, revogação e entrevista; uma identidade por item, uma linha por membro, convite temporário e recibo de sete dias | #58; `educational_workspace_members`; `educational_workspace_can_v1`; `trailItemId`; `gerirWorkspaceEducacional`; testes PostgreSQL, MCP e Playwright; Wenger (1998); Bridwell-Mitchell (2016) |
| UX-03 | tema único pode ser inadequado ao ambiente, preferência ou necessidade visual | evidência de polaridade é dependente de tarefa, iluminação e pessoa | oferecer claro, escuro e sistema é mais defensável que declarar um modo universal | tokens semânticos, escolha local e contraste verificado nos dois modos | preferência, legibilidade percebida e desempenho na tarefa podem ser comparados por contexto | modo escuro não é automaticamente mais acessível; modo claro não é universalmente superior | testes de leitura e recursos em iluminação variada; poucos bytes locais para a preferência | #60; `docs/sistema-visual.md`; galeria de resources |
| UX-04 | assistência em aba separada retira o estudante do card que motivou a correção | contiguidade e divisão de atenção; a transferência da literatura instrucional para uma ferramenta de revisão continua hipótese do artefato | edição contextual reduz troca de contexto e torna o escopo compreensível | modos situados, seleção por contorno, pedido junto ao conteúdo, validação interna, gravação direta e conversa curta com versões locais; microssequência e lição concedem autoridade somente quando seus filhos estão selecionados | tempo, erros e relato da jornada podem avaliar atrito | uso da IA não prova dificuldade ou aprendizagem; o pedido não amplia o escopo nem publica no catálogo | caminhos textuais, recomposição de card, alguns/todos os cards, uma/todas as microssequências, `no-op`, falhas, concorrência, permissões, desfazer, refazer e restaurar; sem cópia integral do curso | #61; testes de assistência bottom-up, mobile e acessibilidade |
| UX-05 | controles autorais durante estudo podem competir com teoria e prática | coerência, carga extrínseca e acessibilidade; hipótese a validar no AraLearn | separar Ler e Editar preserva foco sem retirar agência | Ler limpo; Editar explícito, operável por teclado e reversível | compreensão dos modos e incidência de ações acidentais podem ser avaliadas | menos controles visíveis não prova menor carga nem melhor aprendizagem | teste comparativo das jornadas; uma entrada local compacta, sem histórico comportamental | #60, #61; `card-assistance-local-state.test.js`; testes mobile e acessibilidade |
| UX-06 | ícones misturados e sem rótulo visível podem ser ambíguos para pessoas leigas | consistência, reconhecimento e acessibilidade | um vocabulário SVG coerente com nomes acessíveis reduz ambiguidade | set único, `currentColor`, `aria-label` e rótulo quando necessário; auditoria impede retorno de glifos e paletas paralelas | reconhecimento de ações e erros de escolha podem indicar clareza | familiaridade do projetista não prova compreensão do usuário | teste por persona, teclado e leitor de tela; auditoria de resíduos; impacto estático pequeno | #60, #75; `auditFrontendResidues.mjs`; testes Playwright |
| UX-07 | dúvidas, possíveis erros e sugestões surgem no contexto do card e podem se perder fora dele | avaliação formativa, autorregulação, feedback literacy, diálogo e agência discente | uma observação curta, categorizada e situada, com retorno específico, pode dar voz à pessoa sem interromper o estudo | uma observação corrente por pessoa, item e card; sync offline; thread leve liga a declaração ao workspace para triagem e correção confirmada | conteúdo qualitativo e retorno podem orientar perguntas, revisão humana e ação posterior | presença, resposta ou ausência não provam dificuldade, compreensão, atenção, domínio, qualidade docente nem autorização automática para corrigir | tarefas de registrar, reencontrar, responder e vincular correção; entrevistas e análise qualitativa; sem cópia do card, histórico de conversa ou agregado comportamental | #62; `trail_observation_threads`; testes de estado pessoal, comentários do workspace, MCP e Playwright; Nicol & Macfarlane-Dick (2006); Shute (2008); Carless & Boud (2018); Wood (2021) |
| LA-01 | interrupções tornam difícil reencontrar o ponto escolhido numa lição | continuidade da atividade; hipótese de usabilidade, não medida de aprendizagem | um cursor corrente reduz o custo de retomada | um documento corrente e compacto por pessoa e `trailItemId`, atualizado por operações de caminho com CAS | reabrir no ponto corrente e avaliar sucesso da tarefa de retomada | cursor ou data não indicam atenção, tempo, esforço, dificuldade, engajamento ou domínio | teste de interrupção e retomada em web/Android e entrevista; nenhum evento de abertura | #63; `estado-de-estudo-nao-punitivo.md`; `mutate_trail_personal_state_v1`; Playwright |
| LA-02 | a pessoa quer separar cards que decidiu revisitar | agência e autorregulação como hipótese a examinar | uma marca pessoal explícita é mais interpretável que inferir dificuldade de erros ou repetição | `reviewMarkedAt` corrente e retomada do alvo exato no curso | a marca significa somente intenção declarada de rever | não significa erro, déficit, risco, prioridade docente, nota ou recomendação automática | tarefa de marcar, reencontrar e retirar; análise qualitativa; uma chave corrente no documento do item | #63; `estado-de-estudo-nao-punitivo.md`; `study-card-progression.spec.js` |
| LA-03 | responsáveis precisam tratar manifestações explícitas sem vigiar comportamento | feedback formativo, feedback literacy e agência discente | observações correntes podem apoiar triagem humana contextual | threads mínimas por observação ligam item, `cardId` estável, estado, resposta e correção; categoria e texto permanecem somente no documento pessoal corrente | quantidade descreve somente a fila atual de textos declarados | não mede qualidade docente, aprendizagem, atenção, presença ou desempenho do grupo | teste de triagem e entrevistas; orçamento de armazenamento por documento corrente e thread mínima | #62, #63; `observacoes-pedagogicas.md`; testes PostgreSQL, MCP e estado pessoal |

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
