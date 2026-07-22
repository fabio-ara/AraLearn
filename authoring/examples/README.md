# Exemplo de um ciclo completo

O exemplo ensina a regra básica da conjunção lógica em uma única parte. O tamanho reduzido permite acompanhar cada transição sem sugerir que cursos reais devam ter apenas uma parte.

1. `01-run.json`: execução aberta;
2. `02-plan.json`: esqueleto do curso, manifesto do registro e contornos compactos das partes;
3. `03-ledger-sources-chunk.json`, `04-ledger-claims-chunk.json` e `05-ledger-terms-chunk.json`: registro enviado em trechos limitados;
4. `06-plan-finalize.json`: conferência do manifesto e encerramento do planejamento;
5. `07-part-specification.json`: orientação detalhada da primeira parte, gravada somente quando ela se torna a próxima parte causal;
6. `08-part-spec.json`: contexto devolvido pela API para a produção;
7. `09-part-submission.json`: fragmento produzido;
8. `consultarEntregaDaParte`: leitura obrigatória do fragmento persistido;
9. `10-audit.json`: auditoria do conteúdo efetivamente gravado;
10. `11-publication-progress.json`: resposta intermediária que pede a repetição segura da publicação;
11. `12-run-published.json`: execução concluída após validação e publicação.

O campo `submissionSha256` da auditoria copia o `fragmentHash` devolvido pela leitura da entrega. Ele não é calculado sobre o arquivo de submissão. O `submissionReadReceipt` do exemplo apenas representa o formato; em uma execução real, copie o valor temporário assinado que a API devolveu nessa mesma leitura.

`alternatives/` traz exemplos de bloqueio, reparo, reconstrução, reabertura depois da validação final, retomada e cancelamento. Os corpos enviados à API permanecem definidos pelo OpenAPI.
