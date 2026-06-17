# Contribuição

O AraLearn mantém `main` como linha pública curada. Mudanças novas devem chegar por branch temática, com histórico revisado antes do merge.

## Fluxo recomendado

1. Crie uma branch curta e específica a partir de `main`.
2. Trabalhe em um assunto coeso por branch.
3. Escreva commits curtos, claros e em português.
4. Reorganize localmente a branch antes de abrir o PR, se o percurso tiver ficado ruidoso.
5. Execute `npm test` e `npm run validate:example`.
6. Atualize `README.md` e `docs/` quando a mudança alterar comportamento, fluxo ou contrato público.
7. Abra um PR com descrição objetiva, impacto visível e validações executadas.

## Regras do histórico público

- `main` deve permanecer linear e legível.
- Evite merge commit quando rebase ou squash produzirem histórico mais claro.
- Não publique commits de percurso, mensagens automáticas de reversão ou descrições operacionais internas.
- Se uma branch intermediária ficou desorganizada, reorganize-a antes do merge.

## Linguagem e documentação

- Preserve acentuação, caracteres especiais e codificação UTF-8.
- Prefira vocabulário técnico claro, sem jargão desnecessário.
- Em documentação pública, descreva o produto e o comportamento do app; evite comentários sobre o processo editorial.
