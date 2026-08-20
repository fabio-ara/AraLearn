# Variantes comparáveis de um Curso

Uma variante comparável é um Curso independente criado a partir do mesmo ponto
de planejamento que outros Cursos. A comparação preserva a origem comum, as
diferenças pretendidas e as revisões observadas.

O recurso apoia análise descritiva do artefato. Ele não cria participantes,
atribuição aleatória, consentimento, desfechos ou inferência causal.

## Quando usar

Variantes ajudam a examinar uma decisão concreta, por exemplo:

- usar valores diferentes de um parâmetro pedagógico;
- restringir os componentes disponíveis numa versão;
- produzir abordagens distintas a partir das mesmas Partes;
- identificar mudanças posteriores que não haviam sido declaradas.

A origem comum melhora a rastreabilidade, mas não transforma os Cursos em
condições experimentais equivalentes. Uma pesquisa sobre aprendizagem ainda
precisa definir população, procedimento, instrumentos, dados ausentes, análise
e requisitos éticos.

## Criar um conjunto

Na Autoria, abra **Variantes** e escolha **Criar variantes**. O conjunto aceita
de duas a oito variantes derivadas. Para cada uma, informe rótulo, título e
objetivo.

A primeira variante serve de referência inicial e conserva os parâmetros e a
política de componentes do Curso de origem. Ao menos uma das demais declara:

- uma diferença de parâmetro no Curso, na Lição ou na Microssequência;
- uma política de componentes diferente;
- a justificativa da diferença intencional.

O servidor registra um ponto comum imutável do planejamento antes de criar os
Cursos. Esse registro conserva a versão do plano, a revisão do Curso, uma
impressão digital e o conteúdo necessário à comparação. Ele não congela o
Curso de origem nem copia sua composição integral como evidência permanente.

## O que cada variante recebe

Cada variante possui identidade, revisão e propriedade próprias. A criação
preserva:

- a hierarquia de Módulos, Lições, Tópicos e Microssequências;
- o plano e as Partes;
- as atribuições do plano às Microssequências;
- parâmetros, orientações e política de componentes;
- Fontes, Âncoras e atribuições ligadas ao planejamento;
- vínculos com PDFs privados por referência ao mesmo conteúdo autorizado.

Unidades de estudo já materializadas não são copiadas. Cada variante produz
suas Unidades conforme as decisões efetivas do novo Curso. Essa fronteira evita
apresentar conteúdo anterior como produção independente.

PDFs iguais compartilham o mesmo objeto imutável quando a autorização permite,
enquanto cada Curso conserva seus próprios vínculos e metadados. Alterar depois
uma Fonte, um parâmetro ou o conteúdo de uma variante não modifica as outras.

## Materialização independente

Cada Curso derivado pode ser planejado, produzido, auditado, estudado e
compartilhado separadamente. As operações usam a revisão do próprio Curso.
Estado pessoal, Observações, acesso direto, fatos de Pesquisa e correções também
permanecem separados.

Para comparar decisões de desenho, produza cada variante sob sua política
efetiva e registre a revisão observada. Revisões diferentes permanecem visíveis
na comparação, em vez de serem tratadas como se representassem o mesmo
instante.

## Ler a comparação

A tela apresenta:

- o ponto comum de planejamento e sua versão;
- a revisão do Curso de origem no ponto comum e no momento da leitura;
- a revisão de cada variante no vínculo e no momento da leitura;
- parâmetros e políticas de componentes efetivos em cada escopo;
- Partes, estado de produção e Unidades existentes;
- componentes realmente usados;
- contagens e impressões digitais de Fontes, Âncoras e PDFs;
- dados ausentes ou incompletos.

As diferenças aparecem em cinco grupos:

| Grupo | Significado |
| --- | --- |
| **Diferenças declaradas** | decisões que a pessoa informou ao criar o conjunto |
| **Observadas conforme declarado** | diferenças intencionais ainda presentes na revisão corrente |
| **Desvios não declarados** | mudanças posteriores fora das diferenças registradas |
| **Diferenças factuais** | diferenças correntes de revisão, Partes, Unidades, componentes e proveniência |
| **Dados ausentes ou incompletos** | parcelas que o contrato não pôde confrontar integralmente |

A comparação usa valores e impressões digitais, além de contagens. Trocar uma
Fonte por outra com a mesma quantidade, por exemplo, continua produzindo uma
diferença observável.

## Desvincular sem excluir

**Desvincular** remove a participação da variante naquele conjunto de
comparação. A operação exige confirmação. O Curso, seu conteúdo, seus acessos e
seu histórico continuam existentes e podem integrar outra atividade.

## Uso pelo MCP

`lerCurso` oferece:

- `variant_comparisons`, para listar os conjuntos associados ao Curso;
- `variant_comparison`, para ler um conjunto e suas diferenças.

`alterarCurso`, com `update_course_variants`, cria variantes ou desvincula um
Curso. A escrita usa revisão esperada e `requestId`, o que protege concorrência
e repetição.

Clientes compatíveis com a extensão visual MCP Apps podem apresentar a comparação em tabela compacta dentro
da conversa. A representação textual conserva revisões, números, diferenças e
dados ausentes quando o cliente não oferece o componente visual. As duas formas
usam o mesmo contrato e a mesma autorização.

## Relação com Pesquisa

O conjunto `variants` da área **Pesquisa** registra fatos sobre ponto comum,
criação, vínculo, desvinculação e comparação. Esses fatos permitem reencontrar o
conjunto e as revisões sem transformar a comparação em medida de aprendizagem.

Para análise externa, registre a pergunta, o recorte, as revisões e os dados
ausentes. Uma diferença descritiva permite afirmar que os Cursos divergiram em
determinado aspecto; decidir que uma variante é melhor ou que causou um
resultado exige outro desenho de pesquisa.

Consulte [Pesquisa sobre a Autoria](analytics-instrucionais.md) para fatos e
exportação e [Guia do pesquisador](guia-pesquisador.md) para os limites de
interpretação.
