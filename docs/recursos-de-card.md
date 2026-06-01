# Recursos de card

No AraLearn, a forma do card faz parte do conteúdo. Este documento descreve os recursos aceitos pelo contrato público, a tarefa didática que cada um sustenta e os dados que o app precisa receber para renderizá-los. A especificação JSON completa do documento persistido está em [Contrato público](aralearn-contract.md).

Todo card combina três decisões:

- `resource`: forma material do card;
- `kind`: teoria ou exercício;
- `exercise`: modo de resposta, quando houver.

Exemplo mínimo:

```json
{
  "position": 1,
  "resource": "paragraph",
  "kind": "theory",
  "exercise": "none",
  "title": "Ideia central",
  "text": "...",
  "after": "..."
}
```

## `paragraph`

`paragraph` é o recurso textual básico. Serve para explicação, síntese local, transição e exercício com lacuna.

### Uso teórico

Adequado para:

- abrir uma microssequência;
- definir regra local;
- distinguir dois casos;
- preparar o estudante para um exercício;
- fechar uma etapa sem abrir outro tópico.

### Uso com lacuna

Quando `paragraph` entra como exercício, o modo aceito é `gap`, com sintaxe:

```text
[[resposta correta::opção correta|distrator 1|distrator 2]]
```

Esse formato é útil quando a tarefa exige completar uma regra ou reconhecer uma formulação precisa sem recorrer a digitação extensa.

## `choice`

`choice` representa decisão objetiva com alternativas.

Adequado para:

- diferenciar erro plausível;
- verificar reconhecimento;
- comparar alternativas próximas;
- retomar uma regra depois de um exemplo.

Regras:

- deve ter 3 ou 4 alternativas;
- `answer` precisa apontar para um `id` existente;
- os distratores devem ser plausíveis dentro do conteúdo, não absurdos.

## `code`

`code` apresenta comando, trecho de programa, pseudocódigo ou configuração textual sensível a sintaxe.

Adequado para:

- explicar comando de terminal;
- mostrar trecho em C, Python, SQL, shell ou pseudocódigo;
- comparar sintaxe correta e erro frequente;
- treinar leitura de código em contexto curto.

## `table`

`table` organiza informação em linhas e colunas.

Adequado para:

- tabela-verdade;
- comparação entre casos;
- critérios de classificação;
- dados que precisam manter alinhamento visual.

## `matrix`

`matrix` representa matrizes, linhas, colunas, posições e sequências matriciais.

Adequado para:

- localizar valores por linha e coluna;
- trabalhar matriz 2x2, 3x3 ou retangular pequena;
- manter a forma matricial quando ela faz parte do problema;
- apoiar exercícios de leitura, soma simples ou rastreamento de posição.

Regra principal: use `matrix` quando transformar a matriz em texto faria o estudante perder a forma espacial relevante.

## `plane`

`plane` representa ponto, vetor, deslocamento, soma vetorial, escala e distância no plano cartesiano.

Adequado para:

- ler coordenadas;
- reconhecer vetor 2D;
- praticar soma vetorial;
- trabalhar interpretação espacial em casos pequenos.

## `graph`

`graph` representa vértices e arestas. O contrato prioriza a estrutura; a geometria é resolvida pelo motor do app.

Adequado para:

- adjacência;
- caminho;
- ciclo;
- grau;
- componente;
- leitura estrutural de grafos em geral.

Essa separação entre estrutura persistida e geometria local existe para evitar dependência excessiva de coordenadas produzidas pelo serviço textual.

## `relation_map`

`relation_map` representa dois conjuntos e as relações entre seus elementos.

Adequado para:

- pares ordenados;
- relações entre conjuntos;
- preparação para grafo bipartido;
- comparação entre lista de pares, diagrama e tabela de relação.

O contrato explicita conjuntos e relações; o motor do app calcula a disposição visual.

## `flow`

`flow` representa processo, sequência e decisão por meio de estrutura semântica.

Adequado para:

- algoritmo em fluxograma;
- procedimento administrativo;
- decisão condicional;
- decomposição de processo.

Regras importantes:

- `flow` persiste `structure`, não uma geometria pronta;
- a raiz deve ser `kind: "sequence"`;
- o motor do app deriva nós, ramos, portas e layout a partir dessa estrutura.

## `tree`

`tree` representa hierarquia.

Adequado para:

- pastas e arquivos;
- organogramas simples;
- dependência hierárquica;
- classificação em níveis.

## Como escolher o recurso

O recurso deve ser escolhido pela natureza da tarefa didática, não pela familiaridade de quem escreve o card.

Critérios práticos:

- regra, transição ou síntese curta: `paragraph`;
- decisão objetiva: `choice`;
- sintaxe e comando: `code`;
- comparação tabular: `table`;
- forma matricial: `matrix`;
- relação espacial no plano: `plane`;
- relação entre vértices e arestas: `graph`;
- relação entre dois conjuntos: `relation_map`;
- processo com ordem e decisão: `flow`;
- hierarquia: `tree`.

## Relação com a geração estruturada

No runtime atual, o serviço textual não escreve diretamente o card público completo em todos os detalhes. Ele escolhe o recurso e preenche os campos do template ativo. Depois disso, o app recompila, valida e persiste o resultado final.

Essa escolha reduz erro de forma e permite verificações adicionais, por exemplo:

- derivar resposta correta em exercícios matriciais de localização;
- verificar unicidade da alternativa correta em exercícios de caminho em grafos;
- rejeitar material estruturalmente insuficiente para o recurso escolhido.
