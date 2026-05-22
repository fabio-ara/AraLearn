# Assistência por IA

A assistência por IA no AraLearn existe para reduzir atrito na autoria e na revisão de trilhas. Ela é situada, contratual e validada localmente.

A IA não fornece um curso pronto e não substitui a autoria do usuário. Ela é ferramenta. O usuário define escopo, revisa respostas, aceita ou rejeita versões, corrige lacunas e estuda o material persistido.

## Papel da IA

A IA pode ajudar em dois momentos:

1. planejar a estrutura de um curso até microssequências;
2. gerar, revisar, ampliar ou corrigir cards dentro de uma microssequência específica.

Ela não deve receber liberdade para reescrever o projeto inteiro em toda operação. Também não deve substituir a decisão do usuário sobre escopo, aceite, revisão e continuidade.

## Model-agnostic

O AraLearn é model-agnostic. O app não deve depender de um modelo específico para existir.

A camada de provider deve permitir trocar a origem da resposta sem alterar o contrato do domínio. Gemini, DeepSeek, Codex CLI local, endpoints compatíveis com OpenAI e provider falso de testes são meios de execução. O centro arquitetural continua sendo:

- contrato de entrada;
- prompt contextualizado;
- resposta estruturada;
- validação local;
- versão persistida;
- decisão do usuário.

## Content-agnostic

O AraLearn também é content-agnostic. Ele não carrega um currículo oficial nem depende de uma base fixa de conteúdo. Cursos embarcados podem existir como exemplo ou por uso real do autor, mas não definem o limite do app.

O usuário pode estudar disciplinas acadêmicas, concursos, documentação técnica, artigos, treinamento interno, tópicos de programação ou qualquer conteúdo que possa ser transformado em trilha.

## Planejamento da trilha

Na documentação técnica, essa fase pode aparecer como `top-down`. Em linguagem comum, é o planejamento do caminho.

A IA recebe:

- contrato de escopo do curso;
- o que entra e o que fica fora em cada módulo;
- observações de cobrança, foco ou contexto;
- estrutura já existente, quando o usuário está complementando algo.

Ela deve produzir:

- módulos, lições e microssequências;
- progressão entre etapas;
- dependências locais;
- objetivos de estudo;
- metadados didáticos opcionais.

O resultado esperado é uma trilha organizada e progressiva, sem gerar cards nessa fase.

## Materialização local

Na documentação técnica, essa fase pode aparecer como `bottom-up`. Em linguagem comum, é a criação ou revisão dos cards no ponto em que o usuário está estudando.

A IA recebe:

- microssequência atual;
- dependências declaradas;
- posição na trilha;
- fonte-guia da lição;
- pedido local do usuário;
- anexos aproveitáveis, quando houver.

Ela pode:

- gerar cards da etapa;
- criar mais cards na mesma microssequência;
- abrir uma microssequência adicional de apoio;
- corrigir cards existentes;
- seguir para a próxima microssequência planejada.

## Draft didático e cards finais

O fluxo pode ser dividido em duas fases:

1. **Draft didático**: a IA propõe etapas, papéis didáticos, recursos sugeridos, evidências esperadas e necessidade de continuação.
2. **Cards finais**: a IA devolve o JSON final no formato consumido pelo frontend.

Essa separação existe para preservar qualidade didática e estabilidade técnica. A primeira fase pensa a progressão. A segunda obedece ao contrato.

Se o draft falha ou vem incompleto, o runtime pode usar um card plan determinístico como fallback.

## Retorno iterável da intervenção

Na aba `Edição`, a intervenção não termina apenas em sucesso ou erro. O runtime produz um retorno classificado para a microssequência atual.

Estados principais:

- `completed`: a iteração atual fechou a etapa;
- `needs_retry`: houve erro recuperável ou resposta insuficiente;
- `needs_continue_here`: a etapa atual ainda pede nova chamada na mesma microssequência;
- `needs_support_microsequence`: vale abrir uma etapa de apoio adjacente;
- `needs_new_microsequence`: a continuação pede nova microssequência;
- `blocked`: falta provider ou contexto operacional;
- `stale`: o retorno foi gerado sobre uma versão-base que já não está mais em uso.

O retorno é persistido por microssequência, junto com a versão-base ativa quando a chamada ocorreu. Isso permite sair da tela, estudar outra etapa e voltar depois sem perder o pedido anterior, a recomendação de continuação, o modelo usado e a relação com a versão-base.

## Providers

Providers suportados pelo desenho técnico:

- Gemini;
- DeepSeek via base compatível com OpenAI;
- Codex CLI local via bridge HTTP;
- OpenAI compatível;
- Fake provider para testes.

A escolha do provider é operacional. Ela não altera a autoria nem remove a validação local.

## DeepSeek

DeepSeek foi incluído para responder a duas necessidades práticas:

- reduzir custo de uso dedicado;
- reduzir latência no fluxo de estudo.

No AraLearn, latência não é detalhe secundário. O usuário pode estar estudando em uma sessão curta, cansado ou sem muita disponibilidade. Se a geração da microssequência demora demais, a espera vira atrito.

O suporte atual contempla:

- `deepseek-v4-flash`;
- `deepseek-v4-pro`;
- perfil `DeepSeek Quality`;
- uso de schema/strict tool calling quando aplicável;
- políticas por fase para equilibrar custo, latência e qualidade.

A política atual privilegia `deepseek-v4-flash` no bottom-up para manter a edição de microssequência rápida. Etapas mais raras e interpretativas, como inferência de escopo ou planejamento amplo, podem receber políticas mais caras.

## Gemini

Gemini continua útil para prototipação, testes e uso inicial. A free tier reduz barreira de entrada, mas pode ter limites de requisições inadequados para estudo dedicado por longos períodos.

## Codex CLI local

Codex CLI local permite operar o AraLearn por bridge HTTP. Esse caminho é útil para quem já usa assinatura da OpenAI e não quer necessariamente comprar créditos de API de outro provider.

O bridge recebe operação estruturada, envia prompt ao Codex CLI e devolve JSON para validação pelo AraLearn.

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

## Privacidade e controle

O projeto é local-first. O envio de conteúdo a uma API remota depende do provider configurado pelo usuário.

Quando o usuário usa API remota, o contexto necessário para a geração pode ser enviado ao provider escolhido. Quando usa Codex CLI local ou outro provider local, a chamada ocorre no ambiente configurado pelo usuário.

Em todos os casos, a regra de produto deve permanecer clara: a IA auxilia; o usuário é autor e revisor.
