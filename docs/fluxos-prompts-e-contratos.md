# Fluxos e contratos de geração

A assistência de linguagem trabalha por etapas. Primeiro organiza a intenção; depois planeja os cards; por fim, preenche os campos necessários. Cada etapa é conferida antes da seguinte. Assim, uma resposta não se transforma em curso por conta própria.

## Princípio

Cada chamada recebe uma tarefa, o idioma, o contexto, os recursos disponíveis, as regras e o formato esperado. O aplicativo compõe e valida a resposta em memória. A gravação remota acontece somente como uma nova revisão integral validada.

Esse arranjo evita três problemas frequentes:

- pedir ao modelo que planeje e escreva tudo de uma vez;
- aceitar JSON válido, mas incoerente com a trilha;
- perder controle sobre o conteúdo aplicado e a revisão humana.

## Fluxo 1: planejamento da estrutura

O planejamento da estrutura parte de um escopo. A pessoa autora informa curso pretendido, objetivo, conteúdos incluídos, conteúdos excluídos e observações.

Exemplo reduzido:

```json
{
  "schemaVersion": "aralearn.scope.v1",
  "course": {
    "title": "Lógica proposicional",
    "goal": "Estudar conectivos e tabelas-verdade."
  },
  "modules": [
    {
      "title": "Conectivos básicos",
      "include": ["conjunção", "disjunção", "negação"],
      "exclude": ["lógica de predicados"]
    }
  ]
}
```

O serviço recebe a tarefa de propor a estrutura do curso:

```json
{
  "task": "plan_course",
  "language": "pt-BR",
  "rules": [
    "Do not generate cards.",
    "Plan only modules, lessons and microsequences.",
    "Stay strictly inside scope.include.",
    "Use exclude only as a hard boundary."
  ]
}
```

A saída esperada é curso, módulos, lições e microssequências. Não há cards finais nesse momento.

## Conferência da estrutura

Antes de aceitar o resultado, o aplicativo verifica:

- se a resposta não trouxe cards;
- se módulos e lições possuem `guide`;
- se `include`, `exclude` e `covers` respeitam o escopo;
- se `dependsOn` aponta apenas para microssequências anteriores da mesma lição;
- se não há auto-dependência, referência inexistente, dependência futura ou ciclo.

O resultado é uma estrutura que pode ser revisada antes da criação dos cards.

## Fluxo 2: revisão de uma etapa

A revisão localizada começa em uma microssequência escolhida, com suas dependências, tópicos cobertos e cards existentes. O serviço recebe apenas o necessário para a intervenção; a segunda aba do card abre esse fluxo.

O fluxo pode atender quatro operações:

- gerar cards para a microssequência atual;
- corrigir os cards atuais;
- criar uma microssequência de apoio;
- gerar a próxima microssequência planejada.

## Etapa 1: plano da intervenção

A primeira etapa decide a intenção local: tipo de trabalho, tamanho relativo, objetivo, recursos adicionais e fontes.

Exemplo de saída:

```json
{
  "type": "concept",
  "size": "medium",
  "goal": "Explicar e praticar leitura de vetor 2D e matriz 2x2.",
  "extraResources": ["plane", "matrix"],
  "sources": [],
  "reason": "O objetivo exige representação visual do plano e da matriz."
}
```

Essa etapa evita que o modelo comece escrevendo todos os cards sem antes decidir a forma didática.

## Etapa 2: plano de cards

A segunda etapa escolhe, por posição, o recurso, o tipo de card e o modo de exercício.

```json
{
  "draft": [
    {
      "position": 1,
      "resource": "plane",
      "kind": "theory",
      "exercise": "none",
      "goal": "Apresentar leitura de vetor 2D."
    },
    {
      "position": 2,
      "resource": "plane",
      "kind": "exercise",
      "exercise": "choice",
      "goal": "Praticar reconhecimento de vetor no plano."
    }
  ]
}
```

O aplicativo verifica se os recursos pertencem ao conjunto permitido e se a combinação entre recurso, tipo e exercício é aceitável.

## Etapa 3: construção dos cards

A terceira etapa preenche os campos dos cards planejados.

```json
{
  "cards": [
    {
      "position": 1,
      "resource": "plane",
      "kind": "theory",
      "exercise": "none",
      "title": "Vetor no plano",
      "prompt": "Observe o vetor saindo da origem.",
      "vector": [2, 1],
      "after": "O primeiro valor indica deslocamento horizontal; o segundo indica deslocamento vertical."
    },
    {
      "position": 2,
      "resource": "plane",
      "kind": "exercise",
      "exercise": "choice",
      "title": "Identifique o vetor",
      "prompt": "Observe o vetor saindo da origem.",
      "vector": [3, -1],
      "question": "Qual vetor está representado?",
      "selectionMode": "single",
      "selectionCriterion": "correct",
      "options": [
        { "id": "a", "text": "(3, -1)" },
        { "id": "b", "text": "(-1, 3)" },
        { "id": "c", "text": "(3, 1)" }
      ],
      "answerIds": ["a"],
      "after": "O vetor desloca 3 unidades no eixo horizontal e -1 no eixo vertical."
    }
  ]
}
```

O serviço fornece dados; o aplicativo compõe o objeto final no contrato público em memória.

## Compilação e validação

A compilação transforma a resposta em um fragmento do contrato AraLearn montado em memória. A validação confere o resultado antes de qualquer gravação. O fragmento aprovado altera somente a microssequência, o card ou a linha afetada.

Exemplos de rejeição:

- recurso inexistente;
- `choice` sem três ou quatro alternativas;
- `answer` que não aponta para opção existente;
- `paragraph` de exercício sem lacuna válida;
- `matrix` sem valores;
- `graph` com aresta apontando para vértice inexistente;
- uso relevante de item excluído;
- exercício que revela a resposta no enunciado.

## Linguagem formal da autoria externa

A autoria por workspace usa uma linguagem JSON formal de alto nível. O agente escolhe um recurso conhecido e preenche os campos definidos para ele. Quando uma prática pede o preenchimento de parte da representação, `{gap:id}` ocupa o campo interativo e `gaps` informa a resposta, o modo de interação e, quando necessário, os distratores ou variantes literais.

O compilador aceita somente essas formas estruturadas. Ele confere referências, posições, alvos de lacuna e combinações de recurso, tipo e exercício; depois as traduz para o contrato v4 e para as estruturas determinísticas do runtime. Ele não interpreta uma instrução em português para localizar um controle, não transforma prosa em HTML e não inventa um campo ausente.

O plano da autoria externa também identifica conceitos, operações e dependências. Cada operação declara recursos preferenciais e permitidos. Uma prática recupera somente conceitos já apresentados na mesma cadeia causal ou numa dependência aprovada. Essas relações tornam verificáveis a continuidade, a progressão do apoio e a escolha da representação.

## Correção localizada

Quando a resposta falha, o aplicativo pode pedir a correção da etapa específica, aplicar um reparo seguro ou rejeitar a proposta. Reparos mecânicos não inventam conteúdo disciplinar. Se a falha compromete conteúdo ou escopo, a proposta é recusada.

## Por que esse desenho importa

Esse processo preserva a responsabilidade autoral: a pessoa recebe uma etapa verificável para revisar, sem transformar automaticamente uma resposta em conteúdo de estudo.

A produção extensa conserva snapshots no servidor, pode combinar cursos
existentes e mover entidades entre árvores. No chat, a revisão conceitual
mostra somente as microteorias e a quantidade de práticas, salvo solicitação
explícita. Consulte [Gateway MCP de autoria](autoria-mcp.md).
