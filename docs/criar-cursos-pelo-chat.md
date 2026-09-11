# Criar e revisar cursos por conversa

A autoria por conversa permite transformar um tema, uma ementa ou materiais
reunidos em um curso, com assistência de IA e inspeção humana. A pessoa autora
define o que se pretende ensinar, discute a proposta e confere a estrutura, o
conteúdo e as fontes no AraLearn. Pode também editar diretamente na interface.

A conversa ocorre em um cliente externo compatível, conectado ao AraLearn. O
curso salvo pode ser retomado nesse cliente ou no aplicativo. Os guias de
[MCP](autoria-mcp.md) e de [Actions](autoria-actions.md) explicam as integrações
disponíveis e suas configurações. A separação entre curso e assistente permite
buscar independência de modelos; a compatibilidade concreta depende dos
recursos e da autenticação de cada cliente.

## Comece pelo contexto que muda o desenho

Para começar, informe o contexto que pode mudar o curso:

- quem deverá aprender;
- o que deverá compreender ou conseguir fazer;
- quais conhecimentos prévios podem ser assumidos;
- o escopo obrigatório e as fontes disponíveis;
- o nível de domínio esperado;
- idioma, dispositivo, acessibilidade e outras restrições reais;
- condições pedagógicas ou editoriais que você deseja fixar para pesquisa.

O contexto descreve quem vai estudar o curso. Um curso para iniciantes, por
exemplo, precisa considerar o repertório desse público; isso não caracteriza
o conhecimento da pessoa que está criando o material.

No uso comum, uma escolha automática exige que o assistente calibre os
parâmetros para cada microssequência ou unidade conforme conteúdo, função e
público, sem aplicar uma combinação fixa de valores. Numa pesquisa, valores deliberadamente fixados
prevalecem e tornam a condição auditável. Finalidade de concurso, treinamento
corporativo ou outra aplicação pode mudar vocabulário, precisão e tipos de
prática, mas não é o princípio organizador universal do AraLearn.

Os [parâmetros instrucionais](desenho-instrucional-parametrizado.md) orientam
como explicar, distribuir novidades e organizar a prática. Cada ajuste tem
significado e escopos definidos no [catálogo](../src/domain/courseDesignParameters.js). Os alvos de palavras são flexíveis
e não autorizam omitir decisões ou comprimir conteúdo para atingir uma contagem.
Intenção corrente, configuração aplicada e declaração de revisão são distintas.

Em **Configurações → Preferências de autoria**, foco **Conteúdo / Ciclo
completo**, cadência, pontos de revisão e diálogo são escolhas independentes.
O assistente consulta essas preferências e o trabalho já combinado ao retomar. Conteúdo
trabalha bases e fontes; Ciclo completo inclui também desenho e unidades.
Alterar o padrão pessoal não modifica cursos ou condições de pesquisa já fixadas.

A pessoa aprova objetos que pôde inspecionar. Formas de explicação e distribuição
da prática podem ser ajustadas, preservando essa distinção entre produzir,
inspecionar e declarar revisão.

## Desenvolva o mapa e as bases explicativas

O mapa organiza a arquitetura curricular do curso e pode ser desenvolvido por
recortes coerentes.

Um curso reúne módulos; cada módulo contém lições; cada lição organiza
microssequências didáticas. Cada microssequência desenvolve um objetivo focal
por meio de uma explicação compartilhada e de unidades de estudo, conforme o
[modelo didático](modelo-didatico.md).

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
aprovação usa a referência da versão completa persistida e inspecionada, sem
reescrever a árvore no envio. Ela não aprova
silenciosamente exercícios, componentes, formulações ou a estrutura interna de
unidades futuras.

A [explicação](explicacao-e-revisao-humana.md) desenvolve o conteúdo da microssequência,
seus pressupostos, relações e fontes. `salvar_explicacoes` permite produzi-la e
corrigi-la antes das unidades, inclusive com mapa em rascunho. Abrir a base salva
não chama um modelo. As unidades são episódios instrucionais derivados dessa
base e do desenho escolhido, não fatias do texto por quantidade de palavras.

## Produza em lotes manejáveis

Quando o trabalho inclui unidades, o assistente organiza a produção em partes operacionais.
Uma parte pode corresponder a uma lição, reunir várias microssequências ou
atravessar mais de uma lição quando isso facilitar produção e revisão. Ela não
é nível curricular: mudar seus limites não muda o mapa do curso.

O ciclo de produção é:

1. o assistente relê o recorte, as preferências e as observações pertinentes;
2. desenvolve ou revisa a explicação e suas fontes;
3. no Ciclo completo, prepara o desenho e materializa as unidades, reutilizando
   a base salva;
4. a pessoa inspeciona os objetos nos pontos de revisão combinados;
5. o assistente continua conforme a cadência e a autorização vigentes.

Uma conversa adequada permanece no nível da decisão presente. Por exemplo:

> Para a primeira parte, proponho começar por situações concretas de
> comunicação, distinguir dados de sinais e então comparar meios guiados e não
> guiados. Vou desenvolver a base explicativa desse recorte conforme combinado.

Depois da produção:

> Primeira parte produzida. [Abrir conteúdo] \
> A próxima parte segue a cadência combinada.

O chat não precisa mostrar contagens, nomes de campos ou detalhes do mecanismo.

## Preserve um repertório de conhecimentos

Ao produzir cada parte, o AraLearn mantém um repertório acumulado do que o
percurso exige. Uma ideia pode ser um conceito, uma relação, uma condição, um
procedimento ou uma operação necessária, mesmo que não apareça literalmente no
escopo original.

O assistente distingue:

- ideias novas introduzidas naquela unidade;
- ideias já estabelecidas e apenas utilizadas;
- ideias estabelecidas que são deliberadamente retomadas.

Uma retomada útil não volta a contar como introdução. Isso permite mobilizar o
que já foi ensinado, recuperar algo após um intervalo e evitar tanto conceitos
usados cedo demais quanto a repetição integral de definições.

O teto de novidades limita quantas ideias semanticamente novas uma unidade
expositiva pode introduzir. Seu valor depende da configuração efetiva: uma
escolha automática precisa de calibração contextual; uma fixação da autoria ou
da pesquisa deve ser preservada. Uma unidade pode ficar abaixo do teto, e a
prática não precisa introduzir ideias novas. O limite não transforma cada ideia
em uma tela separada.

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

[Componentes didáticos](componentes-didaticos.md) apresentam o conteúdo ou
recebem uma resposta. Sua escolha depende do que precisa ficar observável:

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

Fontes podem entrar em qualquer fase. Registre sua identidade, o uso feito no
conteúdo e a localização pertinente, como em [Fontes, citações e
referências](fontes-e-citacoes.md). Diferencie:

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

Cada explicação e unidade conserva uma fila durável de observações identificadas
e versionadas. O assistente lê as pendências pertinentes e trata as compatíveis com o
pedido. Só a versão cuja correção foi persistida e confirmada por releitura sai
da fila; leitura, resposta textual e tentativa não consomem pendências. Se uma
resposta se perder, `retomar_correcao` reconcilia o conteúdo e a fila pela mesma
tentativa, sem reaplicar a alteração apenas para retirar a observação.

Salvar uma base, unidade ou correção não declara revisão humana. Cada objeto
tem uma marca reversível vinculada ao conteúdo salvo. Depois da inspeção, uma
escolha humana expressa pode ser registrada no aplicativo ou por
`declarar_revisao`, usando a referência recebida na preparação. Mudança material
desatualiza a marca afetada. Conteúdo completo salvo pode ser estudado por quem
tem acesso; exigir somente revisado é uma política opcional e expressa do curso.

Para excluir um curso próprio, confira o alvo e a confirmação apresentada.
Se a confirmação ficar sem retorno, preserve a mesma tentativa e confira o
estado antes de outra ação. O [tratamento de respostas incertas no
MCP](autoria-mcp.md#confirmação-de-exclusão-por-mcp) distingue uma falha de
transporte de uma recusa explícita, que deve ser respeitada.

Veja [Autoria pelo MCP](autoria-mcp.md), [Autoria por Actions](autoria-actions.md)
e [Analytics da autoria](analytics-instrucionais.md) para os detalhes de cada
superfície.
