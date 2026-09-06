# Persistência relacional e continuidade local

O AraLearn precisa manter um curso coerente quando diferentes superfícies leem
e alteram seu conteúdo, quando duas abas estão abertas ou quando uma resposta de
rede se perde. A solução possui duas autoridades complementares:

- PostgreSQL conserva o estado compartilhado e autorizado;
- IndexedDB conserva a continuidade necessária naquele dispositivo.

A cópia local não concede acesso nem substitui o servidor. O banco não guarda
uma história universal só para reconstruir cada estado anterior.

## Autoridades de dados

| Informação | Autoridade |
| --- | --- |
| propriedade, compartilhamento e perfil | PostgreSQL e Auth |
| Curso, estrutura, plano e partes | PostgreSQL |
| configuração e desenho aplicado | PostgreSQL |
| fontes, âncoras, vínculos e áudios | PostgreSQL; bytes no Storage |
| Observações autorais compartilhadas | PostgreSQL |
| composição validada para uso sem rede | IndexedDB, como réplica |
| progresso, posição e marcas pessoais | PostgreSQL, com fila local delimitada |
| rascunho ainda não enviado | memória ou IndexedDB conforme risco de perda |

## Modelo corrente do Curso

`public.courses` contém identidade, proprietário, título, objetivo, revisão,
visibilidade e política de acesso público a arquivos. Cada curso nasce privado. A
estrutura curricular usa entidades ligadas por curso, tipo, pai e posição. A
ordem é validada pelo banco; uma StudyUnit não pode pertencer a duas posições no
mesmo pai.

O plano possui mapa curricular global, estado de aprovação, pré-requisitos,
itens de escopo, repertório de unidades de análise, requisitos de evidência e
partes. Cada parte referencia microssequências já existentes. Esses vínculos
permitem preparar um lote sem convertê-lo em nível didático.

Parâmetros pedagógicos, alvos editoriais quantitativos, direção editorial e
política de componentes possuem uma atribuição corrente por curso ou escopo
permitido. Os alvos são flexíveis e não funcionam como limites de conteúdo.
Remover uma atribuição local restaura herança. A linha anterior não permanece
como estado de produto.

Uma unidade de estudo pode guardar o snapshot focal e a aplicação de desenho
que recebeu. O snapshot contém apenas parâmetros e itens pertinentes à sua
microssequência; a aplicação registra ideias introduzidas, ideias estabelecidas
usadas, formas explicativas, componentes e prática efetivamente usados. Uma
correção focal preserva o snapshot histórico literalmente. A aplicação corrente
é invalidada quando muda o conteúdo que a sustentava ou sua hierarquia; editar
somente o título mantém o par. Analytics não atribui mapeamento instrucional
corrente a uma unidade cuja aplicação foi invalidada.

## Escritas concorrentes

A revisão do curso protege mudanças que atravessam vários objetos. Versões
locais protegem objetos que podem mudar sem reescrever a composição inteira.
Uma escrita aceita somente o estado que foi lido ou um replay reconhecido.

Quando uma resposta se perde, uma identidade de pedido permite recuperar o
resultado sem duplicar a operação. `course_change_receipts` é a autoridade
temporária dessa repetição. A rotina de retenção remove recibos expirados; eles
não constituem log de autoria.

A camada confiável de MCP e Actions gera esses controles. A interface e o GPT
trabalham com título, posição, escopo e consequência humana.

## Cópia independente

Copiar exige propriedade da origem ou a permissão explícita `canCopy` no acesso
existente. O destino recebe nova identidade e proprietário, visibilidade privada
e política de arquivos restrita. Uma transação com revisão esperada conserva
mapa, entidades, agrupamentos, inventário, configuração aplicada e histórica,
fontes e arquivos. Identidades globais são remapeadas por campo tipado, sem
substituir títulos ou trechos de texto. Acessos, progresso, observações pessoais
e credenciais não são transportados.

O software cria uma única identidade de pedido com instante correspondente e a
preserva na pendência. A origem gravada no alvo permite reconhecer a mesma cópia
mesmo depois da expiração do recibo, da revogação ou da exclusão da origem. Na
ausência de prova, pedidos fora da janela de 14 dias, com tolerância de relógio
de cinco minutos, falham sem criar um novo alvo. Excluir deliberadamente o alvo
não autoriza recriá-lo pelo mesmo recibo.

PDFs e áudios imutáveis podem compartilhar um caminho físico entre cursos. Cada
cópia mantém seu próprio descritor e autorização; a exclusão da origem não
invalida os bytes da cópia. As intenções de limpeza só permitem remover o objeto
depois de verificar todas as referências ativas e reservas de envio.

## Composição e paginação

As leituras de composição devolvem páginas ordenadas e ligadas à mesma revisão.
O cliente rejeita mistura de revisões, entidade duplicada, cursor repetido e
hierarquia inválida antes de substituir a réplica.

Conteúdo mantém somente uma janela de StudyUnits no DOM. Um deep link identifica
a Unit inicial; curso, contexto e posição são preservados ao voltar ou avançar.

Uma edição manual envia apenas o segmento alterado e sua versão. Alterações
assistidas passam pelo mesmo normalizador e renderer antes de serem salvas.
Somente o proprietário edita. Estudantes e visitantes não criam cursos ao
tentar alterar conteúdo. Cópias já existentes conservam a propriedade verificada;
a origem útil migra para `courses.copy_origin`, fora da projeção pública.
O escritor automático e sua tabela exclusiva são retirados após o preflight.
Rascunhos locais anteriores são inspecionados por uma operação somente de leitura:
prova de origem e recibo permitem identificar um resultado confirmado, sem repetir
a escrita. A ausência de prova preserva o rascunho para inspeção e descarte explícito.

## Fontes e proveniência

Fonte e Âncora são linhas correntes. `sourceRevision` e `anchorRevision` nos
contratos públicos funcionam como versões de concorrência. Atualizar metadados
ou localizador incrementa a versão; a leitura cotidiana não percorre revisões
anteriores.

Uma atribuição corrente liga um item do plano ou uma StudyUnit a fontes e
âncoras. Vínculos possuem identidade estável, papéis múltiplos explícitos e
ocorrências opcionais em folhas textuais do catálogo. Uma alteração não apaga
a atribuição: o resolvedor verifica o trecho literal e seu contexto. Quando
não existe correspondência única, mantém o vínculo como pendência de revisão,
sem escolher outro alvo arbitrariamente.

O Estudo recebe apenas citações permitidas pela visibilidade da fonte. O texto
integral de uma Observação ou o PDF privado não é incluído nessa projeção.

## PDFs privados

O descritor relacional contém fonte, versão, resumo SHA-256, tamanho, tipo e
caminho. O objeto fica no bucket privado `course-source-pdfs`. A autorização de download
considera o acesso ao curso e a política efetiva: arquivo, fonte e curso, nessa
ordem. Os dois primeiros níveis aceitam herança; o curso define restrito ou
disponível. Alterações conferem revisão do curso e da fonte. O cliente de Estudo
recebe só descritores lógicos autorizados, sem caminho do Storage; cada download
revalida a política antes de emitir URL assinada de curta duração.

Uma ingestão usa uma intenção curta para reservar cota e selar os dados. O
serviço envia e relê o objeto pela Storage API antes de ativar o vínculo. Objetos
iguais podem compartilhar o mesmo caminho sem contar bytes em dobro na cota
lógica de cada curso. Uma cópia pode preservar esse caminho fora do seu próprio
prefixo; o descritor autorizado, e não o nome da pasta, determina a leitura.

Remover o PDF desativa o vínculo. Uma intenção de exclusão atravessa a fronteira
entre transação e Storage; o objeto só é apagado depois que nenhum vínculo ativo
o utiliza. Concluir a exclusão remove a intenção. Reanexar o mesmo conteúdo
reativa o vínculo após nova conferência.

Um objeto sem vínculo aparece no inventário de manutenção. A autorização de
remoção volta a conferir classe e caminho; a deleção acontece pela Storage API,
nunca por escrita direta em `storage.objects`.

## Observações e revisão

Observações conservam alvo, texto, categoria, origem, estado e versão. Uma ação
em várias StudyUnits cria Observações separadas. Abrir, resolver e reabrir são
estados do mesmo registro.

A revisão contextual lê as Observações abertas e o percurso afetado. A correção
altera o curso corrente; não cria snapshots before/after permanentes. A pessoa
pode voltar à Unit, fazer outra Observação e revisar novamente.

## Analytics corrente

Analytics deriva números da estrutura, do desenho aplicado, das fontes e das
Observações. A autoria observável usa parâmetros definidos e a origem corrente
da criação e da última revisão das StudyUnits. Não existe tabela de fatos de
Analytics nem coleta de interação para alimentar o painel.

## Estado pessoal

Progresso, posição de retomada e marcas para rever pertencem à pessoa. Escritas
locais formam operações pequenas e repetíveis. No modo automático, o retorno
da conexão permite ler a versão remota, enviar a fila válida e gravar a versão
confirmada. No modo manual, essa troca aguarda a ação explícita de sincronizar.

Observações próprias possuem fila separada porque sua autorização e seus
conflitos diferem do progresso. Rascunhos de conteúdo autoral não entram nessa
fila.

## Continuidade entre abas

`BroadcastChannel` sinaliza mudanças locais. Uma aba não força a navegação da
outra; ela apenas informa que uma autoridade pode ter mudado. Ao recuperar foco,
visibilidade ou conexão, o modo automático relê o objeto pertinente e preserva
posição e foco quando a identidade ainda existe. No modo manual, o aviso marca
a necessidade de sincronizar, sem substituir conteúdo ou enviar filas em fundo.

Formulário ou confirmação em andamento adia a atualização. O rascunho permanece
até ser salvo ou descartado.

## Acesso e exclusão

O proprietário pode conceder Estudo direto e revogá-lo. A pessoa favorecida não
recebe Autoria no original. Funções SQL e RLS voltam a conferir essa relação em
cada operação.

Excluir uma conta exige remover seus objetos privados. O PostgreSQL não apaga
bytes automaticamente. O serviço prepara a retirada dos vínculos de cada curso,
reivindica intenções de arquivo, confirma os objetos pela Storage API e só então
conclui a exclusão relacional. Um PDF ou áudio utilizado por outra cópia não é
apagado por semelhança de prefixo. Avatares continuam limitados à pasta da conta.

## Evolução, backup e restauração

Migrations são a história reproduzível do schema. O código candidato usa apenas
o contrato corrente; Git e releases recuperam código, não dados.

Um dump lógico do PostgreSQL inclui estado relacional e metadados de Storage,
mas não os bytes. Backup de desastre precisa copiar também os objetos privados.
O ensaio `npm run test:backup-restore:local`:

1. prepara a estrutura histórica numa instância descartável sem rede, sem
   carregar objetos ou buckets atuais na época anterior;
2. insere uma fixture sintética integrada de curso;
3. produz um dump lógico;
4. restaura em outra instância descartável;
5. aplica o corte histórico e mede a redução de estruturas técnicas daquele corte;
6. aplica, em ordem, todas as migrations restantes até a revisão exata do
   manifesto corrente;
7. compara conteúdo, identidades, plano, configuração, fontes, vínculos,
   metadados de PDFs, observações e operações abertas, e valida os leitores atuais;
8. confirma que repetir a seleção pela história não reaplicaria migrations;
9. remove contêineres e volumes temporários.

O checkpoint histórico permanece identificável no relatório. Ele não é uma
revisão atual fixa nem substitui o backup dos dados do ambiente que será
atualizado. A repetição verifica a seleção das migrations pendentes; não afirma
que executar novamente todo arquivo SQL já aplicado seja uma operação válida.

O smoke `npm run test:storage:lifecycle:local` complementa essa prova com bytes
reais pela Storage API.

## Verificação

| Risco | Prova principal |
| --- | --- |
| hierarquia e composição | domínio, PGlite, PostgreSQL real e Playwright |
| concorrência e repetição | comandos repetidos, recibos e conflitos de versão |
| RLS e compartilhamento | usuários distintos e acessos revogados |
| Fonte, Âncora e citação | domínio, consultas correntes e Estudo |
| PDF e Storage | ingestão, download, remoção, reativação e órfão pela API |
| evolução destrutiva | fresh install e backup–restore–upgrade descartável |
| continuidade local | IndexedDB, duas abas, offline e retorno da conexão |

Consulte [Supabase no AraLearn](supabase.md) para o ambiente e a segurança, e
[Implantação](implantacao.md) para a ordem de promoção.

## Identidade escolhida e visitante

`person_profiles.handle` é único, normalizado em ASCII minúsculo e separado do
UUID estável. A migração deixa o campo vazio para contas existentes; o onboarding
exige escolha antes da experiência autenticada. Nomes anteriores são preservados
num arquivo relacional privado de migração, sem leitor de runtime. O perfil v2
validado pode ser reaberto offline no cache da própria conta; erro de autenticação
ou permissão invalida esse cache.

O visitante usa `aralearn-course-v1-visitor`, separado dos bancos por conta.
Progresso e Rever ficam locais e não chamam endpoints de estado pessoal. Leituras
públicas usam projeções permitidas; nenhuma tabela privada ganha acesso anônimo.
Entrar numa conta não associa silenciosamente os dados do visitante.

## Sincronização e concorrência no dispositivo

A preferência `aralearn.ui.study-synchronization` pertence ao dispositivo e é
observada entre abas. No modo manual, listas, composição já aberta e filas de
estudo usam o cache; `explicit: true` distingue a sincronização solicitada. Uma
consulta de acesso separada continua fresca e retira cursos cuja revogação foi
confirmada, sem substituir o conteúdo dos cursos autorizados.

Transações IndexedDB leem a revisão local atual antes de aplicar cada alteração.
Conclusões independentes na mesma lição e marcas de unidades diferentes são
reunidas. A requisição remota pendente conserva identidade e payload até receber
confirmação. Diferenças incompatíveis no mesmo dado permanecem como conflito
local, com comparação e resolução explícita, preservando alterações disjuntas.

A incorporação de estado visitante exige prévia e escolha dos cursos. O estado e
o recibo da incorporação são gravados na mesma transação do banco da conta; o
banco visitante permanece intacto. A união acrescenta conclusões e Rever,
preserva a posição da conta e não grava conteúdo do curso nem observações.
