# H005 — comparação de curso grande

Verificação local em 24/09/2026, Node 24.14.0. O limite explícito de resposta de **2 MiB (2.097.152 bytes)** foi mantido. A causa do 413 histórico permanece aberta: faltam corpo da resposta, tamanho do payload e versão hospedada daquele episódio.

## Caminho e medição

A seleção do curso comparado primeiro lê `GET /v1/courses/:id/research`. O handler limita o envelope JSON montado, em bytes UTF-8. O adaptador permite até **8 MiB (8.388.608 bytes)** na resposta interna da leitura de autoria; são fronteiras diferentes. O POST `/v1/authoring-comparison` calcula o diff dos snapshots e reconsulta as duas revisões.

O teste runtime usa cliente, handler HTTP, adaptador, leitura limitada, montagem de snapshot e diff reais, em servidor restrito ao localhost. **Dados e identidade são simulados**, declaradamente; não há MCP Auth real, remoteAuth, SQL, banco, API de provedor ou serviço hospedado. As RPCs sintéticas sempre respondem 200: os 413 vêm do código do produto.

Os 13 casos reproduzíveis mediram:

| Casos | Dados medidos | Resultado |
| --- | --- | --- |
| 1 | 76 unidades; envelope de 244.717 bytes | 200 |
| 2–4 | Envelope de 2.097.151 / 2.097.152 / 2.097.153 bytes | 200 / 200 / 413 `response_too_large` |
| 5–6 | 696 unidades, envelope de 2.099.085 bytes; leitura repetida | Mesmo 413; uma chamada por tentativa, sem retry automático |
| 7 | Cada snapshot tem 2.099.049 bytes; envelope do diff tem 905.660 | POST 200, igual ao diff local; duas leituras e duas rechecagens |
| 8 | Escopo reduzido: envelope de 20.703 bytes | 200 |
| 9–10 | Inventário global de 1.100 itens: envelopes de 2.330.518 / 2.330.598 bytes no curso/recorte | Ambos 413 |
| 11 | RPC com exatamente 8.388.608 bytes | Passa pelo adaptador; envelope de 8.909.705 excede o handler |
| 12–13 | RPC com 8.388.609 bytes, com/sem Content-Length | 413 `course_authoring_analytics_response_too_large`, inclusive no streaming |

695/696 são quantidades específicas desta fixture, não um limite universal de unidades. O GET não tem corpo; o POST medido tem 236 bytes. O inventário permanece global: reduzir o escopo não garante caber. Na interface, o seletor de parte só aparece depois da leitura inicial do curso comparado.

## Orientação e verificação

Para status 413 com `response_too_large`, `course_authoring_analytics_response_too_large` ou `course_response_too_large`, o painel informa: “Leitura acima do limite. Escolha outro curso ou uma parte menor, se disponível.” Não altera cotas, consultas, paginação nem o filtro global de mensagens.

A matriz de 12 casos preserva 401/403/409, 500/502/503/504 e erros fora dessa combinação de status/código. As três regressões de mensagem falharam antes da correção e passaram depois. O conjunto focal passou 42 verificações contando grupos e testes existentes; após encurtar a mensagem para caber no aviso, os 12 casos de mensagem foram revalidados.

Seis E2E passaram no Chromium, em 390×844: três códigos em duas etapas, seleção do curso (claro) e comparação (escuro). Capturas foram inspecionadas. O aviso inteiro fica visível, sem orientação de repetir; selecionar outro curso conclui a comparação, e Escape restaura o foco. Os erros do E2E são estímulos simulados para testar apresentação, não prova de causalidade. ESLint focal passou.

Reprodução nas suítes existentes:

```powershell
npm.cmd run test:focal -- tests/runtime/revisao-v7-large-comparison.test.js tests/runtime/course-analytics-panel.test.js tests/runtime/public-error-message.test.js
$env:ARALEARN_E2E_PORT='4202'
npm.cmd run test:e2e -- tests/e2e/revisao-v7-large-comparison.spec.js --project=android-chromium --retries=0 --forbid-only
```

O runtime imprime medições em bytes; o E2E grava capturas no diretório de resultados do Playwright. A prova não estabelece capacidade de produção nem reproduz o curso histórico.
