# Exp5 — fluxo real de ChatGPT Actions (prova privada sanitizada)

Quinta explicação, *Como chegar ao destino?*, do curso *Do sinal à decisão: como representamos situações para prever o que acontece depois*, revisão **27**, com 8 módulos, 25 microssequências, 5 explicações e **0 unidades de estudo**. Prova privada, pronta para publicação; logs de borda são diagnóstico de engenharia, não autoria.

Consentimento pontual operado por Codex sob mandato do proprietário, restrito a este curso. Não houve pessoa revisando a produção neste momento; nada aqui é aprovação humana.

## Sequência real de Actions

Nove chamadas `ChatGPT-User/1.0`, todas `200`:

| UTC | operação | status |
| --- | --- | --- |
| 01:50:40.066 | `retomar_curso` | 200 |
| 01:50:44.093 | `consultar_planejamento` | 200 |
| 01:50:47.971 | `consultar_componentes` | 200 |
| 01:50:53.226 | `consultar_componentes` | 200 |
| 01:55:11.075 | `salvar_explicacoes` | 200 |
| 01:55:17.605 | `preparar_revisao` | 200 |
| 01:55:24.905 | `preparar_revisao` | 200 |
| 02:07:29.338 | `preparar_revisao` | 200 |
| 02:07:46.917 | `preparar_revisao` | 200 |

Marcos: escrita em **01:55:11.075** (`salvar_explicacoes`); dois `preparar_revisao` antes do retorno (01:55:17.605 e 01:55:24.905) e dois depois (**02:07:29.338** e **02:07:46.917**).

## Conversa

Capturada em 2026-09-27T02:08:39.807Z. Os dois primeiros prompts da captura pertencem à etapa SysML e ficaram **fora** desta prova. Os dois prompts literais da Exp5:

> Você disse:
> rascunho-gpt-sequencia5.md
> Documento
> Retome agora a sequência “Como chegar ao destino?”, a quinta do percurso original. Anexei seu rascunho revisado. Salve somente sua explicação no mesmo curso: quero aprender a verificar se um caminho é permitido, seguir o sentido das ligações, somar seus custos e comparar rotas quando uma restrição muda. Use o grafo de verdade para tornar essas relações visíveis e exploráveis no telefone, com custos claramente associados às ligações. Uma lista de trajetos não substitui essa representação. Ensine os termos necessários, desenvolva os exemplos resolvidos e preserve rigorosamente as ligações, sentidos e valores do rascunho, sem antecipar os gabaritos das futuras práticas. Deixe claro por que menos trechos não significa necessariamente menor custo e por que duas rotas podem empatar. Releia o conteúdo salvo, corrija qualquer inconsistência e traga o link específico. Não materialize práticas nesta etapa, não altere as outras explicações nem o planejamento e não registre aprovação humana.

> Você disse:
> Abri a quinta explicação no telefone e testei a exploração dos dois grafos. O anexo das capturas não funcionou nesta tentativa, então descrevo fielmente o que vi: na janela inicial aparece só parte do primeiro grafo; ao abrir a tela inteira, todos os nós e ligações ficam visíveis e os pesos ficam próximos das respectivas setas. No segundo grafo, a ligação de Q a T contorna S e seu custo 2 fica separado do custo 2 de S a T. Ampliar, arrastar e voltar à explicação funcionou. Minha leitura é que a exploração permite comparar as rotas, sem precisar encolher tudo na janela inicial. Como educador, avalie essa observação junto do conteúdo que você salvou: ela sustenta a aprendizagem proposta ou aponta alguma ambiguidade que precisa ser corrigida? Você pode manter ou contrapor minha leitura. Não presuma que viu imagens, não altere números ou ligações corretas e não faça mudanças apenas para concordar. Se precisar melhorar a explicação, corrija somente essa sequência, releia o resultado e mantenha os gabaritos das práticas fora dela.

Resposta final do GPT, mantida: 1294 caracteres (íntegra no JSON desta prova).

## Grafos conferidos contra a explicação persistida

| grafo | vértices | arestas | custos conferidos |
| --- | --- | --- | --- |
| G (`content-2`) | A, B, C, D | A→B 4; A→C 2; B→D 3; B→C 2; C→D 6 | A→B→D = 7; A→C→D = 8; A→B→C→D = 12 |
| H (`content-7`) | P, Q, R, S, T | P→Q 5; P→R 3; Q→T 2; R→S 3; S→T 2; Q→S 1 | P→Q→T = 7; P→R→S→T = 8; P→Q→S→T = 8 |

A restrição Q → T da rede H remove o caminho de 7 e deixa dois empates em 8.

## Capturas (390×844, JPEG)

| arquivo | bytes | sha256 | o que mostra |
| --- | --- | --- | --- |
| `actions-exp5-390-grafo-g.jpg` | 50751 | `f59e6ecd5284186d…` | inicial, rede G parcial (visão embutida na explicação) |
| `actions-exp5-390-grafo-g-zoom-out.jpg` | 51306 | `ba77d8fd318d9c14…` | zoom afastado da rede G |
| `actions-exp5-390-grafo-g-tela-inteira.jpg` | 10835 | `d62efcb03ce2e51b…` | tela cheia da rede G com A, B, C e D e as cinco arestas com pesos |
| `actions-exp5-390-grafo-g-zoom-inteiro.jpg` | 11757 | `eaea5b803621da54…` | zoom inteiro da rede G |
| `actions-exp5-390-grafo-g-ampliado.jpg` | 17090 | `4cd778a0cce037ba…` | ampliado, conteúdo maior que a área visível |
| `actions-exp5-390-grafo-g-pan-ampliado.jpg` | 16789 | `562cafb05a937662…` | arraste sobre o ampliado; aqui há movimento real de conteúdo |
| `actions-exp5-390-grafo-g-pan.jpg` | 11757 | `eaea5b803621da54…` | arraste SEM movimento: conteúdo já cabia inteiro |
| `actions-exp5-390-grafo-h-tela-inteira.jpg` | 11195 | `e529de5ab2e4f121…` | tela cheia da rede H com P, Q, R, S, T e as seis arestas |
| `actions-exp5-390-grafo-retorno-foco.jpg` | 50963 | `e124a2984f1d9afb…` | retorno de foco ao botão Explorar diagrama |

O arquivo `actions-exp5-390-grafo-g-pan.jpg` é um arraste **sem movimento**: seus bytes são idênticos aos de `actions-exp5-390-grafo-g-zoom-inteiro.jpg` (sha256 `eaea5b803621da54…`), porque o conteúdo já cabia inteiro. A evidência de arraste real é `actions-exp5-390-grafo-g-pan-ampliado.jpg`, que mostra o conteúdo ampliado deslocado.

A inspeção de pixels foi feita pela raiz Codex sobre essas capturas — não é inspeção humana proprietária.

## Histórico do envio

O anexo das capturas falhou duas vezes antes do seletor. A raiz forneceu então uma observação textual fiel, sem imagem, e o GPT explicitamente **não viu** as imagens. A recuperação por nova aba/AX atendeu o rascunho 6; portanto **não** se deve inventar revisão por imagem para a Exp5.

## Limites

- Logs de borda são diagnóstico: comprovam chamada e status, não conteúdo devolvido.
- Zero unidades de estudo: sem prática, sem evidência de aprendizagem e sem feedback.
- A inspeção das capturas foi feita por Codex, não por humano proprietário; nenhuma validação humana.
- A explicação foi salva sem revisão por imagem; o feedback textual é a evidência disponível.
