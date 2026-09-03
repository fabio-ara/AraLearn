# Criar e revisar cursos por conversa

Um cliente conectado por MCP ou um GPT com Actions pode trabalhar no mesmo
curso que a interface visual. A conversa coordena decisões; o AraLearn mantém
o mapa curricular, o conteúdo, os parâmetros, as fontes e as observações.

## Comece pelo contexto que muda o desenho

Um briefing útil informa:

- quem deverá aprender;
- o que deverá compreender ou conseguir fazer;
- quais conhecimentos prévios podem ser assumidos;
- o escopo obrigatório e as fontes disponíveis;
- o nível de domínio esperado;
- idioma, dispositivo, acessibilidade e outras restrições reais;
- condições pedagógicas ou editoriais que você deseja fixar para pesquisa.

O GPT não deve presumir que a pessoa autora é estudante. Se o curso se destina
a iniciantes, a conversa dirá que o público é iniciante, sem atribuir esse nível
à pessoa que está criando o material.

No uso comum, o estado `default` exige que o GPT calibre automaticamente os
parâmetros para cada microssequência ou unidade conforme conteúdo, função e
público; não é um preset fixo. Numa pesquisa, valores deliberadamente fixados
prevalecem e tornam a condição auditável. Finalidade de concurso, treinamento
corporativo ou outra aplicação pode mudar vocabulário, precisão e tipos de
prática, mas não é o princípio organizador universal do AraLearn.

O catálogo reúne quatro parâmetros pedagógicos e dois alvos editoriais
quantitativos flexíveis: palavras por resposta de autoria e por unidade de
estudo. Os alvos não são limites e não autorizam omitir decisões ou comprimir o
conteúdo para atingir uma contagem.

O mapa global antes dos lotes, a aprovação apenas do que estava inspecionável e
a conversa em linguagem humana são invariantes. Distribuição editorial, formas
de explicação e prática pertencem às dimensões que podem ser calibradas pela
configuração existente; isso não exige uma entidade para cada princípio
pedagógico.

## Planeje o mapa curricular completo

Antes de produzir conteúdo, o GPT propõe a arquitetura curricular de todo o
curso:

```text
curso
→ módulos
→ lições
→ microssequências
```

O mapa mostra todos os módulos, as lições de cada módulo, as microssequências
previstas, a progressão geral e as dependências importantes. Quando o curso
parte de uma ementa, currículo ou especificação, cada item obrigatório fica
associado ao ponto em que será ensinado.

No chat, uma síntese curta pode bastar. Um link abre o planejamento completo no
AraLearn para conferir cobertura, lacunas, redundâncias, ordem e profundidade.
Nenhuma unidade de estudo precisa existir nessa etapa.

Exemplo resumido:

> Módulo 1 — Fundamentos da comunicação em rede \
> Lição 1 — O problema da comunicação \
> • Dispositivos, dados e sinais \
> • Meios de transmissão \
> Lição 2 — Organização das redes \
> • LAN, WAN e redes sem fio \
> • Topologias

A pessoa autora pode mudar cobertura, ordem ou ênfase antes de aprovar. A
aprovação vale para o mapa que estava visível e inspecionável; não aprova
silenciosamente exercícios, componentes, formulações ou a estrutura interna de
unidades futuras.

## Produza em lotes manejáveis

Depois da aprovação do mapa, o GPT divide o trabalho em partes operacionais.
Uma parte pode corresponder a uma lição, reunir várias microssequências ou
atravessar mais de uma lição quando isso facilitar produção e revisão. Ela não
é nível curricular: mudar seus limites não muda o mapa do curso.

O ciclo de produção é:

1. o GPT apresenta brevemente a progressão local da próxima parte;
2. a pessoa autora corrige apenas decisões substantivas, quando necessário;
3. depois da aprovação local, o GPT prepara e materializa o conteúdo;
4. a pessoa abre o resultado no AraLearn e o inspeciona;
5. o GPT segue para a próxima parte.

Uma conversa adequada permanece no nível da decisão presente. Por exemplo:

> Para a primeira parte, proponho começar por situações concretas de
> comunicação, distinguir dados de sinais e então comparar meios guiados e não
> guiados. Quer mudar alguma ênfase antes de eu produzir?

Depois da produção:

> Primeira parte produzida. [Abrir conteúdo] \
> Posso preparar a segunda parte.

O chat não precisa mostrar contagens, nomes de campos ou detalhes do mecanismo.

## Preserve um repertório de conhecimentos

Ao produzir cada parte, o AraLearn mantém um repertório acumulado do que o
percurso exige. Uma ideia pode ser um conceito, uma relação, uma condição, um
procedimento ou uma operação necessária, mesmo que não apareça literalmente no
escopo original.

O GPT distingue:

- ideias novas introduzidas naquela unidade;
- ideias já estabelecidas e apenas utilizadas;
- ideias estabelecidas que são deliberadamente retomadas.

Uma retomada útil não volta a contar como introdução. Isso permite mobilizar o
que já foi ensinado, recuperar algo após um intervalo e evitar tanto conceitos
usados cedo demais quanto a repetição integral de definições.

O teto padrão de duas novidades significa no máximo duas ideias semanticamente
novas numa unidade expositiva. Uma unidade pode introduzir zero, uma ou duas;
prática e consolidação não precisam introduzir nenhuma. O limite organiza a
novidade no tempo, sem transformar cada ideia em uma tela separada.

## Produza um percurso suficiente para o objetivo

Uma unidade de estudo é uma experiência didática focalizada, não uma frase nem
uma cota de conteúdo. A materialização deve evitar dois extremos:

- compactação, quando um único bloco apenas nomeia muitos conceitos, salta
  relações ou omite exemplos e prática;
- atomização, quando uma ideia simples vira telas demais e a pessoa estudante
  precisa reconstruir sozinha a conexão entre fragmentos.

O percurso mínimo adequado é aquele que ainda ensina tudo que o objetivo exige.
Se um conhecimento não foi declarado como pré-requisito e é necessário para o
passo seguinte, ele precisa ser desenvolvido antes do uso. Relações importantes
também precisam ser ensinadas, não apenas os conceitos em separado.

Quando o conteúdo justificar, a sequência pode combinar situação-problema,
explicação focal, exemplo, previsão, aplicação, comparação, prática com apoio
reduzido e integração. Essa é uma possibilidade, não um molde obrigatório.

## Escolha representações pela função

Componentes servem ao que precisa ficar observável:

- diagrama para relações espaciais;
- tabela para estado;
- linha do tempo para mudança temporal;
- comparação lado a lado para discriminar casos;
- exemplo parcialmente resolvido para retirar apoio aos poucos;
- resposta aberta para explicar ou justificar;
- escolha ou identificação para uma previsão rápida.

Parágrafo e escolha continuam adequados quando cumprem a função. Não se troca de
componente apenas para variar a aparência.

## Trate prática como parte da aprendizagem

Sempre que fizer sentido, intercale explicação e prática. A prática pode servir
para prever antes de uma explicação, identificar depois de uma distinção,
aplicar imediatamente, comparar casos, diagnosticar, justificar, completar um
estado ou integrar conhecimentos anteriores.

Tarefas de vários passos podem avançar de exemplo resolvido para exemplo
parcial, prática com pistas, prática sem pistas e situação nova. Essa redução de
apoio deve ser usada quando a complexidade justificar, não por obrigação.

## Use fontes segundo seu papel

Fontes podem entrar em qualquer fase. Diferencie:

- fonte de escopo, que define o que precisa ser coberto;
- evidência de avaliação, que ajuda a calibrar cobrança e distinções relevantes;
- fonte técnica ou conceitual, que sustenta explicações e precisão.

Uma ementa ou prova não se torna automaticamente autoridade conceitual. O curso
pode ser autocontido para quem estuda e, ao mesmo tempo, apoiar sua produção em
fontes técnicas verificáveis. Um PDF anexado só deve ser guardado quando essa
intenção estiver clara.

## Revise como estudante

Antes de encerrar uma parte, percorra as unidades na ordem e confira:

- se a primeira começa com os conhecimentos assumidos;
- se cada novidade recebeu preparação suficiente;
- se há saltos, repetições improdutivas ou densidade excessiva;
- se a sequência foi fragmentada demais;
- se exemplos tornam o mecanismo observável;
- se as práticas pedem somente o que já foi ensinado;
- se há progressão de reconhecimento para aplicação e integração.

Unidades podem ser movidas, divididas, fundidas ou reescritas antes da conclusão.
A inspeção no AraLearn mostra o conteúdo real e, quando pertinente, as ideias
introduzidas, usadas e retomadas em linguagem humana.

## Retome e revise depois

Uma conversa nova relê o estado do curso; não depende do resumo da conversa
anterior. Qualquer parte, microssequência ou unidade pode ser reaberta por uma
referência humana. Observações e fontes também podem ser consultadas a qualquer
momento.

Ao revisar, considere os pontos afetados por progressão, pré-requisitos,
transições, exemplos ou prática. A pessoa autora aprova a correção concreta; a
revisão não ganha autoridade automática para reescrever o restante do curso.

Veja [Autoria pelo MCP](autoria-mcp.md), [Autoria por Actions](autoria-actions.md)
e [Analytics da autoria](analytics-instrucionais.md) para os detalhes de cada
superfície.
