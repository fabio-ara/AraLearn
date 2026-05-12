# Assistência por IA generativa

Este documento descreve a engenharia da assistência por serviços de inteligência artificial generativa acessados por API no AraLearn. Para visão de produto, arquitetura geral, modelo didático e rascunhos, consulte os documentos correspondentes em `docs/`.

## Papel da assistência

A assistência por IA generativa apoia a transformação didática de pedidos do usuário.

Ela pode ser usada para:

- gerar estrutura de curso, módulo e lição;
- gerar microssequências;
- revisar microssequências;
- reorganizar conteúdo;
- apoiar autoria de cards e formatos específicos.

O modelo de linguagem não é responsável sozinho pela estrutura final aplicada ao projeto. A aplicação planeja, solicita, valida, normaliza e converte o resultado para o contrato público.

## Responsabilidades

A aplicação:

- define contratos de planejamento e execução;
- fixa tipos disponíveis, recursos permitidos e `cardPlan` determinístico quando a operação exige cards;
- monta prompts restritos;
- seleciona recursos didáticos permitidos;
- envia a chamada ao serviço;
- extrai JSON;
- normaliza o conteúdo;
- valida o resultado;
- adapta o JSON intermediário ao contrato público;
- aplica o material validado ao alvo estrutural correto;
- mantém histórico local auxiliar para reversão da iteração atual quando esse fluxo existir.

O modelo:

- responde apenas no recorte pedido pelo contrato atual;
- preenche conteúdo;
- adapta linguagem;
- propõe alternativas dentro dos tipos, recursos e campos já delimitados;
- sugere `slotId` de reposicionamento apenas quando recebe slots fechados;
- responde em JSON no formato solicitado, sem decidir contrato final nem persistência final do projeto.

O usuário:

- escreve o pedido;
- abre o painel contextual no nível desejado;
- escolhe, quando aplicável, tipo didático, recursos extras e anexos;
- revisa o resultado;
- decide se continua editando, aceita a iteração atual, exclui a iteração atual, reposiciona rascunhos ou mantém o material fora do estudo.

Em termos operacionais, o serviço acessado por API, o modelo de linguagem, o JSON intermediário e o contrato público final não são a mesma coisa. O serviço executa a chamada; o modelo preenche uma resposta restrita; a aplicação valida e converte; o usuário continua responsável pela curadoria final.

No estado atual da UI, a assistência está distribuída em três pontos:

- o painel contextual estrutural, para gerar estrutura top-down em home, curso e módulo;
- o painel contextual da lição, para gerar microssequências `draft`;
- o painel da microssequência, para gerar ou editar cards.

Essa separação mantém o fluxo estrutural separado da curadoria de cards.

Matriz operacional atual:

- home, curso e módulo: `generate-top-down-structure`
- lição: `generate-lesson-microsequences`
- microssequência: `compose-microsequence`

## Geração estrutural contextual

O painel contextual estrutural usa `generate-top-down-structure`. O modelo recebe o contexto hierárquico e o pedido do usuário, mas não gera microssequências nem cards.

Entrada conceitual:

```json
{
  "courseTitle": "Curso",
  "moduleTitle": "Módulo",
  "lessonTitle": "Lição",
  "userInput": "Pedido estrutural"
}
```

Resposta esperada:

```json
{
  "course": {
    "title": "Curso",
    "modules": [
      {
        "title": "Módulo",
        "lessons": [
          { "title": "Lição" }
        ]
      }
    ]
  }
}
```

Regras da aplicação:

- home gera curso completo;
- curso gera ou atualiza módulos e lições;
- módulo gera ou atualiza lições;
- `description` permanece breve;
- `sourceGuide` e `sourceGuideStructured` entram no contexto quando existirem;
- esse modo não gera microssequências nem cards.

## Geração contextual de microssequências na lição

Quando o painel contextual é aberto com `course`, `module` e `lesson` fixados, o envio usa `generate-lesson-microsequences`.

Entrada conceitual:

```json
{
  "courseTitle": "Curso",
  "courseDescription": "Descrição breve",
  "moduleTitle": "Módulo",
  "lessonTitle": "Lição",
  "existingMicrosequences": [
    {
      "title": "Microssequência já existente",
      "tags": ["tag"],
      "status": "ready",
      "included": true
    }
  ],
  "userInput": "Quero uma escada inicial para esta lição"
}
```

Resposta esperada:

```json
{
  "microsequences": [
    { "title": "Primeira microssequência", "tags": ["base"] },
    { "title": "Segunda microssequência" }
  ]
}
```

Regras da aplicação:

- `microsequences` deve ter de 2 a 7 itens;
- cada item precisa de `title`;
- `description` é opcional;
- `tags` opcionais podem ser preservadas;
- cards não são aceitos nessa resposta;
- se o modelo devolver cards, eles são ignorados ou rejeitados na normalização;
- cada item válido vira uma microssequência `draft` com `included: false` e `cards: []`;
- a geração não abre automaticamente o painel da microssequência;
- a criação atualiza diretamente a lição persistida.

## Estrutura de geração da microssequência

A geração e a edição de cards usam uma estrutura dedicada em `src/generation/`. Essa estrutura separa:

- tipos didáticos neutros;
- tamanhos de microssequência usados na geração;
- catálogo de recursos de card;
- referências de assuntos selecionados no escopo da lição;
- anexos e fontes resolvidos para a operação;
- capacidades do modelo selecionado;
- contratos e prompts de planejamento;
- contratos e prompts de geração ou edição;
- validação estrutural da resposta.

Os tipos didáticos iniciais são `Assistido`, `Simples`, `Explicar uma ideia`, `Passo a passo`, `Prática guiada`, `Comparar`, `Revisão rápida`, `Erro comum`, `Regra/procedimento` e `Código/comando`. O tipo `Assistido` delega a escolha efetiva à etapa de planejamento.

Cada tipo é um template interno com papéis de card por tamanho. Esses papéis têm `roleId`, rótulo humano e recursos preferenciais fechados. O modelo não define esses papéis nem escolhe recurso por posição; a aplicação usa o template para montar o `cardPlan` determinístico.

No painel da microssequência, o usuário pode deixar o tipo como `Automático` ou escolher um desses tipos fechados para a geração ou edição de cards daquele pedido. A escolha é local ao painel aberto: ela não altera curso, módulo, lição nem microssequências vizinhas. Quando um tipo é escolhido, o contrato de planejamento envia `userFixedTypeId` e a aplicação valida que o plano devolvido preserve exatamente esse tipo; em `Automático`, a etapa curta de planejamento escolhe entre os tipos disponíveis.

Os tamanhos usados na geração são:

- `short`: 3 cards;
- `medium`: 5 cards;
- `long`: 7 cards.

O tamanho é decidido no planejamento, validado pela aplicação e usado para exigir a quantidade exata de cards na resposta final.

## Reparos estruturais

O pipeline usa reparos explícitos em dois pontos diferentes.

No planejamento, o modelo devolve apenas tipo didático, tamanho, objetivo, recursos extras, plano de uso de fontes e justificativa. A aplicação valida esse plano com o contrato de planejamento e monta o `cardPlan` de forma determinística a partir do tipo, do tamanho e dos recursos disponíveis. Quando o plano viola tipo fixado, tamanho, recursos permitidos ou preservação de escolhas do usuário, a aplicação faz uma chamada curta de reparo de plano.

Na geração final, o modelo devolve os cards no formato intermediário. A aplicação valida a resposta com `validateGeneratedCards` antes de qualquer adaptação para o contrato público. Quando a estrutura falha, a aplicação faz uma chamada de reparo estrutural dos cards.

O limite padrão é de uma tentativa de reparo. Se a resposta reparada continuar inválida, se não houver JSON parseável, se a quantidade de cards continuar incorreta ou se algum recurso continuar fora do contrato, a aplicação retorna erro e não salva o resultado.

## Resiliência operacional

Chamadas ao provedor podem falhar por motivos transitórios, como limite temporário de requisições, indisponibilidade ou alta demanda. O pipeline classifica erros do provedor antes de decidir se deve tentar novamente.

Categorias usadas:

- `rate_limited`;
- `service_unavailable`;
- `timeout`;
- `invalid_request`;
- `auth_error`;
- `quota_exceeded`;
- `validation_failed`;
- `unknown`.

Erros transitórios como `rate_limited`, `service_unavailable` e `timeout` podem receber retry. Erros de autenticação, requisição inválida, cota esgotada e validação local não são repetidos como falha de provedor.

As chamadas de planejamento, reparo de planejamento, geração e reparo de geração usam retry com backoff exponencial e jitter.

Depois que o planejamento é validado, a aplicação cria um `generationRunState` em memória com:

- `runId`;
- status da execução;
- target estrutural da microssequência;
- modelo solicitado e modelo realmente usado;
- contrato de planejamento;
- plano validado;
- contrato de geração;
- último erro operacional, quando existir.

Quando a falha acontece no planejamento, ainda não existe plano validado; nesse caso `canResume` é falso. Quando a falha acontece na geração ou no reparo de geração depois de um plano validado, `canResume` pode ser verdadeiro e a geração pode ser retomada com `resumeGenerationFromValidatedPlan`, sem refazer o planejamento.

## Assuntos do escopo da lição

Na geração e na edição, a seleção compacta de assuntos da UI é enviada à operação como `selectedLessonTopicRefs`.

Essas referências são contexto operacional. Elas costumam vir de títulos, tags ou assuntos de microssequências já existentes no escopo da lição atual. Elas não são um novo nível da árvore e não são persistidas automaticamente como tags próprias da microssequência gerada ou editada.

Formato conceitual:

```json
{
  "selectedLessonTopicRefs": [
    {
      "refKey": "microsequence-chave",
      "label": "Assunto visível",
      "source": "microsequence"
    }
  ]
}
```

A hierarquia principal continua sendo `Curso -> Módulo -> Lição -> Microssequência -> Card`. `selectedLessonTopicRefs` apenas reduz ambiguidade, orienta terminologia e ajuda a etapa de planejamento a escolher tipo, extensão e recursos.

## Recursos usados na geração

O catálogo de recursos usado na geração inclui:

- `paragraph`;
- `multiple_choice`;
- `code_editor`;
- `table`;
- `flowchart`;
- `tree`;
- `block_gap_fill`;
- `plane`;
- `matrix`.

Cada recurso possui descrição, limites e schema próprio. O recurso `block_gap_fill` é um alias de geração para o recurso público já existente de parágrafo com lacunas por opções, persistido como `say` com sintaxe `[[resposta::opção|opção]]`.

Mapeamento principal:

```text
paragraph       -> say
multiple_choice -> ask
code_editor     -> code
table           -> table
flowchart       -> flow
tree            -> tree
block_gap_fill  -> say com lacunas por opções
plane           -> plane
matrix          -> matrix
```

O adaptador explícito valida esse mapeamento antes do salvamento. Recursos sem caminho público de estudo são rejeitados.

Os recursos efetivos de geração são calculados por:

```text
recursos base do tipo + recursos extras escolhidos pelo usuário + recursos extras pedidos pelo plano
```

O contrato final inclui schemas apenas dos recursos efetivos.

## JSON intermediário

Na geração ou revisão de cards, o modelo recebe um formato menor que o contrato público.

Exemplo:

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

Esse JSON é intermediário. O resultado aplicado ao projeto já deve obedecer ao `aralearn.contract`.

## Pipeline de geração

Fluxo implementado para gerar estrutura em home, curso e módulo:

1. o usuário abre o painel contextual no escopo desejado;
2. o usuário escreve um pedido estrutural;
3. a aplicação monta o payload de contexto;
4. o serviço de IA generativa recebe prompt e schema estrutural;
5. a resposta é lida como JSON;
6. a aplicação extrai JSON quando a resposta vem em bloco Markdown;
7. a aplicação tenta reparo quando o JSON é ilegível ou insuficiente;
8. a aplicação valida curso, módulo e lição;
9. a estrutura validada é aplicada ao projeto.

Fluxo implementado para gerar microssequências na lição:

1. o usuário abre o painel contextual com lição fixada;
2. o usuário escreve um pedido para a lição atual;
3. a aplicação monta o contexto com curso, módulo, lição e microssequências já existentes;
4. o serviço de IA generativa recebe prompt e schema de microssequências;
5. a resposta é lida e normalizada como JSON;
6. a aplicação remove duplicatas e rejeita cards;
7. cada item válido vira uma microssequência `draft` na lição atual;
8. a lição é re-renderizada com os novos rascunhos.

Fluxo implementado para gerar ou revisar cards no painel:

1. o usuário abre uma microssequência;
2. a aplicação monta contexto de curso, módulo, lição e microssequência;
3. o usuário pode escolher tipo, recursos extras e anexos;
4. a aplicação envia anexos ao serviço de arquivos do modelo quando existirem;
5. a aplicação monta o contrato de planejamento com hierarquia, `selectedLessonTopicRefs`, pedido, recursos leves, tipos, tamanhos e fontes;
6. o modelo faz a primeira chamada e devolve `typeId`, `sizeId`, objetivo, recursos extras, fontes e justificativa;
7. a aplicação valida o plano curto e monta o `cardPlan` determinístico;
8. a aplicação resolve recursos efetivos e monta o contrato de geração com `cardPlan` fixado e schemas completos apenas desses recursos;
9. o modelo faz a segunda chamada e devolve os cards;
10. a aplicação valida quantidade, posições, recursos, schemas e campos obrigatórios;
11. se a validação falhar, a aplicação tenta um reparo estrutural dos cards e valida novamente;
12. somente cards válidos no formato intermediário são convertidos para o contrato público;
13. a aplicação substitui os cards da microssequência alvo;
14. quando a substituição cria uma iteração nova, o painel expõe ações para aceitar ou excluir essa iteração atual;
15. o usuário continua responsável por revisar o resultado aplicado.

## Anexos de referência

No painel `Gerar cards` e `Editar cards`, o usuário pode anexar documentos de referência para o pedido atual.

Regras atuais:

- os anexos ficam apenas no estado transitório da sessão;
- a aplicação envia os arquivos primeiro ao serviço de arquivos do modelo;
- planejamento e geração recebem as referências desses arquivos no payload;
- anexos selecionados explicitamente têm prioridade sobre menções no texto;
- quando há vários anexos sem seleção nem menção, a camada de fontes sinaliza necessidade de seleção;
- o usuário continua responsável por revisar o resultado aplicado ao projeto.

## Lacunas por opções

Nos testes atuais, lacunas geradas pela assistência devem ser completadas por opções selecionáveis.

Formas aceitas:

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit]].",
  "wrong": ["git add", "git push"]
}
```

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit::git commit|git add|git push]]."
}
```

## Prompt de preenchimento

Estrutura conceitual do prompt:

```text
Gere cards para a microssequência indicada.
Responda somente JSON válido no formato solicitado.
Papel do AraLearn: fixar plano, recursos, schemas e validação.
Papel do modelo: preencher apenas os cards já planejados.
Devolva exatamente output.expectedCardCount cards.
Use apenas resourceType presente em resources.allowedResourceTypes.
Siga o plano didático validado.
Cada card deve ter position, resourceType e os campos do schema do recurso.
Use uma ideia principal por card e progressão interna.
Retorne apenas JSON válido.
```

O prompt completo inclui:

- pedido original do usuário;
- contrato de geração;
- plano didático validado;
- tipos e recursos efetivos;
- schemas dos recursos efetivos;
- `selectedLessonTopicRefs`;
- fontes resolvidas;
- resumo da microssequência atual quando houver.

Ele também reforça a divisão de responsabilidade: a LLM não escolhe `cardPlan`, não decide `resourceType` por posição, não controla a persistência do projeto e não substitui a revisão humana.

## Saída estruturada nativa

A integração mantém capacidades de modelo separadas do contrato didático. Os campos `supportsNativeJsonSchema`, `supportsResponseSchema` e `responseMimeType` indicam onde o provedor poderá receber schema nativo no futuro.

No Gemini, a configuração já trabalha com `responseMimeType: "application/json"`. A extensão para `responseSchema` deve continuar isolada e testável, sem substituir a validação interna antes de salvar.

## Edição assistida

No painel da microssequência, a edição assistida trabalha principalmente em nível de microssequência.

O usuário pode pedir:

- simplificação de linguagem;
- reorganização da sequência;
- troca de formato de card;
- melhoria de exemplos;
- inclusão de prática;
- ajuste de alternativas;
- revisão de densidade textual.

A estrutura de edição já possui contratos para planejar edição e aplicar edição em duas chamadas. Nessa trilha, a aplicação continua dona do escopo, dos recursos permitidos, da validação e da aplicação do resultado; o modelo apenas propõe operações e devolve os cards editados pedidos.

## Reposicionamento assistido

No reposicionamento, o serviço recebe:

- título da microssequência;
- tags explícitas;
- pedido do usuário;
- slots fechados criados pela aplicação.

O serviço deve devolver:

- `slotId`;
- renomeações permitidas dentro da lição de destino, quando necessário.

A aplicação valida o `slotId` antes de mover a microssequência.

## Teste real com Gemini

Para testar geração real:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

A chave deve ficar apenas no ambiente da sessão.

## Decisões em aberto

Pontos de pesquisa e engenharia:

- aproximar geração, localização do rascunho e revisão sem dispersar o usuário;
- decidir quanto de orientação top-down deve entrar no fluxo bottom-up para evitar perda de foco;
- gerar card por card com crítica posterior quando modelos menores falharem em sequências longas;
- usar modelos mais robustos para fluxogramas;
- criar schema especializado para `flow`;
- registrar vínculo entre fonte e card;
- classificar transformação como literalidade, paráfrase, inferência, síntese ou contraponto;
- medir qualidade didática antes da aplicação;
- ajustar estratégia por disciplina e nível do estudante.
