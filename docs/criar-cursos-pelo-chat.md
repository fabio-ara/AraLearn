# Criar e revisar Cursos por conversa

Um cliente conectado por MCP ou um GPT com Actions pode trabalhar no mesmo
Curso que a interface visual. A conversa serve para propor e coordenar; o
AraLearn guarda plano, conteúdo, configuração, Fontes e Observações.

## Fale sobre o Curso

Descreva a mudança em linguagem de autoria. Você não precisa fornecer
identificadores do banco, versões ou dados de transporte. O GPT localiza objetos
por título, posição e referência humana e pede esclarecimento somente quando há
ambiguidade real.

Uma resposta coordenadora costuma ter:

- uma proposta ou resultado;
- um link para o contexto no AraLearn;
- uma decisão seguinte, quando necessária.

Conteúdo pedagógico pode ser profundo. A coordenação não precisa repetir o que
já está aberto na interface.

## Comece com o contexto que muda o desenho

Um briefing útil informa:

- quem deverá aprender;
- o que deverá compreender ou conseguir fazer;
- conhecimentos prévios relevantes;
- conteúdo e Fontes disponíveis;
- idioma, dispositivo, acessibilidade e outras restrições reais;
- condições que você deseja fixar para comparação.

No uso comum, o GPT calibra os parâmetros pedagógicos a partir desse contexto.
Ele não transforma a conversa num questionário. Se faltar uma decisão material,
faz uma pergunta por vez.

## Localize ou crie o Curso

Para continuar algo existente, peça que o GPT retome pelo título. A tarefa
`retomar_curso` devolve o Curso e um link. Se houver homônimos, acrescente
objetivo ou outro traço humano.

Para começar do zero, confirme título e objetivo. `criar_curso` cria um Curso
privado. Depois, a próxima decisão é planejar a primeira Parte; não é necessário
preencher toda a estrutura numa única resposta.

## Planeje uma Parte por vez

O ciclo padrão é:

1. o GPT propõe a próxima Parte;
2. você aprova ou pede uma mudança;
3. `salvar_parte` grava a Parte completa;
4. `consultar_planejamento` relê o estado;
5. o GPT propõe a Parte seguinte.

Uma Parte salva contém uma ou mais Microssequências. Para cada uma, a proposta
declara:

- Módulo e objetivo do Módulo;
- Lição e objetivo da Lição;
- título e objetivo da Microssequência;
- função de explicar, praticar, revisar ou apoiar;
- AnalysisUnits que ela deverá desenvolver;
- requisitos de evidência pertinentes.

Essa informação cria a estrutura necessária sem pedir IDs. AnalysisUnit é uma
novidade semântica materialmente independente, não um tópico amplo. Inclua
conceitos auxiliares, relações, condições, procedimentos e operações
intelectuais quando também precisarem ser aprendidos.

Sete a doze Partes são uma heurística possível. Não existe meta de Partes ou de
StudyUnits. Se o conteúdo exigir mais Unidades para permanecer autossuficiente,
o plano deve acomodá-las.

## Configure pedagogia e edição

`consultar_configuracao` mostra valores efetivos e direção editorial no Curso
ou numa Microssequência. `ajustar_configuracao` permite definir ou restaurar a
herança de:

- teto de novas AnalysisUnits por StudyUnit expositiva;
- formas de explicação requeridas;
- mínimo de práticas distintas por requisito de evidência;
- dimensões de variação da prática;
- direção editorial separada.

Uma direção sobre extensão, títulos ou estilo organiza a apresentação. Ela não
autoriza eliminar explicação, exemplo ou prática necessária; crie mais
StudyUnits quando faltar espaço.

## Produza uma Parte

Antes de escrever Unidades, o GPT chama `preparar_materializacao`. A leitura
traz apenas a Parte aprovada, inventário semântico, conhecimentos estabelecidos,
configuração e Fontes pertinentes.

Ao propor as StudyUnits, confira:

- qual novidade cada Unidade introduz;
- que novidades já estavam estabelecidas;
- definição, contexto, mecanismo, relações, exemplos e contrastes necessários;
- forma explicativa e componente adequados;
- oportunidades de prática e dimensões de variação;
- Fontes e Âncoras usadas.

`materializar_parte` grava as StudyUnits. Um teto 1 não permite esconder quatro
novidades dentro de uma AnalysisUnit; um teto 2 não exige compactar novidades
que continuam independentes. Mudar o teto preserva o inventário e muda sua
distribuição.

## Escolha componentes pela função

Use `consultar_componentes` quando a função instrucional pedir uma representação
e o componente adequado ainda não estiver claro. Parágrafo e escolha continuam
válidos quando cumprem a função. Tabela, sequência, classificação, código,
diagrama ou outra forma devem ser usados quando tornam a relação ensinada mais
legível.

Não consulte o catálogo apenas para variar a aparência.

## Trabalhe com Fontes e PDFs

`consultar_fontes` localiza uma Fonte, suas Âncoras ou a proveniência de uma
StudyUnit. `manter_fonte` salva metadados, verificação, Âncoras e vínculos. Uma
Fonte pode ser adotada, contestada e revista.

Use `incorporar_pdf_como_fonte` somente quando o arquivo anexado deve permanecer
no Curso. Informe se ele cria uma Fonte ou se pertence a uma Fonte existente.
Uma leitura descartável não deve gravar o PDF.

Depois da incorporação, o arquivo pode ser retomado por título em outra
conversa; a memória do chat não é sua autoridade.

## Registre Observações e revise

Você pode registrar Observações na interface ou pedir
`registrar_observacao`. Várias StudyUnits podem receber o mesmo apontamento, mas
cada Observação permanece um registro próprio.

Para tratar pendências:

1. use `consultar_observacoes` no escopo desejado;
2. peça `preparar_revisao`;
3. confira também StudyUnits afetadas por progressão, pré-requisitos,
   transições, exemplos ou prática;
4. discuta um conjunto coerente de mudanças;
5. depois da decisão, use `aplicar_correcoes`;
6. volte ao link e reinspecione.

Resolver apenas a Unit anotada pode deixar o percurso incoerente. A revisão
deve alcançar todos os pontos materialmente afetados, sem expandir para uma
reescrita sem necessidade.

## Consulte Analytics

Na interface, Analytics permite escolher Curso, Parte, Microssequência ou
StudyUnit. Desenho mostra configuração aplicada, AnalysisUnits, formas,
componentes, prática e Fontes. Autoria mostra parâmetros definidos e a origem
observável da criação e da última revisão das StudyUnits.

O JSON exportado contém os mesmos números da tela. Ele não mede aprendizagem e
não substitui a cópia do artefato exigida por um protocolo de pesquisa.

## Retome em outra conversa

Uma conversa nova começa com `retomar_curso`. O GPT relê o planejamento e o
escopo necessário em vez de depender do resumo da conversa anterior. Uma Parte
antiga pode ser aberta por posição ou título; Fontes e Observações também podem
ser consultadas a qualquer momento.

## Quando algo falhar

- **Curso ou Parte ambíguos:** forneça título ou posição mais específica.
- **Curso mudou:** deixe o GPT reler e reconstruir a mesma intenção.
- **Objeto não encontrado:** abra o link ou consulte o escopo pai antes de
  decidir se deve recriá-lo.
- **Falha transitória:** repita a tarefa sem alterar a proposta.
- **Acesso negado:** conecte a conta proprietária; repetição não amplia
  permissão.
- **PDF recusado:** confira tipo, integridade, tamanho e intenção de
  armazenamento.

Veja [Autoria pelo MCP](autoria-mcp.md), [Autoria por Actions](autoria-actions.md)
e [Analytics da Autoria](analytics-instrucionais.md) para os contratos e limites
de cada superfície.
