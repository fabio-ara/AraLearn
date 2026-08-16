# Conformidade de documentação e código da Autoria

Este relatório registra a confrontação realizada no checkpoint da #109. Ele
não certifica qualidade pedagógica ou aceitação humana; aponta onde cada
afirmação operacional pode ser reencontrada e qual teste automatizado a exerce.

| Assunto publicado | Implementação principal | Evidência automatizada |
| --- | --- | --- |
| desenho, parâmetros, `ResourceSet` e manifesto | `src/authoring/`, `instructionalDesignContracts.js`, migrations de desenho | domínio, PGlite parametrizado, serviço de desenho e MCP/Action |
| fluxo responsivo de Autoria | `AuthoringWorkspaceSurface.js`, view-model, cliente e `public/styles.css` | runtime de cliente/view-model e Playwright 360/390/412/1280 |
| auditoria, finding, reparo e reauditoria | `instructionalConformanceAudit.js`, serviço, migration #106 | domínio, PGlite, paginação, currentness e E2E de findings |
| experimento, condição, lock, freeze e atribuição | `instructionalExperiment.js`, migration #107, adapters | domínio, PGlite de jornada, service e regressões de privacidade/retirada |
| outcomes e analytics | `authoringAnalytics.js`, serviço e migration #108 | domínio, serviço, PGlite, exportação e superfície Resultados |
| pacotes distribuídos para assistentes | `authoring/`, schemas, gerador de packages | sync de schemas/Edge e `testAuthoringPackages.mjs` |
| linguagem pública e limites | `docs/`, knowledge e textos de interface | `auditDocumentation.mjs`, guidance e testes de regressão documental |

## Resultado do checkpoint

`node scripts/auditDocumentation.mjs` passou depois das atualizações de
documentos, materiais de autoria e textos de interface. `npm test` também roda
essa auditoria junto dos contratos, do runtime e dos packages. A documentação
de experimentos e analytics mantém a distinção entre dado disponível,
proveniência, decisão humana, ausência e inferência científica.

## Limites de verificação

- testes locais não equivalem a uma implantação hospedada;
- PGlite não substitui pgTAP em uma stack Supabase local;
- referências científicas sustentam conceitos e hipóteses, não eficácia do
  produto;
- uma pessoa leiga ainda precisa executar o
  [roteiro de aceitação](roteiro-aceitacao-humana-autoria.md).

O relatório de execução, métricas e comandos está em
[evidence/authoring-integrated-validation-2026-08-16.json](evidence/authoring-integrated-validation-2026-08-16.json).
