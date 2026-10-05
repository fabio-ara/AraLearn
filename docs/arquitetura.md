# Arquitetura do AraLearn

O AraLearn mantém no servidor o curso que a pessoa planeja, inspeciona e revisa com
assistência de inteligência artificial (IA). O aplicativo apresenta esse conteúdo para
estudo e conserva no dispositivo a cópia necessária para continuar mesmo quando a rede
falha. A aplicação em que ocorre a conversa pode mudar; o curso e suas relações
permanecem no AraLearn.

No servidor, o [PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html),
sistema de banco de dados relacional, guarda o conteúdo e as relações entre os objetos.
O [Storage do Supabase](https://supabase.com/docs/guides/storage), serviço de armazenamento
de arquivos, conserva os documentos e as gravações de áudio em áreas privadas. O banco
registra a que curso pertencem e quem pode abri-los. No dispositivo, o navegador
apresenta **Estudo** e **Autoria** e mantém os dados locais.

Aplicações externas de IA chegam ao mesmo servidor por dois canais. O
[Model Context Protocol (MCP)](autoria-mcp.md) permite descobrir e chamar ferramentas;
o canal [Actions](autoria-actions.md) usa operações descritas em OpenAPI, um formato
para documentar pedidos e respostas de uma interface de programação. Nos dois casos,
as regras de conteúdo e autorização são as mesmas aplicadas à interface do AraLearn.

A [matriz técnica](matriz-conformidade-tecnica.md) relaciona capacidades e
verificações. A [história do esquema](schema-change-log.md) registra sua evolução.

## O curso como raiz

O curso é o ponto de ligação dos dados. Seu percurso possui vários níveis, do curso às
unidades de estudo (`StudyUnit` no código). Nesse conjunto, uma **microssequência**
reúne unidades que desenvolvem um objetivo delimitado. O
[modelo didático](modelo-didatico.md) explica a função de cada nível.
O mapa curricular antecipa o percurso completo. As **partes de autoria** agrupam
microssequências já previstas para produção e inspeção em conjunto; partes sucessivas
podem formar um lote. Esses agrupamentos coordenam o trabalho e permanecem separados
da hierarquia curricular, conforme [Autoria contextual](autoria-contextual.md).

O plano também acompanha os conhecimentos que precisam ser desenvolvidos no curso.
Cada recorte recebe uma identidade no repertório `instructionalAnalysisUnits`, o que
permite registrar onde é introduzido, utilizado ou retomado. Um **requisito de
evidência** descreve a operação que a prática deverá solicitar para examinar um
objetivo. O [desenho instrucional](desenho-instrucional-parametrizado.md) relaciona
esses registros ao planejamento do ensino e das atividades.

Os [parâmetros](parametros-de-autoria.md) registram escolhas para a produção, enquanto
as orientações editoriais descrevem como desenvolver o texto. As
[fontes e seus vínculos](fontes-e-citacoes.md) identificam os materiais utilizados e
as passagens que sustentam o conteúdo. Documentos e arquivos de áudio podem acompanhar
esses registros. Observações ligadas aos objetos permitem solicitar e acompanhar
correções.

Título e objetivo identificam o curso. Propriedade, visibilidade e concessões de
acesso determinam quem pode lê-lo ou alterá-lo. O estado de estudo de cada pessoa
fica separado: avançar numa atividade conserva o curso dos demais leitores.

O proprietário inspeciona e revisa o conteúdo salvo. O acesso ao curso e a declaração
humana de revisão são decisões independentes: a política padrão permite estudar o
conteúdo salvo; a opção `reviewed_only` restringe a leitura ao conteúdo com revisão
atual. Visibilidade pública, concessões individuais e acesso aos arquivos possuem
controles próprios. A revisão modifica o curso existente, em vez de criar uma árvore
de versões.

A microssequência pode receber primeiro uma proposta de explicação,
`explanationPlan`, e depois sua base explicativa, `explanation`, que pode combinar
texto, representações visuais e áudio. Essa
[explicação](explicacao-e-revisao-humana.md) desenvolve o assunto antes ou junto das
unidades; cada unidade registra qual base foi usada na sua produção. Em Estudo, o
conteúdo abre sobre a unidade corrente e utiliza os mesmos mecanismos de componentes,
ferramentas e citações das unidades, com suas próprias referências bibliográficas.

As fontes ligadas a essa base usam o alvo `microsequence_explanation`, com ocorrências
localizadas na própria explicação. Seu conteúdo integra a cópia local do curso.
Documentos anexados e arquivos de áudio são obtidos separadamente, mediante
autorização do servidor e acesso à rede. A leitura local preserva uma única versão
coerente do curso.

Cada explicação e unidade tem seu próprio `contentReview`, separado do conteúdo
editável. A declaração de revisão compara uma impressão digital do conteúdo e das
fontes inspecionados com o estado corrente. Uma mudança material torna a marca
anterior desatualizada. O proprietário pode registrar ou retirar sua declaração na
interface; MCP e Actions executam essa decisão após sua manifestação expressa.
A declaração é uma operação própria, distinta de gerar, corrigir ou importar o
conteúdo. Se o resultado da gravação ficar incerto, o pedido conserva sua identidade
para [recuperação e conferência](persistencia-relacional.md#escritas-concorrentes).

## Inspeção pedagógica por IA

Uma atividade pode aceitar dados válidos e ainda exigir algo que a explicação deixou
de ensinar. Para examinar essa relação, a inspeção por IA lê o alvo dentro de sua
microssequência. Ela considera o público e o planejamento, confronta a explicação
com as unidades na ordem salva e consulta a configuração aplicada e as fontes.
A base inclui também as explicações das dependências curriculares necessárias ao foco.

O parecer examina a correspondência entre o objetivo e a operação solicitada, assim
como o que a resposta permite observar. Também avalia a representação, o retorno
oferecido ao estudante e a suficiência do desenvolvimento. Por fim, confronta as
escolhas aplicadas com sua realização no conteúdo. A
[referência dos seis critérios](auditoria-de-conformidade-instrucional.md#inspeção-por-ia-sobre-o-conteúdo-salvo)
explica os julgamentos e as evidências exigidos. Na inspeção da explicação, os
critérios sobre prática usam as respostas e os retornos das unidades da
microssequência. O servidor confere a estrutura do parecer, a presença dos trechos
citados e as contradições que consegue verificar. O julgamento pedagógico é
atribuído ao assistente que produziu o parecer.

Cada explicação ou unidade conserva seu próprio registro `ai_inspection`. A impressão
digital `basisHash` identifica o conjunto examinado. Uma mudança nesse conjunto pode
deixar pendentes vários pareceres da mesma microssequência, mesmo quando apenas uma
unidade foi editada. O estado `current` informa que a base continua igual; o resultado
do parecer informa se há ressalvas. A declaração humana e a política de acesso
permanecem decisões próprias, como explica [Explicação e revisão
humana](explicacao-e-revisao-humana.md).

## Áreas do produto

**Estudo** apresenta os cursos acessíveis e permite percorrer o conteúdo e responder
às práticas. O progresso pessoal e as marcas para rever organizam a retomada;
as observações registram dúvidas ou problemas junto do conteúdo. Um curso
compartilhado pode ser estudado sem conceder autoria no original.

Somente o proprietário edita, inclusive quando está em Estudo. Estudantes podem enviar
suas próprias observações; visitantes estudam cursos públicos e conservam progresso e
marcas no dispositivo. O catálogo compacto inclui cursos públicos e consulta os
mesmos registros que determinam o conteúdo e o acesso.

Uma ação explícita pode copiar um curso próprio ou um curso cujo proprietário concedeu
permissão de cópia. O resultado tem nova identidade, pertence à pessoa solicitante e
começa privado, com arquivos restritos. A cópia preserva estrutura, inventário,
conteúdo, configuração, fontes e arquivos; acessos de outras pessoas e estado de estudo
permanecem na origem. Leitura pública não concede permissão de cópia.

A [persistência das cópias](persistencia-relacional.md#cópia-independente) também
preserva os cursos criados por versões anteriores e permite recuperar tentativas
cujo resultado ainda não foi confirmado.

**Autoria** apresenta apenas cursos próprios. O curso abre diretamente em **Conteúdo**;
**Conteúdo** e **Planejamento** permanecem no cabeçalho. O menu reúne **Parâmetros**,
**Fontes**, **Áudio**, **Revisão**, **Dados de autoria** e **Pessoas e acesso**.
A composição prioriza o celular, mantém a coluna estreita e usa uma única área
principal de rolagem vertical.

A visão múltipla permite comparar unidades; a seleção escolhe os alvos de uma
observação em lote. São estados independentes. O comando de uma unidade pode
concentrar a leitura nela, em vez de retornar a uma unidade de referência fixa.
A edição em Conteúdo é manual; a conversa e a prévia de **Assistência por IA**
pertencem a Estudo. Os painéis de consulta preservam o ponto de leitura, o rascunho e
o trecho em trabalho. Abrir um painel conserva o estado do formulário, sem registrar
uma alteração apenas pela consulta.

A autoria por conversa complementa esses espaços. O assistente pode planejar e
produzir o material, consultar suas fontes e tratar observações. A interface permite
localizar, ler e revisar o resultado no contexto.

<a id="um-catálogo-humano-para-mcp-e-actions"></a>

## Um catálogo de tarefas para MCP e Actions

MCP e Actions são formas distintas de comunicar pedidos ao mesmo catálogo de tarefas
de autoria. O arquivo `courseHumanTasks.js` define, para cada tarefa, seu nome, seus
argumentos e o efeito esperado. O MCP publica essa definição diretamente. Para
Actions, um gerador a converte em OpenAPI, formato que descreve operações HTTP,
usadas na comunicação entre o cliente e o serviço. Os dois canais derivam, assim,
da mesma definição.

O catálogo acompanha o percurso inteiro de autoria. Retomar um curso, gravar as
unidades de uma parte e tratar uma observação são exemplos de tarefas que chegam aos
mesmos casos de uso da aplicação. Ele também cobre preferências reutilizáveis e
operações sobre o curso completo, como copiar, comparar e exportar, sempre com a
autorização própria da operação.

Os argumentos públicos permitem identificar o objeto por título, posição ou
referência devolvida pelo serviço. A camada de execução em
`courseHumanTaskExecutor.js` resolve essas indicações para as identidades e versões
internas. Também identifica o pedido para permitir sua repetição segura e relê o
estado quando encontra uma alteração concorrente. Uma indicação ambígua exige
esclarecimento antes de escolher o objeto.

Uma resposta comum contém resultado, link direto ao objeto e uma próxima decisão,
quando necessária. O contexto estruturado pode acompanhar a leitura como dados de
apoio; a resposta em linguagem natural apresenta o que a pessoa precisa examinar.

## Fluxo entre navegador e Supabase

Ao salvar uma edição, a interface precisa enviar a mudança, conferir se a pessoa
ainda pode realizá-la e receber o resultado para atualizar a cópia local. O
`CourseController` coordena esse percurso no navegador. O `CourseApiClient` envia
o pedido pela rede à função `aralearn-course-api`; no servidor, o `courseRouter`
seleciona a operação e o `CourseSupabaseAdapter` a traduz para o banco.

O adaptador chama funções escritas em SQL, a linguagem de consulta e alteração do
banco, usando credencial mantida no servidor. A função SQL volta a verificar
propriedade, versão e formato e executa uma transação: as alterações relacionadas
são confirmadas juntas ou desfeitas em caso de falha. Esse desenho evita conceder
acesso direto às tabelas privadas e mantém a decisão de autorização junto do dado.

Visitantes alcançam somente chamadas remotas de procedimento (RPCs) de leitura, que
selecionam os dados permitidos e verificam o acesso. A escrita exige uma pessoa
autorizada para o curso e a operação. O perfil usa um identificador público escolhido
pela pessoa e uma imagem opcional, o avatar. A busca de pessoas e a concessão de
acesso privado ocorrem no contexto do curso do proprietário; o aplicativo não oferece
um diretório geral de contas. O Storage permanece privado, inclusive para cursos públicos.

OAuth permite que a pessoa conecte uma aplicação à sua conta sem entregar a senha da
conta a essa aplicação. O MCP usa `aralearn-authoring-mcp` e OAuth 2.1. Actions usa
`aralearn-authoring-action` e uma autorização própria para a aplicação externa.
Cada canal aceita somente as credenciais emitidas para ele.

## Estrutura e leitura paginada

A composição curricular usa registros ligados ao curso. Para obter um curso extenso,
o cliente recebe o conteúdo em páginas sucessivas. As leituras de Estudo e Conteúdo
validam que todas pertencem à mesma revisão técnica. Um link direto pode indicar a
unidade inicial sem incluir o **cursor**, referência temporária que indica de onde
continuar essa consulta paginada.

Conteúdo mantém somente uma janela de unidades no **DOM**, a estrutura da página
mantida pelo navegador. A pesquisa e o índice permitem chegar a qualquer unidade,
inclusive anterior. A apresentação usa o mesmo mecanismo de Estudo, mas as respostas
ficam inativas durante a inspeção autoral.

## Mapa global e produção incremental

O plano conserva o que é necessário para orientar o curso antes e durante a produção:
para quem ele se destina, o que precisa ensinar e como esse percurso será distribuído.
O [contrato do plano](aralearn-contract.md#curso-e-estrutura) registra os campos
completos. No mapa, cada item obrigatório do escopo aponta primeiro para os pontos em
que será ensinado e, depois da produção, para as unidades que o desenvolveram.

O mesmo mapa pode existir como rascunho ou aprovado. A aprovação se refere ao mapa
completo que a pessoa pôde inspecionar. As partes agrupam microssequências já
pertencentes a ele para planejamento focal, produção e revisão. Por padrão, a
produção aguarda a aprovação do mapa. Uma autorização expressa para produção
autônoma permite trabalhar com o mapa em rascunho e conservar esse estado.

Com mapa existente e percurso autorizado, a preparação reúne o lote, sua configuração
e o repertório necessário. As pausas decorrem das decisões ainda abertas e dos
pontos de inspeção acordados, em vez de serem exigidas apenas pelo tamanho do lote.
A gravação coordenada das unidades, das aplicações de desenho e dos vínculos com as
fontes é chamada de **materialização** e ocorre numa transação. Ela pode usar uma
explicação já salva e coerente com a base preparada; uma base nova ou alterada precisa
ser incluída e validada. Também atualiza, a partir do estado corrente, onde cada
conhecimento foi introduzido, utilizado ou retomado.

A quantidade de unidades decorre do conteúdo e das condições de desenho. O teto de
novas unidades de análise orienta a distribuição da novidade, preservando o
inventário e a profundidade necessária.

## Desenho aplicado à unidade de estudo

O catálogo único de parâmetros define os valores aceitos, os locais em que se aplicam
e os rótulos usados pela interface, integrações e banco. Parâmetros e direção
editorial possuem uma atribuição corrente por escopo, isto é, pelo trecho do curso
que a escolha orienta. Limpar uma definição remove a atribuição local e restaura a
herança do nível mais amplo. O banco passa a representar esse estado corrente.

Quando uma unidade de estudo é materializada, ela guarda as escolhas efetivamente
usadas na produção. Esse registro focal, chamado *snapshot* no código, reúne os
conhecimentos e requisitos pertinentes, a configuração adotada, os componentes e a
prática prevista para a unidade. Os [dados de autoria](analytics-instrucionais.md)
usam esses registros para apresentar as decisões aplicadas, sem precisar conservar
o contexto de execução da parte inteira.

Uma edição focal preserva literalmente o snapshot histórico. Já a descrição de como
o desenho se realiza no conteúdo só continua corrente enquanto o conteúdo e a
hierarquia que a sustentavam permanecem iguais, descontada uma mudança de título.
Uma alteração substantiva invalida essa relação. A data registrada continua sendo a
da análise realizada; uma nova análise exige seu próprio registro.

Conhecimentos introduzidos são guardados separadamente dos conhecimentos já
estabelecidos que a unidade utiliza. Retomadas são derivadas das explicações de
conhecimentos estabelecidos. Sua identidade, nome, descrição curta e referências às
unidades permitem acompanhar o repertório ao longo do curso.

No modo automático, o assistente escolhe os valores antes da produção, considerando
o conteúdo, a função da unidade e o repertório acumulado. A intenção pode manter um
valor em aberto, representado por `null`; o snapshot aplicado exige um valor e sua
justificativa. A ausência de atribuição local significa herança. Fixações de autoria
e pesquisa prevalecem sobre o ajuste automático, e escolhas incompatíveis com uma
condição de pesquisa exigem resolução antes da aplicação. Os alvos de palavras
orientam a distribuição do texto, preservado o desenvolvimento necessário.

Perfis de autoria guardam preferências da conta em campos com tipos definidos.
Aplicar um perfil copia essas preferências para o curso numa transação que confere
as revisões de ambos. As exceções existentes são preservadas ou retiradas por
seleção explícita, com proteção das condições de pesquisa. Cada curso conserva uma
cópia independente: editar ou excluir o perfil mantém as cópias já aplicadas. A
aplicação orienta trabalhos posteriores e preserva o conteúdo e os snapshots existentes.

O mapa global antecede os lotes, e cada aprovação se refere ao material que a pessoa
pôde inspecionar. A distribuição do conteúdo, as formas explicativas e a prática
continuam ajustáveis à luz dos princípios pedagógicos e da avaliação do curso.

## Concorrência e repetição segura

Duas sessões podem editar o mesmo curso. Para detectar uma alteração feita desde a
última leitura, cada curso possui um número crescente de **revisão técnica**.
Objetos editáveis também possuem uma versão corrente quando necessário. Essa
numeração acompanha mudanças nos dados e se distingue da declaração humana de revisão.

Uma escrita informa o estado que leu. Se o objeto mudou, o cliente precisa tratar o
conflito antes de gravar o rascunho. Por exemplo, uma pessoa pode salvar uma explicação
numa aba enquanto outra ainda mostra o texto anterior. A segunda aba precisa reler
a mudança antes de gravar uma edição incompatível. Uma reconstrução automática só
cabe quando conserva a intenção verificável; nos demais casos, a edição permanece
disponível para comparação e decisão.

Outro problema ocorre quando o banco salva a edição, mas a resposta não chega ao
dispositivo. Um recibo temporário identifica o pedido e permite recuperar seu
resultado sem duplicar o efeito. Os recibos servem à recuperação durante seu prazo
de retenção e são removidos quando expiram. A cópia independente conserva ainda, no
curso de destino, sua origem e a identidade do pedido. Esse registro permite
reconhecer a mesma cópia após a expiração do recibo ou a perda de acesso à origem.
Sem essa comprovação e fora da janela admitida, o pedido é recusado para impedir a
criação de outro curso; consulte [persistência](persistencia-relacional.md#cópia-independente).

## Fontes, âncoras e arquivos

Uma [fonte](fontes-e-citacoes.md) identifica o material utilizado; uma âncora localiza
uma página, seção ou trecho desse material. Ambas guardam o estado corrente, e suas
versões permitem conferir alterações concorrentes e resolver links diretos. Uma
atribuição liga a fonte e suas âncoras a um item do plano, a uma explicação ou a uma
unidade de estudo. Cada vínculo possui identidade e papéis explícitos.

O vínculo pode indicar ocorrências em campos de texto declarados pelos componentes,
chamados de **folhas textuais** no contrato. Se uma edição tornar ambíguo o trecho
citado, o sistema conserva o vínculo como pendência de revisão. A citação manual
preserva seu texto; a citação gerada usa os metadados e o estilo escolhido no curso.
Observações autorais pendentes podem conservar uma base anterior para comparação,
incluindo vínculos e arquivos. Essas bases são liberadas conforme as decisões sobre
os alvos.

Na autoria por MCP e Actions, uma ocorrência nova é declarada pelo recurso e pelo
trecho literal. O servidor encontra a folha textual no registro do componente.
Assim, o assistente identifica a passagem por seu conteúdo, e o servidor resolve o
campo interno. Ausência ou ambiguidade impede gravar essa ocorrência e devolve o
contexto necessário para corrigi-la. Os vínculos já salvos continuam preservados
quando uma edição posterior torna seu trecho não localizável.

Os documentos anexados utilizam o formato PDF. Seus dados binários, ou bytes, ficam
na área privada de arquivos `course-source-pdfs`; esse tipo de área recebe o nome
*bucket* no Storage. O banco conserva o descritor e o vínculo ativo ou removido.
Antes de ativar o vínculo, o serviço confere se recebeu o arquivo esperado. Para
isso, calcula e verifica SHA-256, uma impressão digital dos bytes, registra uma
intenção temporária para controlar a cota e as operações concorrentes, envia o
arquivo pela Storage API e relê o objeto recebido.

A remoção conserva uma marca relacional de retirada, chamada *tombstone*, e uma
intenção temporária de limpeza. Depois da transação, o adaptador assume essa tarefa,
revalida que nenhum vínculo ativo usa o objeto, remove-o pela interface do Storage
e confirma a conclusão. Essa interface de programação (API) é o único caminho usado
para alterar os bytes. Reanexar o mesmo conteúdo reativa o vínculo após nova verificação.

Áudio usa `course-media`, com WAV PCM ou MP3, descritor lógico e referência na unidade
ou explicação. Documentos e arquivos de áudio compartilham a cota do curso. Uma
cópia independente pode referenciar os mesmos bytes imutáveis: a autorização depende
do curso consultado, e não do prefixo físico do objeto. A exclusão de um curso ou de
uma conta e a limpeza de arquivos sem vínculo conferem todas as referências e
reservas antes de remover o arquivo. Os detalhes estão em
[Supabase](supabase.md#storage-bytes-privados-e-vínculo-relacional).

## Observações e revisão

Uma observação autoral expressa uma intenção e pode reunir até 64 alvos, entre
explicações e unidades. Cada alvo conserva sua base anterior e recebe uma decisão
própria. A caixa de observações apresenta o conjunto e permite trabalhar por recorte.
Observações de estudantes permanecem vinculadas ao alvo individual.

A preparação da revisão inclui unidades relacionadas pela progressão, pelos
pré-requisitos ou pela prática. A aplicação grava as correções; a releitura e a
inspeção examinam seus efeitos. A decisão humana posterior pode aceitar o conteúdo
vigente ou encerrar o apontamento naquele alvo sem alteração, preservando os demais
alvos pendentes. Essa relação entre a observação e cada alvo é chamada de
**incidência**, conforme [Observações](observacoes-pedagogicas.md).

Ao decidir um alvo, o sistema libera sua referência à base anterior. Bases
compartilhadas e arquivos são conservados enquanto outro alvo precisar deles.
Quando todos os alvos terminam, o texto da observação é removido e o registro terminal
entra na retenção de 14 dias. Uma nova intenção sobre um alvo já decidido recebe nova
observação.

## Dados de autoria

O painel **Dados de autoria** apresenta contagens derivadas do estado salvo, chamadas
de *analytics* no código. A pessoa escolhe uma dimensão e um recorte do curso. Uma
dimensão pode mostrar, por exemplo, como os conhecimentos se distribuem pelas unidades
ou como as práticas usam os componentes. Outro grupo descreve intervenções de autoria,
como observações e a origem registrada da última revisão.

A exportação em JSON, formato de dados estruturados, reúne a análise, o documento
literal do curso e os metadados de suas fontes. Estado pessoal, contas e bytes de
arquivos ficam nos serviços responsáveis por eles. A comparação confronta os
inventários completos e os recortes selecionados, distingue parâmetros solicitados
e aplicados e informa ausências. Para avaliar equivalência pedagógica, é preciso
examinar também o significado do conteúdo e das atividades.

## Réplica local e funcionamento sem rede

[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API), a API do
navegador para guardar dados estruturados, conserva a composição validada do curso.
Também mantém o progresso, a posição e as marcas para rever, além das observações
próprias e das escritas delimitadas que aguardam confirmação. `BroadcastChannel`
informa outras abas sobre mudanças locais. A
[persistência relacional](persistencia-relacional.md#continuidade-entre-abas)
explica essa coordenação.

No modo automático, recuperar o foco, voltar a uma aba ou restabelecer a conexão
pode provocar uma releitura. O modo manual suspende as atualizações automáticas de
conteúdo e o envio das filas pessoais; o controle com ícone de nuvem permite
solicitar a sincronização. Escritas explícitas e verificações de acesso continuam
sujeitas à rede. Uma atualização preserva rascunhos e conflitos ainda em tratamento.

As leituras de curso têm prazos para obter a sessão e para concluir a comunicação,
incluindo a leitura do corpo da resposta. Falhas recuperáveis admitem repetição
limitada. O cabeçalho `Retry-After`, quando recebido, indica quanto aguardar antes
de tentar novamente, respeitado o tempo máximo de espera da operação. A pessoa pode
solicitar uma nova leitura sem depender de outro evento `online` do navegador.

Uma revisão que muda durante a leitura exige obter novamente uma composição
coerente. Respostas anteriores não substituem o alvo atual ou um cabeçalho mais
recente. Uma recusa de autenticação ou acesso impede expor a cópia privada.
A interface distingue leitura em curso, resultado vazio confirmado, cópia local,
falha do serviço e sinal de ausência de rede. Um erro no serviço pode ocorrer mesmo
com conexão à Internet; por isso, esses estados são apresentados separadamente.

O servidor determina a propriedade e o acesso. Um curso revogado deixa de abrir
depois da validação conectada, mesmo que exista uma cópia local anterior.

## Componentes didáticos

[Pacotes versionados](componentes-didaticos.md) implementam representações e formatos
de resposta. O catálogo informa a função e o contrato de cada componente. A escolha
segue o papel instrucional: um parágrafo, uma tabela ou um diagrama podem atender a
relações diferentes. `paragraph` e `choice` integram esse catálogo e são escolhidos
pelos mesmos critérios, em vez de substituir automaticamente outros formatos.

Os módulos compartilhados possuem uma cópia de execução nas Edge Functions, as funções
remotas do Supabase. `resources:sync-edge` atualiza essa cópia a partir das fontes em
`src/`; os verificadores de preparação conferem a correspondência. Assim, navegador
e servidor recebem os mesmos contratos de conteúdo.

O registro delega aos contratos dos pacotes a validação das relações da unidade,
a preparação do conteúdo, a interação de resposta e a conferência das edições.
O editor trabalha com as folhas textuais declaradas por cada pacote; as regras de
edição vêm desse contrato, em vez de serem escolhidas pelo nome do pacote.
A composição e as posições disponíveis para conteúdo, resposta e retorno continuam
comuns. Uma extensão compatível acrescenta seu registro e seus arquivos; uma nova
capacidade da aplicação exige contrato e código que a utilize. O curso não fornece
código livre para execução.

## Segurança por fronteira

Cada parte recebe somente a autoridade necessária para cumprir sua função. As
fronteiras abaixo separam chaves de cliente de acesso administrativo e limitam
quais dados podem ser obtidos por uma leitura pública:

- o esquema `public`, agrupamento de tabelas e funções do banco, expõe apenas relações
  deliberadas e combina privilégios explícitos com
  [segurança em nível de linha (RLS)](supabase.md#postgresql-esquemas-e-autorização);
- `private` fica fora da interface de dados (Data API), e suas tabelas usam RLS como
  defesa adicional;
- funções `security definer` executam com os direitos de seu proprietário;
  fixam onde procurar objetos (`search_path`), validam a identidade e limitam
  quem pode chamá-las;
- Storage usa buckets privados e políticas por vínculo;
- site e pacote Android (APK) recebem apenas URL e chave publicável;
- segredos administrativos permanecem nas Edge Functions;
- exclusão de conta e remoção de arquivos sem vínculo revalidam os objetos antes de
  apagar seus bytes.

## Backup e evolução

Migrações, os arquivos SQL versionados em `supabase/migrations`, reproduzem o esquema
do banco. O manifesto informa a revisão e as capacidades exigidas pelos clientes e só
avança depois que a capacidade inteira está instalada. A nova versão do cliente
confere esse manifesto e interrompe a operação se o banco for incompatível.

Uma exportação de backup, ou dump, do PostgreSQL preserva dados relacionais e
metadados. A recuperação completa exige também uma cópia dos bytes do Storage.
O ensaio `test:backup-restore:local` restaura um conjunto sintético integrado de dados
numa instância descartável sem rede, confere a versão histórica de referência e aplica
as migrações posteriores até o manifesto corrente. Ao final, verifica os dados úteis
e sua leitura pelos clientes atuais. O teste `test:storage:lifecycle:local` exercita
a gravação, a leitura e a remoção dos bytes pela API do Storage.

## Mapa do código

| Responsabilidade | Fonte principal |
| --- | --- |
| domínio do navegador | `src/domain/` |
| controlador e cliente Supabase | `src/supabase/` |
| Estudo e réplica local | `src/study/` e `src/persistence/` |
| interface de Autoria | `src/ui/CourseAuthoringSurface.js` e painéis focais |
| catálogo MCP/Actions | `supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js` |
| resolução confiável | `courseHumanTaskExecutor.js` e casos de uso focais |
| bordas HTTP | `courseApiServer.js`, `mcpServer.js` e `courseActionServer.js` |
| persistência remota | `courseSupabaseAdapter.js` e migrations |
| contratos de componentes | `src/resources/` e cópia compartilhada em `supabase/functions/_shared/aralearn/runtime/` |
| inspeção pedagógica por IA | `src/domain/courseContentInspection.js`, `coursePedagogicalAudit.js` e base focal nas migrações |

Consulte [Supabase no AraLearn](supabase.md) para operação local, Storage e
implantação; [Persistência relacional](persistencia-relacional.md) para a réplica e as
transações; e [Autoria pelo MCP](autoria-mcp.md) para o protocolo conversacional.
