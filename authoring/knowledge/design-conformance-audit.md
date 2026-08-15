# Conformidade do desenho e da materialização

## Guia de recuperação

- `INTENT`: recupere para `audit` e `repair`; em `create`, `extend` ou `revise`, use apenas para conferência prospectiva antes do manifesto.
- Combine com `semantic-audit.md` para julgamento semântico e com o estado persistido corrente para fatos.
- Não trate a conferência da #104 como o motor completo de findings, decisão humana, reparo e reauditoria previsto para a #106.

## Cadeia comparável

Compare, por referências versionadas, fontes e objetivo, análise instrucional, valores efetivos do snapshot, ResourceSets aplicáveis, blueprint, cards e manifesto de materialização. O manifesto descreve o que foi produzido; não substitui cards, blueprint ou snapshot e não prova qualidade ou aprendizagem.

## Checks factuais

Checks determinísticos podem verificar referências ausentes ou obsoletas, violação de ResourceSet, package, versão, papel ou ajuste não autorizado, seleção sem autorizador, diferença entre package selecionado e usado, cobertura declarada sem alvo, métricas sem unidade ou denominador, hash divergente e estado materializado depois do snapshot sem novo manifesto. Esses resultados descrevem conformidade estrutural.

## Auditoria semântico-instrucional

O assistente compara requisitos e conteúdo para localizar compressão excessiva, desenvolvimento explicativo insuficiente, teoria que apenas menciona, prática que mede outra operação, prática antes da fundamentação, resource inadequado, substituição tratada como equivalência e lacuna de cobertura. Cite o alvo e a evidência observável; não revele raciocínio privado nem atribua score artificial.

## Autoridade humana

Um finding não autoriza reparo. A pessoa decide quais achados serão corrigidos. O reparo posterior altera somente o escopo aprovado e a reauditoria relê independentemente o estado corrente. Nunca certifique eficácia educacional a partir da conformidade do contrato.

## Na materialização corrente

Antes de registrar o manifesto, valide cards e representação, confira se todo uso corresponde a uma seleção autorizada e registre limitações. Depois releia o estado persistido. Se houver divergência factual, não esconda a falha nem registre o manifesto como se o desenho tivesse sido cumprido.
