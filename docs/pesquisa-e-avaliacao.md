# Pesquisa e avaliação

O AraLearn pode ser investigado como produto educacional, como arquitetura sociotécnica e como hipótese sobre o modo como sujeitos aprendem em meio a excesso de informação. Isso já desloca o foco da pergunta tradicional “a IA acerta?” para uma pergunta mais interessante: que tipo de infraestrutura ajuda a transformar informação disponível em percurso estudável, revisável e retomável?

## Objeto de pesquisa

O objeto não é apenas a geração automática de conteúdo. O objeto é o ciclo completo:

```text
material disponível
  -> organização
  -> transformação didática
  -> prática ativa
  -> revisão
  -> edição
  -> retomada
  -> consolidação local
```

É por isso que o AraLearn interessa não só para informática na educação, mas também para design instrucional, interação humano-computador, organização do conhecimento, linguística aplicada, filosofia da tecnologia e estudos sobre software local-first.

## Hipótese central

A hipótese central do projeto é que microunidades didáticas organizadas em estrutura explícita podem reduzir atrito no estudo autodirigido, sobretudo em condições de atenção fragmentada. Essa redução de atrito não depende apenas da brevidade. Depende de progressão, prática, revisão, preservação de contexto e possibilidade de reorganização.

## Perguntas de pesquisa

Há várias perguntas plausíveis para investigação.

No plano didático:

- microunidades organizadas como microssequências melhoram retenção e retomada em comparação com explicação livre ou resumo?
- qual é a relação entre caso guiado, prática apoiada e prática mais autônoma em cada domínio?
- em que medida contexto local integrado reduz carga extrínseca percebida e melhora desempenho?

No plano da geração assistida:

- a restrição arquitetural da tarefa melhora a qualidade final em comparação com geração mais aberta?
- a iteração automática reduz retrabalho editorial ou apenas o desloca?
- o uso de modelos leves, sob contratos fechados, produz material suficientemente útil para revisão humana?

No plano da experiência:

- a organização estrutural reduz a sensação de desorientação diante de muitos materiais?
- a curva de uso do app é de fato baixa para estudantes trabalhadores?
- o ambiente integrado de estudo, edição e revisão favorece continuidade?

No plano ético e político:

- como registrar progresso e revisão sem transformar o estudante em mero fornecedor de dados?
- como preservar autonomia editorial quando a IA participa da escrita do material?

## Métricas possíveis

As métricas precisam acompanhar essa variedade de perguntas. Medidas puramente quantitativas, como número de itens gerados, são insuficientes.

No plano de uso:

- tempo até iniciar prática depois de abrir uma lição;
- número de retornos à mesma microssequência;
- frequência de retomada depois de interrupção;
- proporção entre rascunhos criados e rascunhos consolidados.

No plano didático:

- acerto em atividades de prática;
- reincidência de erro;
- necessidade de ver resposta;
- cobertura de capacidades sem prática ausente;
- diversidade de prática por capacidade;
- incidência de expansão por lacuna real e de rejeição por redundância.

No plano editorial:

- proporção entre iterações aceitas e excluídas;
- número médio de correções humanas após geração;
- tipos de modificação mais frequentes;
- divergência entre o plano produzido e o plano desejado pelo usuário.

No plano subjetivo:

- percepção de clareza;
- percepção de carga de uso;
- confiança na organização do material;
- sensação de continuidade entre dúvida, geração e estudo.

## Desenhos de estudo

O AraLearn comporta tanto estudos pequenos quanto investigações comparativas mais ambiciosas. Faz sentido pensar em:

- pilotos com poucos usuários e observação qualitativa;
- comparação entre leitura livre e estudo por microssequência;
- comparação entre material manual e material gerado com revisão;
- estudo de caso com estudantes trabalhadores;
- análise de logs locais anonimizados, quando eticamente viável;
- avaliação por disciplina, já que o equilíbrio entre texto, visualização e prática tende a variar fortemente por domínio.

## O que não deve ser alegado sem cuidado

O projeto precisa evitar dois excessos. O primeiro é apresentar toda decisão do produto como se fosse dedução direta da literatura. O segundo é descrever escolhas locais como se fossem apenas preferência idiossincrática sem interesse teórico.

O caminho mais responsável é outro: reconhecer que algumas direções são fortemente apoiadas por literatura; reconhecer que várias decisões do produto são soluções arquiteturais e didáticas tomadas para responder a um problema real; e reconhecer que certos efeitos ainda precisam de avaliação situada no próprio AraLearn.

## Um critério de honestidade acadêmica

Uma avaliação séria do AraLearn não deveria perguntar apenas “funciona?”, mas “funciona para quê, para quem, em que condições e com que custo?”. Essa é uma pergunta melhor porque impede que o produto seja julgado por métricas fáceis, porém pobres. O objetivo do app não é maximizar geração. É reduzir atrito entre informação abundante e aprendizagem praticável.
