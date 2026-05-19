# Codex CLI local

O provider `codex-cli` permite usar o AraLearn com um bridge HTTP local, sem depender de uma API remota para as operações de geração.

## Finalidade

O bridge local recebe uma operação estruturada do AraLearn, encaminha o prompt ao Codex CLI e devolve uma resposta para validação pelo app.

Ele usa os mesmos modos esperados pelos providers remotos, o que preserva a arquitetura de geração.

## Endpoints

Endpoint de assistência:

```text
http://127.0.0.1:4183/assist
```

Health check:

```text
http://127.0.0.1:4183/health
```

## Modos suportados

- `plan-scope`;
- `generate-microsequence`;
- `improve-microsequence`;
- `add-practice`;
- `create-support`;
- `generate-next`.

## Executar

```bash
npm run codex:local
```

Depois disso, configure o provider no app usando o endpoint local.

## Configuração

A interface do AraLearn permite informar:

- endpoint;
- token, quando usado;
- modelo;
- densidade padrão;
- demais parâmetros do provider.

## Observações técnicas

- O bridge envia prompts ao Codex via `stdin`.
- Quando necessário, o bridge pode usar arquivo temporário local para prompts maiores.
- A resposta ainda passa pela validação do AraLearn antes de entrar no projeto.
- O uso local não elimina a necessidade de revisar o conteúdo gerado.
