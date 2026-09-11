# Estrutura curricular por referência humana

Para mover uma lição, a pessoa pode indicar seu título e o módulo em que ela
está. O serviço localiza esse item no curso autorizado antes de alterar a
estrutura. Títulos repetidos exigem uma indicação mais precisa; posições são
contadas a partir de 1. Essa forma de localização atende aos canais
[MCP](autoria-mcp.md) e [Actions](autoria-actions.md).

Um **ramo curricular** é o item escolhido e tudo que está organizado abaixo
dele. Mover um módulo, por exemplo, move também suas lições, microssequências e
unidades. O [modelo didático](modelo-didatico.md) explica esses níveis.

## Operações e efeitos

| Operação | Resultado salvo |
| --- | --- |
| `alterar_curso` | Altera título ou objetivo e conserva os demais dados. |
| `excluir_curso` | Prepara a confirmação do curso próprio; a execução confirmada conserva esse alvo durante a exclusão e a limpeza dos arquivos que deixarem de ser usados. |
| `salvar_ramo_curricular` | Inclui ou edita módulo, lição ou microssequência. Preserva descendentes, explicação salva e campos não indicados. Dependências, cobertura e fontes previstas são localizadas pelas referências informadas. |
| `mover_ramo_curricular` | Move ou reordena um ramo completo, conservando identidades e registros. A nova ordem precisa preservar as dependências: o conteúdo pressuposto continua anterior ao que o utiliza. |
| `duplicar_ramo_curricular` | Cria uma cópia do ramo no mesmo curso, com novas identidades para seus itens e descendentes. Conserva conteúdo, fontes e configuração úteis. |
| `remover_ramo_curricular` | Remove o ramo e seus descendentes. Se outros itens ainda dependerem deles, essas relações precisam ser ajustadas expressamente antes da remoção. |
| `reordenar_unidades` | Salva a ordem completa das unidades da microssequência. Uma lista com omissões ou repetições é recusada; texto, fontes, revisão e configuração aplicada permanecem. |

Um ramo preenchido não desaparece simplesmente por ter sido omitido de um
mapa enviado. A remoção e a movimentação têm operações próprias, para que a
intenção fique explícita. A [gravação por recortes](autoria-contextual.md#mapa-curricular-salvo-por-recortes)
permite alterar o planejamento sem reenviar todo o conteúdo.

## Alterar relações em conjunto

Uma movimentação precisa manter coerentes a ordem, as relações entre os itens
e seus registros. O banco executa essas mudanças numa **transação**: todas são
confirmadas juntas ou o conjunto é desfeito em caso de falha. Isso evita, por
exemplo, mover uma lição e deixar suas microssequências ligadas ao lugar antigo.

Alterações pequenas usam a gravação de recortes e a atualização dos metadados.
Movimentação, duplicação e remoção de ramos preenchidos usam
`mutate_course_structure_for_actor_v1`; a ordem das unidades usa
`reorder_course_study_units_for_actor_v1`. A duplicação trabalha diretamente
sobre as relações salvas no banco. Por isso, não precisa transportar novamente
todo o conteúdo nem fica limitada ao lote usado para incluir ou atualizar itens.

O serviço confere autorização, propriedade e versão antes de gravar. Os
bloqueios de conta, curso e recibo coordenam operações concorrentes. As funções
do banco exigem o papel de serviço autorizado; a identidade da pessoa é
verificada no mesmo percurso. Uma alteração estrutural avança uma vez as
versões do curso e do planejamento e devolve o mapa a rascunho. Reordenar
unidades avança a revisão do curso e as versões das unidades deslocadas,
preservando o mapa curricular.

## O que uma cópia conserva

A cópia recebe identidades próprias, mas o texto e os componentes permanecem
literais. O serviço atualiza as referências entre os itens copiados: parentes,
dependências, `branchOf`, cobertura de tópicos e tópicos das unidades.

A configuração aplicada e a referência da explicação utilizada conservam a
origem da produção. Elas permitem saber como o material original foi produzido;
copiar esse material não constitui uma nova geração. Declarações humanas de
revisão, observações, progresso, acessos e associação ao lote de produção
permanecem na origem.

As relações com fontes conservam âncoras, papéis e ocorrências — respectivamente,
os trechos localizados na obra, a função da fonte e os pontos em que é utilizada
no curso, descritos em [fontes e citações](fontes-e-citacoes.md). Fontes retiradas
do catálogo continuam preservadas quando ainda sustentam conteúdo salvo. Os
arquivos compartilhados não são duplicados nem removidos pela operação do ramo.

## Recuperar uma tentativa sem repetir seus efeitos

A resposta pode se perder depois de a mudança ter sido salva. Cada tentativa
possui uma identidade, `requestId`, e um recibo que permite consultar seu
resultado. Um **hash**, uma impressão digital calculada a partir dos argumentos,
relaciona essa identidade ao curso, às versões e ao comando. Reutilizar a
identidade com outro pedido é recusado.

Na retomada, o recibo é consultado antes de exigir que o alvo ainda exista ou
que a versão continue atual: uma remoção concluída já terá apagado o alvo.
O cliente conserva alvo, comando, versões e identidade originais e relê o
resultado. Quando cabe repetir o pedido, reutiliza essa mesma tentativa; as
funções remotas não repetem automaticamente o envio. Se a confirmação continuar
indisponível, a resposta mantém a referência de retomada e informa a incerteza.

A referência aceita apenas os campos previstos para a operação e não concede
acesso por si. Seu tamanho é conferido junto ao pedido antes da escrita. Se o
pedido exceder o limite do canal, decisões independentes podem ser separadas,
preservando o conteúdo. Renomear um curso ou reutilizar seu título não redireciona
uma tentativa anterior. A [recuperação nos canais](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção)
e a [confirmação de exclusão por MCP](autoria-mcp.md#confirmação-de-exclusão-por-mcp)
tratam dessas situações.

## Verificação

Os testes de localização e de canais usam um serviço simulado para examinar
nomes, posições e pedidos. Os testes com PGlite, um ambiente local de banco de
dados, executam a migração completa dessas operações, incluindo relações entre
tabelas, ordenação, recibos e fontes. Funções de acesso e consulta de estado da
fonte são substituídas por auxiliares limitados a esse conjunto de teste.

Os casos verificam propriedade e permissões, comparação de versões antes da
gravação, recuperação do mesmo recibo, reversão de uma transação com falha,
fontes retiradas, origem aplicada, dependências e tópicos. Há também um caso de
cópia com 262 entidades e conteúdo acima de 512 KiB, para exercitar um ramo que
excede o tamanho de um pedido comum. A instalação integral do banco, a API, o
armazenamento de arquivos e as conversas hospedadas são examinados pelas
[validações de integração](guia-desenvolvedor.md).
