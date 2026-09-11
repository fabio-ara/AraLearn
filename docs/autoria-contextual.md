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
| Microssequência didática | Delimita um objetivo e a sequência necessária para desenvolvê-lo, considerando público, conhecimentos prévios e conteúdos a abordar. |
| Base explicativa da microssequência — **Explicação** na interface | Desenvolve o texto-base e suas fontes, com as explicações necessárias ao objetivo. Pode ser produzida antes das unidades. No Estudo, também serve de apoio sob demanda. |
| Desenho instrucional | Reúne escolhas sobre como explicar o conteúdo, propor atividades e organizar o percurso. |
| Unidade de estudo | Organiza um trecho do percurso que explica, exemplifica ou propõe uma atividade com uma finalidade definida. Sua extensão acompanha essa finalidade. |
| [Unidade de análise instrucional](desenho-instrucional-parametrizado.md) | Identifica um conhecimento a acompanhar no percurso, como uma relação ou operação. Permite reconhecer onde ele foi introduzido e utilizado. A unidade de estudo organiza a apresentação; a unidade de análise recorta o conhecimento. |
| Configuração corrente | Escolhas que orientam a próxima produção ou revisão. Podem vir deste objeto ou de uma decisão mais abrangente. |
| Configuração aplicada | Registro das decisões que orientaram a produção e gravação da unidade de estudo, operação chamada de materialização, com origem e motivo. |
| Revisão autoral | Declaração da pessoa de que inspecionou o conteúdo salvo da explicação ou unidade. É reversível e pode ficar desatualizada após mudança material. |

O curso é organizado em vários níveis, do próprio curso às unidades de estudo.
O [modelo didático](modelo-didatico.md) apresenta os níveis intermediários e a
relação entre eles. Partes e lotes servem para organizar o trabalho de produção,
enquanto a explicação constitui o texto-base de uma microssequência; nenhum
deles acrescenta outro nível ao currículo. Uma unidade pode ter uma fonte
própria, e a apresentação reunida das referências conserva qual objeto cada
vínculo sustenta.

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

A aprovação exige público e escopo definidos e uma hierarquia com ao menos um
módulo e sem ramos vazios: cada módulo contém ao menos uma lição, e cada lição
alcança uma microssequência.
Todo item de escopo precisa estar coberto, e cada
dependência precisa apontar para uma microssequência anterior no percurso global.
A decisão corresponde ao mapa salvo e inspecionável corrente. Persistir um recorte
volta o mapa para rascunho; revisão do conteúdo e acesso ao curso continuam sendo
decisões próprias.

Uma alteração do planejamento preserva a identidade e o conteúdo já produzido,
além dos registros que explicam como esse conteúdo foi criado. Somente os campos
do recorte enviado são atualizados; os demais permanecem como estavam. Por isso,
omitir um ramo já preenchido não o remove nem o transfere para outro pai. A mesma
proteção vale para itens de escopo ligados a fontes. Ramos ainda vazios podem ser
retirados pelo planejamento.

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

O [catálogo de parâmetros](desenho-instrucional-parametrizado.md#catálogo-corrente)
reúne doze decisões. Nove podem ser definidas no curso, na lição, na
microssequência ou na unidade; três organizam a cadência e pertencem somente ao
curso. Módulos permitem consulta contextual, mas não recebem atribuições desses
parâmetros. Direção editorial e política de componentes têm regras próprias.
Os [campos técnicos](aralearn-contract.md#campos-de-configuração-nos-canais)
relacionam cada decisão aos nomes, valores e limites aceitos nos canais.

Uma decisão automática delega a escolha conforme o conteúdo. Por exemplo, um
curso pode deixar ao assistente quantas ideias novas desenvolver em cada
unidade. O valor continua pendente até a produção, quando a escolha e seu motivo
são registrados. Um valor de referência do produto, como duas ideias, não se
torna um limite aplicado por ausência de escolha.

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

O [painel de parâmetros](../src/ui/CourseDesignPanel.js) apresenta a decisão
resolvida, sua origem, seu alcance, a justificativa e os limites; na unidade,
mostra também a configuração aplicada. Retirar a atribuição local restaura a resolução das demais decisões do
caminho (`clear_parameter`); delegar o parâmetro pede uma escolha contextual
(`delegate_parameter`). Salvar a intenção orienta a próxima produção ou revisão.
O conteúdo e seu registro aplicado mudam por uma operação de conteúdo própria.

O registro das aplicações em unidades existentes descreve como o conteúdo
foi organizado e conserva os requisitos planejados, inclusive prática futura ainda
ausente ou incompleta. Aplicar configuração e calibração a essas unidades pode
acompanhar essa declaração fiel, preservando texto, fontes e a declaração
anterior de revisão. Se o desenho aplicado mudar materialmente, essa
declaração pode ficar desatualizada. A lacuna
entre prática planejada e aplicada permanece visível; materializar um lote
completo continua exigindo a cobertura prevista.

Na conversa conectada, `consultar_configuracao` e `ajustar_configuracao` permitem
inspecionar e alterar essas escolhas no nível curricular selecionado. O módulo
pode fornecer contexto para a consulta, mas não recebe parâmetros cujo catálogo
não admita esse escopo. Direção editorial e política de componentes têm regras
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
base ou unidades. A frequência de pausa tem um parâmetro próprio. Escolher esses pontos organiza a inspeção; a declaração de revisão depende da decisão posterior sobre cada objeto, e o acesso conserva sua política própria. **Diálogo** define concisão, debate ou explicação e um alvo flexível de extensão da conversa. Conversa curta preserva as decisões substantivas e a suficiência do conteúdo didático.

Os padrões pessoais são acessíveis em **Configurações → Preferências de
autoria** e nos canais conectados. As escolhas de foco, cadência, revisão e
diálogo permanecem independentes.

O acordo de um trabalho em andamento conserva uma cópia dessas escolhas. Seu
mandato delimita o que a pessoa autorizou produzir, com o escopo e as restrições
pertinentes. Cada leitura informa o padrão, a exceção expressa aplicável e o
fluxo acordado.

Uma alteração pessoal posterior fica visível, enquanto o mandato em andamento
conserva o acordo anterior até uma mudança expressa. Aplicar um perfil copia
suas escolhas para o curso, que passa a manter essa configuração. A resolução
do acordo está em [Parâmetros de
autoria](parametros-de-autoria.md#resolução-com-curso-e-mandato).

## Intenção, aplicado, edição e revisão

No detalhe de uma decisão, a interface e os canais mostram seu significado, o
valor efetivo e a procedência desse valor, incluindo alcance e motivo. Havendo
conteúdo, mostram também a configuração aplicada naquela produção ou informam
que esse registro está ausente. Um exemplo de estado legível é: “Para próximas
produções: definição e contraste; fixado nesta microssequência” e “Aplicado nesta
unidade: definição e exemplo; escolha contextual da produção anterior”. Os
valores são ilustrativos.

Uma mudança de intenção afeta a direção futura. Aplicar ao conteúdo existente é outra operação, com recorte e impacto declarados. Mudar apenas a intenção conserva a configuração aplicada anterior. A proveniência, registro da origem e das intervenções no conteúdo, distingue
geração, edição manual e aplicação solicitada; texto redigido pelo assistente não recebe autoria humana por causa de um clique posterior.

| Estado/ação | O que afirma | O que precisa permanecer separado |
| --- | --- | --- |
| Rascunho local | Existem alterações pendentes neste dispositivo. | Conteúdo salvo, revisão e conteúdo acessível a terceiros. |
| Salvar edição | A mudança autorizada foi persistida, com intervenção registrada. | Declaração de revisão. |
| Registrar observação | Existe comentário ancorado ao objeto. | Correção do texto e aplicação da intenção. |
| Marcar revisão | A pessoa declara inspeção do conteúdo salvo identificado. | Prova de leitura, correção, eficácia e autorização de acesso. |
| Retirar revisão | A declaração foi retirada reversivelmente. | Conteúdo salvo e direitos de leitura/arquivo. |
| Revisão desatualizada | O conteúdo ou os dados pertinentes à revisão mudaram após a inspeção. | Apagamento da evidência histórica ou aprovação automática do conteúdo novo. |
| Publicar/compartilhar acesso | O proprietário concede acesso expresso ao conteúdo completo salvo. | Edição local, gravação parcial e arquivos sem direito. |

Uma alteração material na base, fonte ou requisito pode exigir reinspeção das
unidades relacionadas. A análise de impacto percorre os vínculos conhecidos e
informa até onde eles permitem acompanhar a mudança. Cada objeto conserva sua
própria declaração: marcar a base altera o estado dela, enquanto as unidades
mantêm os seus. Diante de edição pendente, a pessoa salva ou descarta antes de
marcar revisão. Um registro coletivo conserva o alcance da microssequência; as
declarações individuais continuam ligadas a cada objeto.

A leitura combina acesso autorizado com conteúdo completo salvo. A política
`reviewed_only`, quando expressamente ativada, exige também revisão atual do
objeto. As [regras de revisão e acesso no banco](../supabase/migrations/20260909025232_contextual_content_review_access.sql)
implementam essa verificação; o [guia de acesso ao curso](guia-professor-autor.md)
explica a escolha do proprietário e seu efeito para quem estuda.

## Localização e continuidade da interface

**Configurações** permanece acessível em Estudo e Autoria. Ali ficam as escolhas
da conta e do dispositivo, enquanto **Manutenção** aparece somente para quem tem
o papel necessário. As decisões curriculares permanecem perto do objeto a que se
aplicam: o planejamento reúne curso e ramos; a microssequência reúne explicação e
fontes; a unidade mostra o que foi aplicado e revisado.

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
ambiente e as ações executadas. A avaliação educacional do artefato com pessoas
responde a outra pergunta: o que ocorre durante seu uso para aprender.
