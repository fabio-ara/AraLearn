# Auditoria semântica independente

Esta auditoria ocorre somente após autorização. Grave um mandato `audit` com
identificador novo e, quando o recorte for uma Parte, seu `targetPartId`;
retome o workspace, consulte comentários e notas pertinentes e releia o
conteúdo persistido. Use `list_comments` e `list_observations` com
`kinds: ["note"]` para esse contexto; achados usam
`kinds: ["audit_finding"]`. Abra `run_audit` com `kind: audit` antes do
julgamento semântico: ele fixa a
revisão auditada, executa os checks determinísticos e devolve findings
paginados. Use `record_semantic_audit` no mesmo audit run somente depois de
ler análise, snapshot, ResourceSets, blueprint, manifesto, cards, resources e
fontes pertinentes. Achados ativos já vêm em `resume`; quando
truncados, percorra a paginação. Ao concluir o relatório, limpe o mandato de
auditoria. Ela não
substitui o contrato, a validação de fontes ou a continuidade causal: verifica
se o conteúdo é ensinável, compreensível e tecnicamente sustentado para a
pessoa que o verá no celular.

Não aprove pela aparência de JSON válido ou pela aceitação do manifesto e não
repare durante a auditoria.
Percorra os critérios abaixo, registre achados legíveis e preserve o conteúdo
e a estrutura do workspace. Mandato e achados compactos são as únicas escritas
desta rodada. As observações não viram propriedades adicionais no card ou na
microssequência. Reparos autorizados e reauditoria pertencem a rodadas
posteriores, conforme `core/editorial-cycle.md`.

## 1. Leitura pelo estudante

- O título, o enunciado e a representação deixam claro qual conceito, objeto ou ação está em foco. Pronomes, elipses e expressões como “este”, “aquele”, “o anterior”, “desse tipo” ou “a figura” só podem ser usados quando o antecedente estiver visível no mesmo card e não houver ambiguidade.
- O conteúdo destinado ao estudante fala do assunto, caso ou ação. Não há texto de bastidor: sinalize formulações como “no exercício 2”, “na questão anterior”, “como vimos no card anterior”, “de acordo com o PDF”, “segundo a fonte enviada”, “nesta parte do curso”, “a IA gerou” ou “durante a auditoria”, além de IDs, nomes de arquivo, caminhos, API, MCP e instruções de autoria. A única exceção é quando a própria referência, citação ou método de pesquisa é o objeto explícito de estudo.
- Cada frase tem função didática identificável: apresentar condição, explicar uma relação, orientar uma decisão ou esclarecer o erro provável. Remova metacomentários, promessas sobre o texto, enumerações decorativas e detalhes que não alteram a decisão.
- Revise concordância, regência, pontuação, variante de idioma e referência entre substantivo, pronome, número e gênero. Quando a formulação permitir duas leituras, reescreva-a; não aceite a frase apenas porque parece gramaticalmente possível.

## 2. Cobertura antes da construção

Esta verificação ocorre antes de construir os cards e volta a ser aplicada à
sequência pronta.

- Percorra cada item substantivo da ementa, do objetivo e das fontes.
  Relacione-o a `lesson.topics`, `microsequence.covers`,
  `microsequence.checks`, `microsequence.errors` e ao segmento causal que o
  ensinará. Um título amplo ou uma lista de palavras não substitui esse vínculo.
- Verifique se pré-requisitos, explicação inicial, exemplo, prática guiada, prática com menor apoio, erro provável e retomada são proporcionais ao que a pessoa precisa decidir. Itens factuais indivisíveis podem exigir percurso menor, desde que a evidência e a recuperação continuem observáveis.
- Recuse uma estrutura que una, apenas para economizar extensão, ferramentas,
  relações ou procedimentos que exigem explicações e práticas independentes.
  Também recuse repetição decorativa que não introduz nova decisão, variação ou
  retomada.
- O número de lições, microssequências, cards e práticas é consequência desta análise. Não aplique uma quantidade fixa por disciplina, mas não aceite um dimensionamento sem mapa de cobertura e justificativa didática.

## 3. Autossuficiência e carga cognitiva

- Uma prática mede uma decisão principal. Ela pode mobilizar pré-requisitos já ensinados, mas contém no próprio card o caso particular: valores, unidades, tabela, código, rótulos, alternativas, condição inicial, exceção e convenção necessários para responder.
- Dados visuais não podem existir apenas na posição, na cor, no destaque, em um card anterior, no feedback ou na resposta oculta. O estudante precisa conseguir identificar o que é solicitado antes de interagir.
- Um termo técnico, símbolo, sigla, convenção, papel, unidade ou relação nova
  recebe explicação suficiente antes de ser exigido. Não use uma palavra mais
  avançada para explicar outra sem introduzi-la na mesma cadeia causal.
- Teoria não é resumo. Sinalize texto que empilhe termos, relações ou mecanismos
  novos antes de apresentar em linguagem comum a necessidade ou a situação que
  eles explicam. Na primeira ocorrência, procure uma explicação simples e, quando
  útil, um exemplo concreto antes da formulação técnica. Fidelidade à fonte não
  justifica reproduzir sua densidade.
- Recuse frase ou card que coordene conceitos novos independentes apenas para
  reduzir extensão. Recomende separação em mais cards ou microssequências e não
  trate a quantidade resultante como defeito. Se a ferramenta recusar o tamanho
  do payload, preserve a progressão e divida no menor limite causal, sem
  condensar ou omitir teoria.
- Divida uma representação quando ela exigir simultaneamente comparação, cálculo, leitura de várias relações independentes e memorização de legenda extensa. Simplificar não significa omitir a condição que decide a resposta.

## 4. Coerência entre operação, recurso e lacuna

- O recurso preserva o objeto mental da tarefa. Código conserva sintaxe e ambiente; tabela conserva linhas, colunas e unidades; fluxo conserva condições e ramos; árvore conserva hierarquia; grafo conserva entidades e relações; mapa de relações conserva pares; matriz preserva posição; plano preserva coordenadas; fórmula preserva expressão e notação.
- A lacuna fica dentro desse objeto e cobra a operação planejada. Ela não vira uma pergunta textual sobre um diagrama, uma tabela ou um código que deveria permanecer manipulável.
- A resposta não pode estar repetida no título, enunciado, rótulo visível, outra opção, feedback antecipado ou parte exposta da mesma estrutura. Distratores representam interpretações, procedimentos ou relações plausíveis, não frases absurdas.
- O feedback explica a condição decisiva, a regra ou a relação estrutural. Não se limita a anunciar acerto, repetir a alternativa ou introduzir informação indispensável que faltava antes da resposta.

## 5. Representações estruturadas

Essas regras valem para qualquer package estruturado e para composições com mais de uma instância em `content`.

- Dê nome visível e inequívoco a cada entidade que o estudante precisa distinguir. Identificadores internos nunca carregam significado pedagógico.
- Faça o enunciado declarar a tarefa de leitura: comparar, localizar, seguir, classificar, completar, calcular ou diagnosticar. “Observe” sozinho não define uma operação.
- Rótulos, legendas, unidades, direção, escala, ordem e destaques devem ser suficientes no próprio card. Não use a geometria como única explicação de uma relação conceitual.
- Um grafo precisa mostrar entidades estáveis em seus vértices e relações nomeáveis em suas arestas. Direção só é usada quando altera a interpretação. Componentes independentes precisam ser distinguidos pelo enunciado ou separados em cards; uma legenda não deve exigir que a pessoa adivinhe qual abreviação corresponde a qual papel.
- Para `flow`, cada ramo informa condição e consequência; para `tree`, cada ligação pai-filho tem leitura hierárquica; para `relation_map`, os dois conjuntos e a natureza do pareamento são explícitos; para `matrix`, `plane` e `formula`, unidades, eixos, ordem, notação e convenções necessárias aparecem antes da decisão.

## 6. Linguagem e destaque

- Use português direto e adequado ao público. Uma sigla pode aparecer depois da expansão ou quando estiver autorizada como pré-requisito; não use jargão para encobrir uma explicação ausente.
- Crases só representam código, comando, identificador, literal, sintaxe ou valor cuja forma exata importa para a tarefa. Não use crases como mero destaque de palavra comum, conceito pedagógico, frase natural ou nome de modalidade. Para ênfase conceitual, prefira redação clara; não dependa de aparência de código.
- Cada par de crases delimita uma unidade literal inteira, sem espaço interno nas bordas. Nunca destaque apenas o sufixo de uma expressão de várias palavras nem separe uma sigla de sua forma expandida. Nomes técnicos em prosa ficam sem crases; quando a notação autorizada exigir o nome literal completo, escreva `Transmission Control Protocol (TCP)`, nunca Transmission Control `Protocol (TCP)`.
- Preserve literalidade quando ela importa, como comandos, nomes de campos, expressões, caminhos, mensagens e trechos de programa. Fora disso, prefira linguagem corrente e explique a função do termo técnico.
- Conteúdo multilíngue declara idioma e direção quando o contrato exigir. Não corrija variação linguística legítima como se fosse erro; corrija somente a formulação que prejudica compreensão, precisão ou adequação ao público.

## 7. Fontes, precisão e incerteza

- Cada afirmação ensinável precisa corresponder às fontes autorizadas. Os IDs
  usados em `card.sources` vêm do contexto de autoria; datas, versões,
  jurisdição, unidade, condição de uso e estabilidade aparecem no conteúdo
  visível quando mudam a verdade ou a resposta.
- Não transforme uma fonte em autoridade decorativa nem leve a referência bibliográfica para o enunciado de uma prática comum. A proveniência pertence ao registro; o card explica o conteúdo. Quando avaliar a própria fonte for o objetivo, apresente-a como objeto didático completo.
- Diferencie fato, hipótese, modelo, exemplo, interpretação e recomendação. Não apresente inferência contestável como regra universal nem omita condição de validade para tornar o card mais curto.

## 8. Ancoragem das práticas

- Aplique a prioridade e as regras de adaptação de `core/sources.md`. Material
  fornecido pela pessoa e exercícios da mesma banca têm precedência quando
  forem pertinentes; depois vêm tarefas cognitivamente equivalentes, katas,
  documentação oficial e outras fontes confiáveis.
- Confirme que a prática preserva a operação-alvo da tarefa, oferece distratores
  plausíveis, possui resposta verificável e registra IDs autorizados em
  `sources`, sem copiar a questão nem mencionar seu bastidor para o estudante.
- Em concursos, compare tipo de decisão, extensão útil e padrão de distratores.
  Em programação e infraestrutura, confira ambiente, versão, segurança e
  verificabilidade do exemplo.
- Sinalize prática genérica ou decorativa que apenas complete quantidade e não
  se pareça com uma tarefa real da área.

## Relatório e transição

Separe **Aspectos adequados** de **Problemas encontrados**. Para cada problema,
informe localização legível, código, gravidade operacional, regra ou requisito,
evidência pública curta e reparo opcional. Não altere conteúdo. Registre com
`gerirDesenhoInstrucional`/`record_semantic_audit` somente o achado compacto e
estruturado
e seu alvo exato; a origem, a revisão e o audit run são fixados pelo servidor.
Não copie card, relatório, conversa, fonte integral nem raciocínio privado para
esse registro.

Quando não houver problema relevante, escreva: “Não foram encontrados problemas
semânticos relevantes segundo os critérios aplicados.” Isso não comprova a
eficácia do curso. Sugira exatamente uma próxima etapa: reparo, próxima parte
ou reavaliação humana, conforme o resultado, e espere a decisão.

`link_comment_correction` liga reparo a comentário de estudo;
`link_finding_correction` liga reparo ao achado formal desta auditoria. Não
intercambie essas operações.

No reparo posterior, retome o workspace, releia o mandato persistido e os alvos,
preserve IDs e posições e mude somente os achados aprovados. Depois informe o
que mudou, vincule a correção à observação correspondente apenas após sucesso e
declare o que permaneceu pendente, sem certificar o próprio reparo. A
reauditoria abre outro `run_audit` com `kind: reaudit`, volta a aplicar estes critérios ao estado
persistido corrente, registra seu resultado e procura regressões e problemas
novos. O relatório anterior é contexto, nunca conclusão reaproveitada.

Verifique todos os findings reparados elegíveis no recorte. Se o problema ainda
existir, envie `outcome: still_open` e registre a ocorrência correspondente em
`findings` na rodada corrente; se ela vier de uma Parte, pode estar no child run
exato congelado pelo pai. `outcome: resolved` exige que a mesma identidade não
reapareça. Não conclua uma reauditoria vazia enquanto houver reparo elegível sem
verificação.

Se houver interrupção entre alterações, a retomada informa o identificador e a
revisão da correção pendente mais recente. Releia o alvo antes de continuar ou
vincular; o estado pendente não significa que o achado já foi resolvido.

Os testes operacionalizam carga cognitiva, exemplos resolvidos, prática de recuperação, variação, feedback explicativo, representação múltipla e acessibilidade já referenciados em `core/quality.md`. Eles orientam julgamento pedagógico rigoroso, mas não prometem substituir revisão humana especializada em um domínio.
