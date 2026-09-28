# Variação exigida da prática — conjunto vazio (0.0.92)

Evidência focal do parâmetro **Variação da prática** no painel de Parâmetros, em Unidade de estudo, a 390×844 px CSS (DPR 2,625). A prova usa a fixture E2E com renderer e CSS reais e controlador simulado — **não** é backend hospedado — e as imagens foram copiadas sem edição.

## O que as imagens mostram

- `variacao-vazia-092-aplicado.png` — parâmetro **Variação da prática**: “Aplicado nesta produção: **Nenhuma dimensão exigida**.” O conjunto vazio é escolha explícita, não pendência.
- `variacao-vazia-092-pendencia.png` — parâmetro **Formas de explicação**: “Aplicado nesta produção: **Automático · escolha contextual pendente**.” Contraste do estado nulo de outro parâmetro, não variação da prática com valor nulo.

## Interação conferida

No editor do mesmo parâmetro, fixar valor sem marcar nenhuma dimensão e salvar registra `value: []` no comando de escrita — lista vazia, não nulo. Reaberto, o painel mostra “Fixo: Nenhuma dimensão exigida”. O mínimo de oportunidades é outro parâmetro e permanece obrigatório.

## Limites

- Fixture E2E local com renderer e CSS reais e **controlador simulado**; não é backend hospedado nem escrita real no Supabase (migração do corte: `20260928120000`).
- Os trechos exigem rolagem do painel; o conteúdo não cabe inteiro no quadro.
- Nenhum resultado constitui validação humana.
