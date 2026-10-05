# Persistência relacional e continuidade local

Um curso pode ser aberto pela interface, alterado por uma aplicação de IA e consultado
em duas abas ao mesmo tempo. A conexão também pode ser interrompida depois que o
servidor salvou uma mudança, mas antes de devolver a resposta. O armazenamento do
AraLearn precisa manter um único estado compartilhado e preservar o trabalho que
ainda existe apenas no dispositivo. A conservação desses dados entre acessos é
chamada de **persistência**.

O [PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html), sistema de banco
de dados relacional, conserva o curso compartilhado e suas permissões. No dispositivo,
o [IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API), interface
do navegador para armazenar dados estruturados, mantém a cópia necessária ao estudo,
os rascunhos e as operações que aguardam confirmação.

O servidor determina a autorização; a cópia local oferece continuidade sem rede.
O banco conserva o estado corrente e recibos temporários destinados à recuperação
de operações, em vez de um histórico de todos os estados anteriores do curso.

## Autoridades de dados

Para resolver uma divergência, é preciso saber qual registro determina o estado
válido de cada informação. Esse papel é chamado de autoridade dos dados. O servidor
decide o conteúdo compartilhado e o acesso; uma edição ainda não enviada pertence ao
rascunho local. A autenticação fica no serviço Auth, e os arquivos ficam no Storage,
ambos apresentados no [guia de Supabase](supabase.md).

| Informação | Autoridade |
| --- | --- |
| propriedade, compartilhamento e perfil | PostgreSQL e Auth |
| curso, estrutura, plano e partes | PostgreSQL |
| configuração e desenho aplicado | PostgreSQL |
| fontes, âncoras, vínculos e áudios | PostgreSQL; bytes no Storage |
| observações autorais compartilhadas | PostgreSQL |
| composição validada para uso sem rede | IndexedDB, como réplica |
| progresso, posição e marcas pessoais | PostgreSQL, com fila local delimitada |
| rascunho ainda não enviado | memória ou IndexedDB conforme risco de perda |

## Modelo corrente do curso

O [modelo didático](modelo-didatico.md) organiza o percurso em vários níveis, do curso
às unidades de estudo. No banco, cada elemento é um registro ligado ao elemento que o
contém.

`public.courses` contém identidade, proprietário, título, objetivo, revisão,
visibilidade e política de acesso público a arquivos. Cada curso nasce privado.
Nesse registro, **revisão** é um número que identifica o estado dos dados e permite
detectar mudanças desde a última leitura. A estrutura curricular liga cada elemento
a seu curso e ao elemento que o contém, identificado como seu pai. Tipo e posição
determinam o lugar na hierarquia. O banco valida a ordem e impede que uma unidade de
estudo ocupe duas posições no mesmo pai.

A microssequência, conjunto de unidades com um objetivo delimitado, pode guardar uma
[explicação](explicacao-e-revisao-humana.md). Essa base desenvolve o assunto e o
relaciona às fontes, podendo combinar texto, representações visuais e áudio. Ela é
salva separadamente das unidades produzidas a partir dela. Cada unidade registra a
base que utilizou; uma alteração posterior na explicação conserva essas unidades
até que sejam editadas. As declarações de revisão humana também são separadas:
registram a inspeção de cada explicação ou unidade e das respectivas fontes.

O plano reúne o mapa curricular global e as informações que orientam sua produção.
O [contrato do plano](aralearn-contract.md#curso-e-estrutura) descreve seus campos.
Cada **parte** agrupa microssequências já existentes para uma etapa de produção e
inspeção. Esse agrupamento coordena o trabalho e mantém a hierarquia didática.

O conteúdo preparado para Estudo e a exportação preservam `scopeItemIds` quando esses
vínculos de cobertura estão presentes na microssequência. São até 64 UUIDs,
identificadores estáveis de objetos, distintos, ligados aos itens do mapa. `covers`
contém os textos de cobertura; os IDs identificam os itens correspondentes.
`dependsOn` referencia microssequências anteriores na ordem global do mesmo curso,
inclusive em outra lição ou módulo. A leitura rejeita dependências inexistentes,
posteriores, cíclicas ou de uma microssequência para si mesma. Diante dessas
inconsistências, conserva o plano para correção, em vez de remover vínculos.

A assistência estrutural conserva os vínculos das microssequências existentes pela
identidade corrente. Sua atribuição permanece sob controle da aplicação, que mantém
as novas microssequências sem vínculos de cobertura até que esses vínculos sejam
estabelecidos.

Parâmetros pedagógicos, alvos editoriais quantitativos, direção editorial e política
de componentes possuem uma atribuição corrente por curso ou escopo permitido.
**Escopo** designa o trecho ao qual uma escolha se aplica. Os alvos de extensão
orientam a distribuição do conteúdo. Remover uma atribuição local restaura a herança
do nível mais amplo e retira a linha anterior do estado corrente do produto.

Uma unidade pode guardar as condições usadas na produção num registro chamado
*snapshot*. Outro registro, a **aplicação de desenho**, descreve como essas condições
se realizaram no conteúdo. Ele relaciona os conhecimentos introduzidos ou utilizados
às formas de explicação, aos componentes e à prática. O snapshot contém somente o
recorte pertinente à microssequência; uma correção focal o preserva literalmente
como registro histórico. Os [parâmetros de autoria](parametros-de-autoria.md)
distinguem a orientação do próximo trabalho das escolhas já aplicadas.

Se mudar o conteúdo ou a hierarquia que sustentava a aplicação, ela deixa de descrever
o estado corrente; uma alteração apenas no título mantém a relação. Os
[dados de autoria](analytics-instrucionais.md) identificam essa invalidação para
que o mapeamento anterior seja interpretado de acordo com a versão que descrevia.

## Pareceres de inspeção e suas bases

O parecer de IA é salvo em `private.course_entities.ai_inspection`, no registro da
unidade ou da microssequência que contém a explicação. Ele guarda o julgamento, o
instante da inspeção e a impressão digital da base examinada. Essa impressão digital,
chamada **hash**, permite detectar mudanças no conjunto lido.

A base pedagógica é reconstruída a partir do estado corrente. Ela reúne o conteúdo
do foco e as unidades na ordem salva, com o planejamento, as dependências, a
configuração aplicada e os vínculos bibliográficos pertinentes. A função
`private.course_pedagogical_basis_v1` compõe esse conjunto.

Por isso, uma alteração pode desatualizar pareceres de outros objetos além do editado.
Reordenar duas unidades muda o percurso disponível à inspeção da explicação e das
unidades da mesma microssequência. O banco calcula novamente `basisHash` para
determinar quais pareceres continuam atuais. O resultado `consistent` descreve o
julgamento; o estado `current` descreve sua correspondência com a base. Um parecer
atual com ressalvas conserva os pontos que exigem atenção.

Novos registros exigem os [seis critérios do contrato de inspeção](auditoria-de-conformidade-instrucional.md#inspeção-por-ia-sobre-o-conteúdo-salvo).
Pareceres antigos continuam legíveis, mas um registro com apenas cinco critérios
fica incompleto para a inspeção atual. O servidor confere se as evidências textuais
constam da base salva. Essa correspondência identifica a origem dos trechos usados;
a justificativa do parecer precisa explicar como eles sustentam o julgamento.

Gravar um parecer novo ou alterado incrementa a revisão técnica do curso. A base
exclui o próprio parecer, permitindo registrar os demais alvos sem invalidá-los
apenas por essa gravação. O recibo conserva os metadados do resultado e o hash do
pedido. Numa repetição exata, o serviço recompõe o parecer a partir do pedido
vinculado ao recibo. Conteúdo e declaração humana de revisão permanecem em operações
separadas.

## Escritas concorrentes

A revisão técnica do curso muda quando os dados compartilhados são alterados.
Objetos editáveis também têm versões próprias quando podem mudar separadamente.
Essa numeração permite conferir o estado lido; a declaração humana de revisão
registra a inspeção do conteúdo.

Por exemplo, duas abas podem ter aberto a mesma explicação. Quando uma delas salva
uma mudança, a outra precisa reler o conteúdo antes de substituir o texto com uma
edição incompatível. A escrita compara o estado lido com o atual e exige essa nova
conferência diante do conflito.

Quando uma resposta se perde, uma identidade de pedido permite recuperar o resultado
sem duplicar a operação. `course_change_receipts` mantém os registros temporários
usados nessa recuperação. A rotina de retenção remove os recibos expirados; o
conjunto disponível corresponde à janela de recuperação, e não a um histórico
integral de autoria.

A camada de execução de MCP e Actions gera esses controles. A interface e o
assistente identificam o conteúdo por título, posição e escopo e apresentam à pessoa
o efeito esperado da operação.

## Cópia independente

Copiar exige propriedade da origem ou a permissão explícita `canCopy` no acesso
existente. O destino recebe nova identidade e proprietário, visibilidade privada e
política de arquivos restrita. Uma transação com revisão esperada conserva mapa,
entidades, agrupamentos, inventário, configuração aplicada e histórica, fontes e
arquivos. Identidades globais são remapeadas de acordo com o campo a que pertencem,
preservando títulos e trechos de texto. Acessos, progresso, observações pessoais e
credenciais permanecem na origem.

O software cria uma única identidade de pedido com instante correspondente e a
preserva na pendência. A origem gravada no alvo permite reconhecer a mesma cópia
mesmo depois da expiração do recibo, da revogação ou da exclusão da origem. Na
ausência dessa comprovação, pedidos fora da janela de 14 dias, com tolerância de
relógio de cinco minutos, falham sem criar um novo alvo. Excluir deliberadamente
o destino encerra aquela cópia; o mesmo recibo não a recria.

Documentos e arquivos de áudio imutáveis podem compartilhar um caminho físico entre
cursos. Cada cópia mantém seu próprio descritor e autorização; a exclusão da origem
preserva os bytes utilizados pela cópia. A limpeza só permite remover o objeto
depois de verificar todas as referências ativas e reservas de envio.

Cópias criadas por versões anteriores conservam a propriedade verificada. Os dados
de origem ficam em `courses.copy_origin`, fora da leitura pública. Para rascunhos
antigos, uma consulta compara origem e recibo para reconhecer um resultado já salvo.
Sem comprovação suficiente, preserva o rascunho para inspeção ou descarte explícito.
A retirada do mecanismo antigo de cópia automática está no
[histórico do esquema](schema-change-log.md).

## Composição e paginação

O cliente obtém o curso em páginas ordenadas, todas ligadas à mesma revisão.
Antes de substituir a cópia local, confere se recebeu um conjunto coerente.
Mistura de revisões, entidades duplicadas, referências de continuação repetidas
(cursores) e hierarquia inválida impedem essa substituição.

Conteúdo mantém somente uma janela de unidades no DOM, a estrutura da página
mantida pelo navegador. Um link direto identifica a unidade inicial; curso,
contexto e posição são preservados ao voltar ou avançar.

Uma edição manual envia apenas o segmento alterado e sua versão. Alterações
assistidas passam pela mesma validação e apresentação antes de serem salvas.
Somente o proprietário edita o original. Criar uma cópia é uma ação própria, com
as permissões descritas em [Cópia independente](#cópia-independente).

Na autoria, o armazenamento local conserva a continuidade do trabalho. Ele guarda a
lista e o cabeçalho do curso, seu planejamento e sua hierarquia, além das páginas
recentes de Conteúdo e da posição de retomada. Sem confirmação remota, esses dados
aparecem como uma cópia possivelmente desatualizada e servem à consulta. Quando muda
a revisão do servidor, o aplicativo invalida o que foi derivado da anterior antes
de fazer nova leitura.

Depois da confirmação de uma edição manual ou assistida, o aplicativo guarda uma
cópia fiel da unidade salva e recompõe o curso antes de substituir a leitura local.
Progresso, observações e posição são preservados. Estudo e Conteúdo podem apresentar
essa revisão sem rede como confirmada, ainda com sincronização pendente. Uma consulta
que encontra a mesma revisão encerra a pendência; uma revisão posterior substitui a
cópia. Sair da conta, limpar o curso ou perder acesso remove esse estado de
confirmação pendente.

A sessão de Estudo adota a revisão da composição confirmada antes de consultar
citações ou a explicação. Isso atualiza somente o curso editado e respeita o modo
manual. Se a cópia não corresponder ao recibo ou a leitura falhar, a edição continua
salva: o aplicativo informa a sincronização pendente e recupera a leitura, sem
reenviar a gravação.

Operações que dependem do estado compartilhado corrente — ajustar parâmetros, tratar
observações ou gerir acesso, por exemplo — exigem o servidor. Os bytes dos arquivos
também ficam fora dessa réplica. Assim, uma prévia pode aparecer na lista local de
cursos antes que seu conteúdo esteja disponível para estudo.

## Fontes e proveniência

Fontes e âncoras são registros correntes: a fonte identifica um material, e a âncora
localiza uma passagem verificável nele. Os [vínculos de
proveniência](fontes-e-citacoes.md) registram como esses materiais foram usados no
curso. `sourceRevision` e `anchorRevision` nos contratos públicos funcionam como
versões para conferir alterações concorrentes. Atualizar metadados ou localizador
incrementa a versão. A leitura cotidiana usa esses registros correntes; uma
observação autoral pendente pode preservar o estado anterior pertinente à comparação.

Uma atribuição liga um item do plano, uma explicação ou uma unidade de estudo a
fontes e âncoras. Cada vínculo possui identidade estável e papéis explícitos. Também
pode localizar ocorrências nos campos de texto declarados pelo componente, chamados
de folhas textuais no catálogo. Depois de uma edição, o resolvedor verifica o trecho
literal e seu contexto. Quando encontra mais de uma possibilidade ou perde a
localização, mantém o vínculo como pendência de revisão para nova conferência.

Estudo recebe apenas as citações permitidas pela visibilidade da fonte. O texto
integral de observações e os documentos privados ficam fora desse conjunto de dados.

<a id="pdfs-privados"></a>

## Documentos privados em formato PDF

O descritor relacional identifica a fonte, a versão e o arquivo, com sua impressão
digital SHA-256, tamanho, tipo e caminho. Os bytes ficam no bucket privado
`course-source-pdfs` do Storage. A autorização para obter o documento considera o
acesso ao curso e a política efetiva do arquivo, da fonte e do curso, nessa ordem.
Os dois primeiros níveis aceitam herança; o curso define acesso restrito ou disponível.

Alterações conferem a revisão do curso e da fonte. O cliente de Estudo recebe somente
descritores lógicos autorizados, sem o caminho interno do Storage. Cada abertura
revalida a política antes de emitir um endereço temporário de acesso, a URL assinada.

Antes de enviar um arquivo, uma intenção temporária reserva a cota e registra os
dados que deverão corresponder ao objeto recebido. O serviço envia e relê o objeto
pela interface de programação do Storage, a Storage API, antes de ativar o vínculo.
Arquivos de conteúdo idêntico podem compartilhar o mesmo caminho sem duplicar a
contagem de bytes na cota lógica de cada curso. Uma cópia pode preservar esse caminho
fora de seu próprio prefixo; a autorização do descritor determina a leitura.

Remover o documento desativa o vínculo e cria uma intenção de exclusão. Esse registro
coordena a transação no banco com a remoção no Storage. O objeto é apagado depois de
conferir os vínculos ativos, as reservas e as bases de observação que ainda o
conservam. Concluir a exclusão remove a intenção. Reanexar o mesmo conteúdo reativa
o vínculo após nova conferência.

Um objeto sem vínculo aparece no inventário de manutenção. A autorização de remoção
volta a conferir classe e caminho. A exclusão ocorre pela Storage API; a tabela
`storage.objects` é consultada, preservando o serviço como responsável pela alteração
dos arquivos.

## Observações e revisão

Observações conservam texto, categoria, origem, estado e versão. Uma observação autoral
pode reunir até 64 alvos em `private.course_observation_targets`. A relação entre a
observação e cada alvo é uma **incidência**, com registro do objeto, da base anterior
e do estado da decisão. Bases idênticas são compartilhadas em
`private.course_observation_bases`; nelas permanecem o conteúdo anterior, as fontes
pertinentes e o inventário de arquivos necessário à comparação. Observações de
estudantes conservam o alvo individual. O [capítulo de observações](observacoes-pedagogicas.md)
apresenta seu tratamento na interface.

A revisão contextual lê a fila e o percurso afetado. A correção grava o conteúdo,
e a releitura confirma seus efeitos. Aceitar o conteúdo vigente ou encerrar uma
incidência sem alteração depende de uma decisão humana expressa. A operação confere
as versões da observação e de seus alvos e a base apresentada; aceitar exige também
inspeção de IA concluída. Alvos omitidos ou alterados continuam pendentes.

Cada decisão libera a referência daquele alvo à base anterior. A limpeza conserva
bases ainda compartilhadas e agenda a remoção dos arquivos que perderam a última
referência. Os bytes existentes são reutilizados durante a comparação. Quando todos
os alvos terminam, o sistema limpa o texto da observação e mantém seu registro final
por 14 dias, até a remoção. Uma nova intenção sobre um alvo já decidido recebe outra
observação. Pedidos com resposta perdida conservam sua identidade para recuperação
e conferência.

Essa triagem é distinta da [declaração humana de
revisão](explicacao-e-revisao-humana.md). A explicação e cada unidade possuem marca
própria, vinculada ao conteúdo e às fontes inspecionados. A política `saved` permite a
leitura do conteúdo salvo; `reviewed_only` exige revisão atual, preservadas as demais
permissões do curso.

## Análise de autoria corrente

O painel **Dados de autoria** é derivado sob demanda do estado salvo. Sua fonte reúne a
estrutura, o desenho aplicado, as fontes, as observações, os parâmetros definidos e a
origem corrente da criação ou da última revisão das unidades. Os dados de interação
têm outra finalidade e permanecem separados dessa análise de autoria.

## Estado pessoal

Progresso, posição de retomada e marcas para rever pertencem à pessoa. Escritas locais
formam operações pequenas e repetíveis. No modo automático, o retorno da conexão
permite ler a versão remota, enviar a fila válida e gravar a versão confirmada. No
modo manual, essa troca aguarda a ação explícita de sincronizar.

Observações próprias possuem fila separada porque sua autorização e seus conflitos
diferem do progresso. Os rascunhos de conteúdo autoral conservam seu próprio percurso
de salvamento e recuperação.

## Continuidade entre abas

`BroadcastChannel`, recurso do navegador para comunicar abas da mesma origem,
sinaliza mudanças locais. Cada aba conserva sua navegação; o aviso indica que um
registro pode ter mudado. Ao recuperar foco, visibilidade ou conexão, o modo
automático relê o objeto pertinente e preserva posição e foco quando a identidade
ainda existe. No modo manual, o aviso marca a necessidade de sincronizar. O conteúdo
e as filas aguardam a solicitação da pessoa.

Um formulário ou uma confirmação em andamento adia a atualização. O rascunho permanece
até ser salvo ou descartado.

## Acesso e exclusão

O proprietário pode conceder acesso de estudo direto e revogá-lo. A edição do
original continua sendo sua atribuição. Funções SQL e [segurança em nível de
linha (RLS)](supabase.md#postgresql-esquemas-e-autorização) voltam a conferir essa
relação em cada operação.

Excluir uma conta exige remover seus objetos privados. Como os bytes ficam no
Storage, o serviço coordena sua retirada com a exclusão no PostgreSQL. Ele prepara
a retirada dos vínculos de cada curso, assume as intenções de arquivo, confirma os
objetos pela Storage API e só então conclui a exclusão relacional. Documentos e
áudios utilizados por outra cópia são preservados, independentemente de seu prefixo
físico. Avatares continuam limitados à pasta da conta.

## Atualização dos dados no dispositivo

Ao abrir um banco local de uma versão anterior, o IndexedDB executa uma transação de
atualização antes de entregar os dados ao aplicativo. A versão corrente do banco de
cursos é 4, definida em `CourseLocalStore.js`. Sessão e dados de curso usam bancos
separados; cada conta e o visitante têm seu próprio compartimento de cursos.

A atualização preserva os pedidos ainda não confirmados. Na fila de observações
autorais, uma pendência antiga utilizável ocupa a chave central do curso quando ela
está livre. Pendências adicionais conservam o registro original entre os rascunhos
recuperáveis, disponíveis para exportação e análise. Somente a pendência central pode
ser retomada como pedido; os registros preservados exigem decisão posterior.

Marcas antigas de revisão agregada da microssequência também têm destino explícito:
a atualização guarda o original em `legacyMicrosequenceReview` e apresenta a revisão
por objeto como `unregistered`. Uma declaração sobre o conjunto antigo exige, assim,
nova inspeção para os objetos atuais.

Se a atualização falhar, a transação desfaz suas alterações e mantém o banco original.
Outra aba aberta na versão anterior pode bloquear a passagem; feche essa aba e abra o
aplicativo novamente. Os módulos `courseCacheUpgradeV10.js`,
`courseContentUpgradeV7.js` e `studyDraftRecovery.js` implementam essas passagens, com
testes de conservação dos dados em `tests/runtime/`.

## Evolução, backup e restauração

Migrações são arquivos SQL ordenados que reproduzem a evolução do esquema, a estrutura
de tabelas, funções e permissões do banco. O código candidato usa apenas o contrato
corrente. Git e versões publicadas do repositório permitem recuperar o código;
os dados dependem de suas próprias cópias de segurança.

Um arquivo de backup lógico (dump) do PostgreSQL inclui o estado relacional e os
metadados do Storage. Os bytes dos arquivos precisam de uma cópia própria.
O ensaio `npm run test:backup-restore:local` prepara uma versão anterior num banco
descartável, restaura seu backup e aplica as migrações até o contrato corrente.
Depois, compara a estrutura, as identidades e os dados úteis, como conteúdo, fontes
e operações pendentes, com o que os leitores atuais esperam. Os bancos temporários
são removidos ao final.

Esse ensaio verifica o processo de atualização; a recuperação de um ambiente
hospedado exige uma cópia de segurança dos seus próprios dados e arquivos. O
[verificador de restauração](../scripts/verifyBackupRestoreUpgrade.mjs) contém os
casos e as comparações executadas.

O teste `npm run test:storage:lifecycle:local` complementa essa prova com bytes reais
pela Storage API.

## Identidade escolhida e visitante

Uma pessoa precisa de um nome pelo qual possa ser encontrada sem tornar esse nome
a identidade interna de todos os seus dados. `person_profiles.handle` guarda o
identificador público escolhido; ele é único, usa o conjunto limitado de caracteres
ASCII em minúsculas e fica separado do UUID estável. A migração deixa o campo vazio
para contas existentes, e a configuração inicial exige sua escolha antes da
experiência autenticada. Nomes anteriores ficam num registro privado de migração,
sem consulta pela aplicação em execução. O perfil v2 validado pode ser reaberto sem
conexão no cache da própria conta; um erro de autenticação ou permissão invalida
essa cópia.

O visitante usa `aralearn-course-v1-visitor`, separado dos bancos por conta. Progresso
e marcas para rever ficam locais. As leituras públicas recebem somente os dados
permitidos, mantendo as tabelas privadas fora do acesso anônimo. Associar os dados
do visitante a uma conta exige a escolha descrita a seguir.

## Sincronização e concorrência no dispositivo

A escolha entre sincronização automática e manual precisa valer em todas as abas do
mesmo dispositivo. Ela é guardada em `aralearn.ui.study-synchronization` e observada
entre abas. No modo manual, listas, composição já aberta e filas de estudo usam a
cópia local; o campo `explicit: true` identifica uma sincronização solicitada pela
pessoa. Uma consulta de acesso separada continua sendo atualizada pela rede e retira
cursos cuja revogação foi confirmada, preservando o conteúdo dos cursos autorizados.

Quando essa consulta confirma acesso pela rede, o indicador retira a marca anterior
de desconexão. A revisão em cache, sua restrição de edição e as pendências permanecem.
O evento `online` informa o estado de rede percebido pelo navegador; a consulta ao
serviço é que confirma o acesso ao AraLearn.

Transações IndexedDB leem a revisão local atual antes de aplicar cada alteração.
Conclusões independentes na mesma lição e marcas de unidades diferentes são reunidas.
A requisição remota pendente conserva identidade e conteúdo do pedido até receber
confirmação. Diferenças incompatíveis no mesmo dado permanecem como conflito local,
com comparação e resolução explícita, preservando alterações em dados diferentes.

A incorporação do estado de visitante exige prévia e escolha dos cursos. O estado
e o recibo da incorporação são gravados na mesma transação do banco da conta;
o banco de visitante permanece intacto. A união acrescenta conclusões e marcas para
rever e preserva a posição da conta. Conteúdo do curso e observações ficam fora
dessa operação.

## Verificação

Testes de domínio conferem regras isoladas. PGlite executa uma versão incorporada de
PostgreSQL para testar SQL; o Supabase local exercita os serviços e permissões reais.
Playwright controla o navegador para percorrer as jornadas. O [guia do
desenvolvedor](guia-desenvolvedor.md#testes-e-integração) descreve como selecionar e
executar essas provas.

| Risco | Prova principal |
| --- | --- |
| hierarquia e composição | domínio, PGlite, PostgreSQL real e Playwright |
| concorrência e repetição | comandos repetidos, recibos e conflitos de versão |
| RLS e compartilhamento | usuários distintos e acessos revogados |
| fonte, âncora e citação | domínio, consultas correntes e Estudo |
| documentos em formato PDF e Storage | recebimento, abertura, remoção, reativação e limpeza de arquivos sem vínculo pela API |
| evolução destrutiva | instalação nova e restauração seguida de atualização em banco descartável |
| continuidade local | IndexedDB, duas abas, ausência de rede e retorno da conexão |

Consulte [Supabase no AraLearn](supabase.md) para o ambiente e a segurança, e
[Implantação](implantacao.md) para a ordem de publicação.
