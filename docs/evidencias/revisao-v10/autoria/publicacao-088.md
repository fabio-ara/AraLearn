# Publicação da 0.0.88

O site e o backend da **0.0.88** foram publicados em 27/09/2026. A release do APK permanece em rascunho neste marco; a intervenção v10 e o curso novo continuam em andamento.

| Etapa | Identidade e resultado |
| --- | --- |
| Candidata | `dc63d185ed2813410f61eb2f3ae550432d69b518`; seis gates locais passaram, sem reuso, em 883,921 s; `candidate:ready` passou |
| CI protegida | [36335065969, tentativa 1](https://github.com/fabio-ara/AraLearn/actions/runs/36335065969): cinco jobs em sucesso, incluindo pgTAP, integração de canais na stack local e web |
| Integração | [PR 412](https://github.com/fabio-ara/AraLearn/pull/412), commit `baa4db4405ce2fe0007b4a47a9acaeb5b353b3de`; diferença de conteúdo entre head aprovado e merge: zero |
| Preparação | [36337255174, tentativa 1](https://github.com/fabio-ara/AraLearn/actions/runs/36337255174): candidata integrada, APK assinado e prova nativa passaram |
| Backend | Aplicação única entre 17:47:36 e 17:48:56 UTC: duas migrações novas, três funções atualizadas; inventário final 240/240, sem divergência |
| Site | [36338454669, tentativa 1](https://github.com/fabio-ara/AraLearn/actions/runs/36338454669): sucesso; 203 recursos conferidos às 17:51:52 UTC. O manifesto do pacote Pages contém 202 arquivos |

A árvore Git aprovada é `7c402384aff10a5ed13866f7c45caea6aa512d24`. O APK Android 234 tem SHA-256 `2eadb8e470d0c6c0844656b9d311ea041589cf2a1dafcbae79fc3fed6c8101bc`; o manifesto assinado, `c7973c990c2e06c7b047e6e222e7087ce16dd5bf2da089e0e0aabe9588a32588`. A preparação exerceu instalação nova, atualização 213→234 e reinstalação, preservando identidade, certificado e preferência. As imagens nativas inspecionadas pela raiz mostram bootstrap e Aparência; não são prova de Estudo ou do curso novo.

As migrações aplicadas foram `20260928094500_compact_ai_inspection_receipts.sql` e `20260928100000_revisao_v10_bpmn_inspection_runtime.sql`. O catálogo conserva 34 componentes e 52 recursos declarados do runtime. Catálogo de componentes: `1-fca7730b`, fingerprint `sha256:e97467a8e1a1fb436f743a1d9fae39e686b1537211e68d66ab61f6c339223475`. O catálogo de autoria 10.0.0 conserva 56 tarefas e 30 operações Actions; fingerprint `sha256:9c1198f92e19d7db76367c8913458cfbdb04719a7dda4bdc78055ead06fbed0f`.

Os smokes hospedados de OAuth inicial/renovado, fronteiras, autoria e limpeza passaram no processo canônico de implantação. São provas por CLI/HTTP de diagnóstico, distintas da atuação real do ChatGPT.

## Configuração dos clientes e uso real

O OpenAPI 0.0.88 foi inserido no GPT de autoria existente, salvo após a confirmação “GPT atualizado” e relido integralmente depois de recarregar o editor. A conferência das 30 operações e dos 99.842 caracteres, sem newline final, foi exata; OAuth foi preservado e nenhuma credencial foi editada. SHA-256 do artefato com newline: `f19b3a80952884def82fed58b2d6de6e8269b5c4b050bd0c2558d5cd8cffc099`. Isso comprova configuração, sem substituir uma jornada real.

A conexão MCP existente recebeu “Atualizar ferramentas”; o controle concluiu sem erro e preservou a autorização. Uma conversa normal em Chat, com potência Média, produziu a [primeira etapa nova da 0.0.88](ms10-mcp-088-primeira-producao.md). A produção, releitura, inspeções de IA e aterrissagem têm provas próprias. A [revisão focal da primeira etapa pelo Actions](ms1-actions-088-recuperacao.md) é registrada separadamente, para não atribuir a esse canal a prova do MCP.

Nenhum resultado desta intervenção constitui validação humana pós-correção.
