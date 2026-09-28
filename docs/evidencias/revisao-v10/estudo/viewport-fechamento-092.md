# Fechamento da tela inteira do diagrama — correção 0.0.92

Evidência focal do fechamento fullscreen→inline depois de explorar. Fixture sintética do Estudo (Playwright, projeto `android-chromium`, 390×844 px CSS, DPR 2,625); nenhum curso, conta ou progresso foi aberto ou alterado. As imagens foram copiadas sem edição.

## Contrato verificado

- Com exploração, fechar a tela inteira mantém o **ponto visto** na volta ao inline; sem exploração, restaura a posição inline anterior. O foco volta ao acionador e o host (Unidade ou Explicação) permanece.
- O modo inline é anunciado em `data-diagram-viewport-mode` **depois** de a rolagem restaurada ser aplicada; durante a transição o valor é `inline-settling`.

## Causa corrigida

Ao fechar, a caixa em `display:none` pode zerar geometria e rolagem e emitir `scroll` antes da restauração. Esse estado inválido chegava a ser memorizado e a âncora da restauração caía no centro `(0,0)`, perdendo o ponto visto. A correção ignora medições inválidas ao memorizar e só assenta o modo inline quando a rolagem já foi aplicada. Nenhuma tolerância, espera ou tempo limite de teste foi afrouxado.

## Reprodução

- Sonda local com a fixture real registrou o evento natural em 2 de 14 execuções (perda permanente) e leitura prematura em 5 de 14.
- A regressão mantida na suíte força o mesmo evento pelo caminho real: um listener em fase de captura no `close` despacha `scroll` quando a caixa oculta está `0x0`. É **evento DOM sintético forçado**, não uma ocorrência nativa espontânea do teste.
- A/B: com apenas o guard internalizado neutralizado, o caso falha com desvio de 232 px (mesma assinatura do run de CI); com a correção, passa. A spec do recorte fecha **7/7**.

## Imagens

| Arquivo | Estado | Geometria (centro; escala) |
| --- | --- | --- |
| `viewport-092-unidade-explorado.png` | Unidade, tela inteira explorada | (224; 380,4); 1,25 |
| `viewport-092-unidade-inline.png` | Unidade, inline restaurado | (224; 380,8); 1,25 |
| `viewport-092-explicacao-explorado.png` | Explicação, tela inteira explorada | (224,8; 380,4); 1,25 |
| `viewport-092-explicacao-inline.png` | Explicação, inline restaurado | (224,8; 380,8); 1,25 |

Hashes e bytes no [manifesto](viewport-fechamento-092-manifest.json). O explorado mostra a cadeia *Aguardando nova tentativa → CLOSED → LISTEN*; o inline restaurado mostra o recorte central correspondente (círculo CLOSED e rótulo “abertura passiva”).

## Limites

- O centro do conteúdo é preservado com diferença máxima de 0,4 px entre os estados; o recorte visível é menor no inline e parte dos rótulos fica fora do quadro por efeito do zoom e do pan escolhidos — **não** é encaixe integral.
- Prova de enquadramento e interação em fixture local; não mede aprendizagem nem substitui a suíte. As demais larguras, temas e o curso hospedado têm cobertura própria.