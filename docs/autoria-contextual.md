# Autoria contextual: responsabilidades, controles e estados

A autoria contextual reúne cada decisão ao conteúdo a que ela se aplica.
A pessoa pode examinar o objetivo de uma microssequência, suas fontes, a
explicação salva e as unidades correspondentes antes de pedir ou aplicar uma
mudança. A conversa em um assistente externo conectado ao AraLearn trabalha
sobre esses mesmos registros.

A pessoa define a intenção, discute propostas com o assistente e confere o
resultado salvo. A revisão humana permanece uma declaração explícita sobre
cada objeto inspecionado. O [guia da pessoa autora](guia-professor-autor.md)
apresenta esse percurso de uso; as seções abaixo relacionam suas decisões,
controles e regras de persistência.

## Conceitos e responsabilidades

| Conceito | Responsabilidade operacional |
| --- | --- |
| Microssequência didática | Delimita objetivo e progressão, considerando público, repertório, escopo e dependências. |
| Base explicativa da microssequência — **Explicação** na interface | Desenvolve conteúdo intelectual e documental: pressupostos, conceitos, relações, mecanismos, exemplos, limites e fontes suficientes ao objetivo. Pode ser produzida antes das unidades. No Estudo, também serve de apoio sob demanda. |
| Desenho instrucional | Expressa a intenção sobre como apresentar e mobilizar conhecimento: evidência esperada, análise instrucional, componentes, prática e organização da experiência. |
| Unidade de estudo | Realiza um episódio instrucional de exposição, exemplo, contraste, prática ou integração, com função delimitada. Sua extensão acompanha essa função. |
| Unidade de análise instrucional | Identifica um conceito, relação, condição, procedimento ou operação semanticamente relevante, acompanhado no desenho. É um recorte operacional do curso, distinto da unidade de estudo, componente, palavra e unidade estatística de um estudo empírico. |
| Configuração corrente | Intenção vigente, resolvida com o escopo, o modo e a origem de cada decisão. |
| Configuração aplicada | Registro das decisões que orientaram a produção e gravação do conteúdo, operação chamada de materialização, com origem e motivo. |
| Revisão autoral | Declaração da pessoa de que inspecionou a base salva do objeto. É reversível e pode ficar desatualizada após mudança material. |

O curso reúne módulos; cada módulo contém lições, compostas por
microssequências e suas unidades de estudo. Partes e lotes agrupam o trabalho
de produção sem acrescentar um nível ao currículo. A explicação pertence à microssequência e não acrescenta um nível curricular. Uma unidade pode ter fonte própria para um caso, conjunto de dados, figura ou trecho documental; a apresentação reunida das referências preserva o objeto sustentado por cada vínculo.

Esses conceitos cumprem os papéis definidos pelo AraLearn. O
[modelo didático](modelo-didatico.md) desenvolve as relações curriculares; a
[fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md)
explica as decisões de representação. Os registros de produção descrevem o
artefato e as intervenções realizadas. Seus efeitos sobre aprendizagem ou carga
cognitiva dependem de investigação educacional própria.

## Mapa curricular salvo por recortes

O mapa curricular reúne a intenção do curso: público, conteúdos abrangidos,
organização e dependências entre microssequências. Seu salvamento por recortes
permite desenvolver uma parte do planejamento e retomar as demais depois.

No rascunho, podem permanecer pendentes o público, itens de escopo ainda sem
cobertura, ramos vazios e dependências que ainda não apontam para um conteúdo
anterior. Cada ramo criado conserva título, objetivo, identidade e posição;
as referências de escopo apontam para itens existentes. O formato do plano da
explicação e os tipos e limites dos dados também são verificados ao salvar.
Assim, o rascunho admite incompletude pedagógica sem perder a consistência
necessária para retomar sua edição.

A aprovação exige público e escopo definidos, ao menos um módulo, uma lição em cada módulo e uma microssequência em cada lição. Todo item de escopo precisa estar coberto, e cada dependência precisa apontar para uma microssequência anterior no percurso global. A decisão corresponde ao mapa salvo e inspecionável corrente. Persistir um recorte volta o mapa para rascunho; não declara revisão do conteúdo nem altera acesso ao curso.

Renomear, reordenar e atualizar objetivos, dependências ou outras intenções do mapa preserva as identidades, a explicação, as unidades e suas configurações aplicadas. Campos fora do recorte são conservados, inclusive detalhes dos guias, verificações e erros previstos. Um ramo com unidades, explicação salva ou vínculo de fonte não pode ser removido nem transferido para outro pai por omissão no mapa. Itens de escopo com fontes também são protegidos contra remoção. Ramos ainda vazios podem ser retirados pelo planejamento.

A gravação verifica a propriedade e as versões do curso e do plano. Um recibo
associa o resultado à tentativa, permitindo recuperá-lo depois de uma falha de
rede. Bloqueios no banco impedem alterações concorrentes incompatíveis; uma
escrita preparada sobre uma versão antiga exige releitura. O
[contrato de planejamento](planejamento-contextual.md) descreve a aprovação da
versão inspecionada, e a [estrutura por referência](estrutura-curricular-por-referencia.md)
trata da movimentação e remoção expressa de ramos já preenchidos.

O [teste de rascunhos curriculares](../tests/runtime/course-curricular-map-drafts-pglite.test.js)
executa essas regras em um banco local de teste, incluindo os vínculos entre
entidades e a confirmação conjunta das mudanças de ordem.

## Parâmetros, origem e persistência

Os parâmetros permitem tornar explícitas decisões sobre explicação, prática,
extensão e organização do trabalho. Cada escolha tem um **escopo**, o objeto
ao qual se aplica: curso, lição, microssequência ou unidade de estudo. A mesma
definição é usada na interface, nos canais conversacionais e no banco de dados,
para que seu significado não mude ao alternar entre formas de autoria.

O catálogo contém doze parâmetros. Nove admitem os quatro escopos acima; os
três parâmetros de cadência pertencem somente ao curso. Módulos permitem
consulta contextual, mas não recebem atribuições desses parâmetros. A tabela
preserva os nomes dos campos usados nos canais para facilitar sua relação com
os controles e com uma integração.

| Campo do catálogo | Decisão representada | Escopos | Valores admitidos e referência |
| --- | --- | --- | --- |
| `maximo_ideias_novas_por_unidade` | Máximo de unidades de análise instrucional introduzidas numa unidade expositiva ou mista; a contagem não mede dificuldade. | Curso, lição, microssequência, unidade | Inteiro 1–64; referência 2. |
| `formas_de_explicacao` | Formas usadas para explicar cada unidade de análise introduzida, com motivo quando uma forma não se aplica. | Curso, lição, microssequência, unidade | Conjunto de definição, exemplo concreto, mecanismo, contraste, condição de aplicação, limite/exceção, exemplo resolvido e relação entre representações. Referência: primeiras quatro. |
| `oportunidades_distintas_por_requisito` | Quantas oportunidades diferentes de prática devem atender a cada requisito de evidência de aprendizagem. | Curso, lição, microssequência, unidade | Inteiro 1–64; referência 2. |
| `dimensoes_de_variacao_da_pratica` | Variação de caso/dados, contexto, tarefa, representação ou apoio, preservando a operação pertinente. | Curso, lição, microssequência, unidade | Conjunto não vazio dessas cinco dimensões; referência caso/dados. |
| `alvo_palavras_conversa` | Extensão flexível das respostas na conversa autoral. | Curso, lição, microssequência, unidade | Inteiro 20–500; referência 120. |
| `alvo_palavras_unidade` | Extensão editorial flexível da unidade, depois de satisfeita sua função. | Curso, lição, microssequência, unidade | Inteiro 40–1.000; referência 180. |
| `distribuicao_da_pratica` | Organização de práticas intercaladas ou agrupadas. | Curso, lição, microssequência, unidade | `interleaved`, `clustered`; referência `interleaved`. |
| `posicao_da_pratica` | Prática antes, depois ou antes e depois da explicação pertinente. | Curso, lição, microssequência, unidade | `before_explanation`, `after_explanation`, `before_and_after`; referência `after_explanation`. |
| `alvo_microssequencias_por_parte` | Quantas microssequências existentes uma parte pretende reunir. | Curso | Inteiro 1–64; referência 1. |
| `alvo_partes_por_lote` | Quantas partes preparar no lote autorizado. | Curso | Inteiro 1–64; referência 1. |
| `frequencia_de_pausa` | Pausa por microssequência, parte, lote ou solicitação. | Curso | `each_microsequence`, `each_part`, `each_batch`, `on_request`; referência `each_part`. |
| `preferencia_da_conversa` | Forma de discutir a decisão corrente. | Curso, lição, microssequência, unidade | `concise`, `debate`, `explanation`; referência `concise`. |

Os valores de referência são hipóteses de produto, sujeitas à avaliação no
contexto. Quando não há escolha atribuída, o servidor devolve modo `automatic`,
valor `null` e origem `system_default`: a escolha contextual ainda precisa
ocorrer antes da produção. Por exemplo, a referência de duas ideias novas por
unidade não estabelece um limite automático para todos os cursos. O
[modelo didático](modelo-didatico.md) explica a análise e a progressão do
conteúdo que orientam essa decisão.

Cada escolha registrada, chamada de **atribuição**, conserva parâmetro,
escopo, modo, origem e justificativa. A **atribuição local** pertence ao objeto
consultado; a **atribuição efetiva** é a que prevalece depois de considerar as
demais decisões do caminho curricular. Uma condição de pesquisa é uma escolha
registrada para preservar o desenho de uma investigação, como manter uma
forma de prática nas unidades analisadas. A resolução prioriza essas condições,
depois valores fixos e, entre decisões da mesma prioridade, o escopo
mais próximo do objeto. Assim, uma escolha automática na unidade preserva um
valor fixado na lição. Uma mudança incompatível com uma condição de pesquisa é
recusada.

Essa regra permite inspecionar tanto a decisão aplicável quanto sua origem.
O [catálogo de parâmetros](../src/domain/courseDesignParameters.js) especifica
definições e escopos admitidos; o
[contrato de resolução](../src/domain/courseDesignContext.js) organiza a leitura,
e as [regras do banco](../supabase/migrations/20260905080544_scoped_authoring_preferences_and_profiles.sql)
aplicam a prioridade entre atribuições.

O [painel de parâmetros](../src/ui/CourseDesignPanel.js) apresenta valor, origem, alcance, justificativa, limites e, na unidade, configuração aplicada. Retirar a atribuição local restaura a resolução das demais decisões do caminho (`clear_parameter`); delegar o parâmetro pede uma escolha contextual (`delegate_parameter`). Salvar intenção altera a orientação para a próxima produção ou revisão solicitada. O conteúdo salvo e seu registro aplicado só mudam mediante uma operação de conteúdo pertinente.

O registro expresso das aplicações de unidades existentes descreve o conteúdo
realizado e conserva os requisitos planejados, inclusive prática futura ainda
ausente ou incompleta. Aplicar configuração e calibração a essas unidades pode
acompanhar essa declaração fiel, preservando texto, fontes e a declaração
anterior de revisão. Se o desenho aplicado mudar materialmente, essa
declaração pode ficar desatualizada. A lacuna
entre prática planejada e aplicada permanece visível; materializar um lote
completo continua exigindo a cobertura prevista.

Na conversa conectada, `consultar_configuracao` e `ajustar_configuracao` permitem inspecionar e alterar essas escolhas com seleção de curso, módulo, lição, microssequência ou unidade. Selecionar
um módulo permite consultar seu contexto; isso não amplia os escopos admitidos
pelos doze parâmetros. Direção editorial e política de componentes têm regras
próprias de alcance.

## Controles além do catálogo

Os controles abaixo mostram quem decide, onde a decisão fica guardada e como
pode ser consultada ou alterada. As operações conversacionais pertencem ao
[catálogo de tarefas](autoria-mcp.md#tarefas-disponíveis); algumas ações de conta
e dispositivo são exclusivas da interface.

| Controle | Responsabilidade e persistência | Acesso e efeito |
| --- | --- | --- |
| Conta: identificador e foto | Pessoa autenticada; perfil da conta e armazenamento privado da imagem. | **Configurações → Conta**. Altera a identificação, mantendo propriedade e concessões. |
| Conta: entrada, criação, saída e exclusão | Pessoa e sessão; serviço de autenticação e ciclo de exclusão da conta. | **Conta** e tela de acesso. Excluir a conta é diferente de remover dados do dispositivo. |
| Aparência | Dispositivo; preferência local de tema. | **Configurações → Aparência**. Escolhe sistema, claro ou escuro. |
| Sincronização | Dispositivo; modo automático ou manual. | **Sincronização e dados deste dispositivo** e nuvem. Controla a troca de dados de estudo; salvamentos autorais continuam explícitos nos dois modos. |
| Progresso sem conta | Dispositivo e conta de destino identificada na prévia. | **Progresso sem conta**. Acrescenta conclusões e marcas Rever dos cursos escolhidos, conservando o estado de visitante e a posição já existente na conta. |
| Remoção de dados locais | Pessoa no dispositivo; cópia local da identidade indicada. | **Remover dados deste dispositivo** ou **Sair e remover dados deste dispositivo**. Confirma o alcance antes da limpeza. |
| Manutenção | Papel administrativo autorizado, verificado pelo serviço. | **Configurações → Manutenção**, quando autorizado. Consulta e mantém o ciclo de dados. |
| Preferências pessoais de processo | Pessoa; preferências salvas na conta. | **Preferências de autoria**; `consultar_preferencias_autoria` e `salvar_preferencias_autoria`. Separa foco, cadência, revisão e diálogo. |
| Perfis de autoria | Pessoa; conjunto de escolhas salvo na conta. | **Perfis de autoria** e tarefas de consultar, salvar, excluir, prever e aplicar perfil. A aplicação copia escolhas para um curso; edições posteriores do perfil não se propagam. |
| Curso e mapa curricular | Proprietário; curso, entidades curriculares e plano. | **Planejamento**; `salvar_mapa_curricular`, `salvar_ramo_curricular` e comandos estruturais. Aprovação se refere ao mapa salvo inspecionado. |
| Partes e lotes | Proprietário; partes autorais e vínculos com microssequências. | **Lotes de produção** e `salvar_parte`. Dividem, reúnem e ordenam o trabalho, preservando a hierarquia curricular. |
| Direção editorial | Proprietário; orientações cumulativas de curso, módulo, lição, microssequência e unidade. | **Parâmetros → Leitura e estilo**; `ajustar_orientacao`. Orienta a próxima produção ou revisão solicitada. |
| Política de componentes | Proprietário; escolhas por objeto, com origem autoral ou de pesquisa. | **Parâmetros → Recursos**; `ajustar_componentes`. Define componentes disponíveis, excluídos ou preferidos; admite módulo. |
| Plano da explicação | Microssequência; `content.explanationPlan`. | **Explicação prevista** no planejamento e mapa curricular no chat. Registra propósito, pressupostos, relações e fontes previstas. |
| Explicação salva | Microssequência; `content.explanation`. | **Explicação**, edição e prévia; `salvar_explicacoes` e `aplicar_correcoes.explicacoes`. Pode ser produzida antes das unidades e com mapa em rascunho. Abrir lê o conteúdo salvo. |
| Fontes e vínculos | Proprietário; catálogo, âncoras, atribuições e versões. | **Fontes**, referências do objeto, `consultar_fontes` e `manter_fonte`. Conferência bibliográfica exige declaração humana própria; cadastrar não declara leitura. |
| PDFs e áudio | Proprietário; anexos, mídia e ciclos de incorporação e remoção. | **Fontes → Arquivos**, **Áudio** e tarefas de incorporar, consultar ou retirar arquivos. Guardar não atribui automaticamente uso intelectual ao conteúdo. |
| Unidade salva | Proprietário; conteúdo, composição e versão da unidade. | **Editar** no conteúdo; `materializar_parte` e `aplicar_correcoes`. Registra a alteração sem declarar revisão humana. |
| Desenho aplicado | Produção da unidade; configuração e declarações do que foi realizado. | Inspeção e **Parâmetros**; consultas e comandos de desenho. Conserva ideias, formas explicativas, práticas e cobertura declaradas, separadamente da intenção atual. |
| Observação | Autor da entrada; anotação ligada ao alvo, versões e recibos. | **Observações**; `registrar_observacao`, `editar_observacao`, `consultar_observacoes` e revisão. Anotar não altera o conteúdo; uma correção confirmada trata somente as versões vinculadas. |
| Revisão autoral | Proprietário; metadado protegido de cada explicação ou unidade. | Revisão do objeto; `declarar_revisao`. Registra ou retira uma declaração expressa de inspeção, independente de salvar ou corrigir. |
| Rever pessoal | Estudante ou visitante; estado pessoal local e, com conta, sincronizado. | **Marcar para rever** em Estudo. Forma a lista pessoal de retorno. |
| Visibilidade e política de revisão | Proprietário; regras do curso. | **Pessoas e acesso**; `consultar_acesso`, `definir_visibilidade` e `definir_politica_revisao`. Padrão de conteúdo completo salvo ou opção expressa de somente revisado. |
| Concessão individual e cópia | Proprietário; concessões por pessoa. | **Pessoas**, `alterar_acesso` e `copiar_curso`. Leitura, direito de cópia e edição são distintos; a edição global permanece com o proprietário. |
| Acesso a arquivos | Proprietário; política de curso, fonte e anexo. | Acesso do curso e detalhe do arquivo; `definir_acesso_arquivos` altera o padrão da fonte. Exceção do arquivo precede a fonte, que precede o curso. |

O [guia de configurações](configuracoes.md) desenvolve os controles de conta e
dispositivo. As [fontes e citações](fontes-e-citacoes.md) e a
[revisão humana por objeto](explicacao-e-revisao-humana.md) explicam a inspeção
do conteúdo. Para relacionar essas ações à implementação, o
[catálogo comum de tarefas](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js)
reúne as operações disponíveis nos dois canais conversacionais.

## Fluxo e preferências independentes

O foco **Conteúdo** trabalha as explicações e suas fontes por microssequência ou recorte autorizado. Exige objetivo, público/repertório, escopo e dependências suficientes. Pode encerrar o recorte com bases completas salvas e unidades ainda não produzidas. O estado comunica precisamente o que existe.

O foco **Ciclo completo** desenvolve o planejamento, a explicação e o desenho; depois produz as unidades e permite sua revisão no recorte escolhido. Usa as mesmas bases e unidades do foco **Conteúdo**; continuar o ciclo aproveita o que já foi salvo. Revisão ocorre conforme os pontos acordados e continua sendo uma declaração por objeto.

**Cadência** define como agrupar o trabalho: microssequência, parte ou lote. Os alvos de tamanho da parte/lote não mudam a quantidade curricular, a função da unidade ou a frequência de pausa. Limites de transporte podem exigir várias chamadas para preservar um recorte coerente; não justificam reduzir conteúdo necessário.

**Pontos de revisão** indicam o que inspecionar ao longo do trabalho: mapa,
base ou unidades. A frequência de pausa tem um parâmetro próprio. Defini-los não marca um objeto como revisado, não altera visibilidade e não exige comentário vazio. **Diálogo** define concisão, debate ou explicação e um alvo flexível de extensão da conversa. Conversa curta preserva as decisões substantivas e a suficiência do conteúdo didático.

Os padrões pessoais são acessíveis em **Configurações → Preferências de autoria** e nos canais conectados. O acordo de um trabalho em andamento conserva uma cópia dessas escolhas, chamada de mandato. Cada leitura informa o padrão, a exceção expressa aplicável e o fluxo acordado. Uma alteração pessoal posterior é informada e conserva o mandato em andamento; incorporá-la ao trabalho depende de uma mudança expressa do acordo. Perfis continuam cópias explícitas. As escolhas de foco, cadência, revisão e diálogo permanecem independentes. A resolução do acordo está em [Parâmetros de autoria](parametros-de-autoria.md#resolução-com-curso-e-mandato).

## Intenção, aplicado, edição e revisão

No detalhe de uma decisão, a interface e os canais mostram rótulo, significado, valor efetivo, origem, alcance e motivo. Havendo conteúdo, mostram também o aplicado naquela produção ou a ausência desse registro. Um exemplo de estado legível é: “Para próximas produções: definição e contraste; fixado nesta microssequência” e “Aplicado nesta unidade: definição e exemplo; escolha contextual da produção anterior”. Os valores são ilustrativos, não prescrições universais.

Uma mudança de intenção afeta a direção futura. Aplicar ao conteúdo existente é outra operação, com recorte e impacto declarados. A configuração aplicada anterior não é reescrita para coincidir com a intenção nova. A proveniência, registro da origem e das intervenções no conteúdo, distingue
geração, edição manual e aplicação solicitada; texto redigido pelo assistente não recebe autoria humana por causa de um clique posterior.

| Estado/ação | O que afirma | O que precisa permanecer separado |
| --- | --- | --- |
| Rascunho local | Existem alterações pendentes neste dispositivo. | Base salva, revisão e conteúdo acessível a terceiros. |
| Salvar edição | A mudança autorizada foi persistida, com intervenção registrada. | Declaração de revisão. |
| Registrar observação | Existe comentário ancorado ao objeto. | Correção do texto e aplicação da intenção. |
| Marcar revisão | A pessoa declara inspeção da base salva identificada. | Prova de leitura, correção, eficácia e autorização de acesso. |
| Retirar revisão | A declaração foi retirada reversivelmente. | Conteúdo salvo e direitos de leitura/arquivo. |
| Revisão desatualizada | A base materialmente relevante difere daquela inspecionada. | Apagamento da evidência histórica ou aprovação automática do conteúdo novo. |
| Publicar/compartilhar acesso | O proprietário concede acesso expresso ao conteúdo completo salvo. | Edição local, gravação parcial e arquivos sem direito. |

Uma alteração material na base, fonte ou requisito pode exigir reinspeção das unidades relacionadas. O sistema usa vínculos conhecidos e comunica limites da análise de impacto sem alegar compreensão semântica perfeita. Marcar a base não marca as unidades. Diante de edição pendente, a pessoa salva ou descarta antes de marcar revisão. Quando um registro de revisão se refere ao conjunto de uma microssequência, ele conserva esse alcance; sua existência não equivale a novas declarações individuais sobre cada objeto.

A leitura combina acesso autorizado com conteúdo completo salvo. A política
`reviewed_only`, quando expressamente ativada, exige também revisão atual do
objeto. As [regras de revisão e acesso no banco](../supabase/migrations/20260909025232_contextual_content_review_access.sql)
implementam essa verificação; a [guia de acesso ao curso](guia-professor-autor.md)
explica a escolha do proprietário e seu efeito para quem estuda.

## Localização e continuidade da interface

Configurações mantém o mesmo acesso e os grupos Conta, Aparência, Sincronização/dados deste dispositivo e Preferências de autoria em Estudo e Autoria. Manutenção aparece só ao papel autorizado. Decisões curriculares continuam junto ao objeto: curso/ramo no planejamento; base, fontes e análise na microssequência/explicação; aplicado e revisão na unidade.

O controle abre um minipainel no objeto corrente e conserva objeto, rolagem, foco e rascunho. “Neste objeto” é o alvo inicial; escolher outro alcance admitido mostra seu efeito antes de aplicar. O painel conserva valores e textos legíveis mesmo quando as ações principais usam somente ícones. Cada ação tem nome e estado acessível, área de toque suficiente e ajuda utilizável por teclado/toque.

Na inspeção, **Revisar unidade** fica no menu de detalhes da própria unidade e abre sua revisão individual; fechar devolve o foco ao acionador do menu. A barra mantém acesso à base explicativa. Em telas estreitas, as ações se reorganizam para preservar a leitura e o uso por toque; o [sistema visual](sistema-visual.md) especifica dimensões e disposição dos controles. O editor contextual conserva a disposição móvel do cabeçalho de origem ao entrar, salvar ou cancelar.

Na visualização de Autoria e Revisão, pergunta, alternativas e retorno explicativo da atividade permanecem acessíveis aos leitores de tela. A alternativa esperada tem identificação textual acessível, e os controles de resposta ficam desativados durante a inspeção. Essa leitura não registra uma resposta de Estudo.

Ao abrir a explicação, a pessoa lê seu conteúdo salvo e pode seguir os números
de citação até as referências no fim, retornando depois ao ponto da leitura.
O detalhe da fonte oferece a página web ou o PDF conforme os direitos de acesso.
As referências ficam reunidas nesse painel, e o acervo também pode ser
consultado quando ainda não existe explicação. O capítulo de
[fontes e citações](fontes-e-citacoes.md) apresenta essa inspeção. O painel
preserva o objeto ativo e a edição pendente diante de respostas tardias do
serviço.

## Verificação e rastreabilidade

As verificações abaixo permitem relacionar decisões autorais, regras de
persistência e comportamento da interface. Cada uma examina uma parte desse
percurso.

| Propriedade | Onde verificar |
| --- | --- |
| Preferências independentes e acordo preservado | [Preferências e configuração aplicada](parametros-de-autoria.md), testes de domínio e de persistência das preferências. |
| Base antes das unidades; revisão e acesso por objeto | [Explicação e revisão humana](explicacao-e-revisao-humana.md), testes de revisão e migrações de conteúdo. |
| Mapa salvo por recortes e aprovação da versão inspecionada | [Planejamento contextual](planejamento-contextual.md), testes do mapa e dos comandos estruturais. |
| Controles no objeto, retorno e conservação de rascunhos | [Configurações](configuracoes.md), testes de interface de planejamento, inspeção e estudo. |
| Operações equivalentes nos canais | [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md), catálogo comum e testes de transporte. |
| Recuperação de resposta incerta | [Estrutura por referência](estrutura-curricular-por-referencia.md) e [observações](observacoes-pedagogicas.md), recibos e releitura da tentativa original. |

Testes de domínio verificam regras; testes com banco verificam persistência e
concorrência; testes de interface exercitam interação e continuidade. Uma
conversa conectada e a inspeção visual da versão publicada completam recortes
diferentes da verificação. Cada resultado precisa identificar a versão, o
ambiente e as ações executadas. Nenhuma dessas provas técnicas substitui a
avaliação educacional do artefato com pessoas.
