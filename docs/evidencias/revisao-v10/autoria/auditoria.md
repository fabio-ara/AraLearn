# Auditoria mecânica de exportação de curso

Esta evidência registra o auditor local que faz a pré-triagem de uma exportação completa de curso antes da leitura semântica. O script [auditRevisaoV10Course.mjs](../../../../scripts/auditRevisaoV10Course.mjs) é somente leitura: não grava no curso, no backend nem em arquivo versionado, e reutiliza `normalizeCourseAuthoringExport`, `inspectPedagogicalEvidence`, `PEDAGOGICAL_AUDIT_DIMENSIONS`, `validateStudyUnitEnvelope` e `RESOURCE_PACKAGE_REGISTRY`.

## Comando

```
node ./scripts/auditRevisaoV10Course.mjs /caminho/externo/export.json --out /caminho/externo/relatorio.json
```

A entrada é um arquivo externo ao repositório ou sob `.tmp/agent/`; o relatório sai ao lado dela quando `--out` é omitido. `--quiet` mantém apenas o arquivo de relatório.

## Entrada aceita

1. `{ authoringExport: { contract, course, scope, analytics, artifact } }`;
2. `{ context: { authoringExport: { ... } } }` ou `{ result: { authoringExport: { ... } } }`;
3. `{ contract, course, scope, analytics, artifact }`.

Respostas paginadas em fragmentos são recusadas com erro explícito: a reconstituição por continuação pertence ao canal, e o auditor recebe a exportação já completa.

## Saída

O relatório traz a integridade da exportação; a contagem de microssequências, unidades, requisitos e aplicações; os códigos de contradição mecânica com a unidade correspondente; o inventário do catálogo, com os 34 packages esperados, os usados, os ausentes, os desconhecidos e a cobertura; e, por microssequência, as oito dimensões da revisão com os sinais mecânicos anexados.

## Limites

Sem unidade de estudo materializada a análise é vazia. Nesse estado, zero envelopes inválidos e nenhum código de contradição não significam aprovação: significam que não havia o que validar, e o relatório marca `analiseVazia: true`. A cobertura mede apenas o que já foi materializado; enquanto o curso está bloqueado, ela não é indicador de qualidade.

As oito dimensões — objetivo, explicação, operação-alvo da tarefa, evidência, prática, feedback, adequação de representação e carga visual — saem como `NAO_VERIFICADO`. O script não julga significado nem pixels; a leitura semântica das sete primeiras e as capturas do Estudo para a oitava continuam obrigatórias, e nenhuma contagem ou envelope válido substitui esse julgamento.

O resultado é pré-triagem do produtor, não certificação de aprendizagem nem parecer por alvo.

## Prova de execução

Execução com a exportação temporária bloqueada em `.tmp/agent/revisao-v10/`, sem alterar o curso:

- integridade da exportação: ok; código de saída 0; `analiseVazia: true`;
- 24 microssequências, 0 unidades, 5 requisitos de evidência e 0 aplicações declaradas;
- inventário: 3 de 34 packages usados (cobertura 8,8%), 31 ausentes e nenhum desconhecido;
- oito dimensões em `NAO_VERIFICADO`;
- SHA-256 da entrada temporária: `7d66d26cab019e1ccfabe15c79fc3c600a059265752aa8d36d57842dff95eb2d` (conferir com `Get-FileHash -Algorithm SHA256`).

Contagens, código de saída e hashes registrados aqui descrevem o mecanismo; o conteúdo do curso e os identificadores da exportação permanecem fora do repositório.
