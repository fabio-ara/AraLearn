# Matriz de rastreabilidade pedagógica

## Finalidade

Rastreabilidade permite reconstruir a relação entre um problema educacional,
uma decisão do produto, sua implementação e a evidência necessária para
avaliá-la. Esta matriz liga o [quadro teórico](quadro-teorico.md), o estado
corrente do AraLearn e o [protocolo de avaliação](protocolo-avaliacao-artefato.md).

A literatura pode mostrar que um problema merece atenção ou que um mecanismo é
plausível. O código pode demonstrar que o mecanismo foi implementado. Uma
afirmação sobre aprendizagem, compreensão ou usabilidade exige dados produzidos
por uma avaliação compatível com essa afirmação.

## Estrutura das proposições

O quadro teórico organiza dez hipóteses de desenho pela relação C-M-R:

- **contexto:** pessoas, tarefa e condições em que o problema ocorre;
- **mecanismo:** propriedade do desenho que pode produzir uma diferença;
- **resultado:** mudança observável que se espera encontrar.

A notação ajuda a formular hipóteses e explicações rivais. Ela não transforma a
implementação numa teoria causal validada.

Na coluna de evidência técnica, um teste demonstra somente o comportamento que
observa. A coluna de evidência empírica descreve a avaliação necessária para
examinar o resultado proposto.

## Matriz das proposições P1 a P10

| Proposição | Decisão do produto | Operacionalização corrente | Evidência técnica adequada | Evidência empírica necessária | Critério de revisão |
| --- | --- | --- | --- | --- | --- |
| P1: retomada local após interrupção | Conteúdo já sincronizado, ponto corrente, estado pessoal e Observações necessárias ficam disponíveis no dispositivo; a interação local não aguarda a rede. | `CourseLocalStore`, `CourseStudyRepository`, `CoursePersonalStateRepository` e `CourseAnnotationRepository` mantêm responsabilidades separadas. A última revisão válida permanece legível durante falha de uma revisão posterior. | Reinício sem rede, restauração do ponto, reconexão, repetição segura, duas abas, identidade correta e conflito entre dispositivos. | Interromper tarefas em intervalos e redes definidos; observar reencontro, erro, tempo, explicação do ponto e capacidade de continuar. | Rever se o ponto não for compreendido, se houver perda de estado ou se uma alternativa mais simples produzir retomada melhor. |
| P2: progressão suficiente sem condensação | O planejamento explicita público, escopo, resultados pretendidos, unidades de análise, requisitos de evidência e orientação antes de definir a quantidade de Unidades de estudo. | `courseAuthoringPlan.js`, `courseDesignParameters.js` e `CourseDesignPanel.js` conservam itens por alvo, origem, herança e valores efetivos. Partes organizam produção sem acrescentar nível à hierarquia didática. | Validação dos contratos, atribuição por Microssequência, herança, remoção de sobrescrita, confronto entre planejado e aplicado e regressões sem limite arbitrário de caracteres. | Julgamento de especialistas e tarefas de explicação e aplicação com público, conhecimento prévio e condições delimitados. | Rever quando as declarações passarem sem correspondência semântica, omitirem pré-requisitos ou produzirem repetição sem ganho de compreensão. |
| P3: representação escolhida pela operação | A intenção representacional antecede a consulta ao catálogo; apenas o contrato do componente escolhido entra na materialização. | `packageRegistry.js` mantém os pacotes, `resourceCatalog.js` busca por facetas e adequação contextual, e navegador e função remota usam o mesmo índice. Política disponível, preferência e uso materializado permanecem fatos distintos. | Paridade do índice, contrato único por consulta, validade do pacote, componente permitido, representação textual acessível, geometria, tema e caso sem representação adequada. | Comparar prosa, representação geral e representação especializada em tarefa equivalente, incluindo interpretação por especialista e por pessoa novata. | Fundir, restringir ou retirar o componente quando sua gramática não for compreendida ou quando a alternativa mais simples preservar melhor a operação. |
| P4: apoio seguido de produção independente | Explicação e exemplo resolvido podem anteceder prática guiada e produção com menos apoio quando a tarefa justificar essa progressão. | O plano registra requisitos de explicação e evidência; os componentes podem apresentar conteúdo, resposta e retorno em posições distintas da mesma Unidade. Dados particulares da tarefa permanecem disponíveis enquanto o apoio é retirado. | Cobertura entre exemplo e prática, permanência dos dados necessários, redução identificável de dicas e execução sem resposta já exposta. | Desempenho imediato e adiado, justificativa dos passos e tarefa de transferência, com controle de conhecimento prévio e dificuldade. | Rever ordem e apoio quando houver imitação sem compreensão, dependência de dicas ou busca improdutiva. |
| P5: prática variada por função | Seleção, lacuna, digitação e ordenação são escolhidas pela operação-alvo e pela evidência pretendida, em vez de alternadas por aparência. | Os pacotes de resposta declaram compatibilidade, validação e avaliação; `CourseStudyApplication.js` mantém estado por alvo e o núcleo insere a resposta no objeto correspondente. | Independência entre alvos, confirmação, limpeza, repetição, resposta localizada, ordenação situada e distinção entre mudança semântica e cosmética. | Comparar reconhecimento, produção, relação e sequenciamento de acordo com o objetivo, incluindo retenção e transferência quando pertinentes. | Retirar práticas artificiais, ambíguas, duplicadas ou que permitam responder por pistas alheias ao conteúdo. |
| P6: retorno acionável de baixa consequência | A pessoa confirma antes da avaliação, recebe informação específica, pode repetir e revela a resposta esperada apenas por ação própria. Erro, ajuda e tempo não viram nota ou classificação. | `CourseStudyApplication.js`, `renderPackageStudyUnit.js` e os pacotes de resposta coordenam confirmação, retorno, nova ação e avanço. | Resposta não revelada antecipadamente, retorno ligado ao alvo, repetição, teclado, toque, persistência local e avanço sem aguardar rede. | Pedir que a pessoa interprete o retorno, revise a resposta e resolva item relacionado; observar conteúdo, oportunidade e ação posterior. | Reescrever quando o retorno apenas rotular, não explicar a distinção ou induzir dependência. |
| P7: correção focal e reversível | A correção atua somente sobre conteúdo e Fontes da Unidade focal, preserva a estrutura e exige comparação, confirmação e nova verificação. | `courseAuditCycle.js`, `courseAuditStudyUnit.js` e `CourseAuditPanel.js` ligam contexto derivado pelo servidor, rodada, achado, proposta, aplicação, verificação e reversão. | Autorização, evidência factual, comparação antes/depois, concorrência, repetição segura, alteração limitada, reversão e reabertura de achado incerto. | Tarefas de correção com erro de escopo, proposta inadequada, reversão e explicação da responsabilidade editorial. | Bloquear e rever quando a alteração alcançar estrutura ou alvo lateral, ou quando a pessoa não compreender o que será modificado. |
| P8: observação situada e ciclo de retorno | Dúvida, possível erro ou sugestão torna-se Observação ligada ao alvo, sem inferência comportamental e sem confusão com achado de auditoria. | `courseAnchoredAnnotations.js`, os repositórios locais, a folha no Estudo e a caixa de entrada na Autoria preservam texto, alvo, revisão, canal, estado e privacidade. | Várias Observações por alvo, leitura privada, envio sem conexão, reconexão sem duplicação, classificação corrigível, resposta, retirada e vínculo opcional com achado. | Registrar, reencontrar, interpretar o retorno e decidir uma ação; examinar casos em que não houve observação e casos que não exigem correção. | Rever se o contexto se perder, se a Observação virar diagnóstico ou se o ciclo não deixar responsabilidade e estado compreensíveis. |
| P9: propriedade do Curso e assistência de IA delimitada | Autoria pertence ao proprietário; acesso direto concede somente Estudo no original. A primeira gravação contextual de quem estuda cria outro Curso privado. A assistência usa operações tipadas, escopo explícito, autorização no servidor e proveniência. | `CourseController`, `CourseApiClient`, as políticas do banco e os servidores MCP e Actions aplicam as mesmas regras a Curso, Fontes, auditoria, variantes e Pesquisa; perfil, Pessoas, ciclo de vida e cópia pessoal permanecem exclusivos da aplicação. | Proprietário, pessoa com acesso e terceiro; concessão e revogação; original inalterado; cópia única por pessoa e origem; chamada direta negada; OAuth; revisão concorrente; saída validada e resultado inspecionável. | Tarefas de compreensão de propriedade, diferença entre original e cópia, alcance da assistência, erro do modelo, revisão e decisão final. | Rever diante de privilégio excessivo, confusão entre acesso e autoria, falsa sensação de controle ou erro persistente aceito sem verificação. |
| P10: dados definidos pela finalidade | Fatos de Autoria são preservados quando respondem a uma pergunta legítima; gráficos, tabelas e exportações mantêm revisão, denominador, ausência e limites. Telemetria de Estudo não é coletada por disponibilidade técnica. | `courseAuthoringAnalytics.js`, `CourseAnalyticsPanel.js` e a consulta PostgreSQL projetam sete conjuntos de fatos com filtros, paginação, CSV, JSON e a mesma vista no MCP. Variantes preservam origem comum e diferenças sem produzir causalidade. | Igualdade entre linhas, contagens, gráfico, tabela e exportação; filtros; dados ausentes; autorização; cursor preso ao recorte; vínculo com objetos; limite de resposta. | Tarefas de interpretação com autores e pesquisadores, incluindo ausência, mudança de revisão, explicações alternativas e decisão legítima. | Retirar ou redefinir medida que induza nota, vigilância, perfil individual, causalidade ou ação sem finalidade e validade suficientes. |

## Capacidades que atravessam as proposições

Algumas capacidades sustentam mais de uma hipótese e por isso não recebem uma
proposição própria.

| Capacidade | Relações principais | O que a implementação permite afirmar | O que permanece fora da evidência |
| --- | --- | --- | --- |
| Fontes, Âncoras e PDFs | P2, P7, P9 e P10 | Origem, revisão, localização, relação declarada, arquivo e aplicação por alvo podem ser reconstruídos sob autorização. | Citação não comprova correção factual, adequação didática ou autoria científica. |
| Sequência curricular em Conteúdo | P1, P3 e P7 | O proprietário percorre uma sequência finita de Unidades com hierarquia, retomada, paginação e o mesmo mecanismo visual de Estudo. | Rolagem, permanência e passagem por uma Unidade não medem atenção ou qualidade da revisão. |
| Partes e materialização | P2, P3, P9 e P10 | Planejamento, produção e retomada podem ser coordenados em grupos operacionais sem alterar a hierarquia curricular. | A faixa preferencial de Partes não é lei pedagógica nem medida de complexidade. |
| Variantes comparáveis | P2, P3 e P10 | Cursos independentes podem partir de planejamento registrado e expor diferenças declaradas, atuais e imprevistas. | Origem comum e reprodução técnica não demonstram comparabilidade de participantes, efeito ou causalidade. |
| Pesquisa sobre a Autoria | P10 | Fatos, filtros, contagens, tabelas, gráficos e exportações podem ser confrontados sob a mesma revisão. | O painel não mede aprendizagem, atenção, esforço, domínio ou qualidade global. |

## Distinções da análise instrucional

As estruturas abaixo tornam decisões revisáveis. O fato de um valor existir no
banco não o transforma em medida validada.

| Distinção | Representação corrente | Interpretação permitida | Interpretação indevida |
| --- | --- | --- | --- |
| unidade de análise instrucional | item do plano atribuído a Microssequências | explicitar o recorte editorial e os pressupostos usados na produção | tratar o item como componente de conhecimento validado ou diagnóstico individual |
| conjunto de coordenação | unidades e relações que devem permanecer disponíveis juntas | auditar relações omitidas ou compressão do conteúdo | chamar a cardinalidade de carga cognitiva medida |
| requisito e forma de explicação | necessidade contextual e realização declarada | confrontar plano, materialização e auditoria | somar categorias como nota de qualidade |
| requisito de evidência | relação entre objetivo, alvo, operação, tarefa e desempenho esperado | localizar prática desalinhada ou evidência ausente | afirmar domínio ou validade psicométrica |
| oportunidade e variação da prática | assinatura semântica de alvo, operação, caso e apoio | separar diversidade funcional de mudança cosmética | premiar quantidade de atividades |
| política e uso de componentes | disponibilidade, preferência, bloqueio e pacote materializado | verificar respeito à política e registrar aproximações | equiparar componente disponível, escolhido e pedagogicamente adequado |
| rodada, achado e correção | estados distintos e ligados por identidade e revisão | reconstruir critério, decisão, alteração e verificação | chamar toda Observação de erro confirmado ou toda correção de melhoria eficaz |
| ponto comum e variante | planejamento registrado, Curso independente e diferenças | produzir comparação descritiva reproduzível | apresentar a comparação como experimento ou inferência causal |
| fato, métrica, medida e indicador | linha preservada, regra de cálculo, valor e interpretação | manter a cadeia entre dado e uso declarado | promover rastro técnico a construto educacional |

## O que cada fonte de evidência autoriza afirmar

| Fonte | Interpretação permitida | Interpretação indevida |
| --- | --- | --- |
| esquema de dados ou contrato | a entrada possui forma e restrições declaradas | o conteúdo é correto, claro ou útil |
| teste unitário | a unidade de software produziu o resultado esperado no caso testado | pessoas compreendem a função |
| teste de integração ou ponta a ponta | componentes concluíram uma jornada definida | a jornada é intuitiva ou pedagogicamente eficaz |
| auditoria visual automatizada | as regras verificadas não encontraram recorte, sobreposição ou contraste insuficiente | a representação foi interpretada corretamente |
| revisão de especialista | conteúdo e convenção atenderam aos critérios no corpus examinado | estudantes aprenderam com o material |
| teste de usabilidade | participantes concluíram tarefas e relataram determinada experiência | houve retenção ou transferência |
| avaliação de aprendizagem | ocorreu diferença nas medidas e condições estudadas | o efeito é universal ou possui o mesmo mecanismo noutro contexto |

O corpus determinístico de DNS e DHCP exercita teto, cobertura, formas,
oportunidades e variação declarados sem usar contagem de caracteres como medida
semântica. Ele não observa compreensão, adequação instrucional ou aprendizagem.

Um resultado empírico precisa registrar população, tarefa, comparação, medida,
procedimento, incerteza e casos adversos. Sem esses elementos, a matriz conserva
a evidência como necessária, não como efeito observado.

## Manutenção

Quando uma decisão relevante muda, a proposição correspondente deve conservar
a relação entre problema, decisão, implementação, teste e avaliação. Um novo
campo ou componente não exige outra hipótese se apenas operacionaliza uma
proposição existente. Uma proposição nova só se justifica quando introduz
contexto, mecanismo ou resultado que as dez atuais não representam.

Resultados contrários orientam revisão do mecanismo, da operacionalização ou da
própria hipótese. Eles não devem ser ocultados por alteração retrospectiva do
critério.

## Documentos relacionados

- O [Modelo didático](modelo-didatico.md) explica progressão, prática e retorno.
- A [Fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md)
  aprofunda as decisões representacionais.
- O [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
  descreve unidades, parâmetros e contratos conceituais.
- O [Glossário de construtos](glossario-construtos.md) distingue termos
  teóricos, resultados e termos operacionais.
- O [Protocolo de avaliação](protocolo-avaliacao-artefato.md) transforma as
  hipóteses em episódios avaliáveis.
- O [Estado corrente](estado-atual-e-roadmap.md) registra a comprovação técnica
  disponível para cada caso de uso.

As referências completas estão em [`referencias.bib`](referencias.bib).
