# Plano cartesiano — associação de rótulos e exploração (recorte 089)

Recorte focal da revisão v10 sobre o pacote `aralearn.resource.plane`: garantir que cada rótulo continue ligado ao seu ponto e que todo texto permaneça alcançável quando a geometria não cabe na largura do aparelho.

## O que mudou

O plano reutiliza o quadro compartilhado de diagramas já usado por outros pacotes (`renderDiagramViewportShell` e `hydrateDiagramViewport`). O SVG mantém largura natural — área de plot de 520px, cerca de 597px no total — com tipografia em escala 1:1, e o quadro oferece rolagem, pinça, zoom e tela inteira. A largura conceitual do celular deixa de forçar o encaixe do diagrama.

O encaixe dos rótulos parte sempre da âncora real da marca do ponto; quando um rótulo precisa sair do lugar, uma linha-guia pontilhada mantém o vínculo visível, em geometria e nunca só por cor. A passagem é determinística e não acumula deslocamento. O enquadramento inicial acontece antes da hidratação do quadro, para que uma visão lembrada da mesma `stateKey` prevaleça sobre o enquadramento.

## Provas

**Dados literais (exportação existente, sem API).**

- U2/U6: eixo X `[30, 33]`, rótulo `Entregas` e pontos `Base 30`…`Flex 33`. Em 320 e 390, nos dois hosts, sem sobreposição de rótulos e sem perda de associação; o restante do gráfico fica acessível por rolagem. Ver `01-literal-u2u6-unidade-320.png` e `02-literal-u2u6-explicacao-390.png`.
- Plano da Explicação que originalmente clipava o eixo: eixo X `[29, 34]`, rótulo `Número de entregas no mês`. O título completo aparece em três linhas quando trazido à vista (`03-literal-exp-eixos-explicacao-390.png`).

**Dados sintéticos (separados do literal).**

- Variante de eixo longo (X `[29, 34]`) em 320/390/430/1280, em fontes padrão e maiores: zero sobreposições e nenhum estouro horizontal no documento.
- Densidade com 12 rótulos longos, dois pares coincidentes e um ponto na borda: zero sobreposições em 320 e 390; todos os rótulos são alcançáveis na rolagem e na tela inteira (`04-denso-interacao-tela-inteira-unidade-320.png`).

**Prova de reidratação (defeito encontrado na revisão).**

A sonda monta o pacote real, aciona seu controle de zoom e altera a rolagem programaticamente; depois remonta o pacote com a mesma `stateKey`. A escala e a rolagem são restauradas exatamente, e a primeira abertura continua enquadrando o conteúdo. Essa prova de estado é separada da exploração interativa do caso denso nos hosts.

| Momento | escala | rolagem (x, y) |
| --- | --- | --- |
| Primeira abertura | 1.000 | 187, 23 |
| Após pan + zoom | 1.250 | 271, 59 |
| Após reidratar | 1.250 | 271, 59 |

Ver `05-reidratacao-320.png`.

## Testes e hashes

- `node --test` nos quatro arquivos focais (plano, renderização de pacotes, tipografia e quadro de diagramas): **41 passed**.
- `eslint` nos arquivos do recorte e `git diff --check`: exit 0.
- Hashes SHA256 dos arquivos de código e das capturas: ver `manifesto.json` nesta pasta.

## Limites

Capturas de um fixture local headless com os hosts reais do estudo; não é produção. O canvas interno mantém largura natural e exige rolagem em largura estreita — comportamento compartilhado, escolhido no lugar de encolher rótulos e eixos. Sem `syncEdge`, Chrome pessoal, curso hospedado, deploy, CI ou gate amplo nesta entrega.
