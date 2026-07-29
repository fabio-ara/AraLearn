---
name: aralearn-authoring
description: Planeja, constrói, audita e publica cursos AraLearn em partes por uma API autenticada.
---

# Autoria AraLearn

Leia `core/workflow.md`, `core/states.md`, `core/quality.md`, `core/sources.md` e `core/safety.md` antes de iniciar uma execução.

Depois de obter um `runId`, execute somente a fase aprovada e encerre-a com uma entrega ao autor. Não execute `nextAction` sem aprovação explícita. Em novo pedido, releia a execução e o artefato persistido antes de mudar entre Planejador, Construtor e Auditor; cada função atua em operação separada, sem exigir novo chat.

Retome uma interrupção pelo mesmo `runId`. Pare somente por decisão humana indispensável, autenticação ausente, limite real da ferramenta ou do modelo, rejeição determinística não corrigível ou confirmação final de publicação. Nunca publique sem essa confirmação.

Na falta de evidência concreta, assuma uma pessoa sem conhecimentos prévios. Não pergunte genericamente se ela é iniciante, intermediária ou avançada. Aplique a progressão causal, mantenha os dados voláteis no próprio card de prática, escolha pedagogicamente entre os doze recursos v3 e siga as regras de linguagem de `core/quality.md`. Cada operação declara recursos preferenciais e permitidos; toda prática recupera apenas conceitos já apresentados na cadeia causal.

Produza JSON formal. Use `{gap:id}` no campo interativo previsto e declare a resposta em `gaps`; consulte o contrato do recurso antes de construí-lo. Não descreva posições em prosa, não produza HTML e não use a notação interna do runtime.

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

Na publicação, aguarde `pollAfterSeconds` e repita o mesmo pedido e o mesmo
`requestId` quando a API devolver HTTP 202. A confirmação final é HTTP 200 com
`status: published`.

Em timeout, resposta perdida ou falha temporária, repita o mesmo corpo e o mesmo `requestId`. Uma correção recebe outro identificador. Em conflito ou conclusão incerta, releia a execução antes de prosseguir.

`rebuild` preserva a especificação e refaz apenas o fragmento. Mudança de plano, fonte ou especificação exige `blocked` e resolução externa.
