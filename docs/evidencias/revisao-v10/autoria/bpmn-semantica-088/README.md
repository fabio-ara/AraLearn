# Eventos BPMN — prova local da candidata 0.0.88

O [manifesto](manifesto.json) preserva 34 PNGs e seus hashes: 16 combinações de largura/host/tema, 16 detalhes dos oito tipos e variantes representados e duas projeções do recurso salvo na revisão 116. São capturas locais do renderer real, anteriores à publicação. Os títulos, as referências e o restante da Unidade/Explicação vêm da fixture hospedeira; não constituem um curso produzido ou revisado pelo GPT.

A fixture pública `tests/helpers/bpmnFixture.js:bpmnEventFixture` tem três participantes, 12 nós e 16 fluxos. Exercita eventos iniciais e finais simples, intermediários que recebem/enviam mensagem e eventos iniciais/finais com várias mensagens. A matriz cobre 320, 390, 430 e 1280 px, Unidade/Explicação e tema claro/escuro.

As vistas de conjunto foram capturadas a 80% por um acionamento normal de diminuir zoom. Os detalhes usam 100%. O pan foi exercido por teclado, mantendo a extensão do desenho e a rolagem interna; essas posições exploradas não certificam, por si, o framing inicial. A verificação focal registrou zero erro de página, legenda inteira, final com círculo simples grosso, intermediário com dois anéis finos visíveis e marcadores derivados das mensagens. Não é uma certificação geral de acessibilidade ou de foco por screenshot.

A raiz inspecionou quatro vistas de conjunto, cobrindo as quatro larguras e ambos os hosts/temas; quatro detalhes de eventos; e uma projeção do recurso real preservado. A coleta do executor registra a inspeção dos demais casos. A [documentação semântica](../bpmn-semantica-088.md) descreve as regras e os testes de compatibilidade; a suíte e a revisão da candidata permanecem separadas desses pixels.

As duas imagens `rev116` usam os dados exatos de `u1bpmn` do export preservado, sem reparar sua mensagem dirigida ao evento final. Demonstram que a leitura continua disponível após a correção do renderer. Não representam a revisão 122 do GPT nem validam semanticamente o conteúdo anterior.

Exemplos:

- [Unidade, 320 px, escuro](bpmn-semantic-088-dark-320-unidade.png).
- [Explicação, 390 px, claro](bpmn-semantic-088-light-390-explicacao.png).
- [Explicação, 430 px, escuro](bpmn-semantic-088-dark-430-explicacao.png).
- [Host web, 1280 px, claro](bpmn-semantic-088-light-1280-unidade.png).
- [Intermediário recebendo mensagem](bpmn-semantic-088-dark-390-unidade-catch.png).
- [Final com múltiplas mensagens](bpmn-semantic-088-dark-390-unidade-multipleEnd.png).
- [Conteúdo da revisão 116 preservado na Explicação](bpmn-semantic-088-rev116-dark-390-explicacao.png).

Nenhum resultado constitui validação humana pós-correção.
