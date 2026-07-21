# Arquitetura

O AraLearn separa conteúdo compartilhado de dados pessoais. O PostgreSQL do Supabase guarda a fonte comum; o IndexedDB guarda, em cada dispositivo, o material e o estado necessários para continuar estudando sem conexão.

## Conteúdo e organização

A árvore didática é formada por curso, módulo, lição, microssequência e card. Módulos, lições, tópicos, dependências, cards, blocos e recursos visuais são armazenados em linhas relacionadas por UUIDs, chaves estrangeiras e posições.

O JSON v3 representa essa árvore para importação, exportação, validação e montagem em memória. Ele não é salvo como um único documento no banco nem no dispositivo.

Coleções organizam o catálogo oficial. Trilhas organizam os cursos selecionados por cada pessoa. Coleções pertencem ao catálogo; trilhas pertencem à conta.

## Catálogo oficial e cópia pessoal

Cada publicação oficial possui uma única árvore no PostgreSQL. A biblioteca mostra coleções e metadados. Ao selecionar um curso, a conta recebe apenas esse vínculo; a árvore é baixada para o dispositivo quando for necessária.

O curso oficial permanece compartilhado enquanto é estudado. A primeira alteração de conteúdo cria uma árvore pessoal independente, com novas identidades persistidas e a seleção da conta apontando para ela. Progresso, comentários e trilhas acompanham essa mudança. Depois disso, o aplicativo envia somente as linhas modificadas.

Retirar um curso da biblioteca remove a seleção e os dados pessoais ligados a ela. Não remove a publicação oficial nem interfere na biblioteca de outra conta.

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

Para seleções, trilhas, progresso, comentários e alterações de cursos pessoais, vale a última alteração válida aceita pelo servidor. O estudante não precisa resolver versões manualmente.

## Atualização do catálogo

Uma nova publicação é baixada e validada antes de substituir a árvore local. Se houver falha no download, o material anterior continua disponível. Partes que conservam a mesma identidade mantêm progresso e comentários.

Uma atualização que alcançaria uma alteração local ainda não resolvida é adiada. O aplicativo conserva o material local e aguarda uma ação válida, em vez de substituir dados sem aviso.

## Autenticação e segurança

O aplicativo usa Supabase Auth para cadastro, confirmação de e-mail, recuperação de senha, renovação de sessão e saída. Sem sessão, apenas a tela de acesso é exibida.

Web e Android recebem somente a URL pública do projeto e a chave pública de acesso. Senha de banco, chave administrativa e outros segredos não entram no site, no APK ou no armazenamento local. As operações sensíveis passam por funções autorizadas no banco.

## Código

| Área | Responsabilidade |
| --- | --- |
| `src/domain/` | Entidades e regras do domínio. |
| `src/contract/` | Contrato JSON v3 e validação. |
| `src/model/` | Dados preparados para apresentação. |
| `src/render/` | Renderização dos cards. |
| `src/ui/` | Telas de acesso, biblioteca, estudo e autoria pessoal. |
| `src/persistence/` | Normalização, montagem e transações locais. |
| `src/supabase/` | Configuração pública, autenticação e catálogo. |
| `src/sync/` | Identidade do dispositivo e sincronização. |
| `src/generation/` | Planejamento e assistência de linguagem. |

## Publicação de cursos

A publicação administrativa recebe um JSON v3 válido, transforma-o em linhas relacionais, confere a árvore completa e só então o disponibiliza no catálogo. Cursos grandes podem ser enviados por partes, mas uma importação incompleta nunca aparece para estudantes.

A API editorial mantém planos, partes e relatórios em tabelas privadas de preparação. Esses documentos transitórios não substituem a árvore relacional e não são consultáveis pelo aplicativo. Cada comando passa por uma função autorizada, traz um identificador idempotente e deixa registro de auditoria. A materialização final usa o mesmo importador relacional retomável empregado pelas fixtures oficiais.

Os papéis editoriais não ampliam as regras de acesso aos dados pessoais. Em especial, `catalog_publisher` pode publicar conteúdo, mas não se torna administrador de progresso, comentários ou cursos privados.

Detalhes da réplica local estão em [Persistência relacional e sincronização](persistencia-relacional.md). O formato de intercâmbio está em [Contrato público](aralearn-contract.md). O fluxo editorial está em [Autoria e publicação do catálogo](autoria-do-catalogo.md).
