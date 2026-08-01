# Arquitetura

O AraLearn separa conteúdo compartilhado, autoria em andamento e dados
pessoais. Revisões publicadas de curso ficam como JSON imutável no Supabase
Storage; uma submissão editorial aponta para o hash exato de uma publicação
privada. O workspace em edição é composto no PostgreSQL por partes atuais, sem
gravar uma cópia integral a cada comando. O IndexedDB conserva, em cada
dispositivo, o material, o rascunho local e o estado necessários para continuar
estudando sem conexão.

## Conteúdo e organização

A árvore didática é formada por curso, módulo, lição, microssequência e card. O
JSON v4 validado é a forma canônica de intercâmbio e publicação. Uma revisão
publicada possui hash SHA-256 e não é alterada depois de gravada.

Há duas representações remotas com finalidades diferentes:

- durante a autoria, o PostgreSQL mantém uma linha corrente para projeto,
  curso, módulo, lição, tópico, microssequência e card;
- depois da publicação, a árvore completa existe uma vez como artefato JSON no
  Storage, e o PostgreSQL conserva seu hash e os metadados de acesso.

O dispositivo projeta o artefato publicado em tabelas do IndexedDB, onde a
normalização ajuda navegação, estudo e atualização transacional.

Coleções organizam o catálogo oficial. Trilhas organizam os cursos selecionados por cada pessoa. Workspaces contextualizam autoria e participação: o mesmo usuário pode ter papéis diferentes em espaços distintos. Trilhas e Coleções continuam vistas simples, não autoridades paralelas.

O workspace composto é também o workspace educacional. `owner_id` identifica o
proprietário principal; `educational_workspace_members` contém os papéis locais.
Capacidades são derivadas no PostgreSQL e revalidadas a cada operação remota.
Convites são efêmeros e armazenam hash do código. Publicações privadas concedem
seleção aos membros sem duplicar o artefato do curso.

## Catálogo oficial e autoria pessoal

Cada publicação oficial aponta para uma revisão imutável no Storage. A biblioteca mostra coleções e metadados. Ao selecionar um curso, a conta recebe apenas esse vínculo e o hash vigente; o documento é baixado para o dispositivo quando necessário.

Uma alteração local feita no aplicativo não clona nem modifica conteúdo
pedagógico remoto: ela grava um `localDraft` transacional no IndexedDB. A
autoria extensa pelo Chatbot ou Plugin altera somente as partes necessárias do
workspace composto, recompõe e valida o documento v4 e pode materializar uma
nova revisão de curso. Não há merge silencioso.

Cada comando do workspace usa `expectedRevision` para recusar uma base
desatualizada e `requestId` para permitir repetição segura depois de uma falha
de rede. Eventos recentes registram resumos pequenos das alterações; não são
cópias do curso e não permitem restaurar estados antigos.

Para localizar um card, o chat pagina diretamente os filhos da
microssequência no PostgreSQL e recebe apenas metadados curtos. Só o card
escolhido é lido integralmente. Essa consulta existe para workspace; conteúdo
publicado precisa ser aberto ou importado antes de uma correção.

Copiar uma entidade cria uma subárvore independente com identidades novas.
Mover transfere a entidade atual e remove a origem na mesma alteração. Essa
regra permite recombinar partes entre cursos sem compartilhar, por acidente, o
mesmo conteúdo mutável.

Retirar um curso oficial da biblioteca remove a seleção e os dados pessoais
ligados a ela. Não remove a publicação oficial nem interfere na biblioteca de
outra conta. Ao retirar uma publicação privada própria pelo chat, o AraLearn
também arquiva essa publicação e libera sua referência ao artefato corrente;
uma submissão editorial ativa continua protegendo o conteúdo até ser retirada
ou concluída.

## Dados pessoais e réplica local

Seleções, trilhas, progresso e comentários são dados pessoais. As regras de acesso do Supabase permitem que a pessoa leia e altere somente os próprios dados.

Cada conta usa um banco local identificado por seu UUID. Entrar em outra conta abre outro banco. Sair não apaga o material local nem as alterações que aguardam envio.

Ao abrir o aplicativo, o servidor entrega o estado pessoal e o ponto a partir do qual novas mudanças devem ser recebidas. O dispositivo grava esse conjunto de uma vez e baixa apenas as árvores de cursos selecionados que estejam ausentes ou desatualizadas.

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

Para seleções, trilhas, progresso e comentários, vale a última alteração válida aceita pelo servidor. Conteúdo de curso não viaja nessa fila.

O sinal de revisão publicada conserva somente a mudança mais recente por
curso e audiência, inclusive quando ela é uma retirada. Como a mudança atual
sempre recebe uma sequência nova, um dispositivo que consulta a partir de sua
última sequência continua recebendo o estado vigente sem o banco acumular uma
linha por republicação. A retirada conserva um tombstone por curso distinto;
ele não expira enquanto esse feed não possuir watermark próprio para exigir
full resync de clientes antigos.

O feed pessoal de seleções, trilhas, progresso e comentários usa outro
watermark, baseado nos dispositivos ativos. A primeira escrita elegível de cada
dia tenta inativar dispositivos vencidos e compactar automaticamente o prefixo
já seguro e o ledger de idempotência, sem depender de operação manual.

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
| `src/domain/` | Entidades e regras do domínio. |
| `src/contract/` | Contrato JSON v4 e validação. |
| `src/model/` | Dados preparados para apresentação. |
| `src/render/` | Renderização dos cards. |
| `src/ui/` | Telas de acesso, biblioteca, estudo e autoria pessoal. |
| `src/persistence/` | Normalização, montagem e transações locais. |
| `src/supabase/` | Configuração pública, autenticação e catálogo. |
| `src/sync/` | Identidade do dispositivo e sincronização. |
| `src/generation/` | Assistência atômica de cards, schemas e providers de linguagem. |

## Publicação de cursos

A publicação seleciona um curso do workspace, compõe e valida o documento e só
então grava uma revisão imutável no Storage. A escrita final troca
atomicamente o ponteiro vigente. Uma revisão `partial` pode aparecer apenas
como prévia privada do proprietário; o catálogo aceita somente `complete`.

Cada raiz de curso guarda um vínculo compacto e separado para os destinos
privado e catálogo. Por isso a primeira publicação cria o curso e as seguintes
atualizam automaticamente a mesma identidade, inclusive depois de retomar a
autoria em outra conversa. O vínculo contém apenas identidade, hash-base e
datas; não duplica o conteúdo. Importar uma cópia para consulta ou
reaproveitamento não cria esse vínculo.

O caminho editorial é:

```text
autoria privada
→ prévia privada, parcial ou completa
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

Não há um GPT administrativo separado. Plugin e Chatbot chegam ao mesmo motor,
e as capacidades são calculadas pela conta conectada: autoria privada,
submissão, revisão e publicação podem aparecer em combinações diferentes.

Papéis editoriais globais não ampliam as regras de acesso aos dados pessoais. Em especial, `catalog_publisher` pode publicar conteúdo, mas não se torna administrador de progresso, observações ou cursos privados. A única leitura compartilhada de observações deriva de papel local no workspace associado, por uma projeção contextual que nunca expõe progresso ou trilhas.

Detalhes da réplica local estão em [Persistência relacional e sincronização](persistencia-relacional.md).
O plano remoto está em [Plano de controle e artefatos](plano-de-controle-e-artefatos.md).
O formato de intercâmbio está em [Contrato público](aralearn-contract.md). O
fluxo editorial está em [Autoria e publicação do catálogo](autoria-do-catalogo.md).
O percurso de uso está em [Criar cursos pelo chat](criar-cursos-pelo-chat.md).
