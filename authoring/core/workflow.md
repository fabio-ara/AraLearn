# Fluxo de autoria por workspace

O workspace v4 é um projeto AraLearn mutável por comandos e versionado por
revisões imutáveis. Ele substitui execuções com plano fixo, partes, cursor,
bloqueio e auditoria como estados obrigatórios.

## Modelo operacional

O PostgreSQL guarda identidade, proprietário, revisão atual e ponteiro para o
artefato. O Storage guarda cada documento JSON canônico pelo SHA-256. Uma
alteração:

1. lê a revisão atual;
2. aplica uma operação determinística em memória;
3. valida o documento v4 resultante;
4. grava o novo artefato imutável;
5. troca o ponteiro por compare-and-swap;
6. registra a revisão, operação e `requestId`.

Se outra alteração avançou o ponteiro, o commit falha sem sobrescrever dados.
O cliente relê e decide se a intenção ainda se aplica. Restaurar não apaga
histórico: cria uma revisão nova com o conteúdo de uma revisão anterior.

## Começar e reaproveitar

Um workspace pode começar vazio ou com um curso acessível. Outros cursos podem
ser importados para o mesmo projeto, permitindo:

- complementar curso existente;
- mover módulos, lições, microssequências ou cards entre cursos;
- reunir materiais de cursos diferentes;
- transformar módulo em curso;
- transformar curso em módulo de outro curso;
- limpar conteúdo antigo sem afetar a revisão publicada.

Leia primeiro listas e árvores. Leia uma entidade com descendentes somente
quando ela for o recorte necessário. O documento completo é reservado a
operações que realmente dependem dele.

## Operações

- `insert_entity`: acrescenta entidade completa no pai compatível;
- `replace_entity`: substitui conteúdo e preserva o id;
- `rename_entity`: altera o título;
- `move_entity`: move ou reordena no mesmo nível;
- `delete_entity`: remove a entidade e seus descendentes;
- `merge_microsequences`: reúne cards e metadados e remapeia dependências;
- `split_microsequence`: transfere cards selecionados para uma nova unidade;
- `promote_module`: cria curso contendo um módulo;
- `demote_course`: achata módulos em um módulo de outro curso;
- `restore_revision`: recupera conteúdo histórico como revisão nova.

Movimentações atravessam cursos quando ambos estão no mesmo workspace. Para
trazer um curso publicado, importe-o primeiro. Cada comando trata uma intenção
estrutural; uma sequência pode ser curta e verificável sem criar pontos de
aprovação artificiais entre todas as chamadas.

## Revisão humana

A projeção de microteorias consolida em um único conteúdo textual o material
conceitual dos cards `kind: theory` de cada microssequência e informa quantas
práticas `kind: exercise` o consolidam. É a visualização padrão no chat: reduz
tokens, evita enumerar cards e mantém o autor capaz de avaliar seleção, precisão
e progressão conceitual.

O autor pode pedir a leitura de práticas, cards ou recursos específicos. Essa
leitura sob demanda não muda o padrão de apresentação.

## Publicar e testar

Uma publicação seleciona um curso do workspace e cria uma revisão canônica:

- `private + partial`: permite estudar e testar imediatamente um curso
  incompleto;
- `private + complete`: exige todas as microssequências `ready`;
- `catalog + complete`: exige curso completo e autorização editorial.

Uma publicação parcial conserva os estados das microssequências. O runtime
inclui somente o que já é executável e mantém unidades planejadas visíveis como
planejamento. Alterações posteriores continuam no workspace e podem atualizar
o mesmo curso publicado mediante `existingCourseId` e
`expectedContentHash`.

## Repetição e conflito

`requestId` identifica uma intenção e o corpo não pode mudar durante repetição.
`expectedRevision` identifica a base examinada. Eles resolvem problemas
diferentes:

- repetição idempotente recupera resultado de uma chamada incerta;
- compare-and-swap impede que uma leitura antiga sobrescreva uma nova.

Erros de contrato são corrigidos no conteúdo e recebem novo `requestId`.
Conflitos exigem releitura. Falhas temporárias repetem a mesma chamada.
