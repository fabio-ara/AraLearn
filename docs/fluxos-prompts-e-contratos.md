# Fluxos, instruções e contratos

Um modelo de linguagem interpreta texto e produz respostas probabilísticas. O
AraLearn precisa preservar, de modo determinístico, identidades, relações,
permissões, revisões e fatos. A linguagem natural expressa a intenção; uma
operação fechada descreve a mudança; o domínio e o PostgreSQL decidem o que
pode ser confirmado.

## Conceitos básicos

Uma **instrução** estabelece um comportamento estável do cliente. Um **pedido**
reúne a intenção da pessoa, o contexto necessário e a forma esperada da
resposta. Instrução e pedido orientam o modelo, mas não concedem acesso ao
Curso.

**Contexto** é informação para leitura, como objetivo, plano, parâmetros
efetivos, posição curricular, conteúdo vizinho e versões. Receber esse contexto
não torna qualquer objeto gravável.

Um **esquema** delimita a forma dos dados. Um **contrato** acrescenta
significado, autoridade, versões e invariantes. Um **envelope** transporta o
conteúdo e seus metadados. JSON válido só se torna mudança de Curso depois de
passar por essas regras.

## Uma autoridade, duas formas de interação

A interface visual e o MCP operam o mesmo Curso. A interface oferece campos e
controles compreensíveis; no MCP, a pessoa descreve sua intenção e o cliente
escolhe as ferramentas. As duas formas chegam aos mesmos casos de uso, às
mesmas funções do banco e às mesmas regras de autorização.

O canal técnico `application|mcp` identifica por onde uma operação autoral
chegou. Esse dado não altera a propriedade do Curso nem o resultado da
validação.

## Superfície do MCP

Cinco ferramentas públicas agrupam capacidades
relacionadas, sem criar uma ferramenta para cada objeto:

| Ferramenta | Responsabilidade |
| --- | --- |
| `listarCursos` | listar Cursos próprios com paginação |
| `lerCurso` | ler uma vista delimitada e versionada |
| `criarCurso` | criar a raiz privada do Curso |
| `alterarCurso` | alterar plano, desenho, Fontes, Observações, auditoria, variantes, composição ou materialização |
| `consultarComponentesDidaticos` | descobrir, inspecionar, validar, auditar e apresentar componentes |

Perfil, avatar e acesso direto são operações exclusivas da aplicação
autenticada. O e-mail-alvo de uma concessão não integra nenhum prompt ou
payload MCP.

`alterarCurso` aceita estas operações públicas:

- `update_instructional_plan`;
- `update_course_design`;
- `update_course_sources`;
- `update_anchored_annotations`;
- `update_audit_cycle`;
- `update_course_variants`;
- `commit_course_composition`;
- `advance_part_materialization`.

Cada operação admite somente o comando e os campos que lhe pertencem. Dados de
Fontes não entram no comando de desenho, por exemplo, e confirmação de correção
não é aceita em comandos que apenas registram ou leem evidência.

## Seleção de contexto

`lerCurso` oferece vistas específicas para cada decisão:

- `summary` e `outline` para identidade e hierarquia;
- `instructional_plan` para plano, Partes e vínculos;
- `course_design` para parâmetros, orientações, política de componentes e itens
  atribuídos;
- `course_sources` e `course_source_attachment` para proveniência e PDFs;
- `anchored_annotations` para Observações;
- `part_materialization` para produção retomável;
- `study_units` para Inspeção curricular;
- `entities` para alterações estruturais;
- `audit_cycle` para rodadas, achados e correções;
- `variant_comparisons` e `variant_comparison` para variantes;
- `research` para fatos, métricas e destinos da Pesquisa.

O cliente escolhe a menor vista que sustenta a decisão. Conteúdo adjacente pode
ser útil para coerência, mas a operação de escrita continua limitada aos alvos
declarados.

## Separação entre plano, desenho e composição

O **plano instrucional** responde o que o Curso pretende ensinar e como o
trabalho foi agrupado. Ele reúne público, escopo, resultados pretendidos,
unidades de análise, requisitos de evidência e Partes.

O **desenho instrucional parametrizado** registra as decisões que devem reger a
produção num escopo: parâmetros, orientações e política de componentes. Cada
Microssequência também recebe, de forma explícita, os itens do plano que precisa
desenvolver.

A **composição** contém Módulos, Lições, Tópicos, Microssequências e Unidades de
estudo. Alterar um vínculo de Parte não altera essa hierarquia por implicação;
criar, mover ou remover uma entidade exige um comando de composição.

Essa divisão permite replanejar sem apagar conteúdo e materializar sem
reinterpretar silenciosamente a intenção.

## Resolução do desenho

Parâmetros pedagógicos possuem definições versionadas, tipo, escopos,
valor-padrão e limitações. A precedência corrente é:

1. decisão autoral ou de pesquisa no escopo aplicável mais próximo;
2. atribuição automática justificada no escopo aplicável mais próximo;
3. valor-padrão do sistema.

Herança e valor-padrão são calculados. Limpar uma atribuição remove a decisão
local e faz a leitura resolver novamente a cadeia.

Orientações autorais conservam o texto original em revisões. Uma interpretação
estruturada aponta para uma revisão exata e registra resumo, diretivas,
divergências e perguntas. Ela não substitui o texto da pessoa.

A política de componentes fixa a revisão do catálogo, a disponibilidade geral
ou restrita, os componentes bloqueados e os preferidos. O servidor resolve a
política antes da produção e confere os componentes realmente presentes na
Unidade.

## Materialização reproduzível por Parte

```text
Parte e Microssequências vinculadas
→ itens do plano atribuídos a cada alvo
→ desenho e Fontes resolvidos pelo servidor
→ execução e etapas persistidas
→ produção de um recorte
→ validação de estrutura, componentes e proveniência
→ confirmação atômica da etapa
→ Inspeção e eventual auditoria
```

Ao iniciar uma execução, o servidor sela o contexto efetivo. Catálogos de
unidades de análise e requisitos de evidência preservam identidade, posição,
enunciado e versão. Cada Microssequência referencia somente os itens que lhe
foram atribuídos.

Uma etapa informa fatos delimitados de aplicação: Unidades afetadas, unidades
de análise introduzidas, formas de explicação, oportunidades de prática,
dimensões de variação e componentes usados. O contrato verifica referências,
contagens e coerência interna; o banco confere ainda as identidades das
Unidades, o pai, a Microssequência, as atribuições de Fontes e as identidades
`package@version` presentes no conteúdo.

As formas, oportunidades e variações são declarações examináveis da autoria ou
do cliente. O banco não deduz essas propriedades pela fluência do texto. Uma
auditoria posterior pode confrontar a declaração com o conteúdo e suas
evidências.

Se uma verificação falhar, conteúdo, vínculo, progresso, evento e recibo da
etapa são revertidos juntos. O estado persistido informa a próxima etapa e
permite continuar depois de uma interrupção.

## Proveniência e anexos

Fontes e Âncoras possuem revisões próprias. `set_target_sources` substitui o
conjunto ordenado de atribuições de um item do plano ou de uma Unidade. Cada
vínculo declara relação e Âncoras exatas.

PDFs ficam em armazenamento privado e são ligados a uma revisão de Fonte por
impressão digital, tamanho e tipo. A preparação cria uma intenção privada de dez
minutos para o ator, caminho e revisões exatos. O envio direto usa a sessão
autenticada e consome a intenção; a confirmação transacional verifica o objeto
antes de criar o vínculo. A leitura usa uma URL assinada de 60 segundos e uma
URL já emitida continua válida até expirar.

Uma exportação de proveniência reúne o alvo, as atribuições, as revisões das
Fontes, as Âncoras e os metadados dos anexos. O arquivo não contém o PDF nem
transforma o vínculo em prova de correção factual.

## Descoberta progressiva de componentes

O catálogo completo não integra o contexto de cada pedido. O cliente:

1. explora famílias e facetas;
2. pesquisa por intenção;
3. inspeciona poucos candidatos;
4. solicita um contrato exato;
5. valida a Unidade;
6. audita a adequação representacional;
7. apresenta uma prévia.

A busca devolve até oito candidatos e cada consulta de contrato recebe uma
única identidade. O navegador e a função remota usam o mesmo registro de
componentes. Uma classificação `substitute` indica aproximação e exige que a
limitação seja apresentada à pessoa.

## Observações e auditoria

Uma Observação preserva texto, alvo, revisão observada, origem, canal,
classificação e estado. A leitura por MCP pode mostrar caixa de entrada, alvo ou
detalhe. Criar uma Observação pela conversa exige alvo, síntese breve e
confirmação humana.

Caixa de entrada e alvo usam uma projeção fechada sem texto integral,
`contributor.ref`, rótulo protegido, caminhos, links, horários exatos ou IDs internos. O detalhe
e o contexto de auditoria com Observações selecionadas exigem a declaração
`includeObservationText: true`; a resposta registra que o texto foi enviado ao
cliente MCP conectado e continua omitindo as referências pessoais e internas.

O ciclo de auditoria deriva o contexto de uma Unidade e registra uma rodada
imutável. Achado, proposta de correção, aplicação, verificação e reversão são
estados e operações distintos. Evidência factual positiva aponta para Fonte e
Âncora correntes. Aplicação e reversão exigem confirmação explícita; a resolução
exige outra rodada sobre o critério focal.

## Variantes e fatos de Pesquisa

Uma comparação de variantes conserva um ponto comum de planejamento, Cursos
independentes e diferenças intencionais. As leituras confrontam revisões,
parâmetros, políticas de componentes, Partes, Unidades, componentes e
proveniência. Desvincular uma variante preserva o Curso.

A vista `research` projeta sete conjuntos de fatos operacionais. Métricas,
gráfico, tabela, exportação e MCP derivam das mesmas linhas e da mesma revisão.
Os filtros e o instante de corte integram o cursor, impedindo que páginas de
recortes diferentes sejam misturadas.

## Concorrência e repetição segura

Toda escrita informa `expectedRevision` e, conforme o objeto, a versão esperada
do plano, da Parte, da execução, da etapa, da orientação, da Observação ou do
ciclo de auditoria. O PostgreSQL aplica comparação e troca atômica
(`compare-and-swap`, CAS). Uma revisão desatualizada exige releitura e
reconciliação.

`requestId` identifica uma intenção durante a janela de retenção do recibo.
Repetir o mesmo comando devolve o resultado anterior; reutilizar a chave com
outro conteúdo gera conflito. Uma operação sem alteração efetiva conserva as
versões e não cria evento de atividade.

## Persistência e privacidade

O Curso conserva dados confirmados: plano, decisões de desenho, orientações,
composição, proveniência, Observações, rodadas, correções, variantes, fatos de
Pesquisa, eventos compactos e recibos temporários. Transcrição de conversa,
resposta bruta e raciocínio privado do modelo ficam fora desse estado.

O conteúdo estudável, o estado pessoal e as filas específicas de Observações
podem permanecer no dispositivo. Mutações de Autoria usam o servidor e a revisão
corrente. Essa fronteira impede que uma cópia local antiga se torne autoridade
sobre o Curso.

## Respostas a falhas

| Situação | Resposta do contrato |
| --- | --- |
| comando ou JSON fora da forma | recusar antes de gravar |
| revisão ou versão desatualizada | exigir releitura e reconciliação |
| Curso fora da propriedade da conta | negar a operação sem expor dados |
| interpretação ligada a outra revisão de orientação | recusar o vínculo |
| componente bloqueado ou fora da lista permitida | reverter a etapa |
| item do plano fora do alvo | recusar a declaração |
| identidade, pai ou componente divergente | reverter a etapa |
| Fonte, Âncora ou anexo divergente | recusar a atribuição |
| recorte acima do limite | abortar sem truncamento silencioso |
| repetição idêntica | devolver o recibo existente |

Contratos comprovam integridade e rastreabilidade dentro das regras
declaradas. Avaliar verdade, adequação pedagógica ou eficácia exige evidência e
método próprios. Consulte [Desenho instrucional
parametrizado](desenho-instrucional-parametrizado.md) para os parâmetros e
[Autoria por MCP](autoria-mcp.md) para os esquemas completos.
