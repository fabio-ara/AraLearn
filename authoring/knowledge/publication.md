# Validação e conclusão

A conclusão é uma mudança de estado protegida. Ela não serve para experimentar se o curso está completo.

## Condições mínimas

- plano válido e fechado;
- todas as partes aprovadas;
- nenhuma tentativa de reparo ou reconstrução pendente;
- registros de termos, fontes e afirmações coerentes;
- dependências sem ciclos ou referências ausentes;
- microssequências em estado publicável;
- documento v4 remontado sem perda de campo;
- validação do contrato atual aprovada;
- normalização e validação relacionais aprovadas;
- destino autorizado.

## Destino

A execução declara o destino desde a abertura:

- `target: private` cria um curso relacional na conta do autor e o seleciona para estudo. Uma chave pessoal só opera nesse destino;
- `target: catalog` prepara uma publicação oficial e exige permissão editorial em todas as etapas protegidas.

Uma execução não muda de destino durante o trabalho. O assistente não amplia o próprio escopo. A importação manual de um arquivo privado continua disponível na aba Trilhas e é independente da autoria em partes.

## Visibilidade atômica

A preparação relacional pode avançar em lotes persistidos, mas a árvore inteira torna-se visível somente na confirmação final. No destino privado, a árvore aparece apenas para o autor. No catálogo, aparece para os estudantes somente depois da publicação. Uma interrupção conserva o cursor e o rascunho; nunca expõe um curso parcial.

## Repetição segura

O pedido final leva um `requestId` idempotente. HTTP 202 informa que a intenção
já está aceita ou que outro executor possui a lease e inclui o intervalo
sugerido em `pollAfterSeconds`. Repita o mesmo pedido com o mesmo identificador;
a API observa a transição já iniciada ou concluída. A publicação chega em HTTP
200 com `status: published`. A conclusão privada usa o mesmo princípio e devolve
a identidade do curso apontado para a revisão imutável.

Uma falha transitória permite nova tentativa. Uma falha determinística fica registrada e volta como erro estruturado, sem repetição automática infinita. Reutilizar o identificador para outra intenção continua sendo rejeitado.

## Depois da conclusão

O resultado informa a identidade persistida, o hash do conteúdo e o destino. Uma publicação oficial informa também sua sequência. O assistente encerra a execução e apresenta uma síntese, sem expor credenciais nem despejar o documento completo na conversa.
