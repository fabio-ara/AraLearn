# Auditoria semântica dos cards

Esta auditoria ocorre depois da releitura da entrega persistida. Ela não substitui o contrato, a validação de fontes ou a continuidade causal: verifica se o conteúdo que já passou por esses limites continua ensinável, compreensível e correto para a pessoa que o verá no celular.

O Auditor não aprova por aparência de JSON válido. Para cada card, percorre os testes abaixo e registra um achado em `findings` sempre que um teste falhar. Um achado local e verificável pede `repair`; um defeito que exige alterar objetivo, fonte, dependência, operação, recurso permitido ou plano de cards pede `rebuild` ou `blocked`.

## 1. Leitura pelo estudante

- O título, o enunciado e a representação deixam claro qual conceito, objeto ou ação está em foco. Pronomes, elipses e expressões como “este”, “aquele”, “o anterior”, “desse tipo” ou “a figura” só podem ser usados quando o antecedente estiver visível no mesmo card e não houver ambiguidade.
- O conteúdo destinado ao estudante fala do assunto, caso ou ação. Não há texto de bastidor: não mencione planejamento, parte, card, geração, auditoria, modelo, API, instruções, fonte consultada, busca externa ou limitação do processo de autoria. A única exceção é quando a própria referência, citação ou método de pesquisa é o objeto explícito de estudo.
- Cada frase tem função didática identificável: apresentar condição, explicar uma relação, orientar uma decisão ou esclarecer o erro provável. Remova metacomentários, promessas sobre o texto, enumerações decorativas e detalhes que não alteram a decisão.
- Revise concordância, regência, pontuação, variante de idioma e referência entre substantivo, pronome, número e gênero. Quando a formulação permitir duas leituras, reescreva-a; não aceite a frase apenas porque parece gramaticalmente possível.

## 0. Cobertura antes da construção

Esta verificação ocorre antes de `setPlan`, não apenas depois que os cards existem.

- Percorra cada item substantivo da ementa, do objetivo e das fontes. Relacione-o a conceito, operação, equívoco ou resultado do plano e ao segmento causal que o ensinará. Um título amplo ou uma lista de palavras não substitui esse vínculo.
- Verifique se pré-requisitos, explicação inicial, exemplo, prática guiada, prática com menor apoio, erro provável e retomada são proporcionais ao que a pessoa precisa decidir. Itens factuais indivisíveis podem exigir percurso menor, desde que a evidência e a recuperação continuem observáveis.
- Recuse um plano que una, apenas para economizar extensão, ferramentas, relações ou procedimentos que exigem explicações e práticas independentes. Também recuse repetição decorativa que não introduz nova decisão, variação ou retomada.
- O número de lições, microssequências, cards e práticas é consequência desta análise. Não aplique uma quantidade fixa por disciplina, mas não aceite um dimensionamento sem mapa de cobertura e justificativa didática.

## 2. Autossuficiência e carga cognitiva

- Uma prática mede uma decisão principal. Ela pode mobilizar pré-requisitos já ensinados, mas contém no próprio card o caso particular: valores, unidades, tabela, código, rótulos, alternativas, condição inicial, exceção e convenção necessários para responder.
- Dados visuais não podem existir apenas na posição, na cor, no destaque, em um card anterior, no feedback ou na resposta oculta. O estudante precisa conseguir identificar o que é solicitado antes de interagir.
- Um termo técnico, símbolo, sigla, convenção, papel, unidade ou relação nova recebe explicação suficiente antes de ser exigido. Não use uma palavra mais avançada para explicar outra sem introduzi-la ou registrá-la como pré-requisito.
- Divida uma representação quando ela exigir simultaneamente comparação, cálculo, leitura de várias relações independentes e memorização de legenda extensa. Simplificar não significa omitir a condição que decide a resposta.

## 3. Coerência entre operação, recurso e lacuna

- O recurso preserva o objeto mental da tarefa. Código conserva sintaxe e ambiente; tabela conserva linhas, colunas e unidades; fluxo conserva condições e ramos; árvore conserva hierarquia; grafo conserva entidades e relações; mapa de relações conserva pares; matriz preserva posição; plano preserva coordenadas; fórmula preserva expressão e notação.
- A lacuna fica dentro desse objeto e cobra a operação planejada. Ela não vira uma pergunta textual sobre um diagrama, uma tabela ou um código que deveria permanecer manipulável.
- A resposta não pode estar repetida no título, enunciado, rótulo visível, outra opção, feedback antecipado ou parte exposta da mesma estrutura. Distratores representam interpretações, procedimentos ou relações plausíveis, não frases absurdas.
- O feedback explica a condição decisiva, a regra ou a relação estrutural. Não se limita a anunciar acerto, repetir a alternativa ou introduzir informação indispensável que faltava antes da resposta.

## 4. Representações estruturadas

Essas regras valem para qualquer recurso estruturado e também para blocos equivalentes dentro de `composite`.

- Dê nome visível e inequívoco a cada entidade que o estudante precisa distinguir. Identificadores internos nunca carregam significado pedagógico.
- Faça o enunciado declarar a tarefa de leitura: comparar, localizar, seguir, classificar, completar, calcular ou diagnosticar. “Observe” sozinho não define uma operação.
- Rótulos, legendas, unidades, direção, escala, ordem e destaques devem ser suficientes no próprio card. Não use a geometria como única explicação de uma relação conceitual.
- Um grafo precisa mostrar entidades estáveis em seus vértices e relações nomeáveis em suas arestas. Direção só é usada quando altera a interpretação. Componentes independentes precisam ser distinguidos pelo enunciado ou separados em cards; uma legenda não deve exigir que a pessoa adivinhe qual abreviação corresponde a qual papel.
- Para `flow`, cada ramo informa condição e consequência; para `tree`, cada ligação pai-filho tem leitura hierárquica; para `relation_map`, os dois conjuntos e a natureza do pareamento são explícitos; para `matrix`, `plane` e `formula`, unidades, eixos, ordem, notação e convenções necessárias aparecem antes da decisão.

## 5. Linguagem e destaque

- Use português direto e adequado ao público. Uma sigla pode aparecer depois da expansão ou quando estiver autorizada como pré-requisito; não use jargão para encobrir uma explicação ausente.
- Crases só representam código, comando, identificador, literal, sintaxe ou valor cuja forma exata importa para a tarefa. Não use crases como mero destaque de palavra comum, conceito pedagógico, frase natural ou nome de modalidade. Para ênfase conceitual, prefira redação clara; não dependa de aparência de código.
- Preserve literalidade quando ela importa, como comandos, nomes de campos, expressões, caminhos, mensagens e trechos de programa. Fora disso, prefira linguagem corrente e explique a função do termo técnico.
- Conteúdo multilíngue declara idioma e direção quando o contrato exigir. Não corrija variação linguística legítima como se fosse erro; corrija somente a formulação que prejudica compreensão, precisão ou adequação ao público.

## 6. Fontes, precisão e incerteza

- Cada afirmação ensinável precisa corresponder às fontes e claims autorizados. Datas, versões, jurisdição, unidade, condição de uso e estabilidade aparecem quando mudam a verdade ou a resposta.
- Não transforme uma fonte em autoridade decorativa nem leve a referência bibliográfica para o enunciado de uma prática comum. A proveniência pertence ao registro; o card explica o conteúdo. Quando avaliar a própria fonte for o objetivo, apresente-a como objeto didático completo.
- Diferencie fato, hipótese, modelo, exemplo, interpretação e recomendação. Não apresente inferência contestável como regra universal nem omita condição de validade para tornar o card mais curto.

## Decisão de auditoria

`approve` exige os dez gates verdadeiros e nenhum achado. Use `repair` quando o card puder ser corrigido sem mudar a especificação, por exemplo, ao completar contexto, esclarecer referente, ajustar linguagem, corrigir uma legenda ou mover uma lacuna para o campo apropriado. Use `rebuild` quando a forma atual não preserva a operação, a progressão, a fonte autorizada ou a representação planejada. Use `blocked` quando faltar fonte, definição de público, convenção indispensável ou decisão humana sobre escopo.

Os testes operacionalizam carga cognitiva, exemplos resolvidos, prática de recuperação, variação, feedback explicativo, representação múltipla e acessibilidade já referenciados em `core/quality.md`. Eles orientam julgamento pedagógico rigoroso, mas não prometem substituir revisão humana especializada em um domínio.
