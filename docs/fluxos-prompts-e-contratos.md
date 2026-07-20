# Fluxos experimentais, prompts e contratos de geração

Este documento registra os contratos experimentais usados pelos harnesses locais de pesquisa para conversar com LLMs por API. Ele não descreve uma função do aplicativo estudantil: esses harnesses não são expostos pela aplicação web ou pelo APK e não gravam no Supabase operacional. A futura autoria administrativa por GPT será um sistema separado e ainda não existe neste corte.

A ideia experimental é separar intenção, estrutura, conteúdo e validação. A LLM não escreve um projeto final inteiro; responde a contratos transitórios, e o harness transforma a resposta em objetos do contrato público em memória quando a validação permite.

OpenAI (2026), Google AI for Developers (2026) e DeepSeek (2026) documentam mecanismos de saída estruturada ou JSON. Esses recursos ajudam, mas não bastam: o AraLearn também precisa conferir se a resposta é didaticamente adequada ao escopo da microssequência.

## Princípio dos harnesses

Cada chamada experimental deve ter escopo limitado. O harness informa tarefa, idioma, contexto, recursos disponíveis, regras e formato esperado. A LLM responde; o harness compõe e valida o resultado em memória. Nenhuma dessas etapas autoriza escrita no estado do estudante. Uma futura persistência administrativa terá autenticação, validação e transações próprias.

Esse arranjo evita três problemas frequentes:

- pedir ao modelo que planeje e escreva tudo de uma vez;
- aceitar JSON válido, mas incoerente com a trilha;
- perder controle sobre o conteúdo aplicado e a revisão humana.

## Fluxo 1: top-down

O top-down parte de um contrato de escopo. No experimento, o pesquisador ou autor informa curso pretendido, objetivo, conteúdos incluídos, conteúdos excluídos e observações.

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

A LLM recebe a tarefa de propor a estrutura do curso:

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

Antes de aceitar o resultado experimental, o harness verifica:

- se a resposta não trouxe cards;
- se módulos e lições possuem `guide`;
- se `include`, `exclude` e `covers` respeitam o escopo;
- se `dependsOn` aponta apenas para microssequências anteriores da mesma lição;
- se não há auto-dependência, referência inexistente, dependência futura ou ciclo.

O objetivo é produzir um artefato revisável para pesquisa e preparação de conteúdo, não alterar a biblioteca de um estudante.

## Fluxo experimental 2: bottom-up

O bottom-up recebe de um harness uma microssequência escolhida, suas dependências, os tópicos cobertos e os cards existentes. A LLM recebe apenas o necessário para uma intervenção local; o aplicativo estudantil atual não oferece essa operação.

O experimento pode avaliar quatro operações:

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

O harness verifica se os recursos pertencem ao catálogo permitido e se a combinação entre recurso, tipo e exercício é aceitável.

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

A LLM fornece dados; o harness compõe o objeto final no contrato público em memória.

## Compilação e validação experimental

A compilação transforma a resposta transitória em um fragmento do contrato AraLearn montado em memória. A validação confere o resultado e o harness produz um artefato ou relatório para revisão; ele não registra mutações na outbox do estudante. Se uma futura API administrativa reutilizar esse desenho, sua própria fronteira autorizada deverá normalizar apenas o fragmento aprovado e publicar somente um curso integralmente válido.

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

Quando a resposta falha, o harness pode pedir correção da etapa específica, aplicar reparo mecânico seguro ou rejeitar a saída. Reparos mecânicos não devem inventar conteúdo disciplinar. Se a falha compromete conteúdo ou escopo, o resultado deve ser recusado.

## Por que esse desenho importa

O desenho reduz custo, ambiguidade e fragilidade no experimento. Também preserva a responsabilidade autoral: o pesquisador recebe uma etapa verificável para revisão, sem transformar a resposta do modelo em conteúdo operacional automaticamente.

## Referências citadas

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
