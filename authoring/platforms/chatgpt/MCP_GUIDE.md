# Guia das ferramentas MCP do AraLearn

O Plugin usa o endpoint MCP remoto para autoria estrutural. O Chatbot
personalizado usa uma Action OpenAPI gerada do mesmo registro de ferramentas.
As duas superfícies executam o mesmo fluxo; a conta conectada determina quais
capacidades ficam disponíveis. O registro público possui 30 ferramentas; as
famílias de catálogo e transformação usam `operation` explícita, enquanto a
consulta de resources usa a presença de `resource` para alternar lista e
detalhe. Isso mantém a lista curta sem aceitar payloads genéricos.

## Preparação contextual

- `prepararAutoriaAraLearn`: antes de criar, ampliar, revisar
  pedagogicamente, reorganizar ou publicar, recupera um brief curto a partir
  da intenção, do alvo, dos resources previstos e do contexto útil da conversa.
  Use `audit` para auditoria pedagógica somente leitura e `repair` para um
  reparo já autorizado; não confunda nenhuma das duas com revisão editorial do
  catálogo.

O servidor também anuncia instruções de uso na inicialização e publica
conhecimentos de fluxo, pedagogia, resources e segurança como resources MCP.
Esses mecanismos complementam os schemas das ferramentas; não substituem
validação, autorização nem leitura do estado atual.

## Estado atual

O workspace é composto no PostgreSQL. Há uma entidade corrente para cada
projeto, curso, módulo, lição, tópico, microssequência e card. Relações de pai e
posição formam a árvore, e o servidor recompõe o documento v4 quando uma
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
`link_comment_correction`.
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

Para usar uma observação como insumo de reparo, apresente os achados
selecionados e obtenha a intenção de correção. Depois leia o alvo, execute a
menor mutação autoral e confirme o resultado. Somente após esse sucesso use
`link_comment_correction`, com o `requestId` do reparo e seu `entityPath`.
Nunca vincule planejamento ou tentativa rejeitada. Auditoria, resposta, reparo
e vínculo são etapas distintas.

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
- `consultarRecursosDeCard`: sem `resource`, lista o catálogo de resources;
  com `resource`, inclui critérios pedagógicos, regras semânticas e o
  `authoringSchema` estrutural daquele recurso.

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
3. crie o workspace com `criarWorkspaceDeAutoria` e registre o contexto curto
   com `atualizarContextoDoWorkspace`;
4. use `criarEstruturaNoWorkspace` para cursos, módulos, lições e
   microssequências planejadas em lotes de até 40 entidades estruturais;
5. apresente o planejamento, sugira aprovação ou ajuste e espere;
6. após aprovação, consulte os resources e materialize uma microssequência por
   chamada até concluir somente a parte pedida;
7. apresente `revisarMicroteoriasDoWorkspace`, contagens e resources, sugira
   auditoria independente e espere;
8. audite em rodada somente leitura; repare apenas numa rodada posterior e
   reaudite somente depois de nova decisão;
9. publique uma prévia privada somente quando a pessoa pedir.

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
  `delete_entity` e `delete_workspace`.

Em `reorganizarWorkspace`, `copy_entity` cria uma cópia profunda com novos ids
e mantém a origem; `move_entity` preserva a identidade, troca pai ou posição e
remove a localização anterior na mesma revisão. As demais operações renomeiam,
recompõem microssequências ou mudam o nível estrutural conforme o discriminador
enviado.

Para atravessar cursos, origem e destino ficam no mesmo workspace e são
informados por `entityPath` completos. A cópia remapeia descendentes e
referências internas; não existe conteúdo mutável compartilhado entre origem e
destino.

## Prévia privada e revisão editorial

Uma prévia testável pode ser publicada com `publicarCursoDoWorkspace` e:

```json
{
  "target": "private",
  "completion": "partial"
}
```

O AraLearn cria a publicação na primeira chamada e atualiza a mesma identidade
nas chamadas seguintes para aquele curso e destino. Esse vínculo aparece em
`publications` ao reler o workspace, inclusive em outra conversa. O assistente
não precisa guardar nem pedir ao usuário um modo de publicação.

O par opcional `existingCourseId` + `expectedContentHash` serve somente para
anexar uma publicação preexistente quando o workspace ainda não conhece esse
vínculo; os dois campos são sempre enviados juntos. A publicação no catálogo
usa `target: "catalog"`, `completion: "complete"` e `collectionId`, além de
exigir capacidade editorial.

Uma publicação privada pode ser submetida para inspeção, inclusive enquanto
`partial`, por `submeterCursoParaRevisaoEditorial`. O envio aponta para seu hash
exato, sem criar outro artefato nem expor outros cursos do autor.
`listarRevisoesEditoriais` mostra os próprios envios ou a fila, conforme a
conta, e `lerRevisaoEditorial` abre somente o artefato submetido.

Uma conta revisora assume o envio e usa
`criarWorkspaceDeRevisaoEditorial` para obter uma cópia editorial
independente. Ela pode pedir ajustes ou rejeitar com
`decidirRevisaoEditorial`. A publicação no catálogo requer uma conta com essa
capacidade, curso `complete` e coleção válida. O autor pode retirar um envio
ainda pendente com `retirarCursoDaRevisaoEditorial`.

Quando a conta possui `catalog:manage`, o mesmo assistente também pode criar e
atualizar coleções ou mover e reordenar cursos com `editarCatalogo`
(`create_collection`, `update_collection`, `move_course`). As retiradas ficam
em `retirarDoCatalogo` (`retire_collection`, que transfere antes os cursos, ou
`remove_course`). Essas operações usam a revisão da coleção ou da
classificação e, na retirada do curso, o hash atual.

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
