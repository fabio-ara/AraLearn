# Arquitetura do AraLearn

O AraLearn mantém no servidor o curso que a pessoa planeja, inspeciona e revisa com
assistência de inteligência artificial (IA). O aplicativo apresenta esse conteúdo para estudo no celular e
conserva uma cópia local para continuidade sem rede. A conversa pode mudar de cliente;
o curso e suas relações permanecem no aplicativo.

A arquitetura separa quatro responsabilidades:

- [PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html), sistema de
  banco de dados relacional, guarda o conteúdo e as relações entre os objetos;
- [Storage do Supabase](https://supabase.com/docs/guides/storage) guarda os
  arquivos em áreas privadas, com acesso autorizado pelo servidor;
- o navegador apresenta **Estudo** e **Autoria** e conserva os dados locais;
- clientes externos de IA enviam pedidos de autoria por [MCP](autoria-mcp.md),
  protocolo de descoberta e chamada de ferramentas, ou por operações descritas em
  [OpenAPI](autoria-actions.md), usadas pelo canal Actions. Os pedidos passam pelas
  mesmas regras de conteúdo e autorização da interface.

A [matriz técnica](matriz-conformidade-tecnica.md) relaciona capacidades e
verificações. A [história do esquema](schema-change-log.md) registra sua evolução.

## O curso como raiz

O curso é o ponto de ligação dos dados. A [hierarquia didática](modelo-didatico.md)
organiza o percurso; o plano antecipa o que será ensinado. Unidades de análise
identificam as ideias acompanhadas no percurso, e requisitos de evidência indicam o
que uma prática deve permitir observar.

A estrutura organiza módulos, lições, microssequências e unidades de estudo
(`StudyUnit` no código). O mapa curricular antecipa esse percurso; as partes de
autoria agrupam a produção de trechos já previstos. O repertório de unidades de
análise (`AnalysisUnit`) permite acompanhar em que ponto uma ideia é introduzida ou
usada novamente.

Os [parâmetros](parametros-de-autoria.md) orientam conteúdo, prática, conversa e ritmo
de produção. As orientações editoriais qualitativas complementam essas escolhas.
[Fontes e seus vínculos](fontes-e-citacoes.md) registram os materiais utilizados e
as passagens que sustentam o conteúdo; PDFs e áudios podem acompanhar esses registros.
Observações ligadas aos objetos permitem solicitar e acompanhar revisões.

Título e objetivo identificam o curso. Propriedade, visibilidade e concessões de
acesso determinam quem pode lê-lo ou alterá-lo. O estado de estudo de cada pessoa
fica separado: avançar numa atividade não altera o curso dos demais leitores.

O proprietário inspeciona e revisa o conteúdo salvo. O acesso ao curso e a declaração
humana de revisão são decisões independentes: a política padrão permite estudar o
conteúdo salvo; a opção `reviewed_only` restringe a leitura ao conteúdo com revisão
atual. Visibilidade pública, concessões individuais e acesso aos arquivos possuem
controles próprios. Revisar o conteúdo mantém o mesmo curso, sem criar uma árvore de
versões.

A microssequência guarda uma base explicativa, `explanation`, e sua proposta,
`explanationPlan`. Essa [explicação](explicacao-e-revisao-humana.md) pode ser
desenvolvida antes das unidades; elas registram a base usada na sua produção. Em
Estudo, ela abre numa sobreposição que usa os mesmos componentes, ferramentas e
recursos bibliográficos das unidades. Fontes e ocorrências usam o alvo
`microsequence_explanation`, com localizações no texto-base, e os arquivos
passam pelas autorizações existentes. O texto acompanha a composição local; isso não
cria cache binário de PDF ou áudio nem permite misturar revisões do curso.

Cada explicação e unidade tem seu próprio `contentReview`, separado do conteúdo
editável. A declaração de revisão compara uma impressão digital do conteúdo e das
fontes inspecionados com o estado corrente. Uma mudança material torna a marca
anterior desatualizada. A pessoa proprietária pode registrar ou retirar sua declaração
na interface; MCP e Actions podem executar essa decisão somente após sua manifestação
expressa. Gerar, corrigir ou importar conteúdo não declara revisão por implicação. Uma
resposta incerta conserva a identidade do pedido para
[reconciliação](persistencia-relacional.md#escritas-concorrentes).

## Áreas do produto

**Estudo** apresenta os cursos acessíveis, a hierarquia curricular, uma unidade de
estudo por vez, prática, progresso pessoal, marcas para rever e observações. Um curso
compartilhado pode ser estudado sem conceder autoria no original.

Somente o proprietário edita, inclusive quando está em Estudo. Estudantes podem enviar
suas próprias observações; visitantes estudam cursos públicos e conservam progresso e
marcas no dispositivo. O catálogo compacto também inclui cursos públicos, sem criar
uma autoridade de conteúdo separada.

Uma ação explícita pode copiar um curso próprio ou um curso cujo proprietário concedeu
permissão de cópia. O resultado tem nova identidade e pertence à pessoa solicitante;
começa privado, com arquivos restritos. Estrutura, inventário, conteúdo, configuração,
fontes e arquivos são preservados, enquanto acessos e estado pessoal permanecem na
origem. Leitura pública não concede essa permissão.

A [persistência das cópias](persistencia-relacional.md#cópia-independente) também
preserva os cursos criados por versões anteriores e permite recuperar tentativas
cujo resultado ainda não foi confirmado.

**Autoria** apresenta apenas cursos próprios. O curso abre diretamente em Conteúdo;
Conteúdo e Planejamento permanecem no cabeçalho; o menu reúne **Parâmetros**,
**Fontes**, **Áudio**, **Revisão**, **Dados de autoria** e **Pessoas e acesso**. A composição prioriza o
celular, mantém a coluna estreita e usa uma única área principal de rolagem vertical.

Na inspeção, visão múltipla e seleção para observações em lote são estados distintos.
O comando de uma unidade pode focalizá-la sem retornar a uma unidade de referência
fixa. A edição dessa superfície é manual; o estado e a prévia de Assistência por IA
pertencem à aplicação de Estudo. Consultas contextuais preservam foco, rascunho e
escopo, e a simples abertura de uma folha não marca um formulário como alterado.

A autoria por conversa complementa essas superfícies. O assistente pode planejar,
produzir, consultar fontes, tratar observações e aplicar mudanças; a interface permite
localizar, ler e revisar o resultado no contexto.

## Um catálogo humano para MCP e Actions

MCP e Actions são formas distintas de comunicar pedidos ao mesmo catálogo de tarefas
de autoria. O catálogo `courseHumanTasks.js` define nome, descrição, estrutura dos
argumentos, efeito e indicações de uso. O MCP publica esse catálogo diretamente.
OpenAPI descreve caminhos, argumentos e respostas de operações HTTP; o gerador projeta
o catálogo nesse formato para Actions sem manter uma segunda definição.

As leituras retomam curso, consultam planejamento, preparam materialização, consultam
configuração e observações, preparam revisão e consultam fontes e componentes. As
escritas criam curso, salvam o mapa curricular, definem e materializam partes, ajustam
configuração, registram observações, aplicam correções, mantêm fontes e incorporam PDF
e áudio. Perfis guardam preferências reutilizáveis. Cópia, comparação e exportação
usam os mesmos casos de uso da aplicação, com autorização específica para cada
operação.

Argumentos públicos usam título, posição e referência humana. A camada confiável em
`courseHumanTaskExecutor.js` resolve identidades e versões, produz a identidade de
repetição e relê o estado quando há concorrência. Ambiguidade gera uma pergunta focal;
ela não autoriza escolher um objeto por acaso.

Uma resposta comum contém resultado, link direto ao objeto e uma próxima decisão,
quando necessária. Contexto estruturado pode acompanhar uma leitura sem ser repetido
como texto longo.

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

Visitantes alcançam somente funções remotas de leitura, chamadas RPCs, que selecionam
os dados permitidos e verificam o acesso. A escrita exige uma pessoa autorizada para o
curso e a operação. O perfil usa um identificador público escolhido pela pessoa e
avatar opcional; busca e concessão de acesso privado são delimitadas pelo curso do
proprietário, sem diretório geral de contas. O Storage permanece privado, inclusive
para cursos públicos.

OAuth permite que a pessoa conecte um cliente à sua conta sem entregar a senha da
conta a esse cliente. O MCP usa `aralearn-authoring-mcp` e OAuth 2.1. Actions usa
`aralearn-authoring-action` e uma autorização própria para o cliente externo de
Actions. Credenciais de um canal são
recusadas no outro.

## Estrutura e leitura paginada

A composição curricular usa linhas de entidade ligadas ao curso. Leituras de Estudo e
Conteúdo são paginadas e validam que todas as páginas pertencem à mesma revisão. Um
link direto pode indicar a unidade inicial sem incluir o cursor, referência temporária
que indica de onde continuar a consulta paginada.

Conteúdo mantém somente uma janela de unidades na estrutura da página, o DOM. Pesquisa
e índice permitem chegar a qualquer unidade, inclusive anterior. A apresentação usa o
mesmo mecanismo de Estudo, mas as respostas ficam inertes durante a inspeção autoral.

## Mapa global e produção incremental

O plano conserva público, pré-requisitos declarados, itens de escopo, mapa curricular,
repertório acumulado, requisitos de evidência e partes. O mapa organiza todo o curso
em módulos, lições e microssequências antes de qualquer materialização. Cada item
obrigatório do escopo aponta para os lugares do mapa em que será ensinado e, depois da
produção, para as unidades que o desenvolveram.

O mesmo mapa pode existir como rascunho ou aprovado. A aprovação é uma propriedade do
artefato completo que estava inspecionável; ela não aprova unidades futuras. Partes só
podem agrupar microssequências já pertencentes ao mapa aprovado. Elas descrevem lotes
de planejamento focal, produção e revisão, mas não acrescentam nível curricular.

Com mapa aprovado e percurso autorizado, a preparação reúne somente o lote, sua
configuração e o repertório necessário. O tamanho do lote não exige uma nova
confirmação por si só; uma decisão material ainda aberta continua exigindo
intervenção. A materialização grava as unidades, as aplicações de desenho e os
vínculos com as fontes numa transação. Ela pode usar uma explicação já salva e
coerente com a base preparada; uma base nova ou alterada precisa ser incluída e
validada. Também atualiza, por derivação do estado corrente, onde cada ideia foi
introduzida, usada ou retomada.

Não existe quantidade-alvo de unidades. O teto de novas unidades de análise muda a
distribuição da novidade, não o inventário nem a profundidade necessária.

## Desenho aplicado à unidade de estudo

O catálogo único define os valores aceitos, os locais em que se aplicam e os rótulos
usados pela interface, integrações e banco. Parâmetros e direção editorial possuem
atribuição corrente por escopo. Limpar uma definição restaura herança e remove a
atribuição local; não cria uma linha histórica de “limpeza”.

Quando uma unidade de estudo é materializada, ela guarda o recorte de desenho
efetivamente aplicado: ideias e requisitos pertinentes, valores pedagógicos, alvos
editoriais, direção editorial, componentes e oportunidades de prática. Esse registro
focal, ou snapshot, permite inspecionar as decisões aplicadas e calcular
[Analytics](analytics-instrucionais.md), as contagens do desenho e da autoria, sem
conservar o contexto de execução da parte inteira. Uma edição focal preserva
literalmente esse registro histórico. A aplicação só continua corrente quando conteúdo
e hierarquia que a sustentavam permanecem iguais, descontada a mudança de título; uma
mudança substantiva retira essa alegação corrente sem fabricar uma nova data de
análise.

Ideias introduzidas são persistidas separadamente das ideias estabelecidas que a
unidade apenas utiliza. Retomadas são derivadas das explicações de ideias já
estabelecidas. Identidade, nome, descrição curta e referências às unidades permitem
consultar o repertório a partir dos dados do próprio curso.

O modo automático delega ao assistente a escolha contextual, antes da produção, para a
microssequência ou unidade conforme conteúdo, função e repertório acumulado. A
intenção pode ter valor nulo; o snapshot aplicado exige valor e justificativa.
Ausência local significa herança. Fixações de autoria e pesquisa prevalecem sobre
calibração automática; exceções incompatíveis com pesquisa não podem aplicar-se
silenciosamente. Alvos de palavras não autorizam omissão ou compressão.

Perfis de autoria guardam somente preferências tipadas por conta. Aplicar copia as
preferências ao curso numa transação com comparação das revisões do perfil e do curso;
exceções são preservadas ou removidas por seleção explícita. Condições de pesquisa
ficam protegidas. Editar ou excluir um perfil não altera as cópias, e a aplicação não
reescreve conteúdo nem snapshots existentes.

O fluxo mantém três regras: planejar o mapa global antes dos lotes, aprovar somente o
que pode ser inspecionado e formular as decisões autorais em linguagem humana. A
distribuição do conteúdo, as formas explicativas e a prática podem ser ajustadas.
Princípios pedagógicos orientam essas decisões e sua avaliação.

## Concorrência e repetição segura

Cada curso possui revisão crescente; objetos editáveis também possuem uma versão
corrente quando necessário. Uma escrita informa o estado que leu. Se o objeto mudou, o
consumidor trata o conflito sem promover silenciosamente a revisão de um rascunho. Uma
reconstrução automática só cabe quando conserva a intenção verificável; caso
contrário, a edição permanece disponível para revisão.

Por exemplo, a pessoa pode salvar uma explicação numa aba enquanto outra ainda
mostra o texto anterior. A segunda aba precisa reler a mudança antes de gravar uma
edição incompatível. Essa comparação de revisões protege o trabalho concorrente.

Outro problema ocorre quando o banco salva a edição, mas a resposta não chega ao
dispositivo. Um recibo temporário por pedido permite recuperar resposta perdida sem duplicar
efeito. Recibos expirados são removidos pela retenção. Eles não formam um histórico
universal de mudanças. A cópia independente também grava no alvo sua origem e
identidade de pedido. Essa prova permite recuperar a mesma cópia após expirar o recibo
ou perder acesso à origem. Sem prova e fora da janela admitida, o pedido não cria
outro curso; consulte [persistência](persistencia-relacional.md#cópia-independente).

## Fontes, âncoras e arquivos

Uma [fonte](fontes-e-citacoes.md) identifica o material utilizado; uma âncora localiza
uma página, seção ou trecho desse material. Ambas guardam o estado corrente. A versão
serve à concorrência e aos links diretos; versões antigas não constituem uma
biblioteca paralela. Uma atribuição liga fontes e âncoras a um item do plano,
explicação ou unidade de estudo. Cada vínculo possui identidade, papéis explícitos e
ocorrências opcionais em folhas textuais do catálogo. Trecho ambíguo conserva o
vínculo e fica pendente de revisão; o sistema não inventa outra posição. Citação
manual preserva seu texto; a citação gerada usa metadados estruturados e o estilo
escolhido no curso.

A área privada de arquivos, ou bucket, `course-source-pdfs` contém os bytes. O banco
conserva o descritor e o vínculo ativo ou removido. A ingestão calcula e verifica
SHA-256, uma impressão digital usada para conferir os bytes recebidos, usa uma
intenção curta para cota e concorrência, envia pela Storage API, relê o objeto e só
então ativa o vínculo.

A remoção conserva uma marca relacional de retirada, chamada tombstone, e uma intenção
temporária de limpeza. Depois da transação, o adaptador reivindica a intenção,
revalida que nenhum vínculo ativo usa o objeto, remove-o pela Storage API e confirma a
conclusão. Reanexar o mesmo conteúdo reativa o vínculo após nova verificação.

Áudio usa `course-media`, com WAV PCM ou MP3, descritor lógico e referência na unidade
ou explicação. PDFs e áudios compartilham a cota do curso. A cópia independente pode
referenciar os mesmos bytes imutáveis: autorização depende do curso consultado, não do
prefixo físico do objeto. Exclusão de curso, conta e órfão confere todas as
referências e reservas antes de remover o arquivo. Detalhes ficam em
[Supabase](supabase.md#storage-bytes-privados-e-vínculo-relacional).

## Observações e revisão

Uma observação pertence a uma pessoa e a um alvo. Selecionar várias unidades de estudo
cria registros separados; não existe entidade de lote. A caixa autoral pode consultar
as abertas por escopo.

Preparar revisão amplia o foco para unidades afetadas por progressão, pré-requisitos,
transições, exemplos e prática. Aplicar correções grava o conjunto aprovado e a
inspeção seguinte permite conferir o resultado. Reversibilidade cotidiana vem de poder
reabrir qualquer ponto e revisá-lo outra vez.

## Dados de autoria

O painel **Dados de autoria** apresenta contagens derivadas do estado salvo, também
chamadas de *analytics* no código. A pessoa escolhe a dimensão que quer examinar e o
recorte do curso. O desenho reúne dados das unidades, ideias, prática, fontes,
parâmetros, extensão textual e componentes; a autoria reúne observações, escolhas
registradas e a origem observável da criação e da última revisão das unidades.

Esse retrato não usa telemetria de atenção, conversa ou rastreamento da execução. A
exportação JSON combina a leitura autoral com o documento literal do curso. Ela não
inclui progresso, contas, credenciais ou bytes dos arquivos. A comparação confronta
inventários completos e recortes selecionados, conserva a distinção entre parâmetros
solicitados e aplicados e informa ausências. Igualdade de contagens ou declarações não
comprova equivalência pedagógica.

## Réplica local e funcionamento sem rede

[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API), a API do
navegador para guardar dados estruturados, conserva composição validada, progresso,
posição, marcas para rever, observações próprias e escritas delimitadas que ainda
precisam de confirmação. `BroadcastChannel` informa outras abas sobre mudanças. No
modo automático, foco, visibilidade e retorno da conexão podem provocar releitura. O
modo manual suspende atualizações de fundo de conteúdo e filas pessoais; a nuvem
executa a sincronização solicitada. Escrita explícita e verificação de acesso
continuam sujeitas à rede. Rascunhos e conflitos não são descartados para aplicar uma
atualização.

As leituras de curso têm prazos para a obtenção de sessão e para a comunicação,
incluindo o consumo do corpo da resposta. Falhas recuperáveis admitem repetição
limitada e respeitam `Retry-After` dentro do orçamento de espera; uma solicitação
explícita funciona sem depender de um novo evento `online`. Uma revisão que muda
durante a leitura exige uma releitura coerente, e respostas obsoletas não substituem o
alvo atual ou um cabeçalho mais recente. Recusa de autenticação ou acesso não autoriza
expor cache privado.

A interface distingue leitura em curso, resultado vazio confirmado, cópia local, falha
do serviço e sinal de ausência de rede. Manter conteúdo local após erro não permite
concluir, por si só, que o dispositivo perdeu a Internet.

O servidor continua sendo a autoridade de propriedade e acesso. Um curso revogado
deixa de abrir depois da validação conectada, mesmo que uma cópia local antiga ainda
exista.

## Componentes didáticos

[Pacotes versionados](componentes-didaticos.md) implementam representações e formatos
de resposta. O catálogo informa função e contrato; o autor escolhe pelo papel
instrucional. `paragraph` e `choice` são componentes válidos, não alternativas
automáticas quando tabela, sequência, classificação, código ou diagrama representam
melhor o conteúdo.

A preparação da aplicação, chamada build, sincroniza os módulos compartilhados com as
Edge Functions, as funções remotas do Supabase. Essa verificação impede que navegador
e servidor interpretem o mesmo conteúdo com versões incompatíveis.

O registro delega validação das relações da unidade, preparação de conteúdo, interação
de resposta e reconciliação de edição aos contratos dos pacotes. O editor trabalha com
folhas textuais declaradas; não escolhe regras pelo nome do pacote. A composição e as
posições disponíveis para conteúdo, resposta e retorno continuam comuns. Uma extensão
compatível acrescenta seu registro e seus arquivos; uma nova capacidade da aplicação
exige contrato e código que a utilize. O curso não fornece código livre para execução.

## Segurança por fronteira

- o esquema `public`, agrupamento de tabelas e funções do banco, expõe apenas relações deliberadas e usa privilégios explícitos mais
  [segurança em nível de linha (RLS)](supabase.md#postgresql-esquemas-e-autorização);
- `private` fica fora da Data API e suas tabelas usam RLS como defesa adicional;
- funções `security definer` executam com os direitos de seu proprietário;
  fixam onde procurar objetos (`search_path`), validam a identidade e limitam
  quem pode chamá-las;
- Storage usa buckets privados e políticas por vínculo;
- site e APK recebem apenas URL e chave publicável;
- segredos administrativos permanecem nas Edge Functions;
- exclusão de conta e remoção de órfão revalidam objetos antes de apagar bytes.

## Backup e evolução

Migrações, os arquivos SQL versionados em `supabase/migrations`, reproduzem o esquema
do banco. O manifesto informa a revisão e as capacidades exigidas pelos clientes e só
avança depois que a capacidade inteira está instalada. A nova versão do cliente recusa
um banco incompatível, em vez de assumir silenciosamente um contrato antigo.

Uma exportação de backup, ou dump, do PostgreSQL preserva dados relacionais e
metadados, mas não os bytes do Storage. Recuperação completa exige também backup dos
objetos. O ensaio `test:backup-restore:local` restaura um conjunto sintético integrado
de dados numa instância descartável sem rede, confere o corte histórico e aplica a
cadeia posterior até o manifesto corrente, verificando estado útil e leitores atuais.
O teste `test:storage:lifecycle:local` exerce gravação, leitura e remoção dos bytes
pela API do Storage.

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
| contratos de componentes | `src/resources/` e mirror da Edge |

Consulte [Supabase no AraLearn](supabase.md) para operação local, Storage e
implantação; [Persistência relacional](persistencia-relacional.md) para a réplica e as
transações; e [Autoria pelo MCP](autoria-mcp.md) para o protocolo conversacional.
