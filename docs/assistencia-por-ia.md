# Assistência por IA

A assistência por IA no AraLearn existe para reduzir atrito na autoria e na revisão de trilhas. Ela é situada, contratual e validada localmente.

## Papel da IA

A IA pode ajudar em dois momentos:

1. planejar a estrutura de um curso até microssequências;
2. gerar ou revisar cards dentro de uma microssequência específica.

Ela não deve receber liberdade para reescrever o projeto inteiro em toda operação. Também não deve substituir a decisão do usuário sobre escopo, aceite e revisão.

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

## Providers

Providers suportados pelo desenho técnico:

- Gemini;
- Codex local;
- OpenAI compatível;
- Fake provider para testes.

A interface de provider deve permitir trocar a origem da resposta sem alterar o contrato do domínio.

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
- conteúdo mínimo para materialização.

Quando uma resposta não passa pela validação, o projeto anterior é preservado. A IA sugere e produz, mas não tem permissão automática para corromper o documento local.

## Privacidade e controle

O projeto é local-first. O envio de conteúdo a uma API remota depende do provider configurado pelo usuário.

O app deve deixar claro que operações remotas podem enviar o contexto necessário para a geração. Quando o usuário optar por provider local, a chamada é feita ao bridge local configurado.
