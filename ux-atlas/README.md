# Atlas visual — frontend alvo para Codex

Esta é a única especificação de UX/UI adicionada à branch `ux/codex-frontend-v11`.

- Base funcional: `main` atual.
- Cobertura/navegação alvo: `ux-atlas/`.
- Identidade visual de Estudo: `ux-atlas/STUDY-VISUAL-BASELINE.md`.
- Gate contra overengineering: issue #174.
- Sequência permitida: #151 → #152 → #153 → #154 → #155; depois **parar**.

Comece por `ux-atlas/CODEX-HANDOFF.md`.

Abra `ux-atlas/index.html` para navegar pelo Atlas.

Validação estrutural:

`node ux-atlas/validate.mjs`

Código legível do Atlas:

`node ux-atlas/extract.mjs`

Isso gera `atlas.generated.js`, `graphs.generated.js` e `atlas.generated.css`.

Branches antigas de exploração do Atlas e issues #156–#168 não são base de implementação desta release.