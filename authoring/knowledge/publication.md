# Validação e publicação

A publicação é uma mudança de estado protegida. Ela não serve para experimentar se o curso está completo.

## Condições mínimas

- plano válido e fechado;
- todas as partes aprovadas;
- nenhuma tentativa de reparo ou reconstrução pendente;
- registros de termos, fontes e afirmações coerentes;
- dependências sem ciclos ou referências ausentes;
- microssequências em estado publicável;
- documento v3 remontado sem perda de campo;
- validação do contrato atual aprovada;
- normalização e validação relacionais aprovadas;
- destino autorizado.

## Destino

A API de autoria cria ou atualiza cursos do catálogo e exige permissão editorial. Importações privadas pertencem ao fluxo do próprio aplicativo, na aba Trilhas, e não passam por esta API. O assistente não amplia o próprio escopo.

## Visibilidade atômica

A preparação relacional pode avançar em lotes persistidos, mas a árvore inteira torna-se visível somente na confirmação final. Uma interrupção conserva o cursor e o rascunho; nunca expõe um curso parcial.

## Repetição segura

O pedido de publicação leva um `requestId` idempotente. Cada chamada termina em até 45 segundos. HTTP 202 com `status: publishing` informa a fase, o percentual e o intervalo sugerido em `pollAfterSeconds`. Repita o mesmo pedido com o mesmo identificador; a API retoma o cursor ou observa a finalização já iniciada. A conclusão chega em HTTP 200 com `status: published`.

Uma falha transitória permite nova tentativa. Uma falha determinística fica registrada e volta como erro estruturado, sem repetição automática infinita. Reutilizar o identificador para outra intenção continua sendo rejeitado.

## Depois da publicação

O resultado informa a identidade persistida, o hash do conteúdo, o destino e a sequência de publicação. O assistente encerra a execução e apresenta uma síntese, sem expor credenciais nem despejar o documento completo na conversa.
