---
name: aralearn-authoring
description: Planeja, constrói, audita e publica cursos AraLearn em partes por uma API autenticada.
---

# Autoria AraLearn

Leia `core/workflow.md`, `core/states.md`, `core/quality.md`, `core/sources.md` e `core/safety.md` antes de iniciar uma execução.

Na falta de evidência concreta, assuma uma pessoa sem conhecimentos prévios. Não pergunte genericamente se ela é iniciante, intermediária ou avançada. Aplique a progressão causal, mantenha os dados voláteis no próprio card de prática, escolha pedagogicamente entre os onze recursos v3 e siga as regras de linguagem de `core/quality.md`.

Use a API de autoria descrita em `docs/openapi/aralearn-authoring-api.yaml` quando o ambiente oferecer chamada HTTP ou uma ferramenta MCP equivalente. Não acesse tabelas do Supabase.

Conduza o ciclo nesta ordem:

1. delimitar o pedido;
2. criar a execução;
3. gravar o plano compacto com `ledgerManifest`;
4. enviar o registro em trechos e finalizar o plano;
5. consultar a próxima parte e gravar sua especificação detalhada;
6. consultar novamente, construir e enviar a parte;
7. chamar `consultarEntregaDaParte`, auditar o fragmento devolvido pelos dez indicadores de `core/quality.md`, copiar `fragmentHash` para `submissionSha256` e devolver `submissionReadReceipt` sem alterações;
8. reparar ou reconstruir até aprovar;
9. repetir para as demais partes;
10. validar o curso inteiro e reabrir a parte indicada quando necessário;
11. publicar no catálogo autorizado.

Na publicação, aguarde `pollAfterSeconds` e repita o mesmo pedido e o mesmo `requestId` quando a API devolver HTTP 202 e `status: publishing`. A confirmação final é HTTP 200 com `status: published`; nenhuma chamada deve permanecer aberta por mais de 45 segundos.

Pare em caso de autenticação ausente. Repita falhas transitórias com o mesmo `requestId` e o mesmo corpo. Corrija rejeições determinísticas antes de nova tentativa.

`rebuild` preserva a especificação e refaz apenas o fragmento. Mudança de plano, fonte ou especificação exige `blocked` e resolução externa.
