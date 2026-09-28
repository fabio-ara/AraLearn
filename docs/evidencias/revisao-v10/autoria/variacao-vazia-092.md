# Variação exigida da prática — conjunto vazio (0.0.92)

Evidência focal do parâmetro **Variação da prática** no painel de Parâmetros, em Unidade de estudo, a 390×844 px CSS (DPR 2,625). A prova usa a fixture E2E com renderer e CSS reais e controlador simulado — **não** é backend hospedado — e as imagens foram copiadas sem edição.

## O que as imagens mostram

- “Aplicado nesta produção: **Nenhuma dimensão exigida**.” — o conjunto vazio é escolha explícita, não pendência.
- “Aplicado nesta produção: **Automático · escolha contextual pendente**.” — o valor nulo continua pendência de calibração, distinto do conjunto vazio.

## Interação conferida

No editor do mesmo parâmetro, fixar valor sem marcar nenhuma dimensão e salvar registra `value: []` no comando de escrita — lista vazia, não nulo. Reaberto, o painel mostra “Fixo: Nenhuma dimensão exigida”. O mínimo de oportunidades é outro parâmetro e permanece obrigatório.

## Limites

- Prova de fixture local com controlador simulado; a cobertura de migração, PGlite e adaptador tem provas focais próprias e a migração do corte ainda aguarda aplicação.
- Os trechos exigem rolagem do painel; o conteúdo não cabe inteiro no quadro.
- Nenhum resultado constitui validação humana.
