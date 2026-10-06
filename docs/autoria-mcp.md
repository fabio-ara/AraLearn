# Autoria pelo MCP

Para configurar a conexão sem entrar nos detalhes do protocolo, siga [Conectar seu assistente](conectar-assistente.md) ou abra **Configurações → Conectar assistente** no AraLearn.

Um assistente externo precisa descobrir quais operações o AraLearn oferece
antes de consultar ou alterar um curso. O [Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/latest)
padroniza essa comunicação: o serviço apresenta ferramentas, seus argumentos e
seus resultados; o cliente as chama conforme o trabalho autorizado.

No AraLearn, essas ferramentas permitem planejar o curso, desenvolver seu
conteúdo e corrigi-lo. O percurso reúne unidades de estudo em **microssequências**,
conjuntos que desenvolvem um objetivo delimitado. A **explicação** oferece a
base de conteúdo e fontes de cada conjunto. O [modelo didático](modelo-didatico.md)
relaciona esses objetos. A pessoa orienta o trabalho e inspeciona o resultado
no aplicativo, conforme o [guia de autoria por conversa](criar-cursos-pelo-chat.md).
Os [fluxos e contratos](fluxos-prompts-e-contratos.md) explicam como o pedido
se transforma numa operação verificável.

As ferramentas atendem a clientes compatíveis com o protocolo. O modelo usado
pelo cliente participa da produção e da análise; o curso permanece salvo no
AraLearn, onde também pode ser editado pela interface.

## Tarefas disponíveis

As tarefas vêm do catálogo público `aralearn.human-authoring-tasks` **11.1.0**, definido em
[courseHumanTasks.js](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).
O catálogo contém 56 tarefas. Cada definição reúne nome,
argumentos aceitos e resultado. As tabelas descrevem seus usos; os formatos
estruturados de entrada, ou schemas, são gerados dessa fonte.

`consultar_componentes` aceita `{}` para descobrir o catálogo em páginas de
oito. A primeira consulta dispensa `continuacao`. Quando a decisão exige
conhecer a lista completa, o cliente segue `temMais` e `continuacao` até a
última página, repetindo os filtros da consulta inicial.

Nas operações seguintes, uma referência devolvida pelo serviço identifica o
objeto, a versão ou o pedido que será retomado. O cliente a devolve intacta;
o servidor resolve as identidades internas e confere novamente a autorização.
Essa referência é chamada de **opaca** porque seu uso dispensa interpretar
ou reconstruir seu conteúdo.

| Leitura | Quando usar |
| --- | --- |
| `consultar_preferencias_autoria` | ler foco, cadência, pontos de revisão e diálogo pessoais, com as condições do curso quando indicado |
| `consultar_perfis` | listar perfis de preferências desta conta |
| `prever_aplicacao_perfil` | examinar alcance e exceções antes de aplicar um perfil ao curso |
| `retomar_curso` | localizar ou continuar um curso pelo título, conservando o recorte quando há parte ou microssequência indicada |
| `comparar_cursos` | confrontar inventário, configuração e dimensões declaradas de dois recortes próprios |
| `exportar_autoria` | obter o artefato literal e a leitura autoral de um recorte próprio |
| `consultar_planejamento` | ler o mapa completo por continuação, o foco em uma parte ou microssequência, ou recuperar situação e referência vigente com `resumo: true` |
| `preparar_materializacao` | consultar antecipadamente a prontidão do foco; a materialização executa essa verificação quando a referência é omitida |
| `consultar_configuracao` | ler parâmetros pedagógicos, alvos editoriais e direção editorial efetivos |
| `consultar_repertorio_instrucional` | ler unidades de análise, requisitos de evidência, vínculos e aplicações salvas |
| `consultar_observacoes` | ler as entradas versionadas da fila pertinente à explicação ou às unidades |
| `preparar_revisao` | reunir também unidades afetadas por progressão, exemplos ou prática |
| `consultar_fontes` | localizar fontes, âncoras e proveniência |
| `consultar_componentes` | buscar representações pela função e ler o contrato exato do componente escolhido |
| `consultar_audios` | recuperar uma página da biblioteca de áudios do curso para reutilização |
| `consultar_acesso` | ler visibilidade, concessões, permissão de cópia e políticas de arquivos e revisão |

| Escrita | Quando usar |
| --- | --- |
| `salvar_preferencias_autoria` | alterar padrões pessoais de processo sem modificar cursos ou condições de pesquisa retroativamente |
| `salvar_perfil` | criar ou editar preferências por cópia, sem alterar cursos |
| `excluir_perfil` | excluir um perfil sem alterar cópias já aplicadas |
| `aplicar_perfil` | aplicar a prévia examinada, preservando exceções salvo seleção explícita |
| `criar_curso` | criar um curso privado após confirmar título e objetivo |
| `alterar_curso` | renomear ou alterar objetivo, conservando os metadados não indicados |
| `excluir_curso` | preparar e confirmar exclusão do curso próprio por alvo inequívoco, com a limpeza pertinente de arquivos |
| `copiar_curso` | preparar e confirmar cópia independente de curso próprio ou explicitamente autorizado |
| `salvar_mapa_curricular` | salvar uma proposta como rascunho para inspeção e receber uma confirmação pequena da revisão persistida |
| `aprovar_mapa_curricular` | registrar a aprovação explícita da pessoa sobre a versão salva inspecionada, usando sua referência opaca |
| `salvar_ramo_curricular` | incluir ou editar módulo, lição ou microssequência por recorte, inclusive dependências, cobertura e fontes previstas |
| `mover_ramo_curricular` | mover ou reordenar ramo completo preservando descendentes, identidades e registros |
| `duplicar_ramo_curricular` | copiar ramo e dados úteis no mesmo curso, sem herdar declaração humana de revisão |
| `remover_ramo_curricular` | remover explicitamente ramo e descendentes, protegendo referências sobreviventes e fontes compartilhadas |
| `salvar_parte` | agrupar microssequências já previstas para produção e registrar sua progressão local |
| `salvar_explicacoes` | produzir ou corrigir bases explicativas e fontes antes ou depois das unidades, preservando as unidades existentes |
| `materializar_parte` | gravar uma microssequência, com parte e preparação resolvidas pelo servidor |
| `reordenar_unidades` | salvar a ordem completa das unidades de uma microssequência, preservando identificadores, conteúdo e configuração aplicada |
| `ajustar_configuracao` | fixar valores de autoria ou pesquisa, delegar parâmetros automáticos ou restaurar herança no escopo |
| `ajustar_orientacao` | alterar a orientação do objeto corrente para trabalho futuro |
| `ajustar_componentes` | definir disponibilidade, exclusões e preferências de componentes no escopo escolhido |
| `manter_unidade_analise` | incluir, editar ou remover um item expresso do repertório instrucional |
| `manter_requisito_evidencia` | incluir, editar ou remover um requisito expresso de evidência |
| `vincular_repertorio_instrucional` | salvar a seleção explícita de análise e evidência de uma microssequência |
| `registrar_aplicacoes_instrucionais` | registrar introduções, usos, formas e oportunidades nas unidades inspecionadas |
| `aplicar_configuracao_instrucional` | aplicar a intenção corrente às unidades existentes, com calibração explícita dos automáticos e preservação de fixações e condições de pesquisa |
| `registrar_observacao` | acrescentar uma observação única com incidências nas unidades e explicações selecionadas |
| `registrar_inspecao` | registrar parecer da IA vinculado à base efetivamente lida, preservando conteúdo e revisão humana |
| `decidir_observacao` | executar aprovação ou encerramento humanos expressos nos alvos e versões apresentados |
| `editar_observacao` | alterar a versão inspecionada de uma entrada, conservando sua pendência |
| `aplicar_correcoes` | aplicar o conjunto coerente de correções já revisado |
| `retomar_correcao` | reconciliar conteúdo, fila e tentativa original sem reescrever a correção |
| `declarar_revisao` | registrar ou retirar a declaração humana expressa sobre o conteúdo salvo referenciado |
| `manter_fonte` | salvar ou retirar fonte, documentos anexados, âncoras, verificação e vínculos de proveniência |
| `incorporar_pdf_como_fonte` | guardar um documento anexado em formato PDF como fonte ou vinculá-lo a uma fonte existente |
| `guardar_audio` | guardar WAV PCM ou MP3 já existente na biblioteca do curso |
| `definir_visibilidade` | tornar o curso público com arquivos disponíveis por padrão, ou privado; permite restringir os arquivos explicitamente |
| `alterar_acesso` | conceder ou revogar acesso da pessoa identificada, com escolha expressa sobre cópia |
| `definir_acesso_arquivos` | escolher herança, restrição ou disponibilidade dos arquivos da fonte inspecionada |
| `definir_politica_revisao` | escolher entre conteúdo completo salvo e somente revisado sem alterar visibilidade ou direitos |

`preparar_materializacao`, `salvar_parte` e
`materializar_parte` aceitam `autonomo: true`, a mesma intenção humana explícita
de `retomar_curso`. Por pedido expresso da pessoa para aquele curso, a produção
segue com o mapa em rascunho, preservando a aprovação humana e as preferências
da conta. O campo não combina com `processo`: a referência de processo conserva
um acordo mais completo, conforme [Conservar o acordo durante a retomada](fluxos-prompts-e-contratos.md#conservar-o-acordo-durante-a-retomada).
Sem o pedido de autonomia, o bloqueio do mapa não aprovado permanece.

O mesmo catálogo gera a descrição de dados aceita em Actions. Cada operação
corresponde a uma tarefa delimitada. Atualizar o catálogo exige usar os nomes
correntes; nomes antigos não funcionam como alternativas.

## Arquivos da conversa

Para guardar um anexo da conversa, o servidor precisa de um endereço temporário
que possa baixar e das informações do arquivo. O caminho no computador da pessoa
apenas identifica o arquivo naquele ambiente. Na extensão de arquivos do cliente
utilizado nos testes, esses dados chegam como
`{download_url, file_id, mime_type?, file_name?}`,
indicados por `_meta["openai/fileParams"]`.

O suporte a essa extensão depende do cliente MCP. O servidor verifica a origem
autorizada e os dados binários, ou bytes, antes de guardar o arquivo.
`guardar_audio` recebe áudio já existente; geração de fala e transcrição são
operações distintas. Os formatos aceitos são WAV PCM, áudio não comprimido, e MP3.

O tipo MIME é o rótulo de formato informado no envio, como `audio/wav`.
O servidor compara o tipo declarado no descritor, o tipo recebido no download
e os bytes do arquivo. Se houver recusa, `unsupported_audio_media_type`
(HTTP 415) distingue os dois rótulos para ajudar a localizar a divergência.
A mensagem mostra apenas rótulos válidos e de tamanho limitado, mantendo
reservados o endereço temporário, os cabeçalhos e os identificadores.
Uma divergência entre rótulos e uma estrutura binária inválida são problemas
diferentes; a mensagem identifica a verificação que falhou.

O rótulo `audio/x-wav` recebido no download é aceito como `audio/wav`, desde que
os bytes correspondam a WAV PCM e sejam coerentes com o descritor. O descritor
continua usando `audio/wav` ou `audio/mpeg`; o arquivo armazenado conserva o tipo
normalizado `audio/wav`. Arquivos MP3, HTML, PDF e WAV não PCM enviados sob o
rótulo de WAV são recusados. Permanecem as verificações de origem, tamanho e
redirecionamento aplicáveis à operação.

As ferramentas do estudo, como áudio e calculadora, são componentes do catálogo
comum, incluídos no campo `content` da unidade ou da explicação. A descoberta
de componentes fornece páginas de até oito representações, com
`total`, `temMais` e `continuacao`. Para recuperar a página seguinte, repita
os filtros e acrescente a continuação recebida. Depois da escolha, consulte
o contrato do componente, um por vez. A leitura de fontes fornece referências
lógicas aos documentos anexados; a biblioteca fornece referências de áudio.
Esses dados identificam o arquivo, mantendo os endereços internos no serviço.
Veja [ferramentas e canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-de-autoria).

## Fluxo de conversa

A retomada localiza o curso e recupera as escolhas do trabalho em andamento.
A pessoa pode começar pelo mapa, por uma explicação ou por uma correção em
conteúdo já existente. O serviço fornece o recorte pertinente e as referências
necessárias às operações seguintes. O [fluxo comum](fluxos-prompts-e-contratos.md)
relaciona planejamento, autorização para produzir e revisão do conteúdo salvo.

Na conversa com o assistente conectado, a pessoa indica o curso e o objeto
que deseja discutir. O assistente lê o conteúdo atual e o contexto necessário
antes de propor uma mudança. A alteração depende da intenção expressa pela pessoa.
A [declaração de revisão](explicacao-e-revisao-humana.md) pode ser registrada
na interface ou pela tarefa `declarar_revisao`, sobre o conteúdo inspecionado.

Uma **parte** agrupa microssequências para produção e pode ser reorganizada
sem mudar o currículo. `salvar_parte` recebe as referências das microssequências
na ordem desejada; `posicao`, quando informada, escolhe a posição do agrupamento
entre 1 e 64. São aceitas até 64 microssequências e uma intenção de até 4.000
caracteres. A reunião conserva títulos, intenções e progressões na proposta para
inspeção. **Reorganizar lotes** apresenta essa prévia no aplicativo.

## Repertório e materialização

Antes de gravar unidades, é preciso relacionar o que a explicação desenvolve
ao que o percurso deverá ensinar e praticar. O **repertório instrucional**
identifica os conhecimentos que serão introduzidos, utilizados ou retomados.
A **reconciliação** associa a cada passagem da explicação sua função nesse
ensino, como introduzir uma relação ou exemplificar um conhecimento já
apresentado. O [fluxo de produção](fluxos-prompts-e-contratos.md#repertório-acumulado)
explica esse preparo.

A reconciliação pode declarar a função de um componente inteiro ou de um
 trecho literal. No primeiro caso, cobre todos os campos de texto declarados
pelo componente, chamados de **folhas textuais**, inclusive sua representação
acessível. No segundo, o servidor localiza a passagem pelo mesmo mecanismo
usado nas citações. O campo `alvo` distingue partes repetidas. Nos dois usos,
a autoria informa o componente e a passagem por referências que consegue
consultar; o servidor deriva os localizadores internos.

A gravação coordenada das unidades e dos registros que documentam sua produção
é chamada de **materialização**. `preparar_materializacao` permite consultar
antecipadamente se o conteúdo proposto está pronto para essa gravação. Recebe
em `unidades` as mesmas propostas usadas na escrita e confere sua relação com
a explicação reconciliada, os conhecimentos planejados e os requisitos de
prática. Também verifica as escolhas de apresentação, as fontes e a cobertura
prevista. A explicação permanece a base consultável da microssequência; as
unidades desenvolvem o ensino, os exemplos e as práticas previstas para o percurso.

Essa chamada antecipada é opcional. Ao omitir `referenciaPreparo`, a
materialização executa a mesma verificação com o conteúdo solicitado antes de
gravar. O resultado `blocked` reúne as causas a corrigir. Quando falta o ensino
de uma ideia no percurso, o retorno identifica a ideia e o passo necessário
para completar a produção. Uma referência explícita de preparo precisa
corresponder à base, à configuração e à intenção correntes.

`materializar_parte` recebe o foco de uma única microssequência e as unidades
novas ou explicitamente alteradas desse foco. A parte é resolvida no servidor.
Identidades, versões correntes dos pacotes e posições finais podem ser omitidas
e são derivadas pela materialização. `unidade` identifica a existente a
substituir; sua ausência cria uma nova. Unidades omitidas permanecem.
`concluir: false` mantém a produção parcial; a conclusão verifica o acumulado.
Práticas novas exigem uma resposta que o aplicativo consiga avaliar e um
retorno explicativo utilizável sem conexão, também chamado de **feedback**.
O contrato de [desenho](aralearn-contract.md#desenho) descreve seus campos.

As explicações existentes são reutilizadas. O campo `explicacoes` recebe
somente bases que também serão criadas ou alteradas. `salvar_explicacoes`
permite desenvolver a base e suas fontes antes das unidades, inclusive enquanto
o mapa está em rascunho.

## Configuração para uso e pesquisa

A configuração orienta como apresentar o conteúdo e organizar a prática. Cada
escolha pode ser definida pela pessoa ou delegada ao assistente. Valores fixados
e condições de pesquisa prevalecem sobre a escolha automática. A
[resolução dos parâmetros](autoria-contextual.md#parâmetros-origem-e-persistência)
explica a prioridade e a diferença entre intenção atual e configuração aplicada.

## Perfis da conta

Um perfil guarda escolhas para reutilização. Aplicá-lo copia essas escolhas
para o curso; editar ou excluir o perfil depois conserva as cópias já aplicadas.
`prever_aplicacao_perfil` permite examinar alcance e exceções antes da confirmação
por `aplicar_perfil`. As [preferências de autoria](parametros-de-autoria.md)
explicam a relação entre perfil, padrão pessoal e acordo de um trabalho em curso.

## Fontes, observações e revisão

Uma fonte pode delimitar o escopo, oferecer uma tarefa de avaliação ou sustentar
uma explicação. Seus vínculos registram o uso feito no curso. Uma observação,
por sua vez, registra algo que a pessoa quer examinar ou corrigir. Uma única
observação pode alcançar vários objetos; a relação com cada um deles constitui
uma **incidência**, com decisão própria. O [capítulo de observações](observacoes-pedagogicas.md)
explica esses registros.

A [revisão do conteúdo](fluxos-prompts-e-contratos.md#observações-revisão-e-privacidade)
reúne o conteúdo e as comparações entre a base anterior e a atual. A fila
fornece `referenciasComparacao` por alvo; `preparar_revisao.comparacao` recebe
essa referência inteira e entrega o conteúdo literal por continuação.
Salvar a correção confirma o conteúdo novo. `decidir_observacao` registra a
decisão humana expressa sobre os alvos e as bases apresentados, e uma aprovação
parcial mantém as demais incidências pendentes. `registrar_inspecao` registra
separadamente o parecer da IA sobre a leitura que realizou.

`retomar_correcao` recupera uma tentativa com resposta perdida, conferindo
conteúdo e fila sem reaplicar a correção. A
[recuperação da tentativa](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção)
explica quais referências precisam ser conservadas.

A declaração humana de revisão pertence ao conteúdo inspecionado. Acesso ao
curso e aos arquivos têm operações próprias; a política opcional de somente
conteúdo revisado é explicada nas [regras de revisão e acesso](aralearn-contract.md#revisão-do-conteúdo).

### Inspeção pedagógica

Quando uma correção altera a estrutura de uma unidade, `aplicar_correcoes`
informa a invalidação da aplicação instrucional. Releia o conteúdo, confira
as escolhas e registre a aplicação atual por
`aplicar_configuracao_instrucional` antes da nova inspeção. As condições fixadas
permanecem protegidas. Uma alteração somente do título ou dos vínculos de
fontes preserva a aplicação registrada; a inspeção considera a base atualizada.

`registrar_inspecao` usa a referência da base focal efetivamente lida. O
parecer novo deve trazer seis dimensões — `alignment`, `evidence`,
`representation`, `feedback`, `sufficiency` e `configuration` — e trechos da
base no campo `evidence`. Os [critérios comuns](fluxos-prompts-e-contratos.md#auditoria-pedagógica-focal)
explicam o que cada dimensão examina. O servidor vincula o parecer à versão e
ao `basisHash`, uma impressão digital calculada dos dados examinados. Ele
identifica quando a base muda e recusa evidência que não esteja no recorte.

`configuration` confronta os parâmetros aplicados com sua realização observável
no alvo e no percurso pertinente, respeitando preferências contextuais e fixações.
Pareceres de formatos anteriores continuam legíveis quando presentes. Cinco
dimensões só permitem recuperar a tentativa exata já salva, identificada pela
referência opaca; uma nova avaliação exige seis. A [referência de compatibilidade](fluxos-prompts-e-contratos.md#auditoria-pedagógica-focal)
detalha essa recuperação.

Um parecer `consistent` exige aplicação instrucional nas unidades relevantes
da base focal. Quando esse registro falta, `needs_attention` permite documentar
a insuficiência. A presença da aplicação oferece a base da comparação; a
inspeção ainda precisa confrontar as escolhas registradas com a experiência
proposta pelo conteúdo.

O relatório registra o julgamento do assistente sobre o material examinado. O
servidor verifica sua ligação com a base e as contradições que consegue observar;
a leitura crítica avalia a suficiência pedagógica. A investigação dos efeitos
sobre a aprendizagem segue o [protocolo de avaliação](protocolo-avaliacao-artefato.md).

## Respostas e erros

Uma tarefa bem-sucedida devolve `result`, com o que ocorreu, e pode incluir
`deepLink`, um destino de inspeção no AraLearn, e `nextDecision`, uma decisão
ainda necessária. O MCP entrega também dados estruturados que o cliente usa
nas próximas chamadas; a conversa pode apresentar o resultado e o caminho para
inspecioná-lo no aplicativo.

`links` identifica cada destino por `relation`, `target`, `label`, `url` e,
quando disponível, `revision`. O primeiro destino corresponde a `deepLink`.
A relação distingue o conteúdo dos espaços de observações, fontes, planejamento
e parâmetros. Conserve o endereço e a identidade retornados ao oferecer a
próxima etapa.

`salvar_mapa_curricular` confirma a escrita com `revisaoDoCurso`, `situacao` e
`referenciaParaAprovar`. Se a resposta se perder, `consultar_planejamento` com
`curso` e `resumo: true` recupera essa confirmação. A referência identifica a
versão salva. Quando o acordo prevê revisão curricular, a pessoa inspeciona o
mapa completo e declara sua aprovação. Com autonomia expressa para aquele
curso, a produção pode seguir sobre o rascunho; o registro de aprovação humana
permanece como estava. Essa autonomia é aceita em `preparar_materializacao`,
`salvar_parte` e `materializar_parte`.

Em `retomar_curso` e `consultar_planejamento`, indicar `parte` ou
`microssequencia` limita o contexto ao ramo selecionado e às dependências
pertinentes. O planejamento integral continua disponível sem esse foco, com
continuação quando necessário. Essas regras são compartilhadas com Actions.

`temMais: true` e `continuacao` não nula indicam uma resposta parcial. O cliente
recupera o restante do mesmo recorte antes de avaliar seu conteúdo. A
[continuação e reconstrução](aralearn-contract.md#continuação-e-reconstrução-do-conteúdo)
especifica os fragmentos literais e seus limites.

Erros devolvem `code`, mensagem, diagnóstico limitado e `recovery`, que informa
como retomar a operação e preservar a tentativa. Os dados técnicos necessários
à recuperação ficam separados da mensagem breve para a pessoa. Uma recusa de
autorização, um conflito de versão e uma indisponibilidade têm consequências
diferentes, descritas no [fluxo de recuperação](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção).

## Confirmação de exclusão por MCP

A exclusão de um curso exige confirmação e um resultado verificável do serviço.
Se o cliente não apresentar o retorno da ferramenta, a ação permanece incerta.
Conferir o recibo e o estado salvo permite distinguir a exclusão concluída de
uma tentativa interrompida.

A conferência do curso e da limpeza de arquivos usa o acesso do proprietário
e conserva a confirmação original. Uma resposta ausente exige essa verificação;
uma recusa explícita deve ser respeitada e não autoriza repetir a exclusão por
outro canal. A exclusão também existe em [Actions](autoria-actions.md) e na
interface, com seus controles próprios. Antes de iniciar outro pedido, é
necessário resolver a incerteza sobre a tentativa anterior.

## Autenticação e atualização

O MCP usa [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1),
que permite autorizar um cliente a acessar o serviço sem lhe entregar a senha
da conta. A conexão solicita o escopo autoral necessário, isto é, o conjunto
permitido de operações, e o servidor volta a conferir pessoa, sessão, cliente
e consentimento em cada chamada.

Uma recusa de acesso à operação (`not_authorized`) conserva o erro e não pede
nova conexão. O desafio OAuth fica reservado à autenticação inválida (`401`)
ou ao erro explícito de escopo insuficiente (`403`, `insufficient_scope`). Essa
distinção evita repetir o login quando a sessão funciona e apenas uma operação
foi recusada. O fluxo de escopo segue a
[especificação MCP de autorização](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#scope-challenge-handling).

Na preparação de `copiar_curso`, o servidor consulta apenas origens que a pessoa
pode copiar: cursos próprios ou com autorização de cópia vigente. A busca por
título e a releitura por identidade usam o mesmo leitor paginado. A leitura
pública e a permissão de cópia são decisões distintas. A preparação conserva
a origem e os dados necessários à confirmação, sem gravar o destino. Ao
confirmar, o comando existente confere novamente acesso e revisão da origem.
Uma permissão de curso ausente precisa ser concedida pelo proprietário;
reconectar renova a autenticação, não essa permissão.

O endereço hospedado do servidor é:

`https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-mcp`

A atualização do catálogo depende do cliente externo utilizado. No
[ChatGPT](https://chatgpt.com), por exemplo, depois de uma publicação que altere
as tarefas:

1. use **Refresh** na conexão AraLearn nas configurações desse serviço;
2. revise e habilite as tarefas correntes indicadas pelo catálogo compartilhado;
3. abra uma conversa nova e retome um curso pelo título;
4. use **Reconnect** somente se a autorização estiver expirada, revogada ou
   vinculada à conta errada.

Atualizar o catálogo e refazer o login OAuth são operações distintas. O login
no site, a conexão OAuth do MCP e a conexão OAuth de Actions também são sessões
independentes.

## Instruções e limites do cliente

A orientação central permanece em
[courseKnowledge.js](../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js).
Seu primeiro parágrafo contém as regras essenciais; guias por fase acrescentam
somente o contexto pertinente. A OpenAI recomenda concentrar nos primeiros
512 caracteres os detalhes mais importantes das instruções do servidor. Essa
orientação organiza a prioridade do texto; o campo pode conter instruções
adicionais, conforme o [guia de construção do servidor MCP](https://developers.openai.com/plugins/build/mcp-server).

Os orçamentos locais controlam o volume de dados do catálogo. A aceitação pelo
cliente é verificada com o artefato realmente carregado e uma conversa nova;
um teste local examina outra etapa desse percurso. O
[roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais)
separa medidas mecânicas, estimativas e observação do cliente real.

Quando cliente e servidor usam versões diferentes da descrição dos campos,
um argumento obrigatório pode aparecer no erro do cliente como “propriedade
adicional”. Compare o catálogo servido com o importado para localizar a
divergência. O pedido e o erro podem ser registrados sem dados sensíveis para
esse diagnóstico. A correção precisa alinhar os dois contratos, preservando as
referências exigidas pela operação.

Atualizar as ferramentas na página de detalhes da conexão recupera ferramentas,
descrições e instruções do servidor, conforme a
[documentação de conexões MCP personalizadas](https://developers.openai.com/api/docs/guides/custom-mcp-server).
Depois, abra uma conversa nova e execute novamente a chamada para conferir a
configuração efetivamente recebida pelo cliente.

## Verificação local

```powershell
npm run test:authoring:mcp
deno test --config supabase/functions/deno.json `
  supabase/functions/tests/aralearn-authoring-mcp.test.ts
```

O comando de MCP já executa o contrato compartilhado, então não repita
`test:authoring:contract` no mesmo ciclo.

Essas verificações percorrem o catálogo desde a seleção da tarefa e a resolução
do alvo até a autorização, além de conferir a paridade com Actions. A jornada em
cliente real é executada depois da publicação deliberada.

## Referências técnicas

- [Model Context Protocol](https://modelcontextprotocol.io/specification/latest)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
