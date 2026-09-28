# Publicação 0.0.90 — site e backend; APK em rascunho

**Marco de 28/09/2026: site e backend 0.0.90 publicados; APK Android 236 em rascunho.** A publicação transporta a leitura e a inspeção dos parâmetros, a exploração dos planos cartesianos e a correção da área segura Android. Não conclui o curso nem a intervenção, não exclui o legado e não constitui validação humana.

## Da candidata à publicação

A candidata 0.0.89 passou pela [CI 36360515040/1](https://github.com/fabio-ara/AraLearn/actions/runs/36360515040) e foi integrada pela [PR 413](https://github.com/fabio-ara/AraLearn/pull/413). Sua [preparação 36362395756/1](https://github.com/fabio-ara/AraLearn/actions/runs/36362395756) falhou no percurso nativo Configurações → Aparência: o cabeçalho estava sob a barra de status. Não houve publicação de site ou aplicação de backend dessa preparação. O erro foi tratado como defeito do produto; controles e coordenadas do gate não foram relaxados. A [correção e a prova pós-patch](../android/insets-090.md) identificam separadamente o APK experimental 235 e o oficial 236.

| Marco 0.0.90 | Identidade e resultado |
| --- | --- |
| Preparação local | Head `694a755af9cefeb1bddf75c039356bd017a1da3a`; cinco gates PASS, sem reuso: preflight, lint, contrato do runtime, testes selecionados e Android. Runtime: 2.601 aprovados, zero falhas e 15 ignorados. `candidate:ready` consumiu esse recibo |
| CI protegida | [36365593878/1](https://github.com/fabio-ara/AraLearn/actions/runs/36365593878): preparação, Supabase, Android, web e agregador PASS, incluindo pgTAP, paridade no banco descartável real, integração e E2E |
| Integração | [PR 414](https://github.com/fabio-ara/AraLearn/pull/414), merge `8ca514d51bdfa9d4bbabecbe35808525f030f036`; mesma árvore do head testado: `616ea83bb2eb67c0861cfff7ca2bea08cfcf233b` |
| Preparação oficial | [36367838390/1](https://github.com/fabio-ara/AraLearn/actions/runs/36367838390): candidata integrada, APK assinado e instalação/upgrade PASS; site e finalização pulados |
| Backend | Aplicação canônica concluída: uma migração nova, três funções atualizadas e inventário final 241/241, sem pendências |
| Site | [36369152073/1](https://github.com/fabio-ara/AraLearn/actions/runs/36369152073): job 108761551302 PASS; 203 recursos efetivamente servidos conferidos. Finalização da release pulada |

As contagens de testes pertencem a seus recortes e não devem ser somadas como casos únicos. As provas focais anteriores permanecem identificadas nos documentos de [parâmetros](parametros-inspecao-089.md), [plano cartesiano](../estudo/plano-cartesiano-089.md) e [Android](../android/insets-090.md). A publicação supera suas indicações históricas de implantação pendente; não transforma fixtures locais em jornadas hospedadas.

## Backend, contrato e convenção de hashes

A implantação executou 212 testes focais, todos aprovados. O ensaio de migração identificou somente `20260928110000_configuration_realization_inspection.sql`, depois aplicada; não houve seeds ou alteração de roles. O lint canônico passou com os avisos registrados, sem declará-los corrigidos. Foram implantadas `aralearn-course-api`, `aralearn-authoring-action` e `aralearn-authoring-mcp`. CORS de API/Actions, OAuth inicial e renovado, fronteiras, autoria de fixture e limpeza passaram por CLI/HTTP. São diagnósticos de engenharia, **não autoria do curso pelo ChatGPT**.

O recibo da publicação confirmou backend `verified`, schema `20260928110000`, contrato runtime 1 e 53 capacidades declaradas. O catálogo de autoria 11.0.0 conserva 56 tarefas e 30 operações Actions, fingerprint `sha256:62ec2b77f44313f7d714ee27a46e29f1f9f7baf8fe994f4af5e489623523b887`. O OpenAPI servido é 0.0.90, SHA-256 `a5c21d08d004d33c492d7e2c1e11a25d8ddec62985714484316ec40401961f06` com quebra de linha final. A configuração dos clientes foi conferida separadamente, como descrito abaixo; os verificadores hospedados não recebem esse crédito.

Para a migração 28110000, o SHA-256 dos bytes **LF do blob Git** é `5da6bb59a6861262224b098dad060ed41cb06dc0c5f694875e2ec45a6c41c53f`, idêntico desde o commit `228ee9c9`. O hash histórico `032f7552b68db9421311b8cac47a01b43a30026d4bf56b9f0de216484191e778`, registrado na prova local 089, identifica **exatamente a serialização CRLF** do mesmo conteúdo. A diferença é de quebras de linha, não de SQL. A migração preserva históricos de zero/cinco dimensões e repetição exata de tentativas antigas; não cria avaliação retroativa.

## Clientes Actions e MCP

O recibo instrumentado de **28/09/2026 às 02:26:15 UTC** registra a atualização das Actions com o OpenAPI canônico 0.0.90, catálogo 11.0.0 e 30 operações. O esquema foi salvo por **Atualizar**; depois de recarregar o editor e reabrir a ação, versão, catálogo, fingerprint e operações foram relidos. O texto do editor tinha 99.835 caracteres, sem a quebra de linha final do arquivo. OAuth permaneceu intacto. Trata-se de configuração persistida, não de autoria.

O primeiro registro deixou a reconexão MCP pendente por interpretação do agente sobre o mandato. Essa interpretação foi corrigida; não se tratava de bloqueio externo. O recibo instrumentado de **02:29:51 UTC** registra **Reconectar → consentimento autorizado → retorno pela sessão existente → Atualizar ferramentas**, no mesmo plugin e na mesma conta, sem solicitação de senha ou OTP. A releitura confirmou a conexão. O botão de atualização foi acionado uma vez; não houve aviso textual de conclusão capturado, e a conta permaneceu conectada.

Os metadados visuais do plugin mostraram `1.0.0` e, em outra leitura, `dev mode`. Eles **não comprovam o catálogo de tarefas 11.0.0**; essa versão foi conferida no schema das Actions e no artefato canônico. Nenhum segredo foi lido, exibido ou gerado. Não foram salvas capturas dos clientes, pois as superfícies continham elementos pessoais; não se publicam perfis, nomes de conta ou identificadores privados.

## Artefatos e limites

Os três ZIPs de PREPARAR e os dois da publicação tiveram seus SHA-256 confrontados com os digests do GitHub. Manifesto, origem da preparação, prova nativa e recibo de backend concordam. Os três assets da release foram baixados pela API autenticada e comparados byte a byte com o pacote assinado examinado no gate nativo.

| Artefato | SHA-256 |
| --- | --- |
| APK oficial `AraLearn-0.0.90.apk` | `609d97dc05a5b66dee86069dfaeb550e72f9b0549989e4cea65a0dffebd4e1a9` |
| Recibo `AraLearn-0.0.90.json` | `b33ebb1f34190f80592d6da45a2ec30b70c191f30b86a118738ba67748f79ec4` |
| Certificado histórico da assinatura v2 | `c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296` |

A release 397903597, `AraLearn v0.0.90`, tag `v0.0.90`, aponta para o merge acima e conserva `draft=true`, `prerelease=false`, `published_at=null`. Não há anúncio de download público do APK. O [site servido](https://fabio-ara.github.io/AraLearn/) passou pela conferência de versão, bytes, hashes e configuração; isso não substitui interação no curso.

Instalação limpa 236, upgrade público 213→236 e reinstalação passaram, com UID e tema preservados. Três capturas receberam inspeção visual autônoma; teclado/IME e rotação não foram observados. No corte documental de **28/09/2026**, a [consolidação de planejamento relida](planejamento-088.md) identifica o último marco conferido do curso: **revisão 318, 42 unidades em cinco das 25 microssequências, 17/34 componentes**. A primeira produção da MS11 estava em execução, sem resultado incluído neste documento; a autoria 0.0.90 depende de seu registro próprio. Curso completo, inspeções pendentes, cobertura restante, release final e substituição segura do legado continuam abertos.
