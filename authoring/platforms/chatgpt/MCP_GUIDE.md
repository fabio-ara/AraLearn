# Guia das ferramentas MCP do AraLearn

O Plugin usa o endpoint MCP remoto para autoria estrutural. O Chatbot
personalizado usa uma Action OpenAPI gerada do mesmo registro de ferramentas.
As duas superfícies executam o mesmo fluxo; a conta conectada determina quais
capacidades ficam disponíveis. O registro público possui 30 ferramentas; as
famílias de catálogo, transformação e continuidade usam `operation` explícita, enquanto a
consulta de resources usa a presença de `resource` para alternar lista e
detalhe. Isso mantém a lista curta sem aceitar payloads genéricos.

## Preparação contextual

- `prepararAutoriaAraLearn`: antes de criar, ampliar, revisar
  pedagogicamente, reorganizar ou publicar, recupera um brief curto a partir
  da intenção, do alvo, dos resources previstos e do contexto útil da conversa.
  Use `audit` para auditoria pedagógica sem alterar conteúdo ou estrutura —
  mandato e achados compactos ainda são registrados — e `repair` para um
  reparo já autorizado; não confunda nenhuma das duas com revisão editorial do
  catálogo.

Essa preparação seleciona orientação para o pedido atual; não recupera o estado
autoral. O chat é descartável. No começo de qualquer nova etapa de um workspace
existente, use `lerWorkspaceDeAutoria` com `view: "resume"` antes de decidir ou
escrever. A retomada devolve contagens compactas da árvore, os ids e a máscara
de estado das Partes, decisões, mandato, achados ativos e sínteses persistidas.
Leia `outline` ou `entity` para obter a árvore ou o conteúdo necessário.

O servidor também anuncia instruções de uso na inicialização e publica
conhecimentos de fluxo, pedagogia, resources e segurança como resources MCP.
Esses mecanismos complementam os schemas das ferramentas; não substituem
validação, autorização nem leitura do estado atual.

## Estado atual

O workspace é composto no PostgreSQL. Há uma entidade corrente para cada
projeto, curso, módulo, lição, tópico, microssequência e card. Relações de pai e
posição formam a árvore, e o servidor recompõe `aralearn.library.v1` quando uma
leitura, validação ou publicação precisa dele.

Cada alteração envia apenas as partes atingidas. O Storage recebe o artefato
canônico imutável quando um curso é publicado; não recebe uma cópia integral a
cada comando. `listarAlteracoesRecentesDoWorkspace` devolve até 200 resumos
pequenos para orientação e auditoria operacional, não versões anteriores do
curso.

## Participação e papéis locais

`gerirWorkspaceEducacional` lê ou administra o espaço educacional. Suas
variantes fechadas são `read`, `create`, `update`, `invite`, `accept_invite`,
`cancel_invite`, `set_role`, `remove_member`, `transfer_owner`, `leave`,
`list_comments`, `respond_comment`, `set_comment_status` e
`link_comment_correction`, além de `list_observations`, `create_observation` e
`delete_observation` para notas situadas na árvore.
Convite e mudança de papel não copiam a árvore; o banco reavalia autorização
em cada comando.

Proprietário e administrador gerem pessoas; professor/autor cria e publica no
âmbito local; revisor revisa; estudante estuda e comenta; leitor apenas lê.
Publicar em Coleções ainda exige capacidade editorial da conta. Não confunda
propriedade local com administração global.

`list_comments` pagina e filtra a triagem por categoria e estado. Estudantes
recebem somente as próprias observações; papéis com capacidade `review`
recebem as observações do workspace. Resposta e estado são correntes e não
modificam o curso.

O campo `summary` cobre todo o conjunto visível, não só a página filtrada. Suas
contagens e `focusCards` servem para priorizar a leitura de até vinte cards; não
classifique autores, estudantes, turma, aprendizagem ou qualidade docente.

Para usar uma observação como insumo de reparo, apresente os achados
selecionados e obtenha a intenção de correção. Depois leia o alvo, execute a
menor mutação autoral e confirme o resultado. Somente após esse sucesso use
`link_comment_correction`, com o `requestId` do reparo e seu `entityPath`.
Nunca vincule planejamento ou tentativa rejeitada. Auditoria, resposta, reparo
e vínculo são etapas distintas.

Na auditoria, consulte tanto `list_comments`, que reúne observações feitas no
estudo, quanto `list_observations` com `kinds: ["note"]`, que reúne notas
situadas no workspace. Achados ativos já aparecem em `resume`; para consultar
histórico, use `kinds: ["audit_finding"]`, estados e paginação. Grave
como achados somente localização, categoria, gravidade, síntese e reparo
proposto. A decisão humana e o mandato de reparo também precisam ser
persistidos; o histórico da conversa não os substitui.

## Leitura

- `listarCursosDaBibliotecaPessoal`: cursos privados e selecionados;
- `consultarCatalogo`: descoberta do catálogo publicado quando a conta possui
  `catalog:read`, sem conceder publicação; use `list_collections`,
  `list_collection_courses` ou `search_courses`;
- `lerConteudoDoCurso`: árvore, entidade ou documento publicado;
- `listarWorkspacesDeAutoria`: projetos em andamento;
- `lerWorkspaceDeAutoria`: árvore, entidade ou documento composto atual;
- `revisarMicroteoriasDoWorkspace`: projeção conceitual de uma lição ou
  microssequência com cobertura, checks, erros, resources, tópicos e contagem
  de práticas para o chat;
- `listarAlteracoesRecentesDoWorkspace`: resumos das últimas alterações;
- `gerirWorkspaceEducacional`: também lista, registra e exclui notas de
  curadoria ligadas a partes do plano ou curso, sem copiar conteúdo;
- `consultarPackagesDeCard`: sem `packageId`, lista somente manifests compactos;
  depois da escolha pela operação cognitiva, `packageId` e `version` devolvem
  somente o contrato autoral e o schema daquela versão.

Em workspace já existente, a primeira leitura da etapa usa `view: "resume"`.
Depois, `outline` e `entity` reduzem o contexto ao recorte necessário.

Comece por listas e `outline`. Use `entity` para o recorte que será alterado.
Use `document` apenas quando a tarefa realmente precisar do projeto inteiro.
Copie o `entityPath` devolvido pela leitura; ele é a sequência de ids desde o
curso até a entidade. Não reduza a referência ao último id.

## Concorrência e repetição segura

Toda escrita recebe um `requestId`. Mutações de conteúdo também recebem a
`expectedRevision` devolvida pela última leitura.

Gere o `requestId` antes da chamada e repita-o somente com argumentos
idênticos. Se outra edição avançar a revisão, releia o recorte atual e prepare
um novo comando; não tente reconstruir estado a partir dos resumos de eventos.

## Criação incremental

O fluxo recomendado evita pedir ao modelo uma árvore grande e populada:

1. chame `prepararAutoriaAraLearn`;
2. procure cursos ou partes reutilizáveis e leia apenas o recorte necessário;
3. crie o workspace com `criarWorkspaceDeAutoria`; se ele já existir, retome-o
   com `lerWorkspaceDeAutoria` e `view: "resume"`;
4. use `criarEstruturaNoWorkspace` para cursos, módulos, lições e
   microssequências planejadas em lotes de até 40 entidades estruturais;
5. apresente o planejamento, sugira aprovação ou ajuste e espere;
6. após aprovação, use uma única `record_approved_plan` para substituir
   atomicamente todas as Partes, decisões e o mandato autorizado;
7. faça o blueprint didático, consulte os manifests, escolha packages pela
   operação cognitiva, peça somente seus contratos versionados e materialize
   uma microssequência por chamada até concluir somente a Parte autorizada;
8. apresente `revisarMicroteoriasDoWorkspace`, contagens e resources, sugira
   auditoria independente e espere;
9. audite em rodada somente leitura após `list_comments` e
   `list_observations` com `kinds: ["note"]`; registre achados compactos;
10. persista a decisão e o mandato, repare somente achados aprovados, vincule a
   correção apenas depois da escrita confirmada e reaudite;
11. se a pessoa decidir submeter, fixe a revisão privada; se a conta puder e a
   pessoa pedir, distribua a revisão em Coleções.

O `brief` guarda somente contexto estável e fontes. Para substituí-lo, releia o
valor inteiro e use `gerirContinuidadeDaAutoria` com
`replace_stable_brief`, preservando tudo que ainda for válido. Partes, decisões,
mandatos e achados nunca pertencem ao `brief`.

Na mesma ferramenta, `record_approved_plan` evita que uma queda deixe apenas
parte do plano aprovado. `define_part` e `remove_part` mantêm ajustes locais;
`record_decision` e `remove_decision` mantêm decisões; `set_mandate` e
`clear_mandate` delimitam a autorização corrente. A auditoria usa
`record_finding`; a pessoa decide com `decide_finding`; somente uma escrita
confirmada usa `link_finding_correction`; a reauditoria conclui com
`verify_finding`. `delete_finding` serve à exclusão explícita, não a esconder um
problema rejeitado ou ainda aberto.

Enquanto o achado continua aprovado, cada commit coberto atualiza
`pendingCorrectionRequestId` e `pendingRevision`. `resume` recupera esse par
mesmo depois do prazo dos recibos; releia o alvo e só então continue ou faça o
vínculo final.

Cada autorização humana recebe um `mandate.id` novo. `build_part` é consumido
quando todas as microssequências da Parte têm cards `ready`; `audit` e
`restructure` são limpos explicitamente ao fim da rodada; cada
`link_finding_correction` retira seu achado de `repair_findings`, e o último
vínculo encerra esse mandato. A reauditoria usa outro mandato `audit`; inclua
`targetPartId` quando a autorização estiver limitada a uma Parte. A máscara usa
`r` para unidade pronta com cards, `m` para materializada ainda não pronta,
`p` para planejada sem cards e `x` para id ausente. Se achados vierem
truncados, percorra `list_observations` com `kinds: ["audit_finding"]`.

Enquanto houver mandato, o commit respeita seu escopo: `build_part` escreve
somente na Parte; `repair_findings`, somente nos alvos aprovados; `audit` não
altera conteúdo; `restructure` aceita apenas estrutura. Qualquer lote misto ou
prova de alvo truncada é rejeitado por inteiro.

Os vínculos não são intercambiáveis: `link_comment_correction` aponta um reparo
confirmado para o comentário feito no estudo; `link_finding_correction` aponta
um reparo confirmado para um achado formal de auditoria.

`salvarCardsNaMicrossequencia` recebe os cards v4 completos da unidade. Para
uma correção pontual, use `atualizarMetadadosDaEntidade` em curso, módulo,
lição ou microssequência, ou `salvarCardNoWorkspace` para um único card
completo, preservando seu id e sua posição. Esses comandos fechados reduzem a
quantidade de contexto e impedem alterações acidentais fora do alvo.

## Reaproveitamento e reorganização

- `importarCursoNoWorkspace` acrescenta um curso acessível ao workspace;
- `reorganizarWorkspace` reúne transformações estruturais:
  `copy_entity`, `rename_entity`, `move_entity`, `merge_microsequences`,
  `split_microsequence`, `promote_module` e `demote_course`;
- `excluirDoWorkspace` separa as ações destrutivas:
  `delete_entity` e `delete_workspace`; ambas usam a `expectedRevision` da
  leitura corrente.

Em `reorganizarWorkspace`, `copy_entity` cria uma cópia profunda com novos ids
e mantém a origem; `move_entity` preserva a identidade, troca pai ou posição e
remove a localização anterior na mesma revisão. As demais operações renomeiam,
recompõem microssequências ou mudam o nível estrutural conforme o discriminador
enviado.

Para atravessar cursos, origem e destino ficam no mesmo workspace e são
informados por `entityPath` completos. A cópia remapeia descendentes e
referências internas; não existe conteúdo mutável compartilhado entre origem e
destino.

## Trilhas, Coleções e revisão editorial

Criar a estrutura já faz o plano aparecer em Trilhas. Partes com cards ficam
executáveis e partes sem cards continuam visíveis como planejamento, sem
chamar `publicarCursoDoWorkspace`.

“Publicado” significa apenas que um artefato foi fixado para submissão ou
distribuído. Não é requisito para visualizar, estudar ou testar a composição
corrente em Trilhas.

Para preparar uma submissão editorial, use `publicarCursoDoWorkspace` com
`target: "private"` e depois envie o `courseId` e o hash confirmados. Não envie
`completion`. O mesmo vínculo é atualizado nas chamadas seguintes, portanto o
assistente não escolhe entre criar e atualizar.

Para levar o curso a Coleções, use `target: "catalog"` e `collectionId`.
Isso exige capacidade editorial. O backend valida o contrato corrente sem
obrigar a pessoa a administrar estados de conclusão.

O artefato privado corrente pode ser enviado por
`submeterCursoParaRevisaoEditorial`. O envio aponta para seu hash exato, sem
duplicar o workspace. `listarRevisoesEditoriais` mostra os próprios envios ou
a fila administrativa, e `lerRevisaoEditorial` abre somente o artefato
submetido.

Uma conta revisora pode assumir o envio e usar
`criarWorkspaceDeRevisaoEditorial` para corrigir uma cópia editorial. Ela pode
pedir ajustes, rejeitar ou levar o resultado a Coleções. O autor pode retirar
um envio ainda pendente.

Com `catalog:manage`, o mesmo assistente cria e atualiza coleções ou transfere
cursos entre elas com `editarCatalogo`. A apresentação é alfabética, sem um
comando de reordenação. Retiradas usam `retirarDoCatalogo`. Essas operações
conferem revisão, classificação e hash atuais.

## Respostas

Cada ferramenta anuncia um `outputSchema` fechado para seu `data`: listas
incluem itens e cursor tipados; leituras incluem seus metadados de controle;
gravações incluem a revisão confirmada; publicação e exclusão têm recibos
próprios. Nunca suponha campos que não estejam na resposta anunciada.

Abertura estrutural existe somente dentro de `content`, quando foi solicitada
uma entidade ou o documento canônico integral, e dentro de `definition`, que
contém o contrato canônico variável de um `resource`. A árvore `outline`, a
projeção `microtheories` e todos os campos de controle são fechados. Falhas
usam o mesmo ramo `{ ok: false, requestId, error }` em todas as ferramentas.

Depois de alterar, informe o resultado humano e a nova revisão. Na revisão
conceitual, apresente microteorias e quantidades de práticas; não transcreva as
práticas por padrão. Se forem pedidas, use a listagem para localizar os cards e
leia como entidade os alvos necessários antes de apresentá-los em texto. Uma
escrita validada estruturalmente não equivale a aprovação pedagógica. Em
conflito, releia e nunca invente uma revisão.

O guia leigo do percurso completo está em
[Criar cursos pelo chat](../../../docs/criar-cursos-pelo-chat.md). Detalhes de
transporte, autenticação, permissões e contratos ficam em
[Gateway MCP de autoria](../../../docs/autoria-mcp.md).
