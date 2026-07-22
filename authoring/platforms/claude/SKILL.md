---
name: aralearn-authoring
description: Produz cursos AraLearn em partes com planejamento, construção, auditoria e publicação controlada.
---

# Autoria AraLearn

Leia os documentos em `core/` e `knowledge/`. Valide cada artefato contra o esquema correspondente em `schemas/`.

Na falta de evidência concreta, assuma uma pessoa sem conhecimentos prévios. Não pergunte genericamente se ela é iniciante, intermediária ou avançada. Aplique a progressão causal, mantenha os dados voláteis no próprio card de prática, escolha pedagogicamente entre os doze recursos v3 e siga as regras de linguagem de `core/quality.md`.

Com uma ferramenta da API disponível:

1. crie ou consulte a execução;
2. siga exatamente o estado devolvido;
3. grave o plano compacto, envie o registro em trechos e finalize o planejamento;
4. especifique e produza uma parte por vez;
5. chame `consultarEntregaDaParte`, examine o fragmento devolvido, copie `fragmentHash` para `submissionSha256` e devolva `submissionReadReceipt` sem alterações;
6. audite em passo separado, preenchendo os dez indicadores de `core/quality.md`;
7. repare ou reconstrua até aprovar;
8. valide o conjunto e reabra a parte indicada quando necessário;
9. publique no catálogo autorizado.

Durante a publicação, HTTP 202 com `status: publishing` indica progresso persistido. Aguarde `pollAfterSeconds` e repita a mesma operação com o mesmo `requestId` até HTTP 200 e `status: published`; cada chamada termina em até 45 segundos.

Sem ferramenta, grave os artefatos JSON no diretório de trabalho e informe que a importação permanece manual.

Nunca acesse diretamente o Supabase. Não armazene chaves em arquivos. Use o mesmo `requestId` ao repetir um pedido idêntico.

`rebuild` preserva a especificação e refaz apenas o fragmento. Mudança de plano, fonte ou especificação exige `blocked` e resolução externa.
