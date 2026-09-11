# Estrutura curricular por referência humana

O catálogo autoral permite alterar curso e currículo com o nome do curso, títulos ou posições a partir de 1. Informar o módulo e a lição permite distinguir títulos repetidos. Um ramo
curricular é o objeto escolhido e seus descendentes: mover um módulo, por
exemplo, move também suas lições, microssequências e unidades. A resolução exige um único alvo pertencente ao proprietário e usa a versão lida. As mesmas definições e funções atendem aos canais [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md).

| Operação | Resultado persistido |
| --- | --- |
| `alterar_curso` | Altera título e/ou objetivo, preservando os metadados não indicados e o restante do curso. |
| `excluir_curso` | Prepara referência do curso próprio; a confirmação conserva essa identidade e a tentativa durante a limpeza de arquivos pelo ciclo de vida existente. A confirmação pelo MCP tem uma [limitação observada de retorno](autoria-mcp.md#confirmação-de-exclusão-por-mcp); confira o estado antes de outra ação. |
| `salvar_ramo_curricular` | Inclui ou edita módulo, lição ou microssequência por recorte tipado do mapa. Preserva descendentes, base salva e campos não indicados. Dependências, cobertura e fontes previstas são referências humanas resolvidas. |
| `mover_ramo_curricular` | Move ou reordena um ramo completo, conservando identidades e registros. A nova ordem não pode criar dependência ausente ou futura. |
| `duplicar_ramo_curricular` | Cria novas identidades estáveis para o ramo e todos os descendentes no mesmo curso, incluindo tópicos, unidades, fontes e configuração útil. |
| `remover_ramo_curricular` | Remove explicitamente o ramo e descendentes. Dependências ou referências sobreviventes impedem a remoção até ajuste expresso. |
| `reordenar_unidades` | Persiste a ordem completa das unidades da microssequência selecionada; omissão ou repetição é erro. Preserva IDs, texto, fontes, revisão e configuração aplicada. |

Alterações pequenas usam a rotina de gravação de recortes curriculares e a composição de metadados. Movimentação, duplicação e remoção de ramos preenchidos usam uma função do banco com argumentos de formato definido, `mutate_course_structure_for_actor_v1`; a ordenação de unidades usa `reorder_course_study_units_for_actor_v1`. A proteção da gravação do mapa contra remoção por omissão permanece em vigor. A duplicação ocorre sobre as relações persistidas, sem transportar novamente o conteúdo completo nem limitar o ramo ao lote de inclusão e atualização da composição.

As operações de ramo e ordenação verificam papel de serviço, proprietário, versão corrente e identidade da tentativa sob os bloqueios existentes de conta, curso e recibo, que impedem gravações concorrentes incompatíveis. O hash, uma impressão digital que identifica os argumentos do pedido, inclui
curso, versões e comando. Um recibo da mesma tentativa é recuperado antes de exigir que o alvo ainda exista ou que a versão continue atual; intenção diferente com a mesma identidade é rejeitada. A operação de ramo altera uma vez as versões de curso e planejamento e deixa o mapa em rascunho. Reordenar unidades altera a revisão do curso e as versões das unidades deslocadas; o mapa curricular permanece igual.

A cópia remapeia somente campos de identidade: parentes, dependências, `branchOf`, cobertura de tópicos e tópicos das unidades. Prosa e componentes continuam literais. Configuração aplicada e referência da explicação usada permanecem como proveniência da origem; copiar não afirma que o conteúdo foi gerado novamente a partir da base copiada. Declarações humanas de revisão, observações, progresso, acessos e associação ao lote de produção permanecem na origem. A cópia não inventa inspeção nem consome observações. Fontes, âncoras, funções e ocorrências já vinculadas são preservadas, inclusive entradas retiradas do catálogo que continuam úteis ao conteúdo salvo. Arquivos compartilhados não são duplicados nem removidos pela operação de ramo.

Os comandos estruturais com recibo conservam alvo, comando, versões e requestId na retomada. Resposta ambígua provoca releitura pelo ID original e repetição do pedido original sob recibo, sem repetição automática de transporte nas funções remotas dessas operações. Se a confirmação continuar indisponível, a resposta mantém a referência de retomada e a condição incerta. A referência aceita somente campos tipados da operação e não concede acesso. Antes da escrita, seu tamanho é verificado junto do recorte; exceder o transporte exige separar decisões independentes, sem truncar o conteúdo. Renomear ou reutilizar um título não redireciona uma tentativa existente.

Os testes focais exercitam a localização por nomes, os casos de uso e os
canais com um serviço simulado. Em PGlite, ambiente local de banco de dados,
executam a migração inteira, incluindo os vínculos entre tabelas, a
reordenação dentro da transação, os recibos e as relações de fontes. As
funções de acesso e consulta de estado da fonte são substituídas por auxiliares
delimitados nesse conjunto de dados de teste. Os casos verificam a comparação de versões antes da gravação (CAS), propriedade,
permissões, recuperação do mesmo recibo, reversão integral de uma transação
com falha, fontes retiradas, origem aplicada, dependências, tópicos e uma
cópia de 262 entidades com conteúdo acima de 512 KiB. Esse conjunto de testes não cobre toda a instalação do banco, a API, o
armazenamento de arquivos nem as conversas nos canais hospedados. As
[validações de integração](guia-desenvolvedor.md) examinam essas etapas.
