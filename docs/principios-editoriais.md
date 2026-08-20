# Princípios editoriais da documentação

A documentação do AraLearn orienta o uso do produto e explica os fundamentos
de suas decisões. Cada texto deve ser compreensível para seu público sem exigir
formação prévia em educação, engenharia de software, bancos de dados ou
inteligência artificial.

## Explicar a partir do problema

Conceitos técnicos e pedagógicos ganham sentido quando o leitor conhece o
problema a que respondem. Por isso, uma explicação conceitual apresenta, quando
forem pertinentes:

1. a necessidade observada;
2. o conceito usado para compreendê-la;
3. as alternativas relevantes;
4. a decisão adotada e seu alcance;
5. as consequências e os limites da decisão;
6. a evidência disponível.

Essa progressão também distingue três afirmações diferentes: algo pode estar
previsto na literatura, implementado no produto ou demonstrado em uma
avaliação. Uma dessas condições não implica automaticamente as demais.

## Adequar o texto à tarefa do leitor

Cada documento tem uma função predominante:

- uma apresentação delimita o produto, sua finalidade e seus compromissos;
- um guia conduz uma tarefa e explica o resultado esperado, inclusive diante
  de falhas ou ausência de conexão;
- um capítulo conceitual desenvolve fundamentos, alternativas e justificativas;
- uma referência define termos, campos, contratos e estados para consulta;
- um texto de avaliação relaciona proposições, métodos, evidências e limites;
- um registro corrente informa capacidades e lacunas verificadas.

A forma acompanha essa função. Um guia oferece instruções executáveis na ordem
em que a pessoa precisa delas. Um capítulo conceitual desenvolve relações e
argumentos. Uma referência favorece a localização precisa de uma regra.

## Manter uma fonte para cada informação

Informações que mudam devem ter um lugar principal. Outros documentos podem
resumi-las ou apontar para elas, mas evitam manter versões concorrentes do
mesmo conteúdo.

| Informação | Fonte principal |
| --- | --- |
| finalidade e compromissos do produto | [Visão do produto](visao-do-produto.md) |
| capacidade corrente e limites conhecidos | [Estado atual](estado-atual-e-roadmap.md) |
| percurso de leitura | [Índice da documentação](README.md) |
| procedimento de uso | guia do público ou da área correspondente |
| justificativa conceitual | capítulo conceitual do assunto |
| vocabulário aprovado | [glossário técnico](glossario-tecnico.md) ou glossário de construtos |
| relação entre alegação, implementação e teste | matriz de conformidade aplicável |

Uma mudança de comportamento deve alcançar, no mesmo ciclo, o guia afetado, a
explicação conceitual, a referência do contrato e a evidência correspondente.
A documentação corrente descreve o produto como ele existe, enquanto o
histórico de versões conserva os estados anteriores.

## Sustentar as afirmações

### Literatura e normas

Afirmações pedagógicas e metodológicas remetem à literatura que as fundamenta.
Afirmações sobre protocolos ou padrões técnicos apontam, quando possível, para
a especificação ou documentação primária. A [lista de
referências](referencias.md) oferece leitura direta, e o arquivo
[BibTeX](referencias.bib) conserva os metadados bibliográficos.

Uma citação identifica a origem de uma ideia. Quando os resultados publicados
dependem de contexto ou divergem entre si, o texto deve conservar essas
condições.

### Implementação verificável

Afirmações sobre o funcionamento do aplicativo podem ser confrontadas com o
código, o modelo de dados e os testes. A [matriz de conformidade
técnica](matriz-conformidade-tecnica.md) reúne os pontos de verificação mais
importantes.

O comportamento observado sob condições testadas demonstra uma propriedade do
sistema. Conclusões sobre compreensão, aprendizagem ou usabilidade exigem
avaliação com pessoas e métodos adequados.

### Hipóteses e resultados empíricos

Proposições sobre aprendizagem, esforço percebido, retomada e trabalho autoral
permanecem hipóteses até serem avaliadas. Ao apresentar um resultado empírico,
a documentação informa população, tarefa, instrumentos, análise e limites de
generalização. O [protocolo de avaliação](protocolo-avaliacao-artefato.md)
organiza esse trabalho.

## Usar o vocabulário do produto

Um termo especializado é apresentado depois do conceito que ajuda a nomear. Um
protocolo aberto que conecta assistentes a ferramentas, por exemplo, recebe em
seguida seu nome: **Model Context Protocol (MCP)**. O [glossário técnico](glossario-tecnico.md)
aprofunda distinções, mas sua leitura não deve ser requisito para compreender
os demais capítulos.

Identificadores literais de campos, contratos e ferramentas aparecem como
código somente quando a grafia exata importa. Na explicação para pessoas,
preferem-se os termos do produto em português: Unidade de estudo, componente
didático, representação externa, formato de resposta, pacote de componente e
núcleo de execução.

Nomes de botões e áreas aparecem em **negrito** e devem coincidir com a
interface. Termos internos de implementação só entram quando são necessários
para explicar um contrato público ou uma decisão técnica.

## Escolher a profundidade necessária

Uma explicação de engenharia ensina o suficiente para compreender a decisão do
produto. Ao tratar da persistência local, por exemplo, interessa esclarecer por
que há dados estruturados no dispositivo, como eles preservam a continuidade e
quais falhas permanecem possíveis. A sintaxe usada para abrir o banco local só
é relevante quando integra um contrato público.

O mesmo critério vale para a pedagogia. Um conceito deve ser ligado ao
comportamento que orienta e aos limites de sua aplicação, em vez de aparecer
como uma sequência isolada de definições.

## Escrever exemplos e instruções úteis

Um exemplo precisa revelar a regra que pretende ensinar. Exemplos simples
demais podem ocultar problemas de escala; casos muito particulares podem soar
como uma restrição inexistente. Quando uma regra afeta telas pequenas, textos
extensos ou uso sem conexão, o exemplo deve tornar essa condição visível.

Instruções descrevem ações observáveis e resultados reconhecíveis. Mensagens
para estudantes e autores usam o vocabulário da atividade, sem expor detalhes
internos do desenvolvimento.

## Revisar clareza e precisão

A verificação automática encontra links quebrados, problemas na hierarquia de
títulos, documentos ausentes e algumas contradições conhecidas. Ela
complementa a leitura humana, que avalia progressão, naturalidade, precisão e
coerência com o produto.

Antes da publicação, a revisão também confronta afirmações de capacidade com a
interface, os contratos e os testes correspondentes. O texto final registra o
estado verificável do AraLearn e reserva afirmações pedagógicas mais amplas
para as evidências que possam sustentá-las.
