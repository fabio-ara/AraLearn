# Primeira produção da etapa de responsabilidades — MCP, 0.0.87

Em 27/09/2026, às 12:10:02.240 UTC, o ChatGPT Chat/Média recebeu o pedido abaixo na conversa normal já usada para a etapa de fluxogramas. É a primeira produção desta microssequência, mas a conversa já continha observações e imagens da etapa anterior. Não se afirma isolamento de memória ou independência experimental.

> Quero continuar o curso “Do sinal à decisão: como representamos situações para prever o que acontece depois”, agora na etapa “Quem faz cada parte?”. Use o planejamento salvo e o que já foi desenvolvido sobre o caminho de um pedido. Construa a explicação e o percurso de estudo para que uma pessoa iniciante consiga acompanhar as responsabilidades do cliente, da loja, do serviço de pagamento e da transportadora, perceber as trocas entre eles e prever o que acontece quando uma etapa depende da resposta de outra pessoa ou serviço. Escolha a representação que torne essas relações claras. Desenvolva exemplos suficientes e atividades em que a pessoa realmente acompanhe e compare situações, com retornos que expliquem suas decisões. Trabalhe somente nessa etapa, preserve as escolhas do curso e a coerência com os pré-requisitos, confira o resultado salvo e me dê o link para estudar. Pode conduzir a autoria e a inspeção de forma autônoma, sem aguardar aprovação humana nem registrá-la como se tivesse ocorrido.

## Produção e persistência

A etapa **Quem faz cada parte?**, ID `d4a77e6a-0f59-8031-b207-aae9194de13a`, passou de zero unidades/Explicação a duas unidades de ensino e oito práticas de escolha única, com Explicação. O GPT produziu o conteúdo por MCP; o operador não enviou JSON de autoria nem materializou manualmente essas unidades.

A exportação de engenharia por MCP, antes de qualquer feedback sobre esta etapa, confirmou a revisão **116** do curso `68d099a5-60d6-4a26-bd93-4a990a4789c3`: 54 páginas contíguas, 570.205 caracteres sem a quebra final e SHA-256 `0ad03b4d0bf0c9db08b1678361767acced68ffbb1ab61528e747a17717cc6f38`. O curso contém 25 microssequências, nove Explicações, 31 unidades em três etapas e 15/34 componentes. O BPMN acrescenta um componente à cobertura anterior.

O [destino retornado pelo GPT](https://fabio-ara.github.io/AraLearn/#/authoring/courses/68d099a5-60d6-4a26-bd93-4a990a4789c3?section=content&didacticMicrosequenceId=d4a77e6a-0f59-8031-b207-aae9194de13a) abriu a etapa e a unidade 1/10. É um destino de conteúdo da autoria, não um link direto de Estudo. O operador entrou depois no Estudo pela Home, módulo “Parte 3 — Do pedido à entrega”, lição “Processos e estados” e etapa correspondente.

A comparação 105→116 preservou as outras 24 microssequências do documento e as 21 linhas externas de `analytics.basis.studyUnits`, identificadas por `studyUnitRef`. O conteúdo novo inclui 23 parágrafos, três instâncias BPMN e oito respostas. O diagrama tem quatro participantes, 14 nós, oito fluxos internos e cinco mensagens entre participantes. São instâncias salvas; promessas do mapa não entram na contagem.

## Inspeção pedagógica autônoma

| Dimensão | Resultado da primeira produção | Evidência e limite |
| --- | --- | --- |
| Objetivo claro | Consistente com os alvos salvos | O objetivo sintético prioriza escolher BPMN quando importa a responsabilidade; os quatro requisitos detalham responsáveis, mensagens, dependência e representação. O objetivo foi preservado do planejamento anterior. |
| Explicação suficiente | Consistente | Apresenta os participantes, distingue solicitar de executar e desenvolve resposta externa, espera e recusa. |
| Operação cognitiva | Consistente no alcance planejado | O requisito de mensagem pede determinar quem pode agir em seguida. As práticas 3–4 exigem essa transição; 5–6 comparam ausência de resposta e recusa. Não há requisito de número mínimo de saltos. |
| Evidência recolhida | Consistente no alcance planejado | As respostas recolhem identificação de responsáveis, previsão local e comparação de estados, conforme os requisitos. Não demonstram rastreamento independente de uma cadeia inteira; essa é uma limitação da evidência, não uma violação do alvo salvo. |
| Prática adequada | Consistente no alcance planejado | Há duas oportunidades por cada um dos quatro focos. Escolha única não impede raciocínio: o critério é a relação exigida pela pergunta e a resposta que a observa. |
| Feedback específico | Consistente | Todas as 31 alternativas e oito unidades têm comentários contextuais. A UI mostrou a distinção entre solicitar e avaliar tanto no erro quanto na recuperação. |
| Representação adequada | Consistente | Participantes, fluxos internos e mensagens representam precisamente responsabilidades e trocas; o curso compara sua utilidade com a do fluxograma. |
| Carga e hierarquia visual | Parcial na 0.0.87 | Conteúdo explorável por pan/zoom e framing compartilhado, mas contornos pouco visíveis no tema escuro e legenda fixa referindo losangos inexistentes exigiram correção do renderer. |

Esses julgamentos resultam da leitura do conteúdo por agente e da revisão da raiz. A primeira crítica privada marcou objetivo/operação/evidência/prática como parciais por não haver rastreamento de vários saltos. O confronto posterior com o requisito salvo — “Acompanhar uma troca de mensagem entre participantes e determinar quem pode agir em seguida” — mostrou que essa exigência ampliava o critério. A tabela registra a decisão da raiz após esse confronto; o parecer privado original permanece preservado. Não se reclassifica uma preferência por prática mais integrada como defeito didático comprovado.

O script público `scripts/auditRevisaoV10Course.mjs` reproduz a pré-triagem mecânica a partir do export preservado; os critérios e exemplos desta tabela orientam a reinspeção semântica. O extrator privado da auditoria reproduz contagens, identidades e comparação dos estados. Executar o extrator não transforma os julgamentos registrados em validação pedagógica automática.

Uma releitura focal posterior pelo MCP de engenharia consultou a Explicação e a prática “A aprovação chegou: quem pode agir agora?”. As 21 páginas contíguas, 216.623 caracteres, foram preservadas privadamente com SHA-256 `d858952a81363d07d69a9d13026e3c1cb6d09b4d94f92d44fa614206910cd43e`. Nos dois alvos, `inspecaoIA.state` estava `pending`. Portanto, a declaração final do GPT de ter feito uma releitura autônoma não comprova registro de parecer pelas ferramentas. Não se estende essa constatação às outras nove unidades, nem se inventa o histórico de inspeções. A auditoria independente desta documentação e o registro operacional do GPT são evidências distintas.

## Parametrização

As dez unidades têm declaração e configuração aplicada. Seus 120 pares de valores solicitados/aplicados coincidem. A posição `after_explanation` também é realizada na ordem salva: duas unidades de ensino antes das oito práticas. Isso descreve o percurso, não aprendizagem observada em estudantes.

O snapshot aplicado não guarda a referência histórica exata do escopo: 90 parâmetros de escopo local apresentam `sourceScope.ref = null`. O `studyUnitRef` identifica a unidade auditada, mas não permite inferir a origem histórica desse parâmetro. É o limite já documentado do contrato; não se atribui ao registro uma rastreabilidade que ele não possui. O aviso global de unidade sem aplicação pertence à P7 da MS1, não às dez unidades novas.

## Interação observada

As [11 capturas e seus hashes](ms9-087/manifesto.json) pertencem ao site 0.0.87, revisão de conteúdo 116. A raiz inspecionou esses pixels. A sequência observada foi:

1. Aterrissagem real no destino de autoria e entrada no Estudo pela navegação.
2. Unidade 1 em 390 px: abertura de tela inteira, redução de escala de 1 para 0,64 e pan horizontal/vertical, alcançando preparação, coleta e entrega. Escape devolveu o foco ao botão de ampliar.
3. Explicação em 320 px: abertura do mesmo diagrama em tela inteira; Escape retornou à Explicação e, depois, à Unidade, com foco nos controles correspondentes.
4. Avanço pelo exemplo resolvido até a prática 1. Resposta incorreta “Loja” exibiu “A loja solicita a autorização, mas não faz a avaliação”. “Tentar de novo” permitiu escolher “Serviço de pagamento”; a correção e o comentário específico apareceram.
5. Feedback correto inspecionado em 320/390/430/1280 px. No host web, a coluna conservou a largura conceitual mobile. Em 320 px, o comentário ocupa parte da área inferior e o botão de avanço permanece visível; não se usa essa captura como prova de rolagem ou clique nessa largura.
6. Avanço à unidade 4/10, retorno à Home e recarga: progresso **9/31** persistiu. Antes da etapa, era 6/31. Esta recarga confirma persistência; não testa a correção de reentrada da candidata 0.0.88.

As capturas estáticas apoiam a inspeção visual; os cliques, focos, estados de resposta e recarga acima foram observados sequencialmente. O teste local ampliado do BPMN é registrado separadamente da evidência hospedada.

Os contornos escuros e a legenda sobre losangos vieram do renderer, não do texto produzido pelo GPT. A candidata passa a cobrir os contornos SVG efetivamente emitidos e a explicar somente os símbolos presentes. A revisão arquitetural também encontrou orientação pedagógica já suficiente na auditoria, mas disponível ao produtor em guias cuja leitura não acompanha automaticamente cada chamada. A melhoria proposta é distribuir essa orientação no contrato compartilhado de produção, sem criar quotas de formatos ou número de passos e sem atribuir a essa distribuição a causa do resultado observado.

Estado: primeira produção preservada e inspecionada, pedagogia autonomamente consistente no alcance dos requisitos salvos; observação do resultado pelo GPT e prova hospedada da correção visual pendentes. A tentativa posterior de anexar as capturas ao GPT falhou no seletor de arquivos, antes de enviar feedback. **Nenhum resultado desta intervenção constitui validação humana pós-correção.**
