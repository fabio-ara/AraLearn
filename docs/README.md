# Mapa da documentação

No AraLearn, uma pessoa pode criar e inspecionar cursos com assistência de inteligência artificial (IA) e estudar o conteúdo pelo celular. Este mapa leva da apresentação geral aos guias de uso e, depois, aos documentos especializados. Escolha o percurso que corresponde à sua tarefa ou à pergunta que deseja aprofundar. A [visão do produto](visao-do-produto.md) apresenta como autoria, fontes e estudo se relacionam com a pesquisa em design instrucional.

A [origem do projeto](origens-do-aralearn.md) reúne as experiências de estudo e automação que motivaram seu desenvolvimento.

## Começar a usar

1. Comece pela [Visão do produto](visao-do-produto.md) para compreender o
   problema tratado e as decisões que dão identidade ao AraLearn.
2. Siga para [Uso do aplicativo](uso-do-app.md), que apresenta as operações
   comuns da conta, dos cursos e da sincronização. As
   [Configurações](configuracoes.md) explicam onde cada preferência produz efeito.
3. Escolha o guia correspondente ao seu papel: [estudante](guia-estudante.md)
   ou [pessoa autora](guia-professor-autor.md). Se algo falhar, consulte a
   [Solução de problemas](solucao-de-problemas.md) pelo sintoma observado.

As [Capacidades e limites atuais](estado-atual-e-roadmap.md) formam a referência
datada do que está disponível e das condições de uso. Assuntos específicos,
como [áudio](audio.md), [ferramentas da unidade](ferramentas-calculo-e-consulta.md)
e [fontes](fontes-e-citacoes.md), são desenvolvidos em guias próprios.

## Compreender o modelo didático

1. O [Modelo didático](modelo-didatico.md) explica como o conteúdo se desenvolve
   ao longo do curso e como explicação e prática participam do mesmo percurso.
2. O [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
   mostra como uma pessoa registra suas escolhas para esse percurso. Os
   [exemplos de recorte](corpus-unidades-de-analise.md) tornam visíveis maneiras
   diferentes de distribuir o conteúdo.
3. A [Revisão de literatura](revisao-de-literatura.md) apresenta os fundamentos,
   as controvérsias e as lacunas; o [Quadro teórico](quadro-teorico.md) organiza
   os conceitos usados para formular as perguntas de pesquisa.

Alguns aspectos recebem desenvolvimento próprio. [Explicação e revisão humana](explicacao-e-revisao-humana.md)
trata do texto-base da microssequência e de sua inspeção pela pessoa autora;
[Observações pedagógicas](observacoes-pedagogicas.md), do caminho entre uma
dificuldade registrada e uma correção; e [Estado de estudo](estado-de-estudo-nao-punitivo.md),
dos dados guardados para retomar o percurso.

Para aprofundar a escolha de representações, consulte a
[fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md). A
[matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md) liga os
fundamentos às decisões e à avaliação. Os demais aprofundamentos estão no
[inventário integral](inventario-documentacao.md#fundamentos-desenho-e-pesquisa).

## Aprender no trabalho e formar profissionalmente

O AraLearn também pode ser estudado em contextos de trabalho e formação
profissional. Comece pela [Visão do produto](visao-do-produto.md) para situar o
alcance do aplicativo. Em seguida, a seção da
[Revisão de literatura](revisao-de-literatura.md#13-aprendizagem-no-trabalho-gestão-do-conhecimento-e-educação-profissional)
relaciona aprendizagem, gestão do conhecimento e formação profissional.

As [Origens do AraLearn](origens-do-aralearn.md) narram como problemas de estudo
e trabalho entraram no projeto. Para investigar uma aplicação concreta, o
[Protocolo de avaliação](protocolo-avaliacao-artefato.md) ajuda a examinar o uso,
o que foi aprendido e como esse conhecimento aparece depois no trabalho.

## Estudar a engenharia

| Pergunta | Onde começar |
| --- | --- |
| O que acontece no dispositivo e no servidor? | [Arquitetura](arquitetura.md) situa as responsabilidades; [Persistência e sincronização](persistencia-relacional.md) explica como os cursos são guardados e atualizados; [Supabase](supabase.md) apresenta os serviços que mantêm contas, dados e arquivos. |
| Como os dados se tornam conteúdo na tela? | [Contrato de conteúdo](aralearn-contract.md) descreve a estrutura aceita pelo aplicativo; [Componentes didáticos](componentes-didaticos.md) mostram como ela produz textos, representações e atividades. |
| Como o sistema é apresentado e protegido? | [Sistema visual](sistema-visual.md) trata de leitura, interação e acessibilidade; [Privacidade](privacidade.md) explica a finalidade dos dados, quem pode acessá-los e por quanto tempo permanecem. |

O [glossário técnico](glossario-tecnico.md) define os mecanismos correntes. A
[matriz de conformidade técnica](matriz-conformidade-tecnica.md) indica onde
cada propriedade pode ser verificada.

## Estudar a autoria de cursos

| Objetivo | Percurso |
| --- | --- |
| Produzir e revisar um curso | Comece pelo [Guia da pessoa autora](guia-professor-autor.md). Para trabalhar com um assistente externo, siga [Criar cursos pelo chat](criar-cursos-pelo-chat.md); para aprofundar o tratamento dos problemas encontrados, consulte [Revisão e correções](auditoria-de-conformidade-instrucional.md). |
| Conectar um assistente | [Assistência por IA](assistencia-por-ia.md) explica o conteúdo enviado e a conferência das propostas. Os canais têm guias próprios para [MCP](autoria-mcp.md) e [OpenAPI com Actions](autoria-actions.md). |
| Investigar a autoria | [Dados de autoria](analytics-instrucionais.md) apresenta as escolhas registradas na produção. [Experimentos instrucionais](experimentos-instrucionais-parametrizados.md) e o [Guia de investigação](guia-pesquisador.md) orientam comparações. |

O [inventário integral](inventario-documentacao.md#engenharia-e-integrações)
reúne as referências especializadas. Para consulta rápida, elas se organizam
pelas relações que ajudam a examinar:

| Relação | Referências |
| --- | --- |
| planejar um recorte e localizar o ponto que será alterado | [Planejamento contextual](planejamento-contextual.md), [Parâmetros de autoria](parametros-de-autoria.md) e [Estrutura curricular por referência](estrutura-curricular-por-referencia.md) |
| transformar uma decisão em operação e conferir seu resultado | [Autoria contextual](autoria-contextual.md), [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md) e [Verificação local dos canais](prova-local-canais-autoria.md) |
| interpretar o material exportado | [Dicionário de métricas e dados](dicionario-metricas-datasets.md) |

## Avaliar o artefato

Este percurso separa o que vem da literatura, o que o produto efetivamente faz
e o que ainda precisa ser estudado com pessoas:

1. [Fundamentos de pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
   estabelece como registrar decisões e evidências; [Contribuição e originalidade](contribuicao-originalidade.md)
   situa o que o projeto propõe acrescentar.
2. O [Protocolo de avaliação](protocolo-avaliacao-artefato.md) relaciona cada
   pergunta ao método capaz de respondê-la. O [roteiro de aceitação humana](roteiro-aceitacao-humana-autoria.md)
   propõe tarefas para observar o uso dos controles de autoria.
3. As auditorias dos [componentes](auditoria-academica-dos-resources.md) e da
   [interface](auditoria-front-end.md) examinam propriedades implementadas. As
   [medidas de ocupação visual](benchmark-footprint-editorial.md) e as
   [Capacidades atuais](estado-atual-e-roadmap.md) registram seus respectivos
   alcances.

## Avaliar um uso institucional

Um gestor, uma instituição educacional ou uma administração pública pode
começar pela [Visão do produto](visao-do-produto.md) e pelas
[Capacidades e limites atuais](estado-atual-e-roadmap.md). Esses capítulos
delimitam a finalidade, o público e as capacidades disponíveis.

Para examinar uma adoção concreta, considere três relações. A
[Arquitetura](arquitetura.md) mostra o que funciona no dispositivo, no servidor
e em serviços externos. [Privacidade](privacidade.md) e
[Implantação](implantacao.md) tratam dos dados e da operação. Por fim, o
[Sistema visual](sistema-visual.md) e o [Protocolo de avaliação](protocolo-avaliacao-artefato.md)
oferecem critérios para examinar a experiência e a adequação ao contexto da
instituição.

## Operar e implantar

| Assunto | Documento |
| --- | --- |
| ambientes, configuração e publicação | [Implantação](implantacao.md) |
| serviços que guardam os dados e controlam o acesso | [Supabase](supabase.md) |
| histórico de mudanças na estrutura do banco e procedimentos de recuperação | [Alterações da estrutura do banco](schema-change-log.md) |
| estrutura, testes e contribuições | [Guia do desenvolvedor](guia-desenvolvedor.md) |

Para contribuir com código ou documentação, consulte também o
[`CONTRIBUTING.md`](../CONTRIBUTING.md). A integração Android tem instruções
próprias em [`android/README.md`](../android/README.md), e as bibliotecas
distribuídas dentro do aplicativo são identificadas em
[`public/vendor/README.md`](../public/vendor/README.md).

## Consultar história e licença

O [`CHANGELOG.md`](../CHANGELOG.md) registra mudanças por versão e conserva a
terminologia do período correspondente. O histórico detalhado permanece no
Git. A licença de uso e redistribuição está em [`LICENSE.md`](../LICENSE.md).

## Encontrar outros documentos

A [Cobertura da documentação](inventario-documentacao.md) é o inventário
integral do corpus e indica a função de cada arquivo. Para consulta, use também
os [Princípios editoriais](principios-editoriais.md), os glossários
[técnico](glossario-tecnico.md) e [educacional](glossario-construtos.md), o
[Vocabulário controlado](vocabulario-controlado.md) e a
[Bibliografia](referencias.md).
