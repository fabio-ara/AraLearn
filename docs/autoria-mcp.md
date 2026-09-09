# Autoria pelo MCP

O servidor MCP do AraLearn permite criar e revisar cursos numa conversa. O GPT
trabalha com tarefas humanas; o servidor resolve identidades, concorrência e
repetição segura internamente.

O curso vivo é a autoridade. A interface de autoria, o MCP e Actions leem e
alteram o mesmo estado, sem manter uma cópia paralela da conversa.

**Debater com GPT**, na Autoria, oferece um pedido copiável com o endereço exato
do recorte e a revisão observada. O cliente deve resolver essa referência e ler
o estado atual pelas tarefas existentes, incluindo base explicativa e fontes pertinentes.
Se o curso mudou, explicita a diferença. O pedido inicia uma discussão: não
autoriza escrita, não registra aprovação humana e não supõe que o link contenha
o texto. Proposta, decisão de aplicar e releitura permanecem etapas distintas;
a inspeção e a declaração de revisão pertencem à pessoa autora. A declaração
expressa pode ser registrada na interface ou pela tarefa `declarar_revisao`;
uma avaliação feita pelo GPT não a substitui.

## Tarefas disponíveis

As tarefas vêm do catálogo público `aralearn.human-authoring-tasks` 4.0.0, definido em
[courseHumanTasks.js](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).
As tabelas abaixo descrevem seus usos; nomes, campos e limites são gerados dessa fonte.

| Leitura | Quando usar |
| --- | --- |
| `consultar_preferencias_autoria` | ler foco, cadência, pontos de revisão e diálogo pessoais, com as condições do curso quando indicado |
| `consultar_perfis` | listar perfis de preferências desta conta |
| `prever_aplicacao_perfil` | examinar alcance e exceções antes de aplicar um perfil ao curso |
| `retomar_curso` | localizar ou continuar um curso pelo título |
| `comparar_cursos` | confrontar inventário, configuração e dimensões declaradas de dois recortes próprios |
| `exportar_autoria` | obter o artefato literal e a leitura autoral de um recorte próprio |
| `consultar_planejamento` | ler o mapa curricular completo e, quando pertinente, uma parte operacional |
| `preparar_materializacao` | reunir base explicativa, fontes, repertório acumulado e configuração do lote antes de produzir unidades |
| `consultar_configuracao` | ler parâmetros pedagógicos, alvos editoriais e direção editorial efetivos |
| `consultar_repertorio_instrucional` | ler unidades de análise, requisitos de evidência, vínculos e aplicações salvas |
| `consultar_observacoes` | ler as entradas versionadas da fila pertinente à Explicação ou às unidades |
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
| `salvar_mapa_curricular` | salvar uma proposta completa como rascunho para inspeção |
| `aprovar_mapa_curricular` | registrar a aprovação da versão persistida inspecionada, usando sua referência opaca |
| `salvar_ramo_curricular` | incluir ou editar módulo, lição ou microssequência por recorte, inclusive dependências, cobertura e fontes previstas |
| `mover_ramo_curricular` | mover ou reordenar ramo completo preservando descendentes, identidades e registros |
| `duplicar_ramo_curricular` | copiar ramo e dados úteis no mesmo curso, sem herdar declaração humana de revisão |
| `remover_ramo_curricular` | remover explicitamente ramo e descendentes, protegendo referências sobreviventes e fontes compartilhadas |
| `salvar_parte` | agrupar microssequências já previstas num lote operacional e registrar sua progressão local |
| `salvar_explicacoes` | produzir ou corrigir bases explicativas e fontes antes ou depois das unidades, preservando as unidades existentes |
| `materializar_parte` | gravar as unidades de estudo de uma parte preparada |
| `reordenar_unidades` | salvar a ordem completa das unidades de uma microssequência, preservando IDs, conteúdo e configuração aplicada |
| `ajustar_configuracao` | fixar valores de autoria ou pesquisa, delegar parâmetros automáticos ou restaurar herança no escopo |
| `ajustar_orientacao` | alterar a orientação do objeto corrente para trabalho futuro |
| `ajustar_componentes` | definir disponibilidade, exclusões e preferências de componentes no escopo escolhido |
| `manter_unidade_analise` | incluir, editar ou remover um item expresso do repertório instrucional |
| `manter_requisito_evidencia` | incluir, editar ou remover um requisito expresso de evidência |
| `vincular_repertorio_instrucional` | salvar a seleção explícita de análise e evidência de uma microssequência |
| `registrar_aplicacoes_instrucionais` | registrar introduções, usos, formas e oportunidades nas unidades inspecionadas |
| `aplicar_configuracao_instrucional` | aplicar a intenção corrente às unidades existentes, com calibração explícita dos automáticos e preservação de fixações e condições de pesquisa |
| `registrar_observacao` | acrescentar uma entrada à fila de uma Explicação ou de unidades selecionadas |
| `editar_observacao` | alterar a versão inspecionada de uma entrada, conservando sua pendência |
| `aplicar_correcoes` | aplicar o conjunto coerente de correções já revisado |
| `retomar_correcao` | reconciliar conteúdo, fila e tentativa original sem reescrever a correção |
| `declarar_revisao` | registrar ou retirar a declaração humana expressa sobre o conteúdo salvo referenciado |
| `manter_fonte` | salvar ou retirar fonte, PDFs, âncoras, verificação e vínculos de proveniência |
| `incorporar_pdf_como_fonte` | guardar um PDF anexado como fonte ou vinculá-lo a uma fonte existente |
| `guardar_audio` | guardar WAV PCM ou MP3 já existente na biblioteca do curso |
| `definir_visibilidade` | escolher visibilidade do curso e política de seus arquivos dentro dos direitos existentes |
| `alterar_acesso` | conceder ou revogar acesso da pessoa identificada, com escolha expressa sobre cópia |
| `definir_acesso_arquivos` | escolher herança, restrição ou disponibilidade dos arquivos da fonte inspecionada |
| `definir_politica_revisao` | escolher entre conteúdo completo salvo e somente revisado sem alterar visibilidade ou direitos |

Os schemas vêm do mesmo catálogo projetado para Actions. Não há aliases para
ferramentas antigas nem um comando genérico que exponha a estrutura do banco.

No contrato 4.0.0, Explicação é a base explicativa salva da microssequência:
conteúdo desenvolvido, pressupostos, relações e fontes. `salvar_explicacoes`
permite desenvolvê-la antes das unidades, inclusive durante o trabalho sobre um
mapa em rascunho. Abrir a base salva não chama LLM. `materializar_parte` reutiliza
as bases existentes; recebe em `explicacoes` somente aquelas que a intenção atual
também altera. `aplicar_correcoes` pode alterar unidades, Explicações ou ambas
num conjunto coerente. `consultar_fontes` e os vínculos de `manter_fonte` aceitam
a Explicação como alvo, com suas localizações próprias. `exportar_autoria`
preserva a base literal e a proveniência correspondente. As formas de explicação
registradas na aplicação pedagógica de uma unidade continuam sendo medidas dessa
unidade: não são a base explicativa compartilhada.

Ao corrigir conteúdo com fontes explícitas, o sistema relê a atribuição do alvo
na mesma revisão. Um vínculo com a mesma fonte, relação e âncoras conserva sua
identidade; uma ocorrência com o mesmo recurso, seletor e trecho também a
conserva. Alterar papéis ou trechos aplica os valores declarados, sem duplicar
o vínculo. Omitir ocorrências preserva as existentes no vínculo correspondente;
uma lista explicitamente vazia as retira. Vínculos omitidos continuam protegidos
pela composição. Se mais de um vínculo corresponder, a correção pede inspeção
em vez de escolher uma identidade. Alterações de relação ou de âncoras que
substituam um vínculo devem usar a posição desse vínculo em `manter_fonte`.

Salvar registra produção ou intervenção; uma mudança material desatualiza a
revisão afetada. Aprovar o mapa ou autorizar um lote não revisa material futuro.
`preparar_revisao` fornece a referência do conteúdo salvo; `declarar_revisao`
recebe essa referência e a escolha expressa da pessoa (`revisado` ou `retirar`).
O GPT não deduz essa declaração da correção, do estudo ou de sua própria
avaliação. A marca registra inspeção declarada, sem provar leitura, correção ou
eficácia. Veja o
[contrato de Explicação e revisão](explicacao-e-revisao-humana.md).

No cliente compatível, PDF e áudio chegam como objetos oficiais de arquivo
declarados por `_meta["openai/fileParams"]`. Nome, caminho local ou identificador
de artefato não substituem `{download_url, file_id, mime_type?, file_name?}`.
O servidor aceita a origem temporária autorizada e valida bytes antes de
persistir. Essa extensão depende da capacidade do cliente MCP; não se presume
acesso a arquivos locais. Ingerir áudio não chama síntese ou transcrição.

Quando um tipo de áudio é recusado, a mensagem distingue o tipo declarado no
descritor do anexo do tipo recebido na resposta do download. Ela informa somente
um token MIME válido e limitado; valores inválidos não são reproduzidos. Isso
permite identificar o ponto da rejeição sem expor a URL temporária, parâmetros
do cabeçalho ou identificadores do arquivo. O erro continua
`unsupported_audio_media_type` (HTTP 415); o diagnóstico não aceita tipos novos
nem substitui a inspeção dos bytes WAV PCM/MP3. A mensagem, isoladamente, não
afirma que o conteúdo do arquivo é inválido.

O rótulo de transporte `audio/x-wav`, observado na resposta real de download
do cliente, é tratado como `audio/wav`. O descritor continua declarando
`audio/wav` ou `audio/mpeg`, conforme o contrato da tarefa. A inspeção exige
bytes WAV PCM válidos e coerentes com o descritor e a resposta;
MP3, HTML, PDF ou WAV não PCM sob esse rótulo são recusados. O armazenamento
e a referência devolvida conservam `audio/wav`. Isso não amplia formatos,
origens autorizadas, limite de bytes nem seguimento de redirecionamentos.

As ferramentas do Estudo são pacotes do catálogo comum, compostos no `content`
da unidade. A consulta focal de componentes fornece um contrato por vez; a de
fontes fornece alvos lógicos de PDF; a biblioteca fornece referências de áudio
sem URLs de Storage. Veja [ferramentas e canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-humanos).

## Fluxo de conversa

O GPT retoma o estado real e lê preferências pessoais, condições do recorte e
pendências pertinentes antes de continuar. Define com a pessoa somente as
decisões substantivas ainda ausentes: objetivo, público, conhecimentos prévios,
escopo e fontes que mudam a proposta. Depois trabalha no objeto corrente:

1. salva o mapa ou um ramo coerente como rascunho e oferece o destino de inspeção;
2. desenvolve a Explicação e suas fontes na microssequência, mesmo antes de
   existir unidade; no foco Conteúdo, essa base pode ser o resultado do mandato;
3. quando houver decisão de aprovar o mapa, lê a versão persistida completa e
   usa `aprovar_mapa_curricular` com `referenciaParaAprovar`, sem regenerar ou
   reenviar outra árvore;
4. no Ciclo completo, prepara o lote pertinente, apresenta sua progressão breve
   e produz as unidades dentro do mandato e dos gates da preparação vigente;
5. relê o que foi salvo, reconcilia as observações atendidas e devolve resultado,
   link pertinente e no máximo uma próxima decisão;
6. continua os recortes autorizados conforme foco, cadência, pontos de revisão e
   diálogo, preservando contexto e decisões já tomadas.

Esses objetos podem ser retomados no contexto. Um mapa completo não é condição
para começar a desenvolver uma base explicativa em uma microssequência existente.
Salvar o rascunho e declarar a aprovação da versão inspecionada são operações
distintas; uma síntese ou página parcial não equivale à inspeção do mapa inteiro.

A aprovação do mapa não aprova conteúdo futuro. A aprovação da progressão de uma
parte não aprova automaticamente cada formulação ou exercício. Decisões
rotineiras de redação e representação não exigem nova pergunta; mudanças
substantivas de cobertura, ordem ou profundidade voltam à pessoa autora.
Se a pessoa aprovar o mapa mostrado e pedir produção na mesma mensagem, o GPT
registra essa aprovação, apresenta a progressão breve e executa o pedido. Não
acrescenta uma confirmação obrigatória para cada lote.

O mandato define escopo, lotes e restrições. `retomar_curso` e
`preparar_materializacao` devolvem `referenciaProcesso`; o cliente conserva esse
valor opaco no campo `processo` ao retomar, preparar e materializar dentro do
mesmo fluxo. Não edita a referência nem a usa como nova autorização. Alterar
preferências pessoais vale para novos fluxos e não reescreve silenciosamente o
processo em andamento. `preferenciasMudaram`, `conflitos` e `exigeConciliacao`
distinguem mudança pessoal de conflito com as condições do recorte. Uma
conciliação pendente deve ser resolvida antes da produção dependente.

A granularidade do lote e a
frequência de pausas são independentes: dividir um lote não cria novas decisões
humanas. Uma preferência de continuidade não autoriza conteúdo fora do pedido.
Sem continuidade autorizada, o GPT entrega o primeiro lote e aguarda orientação.
As confirmações de segurança solicitadas pelo cliente permanecem aplicáveis;
elas não significam que o conteúdo futuro já foi revisado.

Uma parte é um lote operacional. Módulo, lição e microssequência formam a
arquitetura curricular. Alterar limites de uma parte não deve, por si só, alterar
essa arquitetura.

Para dividir, reunir ou reordenar lotes, use `salvar_parte` com as microssequências
já existentes e na ordem desejada. `posicao`, quando informada, escolhe a posição
do lote entre 1 e 64. A tarefa aceita até 64 microssequências e uma intenção de
até 4.000 caracteres. Na reunião, conserve títulos, intenções e progressões dos
lotes na proposta para revisão; não resuma conteúdo para caber no agrupamento.
A prévia e o retorno no aplicativo ficam em **Reorganizar lotes**. Uma revisão
concorrente exige releitura; um envio incerto deve recuperar o mesmo pedido antes
de preparar outra reorganização.

## Repertório e materialização

Antes de produzir unidades, `preparar_materializacao` traz somente o recorte
pertinente e o repertório acumulado do percurso. O GPT distingue ideias novas,
ideias já estabelecidas que serão utilizadas e ideias deliberadamente retomadas.
Conceitos auxiliares, relações, condições, procedimentos e operações também
entram no repertório quando forem necessários para aprender o percurso.
O mesmo recorte informa, para cada microssequência, os itens de escopo cuja
cobertura precisa ser distribuída entre as unidades do lote.

Uma unidade de análise instrucional identifica um item expresso desse repertório;
não é card, token, medida cognitiva ou unidade estatística. Requisitos de
evidência descrevem operações observáveis. As tarefas de manutenção e vínculo
preservam essa distinção; registrar uma aplicação descreve decisões e
oportunidades na sequência, sem certificar eficácia pedagógica.

O teto de novidades controla quantas ideias semanticamente novas uma unidade
expositiva introduz. Ele não exige uma quantidade exata, não transforma prática
em exposição e não autoriza alterar artificialmente a granularidade das ideias.

`materializar_parte` recebe unidades completas e sua aplicação de desenho. Cada
unidade enviada traz os valores contextuais ainda pendentes em
`configuracao.parametros` e o motivo em `configuracao.motivo`; o papel do conteúdo determina se a aplicação é
expositiva, prática ou mista, sem uma segunda declaração. Uma atividade
formativa pode permanecer sem requisito formal; quando uma prática precisa de
um requisito novo, seu texto entra no inventário já existente. O servidor
valida propriedades determinísticas. Suficiência, progressão, ausência de
saltos e adequação das representações continuam dependendo da produção e da
revisão pedagógica.

O GPT deve fazer uma leitura sequencial antes de concluir o lote. Uma sequência
pode ser dividida quando estiver densa demais ou fundida quando a navegação tiver
virado fragmentação textual. Não existe quantidade-alvo de unidades.

## Configuração para uso e pesquisa

A configuração vem do [catálogo de parâmetros](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites, natureza e escopos de cada ajuste.
Parâmetros curriculares ficam no curso ou ramo pertinente; análise e fontes na
microssequência; desenho aplicado e revisão na unidade. Preferências pessoais
de processo têm catálogo e persistência próprios. Os alvos de palavras e de
produção orientam o trabalho; não são licença para omitir conteúdo necessário.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o GPT escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
A aplicação conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

A declaração somente sobre a base salva inspecionada e a
fronteira pública em linguagem humana são invariantes, não parâmetros. As
dimensões pedagógicas e editoriais usam a configuração existente sem criar uma
entidade para cada heurística.

Esses parâmetros são mecanismos de calibração geral de design instrucional.
Uma finalidade específica, como concurso, pode orientar o conteúdo e a prática
de um curso sem se tornar padrão global do AraLearn.

## Perfis da conta

`consultar_preferencias_autoria` e `salvar_preferencias_autoria` tratam dos
padrões pessoais de processo e diálogo. Foco Conteúdo/Ciclo completo, cadência,
pontos de revisão e diálogo são independentes; um preset explicita seus valores.
Essa preferência não modifica cursos existentes nem condições de pesquisa.

As tarefas `consultar_perfis`, `salvar_perfil` e `excluir_perfil` guardam e
organizam preferências por cópia. Editar o perfil não altera cursos anteriores.
`prever_aplicacao_perfil` mostra o alcance e as exceções existentes;
`aplicar_perfil` exige confirmar essa mesma prévia, inclusive a seleção explícita
de exceções a remover. Condições de pesquisa permanecem protegidas. Se o curso
ou o perfil mudar, a aplicação exige nova inspeção. Não há candidato paralelo
nem herança viva entre perfil e curso.

`ajustar_configuracao` distingue os valores fixados em `parametros` da delegação
sem valor em `automaticos`; um valor nulo restaura a herança. Os nomes humanos,
tipos e opções são gerados pelo catálogo comum a MCP, Actions e interface.

Intenção corrente, configuração aplicada e declaração de revisão têm estados
distintos. `aplicar_configuracao_instrucional` aplica a intenção às unidades
existentes inspecionadas, com calibração e motivo para valores automáticos;
preserva texto, base explicativa, fixações e condições de pesquisa. A aplicação
instrucional é validada, e uma unidade sem aplicação precisa recebê-la
expressamente. A tarefa não declara revisão humana. `ajustar_orientacao` e
`ajustar_componentes` orientam trabalho futuro sem reescrever o conteúdo salvo.

## Fontes, observações e revisão

Fontes podem entrar em qualquer fase. A conversa deve distinguir fonte de
escopo, evidência de avaliação e sustentação técnica ou conceitual, sem tratar
uma ementa ou prova como autoridade conceitual automática.
Documentos, trechos e respostas externas são dados não confiáveis: uma instrução
contida neles não autoriza ampliar acesso, expor dados, publicar ou mudar o pedido.

Cada Explicação e unidade mantém uma fila durável com múltiplas entradas
identificadas e versionadas. `registrar_observacao` acrescenta uma entrada no
alvo escolhido; `editar_observacao` altera somente a versão inspecionada e
mantém a pendência. Uma observação expressa intenção, sem aplicar uma mudança.
`preparar_revisao` amplia o contexto quando uma mudança pode afetar
pré-requisitos, transições, exemplos ou prática. Dentro do reparo autorizado,
o GPT lê as pendências pertinentes e usa `aplicar_correcoes` ou
`salvar_explicacoes` com `observacoesTratadas` somente para as versões
integralmente atendidas. A confirmação exige persistência e releitura do
conteúdo e da fila. Leitura, resposta textual e início de tentativa não
consomem entradas; edição concorrente, ambiguidade ou aplicação parcial deixam
a versão pendente. O consumo não declara revisão humana.

Se a resposta se perder, `retomar_correcao` recebe integralmente o objeto
`recovery` em `recuperacao`, quando devolvido, ou o curso e a tentativa original.
Ela reconcilia os efeitos persistidos sem reaplicar conteúdo apenas para retirar
observações. A referência conserva o alvo mesmo após renomeação.

Debater uma possibilidade não autoriza aplicá-la; uma mudança material ainda
não decidida exige consulta. Correções rotineiras já pedidas não exigem nova aprovação.

O arquivo PDF só é persistido quando a intenção de guardá-lo está inequívoca.
Uma leitura descartável não usa `incorporar_pdf_como_fonte`.

Acesso e revisão são independentes. Conteúdo completo salvo pode ser estudado
sem revisão por quem tem acesso, inclusive visitante de curso explicitamente
público. `definir_politica_revisao` torna a restrição a somente revisado uma
escolha expressa; não muda visibilidade, concessões, cópia ou direitos de
arquivos. Somente o proprietário modifica conteúdo global. Edições locais não
salvas e arquivos sem direito não são publicados por uma declaração de revisão.

## Respostas e erros

Uma tarefa bem-sucedida devolve:

- `result`: o que aconteceu;
- `deepLink`: o destino útil no AraLearn, quando houver;
- `nextDecision`: uma única decisão seguinte, quando necessária.

O contexto estruturado pode acompanhar leituras sem ser despejado no chat.
Identidades do banco, nomes de campos e controles de concorrência não fazem
parte da conversa normal.
Se a pessoa pedir texto literal de uma unidade, configuração ou fonte, o GPT
devolve o recorte fielmente. Paginação recupera o que falta; não substitui a
leitura por resumo nem oculta indisponibilidade. A concisão do chat não reduz a
explicação, os exemplos ou a prática necessários no material didático.

Na listagem de cursos e nas leituras de preparo, fontes e revisão, `temMais: true` e uma
`continuacao` não nula sinalizam resposta parcial. O GPT continua o mesmo recorte usando o valor opaco devolvido, sem
inventá-lo nem pedir decisão por página. Fragmentos `application/json` mantêm
texto literal e posições UTF-16 contíguas; devem ser reunidos na ordem antes de
interpretar o documento completo. Enquanto houver trechos pendentes, não se
declara leitura completa. Se a revisão do curso mudar, a leitura do recorte
precisa recomeçar. A revisão inclui observações focais e plano imediato; seu
limite de página não define o alcance pedagógico total da análise.

O preparo inclui a proposta, a Explicação literal, suas fontes e o estado de
revisão de cada microssequência do lote. Essa base compartilhada também pode
exigir continuação. A leitura preserva o conteúdo inteiro; uma mudança no curso
ou no conteúdo entre páginas recusa a continuação para evitar combinar versões.

Erros devolvem `code`, mensagem sanitizada, itens de diagnóstico limitados e
`recovery`, com estratégia, possibilidade de retry e modo de conservar a
tentativa. Tokens, URLs temporárias, cabeçalhos e conteúdo privado não são
evidência para despejar no chat. Os dados de recuperação devolvidos devem ser
preservados integralmente quando a tarefa os solicitar.

Ambiguidade entre títulos exige referência humana mais específica. Conflito
confirmado exige releitura e avaliação do delta ainda pertinente. Escrita
incerta conserva alvo, comando e identidade: ausência imediata de recibo não
prova que a operação terminou sem efeito. O executor reconcilia e, quando
cabível, repete o pedido original sob recibo; não há repetição cega nem nova
identidade para disfarçar incerteza. A indisponibilidade adia a operação e seus
dependentes, sem impedir trabalho independente. Recusa de autorização não é
tratada como falha transitória nem resolvida por reconexão automática.

## Autenticação e atualização

O MCP usa OAuth 2.1. A conexão solicita o escopo autoral necessário e o servidor
volta a conferir pessoa, sessão, cliente e consentimento em cada chamada.

Uma recusa de acesso à operação (`not_authorized`) conserva o erro e não pede
nova conexão. O desafio OAuth fica reservado à autenticação inválida (`401`)
ou ao erro explícito de escopo insuficiente (`403`, `insufficient_scope`). Essa
distinção evita repetir o login quando a sessão funciona e apenas uma operação
foi recusada. O fluxo de escopo segue a
[especificação MCP de autorização](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#scope-challenge-handling).

Na preparação de `copiar_curso`, o servidor consulta apenas origens que a pessoa
pode copiar: cursos próprios ou com autorização de cópia vigente. A busca por
título e a releitura por identidade usam o mesmo leitor paginado; visibilidade
pública sozinha não concede cópia. Essa preparação não grava o destino. Ao
confirmar, o comando existente confere novamente acesso e revisão da origem;
reconectar não concede uma permissão de curso ausente.

O endereço hospedado do servidor é:

`https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-mcp`

Depois de uma publicação que altere o catálogo:

1. use **Refresh** no app AraLearn nas configurações do ChatGPT;
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
somente o contexto pertinente. A recomendação publicada do ChatGPT é manter os
primeiros 512 caracteres autossuficientes, não limitar todo o campo a esse
tamanho. A atualização do app recupera também instruções e descrições das
ferramentas. [OpenAI: Developer mode](https://developers.openai.com/api/docs/guides/developer-mode).

Orçamentos locais de catálogo e medições de carga não são limites universais do
MCP. Registre o artefato efetivamente carregado e a aceitação em conversa nova;
um teste local de protocolo não comprova essa etapa. O
[roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais)
separa medidas mecânicas, estimativas e observação do cliente real.

Há também uma fronteira entre o schema servido e a validação feita pelo
conector. Se um campo obrigatório no catálogo vivo for rejeitado pelo cliente
como propriedade adicional, preserve o pedido e o erro sanitizados e compare
os contratos antes de alterar o conteúdo. Não remova uma referência pedagógica
necessária apenas para passar nessa validação. Atualizar as ferramentas na
página de detalhes do app recupera ferramentas, descrições e instruções do
servidor, conforme a [documentação de gestão do app](https://developers.openai.com/api/docs/guides/developer-mode).
A confirmação exige uma conversa nova e nova prova da chamada.
Uma indicação genérica de restrição do workspace no erro não identifica, por
si só, a configuração que causou a divergência.

## Verificação local

```powershell
npm run test:authoring:contract
npm run test:authoring:mcp
deno test --config supabase/functions/deno.json `
  supabase/functions/tests/aralearn-authoring-mcp.test.ts
```

Essas verificações conferem catálogo, seleção por intenção, desambiguação,
autorização e paridade com Actions. A jornada em cliente real é executada depois
da publicação deliberada.

## Referências técnicas

- [Model Context Protocol](https://modelcontextprotocol.io/specification/latest)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
