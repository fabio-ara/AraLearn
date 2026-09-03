# Persistência relacional e continuidade local

O AraLearn precisa manter um Curso coerente quando diferentes superfícies leem
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
| Curso, estrutura, plano e Partes | PostgreSQL |
| configuração e desenho aplicado | PostgreSQL |
| Fontes, Âncoras e vínculos de PDF | PostgreSQL; bytes no Storage |
| Observações autorais compartilhadas | PostgreSQL |
| composição validada para uso sem rede | IndexedDB, como réplica |
| progresso, posição e marcas pessoais | PostgreSQL, com fila local delimitada |
| rascunho ainda não enviado | memória ou IndexedDB conforme risco de perda |

## Modelo corrente do Curso

`public.courses` contém identidade, proprietário, título, objetivo e revisão. A
estrutura curricular usa entidades ligadas por Curso, tipo, pai e posição. A
ordem é validada pelo banco; uma StudyUnit não pode pertencer a duas posições no
mesmo pai.

O plano possui mapa curricular global, estado de aprovação, pré-requisitos,
itens de escopo, repertório de unidades de análise, requisitos de evidência e
partes. Cada parte referencia microssequências já existentes. Esses vínculos
permitem preparar um lote sem convertê-lo em nível didático.

Parâmetros pedagógicos, direção editorial e política de componentes possuem
uma atribuição corrente por Curso ou escopo permitido. Remover uma atribuição
local restaura herança. A linha anterior não permanece como estado de produto.

Uma unidade de estudo pode guardar o snapshot focal e a aplicação de desenho
que recebeu. O snapshot contém apenas parâmetros e itens pertinentes à sua
microssequência; a aplicação registra ideias introduzidas, ideias estabelecidas
usadas, formas explicativas, componentes e prática efetivamente usados.

## Escritas concorrentes

A revisão do Curso protege mudanças que atravessam vários objetos. Versões
locais protegem objetos que podem mudar sem reescrever a composição inteira.
Uma escrita aceita somente o estado que foi lido ou um replay reconhecido.

Quando uma resposta se perde, uma identidade de pedido permite recuperar o
resultado sem duplicar a operação. `course_change_receipts` é a autoridade
temporária dessa repetição. A rotina de retenção remove recibos expirados; eles
não constituem log de autoria.

A camada confiável de MCP e Actions gera esses controles. A interface e o GPT
trabalham com título, posição, escopo e consequência humana.

## Composição e paginação

As leituras de composição devolvem páginas ordenadas e ligadas à mesma revisão.
O cliente rejeita mistura de revisões, entidade duplicada, cursor repetido e
hierarquia inválida antes de substituir a réplica.

Conteúdo mantém somente uma janela de StudyUnits no DOM. Um deep link identifica
a Unit inicial; curso, contexto e posição são preservados ao voltar ou avançar.

Uma edição manual envia apenas o segmento alterado e sua versão. Alterações
assistidas passam pelo mesmo normalizador e renderer antes de serem salvas.
Editar um Curso compartilhado pela primeira vez cria uma cópia pessoal privada;
o original permanece intacto.

## Fontes e proveniência

Fonte e Âncora são linhas correntes. `sourceRevision` e `anchorRevision` nos
contratos públicos funcionam como versões de concorrência. Atualizar metadados
ou localizador incrementa a versão; a leitura cotidiana não percorre revisões
anteriores.

Uma atribuição corrente liga um item do plano ou uma StudyUnit a Fontes e
Âncoras. A alteração do conteúdo do alvo invalida uma atribuição que já não
corresponde a ele, e a próxima revisão precisa reaplicar a proveniência
coerente.

O Estudo recebe apenas citações permitidas pela visibilidade da Fonte. O texto
integral de uma Observação ou o PDF privado não é incluído nessa projeção.

## PDFs privados

O descritor relacional contém Fonte, versão, resumo SHA-256, tamanho, tipo e
caminho. O objeto fica no bucket privado `course-source-pdfs`.

Uma ingestão usa uma intenção curta para reservar cota e selar os dados. O
serviço envia e relê o objeto pela Storage API antes de ativar o vínculo. Objetos
iguais podem compartilhar o mesmo caminho dentro da origem sem contar bytes em
dobro.

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
altera o Curso corrente; não cria snapshots before/after permanentes. A pessoa
pode voltar à Unit, fazer outra Observação e revisar novamente.

## Analytics corrente

Analytics deriva números da estrutura, do desenho aplicado, das Fontes e das
Observações. A autoria observável usa parâmetros definidos e a origem corrente
da criação e da última revisão das StudyUnits. Não existe tabela de fatos de
Analytics nem coleta de interação para alimentar o painel.

## Estado pessoal

Progresso, posição de retomada e marcas para rever pertencem à pessoa. Escritas
locais formam operações pequenas e repetíveis. Ao reconectar, o repositório lê a
versão remota, envia a fila válida e grava a nova versão confirmada.

Observações próprias possuem fila separada porque sua autorização e seus
conflitos diferem do progresso. Rascunhos de conteúdo autoral não entram nessa
fila.

## Continuidade entre abas

`BroadcastChannel` sinaliza mudanças locais. Uma aba não força a navegação da
outra; ela apenas informa que uma autoridade pode ter mudado. Ao recuperar foco,
visibilidade ou conexão, a tela relê o objeto pertinente e preserva posição e
foco quando a identidade ainda existe.

Formulário ou confirmação em andamento adia a atualização. O rascunho permanece
até ser salvo ou descartado.

## Acesso e exclusão

O proprietário pode conceder Estudo direto e revogá-lo. A pessoa favorecida não
recebe Autoria no original. Funções SQL e RLS voltam a conferir essa relação em
cada operação.

Excluir uma conta exige remover seus objetos privados. O PostgreSQL não apaga
bytes automaticamente; o serviço limpa prefixos autorizados pela Storage API e
repete a exclusão relacional. Um PDF compartilhado por vínculo válido não é
apagado por semelhança de prefixo.

## Evolução, backup e restauração

Migrations são a história reproduzível do schema. O código candidato usa apenas
o contrato corrente; Git e releases recuperam código, não dados.

Um dump lógico do PostgreSQL inclui estado relacional e metadados de Storage,
mas não os bytes. Backup de desastre precisa copiar também os objetos privados.
O ensaio `npm run test:backup-restore:local`:

1. clona a stack local para uma instância descartável;
2. insere uma fixture integrada de Curso;
3. produz um dump lógico;
4. restaura em outra instância descartável;
5. aplica a migration seguinte;
6. confere estrutura, plano, desenho, Fontes, PDFs, Observações e operações
   ainda abertas;
7. mede a redução de tabelas, colunas, funções e políticas técnicas;
8. remove contêineres e volumes temporários.

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
