# Assistência por IA generativa no AraLearn

Este documento descreve como o AraLearn usa serviços de inteligência artificial generativa acessados por API para apoiar a criação de microssequências didáticas.

A API é o canal técnico de acesso ao serviço. O modelo de linguagem, como Gemini Flash, é o componente que gera texto estruturado. No AraLearn, o modelo não decide livremente o formato final do material: a aplicação define o plano didático, solicita um JSON intermediário, valida a resposta e converte o resultado para o contrato público do produto.

## Objetivo

A assistência por IA generativa existe para transformar um pedido de estudo em uma microssequência praticável.

Exemplos de pedidos:

- explique a diferença entre modelos incremental e iterativo;
- diferencie missão, visão e valores;
- explique `git init`, `git add`, `git commit` e `git push`;
- mostre uma estrutura de diretórios para um projeto simples em C;
- explique modus ponens com uma tabela verdade pequena.

A intenção é apoiar estudantes em condições reais de estudo: pouco tempo, atenção fragmentada, pausas frequentes e necessidade de retomar o percurso sem recomeçar do zero.

## Camadas de JSON

O AraLearn trabalha com formatos diferentes para responsabilidades diferentes.

### Contrato público

`aralearn.contract` é o formato público, importável e versionável do produto.

Ele representa:

- cursos;
- módulos;
- lições;
- microssequências;
- cards.

Esse contrato está documentado em [aralearn-contract.md](./aralearn-contract.md). Ele deve permanecer legível para autoria humana, validação automatizada e geração assistida por modelos de linguagem.

### Backup local

`aralearn.storage` é o formato de backup completo do estado local da aplicação.

Ele preserva projeto, progresso e dados de uso local. Esse formato não é o alvo principal da geração por IA generativa.

### JSON intermediário da assistência

Na geração de microssequências, o modelo recebe um pedido menor que o contrato público completo.

O formato intermediário atual é semelhante a:

```json
{
  "title": "Título da microssequência",
  "tags": ["Tag 1", "Tag 2"],
  "cards": [
    {
      "title": "Título do card",
      "text": "Texto explicativo ou texto com [[lacuna]].",
      "wrong": ["distrator 1", "distrator 2"]
    }
  ]
}
```

Campos aceitos por card no JSON intermediário:

- `title`: título do card;
- `text`: texto explicativo, leitura guiada ou lacuna;
- `question`: enunciado de múltipla escolha;
- `answer`: resposta correta;
- `wrong`: alternativas incorretas ou distratores para lacunas;
- `language`: linguagem de um card de código;
- `code`: trecho de código ou comando;
- `columns`: colunas de uma tabela;
- `rows`: linhas de tabela, enviadas como textos separados por `|`;
- `currentPath`: caminho atual em uma árvore de diretórios;
- `selectedPath`: caminho selecionado em uma árvore de diretórios;
- `paths`: lista de caminhos para montar uma árvore;
- `after`: comentário exibido ao continuar.

Esse JSON intermediário não é o contrato público de importação. Ele é uma forma de coleta controlada de conteúdo. Depois da resposta do modelo, o AraLearn converte cada card para `say`, `ask`, `code`, `table` ou `tree`.

## Pipeline de geração

O fluxo atual de geração é:

1. O usuário escreve um pedido em linguagem natural.
2. O AraLearn detecta assunto e estratégia didática.
3. A aplicação monta um plano determinístico local.
4. O modelo recebe o plano e preenche apenas o conteúdo dos cards.
5. A resposta é lida como JSON.
6. Se o JSON vier em bloco Markdown, a aplicação extrai o objeto JSON.
7. Se a resposta vier ilegível ou insuficiente, a aplicação faz nova tentativa com prompt de reparo.
8. Se o serviço rejeitar o schema por complexidade, a aplicação tenta novamente com `responseMimeType: "application/json"` e sem schema.
9. O AraLearn mescla resposta e plano, normaliza textos, limita excesso, aplica distratores e valida os cards.
10. A microssequência é criada como rascunho na oficina local.

Essa organização reduz a dependência de uma única resposta perfeita do modelo.

## Plano determinístico

O plano local usa quatro informações principais:

```json
{
  "title": "Título planejado",
  "subject": "git_github",
  "recipe": "explain_commands",
  "goal": "Objetivo didático",
  "tags": ["Git", "Comandos essenciais"],
  "cardPlans": [
    {
      "role": "concept",
      "container": "say",
      "title": "Fluxo mínimo",
      "learningGoal": "Explicar a ordem geral sem detalhar tudo de uma vez."
    }
  ]
}
```

O modelo vê esse plano, mas não precisa devolver `role` nem `container`. Esses campos são responsabilidade da aplicação.

Assuntos reconhecidos no planejamento atual:

- programação;
- linguagem C;
- Portugol;
- algoritmos em representação tabular;
- shell Linux;
- Git e GitHub;
- engenharia de software;
- administração;
- arquitetura de computadores;
- lógica proposicional;
- matrizes e vetores;
- teoria dos grafos;
- estudo geral.

Estratégias didáticas atuais:

- `explain_concept`: explicação, exemplo, recuperação ativa e verificação;
- `compare_concepts`: ponto de partida, tabela comparativa, exemplo, verificação e síntese;
- `explain_commands`: explicação progressiva, código ou tabela, recuperação ativa e verificação;
- `directory_context`: explicação, árvore de diretórios, recuperação ativa e verificação;
- `worked_example`: ideia mínima, exemplo resolvido, lacuna e verificação;
- `practice_sequence`: preparação, modelo, prática, checagem e retomada;
- `diagnostic_gap`: ponto de confusão, distinções, lacuna diagnóstica e erro comum.

## Contêineres usados na geração inicial

Nesta fase, a geração automática de microssequências usa estes contêineres:

- `say`: explicação, leitura guiada e lacuna por opções;
- `ask`: múltipla escolha;
- `code`: código, comando ou trecho executável;
- `table`: comparação, classificação ou resumo estruturado;
- `tree`: diretórios, caminhos e estrutura de projeto.

`flow` permanece parte do contrato público do AraLearn, mas não é usado pela geração inicial com modelos menores. Fluxogramas exigem uma engenharia própria, com schema especializado, validação geométrica e provável uso de modelos mais robustos.

## Lacunas por opções

Para os testes atuais, lacunas geradas pela assistência devem ser completadas por opções selecionáveis, não por digitação livre.

Há duas formas válidas:

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit]].",
  "wrong": ["git add", "git push"]
}
```

ou:

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit::git commit|git add|git push]]."
}
```

Na primeira forma, o AraLearn usa `wrong` para montar as opções da lacuna. Na segunda, as opções já estão declaradas no próprio texto.

O normalizador local reforça essa regra:

- cards planejados como prática ou revisão recebem lacuna quando o modelo não a envia;
- lacunas sem distratores recebem alternativas locais;
- tabelas geradas têm lacunas textuais removidas nesta fase para evitar digitação livre;
- fluxogramas não são gerados automaticamente nesta etapa.

## Prompt de preenchimento

O prompt atual não pede ao modelo para criar a arquitetura da microssequência. Ele pede preenchimento do plano.

Estrutura conceitual:

```text
Preencha o conteúdo dos cards seguindo exatamente o plano abaixo.
Devolva exatamente N cards, na mesma ordem do plano.
Cada card deve ter title e os campos de conteúdo necessários ao seu contêiner.
O plano informa role e container; não devolva role nem container.
Escreva para estudante de Tecnologia em Análise e Desenvolvimento de Sistemas.
Use linguagem natural simples, de iniciante para iniciante.
A microssequência precisa ter explicação, exemplo ou leitura guiada, prática e consolidação.
Cada text deve ter no máximo duas frases.
Use uma ideia por card e uma ideia por frase.
Use [[resposta]] apenas quando o plano pedir prática, revisão ou lacuna.
Todo card com [[resposta]] deve enviar wrong com duas ou três alternativas plausíveis.
Não gere fluxograma nesta etapa.
Retorne apenas JSON válido.
```

O prompt completo também inclui:

- resumo da microssequência atual;
- plano determinístico em JSON;
- pedido original do usuário.

## Por que usar JSON intermediário menor

Modelos menores tendem a responder melhor quando recebem tarefas fragmentadas, schema simples e pouca liberdade estrutural.

Por isso, a geração inicial evita pedir um `aralearn.contract` completo. A aplicação pede apenas conteúdo de cards e faz a conversão local.

Essa escolha traz vantagens:

- reduz campos obrigatórios na resposta do modelo;
- evita que o modelo decida a hierarquia do curso;
- diminui a chance de campos extras;
- preserva o contrato público;
- permite validação determinística;
- facilita novas tentativas quando a resposta falha.

## Validação local

Depois da resposta do modelo, o AraLearn:

- extrai JSON quando a resposta vem em bloco Markdown;
- limita a quantidade de cards entre 3 e 5;
- preserva a ordem do plano local;
- substitui títulos de cards de comando quando necessário;
- separa textos em parágrafos;
- remove lacunas de cards conceituais;
- garante distratores para lacunas de prática;
- converte tabela textual para `table.rows`;
- monta árvore a partir de caminhos;
- sanitiza o card final pelo contrato público.

O resultado final aplicado ao projeto já é contrato AraLearn, não o JSON intermediário.

## Teste real com Gemini

Para executar o teste de geração real:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

O teste envia pedidos de assuntos diferentes e verifica critérios automáticos:

- quantidade de cards;
- variedade de contêineres;
- ausência de fluxograma na geração inicial;
- conteúdo mínimo por card;
- múltipla escolha completa;
- lacunas com opções selecionáveis.

A chave deve ficar apenas no ambiente da sessão e não deve ser registrada em arquivos do projeto.

## Possíveis evoluções

Linhas de pesquisa e engenharia possíveis:

- separar geração em várias chamadas: diagnóstico, plano, card individual, crítica e reparo;
- usar modelos mais robustos para fluxogramas;
- criar schema próprio para fluxogramas antes da conversão para `flow`;
- registrar vínculo entre trecho-fonte e card gerado;
- classificar transformação como literal, paráfrase, inferência ou crítica;
- permitir que o modelo sugira destino para uma microssequência usando slots fechados fornecidos pela aplicação;
- avaliar qualidade didática por retenção, tempo de revisão e erro recorrente;
- calibrar microssequências novas a partir de dúvidas pontuais do estudante.

O princípio central deve permanecer: o modelo sugere conteúdo; o AraLearn planeja, valida, normaliza, aplica e preserva o controle do usuário sobre o material.
