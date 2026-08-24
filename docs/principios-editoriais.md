# Princípios editoriais da documentação

A documentação do AraLearn deve ensinar o produto com a mesma disciplina didática que o próprio AraLearn procura aplicar ao conteúdo educacional. Cada texto precisa ser compreensível para seu público sem exigir formação prévia em educação, engenharia de software, bancos de dados, estatística ou inteligência artificial.

A profundidade não deve ser reduzida. Ela deve ser distribuída de modo que o leitor encontre primeiro o conceito e a tarefa, e só depois os mecanismos, a teoria e os detalhes técnicos necessários.

## Começar pelo problema e pelo referente

Um conceito técnico, pedagógico ou metodológico só ganha sentido quando o leitor conhece o problema a que ele responde.

Uma explicação conceitual apresenta, quando forem pertinentes:

1. a necessidade observada;
2. o fenômeno ou objeto ao qual a necessidade se refere;
3. o conceito usado para compreendê-lo;
4. a decisão adotada e seu alcance;
5. as consequências e os limites;
6. a evidência disponível;
7. a terminologia técnica que ajuda a nomear o que já foi compreendido.

Essa progressão distingue afirmações diferentes. Algo pode ser defendido pela literatura, implementado no produto ou demonstrado por uma avaliação. Uma dessas condições não implica automaticamente as outras.

## Organizar a documentação em camadas de leitura

### Compreender e usar

README, visão do produto, uso do aplicativo, guias de estudante, autor, pesquisador e solução de problemas devem ser compreensíveis por uma pessoa leiga.

Esses textos explicam para que serve o AraLearn, o que a pessoa encontra na interface, como executar uma tarefa, qual resultado esperar, o que fazer diante de uma falha relevante e o significado dos conceitos necessários para usar o produto.

Eles não pressupõem conhecimento de arquitetura, banco de dados, protocolos, ferramentas de desenvolvimento ou história do projeto.

### Aprofundamento conceitual e acadêmico

Documentos sobre modelo didático, desenho instrucional, componentes, aprendizagem, pesquisa, métricas e metodologia desenvolvem fundamentos, alternativas, controvérsias, evidências e limites de inferência.

A literatura é apresentada como argumento e contexto, não como lista decorativa de referências. Citações e referências permitem verificar as afirmações e aprofundar o tema.

### Aprofundamento técnico

Documentos de engenharia explicam em detalhe a arquitetura corrente, linguagens e tecnologias, persistência, autorização, sincronização, contratos, APIs, armazenamento, segurança, implantação, testes e recuperação.

Esses detalhes não são bastidor quando ajudam a compreender ou reproduzir o sistema atual. O documento técnico pode ser minucioso, desde que explique primeiro o referente e mantenha clara a relação entre mecanismo e finalidade.

## O aprofundamento também precisa ensinar

Um texto técnico ou acadêmico não pode pressupor que o leitor já domine o vocabulário especializado. A profundidade vem depois da compreensão inicial, não no lugar dela.

Quando introduzir um conceito especializado, siga uma progressão semelhante a esta:

1. apresente uma situação ou problema reconhecível;
2. explique por que ele importa no AraLearn;
3. descreva a ideia em linguagem corrente;
4. apresente o termo técnico;
5. mostre como o mecanismo ou construto se relaciona com outros conceitos;
6. explique como aparece no produto ou na investigação;
7. apresente limites, alternativas e evidências;
8. ofereça links para aprofundamentos relacionados.

Por exemplo, uma página de segurança não começa por `RLS`. Primeiro explica por que uma pessoa não pode ler ou alterar registros de outra. Em seguida apresenta a segurança em nível de linha, mostra onde ela atua, explica sua relação com autenticação e autorização e só então detalha políticas e contratos. Da mesma forma, um texto de pesquisa explica o problema de atribuir causalidade antes de introduzir confundimento, randomização ou validade interna.

O mesmo princípio vale para desenho instrucional. Densidade informacional, prática de recuperação, variação, evidência ou carga cognitiva aparecem depois que o leitor entende o problema educacional ao qual esses conceitos respondem.

## Separar documentação corrente de história de implementação

A documentação corrente descreve **o produto como ele funciona agora**.

README, guias e capítulos conceituais correntes não devem narrar a evolução interna do projeto. Evite construções como:

- “desde a versão 0.0.x”;
- “a versão anterior oferecia...”;
- “na linha publicada...”;
- “foi comprovado no ambiente...”;
- “ainda depende de validação...”;
- “registrado no roadmap”;
- “esta issue corrigiu...”;
- “o Codex implementou...”;
- referências ao pedido que originou o trabalho;
- referências à conversa de desenvolvimento;
- comparações de quantidade de ferramentas, revisões de API, manifesto, `versionCode` ou outros números de release quando eles não forem parte da tarefa do leitor.

História de versões pertence ao Git, ao CHANGELOG e às notas de release. Estado operacional de uma implantação pertence à documentação de implantação ou ao registro de release quando for realmente necessário. A documentação de uso ensina o comportamento atual.

Quando um detalhe histórico ainda aparece porque ajuda a explicar uma decisão corrente, reescreva a ideia como fundamento da decisão, sem transformar o texto em cronologia de implementação.

## Colocar cada detalhe no lugar adequado

Um mecanismo técnico pode ser importante sem pertencer ao README.

Por exemplo, quem usa **Assistência por IA** precisa entender o que será enviado, qual ação ocorrerá e como revisar o resultado. A arquitetura de transporte, a ponte Android, a política do WebView, o tratamento da credencial e o contrato do relay pertencem à documentação técnica correspondente.

O mesmo vale para Model Context Protocol, banco de dados, Storage, políticas de acesso, filas, revisões técnicas e manifests. A camada de uso apresenta o efeito percebido pela pessoa; a camada técnica explica como o sistema o realiza.

## Adequar a forma à tarefa do leitor

Cada documento possui uma função predominante:

- uma apresentação delimita o produto, sua finalidade e seus compromissos;
- um guia conduz uma tarefa e explica o resultado esperado;
- um capítulo conceitual desenvolve fundamentos, alternativas e justificativas;
- uma referência define termos, campos, contratos e estados para consulta;
- um texto de avaliação relaciona proposições, métodos, evidências e limites;
- um documento técnico explica mecanismos, decisões e formas de verificação;
- uma nota de release registra mudanças de uma versão específica.

A estrutura acompanha essa função. Um guia segue a ordem em que a pessoa age. Um capítulo conceitual desenvolve relações. Uma referência favorece consulta precisa. Uma nota de release não deve ser usada como introdução ao produto.

## Manter uma fonte principal para cada informação

Informações que mudam devem ter um lugar principal. Outros documentos podem resumir ou apontar para elas, mas não devem manter versões concorrentes do mesmo conteúdo.

| Informação | Fonte principal |
| --- | --- |
| finalidade e compromissos do produto | [Visão do produto](visao-do-produto.md) |
| percurso de leitura | [Índice da documentação](README.md) |
| procedimento de uso | guia do público ou da área correspondente |
| justificativa conceitual | capítulo conceitual do assunto |
| arquitetura e mecanismo corrente | documento técnico correspondente |
| vocabulário aprovado | [glossário técnico](glossario-tecnico.md) ou glossário de construtos |
| relação entre alegação, implementação e teste | matriz de conformidade aplicável |
| metadados bibliográficos | [`referencias.bib`](referencias.bib) |
| história de versões | CHANGELOG e notas de release |

Uma mudança de comportamento deve alcançar, no mesmo ciclo, o guia afetado, a explicação conceitual, a referência do contrato e a evidência correspondente.

## Sustentar as afirmações

### Literatura e normas

Afirmações pedagógicas e metodológicas remetem à literatura que as fundamenta. Afirmações sobre protocolos, segurança, acessibilidade ou padrões técnicos apontam, quando possível, para especificações, normas e documentação primária. Afirmações sociotécnicas podem exigir também literatura empírica ou conceitual adequada à questão.

Uma citação identifica a origem de uma ideia. Quando os resultados publicados dependem de contexto ou divergem entre si, o texto deve conservar essas condições.

### Pesquisa bibliográfica relevante

A documentação técnica e acadêmica deve ser fundamentada no melhor conjunto de fontes pertinente à afirmação que está sendo feita.

- Para engenharia, prefira especificações, normas, documentação oficial e literatura técnica primária; use trabalhos acadêmicos quando a afirmação envolve segurança, interação humano-computador, sistemas distribuídos, privacidade, desempenho ou outro tema que dependa de evidência além da especificação.
- Para desenho instrucional, aprendizagem e pesquisa educacional, procure revisões, meta-análises, estudos fundamentais, trabalhos teóricos e estudos primários relevantes à pergunta, conservando resultados contraditórios e limites de transferência.
- Para acessibilidade e padrões de interface, use normas e orientações primárias, complementadas por pesquisa quando a decisão envolver comportamento humano ou evidência de usabilidade.
- Para metodologia, cite fontes que definam o método, o construto ou o risco de inferência discutido.

Não é necessário refazer uma busca ampla quando o corpus existente já sustenta adequadamente a afirmação. Pesquise de novo quando a fonte atual for insuficiente, desatualizada para um mecanismo que mudou, distante da pergunta ou incapaz de sustentar o alcance do texto. Novas buscas destinadas ao corpus acadêmico seguem o protocolo bibliográfico vigente do projeto.

Uma fonte relevante não deve ser omitida apenas porque contraria uma decisão do produto. A documentação registra controvérsias, resultados nulos e limites quando eles alteram a interpretação.

### Referências no texto e bibliografia ao fim de cada página

Todo documento técnico, conceitual ou acadêmico que faça afirmações externas deve usar referências no próprio texto e terminar com uma seção **Referências** contendo somente as obras efetivamente citadas naquela página.

O padrão no texto é autor-data, apresentado de forma legível, como `Sweller (1988)` ou `(Sweller, 1988)`, com ligação para a entrada bibliográfica correspondente quando o formato permitir.

`referencias.bib` continua sendo a fonte canônica dos metadados. A bibliografia no fim de cada página deve ser derivada dessas mesmas entradas, e não mantida como uma segunda cópia manual. `referencias.md` continua oferecendo a bibliografia geral do projeto.

A ferramenta existente que constrói referências legíveis deve ser estendida apenas o necessário para:

1. identificar as chaves citadas em cada página;
2. gerar ou validar a seção **Referências** daquela página a partir de `referencias.bib`;
3. rejeitar chave desconhecida, metadado divergente, citação sem entrada local ou entrada local nunca citada;
4. preservar `referencias.md` como índice bibliográfico completo.

Essa automação existe para evitar divergência de metadados, não para escolher literatura nem escrever a argumentação.

### Implementação verificável

Afirmações sobre o funcionamento do aplicativo podem ser confrontadas com o código, o modelo de dados e os testes. A [matriz de conformidade técnica](matriz-conformidade-tecnica.md) reúne os pontos de verificação mais importantes.

O comportamento observado sob condições testadas demonstra uma propriedade do sistema. Conclusões sobre compreensão, aprendizagem ou usabilidade exigem avaliação com pessoas e métodos adequados.

### Hipóteses e resultados empíricos

Proposições sobre aprendizagem, esforço percebido, retomada e trabalho autoral permanecem hipóteses até serem avaliadas. Ao apresentar um resultado empírico, a documentação informa população, tarefa, instrumentos, análise e limites de generalização. O [protocolo de avaliação](protocolo-avaliacao-artefato.md) organiza esse trabalho.

## Usar o vocabulário do produto

Um termo especializado aparece depois do conceito que ajuda a nomear. Um protocolo aberto que conecta assistentes a ferramentas, por exemplo, pode ser explicado primeiro por sua função e em seguida apresentado como **Model Context Protocol (MCP)**.

Identificadores literais de campos, contratos e ferramentas aparecem como código somente quando a grafia exata importa. Na explicação para pessoas, prefira os termos do produto em português.

Nomes de botões e áreas aparecem em **negrito** e devem coincidir com a interface. Termos internos de implementação só entram quando são necessários para explicar um contrato ou uma decisão técnica no documento apropriado.

## Escrever em português natural

O texto deve desenvolver ideias e relações, em vez de acumular inventários para aparentar completude.

Evite enumerações mecânicas quando um parágrafo explicativo comunica melhor, paralelismo repetitivo, séries de abstrações usadas como sujeito composto, anglicismos quando há termo corrente em português, negativas que apenas cercam uma afirmação simples, qualificadores vagos, metadiscurso sobre a própria escrita e travessão como recurso estilístico habitual.

Use listas quando elas realmente ajudam a comparar opções, orientar uma sequência de ações ou localizar itens de referência.

## Escrever exemplos e instruções úteis

Um exemplo precisa revelar a regra que pretende ensinar. Exemplos simples demais podem ocultar problemas de escala; casos muito particulares podem soar como restrição inexistente.

Instruções descrevem ações observáveis e resultados reconhecíveis. Mensagens para estudantes, autores, pesquisadores e administradores usam o vocabulário da atividade, sem expor detalhes internos do desenvolvimento.

## Preservar profundidade sem sobrecarregar a entrada

Simplificar a entrada não significa apagar conhecimento.

Um leitor interessado em engenharia deve encontrar documentação suficiente para compreender e reproduzir o sistema. Um pesquisador deve encontrar fundamentos, métodos, métricas, limitações e referências. Um autor deve conseguir compreender o desenho instrucional e os parâmetros. Um estudante deve conseguir usar o produto sem conhecer nenhuma dessas camadas antes de precisar delas.

A documentação organiza essa profundidade por progressão e links claros.

## Revisar clareza e precisão

A verificação automática encontra links quebrados, problemas de títulos, documentos ausentes, divergências bibliográficas e algumas formas de bastidor. Ela complementa a leitura crítica.

Antes da publicação, revise também:

- progressão das ideias;
- naturalidade do português;
- coerência entre documentos;
- correspondência entre nomes da interface e documentação;
- ausência de cronologia de implementação em textos correntes;
- separação entre uso, fundamento e mecanismo técnico;
- suficiência da explicação para um leitor leigo;
- profundidade dos documentos técnicos e acadêmicos;
- qualidade e pertinência das fontes citadas;
- presença da bibliografia local ao fim das páginas de aprofundamento;
- distinção entre hipótese, implementação e evidência empírica.

Uma documentação que passa nos auditores automáticos mas continua difícil de compreender ainda precisa ser reescrita.
