# Arquitetura

O AraLearn separa conteúdo compartilhado de dados pessoais. Revisões completas
de curso ficam como JSON imutável no Supabase Storage; o PostgreSQL guarda o
catálogo, os ponteiros de revisão e o estado transacional. O IndexedDB conserva,
em cada dispositivo, o material e o estado necessários para continuar estudando
sem conexão.

## Conteúdo e organização

A árvore didática é formada por curso, módulo, lição, microssequência e card. O
JSON v3 validado é a fonte de verdade dessa árvore. Uma revisão possui hash
SHA-256 e não é alterada depois de gravada.

O PostgreSQL não recebe módulos, lições, cards e recursos de uma nova revisão
como linhas. O dispositivo pode projetar o documento para suas tabelas locais no
IndexedDB, onde a normalização ajuda navegação, estudo e atualização
transacional sem impor esse custo ao banco remoto.

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

## Limites de portabilidade

A aplicação web é composta por arquivos estáticos e pode ser servida por GitHub Pages, outro servidor HTTPS ou uma intranet que permita acesso ao projeto Supabase. Essa portabilidade não torna os serviços intercambiáveis: autenticação, RLS, PostgREST, RPCs e Edge Functions fazem parte do contrato operacional atual.

Uma migração para outro BaaS ou para PostgreSQL sem os serviços do Supabase precisa de adaptadores e testes de conformidade para todos esses contratos. O repositório ainda não contém essa camada. O Supabase local em Docker serve para desenvolvimento e ensaios descartáveis; não constitui um roteiro de operação auto-hospedada em produção.

Também não existe pacote SharePoint/SPFx. O aplicativo protege a navegação contra incorporação em `iframe`, portanto deve ser aberto diretamente quando servido em uma intranet. Os perfis efetivamente disponíveis estão em [Implantação](implantacao.md#formas-de-implantação).

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

A publicação administrativa recebe artefatos v3, valida a árvore completa na
aplicação e grava uma revisão imutável no Storage. A única escrita final no
banco troca atomicamente o ponteiro vigente. Uma revisão incompleta nunca é
visível aos estudantes.

A API editorial mantém somente estado, tentativas, leases, hashes e referências
em tabelas privadas. Planos, partes, relatórios e o documento final não entram em
JSONB no PostgreSQL. Cada comando adquire idempotência antes do trabalho pesado,
faz upload fora da transação e confirma a transição numa transação curta.

Os papéis editoriais não ampliam as regras de acesso aos dados pessoais. Em especial, `catalog_publisher` pode publicar conteúdo, mas não se torna administrador de progresso, comentários ou cursos privados.

Detalhes da réplica local estão em [Persistência relacional e sincronização](persistencia-relacional.md).
O plano remoto está em [Plano de controle e artefatos](plano-de-controle-e-artefatos.md).
O formato de intercâmbio está em [Contrato público](aralearn-contract.md). O
fluxo editorial está em [Autoria e publicação do catálogo](autoria-do-catalogo.md).
