# Assistência por IA

## Papel da IA

A IA no AraLearn executa tarefas pequenas e situadas. Ela não recebe o projeto inteiro nem decide a didática sozinha.

O app a chama em dois contextos:

- planejamento estrutural do curso
- materialização local de uma microssequência

## Top-down

No top-down, a IA recebe `aralearn.scope.v1` e devolve:

- módulos preservados
- lições
- microssequências planejadas
- objetivos
- dependências locais

Restrições:

- sem cards
- sem expansão fora de `include`
- sem tópicos de `exclude`
- sem módulos novos

## Bottom-up

No bottom-up, a IA recebe apenas um `ContextPacket` local.

Ela pode:

- gerar cards
- melhorar explicação
- acrescentar prática
- criar complemento
- gerar próxima

Cada operação cria uma nova versão da microssequência, sem apagar a anterior.

## Providers

O runtime atual suporta:

- `Gemini`
- `Codex local`
- `OpenAI compatível`
- `Fake`

Todos expõem a mesma ideia de operação estruturada.

## Modos do Codex local

O bridge local do Codex aceita:

- `plan-scope`
- `generate-microsequence`
- `improve-microsequence`
- `add-practice`
- `create-support`
- `generate-next`

## Segurança estrutural

O app continua aplicando validação local depois da resposta da IA:

- escopo
- planejamento top-down
- cards
- densidade mínima por microssequência
- tipo de recurso permitido

Quando a validação falha, o projeto anterior é preservado.

