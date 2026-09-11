# Planejamento e decisões no objeto corrente

O mapa de **Planejamento** permite examinar o que um curso pretende ensinar e
em que ordem. Cada módulo reúne lições; cada lição reúne microssequências,
sequências curtas com um objetivo didático. Ao abrir um ramo, a pessoa encontra
seus objetivos e pode consultar os ajustes que orientam a produção daquele
conteúdo. O [modelo didático](modelo-didatico.md) desenvolve essa organização.

## Examinar e ajustar o mapa

Os parâmetros orientam a apresentação e a prática. As orientações editoriais
registram escolhas de linguagem e organização. O painel indica de onde veio
cada decisão e a quais objetos ela se aplica, seu **escopo**. Os escopos
admitidos variam conforme a escolha: consultar um módulo, por exemplo, não
significa que todos os parâmetros possam ser definidos nesse nível. O
[desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
apresenta essas regras.

A explicação é o texto-base da microssequência, com suas fontes. Ela pode ser
aberta pelo mapa antes da produção das unidades. A análise instrucional
identifica as ideias e operações que serão trabalhadas. Esses registros permitem
examinar a base intelectual do material antes de decidir como distribuí-lo nas
unidades, conforme a [autoria contextual](autoria-contextual.md).

A busca considera títulos, objetivos e a intenção da explicação. O filtro de
pendências ajuda a localizar objetivos ausentes, conteúdos obrigatórios ainda
sem cobertura e dependências inválidas. Uma dependência indica um conhecimento
que outra microssequência precisa desenvolver antes; enquanto essa referência
não estiver resolvida, ela permanece visível como pendência no rascunho.

Limpar os filtros restaura os ramos anteriormente abertos. Sair de um detalhe
conserva posição, foco e ajustes ainda não salvos. Se uma consulta de fontes
terminar depois de a pessoa abrir outro painel, seu resultado não substitui o
painel mais recente.

## Aprovação da versão inspecionada

A aprovação se refere ao mapa salvo que a pessoa examinou. Ramos recolhidos e
resultados ocultos por um filtro também pertencem a esse mapa. A interface
habilita a aprovação quando a estrutura está completa e a pessoa declara que
inspecionou o conjunto. Aprovar o planejamento registra essa decisão; a revisão
da explicação e das unidades acontece sobre os conteúdos efetivamente salvos.

Para evitar que a aprovação se aplique a outro mapa, a leitura do servidor
fornece uma referência da versão exibida. O envio reutiliza essa referência,
sem reconstruir o mapa a partir da tela. Dados de produção só acompanham o
planejamento quando pertencem à mesma versão e revisão do curso. Se a resposta
a uma aprovação se perder, o aplicativo conserva a tentativa e consulta seu
resultado antes de iniciar outra. O [contrato das operações](aralearn-contract.md)
descreve esses controles. A aprovação não modifica quem pode acessar o curso.

## Base, intenção e aplicação

O grupo **Base, análise e evidência** reúne a explicação salva, a revisão humana
declarada e as ideias e operações previstas para a microssequência. Quando a
leitura falha, o painel informa que esses dados não foram confirmados.

Planejar uma ideia e utilizá-la numa unidade são registros diferentes. Uma
microssequência pode ter explicação e intenção definidas antes de possuir
unidades. Quando uma unidade é produzida, seu registro de aplicação identifica
as escolhas realizadas e a base que sustentou aquela produção. A
[distinção entre intenção e aplicação](autoria-contextual.md#intenção-aplicado-edição-e-revisão)
permite comparar o plano com o material salvo.

## Verificação

O [teste de planejamento](../tests/runtime/course-planning-context.test.js)
verifica rascunhos com dependências pendentes, a leitura do mapa salvo e a
distinção entre intenção, aplicação e dados indisponíveis. O
[teste da interface](../tests/e2e/course-planning-context.spec.js)
exercita filtros, abertura da base sem unidades, conservação de rascunhos,
aprovação, respostas perdidas ou tardias e estabilidade da apresentação.
Esses testes usam dados controlados; a [validação dos canais](roteiro-aceitacao-humana-autoria.md)
examina também o acesso e o salvamento na versão conectada.
