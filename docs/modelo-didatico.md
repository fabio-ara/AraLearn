# Modelo didático

O modelo didático do AraLearn parte de uma decisão simples: o card é a unidade de interação, mas a microssequência é a unidade de estudo.

Um card isolado pode explicar uma ideia, fazer uma pergunta ou mostrar um exemplo. Isso é útil, mas normalmente não basta para produzir progressão. O estudante precisa de uma pequena sequência: preparação, explicação, exemplo, prática, revisão e ponte para o próximo passo.

É por isso que o AraLearn organiza cards em microssequências.

## Card e microssequência

No AraLearn, um card é um bloco estudável. Ele pode conter texto, tabela, código, grafo, fluxograma, árvore ou lacunas. O card é o que o estudante vê e executa no momento do estudo.

A microssequência é maior que um card e menor que uma lição. Ela deve responder a uma pergunta:

```text
Que avanço pequeno e verificável o estudante deve conseguir fazer depois desta etapa?
```

Uma boa microssequência não é um resumo. Ela é uma pequena situação de aprendizagem.

## Funções possíveis

Uma microssequência pode servir para:

- introduzir um conceito;
- explicar um procedimento;
- demonstrar um exemplo;
- propor prática guiada;
- diferenciar ideias parecidas;
- diagnosticar erro comum;
- revisar uma lacuna;
- criar uma ponte para a próxima etapa;
- ampliar uma prática que ainda não ficou suficiente;
- corrigir cards já produzidos.

A função vem antes do formato. O app não deve escolher um recurso porque ele parece mais rico visualmente. Deve escolher porque aquele recurso aproxima o estudo da prática esperada.

## Teoria e prática

O AraLearn evita separar teoria e prática como se fossem partes independentes. Uma microssequência adequada aproxima explicação e ação.

Um padrão comum é:

1. apresentar a ideia ou regra;
2. mostrar um exemplo pequeno;
3. pedir uma prática controlada;
4. apontar um erro provável;
5. preparar a próxima etapa.

Nem toda microssequência precisa seguir essa ordem. O ponto é que o estudante não deve receber apenas exposição nem ser cobrado sem preparação.

## Cobertura sem resumo raso

O AraLearn não trata conteúdo pequeno como conteúdo superficial. O objetivo é cobrir o assunto por decomposição, não por compressão.

Em vez de pedir que a IA resuma uma lição inteira em poucos cards, o app prefere:

- dividir o conteúdo em etapas menores;
- materializar somente a etapa aberta;
- permitir continuação na mesma microssequência;
- criar microssequência adicional quando há lacuna;
- corrigir cards existentes;
- seguir a trilha planejada quando a etapa está suficiente.

Isso é importante para estudantes que precisam de desempenho real em prova, exercício ou aplicação profissional. Resumo pode dar sensação de avanço, mas prática revela lacunas.

## As quatro ações locais do bottom-up

A documentação técnica chama a materialização local de `bottom-up`. Em linguagem comum, isso quer dizer: o usuário está dentro de uma microssequência e decide o que precisa fazer agora.

O fluxo local privilegia quatro ações:

1. **Criar cards da próxima microssequência planejada**: segue a trilha definida no planejamento geral.
2. **Criar mais cards na microssequência atual**: aprofunda ou continua a etapa sem abrir novo escopo.
3. **Criar uma microssequência adicional**: abre uma etapa de apoio quando aparece uma lacuna local.
4. **Corrigir os cards da microssequência atual**: repara explicações, práticas, erros ou inadequações.

Três dessas ações são abertas e dependem da necessidade do usuário no momento do estudo. A quarta segue a trilha previamente planejada. Isso torna o fluxo semiaberto: há estrutura, mas o usuário não fica preso ao plano inicial.

## Draft didático e compilação final

No fluxo com IA, o AraLearn pode dividir a geração em duas fases:

1. **draft didático**: a IA propõe a função das etapas, os recursos adequados, os objetivos e as evidências esperadas;
2. **compilação dos cards**: a IA transforma esse plano local em JSON final de cards.

Essa separação existe por uma razão técnica e didática. A primeira fase decide a progressão. A segunda precisa obedecer ao contrato. Misturar tudo em uma resposta única aumenta o risco de produzir cards bonitos, mas didaticamente fracos, ou JSON rico, mas inválido.

Quando o draft falha ou vem incompleto, o runtime pode usar um plano determinístico de cards como fallback. Isso reduz dependência total do modelo.

## Recursos renderizáveis

O contrato público do AraLearn aceita recursos simples:

- `say`: explicação textual, enunciado, síntese ou orientação;
- `table`: tabela, matriz, comparação, tabela-verdade ou procedimento tabular;
- `code`: código, shell, pseudocódigo, configuração ou exemplo técnico;
- `flow`: fluxo de decisão, processo ou sequência operacional;
- `tree`: hierarquia, diretório, classificação ou estrutura aninhada;
- `graph`: relação entre vértices, arestas, pesos e conexões;
- `block_gap_fill`: parágrafo com lacunas, opções e feedback.

Esses recursos são primitivas simples. Elas podem ser escritas por humanos ou geradas com auxílio de IA. O importante é que tenham função didática clara.

## Carga didática

Uma microssequência deve controlar a carga didática. Carga didática alta demais aparece quando:

- um card tenta explicar muitos conceitos;
- uma prática exige conhecimento não preparado;
- uma tabela concentra informação demais;
- um código aparece sem contexto;
- uma lacuna cobra detalhe irrelevante;
- a IA tenta encerrar um assunto amplo sem continuação.

O AraLearn prefere decompor. Uma etapa pequena pode ser profunda se estiver bem encadeada.

## Progressão

Uma trilha didática deve reduzir pressupostos ocultos. O estudante não deve ser cobrado por algo que ainda não foi preparado pela lição, pela microssequência anterior ou pelo próprio card.

A progressão pode aparecer em:

- ordem das microssequências;
- dependências entre etapas;
- termos de escopo do módulo;
- objetivo da lição;
- exemplos escolhidos;
- práticas graduadas;
- feedback de erro;
- continuação recomendada.

## Suficiência didática

Uma microssequência está suficientemente materializada quando o usuário consegue:

- reconhecer o foco da etapa;
- entender o conceito ou procedimento principal;
- praticar algo diretamente ligado ao foco;
- receber contraste ou feedback quando erra;
- perceber por que pode avançar;
- revisar a etapa depois sem depender da conversa original com a IA.

Se isso não ocorre, a etapa deve ser revisada, complementada ou substituída por outra versão.

## Relação com o estudante-trabalhador

O modelo didático considera um usuário com pouco tempo, cansaço, interrupções e atenção fragmentada. Por isso, cada microssequência deve ser legível e executável em uma sessão curta.

Isso não significa empobrecer o conteúdo. Significa criar uma unidade que possa ser retomada. O estudante deve conseguir abrir o app, entender onde está, estudar um pequeno bloco e sair sem perder a trilha.

## Critério de qualidade

Uma microssequência está bem desenhada quando deixa claro:

- o que ensina ou treina;
- que parte da lição cobre;
- que prática exige;
- que erro previne;
- que recurso usa e por quê;
- que evidência mostra avanço;
- por que vem antes da próxima etapa.

O critério central não é número fixo de cards nem tamanho textual. O critério é suficiência didática com baixa fricção.
