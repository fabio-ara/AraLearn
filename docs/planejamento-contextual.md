# Planejamento e decisões no objeto corrente

O mapa de **Planejamento** oferece os ajustes do curso, módulo, lição e microssequência no próprio ramo. Os parâmetros orientam a apresentação e a prática; as orientações editoriais
registram escolhas de linguagem e organização. Seu painel mostra a origem da
decisão e o alcance, chamado de escopo, conforme o
[catálogo de desenho](desenho-instrucional-parametrizado.md).

A explicação, suas fontes e a análise instrucional — as ideias e operações que
serão trabalhadas — podem ser abertas pelo mapa antes da produção das unidades.
O [contrato de autoria contextual](autoria-contextual.md) relaciona esses objetos.

A busca considera títulos, objetivos e a intenção da explicação. O filtro de pendências verifica se o mapa salvo tem os elementos obrigatórios,
como objetivos, cobertura do escopo e dependências válidas. Uma dependência ainda ausente é apresentada como referência pendente no rascunho. Limpar os filtros restaura os ramos anteriormente abertos; sair de um detalhe conserva posição, foco e rascunhos de ajustes. Uma leitura tardia de fontes não substitui um painel aberto depois dela.

## Aprovação da versão inspecionada

Quando a consulta ao servidor está disponível, a árvore apresentada corresponde ao mapa salvo, identificado por sua versão e pela revisão do curso. Metadados de produção só se associam à mesma revisão e versão. A pessoa declara que inspecionou o mapa completo; ramos recolhidos e resultados fora da busca também pertencem a essa versão. A interface exige completude estrutural e a declaração antes de habilitar a aprovação.

O envio usa uma referência recebida nessa leitura que identifica o mapa inspecionado, sem reenviar uma árvore reconstruída pelo cliente. Uma resposta perdida conserva a tentativa original, e o controle de retomada reutiliza a mesma referência ou o mesmo recorte curricular pendente. A reconciliação e a persistência da tentativa pertencem ao controlador. A aprovação do plano não declara revisão do conteúdo nem modifica a política de acesso.

## Base, intenção e aplicação

O grupo **Base, análise e evidência** consulta a explicação salva, sua declaração
de revisão humana e as ideias e operações previstas para a microssequência. Uma falha de leitura aparece como estado não confirmado. O inventário do curso distingue os itens previstos na intenção corrente dos vínculos registrados nas declarações das unidades. Um recorte sem unidades pode ter uma base salva e intenção definida, sem declaração de aplicação. O registro de qual base sustentou a produção pertence à unidade que a utilizou.

## Verificação

`course-planning-context.test.js` cobre o rascunho com dependência ausente, a projeção do mapa persistido e a distinção entre intenção, aplicação e dados indisponíveis. `course-planning-context.spec.js` exercita o painel de autoria e os componentes
reais de apresentação com dados de teste: filtros, abertura direta da base sem unidades, rascunhos, referência de aprovação, resposta perdida, resposta tardia e geometria. Esses testes verificam a interface com dados controlados; autenticação e persistência no serviço hospedado exigem verificação de integração própria.
