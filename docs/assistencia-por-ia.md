# Assistência por IA

A assistência por IA no AraLearn existe para reduzir atrito na autoria e na revisão de trilhas. Ela é situada, contratual e validada localmente.

## Papel da IA

A IA pode ajudar em dois momentos:

1. planejar a estrutura de um curso até microssequências;
2. gerar ou revisar cards dentro de uma microssequência específica.

Ela não deve receber liberdade para reescrever o projeto inteiro em toda operação. Também não deve substituir a decisão do usuário sobre escopo, aceite e revisão.

## O que faz cada motor

### Top-down

O top-down é o motor de planejamento.

Ele recebe:

- o contrato de escopo do curso;
- o que entra e o que não entra em cada módulo;
- observações de cobrança, foco e contexto;
- a árvore já existente, quando o usuário está complementando algo.

Ele produz:

- módulos, lições e microssequências;
- progressão entre etapas;
- dependências locais entre microssequências;
- fonte-guia mínima por lição;
- metadados didáticos opcionais por microssequência.

O que esperar do resultado:

- uma trilha organizada e progressiva;
- escopo preservado;
- nenhuma geração de cards nesta fase.

### Bottom-up

O bottom-up é o motor de materialização local.

Ele recebe:

- a microssequência atual;
- dependências declaradas;
- posição na trilha;
- fonte-guia da lição;
- pedido local do usuário;
- anexos aproveitáveis, quando houver.

Ele produz:

1. um `didactic draft` intermediário com etapas, papéis didáticos, recursos sugeridos e evidências esperadas;
2. o JSON final de cards no formato consumido pelo frontend.

O que esperar do resultado:

- uma única microssequência materializada ou retrabalhada;
- cards com progressão interna clara;
- prática autossuficiente quando a etapa exige aplicação;
- aderência à trilha, sem replanejar a lição inteira.

## Planejamento estrutural

No planejamento estrutural, a IA recebe `aralearn.scope.v1`.

Ela deve produzir:

- lições;
- microssequências planejadas;
- objetivos;
- dependências locais;
- organização coerente dentro do escopo informado.

Restrições esperadas:

- respeitar `include`;
- evitar tópicos declarados em `exclude`;
- preservar módulos informados;
- não gerar cards nessa etapa;
- não transformar observações em promessa de completude.

## Materialização local

Na materialização local, a IA recebe um pacote de contexto da microssequência selecionada.

Ela pode:

- gerar cards;
- melhorar explicação;
- acrescentar prática;
- criar complemento;
- gerar a próxima microssequência planejada.

Cada intervenção cria uma versão nova. A versão anterior permanece disponível.

O fluxo atual divide essa etapa em duas fases leves:

1. `didactic draft`: a IA propõe etapas, funções didáticas, recursos sugeridos e evidências esperadas;
2. `compile cards`: a IA devolve o JSON final no formato consumido pelo frontend.

Se o draft falha ou vem incompleto, o runtime usa um card plan determinístico como fallback.

## Retorno iterável da intervenção

Na aba `Edição`, o bottom-up não termina mais apenas em "deu certo" ou "deu erro". O runtime produz um retorno classificado para a microssequência atual.

Estados principais:

- `completed`: a iteração atual fechou a etapa;
- `needs_retry`: houve erro recuperável ou resposta insuficiente;
- `needs_continue_here`: a etapa atual ainda pede nova chamada na mesma microssequência;
- `needs_support_microsequence`: vale abrir uma etapa de apoio adjacente;
- `needs_new_microsequence`: a continuação pede nova microssequência;
- `blocked`: falta provider ou contexto operacional;
- `stale`: o retorno foi gerado sobre uma versão-base que já não está mais em uso.

O retorno é persistido por microssequência, junto com a versão-base ativa quando a chamada ocorreu. Isso permite sair da tela, estudar outra etapa e voltar depois sem perder:

- o pedido anterior;
- a proposta de próxima iteração;
- o modelo usado;
- a recomendação de ação seguinte.

Quando há continuação segura, o app habilita uma nova iteração a partir do retorno persistido. O retorno fica no próprio campo de iteração: se houve erro, ele traz a causa e um pedido de nova tentativa; se houve continuação, ele traz o texto-base da próxima chamada. Quando a versão-base mudou, o retorno continua legível, mas deixa de ser executado cegamente.

## Providers

Providers suportados pelo desenho técnico:

- Gemini;
- DeepSeek via base compatível com OpenAI;
- Codex local;
- OpenAI compatível;
- Fake provider para testes.

A interface de provider deve permitir trocar a origem da resposta sem alterar o contrato do domínio.

### Observações sobre DeepSeek

O suporte DeepSeek no runtime atual foi calibrado para duas necessidades diferentes:

- confiabilidade estrutural, porque o app depende de JSON validado localmente;
- latência baixa no bottom-up, porque a microssequência é a parte mais iterada pelo usuário.

Por isso:

- chamadas estruturadas DeepSeek com `schema` usam strict tool calling no endpoint beta da API;
- o adapter lê a resposta a partir de `tool_calls[].function.arguments`;
- o adapter sanitiza os schemas para o subset strict aceito pela API;
- no bottom-up, `draft`, `compile` e `repair` usam `deepseek-v4-flash` sem `thinking`;
- `scope-inference` pode continuar com raciocínio habilitado, porque é uma etapa menos frequente e mais interpretativa.

## Modos do Codex local

O bridge local do Codex aceita os modos:

- `plan-scope`;
- `generate-microsequence`;
- `improve-microsequence`;
- `add-practice`;
- `create-support`;
- `generate-next`.

Endpoint padrão:

```text
http://127.0.0.1:4183/assist
```

## Segurança estrutural

O AraLearn aplica validação local depois de cada resposta.

A validação verifica:

- estrutura do projeto;
- campos obrigatórios;
- status e tipo de microssequência;
- cards e recursos permitidos;
- conteúdo mínimo para materialização;
- coerência didática básica por card;
- contexto interno de prática;
- aderência à trilha e às dependências declaradas.

Quando uma resposta não passa pela validação, o projeto anterior é preservado. A IA sugere e produz, mas não tem permissão automática para corromper o documento local.

Os limites de cards informados por modelo são tratados como orçamento técnico por chamada. Eles não definem, por si só, se uma microssequência está pedagogicamente suficiente.

## Privacidade e controle

O projeto é local-first. O envio de conteúdo a uma API remota depende do provider configurado pelo usuário.

O app deve deixar claro que operações remotas podem enviar o contexto necessário para a geração. Quando o usuário optar por provider local, a chamada é feita ao bridge local configurado.
