# Autoria contextual: responsabilidades, controles e estados

Este contrato orienta a evolução de Autoria e Estudo no programa [#354](https://github.com/fabio-ara/AraLearn/issues/354), começando pela [#355](https://github.com/fabio-ara/AraLearn/issues/355). O levantamento de implementação abaixo usa o commit `32468f308950c14caf3b2608fef20cc3ac06f00e`, catálogo de parâmetros `1.2.1` e catálogo humano de autoria `3.0.0`. “Base observada” significa inspeção do código; não significa prova visual, conversa natural ou validação do serviço hospedado. “Contrato de destino” identifica comportamento a implementar e verificar nas etapas seguintes.

## Conceitos e responsabilidades

| Conceito | Responsabilidade operacional |
| --- | --- |
| Microssequência didática | Delimita objetivo e progressão, considerando público, repertório, escopo e dependências. |
| Base explicativa da microssequência — **Explicação** na interface | Desenvolve conteúdo intelectual e documental: pressupostos, conceitos, relações, mecanismos, exemplos, limites e fontes suficientes ao objetivo. Pode ser produzida antes das unidades. No Estudo, também serve de apoio sob demanda. |
| Desenho instrucional | Expressa a intenção sobre como apresentar e mobilizar conhecimento: evidência esperada, análise instrucional, componentes, prática e organização da experiência. |
| Unidade de estudo | Realiza um episódio instrucional de exposição, exemplo, contraste, prática ou integração, com função delimitada. Sua extensão acompanha essa função. |
| Unidade de análise instrucional | Identifica um conceito, relação, condição, procedimento ou operação semanticamente relevante, acompanhado no desenho. É um recorte operacional do curso, distinto da unidade de estudo, componente, palavra e unidade estatística de um estudo empírico. |
| Configuração corrente | Intenção vigente, resolvida com o escopo, o modo e a origem de cada decisão. |
| Configuração aplicada | Registro das decisões que orientaram a materialização de um conteúdo específico, com origem e motivo. |
| Revisão autoral | Declaração da pessoa de que inspecionou a base salva do objeto. É reversível e pode ficar desatualizada após mudança material. |

A hierarquia continua curso → módulo → lição → microssequência → unidade. Partes e lotes coordenam trabalho. A Explicação pertence à microssequência e não acrescenta um nível curricular. Uma unidade pode ter fonte própria para um caso, conjunto de dados, figura ou trecho documental; a apresentação reunida das referências preserva o objeto sustentado por cada vínculo.

Essas definições são decisões operacionais do produto. Contagens e declarações de aplicação não demonstram aprendizagem, carga cognitiva, domínio ou qualidade. A fundamentação, seu escopo de uso e os limites de inferência são tratados no [modelo didático](modelo-didatico.md), no [glossário de construtos](glossario-construtos.md) e na [fundamentação dos recursos](fundamentacao-pedagogica-dos-resources.md). O código confirma propriedades técnicas; a inspeção autoral declara uma ação da pessoa; eficácia pedagógica exige evidência empírica própria.

## Mapa curricular salvo por recortes

O mapa canônico pode ser construído como rascunho antes de estar completo. Público ainda vazio, listas de escopo, módulos, lições ou microssequências vazias, escopo sem cobertura e dependências ainda inexistentes ou posteriores permanecem salvos como pendências. Títulos e objetivos de ramos, formato do plano da Explicação, identidades, posições, tipos e limites continuam obrigatórios. Referências de escopo apontam para itens existentes; sua cobertura pode ser completada depois.

A aprovação exige público e escopo definidos, ao menos um módulo, uma lição em cada módulo e uma microssequência em cada lição. Todo item de escopo precisa estar coberto, e cada dependência precisa apontar para uma microssequência anterior no percurso global. A decisão corresponde ao mapa salvo e inspecionável corrente. Persistir um recorte volta o mapa para rascunho; não declara revisão do conteúdo nem altera acesso ao curso.

Renomear, reordenar e atualizar objetivos, dependências ou outras intenções do mapa preserva as identidades, a Explicação, as unidades e suas configurações aplicadas. Campos fora do recorte são conservados, inclusive detalhes dos guias, verificações e erros previstos. Um ramo com unidades, Explicação salva ou vínculo de fonte não pode ser removido nem transferido para outro pai por omissão no mapa. Itens de escopo com fontes também são protegidos contra remoção. Ramos ainda vazios podem ser retirados pelo planejamento.

A persistência usa o writer curricular existente, com verificação de proprietário, versões do curso/plano e recibo protegido pelo lock da tentativa. Repetir a mesma identidade recupera o resultado confirmado; outra escrita com versão antiga exige releitura. O teste focal `course-curricular-map-drafts-pglite.test.js` executa a migration e esses contratos SQL em relações locais, incluindo as chaves estrangeiras e a ordem diferível. A sessão é simulada; essa evidência não substitui a integração hospedada ou a interação visual.

## Base observada: parâmetros, origem e persistência

A fonte das doze definições é [courseDesignParameters.js](../src/domain/courseDesignParameters.js). UI, schemas humanos e projeção SQL já consomem esse catálogo. A resolução de intenção é feita no servidor e projetada por [courseDesignContext.js](../src/domain/courseDesignContext.js).

Os escopos **C, L, M e U** da tabela significam curso, lição, microssequência didática e unidade de estudo. **M não significa módulo**. Nenhum dos doze parâmetros aceita módulo. A navegabilidade de um objeto não amplia os `supportedScopes` da decisão.

| Campo humano do catálogo | Natureza / efeito observável | Escopos | Valores admitidos / referência do catálogo |
| --- | --- | --- | --- |
| `maximo_ideias_novas_por_unidade` | Teto de identidades de análise introduzidas na unidade expositiva/mista; não mede dificuldade. | C, L, M, U | Inteiro 1–64; referência 2. |
| `formas_de_explicacao` | Formas declaradas por identidade introduzida, com motivo para não aplicabilidade. | C, L, M, U | Conjunto de definição, exemplo concreto, mecanismo, contraste, condição de aplicação, limite/exceção, exemplo resolvido e relação entre representações. Referência: primeiras quatro. |
| `oportunidades_distintas_por_requisito` | Oportunidades semanticamente distintas por requisito de evidência. | C, L, M, U | Inteiro 1–64; referência 2. |
| `dimensoes_de_variacao_da_pratica` | Variação de caso/dados, contexto, tarefa, representação ou apoio, preservando a operação pertinente. | C, L, M, U | Conjunto não vazio dessas cinco dimensões; referência caso/dados. |
| `alvo_palavras_conversa` | Extensão flexível das respostas na conversa autoral. | C, L, M, U | Inteiro 20–500; referência 120. |
| `alvo_palavras_unidade` | Extensão editorial flexível da unidade, depois de satisfeita sua função. | C, L, M, U | Inteiro 40–1.000; referência 180. |
| `distribuicao_da_pratica` | Organização de práticas intercaladas ou agrupadas. | C, L, M, U | `interleaved`, `clustered`; referência `interleaved`. |
| `posicao_da_pratica` | Prática antes, depois ou antes e depois da explicação pertinente. | C, L, M, U | `before_explanation`, `after_explanation`, `before_and_after`; referência `after_explanation`. |
| `alvo_microssequencias_por_parte` | Quantas microssequências existentes uma parte pretende reunir. | C | Inteiro 1–64; referência 1. |
| `alvo_partes_por_lote` | Quantas partes preparar no lote autorizado. | C | Inteiro 1–64; referência 1. |
| `frequencia_de_pausa` | Pausa por microssequência, parte, lote ou solicitação. | C | `each_microsequence`, `each_part`, `each_batch`, `on_request`; referência `each_part`. |
| `preferencia_da_conversa` | Forma de discutir a decisão corrente. | C, L, M, U | `concise`, `debate`, `explanation`; referência `concise`. |

Os valores de referência têm status de hipótese de produto. **Não são o valor efetivo automático de um curso sem atribuição.** Nessa ausência, o servidor devolve modo `automatic`, valor `null` e origem `system_default`: uma escolha contextual ainda precisa ocorrer antes da produção.

Cada parâmetro pertence a uma atribuição do curso, identificada por parâmetro e escopo em `private.course_design_parameter_assignments`, modificável pelo proprietário. O resultado contém atribuição local, atribuição efetiva e conflitos. A resolução vigente prioriza condição de pesquisa, depois modo fixo, depois maior profundidade no caminho. Portanto, uma delegação automática na unidade não anula silenciosamente uma decisão fixa ancestral. Mudanças que introduzem conflito com condição de pesquisa são recusadas. A implementação está na [migração de preferências e perfis](../supabase/migrations/20260905080544_scoped_authoring_preferences_and_profiles.sql).

O painel [CourseDesignPanel](../src/ui/CourseDesignPanel.js) apresenta valor, origem, alcance, justificativa, limites e, na unidade, configuração aplicada. O comando `clear_parameter` retira a atribuição local para restaurar a resolução herdada; `delegate_parameter` pede escolha contextual. Salvar intenção altera a orientação para a próxima produção ou revisão solicitada. O conteúdo salvo e seu registro aplicado só mudam mediante uma operação de conteúdo pertinente.

O registro expresso das aplicações de unidades existentes descreve o conteúdo
realizado e conserva os requisitos planejados, inclusive prática futura ainda
ausente ou incompleta. Aplicar configuração e calibração a essas unidades pode
acompanhar essa declaração fiel, preservando texto, fontes e revisão. A lacuna
entre prática planejada e aplicada permanece visível; materializar um lote
completo continua exigindo a cobertura prevista.

O equivalente humano atual é `consultar_configuracao` / `ajustar_configuracao`, com seleção de curso, microssequência ou unidade. Embora o domínio aceite lição para nove parâmetros, o schema humano atual não a oferece. A expansão dos canais precisa preservar as definições e os escopos de cada decisão, incluindo essa lacuna.

## Base observada: controles além do catálogo

Cada linha informa dono, origem/persistência, acesso e efeito. “Sem operação humana” indica ausência no catálogo tipado de chat da base inspecionada; não implica falta de autorização do proprietário ou ausência de API interna.

| Classe e controle | Dono, origem e persistência | Acesso atual na UI / equivalente humano | Efeito e contrato de destino |
| --- | --- | --- | --- |
| **Conta:** identificador e foto | Pessoa autenticada; `public.person_profiles`, armazenamento de avatar e cache de perfil identificado pela pessoa. | Configurações → perfil/foto. Sem operação humana de autoria. | Muda identificação. Destino: grupo Conta comum a Estudo/Autoria. |
| **Conta:** entrada, criação, saída, exclusão | Pessoa/sessão; Auth e ciclo de conta vigente. | Configurações e entrada de visitante. Sem operação humana de autoria. | Muda identidade ou exclui conta conforme ação escolhida. Não confundir exclusão com remoção de dados locais. |
| **Aparência:** sistema/claro/escuro | Dispositivo; `localStorage` em `aralearn.ui.theme`; sistema resolve a preferência do dispositivo. | Rodapé de Configurações da conta/visitante. Sem operação de autoria. | Muda aparência. Destino: grupo Aparência comum. |
| **Sincronização:** automática/manual | Dispositivo; `aralearn.ui.study-synchronization`. | Configurações → Sincronização; nuvem. Sem operação de autoria. | Governa sincronização do Estudo. Edições salvas em Autoria são enviadas nos dois modos. |
| **Dados locais:** acrescentar progresso visitante | Pessoa ativa/dispositivo; prévia vinculada ao snapshot e à identidade de destino. | Sincronização → Progresso sem conta. Sem operação de autoria. | Acrescenta progresso e Rever dos cursos escolhidos; conserva estado visitante, progresso existente e posição da conta. |
| **Dados locais:** remover dados / sair e remover | Dispositivo; stores e caches do fluxo de limpeza vigente. | Dados e conta. Sem operação de autoria. | Limpeza local no alcance confirmado. Destino: Sincronização/dados deste dispositivo. |
| **Manutenção:** inventário, retenção e resíduo | Papel autorizado; serviço verifica permissão e revalida item. | Configurações → Manutenção quando autorizada. Sem operação humana de autoria. | Mantém ciclo de dados; permanece restrita ao papel autorizado. |
| **Preferências:** perfis salvos | Pessoa; `private.authoring_profiles`. Aplicação copia parâmetros para curso com origem autoral. | Parâmetros → Perfis; `consultar_perfis`, `salvar_perfil`, `excluir_perfil`, `prever_aplicacao_perfil`, `aplicar_perfil`. | Cópia explícita com prévia e exceções. Editar ou excluir perfil não propaga mudanças para curso. |
| **Preferências:** defaults pessoais, foco e pontos de revisão | Não há representação independente desses três elementos na base inspecionada. Cadência e diálogo residem nas atribuições de curso/perfis acima. | Faltam grupo pessoal e operações tipadas próprias. | Destino: padrões pessoais de processo resolvidos com mandato/exceções visíveis, sem mudar currículo ou condição de pesquisa retroativamente. |
| **Curso/ramo:** título, objetivo, público, requisitos, cobertura e dependências | Proprietário; `public.courses`, `private.course_entities` e plano instrucional. Mapa tem estado próprio de aprovação. | Planejamento → mapa/contexto; `consultar_planejamento`, `salvar_mapa_curricular`. | Muda planejamento. Aprovar mapa não aprova conteúdo futuro. Destino: decisão junto ao nó e aprovação por referência ao mapa salvo inspecionado. |
| **Curso:** partes/lotes, intenção e progressão | Proprietário; `course_authoring_parts` e vínculos com microssequências. | Planejamento → partes; `salvar_parte`. | Divide, reúne e reordena trabalho preservando currículo. Destino mantém foco, cadência e revisão independentes. |
| **Curso/ramo/unidade:** direção editorial | Proprietário; `course_authoring_guidance_assignments`. Pilha cumulativa de curso, módulo, lição, microssequência e unidade, com origem/motivo. | Parâmetros → Leitura e estilo; `ajustar_configuracao.direcaoEditorial` só seleciona curso/microssequência/unidade. | Orienta produção futura; não reescreve. Destino: minipainel no objeto e seleção dos alcances válidos nos canais. |
| **Curso/ramo/unidade:** política de componentes | Proprietário; `course_component_policy_assignments`, referências `package@version`. Autor/pesquisa precedem automático; depois vale maior profundidade. | Parâmetros → Recursos. `consultar_componentes` lê catálogo; não há escrita de política no schema humano. | Regula disponíveis/excluídos/preferidos para produção futura. Aceita módulo, diferentemente dos doze parâmetros. |
| **Explicação:** propósito, pressupostos, relações e fontes previstas | Microssequência; `content.explanationPlan`, no mapa. | Planejamento e overlay de revisão; mapa curricular no chat. | Define proposta da base. Fontes previstas não equivalem aos vínculos intelectuais do conteúdo produzido. |
| **Explicação:** conteúdo salvo | Microssequência; `content.explanation` em `course_entities`, versão e composição corrente. | Conteúdo → Explicação/revisão; editor e prévia. `materializar_parte` / `aplicar_correcoes.explicacoes`. | Uma instância salva, aberta sem LLM. Materialização atual exige unidades e bases juntas; destino permite produzir/revisar somente a base antes das unidades. |
| **Fontes:** bibliografia, estado, âncoras, vínculos e ocorrências | Proprietário; `course_sources`, âncoras, atribuições e revisões. Vínculo pertence ao objeto sustentado. | Fontes e fontes do objeto; `consultar_fontes`, `manter_fonte`. | Mantém evidência, localização e apresentação. Estado `author_verified` exige declaração explícita; guardar fonte não significa lê-la. |
| **Fontes/mídia:** PDFs e áudio | Proprietário; anexos, mídia e ciclos de upload/remoção. | Fontes → Arquivos; áudio. `incorporar_pdf_como_fonte`, `manter_fonte.retirar`, `guardar_audio`, `consultar_audios`. | Guarda/retira arquivos autorizados; não sintetiza, transcreve ou atribui uso intelectual automaticamente. |
| **Unidade:** título, conteúdo, resposta, feedback e componentes | Proprietário; `course_entities`, composição salva e pendência local de edição. | Card → Editar, campos autorizados/renderer. `materializar_parte` / `aplicar_correcoes`. | Salva intervenção; não marca revisão. Destino conserva geometria ao entrar/sair sem mudar texto. |
| **Unidade:** aplicado, ideias, formas, práticas e cobertura | Unidade e produção; `design_snapshot` e metadados de aplicação declarada. | Inspeção/Parâmetros da unidade; `consultar_configuracao`, preparação e `materializar_parte.unidades[].configuracao` / `aplicacaoPedagogica`. | Documenta a produção; não certifica adequação. Destino mantém aplicado e corrente distinguíveis no minipainel. |
| **Observação:** texto, categoria e estado | Autor da observação; anotações ancoradas, eventos e recibos. | Card/Observações; `registrar_observacao`, `consultar_observacoes`, `preparar_revisao`. | Anota sem corrigir, aplicar intenção ou declarar revisão. |
| **Revisão autoral:** aprovação atual | Proprietário; `course_entities.content_review` da microssequência, hash agregado de base/unidades/fontes. | Overlay de revisão; RPC exige sessão do aplicativo do proprietário e não aceita OAuth externo. Sem ação humana tipada de revisão. | Hoje aprova conjunto. Destino: marca reversível por base/unidade, declarada pela pessoa, com pendências agregadas sem aprovação automática. |
| **Rever pessoal** | Estudante/visitante, por identidade; progresso local e sincronizado. | Ação Rever no Estudo. Sem operação de autoria. | Marca retorno pessoal; não modifica conteúdo nem revisão autoral. |
| **Acesso:** privado/público | Proprietário; `courses.visibility`, padrão privado, alteração confirmada. | Pessoas/acesso; sem operação humana tipada atual. | Publicidade explícita. Hoje revisão ainda filtra conteúdo para não proprietário; destino admite completo salvo não revisado e política expressa opcional “somente revisado”. |
| **Acesso:** pessoa e direito de cópia | Proprietário; `public.course_access`. | Pessoas; sem operação humana de concessão/revogação. `copiar_curso` usa o direito existente. | Concede leitura/cópia, preservando modificação global exclusiva do proprietário. |
| **Acesso a arquivos:** curso/fonte/anexo | Proprietário; `public_file_access` nesses três níveis. Anexo explícito precede fonte explícita e curso; exceção pode herdar. | Acesso do curso e detalhe de arquivo; sem operação humana tipada atual. | Direito de arquivo independente da bibliografia, revisão e visibilidade. Destino web/PDF depende da permissão efetiva. |

Referências de implementação: [Configurações da aplicação](../public/main.js), [Configurações do dispositivo](../src/ui/StudyDeviceSettings.js), [painel de fontes](../src/ui/CourseSourcesPanel.js), [inspeção das unidades](../src/ui/CourseInspectionSequence.js), [revisão atual](../src/ui/CourseMicrosequenceReview.js), [controlador](../src/supabase/CourseController.js) e [catálogo humano](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).

## Contrato de destino: fluxo e preferências independentes

**Foco Conteúdo** trabalha as Explicações e suas fontes por microssequência ou recorte autorizado. Exige objetivo, público/repertório, escopo e dependências suficientes. Pode encerrar o recorte com bases completas salvas e unidades ainda não produzidas. O estado comunica precisamente o que existe.

**Ciclo completo** articula planejamento focal → Explicação → desenho → materialização → revisão no recorte escolhido. Usa as mesmas bases e unidades do Foco Conteúdo; continuar o ciclo aproveita o que já foi salvo. Revisão ocorre conforme os pontos acordados e continua sendo uma declaração por objeto.

**Cadência** define como agrupar o trabalho: microssequência, parte ou lote. Os alvos de tamanho da parte/lote não mudam a quantidade curricular, a função da unidade ou a frequência de pausa. Limites de transporte podem exigir várias chamadas para preservar um recorte coerente; não justificam reduzir conteúdo necessário.

**Pontos de revisão** indicam momentos de inspeção — por exemplo, mapa, base ou unidades — e sua frequência. Defini-los não marca um objeto como revisado, não altera visibilidade e não exige comentário vazio. **Diálogo** define concisão, debate ou explicação e um alvo flexível de extensão da conversa. Conversa curta preserva as decisões substantivas e a suficiência do conteúdo didático.

Os padrões pessoais são acessíveis em Configurações → Preferências de autoria e aos canais que executam o mandato. Cada leitura informa o padrão, a exceção expressa aplicável e o fluxo acordado. Uma alteração pessoal posterior não muda silenciosamente um mandato em andamento; a continuação precisa conciliar a preferência nova com o pedido expresso. Perfis continuam cópias explícitas. Atalhos e presets mostram todos os valores que configuram, permitindo alterar foco, cadência, revisão e diálogo separadamente.

## Contrato de destino: intenção, aplicado, edição e revisão

No detalhe de uma decisão, a UI e os canais mostram rótulo, significado, valor efetivo, origem, alcance e motivo. Havendo conteúdo, mostram também o aplicado naquela produção ou a ausência desse registro. Um exemplo de estado legível é: “Para próximas produções: definição e contraste; fixado nesta microssequência” e “Aplicado nesta unidade: definição e exemplo; escolha contextual da produção anterior”. Os valores são ilustrativos, não prescrições universais.

Uma mudança de intenção afeta a direção futura. Aplicar ao conteúdo existente é outra operação, com recorte e impacto declarados. A configuração aplicada anterior não é reescrita para coincidir com a intenção nova. Proveniência distingue geração, edição manual e aplicação solicitada; texto redigido pelo assistente não recebe autoria humana por causa de um clique posterior.

| Estado/ação | O que afirma | O que precisa permanecer separado |
| --- | --- | --- |
| Rascunho local | Existem alterações pendentes neste dispositivo. | Base salva, revisão e conteúdo acessível a terceiros. |
| Salvar edição | A mudança autorizada foi persistida, com intervenção registrada. | Declaração de revisão. |
| Registrar observação | Existe comentário ancorado ao objeto. | Correção do texto e aplicação da intenção. |
| Marcar revisão | A pessoa declara inspeção da base salva identificada. | Prova de leitura, correção, eficácia e autorização de acesso. |
| Retirar revisão | A declaração foi retirada reversivelmente. | Conteúdo salvo e direitos de leitura/arquivo. |
| Revisão desatualizada | A base materialmente relevante difere daquela inspecionada. | Apagamento da evidência histórica ou aprovação automática do conteúdo novo. |
| Publicar/compartilhar acesso | O proprietário concede acesso expresso ao conteúdo completo salvo. | Edição local, gravação parcial e arquivos sem direito. |

Uma alteração material na base, fonte ou requisito pode exigir reinspeção das unidades relacionadas. O sistema usa vínculos conhecidos e comunica limites da análise de impacto sem alegar compreensão semântica perfeita. Marcar a base não marca as unidades. Diante de edição pendente, a pessoa salva ou descarta antes de marcar revisão. Registros antigos ausentes permanecem ausentes; um registro agregado anterior conserva seu alcance e sua identidade histórica durante a migração.

Na base observada, a função `course_entity_readable_v1` admite, para não proprietários, microssequências/unidades com revisão `unregistered` ou `current` e filtra `draft`/`stale`. Esse acoplamento está na [migração de revisão compartilhada](../supabase/migrations/20260907222912_shared_explanations_human_content_review.sql). O destino troca esse critério universal por completude salva e acesso autorizado, preservando política “somente revisado” apenas quando explicitamente ativada. Migração não torna curso privado público nem inventa revisão.

## Contrato de destino: localização e continuidade da interface

Configurações mantém o mesmo acesso e os grupos Conta, Aparência, Sincronização/dados deste dispositivo e Preferências de autoria em Estudo e Autoria. Manutenção aparece só ao papel autorizado. Decisões curriculares continuam junto ao objeto: curso/ramo no planejamento; base, fontes e análise na microssequência/Explicação; aplicado e revisão na unidade.

O controle abre um minipainel no objeto corrente e conserva objeto, rolagem, foco e rascunho. “Neste objeto” é o alvo inicial; escolher outro alcance admitido mostra seu efeito antes de aplicar. O painel conserva valores e textos legíveis mesmo quando as ações principais usam somente ícones. Cada ação tem nome e estado acessível, área de toque suficiente e ajuda utilizável por teclado/toque.

Na inspeção, **Revisar unidade** fica no menu de detalhes da própria unidade e abre sua revisão individual; fechar devolve o foco ao acionador do menu. A barra mantém acesso à base explicativa. Em larguras estreitas, as ações podem ocupar outra linha, com grupos alinhados ao topo e alvos de 44 px preservados. O editor contextual conserva a disposição móvel do cabeçalho de origem ao entrar, salvar ou cancelar.

A Explicação abre seu conteúdo salvo. Citações sobrescritas levam às referências no fim e permitem retornar à ocorrência. O detalhe oferece fonte web/PDF conforme os direitos. Acesso equivalente ao acervo permanece disponível mesmo quando ainda não existe Explicação. A fileira/cabeçalho de leitura dispensa botão separado de **Fontes** após essa equivalência estar preservada; ações autorais permanecem no contexto de autoria. Fechar fica à direita. Respostas tardias não substituem o painel ativo, o objeto ou uma edição pendente.

## Aceite verificável e divisão das etapas

| Etapa | Resultado verificável e instrumentos existentes |
| --- | --- |
| #356 — estado e escrita | Defaults pessoais e resolução do mandato; base antes das unidades; revisão reversível por objeto; completo salvo/acesso separados. Testes focais de domínio, composição, concorrência/recibos e banco com usuário real autorizado; migração preserva histórico, privado e dados úteis. |
| #361 — Autoria | Controles no objeto, Configurações comum, edição no renderer e preservação de contexto. Testes focais de surface/mapa/inspeção e E2E; interação e inspeção visual no Chrome em dimensões pertinentes. |
| #362 — Estudo | Base salva sob demanda, referência e retorno de citação, identidade visual e direitos de arquivo. E2E de estudo/fontes e inspeção visual com pixels novos. |
| #357 — canais | Mesmo catálogo/casos de uso para preferências, mapa, base, unidades, revisão expressa, estrutura, fontes e acesso. Schema e HTTP são evidências próprias; execução em conversa natural e releitura persistida são provas separadas. |
| #358 — recuperação | Pequenos deltas por referência; aprovação do mapa persistido inspecionado; escrita incerta reconciliada com a mesma identidade. Testes focais de timeout/replay/releitura e cliente real por canal. |
| #359 — aceitação | Jornadas integradas, dois lotes sucessivos em cada canal, matrizes finais, revisão visual e gates de impacto. Pendência externa não recebe resultado aprovado. |
| #360 — entrega | Gate protegido e prova hospedada final, identidade dos artefatos publicados e limpeza restrita a fixtures registradas; preservação de cursos reais. |

Os testes já existentes em `tests/runtime`, `tests/e2e` e `supabase/tests` são o ponto de partida. O coordenador integra modelo, UI e canais; cada arquivo tem um responsável e a suíte ampla segue o gate do projeto. Este documento estabelece contrato e lacunas; não registra execução ou aprovação antecipada dessas provas.
