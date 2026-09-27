# Recuperação de Parâmetros após escrita externa

## Reprodução na 0.0.86

Com a versão hospedada 0.0.86, o curso do ensaio de parametrização estava na revisão 67. Uma escrita
externa por Actions elevou o curso para a revisão 71. O link de Parâmetros abria o painel com
“Parâmetros indisponíveis” e o botão “Tentar novamente” repetia a recusa de revisão desatualizada:
a releitura dos parâmetros reutilizava a revisão antiga do curso, de modo que a ação ficava em ciclo de erro.

## Mecanismo corrigido (0.0.87, local, ainda não publicado)

`refreshCourseAtomically` captura curso, alvo e escopo antes das leituras e só aplica o instantâneo
se rota, seção, alvo e escopo continuarem idênticos; a releitura de Parâmetros passa a carregar o
design do escopo vigente também no caminho contextual, e o contexto instrucional é reiniciado e
recarregado no mesmo epoch. O retry de Parâmetros reusa essa releitura e devolve o foco ao seletor
de grupo. `hasPendingAuthoringDraft` deixa de tratar a moldura `data-course-design-context-dialog`
como bloqueio por si só, mas continua contando formulários sujos.

## Prova local

```powershell
npx.cmd playwright test tests/e2e/course-planning-context.spec.js --config=.tmp/agent/revisao-v10/presentation.playwright.config.mjs --workers=1 --reporter=line
```

Resultado: 15 passed (33,2 s), projeto `android-chromium`, um worker. Os dois casos novos usam o
harness `planningHarness` com `fake controller`, revisões 67→71, escopo `didactic_microsequence`
(`micro-context`), em 390 px (direto) e 1280 px (contextual). Cada caso confere, após “Tentar
novamente”, as leituras `course:71`, `plan:71`, `map:71`, `design:71:didactic_microsequence`, o
foco no seletor de grupo, o valor `before_and_after` com origem `research_condition`, a rota
inalterada e o rascunho de `Justificativa` preservado por `refresh()` = `deferred` sem leitura nova.

- [Parâmetros direto, antes do retry](parameters-retry-direct-before.png)
- [Parâmetros direto, depois do retry](parameters-retry-direct-after.png)
- [Parâmetros contextual, antes do retry](parameters-retry-context-before.png)
- [Parâmetros contextual, depois do retry](parameters-retry-context-after.png)

As duas capturas “depois” foram inspecionadas em pixels pela raiz. As capturas foram copiadas do
resultado do teste preservando nome e bytes.

## Limites

A prova é local e usa controller falso: não é integração hospedada, não comprova a publicação da
0.0.87 e não substitui validação humana. Nenhum gate amplo, deploy ou alteração de versão foi
executado neste lote.
