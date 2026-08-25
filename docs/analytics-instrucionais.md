# Pesquisa sobre a Autoria

A área **Pesquisa** permite examinar fatos registrados durante a criação de um
Curso. Ela apresenta o processo de planejamento, produção, revisão e comparação
sem atribuir nota ao Curso, à pessoa autora ou a quem estuda.

Gráfico, tabela, lista, exportação, MCP e Actions partem das mesmas linhas e da
mesma revisão. Cada métrica informa pergunta, definição, unidade, denominador,
tratamento dos dados ausentes e inferências indevidas.

## Como consultar

1. Abra **Autoria** e escolha um Curso próprio.
2. Entre em **Pesquisa**.
3. Selecione um conjunto de fatos ou mantenha **Todos os fatos**.
4. Filtre pelo canal da interação e pelo período, quando necessário.
5. Leia o gráfico e a tabela equivalente.
6. Abra **Como esta métrica é definida** antes de interpretar os valores.
7. Percorra os fatos que sustentam o resumo.
8. Use **Abrir o objeto relacionado** para chegar ao contexto de origem.
9. Exporte CSV ou JSON quando precisar conferir ou tratar o recorte filtrado.

A área pertence à pessoa proprietária do Curso. A revisão esperada integra a
consulta: se o Curso mudar, a leitura não mistura fatos de revisões diferentes.

## Conjuntos de fatos

| Conjunto | Conteúdo |
| --- | --- |
| `activity` | mudanças registradas no Curso |
| `materializations` | início, etapas e conclusão da produção por Partes |
| `design` | parâmetros, orientações, itens do plano e políticas de componentes |
| `sources` | Fontes, Âncoras, atribuições e PDFs |
| `annotations` | Observações e seu tratamento |
| `audits` | rodadas, achados, correções, verificações e reversões |
| `variants` | pontos comuns, vínculos e comparações entre Cursos |

Os canais são:

- `authoring_interface`, para a interface de Autoria;
- `authoring_chat`, para operações feitas pela conversa conectada;
- `study_interface`, para fatos originados no Estudo;
- `audit_process`, para o ciclo de auditoria.

Canal ausente permanece ausente. O AraLearn não o deduz pelo conteúdo do fato.

## O que um fato conserva

Um fato de Autoria possui:

- identidade, conjunto e tipo;
- instante registrado;
- revisão do Curso, quando disponível;
- canal, origem e estado, quando aplicáveis;
- objeto principal e objeto relacionado;
- até 24 valores escalares;
- indicação dos dados ausentes;
- endereço do objeto no AraLearn, quando houver destino seguro.

A projeção exclui identidade de conta, endereço de correio eletrônico, texto
bruto de Observação e cópias integrais de estados anteriores e posteriores.
Rótulos dos objetos ajudam a leitura, enquanto as identidades preservam a
rastreabilidade da exportação.

## Métricas correntes

A visão geral usa duas regras de contagem:

- `facts_by_dataset`, quando o recorte contém vários conjuntos, conta cada fato
  uma vez em seu conjunto de origem;
- `facts_by_kind`, quando há um único conjunto, conta cada fato pela combinação
  de tipo e estado.

O denominador é a quantidade total de fatos que corresponde aos filtros e à
revisão. Uma consulta sem fatos produz contagem zero. Dentro de um fato, revisão
ou valor ausente permanece marcado como ausência e não recebe um valor
inventado.

Essas métricas descrevem a distribuição dos registros. Diferenças entre canais,
tipos, estados ou variantes não demonstram relação causal.

## Gráfico, tabela e fatos

O gráfico de barras resume a métrica selecionada. A tabela logo abaixo contém
as mesmas categorias, valores, denominadores e indicações de ausência. O
próprio gráfico possui descrição textual para tecnologias assistivas.

A lista de fatos permite conferir cada parcela do resumo. Ela mostra instante,
conjunto, tipo, valores, canal, origem, estado, revisão e dados ausentes. O
endereço direto conduz à Parte, Unidade, Fonte, Observação, auditoria ou
comparação correspondente.

## Filtros e paginação

A interface oferece seleção de um conjunto ou de todos, um canal ou todos e um
intervalo de datas. O contrato também admite filtros por várias origens e
estados. Cada página aceita de 1 a 200 fatos e usa paginação por chave.

O cursor fica vinculado ao Curso, à revisão, aos filtros e ao instante de corte.
Ele não pode continuar outra consulta. A interface também recusa cursor
repetido, fato duplicado ou página de outro recorte.

## Exportação

A exportação direta percorre as páginas sob a mesma consulta e revisão, até cem
páginas e 8 MiB por arquivo. Acima desse volume, nenhum arquivo parcial é salvo:
a área Pesquisa orienta restringir o período, o conjunto ou o canal. Esse limite
impede que o AraLearn tente manter ou salvar um arquivo acima de 8 MiB no
navegador e no Android. O corpus corrente não demonstrou necessidade de criar
arquivos temporários, retenção e limpeza no Storage para exportações maiores;
um estudo com outro volume precisa validar o recorte escolhido.

O JSON usa o contrato `aralearn.course-authoring-analytics-export.v1` e
conserva:

- versão do dicionário;
- instante de exportação;
- Curso e revisão;
- filtros sem cursor;
- definições das métricas;
- fatos completos do recorte aceito pelo limite do arquivo;
- limites de interpretação.

O CSV possui uma linha por fato e colunas estáveis para dicionário, Curso,
revisão, identidade, conjunto, tipo, instante, canal, origem, estado, objetos,
valores, ausências e endereço. O campo de valores usa JSON canônico para manter
as chaves sem criar colunas instáveis.

## Consulta pela conversa

`lerCurso` com `view: "research"` devolve o mesmo contrato da área Pesquisa por
MCP ou Actions. O cliente pode filtrar, explicar a métrica, apresentar a tabela
e abrir os objetos relacionados sem criar outra base de dados.

Quando o cliente oferece a extensão visual MCP Apps, o resultado pode aparecer
num componente com indicadores agregados, gráfico, tabela equivalente, limites
de interpretação e endereço para a área Pesquisa. Em outros clientes, a
representação textual conserva números, denominadores, revisão, ausências e o
mesmo endereço. Para preservar a legibilidade, a síntese apresenta até 12
categorias e avisa quando o conteúdo estruturado conserva outras linhas do
mesmo recorte.

## Limites de interpretação

Os fatos descrevem operações e estados do processo de Autoria. Eles não medem
aprendizagem, atenção, esforço, dificuldade, domínio ou eficácia. O intervalo
entre etapas inclui rede, processamento e espera, portanto não representa tempo
de trabalho humano.

O AraLearn não coleta rolagem, abertura de tela, sequência de toques ou tempo de
permanência para essa área. Uma pesquisa que precise de outra medida deve
definir previamente construto, população, instrumento, finalidade, dados
ausentes, retenção e interpretação permitida.

Consulte o [Dicionário de métricas e conjuntos de
dados](dicionario-metricas-datasets.md) para os campos do contrato e o [Guia do
pesquisador](guia-pesquisador.md) para formular perguntas e registrar limites.
