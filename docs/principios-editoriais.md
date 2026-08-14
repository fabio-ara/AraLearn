# Princípios editoriais da documentação

Esta documentação tem duas funções: orientar operações no AraLearn e ensinar
os fundamentos usados para projetá-lo. Ela não pressupõe formação prévia em
educação, engenharia de software, bancos de dados ou inteligência artificial.
Também não substitui manuais das tecnologias adotadas: explica os conceitos e
as decisões que são necessários para compreender o produto.

## Progressão da explicação

Um capítulo conceitual segue, sempre que o assunto permitir, esta sequência:

1. **problema:** qual necessidade precisa ser atendida;
2. **conceito:** o que significa o termo técnico ou pedagógico empregado;
3. **alternativas:** quais soluções plausíveis foram consideradas;
4. **decisão:** qual solução o AraLearn adota e em que escopo;
5. **consequências:** o que a decisão permite, limita ou torna mais custoso;
6. **evidência:** como a afirmação é sustentada ou como poderá ser avaliada.

Essa organização evita duas falhas comuns. A primeira é apresentar uma sigla
antes de explicar o problema que ela resolve. A segunda é descrever a
implementação como se a simples existência do código demonstrasse a adequação
pedagógica da decisão.

## Tipos de documento

Cada texto declara ou deixa clara sua função predominante:

- **apresentação:** delimita o produto, seus compromissos e seus limites;
- **guia operacional:** conduz uma tarefa por pré-requisitos, passos, resultado
  esperado, comportamento offline e recuperação de falhas;
- **capítulo conceitual:** ensina fundamentos, alternativas e justificativas;
- **referência:** define termos, contratos, campos ou estados para consulta;
- **avaliação:** liga proposições a evidências e informa o que ainda não foi
  demonstrado;
- **registro de estado:** descreve capacidades correntes e trabalho futuro sem
  misturá-los com instruções de uso.

Misturar esses gêneros torna a leitura imprevisível. Um guia não deve exigir
que a pessoa reconstrua o procedimento a partir de uma discussão arquitetural;
uma referência de contrato não deve esconder regras normativas em uma
narrativa histórica.

### Materiais executáveis de autoria

Alguns arquivos em [`authoring/`](../authoring/README.md) não são capítulos
para estudo: são instruções e conhecimentos preparados para caber no contexto
de clientes e modelos de linguagem. Neles, concisão e ausência de ambiguidade
são requisitos operacionais. A documentação humana explica os mesmos conceitos
com progressão e justificativa; os materiais executáveis conservam apenas o
necessário para orientar uma operação. Essa separação evita transformar um
manual didático em prompt e evita consumir contexto do modelo com exposições
que não mudam sua decisão.

## Três bases de evidência

### Literatura e normas

Uma afirmação pedagógica ou metodológica deve remeter à literatura que a
fundamenta. Uma afirmação sobre um protocolo ou padrão técnico deve, quando
possível, apontar para a especificação ou documentação primária. A
[lista de referências](referencias.md) oferece leitura direta; o arquivo
[BibTeX](referencias.bib) conserva os metadados canônicos para processamento
bibliográfico.

A citação mostra de onde veio uma ideia; não transforma automaticamente uma
decisão de produto em resultado científico. Quando a literatura oferece
resultados condicionais ou divergentes, o texto deve conservar essas
condições.

### Implementação verificável

Afirmações como “o aplicativo grava a operação antes de sincronizá-la” ou “o
contrato rejeita uma referência inexistente” podem ser confrontadas com código,
schemas, migrations e testes. A [matriz de conformidade
técnica](matriz-conformidade-tecnica.md) registra os pontos de verificação mais
importantes.

Uma propriedade implementada demonstra comportamento do sistema sob as
condições testadas. Ela não demonstra compreensão, aprendizagem ou usabilidade
por pessoas.

### Hipóteses e resultados empíricos

Proposições sobre aprendizagem, esforço percebido, retomada e trabalho autoral
permanecem hipóteses enquanto não houver estudo adequado. A documentação deve
informar a população, a tarefa, os instrumentos, a análise e os limites de
generalização antes de apresentar um resultado empírico. O [protocolo de
avaliação](protocolo-avaliacao-artefato.md) organiza essa passagem.

## Vocabulário

Um termo especializado é definido na primeira ocorrência relevante. A forma
expandida precede a sigla: por exemplo, **Model Context Protocol (MCP)**. O
[glossário técnico](glossario-tecnico.md) aprofunda distinções e oferece uma
referência comum, mas não é pré-requisito para ler outros capítulos.

Identificadores literais de contratos, ferramentas e campos aparecem em
formatação de código somente quando a grafia exata importa. Na explicação
conceitual, usam-se termos em português. Palavras internas do processo de
desenvolvimento, números de tarefas e referências à conversa que originou uma
decisão não pertencem ao texto público.

## Profundidade relevante

Explicar engenharia não significa ensinar toda a linguagem de programação. O
nível adequado é aquele que permite compreender a decisão do produto. Um
capítulo sobre persistência, por exemplo, deve ensinar:

- por que o AraLearn precisa de dados locais estruturados;
- o que IndexedDB oferece;
- por que um armazenamento simples de preferências seria insuficiente;
- como transações, filas e revisão interagem;
- quais falhas e custos permanecem.

Não precisa ensinar a sintaxe de uma função JavaScript que abre o banco, salvo
quando a sintaxe for parte do contrato público ou da operação documentada.

## Exemplos e linguagem de interface

Exemplos devem ser neutros e suficientes para revelar a regra explicada. Um
exemplo excessivamente simples pode esconder problemas de escala; um exemplo
particular apresentado como regra pode restringir indevidamente o uso do
sistema.

Nomes de botões e telas aparecem em **negrito** e devem coincidir com a
interface. Instruções autorreferentes como “observe este resource” são evitadas
quando o próprio objeto pode comunicar sua função. Vocabulário de bastidor não
é usado como mensagem ao estudante.

## Manutenção

Uma mudança de comportamento exige revisar, no mesmo ciclo:

1. o guia operacional afetado;
2. o capítulo que justifica a decisão;
3. a referência de contrato ou estado, se houver;
4. a matriz de evidências aplicável;
5. os materiais de configuração derivados.

A auditoria automática verifica links, hierarquia de títulos, documentos
obrigatórios e algumas contradições conhecidas. Essa auditoria reduz regressões
editoriais, mas não substitui revisão humana de clareza, progressão e precisão.
