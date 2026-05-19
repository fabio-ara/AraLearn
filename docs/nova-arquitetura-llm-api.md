# Arquitetura de geração por LLM e API

Este documento descreve como o AraLearn usa LLMs por API ou provider local sem entregar a elas o controle integral do projeto.

## Decisão central

A geração é separada em duas responsabilidades:

```text
planejamento estrutural = curso -> módulo -> lição -> microssequência
materialização local    = cards dentro da microssequência selecionada
```

O planejamento estrutural define o percurso. A materialização local produz ou ajusta os cards no ponto em que o usuário está trabalhando.

## Entrada do planejamento estrutural

A entrada principal é `aralearn.scope.v1`.

Esse contrato contém:

- curso ou tema;
- objetivo opcional;
- prioridade de evidências;
- módulos;
- expressões do que entra em cada módulo;
- expressões do que fica fora;
- observações;
- estilo de avaliação ou uso.

O contrato funciona como uma declaração de escopo. Ele evita que a IA tente descobrir sozinha o domínio inteiro a partir de material bruto.

## Saída do planejamento estrutural

O provider deve devolver uma estrutura navegável com:

- curso;
- módulos;
- lições;
- microssequências planejadas;
- objetivo de lição;
- objetivo de microssequência;
- dependências locais entre microssequências.

As microssequências planejadas entram no projeto com `status: "planned"` e sem versões de cards.

## Materialização local

A materialização local ocorre quando o usuário abre uma microssequência e solicita geração ou revisão.

O contexto enviado ao provider pode incluir:

- curso;
- módulo atual;
- lição atual;
- microssequência atual;
- dependências diretas;
- microssequência anterior e seguinte, quando relevantes;
- densidade desejada;
- pedido do usuário.

Esse pacote de contexto deve ser suficiente para a operação local, sem transformar cada chamada em replanejamento do curso.

## Operações

Operações suportadas pelo runtime de geração:

- `plan-scope`;
- `generate-microsequence`;
- `improve-microsequence`;
- `add-practice`;
- `create-support`;
- `generate-next`.

Esses modos aparecem também no bridge local do Codex.

## Providers

Providers previstos:

- `fake`, usado em testes e harnesses;
- `gemini`, para API do Gemini;
- `openai-compatible`, para endpoints compatíveis com o formato OpenAI;
- `codex-cli`, para operação local via bridge HTTP.

Todos devem ser tratados como executores de uma operação estruturada. A regra de domínio permanece no app.

## Validação

Toda resposta de IA precisa passar por validação local.

A validação cobre:

- contrato de escopo;
- plano estrutural;
- status e tipo de microssequência;
- versão de microssequência;
- recursos de card;
- formato do conteúdo.

Se a validação falhar, a alteração não deve substituir o projeto anterior.

## Vantagens do desenho

Essa arquitetura reduz:

- custo de contexto por chamada;
- dependência de material extenso;
- respostas enciclopédicas fora do escopo;
- geração excessiva antes do estudo;
- dificuldade de revisão humana.

Ao mesmo tempo, preserva:

- trilha visível;
- autoria do usuário;
- geração assistida;
- versões;
- operação local;
- exportação por contrato público.
