# Persistência relacional e continuidade local

O AraLearn precisa manter um curso coerente quando diferentes interfaces leem e
alteram seu conteúdo, quando duas abas estão abertas ou quando uma resposta de rede se
perde. O [PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html), sistema
de banco de dados relacional, conserva o estado compartilhado e as permissões. No dispositivo, o
[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API), interface
oferecida pelo navegador para armazenar dados estruturados, mantém a cópia necessária ao estudo,
os rascunhos e as operações ainda não confirmadas.

A autorização continua no servidor; a cópia local oferece continuidade sem rede. O
banco mantém o estado corrente e recibos temporários para recuperar operações, sem
registrar cada estado anterior do curso.

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

O [modelo didático](modelo-didatico.md) organiza o percurso em curso, módulo, lição,
microssequência e unidade. No banco, cada elemento é um registro ligado ao elemento
que o contém.

`public.courses` contém identidade, proprietário, título, objetivo, revisão,
visibilidade e política de acesso público a arquivos. Cada curso nasce privado. A
estrutura curricular usa entidades ligadas por curso, tipo, pai e posição. A ordem é
validada pelo banco; uma unidade de estudo não pode pertencer a duas posições no mesmo
pai.

A microssequência pode guardar uma [explicação](explicacao-e-revisao-humana.md),
o texto-base com fontes que desenvolve o assunto. Ela é salva separadamente das
unidades produzidas a partir dela. Cada unidade registra a base que utilizou;
alterar a explicação posteriormente não reescreve essas unidades. As marcas de
revisão humana também são separadas: registram a inspeção de cada explicação ou
unidade e das respectivas fontes.

O plano possui mapa curricular global, estado de aprovação, pré-requisitos, itens de
escopo, repertório de unidades de análise, requisitos de evidência e partes. Cada
parte referencia microssequências já existentes. Esses vínculos permitem preparar um
lote sem convertê-lo em nível didático.

A composição de Estudo e a exportação preservam `scopeItemIds` quando esses vínculos
de cobertura estão presentes na microssequência: são até 64 UUIDs, identificadores
estáveis de objetos, distintos, ligados aos itens do mapa. `covers` contém os textos
de cobertura e não substitui esses IDs. `dependsOn` referencia microssequências
anteriores na ordem global do mesmo curso, inclusive em outra lição ou módulo. A
leitura rejeita dependências inexistentes, posteriores, cíclicas ou de uma
microssequência para si mesma; não reescreve o plano ou remove vínculos. A assistência
estrutural conserva os vínculos das microssequências existentes pela identidade
corrente, sem delegar sua atribuição ao provedor. Uma nova microssequência não recebe
vínculos de cobertura inventados pela aplicação.

Parâmetros pedagógicos, alvos editoriais quantitativos, direção editorial e política
de componentes possuem uma atribuição corrente por curso ou escopo permitido. Os alvos
são flexíveis e não funcionam como limites de conteúdo. Remover uma atribuição local
restaura herança. A linha anterior não permanece como estado de produto.

Uma unidade pode guardar um registro das condições usadas na produção, chamado
snapshot, e uma aplicação de desenho, que descreve como essas condições foram
realizadas. O snapshot contém apenas parâmetros e itens pertinentes à sua
microssequência; a aplicação registra ideias introduzidas, ideias estabelecidas
usadas, formas explicativas, componentes e prática efetivamente usados. Uma correção
focal preserva o snapshot histórico literalmente. A aplicação corrente é invalidada
quando muda o conteúdo que a sustentava ou sua hierarquia; editar somente o título
mantém o par. Analytics não atribui mapeamento instrucional corrente a uma unidade
cuja aplicação foi invalidada.

## Escritas concorrentes

A revisão técnica do curso é um número que muda quando os dados compartilhados são
alterados. Ela permite detectar se outra operação salvou uma mudança desde a última
leitura. Objetos editáveis também têm versões próprias quando podem mudar
separadamente. Essa numeração é diferente da declaração humana de revisão do conteúdo.

Por exemplo, duas abas podem ter aberto a mesma explicação. Se uma delas salva uma
mudança, a outra não pode substituir silenciosamente esse texto com a versão antiga.
A escrita compara o estado lido com o atual e exige releitura diante do conflito.

Quando uma resposta se perde, uma identidade de pedido permite recuperar o resultado
sem duplicar a operação. `course_change_receipts` é a autoridade temporária dessa
repetição. A rotina de retenção remove recibos expirados; eles não constituem log de
autoria.

A camada confiável de MCP e Actions gera esses controles. A interface e o assistente
trabalham com título, posição, escopo e consequência humana.

## Cópia independente

Copiar exige propriedade da origem ou a permissão explícita `canCopy` no acesso
existente. O destino recebe nova identidade e proprietário, visibilidade privada e
política de arquivos restrita. Uma transação com revisão esperada conserva mapa,
entidades, agrupamentos, inventário, configuração aplicada e histórica, fontes e
arquivos. Identidades globais são remapeadas por campo tipado, sem substituir títulos
ou trechos de texto. Acessos, progresso, observações pessoais e credenciais não são
transportados.

O software cria uma única identidade de pedido com instante correspondente e a
preserva na pendência. A origem gravada no alvo permite reconhecer a mesma cópia mesmo
depois da expiração do recibo, da revogação ou da exclusão da origem. Na ausência de
prova, pedidos fora da janela de 14 dias, com tolerância de relógio de cinco minutos,
falham sem criar um novo alvo. Excluir deliberadamente o alvo não autoriza recriá-lo
pelo mesmo recibo.

PDFs e áudios imutáveis podem compartilhar um caminho físico entre cursos. Cada cópia
mantém seu próprio descritor e autorização; a exclusão da origem não invalida os bytes
da cópia. As intenções de limpeza só permitem remover o objeto depois de verificar
todas as referências ativas e reservas de envio.

Cópias criadas por versões anteriores conservam a propriedade verificada. Os dados
de origem ficam em `courses.copy_origin`, fora da leitura pública. Para rascunhos
antigos, uma consulta compara origem e recibo para reconhecer um resultado já salvo;
sem prova suficiente, preserva o rascunho para inspeção ou descarte explícito. A
retirada do mecanismo antigo de cópia automática está no
[histórico do esquema](schema-change-log.md).

## Composição e paginação

As leituras de composição devolvem páginas ordenadas e ligadas à mesma revisão. O
cliente rejeita mistura de revisões, entidade duplicada, referência de continuação
repetida (cursor) e hierarquia inválida antes de substituir a réplica.

Conteúdo mantém somente uma janela de unidades na estrutura da página, o DOM. Um link
direto identifica a unidade inicial; curso, contexto e posição são preservados ao
voltar ou avançar.

Uma edição manual envia apenas o segmento alterado e sua versão. Alterações assistidas
passam pela mesma validação e apresentação antes de serem salvas. Somente o
proprietário edita. Estudantes e visitantes não criam cursos ao tentar alterar
conteúdo.

Na autoria, o armazenamento local conserva a lista de cursos próprios, o cabeçalho,
o planejamento, a hierarquia, páginas recentes de Conteúdo e a posição de retomada.
Uma leitura desses dados sem confirmação remota é identificada como desatualizada e
serve à consulta. Quando muda a revisão remota, os dados derivados da anterior são
invalidados antes de nova leitura.

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

Parâmetros, catálogos privados de fontes e áudios, caixa autoral de observações,
revisão, correções, análise de autoria e gestão de acesso exigem o servidor corrente.
Os bytes dos arquivos não integram essa réplica. Uma prévia na lista de cursos pode
ser conhecida localmente sem que a composição já esteja disponível para estudo.

## Fontes e proveniência

Fontes e âncoras são registros correntes: a fonte identifica um material, e a âncora
localiza uma passagem verificável nele. Os [vínculos de
proveniência](fontes-e-citacoes.md) registram como esses materiais foram usados no
curso. `sourceRevision` e `anchorRevision` nos contratos públicos funcionam como
versões de concorrência. Atualizar metadados ou localizador incrementa a versão; a
leitura cotidiana não percorre revisões anteriores.

Uma atribuição corrente liga um item do plano, explicação ou unidade de estudo a
fontes e âncoras. Vínculos possuem identidade estável, papéis múltiplos explícitos e
ocorrências opcionais em folhas textuais do catálogo. Uma alteração não apaga a
atribuição: o resolvedor verifica o trecho literal e seu contexto. Quando não existe
correspondência única, mantém o vínculo como pendência de revisão, sem escolher outro
alvo arbitrariamente.

O Estudo recebe apenas citações permitidas pela visibilidade da fonte. O texto
integral de uma observação ou o PDF privado não é incluído nessa projeção.

## PDFs privados

O descritor relacional contém fonte, versão, impressão digital SHA-256 dos bytes,
tamanho, tipo e caminho. O objeto fica numa área privada do Storage, chamada bucket,
`course-source-pdfs`. A autorização de download considera o acesso ao curso e a
política efetiva: arquivo, fonte e curso, nessa ordem. Os dois primeiros níveis
aceitam herança; o curso define restrito ou disponível. Alterações conferem revisão do
curso e da fonte. O cliente de Estudo recebe só descritores lógicos autorizados, sem
caminho do Storage; cada download revalida a política antes de emitir um endereço
temporário de download, a URL assinada.

Antes de enviar um arquivo, uma intenção temporária reserva a cota e registra os dados
que devem corresponder ao objeto recebido. O serviço envia e relê o objeto pela
Storage API antes de ativar o vínculo. Objetos iguais podem compartilhar o mesmo
caminho sem contar bytes em dobro na cota lógica de cada curso. Uma cópia pode
preservar esse caminho fora do seu próprio prefixo; o descritor autorizado, e não o
nome da pasta, determina a leitura.

Remover o PDF desativa o vínculo. Uma intenção de exclusão atravessa a fronteira entre
transação e Storage; o objeto só é apagado depois que nenhum vínculo ativo o utiliza.
Concluir a exclusão remove a intenção. Reanexar o mesmo conteúdo reativa o vínculo
após nova conferência.

Um objeto sem vínculo aparece no inventário de manutenção. A autorização de remoção
volta a conferir classe e caminho; a deleção acontece pela Storage API, nunca por
escrita direta em `storage.objects`.

## Observações e revisão

Observações conservam alvo, texto, categoria, origem, estado e versão. Uma ação em
várias unidades cria registros separados; explicações também recebem observações
próprias. Editar, tratar, retirar ou reabrir uma observação mantém sua identidade.

A revisão contextual lê a fila completa e o percurso afetado. A correção grava o
conteúdo e identifica as versões das observações que pretende atender. A releitura
confirma os efeitos antes de consumir somente essas versões; entradas editadas ou não
atendidas permanecem pendentes. Uma resposta perdida exige reconciliar a mesma
tentativa, sem reaplicar a correção.

Essa triagem é distinta da [declaração humana de
revisão](explicacao-e-revisao-humana.md). A explicação e cada unidade possuem marca
própria, vinculada ao conteúdo e às fontes inspecionados. A política `saved` permite a
leitura do conteúdo salvo; `reviewed_only` exige revisão atual, preservadas as demais
permissões do curso.

## Analytics corrente

Analytics deriva números da estrutura, do desenho aplicado, das fontes e das
observações. A autoria observável usa parâmetros definidos e a origem corrente da
criação e da última revisão das unidades de estudo. Não existe tabela de fatos de
Analytics nem coleta de interação para alimentar o painel.

## Estado pessoal

Progresso, posição de retomada e marcas para rever pertencem à pessoa. Escritas locais
formam operações pequenas e repetíveis. No modo automático, o retorno da conexão
permite ler a versão remota, enviar a fila válida e gravar a versão confirmada. No
modo manual, essa troca aguarda a ação explícita de sincronizar.

Observações próprias possuem fila separada porque sua autorização e seus conflitos
diferem do progresso. Rascunhos de conteúdo autoral não entram nessa fila.

## Continuidade entre abas

`BroadcastChannel`, a comunicação do navegador entre abas da mesma origem, sinaliza
mudanças locais. Uma aba não força a navegação da outra; ela apenas informa que uma
autoridade pode ter mudado. Ao recuperar foco, visibilidade ou conexão, o modo
automático relê o objeto pertinente e preserva posição e foco quando a identidade
ainda existe. No modo manual, o aviso marca a necessidade de sincronizar, sem
substituir conteúdo ou enviar filas em fundo.

Formulário ou confirmação em andamento adia a atualização. O rascunho permanece até
ser salvo ou descartado.

## Acesso e exclusão

O proprietário pode conceder acesso de estudo direto e revogá-lo. A pessoa autorizada
não recebe permissão de autoria no original. Funções SQL e [segurança em nível de
linha (RLS)](supabase.md#postgresql-esquemas-e-autorização) voltam a conferir essa
relação em cada operação.

Excluir uma conta exige remover seus objetos privados. O PostgreSQL não apaga bytes
automaticamente. O serviço prepara a retirada dos vínculos de cada curso, reivindica
intenções de arquivo, confirma os objetos pela Storage API e só então conclui a
exclusão relacional. Um PDF ou áudio utilizado por outra cópia não é apagado por
semelhança de prefixo. Avatares continuam limitados à pasta da conta.

## Evolução, backup e restauração

Migrações são arquivos SQL ordenados que reproduzem a evolução do esquema, a estrutura
de tabelas, funções e permissões do banco. O código candidato usa apenas o contrato
corrente; Git e releases recuperam código, não dados.

Um arquivo de backup lógico (dump) do PostgreSQL inclui estado relacional e metadados
de Storage, mas não os bytes. Backup de desastre precisa copiar também os objetos
privados. O ensaio `npm run test:backup-restore:local` usa bancos descartáveis e dados
sintéticos. Ele prepara uma versão anterior, produz e restaura um backup e aplica
as migrações até o contrato corrente. A comparação confere estrutura, conteúdo,
identidades, fontes e operações pendentes, além dos leitores atuais. Ao terminar,
remove os bancos temporários.

Esse ensaio verifica o processo de atualização; a recuperação de um ambiente
hospedado exige uma cópia de segurança dos seus próprios dados e arquivos. O
[verificador de restauração](../scripts/verifyBackupRestoreUpgrade.mjs) contém os
casos e as comparações executadas.

O teste `npm run test:storage:lifecycle:local` complementa essa prova com bytes reais
pela Storage API.

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
| PDF e Storage | ingestão, download, remoção, reativação e órfão pela API |
| evolução destrutiva | instalação nova e restauração seguida de atualização em banco descartável |
| continuidade local | IndexedDB, duas abas, offline e retorno da conexão |

Consulte [Supabase no AraLearn](supabase.md) para o ambiente e a segurança, e
[Implantação](implantacao.md) para a ordem de promoção.

## Identidade escolhida e visitante

`person_profiles.handle` é único, normalizado em ASCII minúsculo e separado do UUID
estável. A migração deixa o campo vazio para contas existentes; a configuração inicial
exige escolha antes da experiência autenticada. Nomes anteriores são preservados num
arquivo relacional privado de migração, sem leitor de runtime. O perfil v2 validado
pode ser reaberto offline no cache da própria conta; erro de autenticação ou permissão
invalida esse cache.

O visitante usa `aralearn-course-v1-visitor`, separado dos bancos por conta. Progresso
e marcas para rever ficam locais e não chamam endpoints de estado pessoal. Leituras
públicas usam projeções permitidas; nenhuma tabela privada ganha acesso anônimo.
Entrar numa conta não associa silenciosamente os dados do visitante.

## Sincronização e concorrência no dispositivo

A preferência `aralearn.ui.study-synchronization` pertence ao dispositivo e é
observada entre abas. No modo manual, listas, composição já aberta e filas de estudo
usam o cache; `explicit: true` distingue a sincronização solicitada. Uma consulta de
acesso separada continua sendo atualizada pela rede e retira cursos cuja revogação foi
confirmada, sem substituir o conteúdo dos cursos autorizados. Quando essa consulta
confirma acesso pela rede, o indicador deixa de reutilizar a marca antiga de
desconexão. A revisão em cache, sua restrição de edição e as pendências permanecem; o
evento `online` sozinho não confirma acesso ao serviço.

Transações IndexedDB leem a revisão local atual antes de aplicar cada alteração.
Conclusões independentes na mesma lição e marcas de unidades diferentes são reunidas.
A requisição remota pendente conserva identidade e conteúdo do pedido até receber
confirmação. Diferenças incompatíveis no mesmo dado permanecem como conflito local,
com comparação e resolução explícita, preservando alterações disjuntas.

A incorporação de estado visitante exige prévia e escolha dos cursos. O estado e o
recibo da incorporação são gravados na mesma transação do banco da conta; o banco
visitante permanece intacto. A união acrescenta conclusões e marcas para rever,
preserva a posição da conta e não grava conteúdo do curso nem observações.
