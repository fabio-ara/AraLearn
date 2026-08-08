# Workspaces educacionais

Um workspace reúne pessoas e um projeto de curso sem criar outra cópia do
conteúdo. A mesma pessoa pode ser autora em um workspace e estudante em outro.
O papel é sempre local ao workspace.

## Papéis

| Papel | Pode fazer |
| --- | --- |
| Proprietário | administrar, criar, revisar, publicar e transferir a propriedade principal |
| Administrador | administrar pessoas, criar, revisar e publicar |
| Professor/Autor | criar, revisar e publicar |
| Revisor | ler, comentar e revisar |
| Estudante | estudar e registrar observações próprias |
| Leitor | consultar |

O banco calcula essas capacidades. A interface e o Chatbot apenas mostram e
executam o que o papel vigente permite. Um papel global de catálogo continua
necessário para publicar em Coleções; ser proprietário de um workspace não
concede esse poder.

## Usar em Trilhas

Peça ao Chatbot ou Plugin para criar o projeto e registrar sua estrutura. Assim
que o backend confirmar a primeira composição, o plano aparece em **Trilhas**;
não é necessário criar antes um contêiner vazio no aplicativo. Cards
materializados passam a ser estudáveis no mesmo item, sem uma segunda cópia.

No detalhe do workspace, aberto pela ação contextual do item em **Trilhas**, é
possível:

- abrir um workspace e consultar pessoas, papel e composição dos cursos;
- ajustar nome, finalidade e tipo;
- criar um convite para um e-mail e copiar o código;
- cancelar um convite pendente;
- aceitar um convite recebido;
- alterar o papel ou remover um membro, quando permitido;
- transferir a propriedade principal;
- sair de um workspace que não esteja sob sua propriedade principal;
- consultar, filtrar e responder observações pedagógicas, conforme o papel;
- abrir **Pontos de melhoria**, uma síntese corrente dos cards com observações.

Convites expiram em sete dias. O código aparece somente na criação e deve ser
enviado à pessoa convidada por um canal escolhido por quem administra. O banco
guarda o hash, não o código. A conta que aceita precisa usar o mesmo e-mail do
convite.

Cada plano mostra a composição corrente de cursos, módulos, lições e
microssequências. O que já é estudável abre como curso em `Trilhas`; conteúdo
oficial aparece em `Coleções`. Não existe um segundo plano, snapshot ou JSON
criado apenas para alimentar a tela.

Os grupos pessoais de `Trilhas` organizam planos e cursos sem pertencer ao
workspace. Podem ser criados, renomeados, ordenados e excluídos pela própria
conta; excluir um grupo não apaga o projeto nem o curso. Coleções usam a mesma
apresentação visual, mas são organização editorial do catálogo.

## Chatbot e Plugin

A ferramenta `gerirWorkspaceEducacional` usa `operation`:

- `read` consulta contexto, membros, capacidades e composição corrente dos cursos;
- `create` e `update` administram o espaço;
- `invite`, `accept_invite` e `cancel_invite` tratam convites;
- `set_role`, `remove_member`, `transfer_owner` e `leave` tratam participação;
- `list_comments` consulta a triagem paginada e devolve a síntese corrente do workspace;
- `respond_comment` responde sem alterar o curso;
- `set_comment_status` considera, resolve ou reabre;
- `link_comment_correction` vincula somente um reparo já concluído.

Estudantes leem apenas as próprias observações. Proprietário, administrador,
professor/autor e revisor podem triar as observações do workspace. O assistente
não transforma uma observação em correção por conta própria: ele lê o alvo,
executa uma operação de autoria separada quando solicitada e só então liga o
reparo confirmado ao registro.

A síntese de `list_comments` contém contagens por categoria e estado e até vinte
cards com maior concentração de registros abertos. Ela sempre descreve a fila
corrente inteira visível ao papel, independentemente dos filtros da página. É
um apoio para escolher onde ler primeiro, não uma medida de estudante, turma,
aprendizagem ou qualidade docente. Um ponto disponível abre o card corrente;
um alvo retirado não produz redirecionamento aproximado.

As ferramentas de autoria já existentes consultam o papel no banco para cada
workspace. Ler um workspace não autoriza editá-lo. Publicar no catálogo exige,
ao mesmo tempo, capacidade local de publicação e capacidade editorial da conta.

## Persistência e custo

O workspace de autoria continua sendo a única fonte mutável do curso. Cada
parte do curso mantém uma linha corrente. Esta etapa acrescenta apenas:

- uma linha por membro;
- uma linha temporária por convite pendente;
- um recibo pequeno por comando, eliminado após sete dias;
- uma resposta e um estado correntes por observação, sem histórico ou cópia do card.

O workspace é projetado em Trilhas para quem possui acesso local; não é preciso
publicá-lo nem copiar o JSON do curso. Ao remover um membro, o acesso concedido somente
por aquele workspace é revogado. Recibos não guardam curso, card, conversa ou
conteúdo anterior.

As listas de cursos e as observações exibidas em Trilhas e devolvidas
ao Chatbot são calculadas sob demanda a partir dessas mesmas linhas. Portanto,
não aumentam o armazenamento do banco. O cache local conserva apenas os
metadados estreitos do último detalhe consultado, nunca a triagem compartilhada,
os cards nem uma nova cópia do planejamento.

Uma medição com `pg_column_size` encontrou 96 bytes por membro, 200 por
convite e 360 por recibo representativo, antes dos índices. Com margens
conservadoras para índices, 1.000 workspaces com 30 membros, 500 convites
pendentes e 10.000 recibos na janela de sete dias ocupam cerca de 14,89 MiB.
Isso corresponde a menos de 3% dos 500 MB atuais do banco no plano gratuito;
o cálculo não promete capacidade geral do projeto, pois cursos, autenticação e
overhead do PostgreSQL também consomem o limite. A evidência está no
[orçamento de armazenamento](evidence/educational-workspace-storage-budget-2026-08-01.json),
e o limite deve ser revisto na
[documentação do Supabase](https://supabase.com/docs/guides/platform/database-size).

A projeção completa mais recente de Trilhas fica em uma única entrada do
IndexedDB como estado disponível sem rede. Ela é sempre somente leitura e não
conserva capacidades de autoria. Convites, papéis, publicação e operações de IA
exigem conexão; o servidor revalida a capacidade no momento da escrita.

## Hipótese de design

Participação em práticas compartilhadas pode apoiar aprendizagem e agência,
mas isso não prova que uma hierarquia de papéis melhora a aprendizagem. No
AraLearn, os papéis são primeiro um mecanismo de responsabilidade, acesso e
coordenação. A utilidade pedagógica da colaboração será avaliada com pessoas
reais e sem transformar presença, clique ou tempo em evidência de aprendizagem.
