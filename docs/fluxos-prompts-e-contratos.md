# Fluxos, prompts e contratos de geração

Este documento descreve como o AraLearn conversa com LLMs por API. A ideia principal é separar intenção, estrutura, conteúdo e validação. A LLM não escreve o projeto final inteiro; ela responde a contratos transitórios, e o app transforma a resposta em objetos do contrato público quando a validação permite.

OpenAI (2026), Google AI for Developers (2026) e DeepSeek (2026) documentam mecanismos de saída estruturada ou JSON. Esses recursos ajudam, mas não bastam: o AraLearn também precisa conferir se a resposta é didaticamente adequada ao escopo da microssequência.

## Princípio operacional

Cada chamada deve ter escopo limitado. O app informa tarefa, idioma, contexto, recursos disponíveis, regras e formato esperado. A LLM responde. O app compõe o resultado, valida e só então calcula e persiste mutações relacionais no escopo afetado.

Esse arranjo evita três problemas frequentes:

- pedir ao modelo que planeje e escreva tudo de uma vez;
- aceitar JSON válido, mas incoerente com a trilha;
- perder controle sobre o conteúdo aplicado e a revisão humana.

## Fluxo 1: top-down

O top-down parte de um contrato de escopo. O usuário informa curso pretendido, objetivo, conteúdos incluídos, conteúdos excluídos e observações.

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

A LLM recebe a tarefa de propor a estrutura da trilha:

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

## Validação do top-down

Antes de aplicar o resultado, o AraLearn verifica:

- se a resposta não trouxe cards;
- se módulos e lições possuem `guide`;
- se `include`, `exclude` e `covers` respeitam o escopo;
- se `dependsOn` aponta apenas para microssequências anteriores da mesma lição;
- se não há auto-dependência, referência inexistente, dependência futura ou ciclo.

O objetivo é produzir uma trilha revisável, não uma estrutura definitiva e imutável.

## Fluxo 2: bottom-up

O bottom-up começa em uma microssequência aberta. O app já sabe onde o estudante está, quais dependências existem, que tópicos a etapa cobre e quais cards já pertencem à etapa. A LLM recebe apenas o necessário para uma intervenção local.

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

O app verifica se os recursos pertencem ao catálogo permitido e se a combinação entre recurso, tipo e exercício é aceitável.

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
      "options": [
        { "id": "a", "text": "(3, -1)" },
        { "id": "b", "text": "(-1, 3)" },
        { "id": "c", "text": "(3, 1)" }
      ],
      "answer": "a",
      "after": "O vetor desloca 3 unidades no eixo horizontal e -1 no eixo vertical."
    }
  ]
}
```

A LLM fornece dados; o app compõe o objeto final no contrato público.

## Compilação e validação

A compilação transforma a resposta transitória em um fragmento do contrato AraLearn montado em memória. A validação confere o resultado antes de qualquer transação. Depois da aprovação, a normalização atualiza somente as linhas da microssequência, do card ou do filho afetado e registra a mutação na outbox.

Exemplos de rejeição:

- recurso inexistente;
- `choice` sem três ou quatro alternativas;
- `answer` que não aponta para opção existente;
- `paragraph` de exercício sem lacuna válida;
- `matrix` sem valores;
- `graph` com aresta apontando para vértice inexistente;
- uso relevante de item excluído;
- exercício que revela a resposta no enunciado.

## Correção localizada

Quando a resposta falha, o app pode pedir correção da etapa específica, aplicar reparo mecânico seguro ou rejeitar a saída. Reparos mecânicos não devem inventar conteúdo disciplinar. Se a falha compromete conteúdo ou escopo, o resultado deve ser recusado.

## Por que esse desenho importa

O desenho reduz custo, ambiguidade e fragilidade. Também preserva autoria: o usuário não recebe uma massa textual opaca, mas uma etapa editável, com dados verificáveis e cards próprios.

## Referências citadas

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
