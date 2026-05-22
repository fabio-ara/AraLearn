# Arquitetura de geração por LLM e API

Este documento descreve como o AraLearn usa LLMs por API ou provider local sem entregar a elas a autoria nem o controle integral do projeto.

O AraLearn é model-agnostic. Isso significa que ele não deve depender de um único modelo, fornecedor ou modo de execução. O app pode usar Gemini, DeepSeek, Codex CLI local, endpoints compatíveis com OpenAI ou providers falsos de teste. O que preserva o projeto não é o modelo, mas o contrato, o contexto, a validação e a decisão do usuário.

## Princípio central

A IA é ferramenta de autoria assistida. Ela pode sugerir, estruturar, gerar e corrigir, mas não substitui o usuário.

A geração é separada em duas responsabilidades:

```text
planejamento da trilha = curso -> módulo -> lição -> microssequência
materialização local   = cards dentro da microssequência selecionada
```

A documentação técnica chama essas etapas de `top-down` e `bottom-up`.

- `top-down`: começa pelo desenho geral do percurso. Planeja a trilha antes de criar os cards.
- `bottom-up`: começa pela necessidade local do estudo. Materializa ou corrige cards na microssequência aberta.

A separação é importante porque reduz custo, latência, retrabalho e deriva de escopo.

## Entrada do planejamento da trilha

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

O contrato funciona como declaração de escopo. Ele evita que a IA tente descobrir sozinha o domínio inteiro a partir de material bruto. O usuário continua definindo a intenção do estudo.

## Saída do planejamento da trilha

O provider deve devolver uma estrutura navegável com:

- curso;
- módulos;
- lições;
- microssequências planejadas;
- objetivo de lição;
- objetivo de microssequência;
- dependências locais entre microssequências;
- metadados didáticos quando úteis.

As microssequências planejadas entram no projeto sem cards. Isso permite revisar o caminho antes de materializar conteúdo.

## Materialização local

A materialização local ocorre quando o usuário abre uma microssequência e solicita uma intervenção.

O contexto enviado ao provider pode incluir:

- curso;
- módulo atual;
- lição atual;
- microssequência atual;
- dependências diretas;
- microssequência anterior e seguinte, quando relevantes;
- fonte-guia da lição;
- anexos aproveitáveis;
- pedido do usuário;
- densidade ou perfil didático.

Esse pacote deve ser suficiente para a operação local, sem transformar cada chamada em replanejamento do curso.

## Quatro rotas locais

O bottom-up preserva quatro rotas de intervenção:

1. **Gerar a próxima microssequência planejada**: segue a trilha criada no planejamento.
2. **Criar mais cards na microssequência atual**: aprofunda ou continua a etapa aberta.
3. **Criar microssequência adicional**: abre uma etapa de apoio quando aparece uma lacuna local.
4. **Corrigir cards da microssequência atual**: repara conteúdo, prática, estrutura ou explicação.

Essas rotas preservam autoria. O usuário não fica preso ao plano inicial, mas também não cai em conversa solta. Há estrutura e há intervenção aberta.

## Draft didático e compilação

Na materialização local, o app pode separar a resposta em duas fases:

1. **Draft didático**: define etapas, funções didáticas, recursos sugeridos, evidências esperadas e necessidade de continuação.
2. **Compilação final**: transforma o draft e o card plan em JSON final de cards.

Essa separação tem justificativa didática e técnica.

Didaticamente, o draft torna explícita a progressão antes da escrita final. Tecnicamente, a compilação final pode se concentrar em obedecer ao contrato e gerar JSON válido.

## Operações

Operações suportadas pelo runtime de geração incluem:

- `plan-scope`;
- `generate-microsequence`;
- `improve-microsequence`;
- `add-practice`;
- `create-support`;
- `generate-next`.

Esses modos também aparecem no bridge local do Codex.

## Providers

Providers previstos ou suportados:

- `fake`, usado em testes e harnesses;
- `gemini`, para API do Gemini;
- `openai-compatible`, para endpoints compatíveis com o formato OpenAI;
- `deepseek`, por política específica sobre base compatível com OpenAI;
- `codex-cli`, para operação local via bridge HTTP.

Todos devem ser tratados como executores de operação estruturada. A regra de domínio permanece no app.

## DeepSeek

DeepSeek foi incluído por uma razão prática: permitir uso dedicado com menor custo e menor latência. No AraLearn, latência importa porque o bottom-up acontece durante o estudo. Se cada microssequência demora demais para gerar, a IA vira novo atrito.

O suporte atual contempla:

- `deepseek-v4-flash`;
- `deepseek-v4-pro`;
- perfil `DeepSeek Quality`;
- base padrão `https://api.deepseek.com`;
- base beta para chamadas estruturadas quando necessário.

A política de fase diferencia chamadas raras e chamadas frequentes:

- `scope-inference`: usa Flash com `thinking` habilitado e `reasoning_effort: high`;
- `top-down-plan`: usa Pro com `thinking` habilitado e `reasoning_effort: max`;
- `top-down-repair`: usa Flash sem `thinking`, com temperatura baixa;
- `bottom-up-draft`: usa Flash sem `thinking`, priorizando latência;
- `bottom-up-compile`: usa Flash sem `thinking`, com JSON estruturado;
- `bottom-up-repair`: usa Flash sem `thinking`, com temperatura ainda mais baixa;
- `smoke`: usa Flash sem `thinking`.

Essa política reflete uma decisão de produto: investir mais nas etapas raras e estruturais, mas manter a edição de microssequência rápida e barata.

## Gemini

Gemini permanece útil para prototipação, testes e uso inicial. A free tier facilita experimentação, mas limites de requisições podem restringir estudo dedicado. Por isso, ele não deve ser apresentado como única via operacional do app.

## Codex CLI local

Codex CLI local atende outro caso: usuários com assinatura OpenAI podem operar o AraLearn por bridge HTTP local, sem necessariamente comprar créditos de API de outro provider.

O bridge recebe uma operação estruturada do AraLearn, envia prompt ao Codex CLI e devolve JSON para validação. O app continua validando o resultado antes de aplicá-lo.

## Validação

Toda resposta de IA precisa passar por validação local.

A validação cobre:

- contrato de escopo;
- plano estrutural;
- status e tipo de microssequência;
- versão de microssequência;
- recursos de card;
- formato do conteúdo;
- suficiência mínima de cards;
- aderência ao card plan quando aplicável.

Se a validação falhar, a alteração não deve substituir o projeto anterior.

## Persistência e auditoria

A geração por IA só ganha valor didático quando vira material persistido, revisável e estudável. Por isso, a saída precisa ser convertida para contrato público ou para versão de microssequência.

O usuário deve poder:

- exportar o projeto;
- importar o projeto;
- inspecionar JSON;
- preservar versões;
- voltar a uma etapa;
- estudar offline depois que o conteúdo foi persistido.

## Vantagens do desenho

Essa arquitetura reduz:

- custo de contexto por chamada;
- dependência de material extenso;
- respostas enciclopédicas fora do escopo;
- geração excessiva antes do estudo;
- dificuldade de revisão humana;
- dependência de um único modelo.

Ao mesmo tempo, preserva:

- trilha visível;
- autoria do usuário;
- geração assistida;
- baixa fricção;
- versões;
- operação local;
- exportação por contrato público;
- possibilidade de estudo offline.
