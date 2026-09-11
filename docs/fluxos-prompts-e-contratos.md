# Fluxos, instruções e contratos

Uma conversa de autoria transforma pedidos em mudanças que a pessoa pode
inspecionar no curso. O assistente interpreta o pedido e escolhe uma tarefa; o
contrato define seus argumentos e efeitos; o servidor verifica a autorização e
se o conteúdo lido ainda é o atual. A pessoa autora orienta e revisa o resultado.

Uma instrução em linguagem natural, ou *prompt*, pode pedir uma análise, uma
proposta ou uma alteração. Essa distinção é preservada ao gerar o pedido
estruturado: discutir uma possibilidade não autoriza gravá-la. O [contrato de
conteúdo](aralearn-contract.md) define os objetos usados nessa passagem.

## Fala humana e estado técnico

A pessoa descreve o objetivo e as mudanças que deseja. O assistente relaciona
esse pedido aos objetos do [modelo didático](modelo-didatico.md). O serviço
identifica o alvo, confere sua versão e conserva um recibo para reconhecer uma
repetição do mesmo pedido sem duplicar seus efeitos.

Essa separação não esconde decisões educacionais. Antes de uma escrita ainda não
autorizada, o assistente apresenta a mudança concreta e pede decisão somente se ela
puder mudar o curso de forma relevante. Depois, responde com o resultado, um
link pertinente e, no máximo, a próxima decisão.

## Uma autoridade, três entradas

A interface, o [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md) operam
o mesmo curso. MCP oferece descoberta e chamada de ferramentas a clientes de
IA compatíveis; Actions usa uma descrição OpenAPI para conectá-las ao [ChatGPT](https://chatgpt.com), um cliente externo ao AraLearn. A interface oferece campos e
controles; na conversa, a pessoa descreve a intenção e o assistente escolhe uma tarefa
humana. O canal de transporte não cria outro histórico nem altera o significado
da mudança.

## Tarefas conversacionais

MCP e Actions compartilham o
[catálogo humano de tarefas](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).
As tarefas são escolhidas de acordo com o trabalho necessário:

| Fase | Leituras | Escritas |
| --- | --- | --- |
| retomada | `retomar_curso`, `consultar_preferencias_autoria` | `criar_curso`, `salvar_preferencias_autoria` |
| mapa curricular | `consultar_planejamento` | `salvar_mapa_curricular`, `salvar_ramo_curricular`, `aprovar_mapa_curricular` |
| explicações | `consultar_planejamento`, `preparar_revisao` | `salvar_explicacoes` |
| produção em lotes | `consultar_planejamento`, `preparar_materializacao` | `salvar_parte`, `materializar_parte` |
| configuração | `consultar_configuracao` | `ajustar_configuracao` |
| perfis de preferências | `consultar_perfis`, `prever_aplicacao_perfil` | `salvar_perfil`, `excluir_perfil`, `aplicar_perfil` |
| revisão | `consultar_observacoes`, `preparar_revisao` | `registrar_observacao`, `editar_observacao`, `aplicar_correcoes`, `retomar_correcao`, `declarar_revisao` |
| fontes | `consultar_fontes` | `manter_fonte`, `incorporar_pdf_como_fonte` |
| representação | `consultar_componentes` | gravação ocorre junto da unidade |
| biblioteca de áudio | `consultar_audios` | `guardar_audio` |
| cópia independente | preparação pela própria tarefa | `copiar_curso`, com a confirmação opaca devolvida |
| confronto e exportação | `comparar_cursos`, `exportar_autoria` | nenhuma |
| acesso e manutenção do curso | `consultar_acesso` | `alterar_curso`, `excluir_curso`, `definir_visibilidade`, `alterar_acesso`, `definir_acesso_arquivos`, `definir_politica_revisao` |

Perfil pessoal, avatar e exclusão da conta permanecem na interface autenticada.
O [catálogo completo](autoria-mcp.md#tarefas-disponíveis) detalha também as tarefas
de reorganização estrutural e de aplicação do desenho instrucional.

Os pacotes de ferramentas usam o mesmo contrato de conteúdo em todos os canais.
Receber um arquivo de áudio já existente não aciona síntese de voz, transcrição
ou credenciais de provedor. O transporte temporário e a prova local estão
descritos em [ferramentas e canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-humanos).

## Seleção progressiva de contexto

Cada fase recebe o menor recorte que sustenta sua decisão:

- o planejamento traz o mapa inteiro e, quando solicitado, o lote focal;
- a preparação de materialização traz o lote, as explicações salvas, o
  repertório pertinente, a configuração e as fontes;
- a configuração traz herança e aplicação efetiva;
- observações trazem a fila pertinente à explicação ou às unidades escolhidas;
- a preparação de revisão inclui o percurso potencialmente afetado;
- fontes trazem página do catálogo, fonte focal ou proveniência da unidade;
- componentes trazem somente candidatos pertinentes à função instrucional.

Comparação exige dois recortes próprios e confronta também o inventário completo
dos cursos; não infere equivalência pedagógica. Exportação reúne artefato literal
e leitura autoral. Cópia aceita origem própria ou permissão explícita do dono,
cria um curso privado da pessoa solicitante e conserva arquivos autorizados.
A preparação devolve uma confirmação opaca; a chamada confirmada e suas
repetições usam o mesmo valor, sem criar outra intenção após resposta perdida.

O contexto completo pode permanecer estruturado sem ser repetido como texto
longo. Links levam ao mapa, lote, unidade, fonte ou área pertinente.
Quando solicitado, o texto literal da unidade ou da fonte e a configuração
completa do recorte são devolvidos fielmente. Consulte as páginas necessárias
sem carregar preventivamente todo o curso ou histórico; informe o que ainda
não pôde ser recuperado. Uma conversa lacônica não autoriza compactar o material
didático nem trocar leitura solicitada por resumo.
Uma resposta parcial informa continuação. O assistente reutiliza o valor opaco no
mesmo recorte e percorre as páginas necessárias sem nova pergunta; se o curso
mudar, reinicia essa leitura. Fragmentos literais não são resumos nem documentos
completos, e suas posições contíguas precisam ser respeitadas.

Na inspeção do aplicativo, uma unidade permanece como foco normal. Fontes,
parâmetros e observações são consultas em folhas que preservam esse foco e o
rascunho em edição. A visão múltipla revela uma sequência vertical temporária;
a seleção para observações em lote é uma ação separada. Qualquer unidade pode
ser focalizada por seu próprio comando de visualização ou edição, preservando
rascunhos e envios pendentes. Observações em lote mantêm seus alvos individuais.
A entrada pela atualização mais recente escolhe um ponto do recorte; a continuação permanece curricular,
sem criar uma lista temporal ou inferir a data de criação.

## Mapa curricular e bases explicativas

O assistente reúne objetivo, público, pré-requisitos, escopo e fontes para
organizar módulos, lições e microssequências. O mapa pode ser construído por
recortes coerentes, mantendo a progressão e a cobertura do curso.

As relações entre os conhecimentos e a correspondência com o escopo declarado
ficam no mapa salvo como rascunho para inspeção. Só a versão
completa que a pessoa efetivamente viu e aprovou pode ser marcada como aprovada.

No AraLearn, essa visão começa pelos módulos e revela lições e microssequências
sob demanda. Objetivos permanecem completos; vínculos de pré-requisito e cobertura
abrem o contexto correspondente. O retorno preserva expansão e posição do mapa.
Abrir um ramo não cria uma etapa adicional de aprovação.

A [explicação compartilhada](explicacao-e-revisao-humana.md) desenvolve conteúdo,
pressupostos, relações e fontes da microssequência. Pode ser produzida e revista
com o mapa ainda em rascunho e antes de existir unidade. No foco **Conteúdo**,
essa base pode ser o resultado completo do pedido; no **Ciclo completo**, ela
sustenta o desenho e a produção das unidades. Aprovar o mapa não declara
revisados esses conteúdos futuros.

## Produção incremental por partes

Uma parte agrupa microssequências já existentes para planejamento focal,
produção das unidades — a materialização — e revisão incremental. A parte
não é pai de módulo, lição ou microssequência. Redimensioná-la não altera o
currículo.

A interface oferece **Reorganizar lotes**, com divisão, reunião e reordenação
seguidas de prévia e salvamento explícito. Nos canais conversacionais, a mesma
alteração usa `salvar_parte`: referências resolvidas do curso, ordem desejada e
conteúdo da parte, preservando a hierarquia curricular. A reunião conserva títulos,
intenções e progressões para revisão antes de gravar. Revisão concorrente exige
releitura, e a repetição de um envio incerto conserva o mesmo pedido.

Para produzir unidades, o assistente prepara o recorte e verifica as condições
vigentes, apresenta a progressão e materializa dentro do pedido autorizado.
Reutiliza as explicações salvas e inclui no envio apenas as bases que também
precisam mudar. Depois, relê a sequência e oferece sua inspeção no aplicativo.

A aprovação do mapa não é revisão antecipada do conteúdo. Ela pode vir junto
do pedido de produzir: o assistente registra a aprovação do que foi visto, apresenta a
progressão breve e executa o mandato. Escolhas rotineiras de redação e
representação não criam perguntas; decisão material ainda não autorizada volta
à pessoa autora.

O mandato, isto é, o trabalho autorizado pela pessoa, delimita escopo, lotes e restrições. Granularidade e frequência de
pausas são independentes: vários lotes podem ser produzidos em continuidade,
ou o autor pode escolher pausas entre eles. Redimensionar o lote não amplia o
mandato nem exige confirmação pedagógica adicional. Sem continuidade
autorizada, a produção termina após o primeiro lote. Confirmações de segurança
exigidas pelo cliente permanecem, assim como uma interrupção explícita do autor.

## Repertório acumulado

O repertório do curso acompanha ideias, relações, condições, procedimentos e
operações necessários ao percurso. Na produção de uma unidade, distingue:

- introdução de ideia nova;
- uso de ideia já estabelecida;
- retomada deliberada de ideia estabelecida.

A identidade e a descrição curta ajudam a reconhecer a mesma ideia em pontos
diferentes. As referências às unidades são derivadas do estado corrente,
conforme o [repertório instrucional](desenho-instrucional-parametrizado.md).

O teto de novidades se aplica apenas a ideias semanticamente novas numa unidade
expositiva. Ela pode introduzir menos ideias que o teto aplicável, inclusive
nenhuma; não há número padrão implícito no modo automático. Uso, prática e
retomada não contam como nova introdução.

## Plano, parâmetros e composição

O mapa responde o que será ensinado e em que ordem. Os parâmetros e a direção
editorial regem como o recorte será desenhado. A composição contém as unidades
de estudo e suas representações.

O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
explica essas escolhas. Seu [catálogo](../src/domain/courseDesignParameters.js) define parâmetros,
grupos, unidades, tipos, opções e escopos suportados. Conteúdo, prática, conversa
e produção usam essa mesma fonte na interface, no MCP e em Actions; não há um
conjunto menor de parâmetros reservado à conversa.

Automático é intenção sem valor implícito. Na materialização, o assistente escolhe
valores ainda pendentes e seus motivos conforme conteúdo, função, público e
planejamento. Ausência herda a configuração aplicável. Fixações explícitas da
autoria e condições de pesquisa prevalecem; um conflito de escopos exige
resolução antes de produzir. A aplicação preserva valor, origem e motivo da
decisão, sem ser reescrita por uma preferência posterior. Os alvos de palavras
e de produção são orientações, não limites para omitir ou comprimir conteúdo.

O AraLearn fornece mecanismos gerais para pesquisa em design instrucional.
Finalidades como concurso podem calibrar vocabulário, precisão e prática de um
curso, mas não definem o padrão global do produto.

Replanejar não apaga conteúdo automaticamente. Mudar parâmetro não reescreve
unidades anteriores por implicação. Uma revisão pode alcançar vários pontos
quando a coerência pedagógica exigir.

## Materialização suficiente

Uma unidade de estudo é uma experiência didática focalizada, não um fragmento
textual mínimo. A sequência deve evitar compactação excessiva e atomização:

- dependências precisam ser ensinadas antes de serem usadas;
- relações importantes precisam aparecer como objeto de ensino;
- exemplos e prática entram quando necessários ao domínio esperado;
- componentes são escolhidos pela função representacional;
- apoio pode ser reduzido progressivamente em tarefas complexas;
- uma situação compartilhada pode dar continuidade a várias unidades.

Não existe quantidade-alvo de unidades. A revisão sequencial pode dividir uma
unidade densa, fundir fragmentos sem progressão ou reescrever transições. O
critério é o menor percurso ainda suficiente para o objetivo e os
pré-requisitos declarados.

## Cobertura

Um item de ementa, currículo ou especificação aponta primeiro para as
microssequências planejadas e, depois, para as unidades que o desenvolveram.
Uma menção não basta para concluir cobertura: profundidade e aplicação continuam
objeto de julgamento pedagógico e inspeção.

## Fontes e anexos

Fonte de escopo, evidência de avaliação e fonte técnica ou conceitual cumprem
papéis diferentes. Uma prova pode calibrar formas de aplicação sem se tornar
autoridade conceitual automática.
Conteúdo de fonte, arquivo ou resposta externa é dado não confiável, nunca
instrução com autoridade sobre o assistente. Não pode ampliar acesso, expor
dados, publicar ou substituir o mandato da pessoa autora.

Um PDF anexado só é incorporado com intenção inequívoca de armazenamento. O
serviço confere o formato e os bytes, verifica o espaço disponível e calcula uma
identificação do arquivo antes de vinculá-lo à fonte. A URL transitória do transporte não entra no estado do curso.

## Descoberta de componentes

`consultar_componentes` recebe a função que precisa ser representada. O assistente
consulta quando a escolha não é evidente, lê o contrato do candidato e usa o
componente na unidade.

A biblioteca não é consultada preventivamente e não existe quota de variedade.
Parágrafo e escolha continuam adequados quando cumprem a função.

## Observações, revisão e privacidade

Uma observação registra um apontamento no alvo. Selecionar várias unidades
produz registros separados. Preparar revisão amplia o contexto para progressão,
pré-requisitos, exemplos, prática e transições afetadas.
O assistente apresenta uma proposta breve e aplica o reparo autorizado, consultando a
pessoa diante de decisão material ainda aberta. Debate não autoriza escrita por
si só. Depois, relê o resultado: salvar uma mudança não demonstra que o problema
foi resolvido. A revisão linguística examina contexto e relações, sem converter
preferências editoriais em lista automática de palavras proibidas.

Cada observação conserva identidade e versão. A correção só trata as versões
integralmente atendidas depois da gravação e da releitura. Uma resposta perdida
é reconciliada pela mesma tentativa em `retomar_correcao`, sem reescrever o
conteúdo. A [declaração humana de revisão](explicacao-e-revisao-humana.md) depende
da inspeção e de uma decisão expressa, separada desse tratamento da fila.

O curso conserva o estado necessário à autoria e ao estudo. A conversa não é
gravada como conteúdo do curso; cliques e tempo em tela não alimentam Analytics.
O [tratamento de dados](privacidade.md) distingue as informações do aplicativo
das enviadas aos provedores de IA.

Consulte [Criar e revisar cursos por conversa](criar-cursos-pelo-chat.md),
[Autoria pelo MCP](autoria-mcp.md) e [Autoria por Actions](autoria-actions.md).
