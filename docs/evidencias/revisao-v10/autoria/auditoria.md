# Auditoria mecânica de exportação de curso

Esta evidência registra o auditor local que faz a pré-triagem de uma exportação completa de curso antes da leitura semântica. O script [auditRevisaoV10Course.mjs](../../../../scripts/auditRevisaoV10Course.mjs) é somente leitura: não grava no curso, no backend nem em arquivo versionado, e reutiliza `normalizeCourseAuthoringExport`, `inspectPedagogicalEvidence`, `inspectBpmnAuthoring`, `PEDAGOGICAL_AUDIT_DIMENSIONS`, `validateStudyUnitEnvelope` e `RESOURCE_PACKAGE_REGISTRY`.

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

O relatório traz a integridade da exportação; a contagem de microssequências, unidades, requisitos e aplicações; os códigos de contradição mecânica com a Unidade ou Explicação correspondente; o inventário do catálogo, com os 34 packages esperados, os usados, os ausentes, os desconhecidos e a cobertura; e, por microssequência, as oito dimensões da revisão com os sinais mecânicos anexados. As representações BPMN de conteúdo e feedback usam as mesmas regras formais da autoria; não há regras específicas do curso dentro do script.

## Limites

Sem unidade de estudo materializada a análise de unidades é vazia, e o relatório marca `analiseVazia: true`. Explicações existentes ainda recebem inspeção formal de representações. Zero envelopes inválidos e nenhum código de contradição não significam aprovação. A cobertura mede apenas o que já foi materializado; enquanto o curso está bloqueado, ela não é indicador de qualidade.

As oito dimensões — objetivo, explicação, operação-alvo da tarefa, evidência, prática, feedback, adequação de representação e carga visual — saem como `NAO_VERIFICADO`. O script não julga significado nem pixels; a leitura semântica das sete primeiras e as capturas do Estudo para a oitava continuam obrigatórias, e nenhuma contagem ou envelope válido substitui esse julgamento.

O resultado é pré-triagem do produtor, não certificação de aprendizagem nem parecer por alvo.

A verificação formal pode demonstrar um defeito sem resolver a adequação didática da representação. Por isso, uma contradição BPMN aparece nos sinais e códigos, enquanto a dimensão de adequação permanece `NAO_VERIFICADO` para julgamento posterior.

## Prova de execução

Execução com a exportação temporária bloqueada em `.tmp/agent/revisao-v10/`, sem alterar o curso:

- integridade da exportação: ok; código de saída 0; `analiseVazia: true`;
- 24 microssequências, 0 unidades, 5 requisitos de evidência e 0 aplicações declaradas;
- inventário: 3 de 34 packages usados (cobertura 8,8%), 31 ausentes e nenhum desconhecido;
- oito dimensões em `NAO_VERIFICADO`;
- SHA-256 da entrada temporária: `7d66d26cab019e1ccfabe15c79fc3c600a059265752aa8d36d57842dff95eb2d` (conferir com `Get-FileHash -Algorithm SHA256`).

Contagens, código de saída e hashes registrados aqui descrevem o mecanismo; o conteúdo do curso e os identificadores da exportação permanecem fora do repositório.

Na candidata 0.0.88, a integração das regras BPMN foi exercitada novamente sobre o export completo da revisão 122, preservado com SHA-256 `acedba4d515db419ad97b879dc8258ffe74ac4e336c6484134ef55d777b87d43`. Resultado: 25 microssequências, 31 unidades, 18 requisitos, 28 aplicações declaradas, zero envelopes inválidos e nove ocorrências formais em uma Explicação e duas unidades da mesma microssequência. Foram três ocorrências de intermediário sem entrada sequencial e seis de participante com início sem final. As demais 24 microssequências não receberam esses diagnósticos. O inventário permaneceu em 15/34 componentes e as oito dimensões continuaram `NAO_VERIFICADO`. Execução e lint passaram; o hash de entrada foi reconferido após a leitura. A pré-triagem anterior registrava zero códigos porque ainda não consumia esse inspetor, não porque os diagramas fossem formalmente consistentes.
