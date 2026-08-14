# Arquitetura

O AraLearn separa conteúdo compartilhado, autoria em andamento e dados
pessoais. Revisões publicadas de curso ficam como JSON imutável no Supabase
Storage; uma submissão editorial aponta para o hash exato de uma publicação
privada. O workspace em edição é composto no PostgreSQL por partes atuais, sem
gravar uma cópia integral a cada comando. O IndexedDB conserva, em cada
dispositivo, o material e o estado necessários para continuar estudando sem
conexão.

## Conteúdo e organização

A árvore didática é formada por curso, módulo, lição, microssequência e card. O
envelope operacional `aralearn.library.v1`, com cards compostos por packages
versionados, é o formato de intercâmbio e publicação da árvore completa. O
kernel também valida o contrato unitário `aralearn.course.v1`, enquanto o
catálogo usa o protocolo de descoberta `aralearn.resource-library.v1`; os três
identificadores possuem raízes e finalidades distintas. Uma revisão publicada
possui hash SHA-256 e não é alterada depois de gravada.

Há duas representações remotas com finalidades diferentes:

- durante a autoria, o PostgreSQL mantém uma linha corrente para projeto,
  curso, módulo, lição, tópico, microssequência e card;
- depois da publicação, a árvore completa existe uma vez como artefato JSON no
  Storage, e o PostgreSQL conserva seu hash e os metadados de acesso.

O dispositivo projeta o artefato publicado em tabelas do IndexedDB, onde a
normalização ajuda navegação, estudo e atualização transacional.

Coleções organizam o catálogo oficial. Trilhas projetam, para cada pessoa,
planos de workspace, cursos em materialização e cursos oficiais selecionados.
As duas projeções usam grupos e cards equivalentes na
interface, mas não compartilham autoridade: grupos de Trilhas pertencem à conta;
grupos de Coleções são metadados editoriais globais. Workspaces contextualizam
autoria e participação: o mesmo usuário pode ter papéis diferentes em espaços
distintos. Trilhas e Coleções continuam vistas simples, não autoridades
paralelas.

O workspace composto é também o workspace educacional. `owner_id` identifica o
proprietário principal; `educational_workspace_members` contém os papéis locais.
Capacidades são derivadas no PostgreSQL e revalidadas a cada operação remota.
Convites são efêmeros e armazenam hash do código. O workspace aparece
diretamente em Trilhas para cada membro autorizado; isso não cria seleção,
publicação nem artefato por participante.

O detalhe administrativo deriva até 50 raízes de curso diretamente de
`authoring_workspace_entities`, contando descendentes e microssequências
prontas e consultando os vínculos `private|catalog` já existentes. A projeção
não cria tabela, artefato ou histórico; o total separado permite indicar quando
há mais raízes do que a página estreita devolvida.

## Catálogo oficial e autoria pessoal

Cada publicação oficial aponta para uma revisão imutável no Storage. A
biblioteca mostra coleções e metadados. Uma ação explícita de seleção concede à
conta apenas o vínculo com o curso e o hash vigente; o documento é baixado para
o dispositivo quando necessário. Abrir ou iniciar o estudo é uma consulta e não
executa seleção, movimentação, cópia, publicação ou outra mutação.

Grupos pessoais são mantidos por `study_paths` e `study_path_items`, vinculados
ao `trailItemId` estável. Criar, renomear ou excluir um grupo afeta
somente a conta e aceita tanto um plano quanto um curso materializado ou
selecionado. A exclusão do grupo preserva o item e o estado de estudo,
deixando-o em **Outros** até nova organização. Grupos e cursos usam ordem
alfabética automática. Coleções e classificações pertencem ao plano de controle
editorial; contas autorizadas podem administrá-las pelo aplicativo, com
confirmação explícita para operações de alcance global.

Edição manual e assistência por API acontecem no próprio conteúdo renderizado.
A seleção congela a autoridade, o fragmento e a revisão correntes; a resposta
estruturada é validada em memória e confirmada inteira com compare-and-swap. A
interface mostra diretamente o resultado, sem etapa intermediária nem
validação exposta como tarefa da pessoa.

Curso privado próprio permanece na mesma identidade privada. Curso oficial é
somente leitura para conta comum; uma conta administrativa ou editorial pode
alterá-lo mantendo sua continuidade oficial. O aplicativo não cria fork
privado automático de conteúdo de Coleções. Curso privado de outra pessoa não
é editável neste recorte. Cache e capacidade desconhecida sempre falham
fechados. A passagem de privado para catálogo continua exclusiva da autoria
por GPT personalizado com Action ou por um cliente compatível pela integração
MCP.

A autoridade bottom-up é hierárquica e limitada: instâncias de packages ou o
card inteiro no nível de card; cards selecionados ou o recipiente no nível de
microssequência; microssequências selecionadas ou o recipiente no nível de
lição. Todos os filhos precisam estar selecionados para autorizar criação no
recipiente. O fluxo local não atua em módulo ou curso. Contexto não selecionado
entra somente para leitura, com vizinhos limitados e um índice compacto da
lição.

No card, a assistência mantém uma conversa volátil de até oito turnos e nove
versões exatas, com desfazer, refazer e restauração. Um turno sem mudança guarda
somente a explicação e não cria versão. O histórico não é persistido nem se
confunde com cópias do curso. A autoria extensa consulta o mesmo catálogo de
packages pelo GPT personalizado com Action ou por um cliente compatível pela
integração MCP. Não há merge silencioso.

Cada comando do workspace usa `expectedRevision` para recusar uma base
desatualizada e `requestId` para permitir repetição segura depois de uma falha
de rede. A exclusão do próprio workspace segue o mesmo compare-and-swap: a
revisão lida precisa ser informada antes de descartá-lo. Eventos recentes
registram resumos pequenos das alterações; não são cópias do curso e não
permitem restaurar estados antigos.

Para localizar um card, o chat pagina diretamente os filhos da
microssequência no PostgreSQL e recebe apenas metadados curtos. Só o card
escolhido é lido integralmente. Essa consulta existe para workspace; conteúdo
publicado precisa ser aberto ou importado antes de uma correção.

Copiar uma entidade cria uma subárvore independente com identidades novas.
Mover transfere a entidade atual e remove a origem na mesma alteração. Essa
regra permite recombinar partes entre cursos sem compartilhar, por acidente, o
mesmo conteúdo mutável.

Excluir a raiz que representava um curso publicado remove também seu vínculo
de continuidade naquele workspace, sem apagar outras raízes do projeto nem a
publicação já distribuída. Se o curso publicado for aberto outra vez, o backend
pode criar uma nova composição a partir da revisão corrente, sem encontrar um
vínculo órfão.

Retirar um curso oficial da biblioteca remove a seleção, sem remover a
publicação oficial nem interferir na biblioteca de outra conta. Estado pessoal
e posição pertencem ao `trailItemId` estável: se ainda existir a composição de
workspace da mesma identidade, ela continua em `Trilhas`. Excluir essa
composição é outra operação, baseada na revisão corrente da raiz ou do
workspace. Uma submissão editorial ativa continua protegendo seu artefato até
ser retirada ou concluída.

A retirada administrativa de um curso oficial tem outro alcance: retira sua
classificação e publicação de `Coleções`, elimina todas as seleções e os estados
pessoais dependentes e desativa o alias distribuído. Se houver um workspace
vinculado, sua composição e o vínculo leve de continuidade permanecem; remover
a raiz ou o workspace é outra operação explícita. Os tombstones dos feeds
impedem que uma réplica antiga ressuscite a publicação. O botão correspondente
só é habilitado por uma capacidade editorial autenticada.

O aplicativo serializa a exclusão com a réplica: conclui a fila local e exige
uma sincronização fresca antes do commit remoto; depois dele, confirma a
retirada local, sincroniza novamente e recompõe a projeção. O `requestId` é
determinístico para a seleção, o curso e a revisão que formam a intenção. Uma
resposta ambígua de rede pode repetir essa mesma intenção uma única vez; falha
determinística, conflito ou nova revisão não produzem repetição automática. Se
o commit remoto ocorreu e só a reconciliação local falhou, o erro marca a ação
como concluída para evitar uma segunda exclusão.

## Dados pessoais e réplica local

Seleções, trilhas, estado funcional de estudo e comentários são dados pessoais. O estado funcional limita-se a cursor, conclusão estrutural e marca **Rever**; não contém abertura, tempo, tentativas ou resultados. As regras de acesso do Supabase permitem que a pessoa leia e altere somente os próprios dados.

Cada conta usa um banco local identificado por seu UUID. Entrar em outra conta abre outro banco. Sair não apaga o material local nem as alterações que aguardam envio.

Ao abrir o aplicativo, o servidor entrega a projeção corrente de `Trilhas` e o
ponto a partir do qual novas mudanças devem ser recebidas. O dispositivo grava
essa lista de uma vez. A composição de um workspace é baixada somente quando a
pessoa abre seu plano ou curso e substitui o cache anterior pela revisão
corrente; artefatos oficiais selecionados continuam na réplica para estudo sem
conexão.

## Sincronização

Uma ação de estudo passa por quatro etapas:

```text
alteração na tela
→ gravação no dispositivo
→ fila de envio
→ envio e recebimento das mudanças remotas
```

O aplicativo tenta sincronizar quando está aberto e há conexão. Cada alteração tem um identificador próprio; se uma resposta se perder, a mesma alteração pode ser enviada novamente sem duplicar dados.

Mudanças remotas são recebidas em páginas. Cada página é aplicada no dispositivo antes da próxima. Se faltar rede, se a sessão expirar ou se o aplicativo for fechado, o que ainda não foi enviado permanece guardado.

Para seleções, trilhas, estado funcional e comentários, vale a última alteração válida aceita pelo servidor. Conteúdo de curso não viaja nessa fila.

O sinal de revisão publicada conserva somente a mudança mais recente por
curso e audiência, inclusive quando ela é uma retirada. Como a mudança atual
sempre recebe uma sequência nova, um dispositivo que consulta a partir de sua
última sequência continua recebendo o estado vigente sem o banco acumular uma
linha por republicação. A retirada conserva uma marca de exclusão (*tombstone*)
por curso distinto;
ele não expira enquanto esse feed não possuir watermark próprio para exigir
full resync de clientes antigos.

O feed pessoal de seleções, trilhas, progresso e comentários usa outro
watermark, baseado nos dispositivos ativos. A primeira escrita elegível de cada
dia tenta inativar dispositivos vencidos e compactar automaticamente o prefixo
já seguro e os registros de deduplicação, sem depender de operação manual.

## Atualização do catálogo

Uma nova publicação é baixada e validada antes de substituir a árvore local. Se houver falha no download, o material anterior continua disponível. Partes que conservam a mesma identidade mantêm progresso e comentários.

Uma atualização que alcançaria uma alteração local ainda não resolvida é adiada. O aplicativo conserva o material local e aguarda uma ação válida, em vez de substituir dados sem aviso.

## Autenticação e segurança

O aplicativo usa Supabase Auth para cadastro, confirmação de e-mail, recuperação de senha, renovação de sessão e saída. Sem sessão, apenas a tela de acesso é exibida.

Web e Android recebem somente a URL pública do projeto e a chave pública de acesso. Senha de banco, chave administrativa e outros segredos não entram no site, no APK ou no armazenamento local. As operações sensíveis passam por funções autorizadas no banco.

## Limites de portabilidade

A aplicação web é composta por arquivos estáticos e pode ser servida por GitHub Pages, outro servidor HTTPS ou uma intranet que permita acesso ao projeto Supabase. Essa portabilidade não torna os serviços intercambiáveis: autenticação, RLS, PostgREST, RPCs e Edge Functions fazem parte do contrato operacional atual.

Uma migração para outro BaaS ou para PostgreSQL sem os serviços do Supabase precisa de adaptadores e testes de conformidade para todos esses contratos. O repositório ainda não contém essa camada. O Supabase local em Docker serve para desenvolvimento e ensaios descartáveis; não constitui um roteiro de operação auto-hospedada em produção.

Também não existe pacote SharePoint/SPFx. O aplicativo protege a navegação contra incorporação em `iframe`, portanto deve ser aberto diretamente quando servido em uma intranet. Os perfis efetivamente disponíveis estão em [Implantação](implantacao.md#formas-de-implantação).

## Código

| Área | Responsabilidade |
| --- | --- |
| `src/domain/` | Entidades e envelope operacional multi-curso. |
| `src/resources/kernel/` | Envelope unitário de curso, composição de cards, registro de packages e validação do subconjunto de schema suportado. |
| `src/resources/catalog/` | Famílias, vocabulário controlado, política de seleção e descoberta progressiva. |
| `src/resources/packages/` | Manifests, contratos, schemas e renderers independentes. |
| `src/model/` | Dados preparados para apresentação. |
| `src/render/` | Composição única dos packages no card. |
| `src/ui/` | Telas de acesso, biblioteca, estudo e autoria pessoal. |
| `src/persistence/` | Normalização, montagem e transações locais. |
| `src/supabase/` | Configuração pública, autenticação e catálogo. |
| `src/sync/` | Identidade do dispositivo e sincronização. |
| `src/generation/` | Schemas, providers e compilação da assistência bottom-up. |

## Publicação de cursos

Criar a raiz do curso já a inclui na projeção de `Trilhas`; materializar cards
torna essas partes estudáveis diretamente das linhas correntes do workspace.
Isso não chama publicação nem grava JSON no Storage.

A publicação explícita seleciona um curso do workspace, compõe e valida o
documento e só então grava uma revisão imutável no Storage. A escrita final
troca atomicamente o ponteiro vigente. Uma revisão privada `partial` pode fixar
o conteúdo exato de uma submissão editorial; o catálogo aceita somente
`complete`.

Cada raiz de curso guarda um vínculo compacto e separado para os destinos
privado e catálogo. Por isso a primeira publicação cria o curso e as seguintes
atualizam automaticamente a mesma identidade, inclusive depois de retomar a
autoria em outra conversa. O vínculo contém apenas identidade, hash-base e
datas; não duplica o conteúdo. Existe no máximo uma composição ativa vinculada
a cada identidade de publicação e destino; abrir novamente o curso reutiliza
essa composição. O título não participa dessa identidade, portanto projetos
independentes com o mesmo nome não são unidos. Importar uma cópia para consulta
ou reaproveitamento não cria o vínculo.

A interface percorre todas as páginas de `Trilhas`, rejeita item sem identidade
e cursor repetido e só troca o cache quando a projeção terminou. Uma falha em
qualquer página conserva a projeção anterior, mas revoga as capacidades
exibidas. A leitura offline do cache é sempre somente leitura: `canEdit`,
`canDelete`, `canRemove` e as capacidades editoriais são forçadas para falso.
Cada item informa a origem corrente (`workspace` ou `selection`), as contagens
estruturais e `completedCardCount`; a tela inicial não baixa a árvore apenas
para calcular progresso. Ao abrir uma composição de workspace, o cliente lê
suas partes em páginas sob uma única revisão e só monta o curso depois de
validar o conjunto completo.
O bloqueio temporário contra comandos repetidos é contado por operação, para
que chamadas encadeadas ou uma falha não deixem abas e botões desabilitados.

Na web, a marca monocromática acompanha o tema por CSS. O launcher Android usa
um ícone adaptativo com o desenho dentro da zona segura, kanji escuro sobre
fundo claro e uma camada `monochrome` que o launcher pode colorir quando o
usuário ativa ícones temáticos.

O caminho editorial é:

```text
autoria privada visível em Trilhas
→ artefato privado da revisão a submeter
→ submissão de uma revisão específica
→ revisão em workspace editorial independente
→ catálogo
```

A submissão fixa o hash exato que será avaliado. A pessoa revisora não recebe a
biblioteca privada do autor; lê apenas o artefato enviado. Se precisar
corrigi-lo, abre uma cópia editorial independente. Pedir ajustes e rejeitar
exigem justificativa; publicar no catálogo conclui a submissão e exige curso
completo e coleção.

Uma conta editorial também pode criar ou atualizar diretamente um curso
`complete` de seu próprio workspace numa coleção, sem fabricar uma submissão
para si mesma.

Não há um GPT administrativo separado. Action e MCP chegam ao mesmo motor de
autoria, e as capacidades são calculadas pela conta conectada: autoria privada,
submissão, revisão e publicação podem aparecer em combinações diferentes.

Papéis editoriais globais não ampliam as regras de acesso aos dados pessoais. Em especial, `catalog_publisher` pode publicar conteúdo, mas não se torna administrador de progresso, observações ou cursos privados. A única leitura compartilhada de observações deriva de papel local no workspace associado, por uma projeção contextual que nunca expõe progresso ou trilhas.

Detalhes da réplica local estão em [Persistência relacional e sincronização](persistencia-relacional.md).
O plano remoto está em [Plano de controle e artefatos](plano-de-controle-e-artefatos.md).
O formato de intercâmbio está em [Contrato público](aralearn-contract.md). O
fluxo editorial está em [Autoria e publicação do catálogo](autoria-do-catalogo.md).
O percurso de uso está em [Criar cursos pelo chat](criar-cursos-pelo-chat.md).
As definições normativas usadas nesta descrição estão no [Glossário
técnico](glossario-tecnico.md), e a correspondência entre afirmações,
implementação e testes está na [Matriz de conformidade
técnica](matriz-conformidade-tecnica.md).
