# Revisão v10 — Estudo, componentes e autoria por conversa

**Estado: preparação da candidata; intervenção ainda em execução.** Código e provas locais estão registrados abaixo. Publicação, autoria do curso novo e substituição do legado permanecem etapas obrigatórias abertas.

Commit inicial real e baseline: **a1b27b9bf525497e55eef3b81888c4e17fcabe8d**, AraLearn **0.0.83**. O checkout começou limpo; origin/main coincidiu com esse commit também após nova consulta remota em 26/09/2026. A candidata local é **0.0.84**, Android versionCode 230. Commit final: **pendente**. As capturas humanas da coleta continuam atribuídas à 0.0.83.

## Autoridade e proveniência

Foram lidos integralmente o REGISTRO-DA-REVISAO-v10.md fornecido, o guia, o modelo, a cobertura, o índice do acervo, o índice de Estudo e o relatório v7 no baseline. SHA-256 da v10: **2299c4d35195bc2d751fbefaf38bef58ba8977be23c44beff14e27f8f960fc06**. A camada atual governa estados posteriores, O070–O074 e D030; a v7 preservada continua sendo fonte histórica de decisões humanas. O registro original não foi reescrito.

BACKLOG-DA-COLETA.json e PENDENCIAS-DE-COLETA.md não foram encontrados após busca no pacote, ZIP e locais fornecidos. Essa lacuna não foi preenchida por inferência. O relatório v7 anterior foi confrontado com o código e a interface, sem tomar suas alegações como prova nova.

**Nenhum resultado desta intervenção constitui validação humana pós-correção.** Os estados abaixo distinguem implementação/teste, inspeção visual autônoma, serviço real e pendências. Não haverá revisão humana como requisito para continuar esta intervenção; a revisão humana posterior permanece possível.

## Implementação por mecanismo

- **Enquadramento compartilhado:** Unidade e Explicação usam o mesmo renderer. Diagramas de sistema preservam escala natural; a posição inicial só muda quando a origem não mostra nenhum nó. O mecanismo tenta conteúdo central, objeto semântico focal e primeiro nó, verifica limites e respeita viewport memorizado. Pan, zoom, visão global e tela inteira permanecem disponíveis.
- **Associação de arestas:** máquina de estados, BPMN e contêineres compartilham label + decorate. A polilinha do vínculo recebe o mesmo traço da aresta; o halo existente da máquina de estados ajuda a leitura. Não há coordenadas, curvas ou cores novas no contrato autoral.
- **Hierarquia especializada:** pilha usa escala tipográfica coerente, bordas/divisórias de 2 px, quadro ativo inequívoco e quebra de textos longos. Terminal abre resultados recolhidos e revela streams/código de saída por controle icon-only. Memória destaca endereço, intervalo e direção; foi corrigida também a ordem dos extremos dentro de cada segmento descendente.
- **Texto e prática:** URL longa quebra na prosa sem overflow do documento. Fórmula e estado físico ficam no mesmo token semântico. Lacunas conservam alternativas multilinha, área de toque de 44 px e contorno de foco interno inteiro; foi removido rótulo redundante. O gerador da fixture deixou de prefixar legendas com “Como ler:”.
- **Áudio:** duração desconhecida é estado explícito. Arquivos usam metadados reais; fala nativa usa eventos, com normalização de segundos/milissegundos, exclusão da espera inicial e pausas. Não há avanço inventado por temporizador. A duração só aparece após término válido; nova fala elimina a medida anterior. Seek nativo fica indisponível, enquanto arquivo conserva busca. Pausar durante o início de play não descarta o arquivo por AbortError esperado.
- **Gráfico:** contorno discreto na cor da superfície protege rótulos de linhas de referência quando séries passam por trás. Preenchimento do texto, duas séries e doze pontos permanecem intactos na prova.
- **Autoria:** consulta sem filtro percorre todo o catálogo com continuação opaca vinculada ao recorte e revisão. Mandato salvo sem revisão curricular obrigatória permite materialização sem inventar aprovação humana. O fluxo padrão e conflitos continuam bloqueando. O auditor rejeita feedback exclusivamente genérico quando a operação declarada requer relação/procedimento; isso é uma barreira conservadora, não uma certificação semântica por palavras-chave.

Fontes principais: [viewport](../src/resources/sdk/diagramViewport.js), [Graphviz](../src/resources/sdk/graphviz.js), [estilos](../public/styles.css), [linha do tempo nativa](../src/resources/packages/audio/nativeTimeline.js), [tarefas compartilhadas](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js), [materialização](../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js) e [auditoria pedagógica](../src/domain/coursePedagogicalAudit.js). O espelho Edge foi regenerado com 94 arquivos; não há migração nova nesta etapa.

## Matriz de IDs afetados

“Testado localmente” não declara implantação nem validação humana. “Preservado” registra regressão exercitada, sem reabrir uma decisão humana já aceita.

| IDs | Requisito | Implementação | Prova | Limite | Estado técnico |
| --- | --- | --- | --- | --- | --- |
| P008 | Retirar prefixo redundante | Gerador sem “Como ler:” | Fixture regenerada e conferida | Curso novo ainda será autorado | Implementado/testado |
| P012, O013 | Lacuna multilinha clara | Rótulo, espaçamento, alvo e foco compartilhados | 320/390/430/1280; teclado, selecionar, limpar, selecionar novamente | Fixture sintética | Implementado; evidência autônoma consistente |
| D001, D002, O003 | Ações icon-only e contorno inteiro | Controles preservados; foco interno das alternativas | Clique/teclado, foco e retorno dos painéis | Não é auditoria integral de acessibilidade | Preservado/testado |
| D004, O071 | Player comum e duração compreensível | Estado desconhecido; normalização de eventos nativos | WAV real, stub, voz local real Chrome, pausa/retomada/fim/stop | Uma voz/um navegador reais | Implementado/testado |
| D005, O016 | Barrar áudio inviável upstream | Barreiras existentes conservadas | Contratos/readiness e integridade de arquivo | Nova autoria hospedada ainda pendente | Preservado; fluxo real pendente |
| O015 | Preservar hierarquia aceita do player | Sem retorno de metadados técnicos | Capturas e interação | Não reclassifica aceite humano anterior | Preservado |
| O059 | Rótulo inequivocamente ligado à aresta | label + decorate + halo existente | A/B, curvas, self-loop, guarda/ação, zoom | Casos representativos, não prova universal de layout | Implementado; evidência autônoma consistente |
| P021, P023, O029, O061 | Pilha coerente e divisórias perceptíveis | Escala comum, agrupamento, bordas de 2 px, ativo/retorno | Textos longos, zoom 1,25, rolagem até a base; ambos os hosts | Clareza pedagógica do curso novo pendente | Implementado/testado |
| P024, O062 | Terminal progressivo | Resultado fechado, detalhes por controle icon-only | Expandir/recolher e teclado; ambos os hosts | Conteúdo disciplinar preservado | Implementado/testado |
| P025, O063 | Memória enfatiza posição/intervalo/direção | Direção antes do mapa, endereços destacados, extremos descendentes corrigidos | Sequência completa de extremos monotônica; quatro larguras | Alvos semânticos mantidos | Implementado/testado |
| O064 | Prática recolhe operação de endereço/intervalo | Contrato de alvos vigente conservado | Runtime e catálogo | Coerência da nova prática será auditada | Preservado; pedagogia pendente |
| O070 | URL longa sem overflow de prosa | overflow-wrap compartilhado | Texto integral nos dois hosts/quatro larguras | Estruturas grandes continuam rolando | Implementado/testado |
| D008, O072 | Notação semanticamente inseparável | Espécie química/fórmula/estado unidos | Quatro espécies, mesma linha de base e adjacência | Variante sintética não reinterpreta captura histórica | Implementado/testado |
| O073 | BPMN sem colisões de rótulos | label reserva espaço; decorate mantém vínculo | Denso, participantes/raias, mensagem e texto longo | Casos reproduzíveis delimitados | Implementado/testado |
| O074 | Abertura sem grande vazio dominante | Scroll inicial condicionado, escala 1 | Contêiner passa de zero a três nós visíveis | Restante exige exploração legítima | Implementado/testado |
| D006, D016, D029 | Largura mobile única sem force-fit | Framing comum e exploração mantidos | 320/390/430/1280, pan/zoom/tela inteira | Web larga conserva quadro conceitual mobile | Preservado/testado |
| D021, O049 | Unidade e Explicação compartilham representação | Mesmos pacotes, hidratação e controles | Sweep completo; fechar/reabrir/retornar foco | Explicação da fixture é sintética | Implementado/testado |
| D030, O018 | Tabela larga pode rolar horizontalmente | Rolagem nativa, sem freeze/zoom universal | Início/fim em tabela e tabela-verdade; conteúdo final alcançado | Recorte parado não demonstra perda | Preservado; interação comprovada |
| D003, D027, D028, O068 | Remoções não voltam como fallback | Registry/contratos sem response.open e packages removidos | Runtime e catálogo corrente | Migração histórica não é renderer corrente | Preservado/testado |
| D026, O067 | Ordenação vertical | Mecanismo vigente conservado | Prática funcional e sweep visual | Sem novo julgamento humano | Preservado |
| P022, O060 | Código com linguagem | Renderer vigente conservado | Gramática, rolagem até final da linha | Linha longa pode rolar | Preservado/testado |
| D014, P026, O065 | Conteúdo/legenda sem bastidor técnico | Prefixo redundante removido; barreira editorial mantida | Fixture e auditoria | Qualidade integral das legendas depende da nova autoria | Implementação parcial; curso pendente |
| P002, O006, O023, O024, O025 | Explicação, operação, evidência e feedback coerentes | Inspeção focal e rejeição de feedback exclusivamente genérico | Runtime do auditor/materialização | Não reescreve outros cursos nem garante pedagogia por regex | Mecanismo testado; ensaio pendente |
| D009, D022 | Interface pequena sem podar repertório | Descoberta completa, referências derivadas, OpenAPI compacto | 34 referências em cinco chamadas; schema 24/24 | Jornada real completa ainda pendente | Implementado/testado |
| D019, D020 | Correção upstream e ciclo de prática | Núcleo compartilhado e ciclo vigente preservados | Incorreta/recuperação/correta/feedback/avanço na fixture | Qualidade do conteúdo novo ainda aberta | Testado localmente |
| D023, O069 | Produção focal por microssequência | Mandato explícito e foco da materialização | Bloqueio padrão, conflito e via automática separados | Agrupamento técnico não é unidade pedagógica | Contrato testado |
| D024, D025 | Segunda barreira semântica e diversidade de prática | Base inspecionável, escolha single/multiple e múltiplas lacunas disponíveis | Contratos e alvos preservados | Auditoria de oito dimensões do curso novo ainda necessária | Parcial; ensaio pendente |
| O066 | Diagrama interno de bloco ensinável ao iniciante | Representação preservada no sweep | Acesso visual nos hosts | Explicação didática nova ainda pendente | Renderer testado; pedagogia pendente |

Os itens preservados não receberam nova aprovação humana. H010–H012 serão tratados como hipóteses: este ensaio não autoriza causalidade geral.

## Comparação Graphviz

A/B sobre o motor embarcado: label + decorate teve zero colisões nos casos densos observados e um vínculo por aresta rotulada; xlabel + decorate colidiu com um participante no BPMN denso. No caso sintético reproduzível, o rótulo “confirmação registrada” cruzava “Atendimento ao público” com xlabel. Self-loop, guarda/ação e rótulos longos permaneceram acessíveis com a solução escolhida.

Decorate desenha a ligação geométrica até a spline; xlabel é posicionado depois do layout e não reserva o mesmo espaço. Cor não é o único mecanismo de associação. Não foi necessário inflar nodesep/ranksep. [Documentação Graphviz: decorate](https://graphviz.org/docs/attrs/decorate/), [xlabel](https://graphviz.org/docs/attrs/xlabel/).

No contêiner a origem mostrava zero nós com texto de 12 px. A tentativa de reduzir o desenho para caber produziu texto de aproximadamente 3 px e foi descartada. O mecanismo final conserva 12 px/escala 1 e abre com três nós visíveis. Zoom-out continua oferecendo visão global por escolha explícita.

## Sweep e evidência reproduzível

O [teste do catálogo](../tests/e2e/course-catalog-study.spec.js) executou a jornada funcional e oito combinações de largura/tema: 320, 390, 430 e 1280 px, claro/escuro. **9/9 passaram**, divididos em uma prova inicial de 390 claro e oito restantes. Só a prova de 390 claro produziu 168 capturas segmentadas com sobreposição; esse número não é o total de todas as larguras. Os 34 componentes estão representados no inventário da fixture: 29 recursos inline aparecem nos dois hosts, três respostas são exercitadas na prática e Áudio/Calculadora usam painéis próprios. As capturas de Explicação dos cenários de ferramentas/respostas mostram texto de apoio; não comprovam seus controles abertos. A prova complementar abriu os painéis reais de Áudio e Calculadora a partir dos dois hosts nas quatro larguras, calculou 2 + 3 = 5 e confirmou fechamento/retorno de foco. O teste de painel de áudio não aciona síntese nem depende de hardware; a voz real foi demonstrada separadamente. Não houve overflow horizontal do documento.

A inspeção autônoma leu 49 capturas distintas do catálogo e amostras focais adicionais. Três suspeitas visuais foram reconciliadas por interação: tabela, tabela-verdade e código alcançam a última coluna/linha ao rolar. Seis testes em 320/390 comprovaram isso em ambos os hosts. Tabela mediu 716 px dentro de janelas de 252/322 px; tabela-verdade, 590 px; código, 355 px. O conteúdo não desapareceu.

Achados novos corrigidos: extremos descendentes dentro dos segmentos de memória; erro de unidade do tempo de voz nativa; corrida de pausa antes da resolução de play; cruzamento entre série e rótulo de referência no gráfico. A prova do gráfico posterior à correção substitui a captura anterior como evidência desse mecanismo.

[Evidência selecionada e manifesto](evidencias/revisao-v10/README.md). Capturas demonstram aparência; testes/sequências registram interação. Arquivos privados de curso, sessão, credenciais e logs brutos não integram essa coleção.

| Prova | Resultado local | Limite |
| --- | --- | --- |
| Catálogo: course-catalog-study.spec.js | 9/9 | Fixture, não autoria GPT |
| Diagramas: revisao-v10-diagrams.spec.js | 13/13; helper 1/1 | Headless local; publicação ainda pendente |
| Superfície: revisao-v7-study-surface.spec.js | Lotes focais verdes: 12 reação/pilha/terminal; 8 URL/gap; 8 pilha/memória; 8 memória/foco finais; 6 rolagem | Lotes sobrepostos não são somados como casos únicos |
| Gráfico: revisao-v10-chart.spec.js | 4/4; quatro sondas adicionais; runtime pertinente 40/40 | Gráfico de linha nos quatro tamanhos e ambos os hosts |
| Áudio: audio-tool.spec.js | 8/8 antes da ampliação de pausa; 2/2 casos ampliados segundos/milissegundos | Voz simulada explicitamente, WAV real decodificado |
| Painéis de ferramentas: study-explanation.spec.js | 27/27, incluindo seis novos casos e 16 interações ferramenta/host/largura | Fixture local; fala não acionada nesses casos |
| Linha do tempo e resource-audio | 10/10 | 3 casos puros mais 7 de áudio |
| Autoria/materialização/auditoria | 124 testes focais; paginação/mandato 6/6 | Adapters locais, não serviço hospedado |
| OpenAPI: chatgpt-action-human-schema.test.js | 24/24 | Schema sozinho não comprova Actions funcional |
| ESLint focal e diff check | Passaram | Gate amplo ainda pendente |

Specs comuns podem ser reproduzidas pelo executor oficial: npm run test:e2e -- tests/e2e/revisao-v10-diagrams.spec.js, por exemplo. As sondas de desenvolvimento usaram servidores privados em modo repositório; o gate da candidata executará as specs aplicáveis sobre o artefato preparado.

## Voz nativa real

Chrome normal persistente **153**, Windows, voz local **Microsoft Daniel — Portuguese (Brazil)**. O renderer e seu binding reais foram montados com texto sintético, sem trocar o motor de síntese nem enviar texto a serviço remoto. Observadores passivos registraram os eventos. Foram exercitados play, pausa, retomada, fim, novo play e stop.

Antes da correção, aproximadamente dois segundos eram apresentados como dezenas de minutos. Chromium emite milissegundos nesse caminho, embora a especificação atual defina segundos. A correção reconhece a unidade pelos intervalos dos eventos e timeStamp; desconta início/pausas e recusa medidas incoerentes. [Código Chromium](https://chromium.googlesource.com/chromium/src/+/707729f5957506319139ec03137aaebb63a04eaa/third_party/blink/renderer/modules/speech/speech_synthesis.cc), [Web Speech](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisevent-elapsedtime).

Depois da correção: contador congelado em 0:01 durante a pausa, retomada em 0:04, término em 0:12/0:12. Nova fala voltou à duração desconhecida; stop cancelou a fala e zerou o contador. Seek nativo permaneceu indisponível. Isso comprova esse ambiente real, não todos os motores. A revisão independente apontou falta de callbacks de pausa na fixture; a raiz acrescentou os eventos pause/resume e fronteira atrasada, com 2/2 testes verdes nas duas unidades de tempo.

## ChatGPT, MCP e Actions

Chrome normal persistente, **Chat**, potência **Média**, foram usados. O GPT AraLearn — Autoria teve removidos dois arquivos Knowledge obsoletos que mantinham informação de legado; instruções passaram de 7.848 para 1.483 caracteres, foram salvas e relidas. OAuth foi preservado. O OpenAPI candidato contém 30 operações/56 tarefas e 99.585 caracteres, abaixo do limite existente de 100.000. As instruções compartilhadas têm 986 caracteres. A configuração do schema candidato na interface aguarda sua publicação.

Prompts humanos já usados, na ordem:

1. MCP/Chat: “Consulte os recursos didáticos e formatos de prática disponíveis no AraLearn, sem criar, editar ou excluir cursos. Informe se a consulta funcionou.”
2. MCP/Chat: “A lista parece estar incompleta. Consulte as continuações e me mostre todos os recursos atuais, sem modificar cursos.” A resposta reuniu 30 recursos e três respostas; omitiu Plano cartesiano e reconheceu a ausência de continuação no contrato então publicado. Não foi considerada cobertura completa.
3. Actions/Chat novo: “Confira na conexão com o AraLearn quais recursos de aprendizagem estão disponíveis hoje. Use uma consulta ao vivo, sem criar, editar ou excluir cursos. Se a conexão falhar ou a resposta vier incompleta, diga isso com clareza.”
4. Actions: “Nos detalhes, a primeira consulta falhou. Faça agora uma consulta específica aos recursos que ajudam a comparar informações. Só considere a consulta bem-sucedida se receber a resposta do AraLearn; não modifique cursos.”

Actions foi realmente chamado: primeira consulta sem filtro retornou 422 às 16:59:17Z; quatro recuperações retornaram 200 entre 16:59:21Z e 16:59:35Z, e a consulta específica retornou 200 às 17:02:37Z. Método, endpoint, horário, status e cliente ChatGPT-User foram corroborados no backend. A conversa omite corpos de sucesso; essa omissão não foi tratada como invenção. A candidata corrige a rejeição da consulta sem filtro.

Essas chamadas comprovam **leitura real por Actions**, não criação/correção. A primeira consulta MCP ainda não constitui o fluxo completo exigido. O export de backup pelo conector MCP do Codex é **MCP de engenharia**, separado da autoria pelo ChatGPT. Consultas HTTP do manifesto, diagnósticos locais e testes de contrato não recebem crédito de MCP/Actions real.

Criação, planejamento, materialização, correção após observação, deep links, aterrissagem e persistência do curso novo: **pendentes**. Os prompts adicionais serão acrescentados sem JSON, schema ou nomes internos impostos ao GPT autor.

## Catálogo e substituição do curso

Catálogo corrente: **34 componentes**, sendo 31 recursos expositivos e 3 formatos de resposta:

Texto explicado; Código; Tabela; Texto anotado; Processo BPMN; Glosa interlinear; Escolha; Lacuna; Ordenação; Árvore enraizada; Matriz; Reação; Fluxograma; Fórmula; Plano cartesiano; Gráfico estatístico; Contexto de sistema de software; Contêineres de software; Diagrama interno de bloco; Grafo matemático; Diagrama de relação; Esquema relacional; Mapa de memória; Topologia de rede; Layout de pacote; Diagrama de conjuntos; Diagrama de estados; Tabela-verdade; Modelo entidade-relacionamento; Tabela de transição; Pilha de chamadas; Áudio; Calculadora; Sessão de terminal.

O curso novo ainda não foi criado. A fixture não é apresentada como curso novo nem como pedagogia produzida pelo ChatGPT. A auditoria de cada microssequência verificará objetivo claro, explicação suficiente, operação coerente, evidência recolhida, prática adequada, feedback específico/recuperativo, representação adequada e hierarquia/carga visual. Cada parecer deverá citar conteúdo salvo e pode rejeitar material estruturalmente válido.

Legado exato: **AraLearn: Catálogo de recursos**, ID **2229ccb4-4b39-4a2f-938f-3d306e6e4e4d**. A revisão viva exportada é **426**, distinta da revisão histórica 425. O backup privado preserva 980.046 bytes, 92 páginas de export, 38 microssequências, 76 unidades, 114 revisões e fontes. SHA-256 confirmado: **d05708a244a41f70274ef56fca2c3f1fe28ae31b52738557ffca42fd56d3500c**. Limites históricos do export, incluindo proveniência ausente e metadados incompletos em unidades antigas, estão registrados no manifesto privado.

A auditoria do export e a releitura MCP não encontraram arquivos binários a preservar: áudio é nativo, não há arquivos de áudio guardados, os 38 registros de armazenamento PDF têm zero bytes e as 44 fontes exportadas têm anexos vazios. URLs externas e passagens/âncoras permanecem rastreáveis no JSON; páginas externas completas não foram arquivadas. Qualquer mudança de revisão ou inclusão posterior de arquivos exige novo export antes da exclusão. A cópia de acervo de ID c99b4cd2-9b68-433b-82f5-5538e8dfad4d não é o alvo. Nenhum curso foi alterado ou excluído nesta etapa. Antes de excluir o legado serão reconferidos revisão/arquivos, abertura e persistência do substituto, cobertura do catálogo e rastreabilidade.

## Etapas obrigatórias ainda abertas

Gates locais/CI, publicação no ambiente autorizado e importação do schema candidato na configuração funcional de Actions. Depois, autoria integral do curso novo pelo ChatGPT Chat, jornadas reais e distintas MCP/Actions, inspeção do destino e correção pelas ferramentas, auditoria das oito dimensões, cobertura do catálogo e substituição segura do legado.

Essas etapas têm autorização vigente e não dependem de aprovação visual ou pedagógica humana nesta intervenção. O relatório receberá commit final, versão efetivamente entregue, IDs/deep links do novo curso, provas de persistência e estado final de cada requisito após sua execução. Nenhuma etapa pendente é apresentada como concluída.
