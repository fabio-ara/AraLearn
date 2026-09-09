# Planejamento e decisões no objeto corrente

O mapa de Planejamento oferece os ajustes do curso, módulo, lição e microssequência no próprio ramo. Parâmetros e orientações abrem o painel contextual existente, com escopo e origem das decisões. As regras do catálogo continuam limitando os escopos de cada parâmetro. Explicação, fontes e o contexto de análise instrucional da microssequência podem ser abertos pelo mapa antes da produção das unidades.

A busca considera títulos, objetivos e a intenção da Explicação. O filtro de pendências usa a completude estrutural do mapa salvo. Uma dependência ainda ausente é apresentada como referência pendente no rascunho. Limpar os filtros restaura os ramos anteriormente abertos; sair de um detalhe conserva posição, foco e rascunhos de ajustes. Uma leitura tardia de fontes não substitui um painel aberto depois dela.

## Aprovação da versão inspecionada

Quando a leitura canônica está disponível, a árvore apresentada é a projeção do mapa persistido, com sua versão e revisão do curso. Metadados de produção só se associam à mesma revisão e versão. A pessoa declara que inspecionou o mapa completo; ramos recolhidos e resultados fora da busca também pertencem a essa versão. A interface exige completude estrutural e a declaração antes de habilitar a aprovação.

O envio usa a referência opaca recebida nessa leitura. Uma resposta perdida conserva a tentativa original, e o controle de retomada reutiliza a mesma referência ou o mesmo recorte curricular pendente. A reconciliação e a persistência da tentativa pertencem ao controlador. A aprovação do plano não declara revisão do conteúdo nem modifica a política de acesso.

## Base, intenção e aplicação

O grupo **Base, análise e evidência** consulta a base salva, a revisão autoral e o recorte de análise da microssequência. Uma falha de leitura aparece como estado não confirmado. O inventário do curso distingue os itens previstos na intenção corrente dos vínculos registrados nas declarações das unidades. Um recorte sem unidades pode ter uma base salva e intenção definida, sem declaração de aplicação. O registro de qual base sustentou a produção pertence à unidade que a utilizou.

## Verificação

`course-planning-context.test.js` cobre o rascunho com dependência ausente, a projeção do mapa persistido e a distinção entre intenção, aplicação e dados indisponíveis. `course-planning-context.spec.js` exercita a Surface e os renderers reais com dados sintéticos: filtros, abertura direta da base sem unidades, rascunhos, referência de aprovação, resposta perdida, resposta tardia e geometria. O controlador e o serviço hospedado têm gates próprios; esse navegador isolado não substitui a prova integrada no Chrome autenticado.
