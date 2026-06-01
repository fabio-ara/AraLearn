# Modelo didático

O modelo didático do AraLearn parte de uma ideia simples: aprender exige mais do que exposição a conteúdo. É preciso situar o que está sendo estudado, variar casos, pedir recuperação ativa, corrigir erro plausível e manter continuidade entre uma etapa e outra. As referências citadas neste documento aparecem de forma completa em [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md#referências-bibliográficas).

## A unidade central: a microssequência

A microssequência é a unidade básica de progressão do AraLearn. Ela foi escolhida porque resolve um problema de escala.

- O card sozinho pode ficar solto demais.
- A lição inteira pode ser grande demais para uma sessão curta.
- O curso completo é amplo demais para resolver uma dúvida local.

A microssequência ocupa o meio do caminho. Ela permite trabalhar um ponto delimitado sem perder a ligação com a trilha.

Uma microssequência possui:

- título;
- objetivo;
- papel na trilha;
- dependências;
- tópicos cobertos;
- critérios de verificação;
- versões de cards.

Ela pode servir para explicar uma regra, praticar uma operação, corrigir um erro recorrente, revisar um ponto anterior ou preparar a próxima etapa.

## O papel dos cards

Os cards existem como peças de uma microssequência, não como fragmentos autônomos sem lugar definido. Cada posição costuma cumprir uma função como:

- `explain`
- `example`
- `practice`
- `practice_more`
- `fix_error`
- `review`
- `next`

Isso permite que a geração e a revisão considerem não apenas o conteúdo do card, mas a tarefa didática que ele precisa cumprir naquele ponto.

## Explicação e prática no mesmo percurso

O AraLearn evita separar radicalmente teoria e prática. A justificativa não é apenas intuitiva; ela se apoia em evidências de que recuperação ativa e prática de teste são decisivas para consolidação de aprendizagem (KARPICKE; ROEDIGER III, 2008).

Por isso, o padrão desejado de uma microssequência é:

1. situar a ideia local;
2. mostrar um caso suficiente;
3. pedir uma primeira decisão ou aplicação;
4. variar o caso quando necessário;
5. corrigir erro provável ou preparar continuidade.

Nem toda microssequência precisa conter todos esses movimentos, mas o desenho do produto parte da ideia de que ver uma explicação não basta.

## Dificuldade útil, não atrito gratuito

O app também dialoga com a noção de dificuldades desejáveis, proposta por Robert A. Bjork e Elizabeth L. Bjork (BJORK; BJORK, 2011). O objetivo não é tornar o estudo artificialmente difícil. O objetivo é evitar facilidades enganosas:

- pergunta cuja resposta já está exposta no enunciado;
- exercício sem variação de caso;
- sequência longa de leitura passiva;
- prática que não exige decisão real.

Em outras palavras, o produto tenta reduzir conforto ilusório sem aumentar atrito desnecessário.

## Progressão e carga cognitiva

Em muitos temas, especialmente quando há notação, procedimento ou formalismo, exigir autonomia plena cedo demais aumenta sobrecarga. Nesse ponto, o desenho do AraLearn conversa com a teoria da carga cognitiva associada a John Sweller (SWELLER, 1988).

Isso se traduz em escolhas de produto:

- a trilha é decomposta em etapas pequenas;
- a prática aparece depois de um recorte local suficientemente situado;
- o app favorece exemplos e representações adequadas antes de exigir variação mais ampla;
- a revisão por versão permite ajustar uma etapa sem reescrever todo o percurso.

## Representação adequada ao conteúdo

Nem todo conteúdo deve virar parágrafo. O AraLearn aceita recursos como `matrix`, `plane`, `graph`, `relation_map`, `flow` e `tree` porque a forma também ensina.

Essa escolha conversa com a literatura de aprendizagem multimídia associada a Richard E. Mayer (MAYER, 2009): palavras e representações podem melhorar a compreensão quando preservam a estrutura que o estudante precisa reconhecer. O critério do AraLearn, porém, é estrito: representação não entra para ornamentar o card; ela entra quando a tarefa didática depende dela.

Exemplos:

- matriz deve aparecer como matriz quando linha, coluna ou posição importam;
- vetor deve aparecer no plano quando a relação espacial importa;
- grafo deve aparecer como conjunto de vértices e arestas quando a leitura estrutural faz parte do problema;
- fluxograma deve aparecer como sequência e decisão quando a ordem operacional importa.

## Mediação, suporte e autonomia

O modelo didático do AraLearn também dialoga com tradições que pensam aprendizagem como processo mediado. Vygotsky ajuda a formular que o desempenho depende de instrumentos e mediações, não apenas de uma competência interna fixa (VYGOTSKY, 1978). Bruner ajuda a pensar suporte gradual, retirada de apoio e progressão por andaimes locais (BRUNER, 1978).

No produto, isso aparece em três níveis:

- a microssequência delimita o apoio;
- a trilha explicita ordem e dependência;
- a revisão por versão permite ajustar o suporte sem apagar o percurso.

Paulo Freire entra aqui por outra razão. Em *Pedagogia da autonomia*, autonomia não é abandono do estudante; é apropriação crítica do processo de aprender e recusa da relação puramente bancária com o saber (FREIRE, 1996). O AraLearn não pretende resolver sozinho esse problema, mas tenta preservar condições mínimas para isso: o usuário vê a estrutura, pode reescrever o percurso, recusar material ruim e manter o comando sobre o próprio projeto.

## Prática fechada e uso móvel

O app privilegia prática fechada porque o uso principal é móvel, intermitente e frequentemente feito em contexto de pouca energia disponível. Exercícios abertos podem ser valiosos em outros ambientes, mas no AraLearn eles costumam gerar fricção operacional maior do que ganho didático.

Por isso:

- `paragraph` de exercício usa lacuna por opções;
- `choice` trabalha decisão objetiva;
- recursos contextuais como `matrix`, `graph`, `plane`, `flow` e `relation_map` recorrem a perguntas fechadas quando entram como exercício;
- o contexto necessário deve estar materializado no próprio card.

## O erro como objeto de aprendizagem

O produto não trata erro apenas como falha a eliminar. Erros plausíveis podem ser matéria de ensino. Por isso existem papéis como `fix_error` e campos como `errors` em `topic`.

Essa escolha evita dois desvios:

- formular distratores absurdos, que nada ensinam;
- corrigir um erro que o percurso nunca tornou plausível.

O erro útil no AraLearn é aquele que ajuda o estudante a distinguir melhor o conceito ou procedimento em jogo.

## Continuidade e retomada

Uma microssequência não é uma ilha. Ela pode depender de outra (`dependsOn`), preparar a próxima e receber uma etapa de apoio quando surgir lacuna local. Essa continuidade é parte do modelo didático: o usuário não precisa abandonar o curso inteiro para resolver uma dificuldade pontual, nem resolver toda a disciplina antes de começar a praticar.

## Perfis didáticos

Os perfis didáticos do app não mudam a estrutura principal; eles mudam a ênfase da decomposição.

- **Disciplina acadêmica introdutória**: progressão sem pressupostos ocultos, notação explícita, exemplos resolvidos e prática frequente.
- **Estudante-trabalhador**: baixa fricção, retomada rápida, etapas manejáveis e persistência local.
- **Prova e concurso**: atenção a tipos de questão, erros recorrentes, variação controlada e revisão cumulativa.
- **Documentação técnica**: foco em pré-requisitos, comando, arquivo, efeito esperado e erro frequente.
- **Artigo acadêmico**: foco em tese, conceito, argumento, método e relação entre posições.
- **Língua estrangeira**: foco em padrão, contraste, reconhecimento e produção controlada.
- **Treinamento interno**: foco em fluxo operacional, decisão correta e padronização revisável.

## O lugar do professor e do usuário

O AraLearn não substitui aula, professor, bibliografia nem discussão crítica. Ele oferece uma forma de organizar estudo e autoria assistida.

Em termos didáticos, a regra de governança é simples:

- o serviço textual sugere;
- o sistema delimita e valida;
- o usuário mantém a autoria final.
