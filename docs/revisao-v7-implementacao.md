# Implementação da revisão v7

Baseline: `3b863399fedc74d86c8b04e13bc9aa28a8f1704a`, versão `0.0.81`.
Especificação: `REGISTRO-DA-REVISAO-v7.md`, revisão humana de 24/09/2026.

**Estado: implementação integrada e validada localmente em 24/09/2026; candidata 0.0.82 em preparação para publicação.**
Os resultados abaixo distinguem implementação, prova local e julgamento humano.
As provas desta seção antecedem a promoção e não certificam aprendizagem. A entrega inclui a publicação conjunta das migrations, Functions, site e APK pelo fluxo protegido do projeto.

## Arquitetura e decisões

O fluxo anterior já possuía planejamento instrucional, unidades de análise,
requisitos de evidência e aplicações pedagógicas. O problema estava na passagem
entre essas estruturas, a materialização e a inspeção: um conteúdo podia ser
formalmente válido e não recolher a evidência que declarava.

A materialização agora recebe um foco pedagógico por chamada. A microssequência
identifica o recorte; o backend resolve a parte, completa identidades de
instâncias, versões, posições e papéis deriváveis e preserva o planejamento
existente. Parte e microssequência continuam conceitos distintos. A parte é um
agrupamento operacional, não uma obrigação de gerar vários percursos de uma vez.

| Responsabilidade | Antes | Fluxo implementado |
| --- | --- | --- |
| Recorte de produção | Parte fornecida e possibilidade de vários focos | Uma microssequência; parte encontrada no planejamento |
| Instâncias de componentes | Identidades e versões explícitas no envelope | Alias de package e preenchimento de valores deriváveis |
| Posição e papel da unidade | Bookkeeping junto ao conteúdo | Posição assistida e papel coerente com presença de prática |
| Preparação | Etapa operacional separada obrigatória | Preparação explícita opcional, executada pelo backend quando omitida |
| Evidência pedagógica | Referências e validade estrutural não demonstravam a operação | Visão do estudante mascarada, requisitos associados e cinco checks semânticos |
| Fontes na auditoria | Leituras separadas para associar alvo, vínculo e âncora | Base focal já associada, com passagem selecionada e invalidação por mudança |

Referências que expressam relações do conteúdo permanecem: por exemplo, a lacuna
precisa identificar o alvo que oculta e o mapa curricular conserva dependências.
O sistema deriva o que conhece; não inventa uma escolha pedagógica ambígua para
economizar um campo. Os exemplos de autoria não exigem coordenadas nem dimensões.

A inspeção posterior examina cinco dimensões: alinhamento, evidência,
representação, feedback e suficiência. Seu pacote reúne objetivo, público,
Explicação, requisitos, unidades do foco e dependências relevantes. A visão do
estudante é reconstruída com as respostas das lacunas ocultas. O parecer precisa
fundamentar suas conclusões em trechos da base corrente; alterações nessa base
invalidam o parecer anterior. Contradições verificáveis impedem declarar
consistência. Salvar conteúdo não o declara pedagogicamente satisfatório.

Essa barreira combina verificações objetivas e julgamento semântico. Detecta,
por exemplo, prática declarada sem resposta, requisito inexistente, distrator
equivalente à resposta local, alternativas duplicadas e orientação
editorial misturada a explicações específicas. O auditor examina também dados insuficientes, respostas antecipadas,
representação inadequada, repetição mecânica e quantidade artificialmente mínima.
Ele deve demonstrar o defeito concreto: uma lacuna, `choice single` ou seleção
de justificativas não são insuficientes apenas pelo formato.

O feedback específico de todas as alternativas pode cumprir a função de retorno
sem exigir um comentário geral redundante. A auditoria considera a utilidade de
cada trecho, inclusive excesso de repetição, sem impor um teto arbitrário de
caracteres à explicação necessária.

O gerador do curso de catálogo passou a explicar os dados e as respostas de
cada prática. Metadados de manifesto deixaram de ser acrescentados ao feedback;
os limites de leitura são apresentados em linguagem didática. O exemplo de
gráfico identifica seus dados como simulados e explica eixos, referência e
incerteza, sem declarar um experimento empírico que não ocorreu. Essas alterações
eliminam uma fonte de exemplos editoriais; a suficiência pedagógica de um curso
continua exigindo a auditoria de seu objetivo e evidência.

### Contratos, representações e prática

- `choice` conserva seleção única e múltipla. O exemplo canônico usa múltiplas
  corretas e feedback por alternativa; a avaliação exige o conjunto correto.
- `gap` conserva uma ou várias lacunas. Endereços e valores lógicos usam a
  interpretação do componente de origem. Caixa, zeros e base de um endereço
  não se confundem com identificadores de código sensíveis à caixa.
- `ordering` usa lista vertical, texto alinhado ao início e ações subir/descer.
  Pontuação entre itens acompanha a linha do item; prosa intermediária e texto
  de edição são preservados.
- Tabela expõe `title`, `legend` e `note`. Largura, compactação e responsividade
  pertencem ao renderer. A conversão de conteúdo anterior preserva a orientação
  em parágrafo e a antiga legenda como ressalva.
- A autoria matemática usa um subconjunto documentado de TeX; a árvore
  semântica permanece detalhe interno. A notação compartilhada atravessa prosa,
  tabelas e rótulos, preservando texto literal de código e terminal.
- Ruby conserva escrita e leitura separadas, com idioma/notação da leitura
  quando necessário, incluindo kana, pinyin e IPA. Segmentação não insere
  espaços artificiais na ortografia de línguas que não os usam.

### Superfície de estudo

Unidade e Explicação reutilizam o renderer e os mecanismos de enquadramento.
A largura conceitual é de até 430 px, inclusive na web. Diagramas começam em
escala legível e oferecem exploração, rolagem, zoom e tela inteira. Tabelas
largas conservam o conteúdo por rolagem. A autoria não escolhe pixels, quebras,
coordenadas ou variantes desktop/mobile.

O dimensionamento dos rótulos internos ocorre antes do layout dos diagramas.
Isso corrige perdas de texto em ER, esquema de banco e SysML, inclusive quando
a Explicação acrescenta a instrumentação de citações. State machine separa
rótulo e aresta sem exigir coordenadas. BPMN conserva rótulos de eventos e
gateways. O fallback de conjuntos mantém marcadores em regiões estreitas com
chamada externa, sem omitir o elemento.

Pilha de chamadas distingue chamada ativa, suspensas, ordem e retorno. Terminal
apresenta progressivamente contexto, comando, saída e resultado. Memória
prioriza intervalos e endereços, que também são alvos de prática. Código mostra
a linguagem declarada. Legendas de plano/gráfico são secundárias; a glosa separa
suas abreviações do corpo. A legenda de grafo preserva a notação `(V, E)` e
identifica os vértices, as arestas e suas contagens. Não se atribuiu dificuldade
de repertório a um defeito geométrico: o ajuste de Q013 explica os símbolos que
a própria representação introduz. As captions explicam como ler a representação.

O comentário de estudo abre acima da barra de ações, preservando o clique na
Explicação e o retorno de foco. Ações operacionais usam ícones com nomes
acessíveis; campos, opções e conteúdo mantêm seus rótulos. Ações destrutivas
recebem sinalização própria. Filtrar uma coleção vazia não apaga o contexto do
filtro; exportações distinguem preparação do arquivo de confirmação de download.

### Fontes, áudio e persistência

Fontes da unidade e da Explicação têm entradas e escopos próprios. Uma fonte
existente sem âncora demonstrada não aparece como ausência de fonte. Obra,
localização, ocorrência e trecho sustentado permanecem distintos. O editor de
ocorrências evita repetir o texto inteiro no seletor, e a paginação informa
quantos registros foram carregados e se existem mais.

A base pedagógica reúne também as ocorrências e as âncoras selecionadas em cada
vínculo. A fonte, a passagem externa e a afirmação local chegam associadas ao
auditor; não é necessário juntar identidades técnicas. Uma âncora de outra parte
da obra não entra na base apenas por pertencer à mesma fonte. Trechos externos
presentes nessa base podem fundamentar os checks, e mudanças no vínculo
invalidam o parecer. A correspondência semântica exige leitura crítica: a
existência da fonte ou uma ocorrência estruturalmente localizada não a certifica.

O028 foi confirmado por leitura dos vínculos salvos: a afirmação de relações
aponta para interseção; as afirmações de conjuntos, para tabela-verdade. Os
destinos compatíveis foram localizados e inspecionados no livro do MIT: diagramas
de relações na [posição 99 do PDF, página impressa 90](https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/mit6_042js15_textbook.pdf#page=99)
e interseção na [posição 92, página impressa 83](https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/mit6_042js15_textbook.pdf#page=92).
Em O058, a definição de transição foi encontrada na [posição 8 da aula de autômatos](https://ocw.mit.edu/courses/6-045j-automata-computability-and-complexity-spring-2011/a8b9bb8d5d9c1f7a6b4a85056b8dcbde_MIT6_045JS11_lec03.pdf#page=8).
A obra existe; o vínculo salvo aponta à página geral do curso, que não demonstra
a localização dessa passagem. A leitura do banco foi somente leitura: os dados
desses cursos hospedados não foram reancorados por esta implementação local.

O player de áudio oferece controles separados, progresso e duração real para
arquivos, com transcrição, leitura e tradução submetidas à condição de revelação.
Materialização, publicação e compartilhamento exigem gravação disponível no curso
e referência de mídia verificável. Voz nativa depende do dispositivo e não
comprova disponibilidade para publicação. Não se inventa duração de síntese nativa.

Revisar uma observação preserva sua resposta e estado. Responder não implica
triagem nem encerramento. A interface impede envio vazio e decisões em lote sem
alvos válidos, mantendo as validações de domínio como segunda barreira.

## Remoções e migrations

Foram retirados os pacotes `aralearn.response.open`, `dictionary`, `grammar` e
`reading`, além do suporte exclusivo de links auxiliares. Não há renderer
oculto, `legacy_only` ou fallback permanente para esses componentes. Conteúdo
útil é convertido uma vez; os originais permanecem como recuperação inerte
quando necessário. Comandos de recuperação que contêm estruturas retiradas
perdem a capacidade de replay.

A conversão técnica preserva integralmente o histórico de autoria: contadores,
origem, ator, canal e indicação de completude. O ensaio restaurado identificou
que o trigger editorial poderia tratar essa conversão como uma intervenção de
autoria; a migration passou a usar uma origem técnica restrita à sua transação.
O teste de remoção executa o trigger real e verifica tanto a preservação do
histórico de Unidade e Explicação quanto o fim dessa configuração no commit.

| Migration | Finalidade |
| --- | --- |
| `20260924164623_revisao_v7_pedagogical_inspection.sql` | Parecer pedagógico com cinco dimensões e estado de insuficiência |
| `20260924171236_revisao_v7_observation_preservation.sql` | Preservação de resposta e estado ao revisar observações |
| `20260924172159_revisao_v7_component_removal.sql` | Conversão de componentes retirados e catálogo corrente |
| `20260924175938_revisao_v7_focal_audit_basis.sql` | Base focal da auditoria e invalidação por mudanças relevantes |
| `20260924182348_revisao_v7_audio_readiness.sql` | Disponibilidade de gravações antes de materializar/publicar/compartilhar |
| `20260924185630_revisao_v7_runtime_contract.sql` | Manifesto de contrato corrente |

O cache IndexedDB passa à versão 3 com conversão transacional e recuperação dos
originais. Valores estruturados sem componentes retirados, incluindo binários,
inteiros grandes e ciclos, não são reescritos por uma conversão de JSON genérica.

A prova de desenvolvimento de backup, restauração, atualização e instalação limpa
passou com 236 migrations. Atualização e instalação limpa produziram o mesmo
schema (`02c366499189a2f5ebe22249d67685abb678a256ab87e9a3e0d231ce066b69a7`)
e catálogo (`37181071ac4e44e6265eb43e0cf63d14b31ba546cb8cbc19f1ef635a1c61f31d`),
sem migrations pendentes na repetição. Foram conservadas bases, arquivos retidos,
alvos, entidades, recibos, anexos e observações da fixture. O backup do banco
contém metadados de Storage; recuperar os objetos exige também o backup de Storage.
Os contêineres dessa prova são cópias offline, com workers assíncronos e paralelos
desativados apenas nelas para impedir reconexões durante a recriação do banco.
Extensões, constraints, permissões e todo o conteúdo do backup permanecem na
verificação. A prova não certifica execução de tarefas em segundo plano; os
clientes reais foram testados separadamente na stack local completa. Esses hashes
antecedem a sincronização final da impressão do catálogo e o ajuste de proveniência
editorial; a publicação exige novo ensaio com as migrations da candidata final.

## Experimentos pedagógicos

O [relatório dos experimentos](experimentos/revisao-v7/README.md) contém o
protocolo, os contratos congelados, as primeiras saídas, as correções e a
avaliação crítica. As gerações reais de GPT incluem seis focos independentes,
dois recortes com três microssequências, duas gerações com parte derivada e um
ciclo de crítica e correção de memória. A segunda correção desse ciclo é uma
continuação, não uma nova réplica independente.

As gerações expuseram insuficiências semânticas apesar de contratos válidos.
Esses casos orientaram a visão mascarada do auditor e a exigência de examinar a
operação realmente recolhida. O caso corrigido de memória reúne cálculo de
extremo, cálculo de tamanho e classificação de intervalos, com dados completos,
seis alternativas, três corretas e feedback específico.

Em Q019, a decisão técnica desta implementação é conservar a parte como
agrupamento administrado pelo backend e exigir uma microssequência por chamada
de produção. Os ensaios não mostraram benefício que justificasse uma segunda
migração para tornar parte e microssequência equivalentes. A escolha atende D023
e retira o lote cognitivo da interface, preservando organização e execução.
Não se afirma que a amostra demonstrou equivalência entre gerações focais e em
grupo; os confundidores e as falhas estão registrados no protocolo.

Em Q020, os ensaios exercitaram 2/4/6 lacunas e um controle de 12, incluindo
distratores cruzados e ambiguidade local. A decisão técnica é manter capacidade
de até 12 com validação por alvo e auditoria da coerência global. O controle de
12 comprovou uma operação legítima de intervalos de memória; reduzir a capacidade
para seis excluiria esse caso sem evidência de benefício geral. Isso não torna
12 uma quantidade recomendada nem um limite pedagógico seguro universal. A
quantidade precisa justificar a evidência recolhida, sem preferência por mínimos.

## Validação

As provas usam o runtime real dos componentes, interações de navegador,
inspeção visual e PostgreSQL descartável. Testes com clientes simulados não são
classificados como integração hospedada. Os gates são executados pelos mesmos
comandos selecionados pelo plano de impacto do projeto. Essas provas de desenvolvimento
antecedem a preparação formal da candidata, a CI protegida e os recibos de promoção.
A matriz distingue prova técnica local, investigação e julgamento humano.

Resultados já confirmados: enquadramento compartilhado de Unidade/Explicação,
valores tipados em prática, ordenação vertical, recuperação de edição, áudio,
calculadora, fontes, configurações, observações, remoções e provas de geração.
O build e o lint Android finais passaram com os assets atuais. Preflight, lint
JavaScript e validação do contrato de runtime também passaram. As expectativas
antigas encontradas no runtime e no navegador foram corrigidas e revalidadas.

As provas focais abaixo permanecem identificáveis no repositório, junto aos
ensaios integrados descritos nesta seção.

A suíte ampla de runtime executou 237 arquivos: 2.461 testes passaram, nenhum
falhou e 15 provas de integração explícita foram omitidas nessa execução sem
configuração de banco/Storage. As 15 foram depois executadas explicitamente e
passaram: 14 de concorrência e uma de cópia com arquivos reais.
Após a revisão final, foram repetidos os testes afetados por auditoria, exemplos
do catálogo e edição manual, incluindo a paridade do runtime Edge.
Os 14 testes PostgreSQL de concorrência foram depois executados contra o banco
descartável e passaram, sem skips. Eles cobrem locks, retry, revogação, exclusão,
referências de arquivos, limites de consulta e rollback após timeout.
O pgTAP passou nos 22 arquivos, com 892 asserções. As fixtures passaram a
registrar o arquivo antes de associá-lo ao áudio e comprovam as recusas de
publicação com arquivo ausente, bytes divergentes ou acesso público restrito,
além da publicação válida. O guard também impede retirar uma gravação ainda
usada pela Unidade ou Explicação; substituir a faixa permite concluir a retirada.
Essa proteção fica no comando de remoção de áudio, sob os locks existentes.
A prova com PDF/WAV encontrou e corrigiu um trigger que também impedia excluir
o curso inteiro. A exclusão autorizada do curso conserva seu ciclo de limpeza;
a cópia continua baixando os dois arquivos depois da exclusão da origem, e a
remoção da última referência apaga os objetos do Storage. A API distingue áudio
em uso, gravação ausente, arquivo indisponível e acesso público ainda restrito,
sem convertê-los em “o curso mudou” nem expor detalhes internos do banco.

A [prova focal com clientes reais](../supabase/tests/course-focal-client-local-smoke.mjs)
usa OAuth MCP e Actions da mesma pessoa sintética, com recusa da Action anônima.
O MCP cria o planejamento e materializa o B-2 real dos experimentos, sem parte,
preparação prévia ou posições no pedido. A leitura paginada recupera suas três
práticas. Um controle negativo explicitamente sintético remove os feedbacks por
alternativa; o parecer correspondente fica `needs_attention`. Actions restaura
o conteúdo original, e uma nova base de inspeção recebe `consistent`, confirmado
pela releitura MCP. O controle testa transporte, validação, persistência e
correção de um parecer fundamentado: seus pareceres são escritos no teste, não
uma nova geração nem uma demonstração de detecção semântica autônoma. Os
julgamentos independentes de GPT estão nos experimentos pedagógicos acima.
O [recibo sanitizado da integração](experimentos/revisao-v7/integracao-local.json)
registra a restauração literal das alternativas e dos feedbacks, as bases
distintas e as 72 chamadas do cliente, incluindo setup e releituras paginadas.

A seleção de navegador executou 282 cenários. A primeira passagem teve 264
sucessos e 18 falhas. A atualização das expectativas antigas revelou também
campos inacessíveis na edição de choice, fórmula e terminal; a correção expõe
esses campos somente durante a edição. Os 18 cenários foram reexecutados e
passaram. Outros 25 cenários do editor de fontes, descobertos na análise de
consumidores, também passaram após atualização de seus nomes acessíveis.
São 307 cenários distintos validados pela união das execuções, sem retries
automáticos. As capturas da edição de choice, fórmula e terminal foram
inspecionadas em 360 px, com a interação dos 34 componentes testada até 1280 px.

Outras dez jornadas usaram navegador, autenticação, API, PostgreSQL e Storage
locais reais: sete de acesso/fontes/sincronização, uma de edição contextual,
uma de reorganização de partes e uma de áudio. Todas passaram após corrigir
expectativas de escopo/rótulos e as fixtures de áudio retiradas. As provas de
fontes e parâmetros foram inspecionadas em 360/1280 px; o player com WAV/MP3 foi
inspecionado em 390 px. O gate de compartilhamento consulta explicitamente o
container descartável, sem depender do nome da instalação local existente.
O total de navegador é 317 cenários distintos pela união dessas execuções.

O ajuste final do ciclo de áudio foi validado por 81 testes focais de adapter,
prontidão e contrato do cliente; repetição dos dois testes concorrentes de
cópia/áudio; pgTAP completo; cópia/remoção real de PDF/WAV; reprodução e
publicação pelo cliente real. Preflight, lint e contrato de runtime passaram
novamente. A restauração e instalação limpa foram repetidas para a migration
final. As fixtures deixadas pela execução que revelou o defeito foram removidas
após a correção, pelo mesmo lifecycle autenticado, com arquivos reconciliados.

| Grupo | Cobertura e instrumentos |
| --- | --- |
| Autoria e auditoria | [Materialização focal](../tests/runtime/course-focal-materialization.test.js), [auditoria pedagógica](../tests/runtime/course-pedagogical-audit.test.js), [MCP](../tests/runtime/course-human-mcp.test.js) e [protocolo de geração](experimentos/revisao-v7/README.md) |
| Migrações | [Remoção no banco](../tests/runtime/revisao-v7-component-migration.test.js), [cache](../tests/runtime/revisao-v7-cache-upgrade.test.js) e [backup/restauração](../scripts/verifyBackupRestoreUpgrade.mjs) |
| Representação e prática | [Componentes e respostas](../tests/runtime/revisao-v7-components.test.js), [enquadramento nos dois hosts](../tests/e2e/revisao-v7-study-surface.spec.js), [valores tipados](../tests/e2e/revisao-v7-typed-values.spec.js), [ordenação e conjuntos](../tests/e2e/revisao-v7-ordering-sets.spec.js) e [legendas](../tests/e2e/revisao-v7-legends.spec.js) |
| Notação e leitura | [TeX](../tests/runtime/revisao-v7-tex.test.js), [pronúncia](../tests/runtime/revisao-v7-pronunciation.test.js) e [interação de leitura anotada](../tests/e2e/revisao-v7-pronunciation.spec.js) |
| Fontes | [Escopos e retorno](../tests/e2e/revisao-v7-source-surface.spec.js), [editor de fontes](../tests/runtime/revisao-v7-source-panel.test.js) e [paginação e âncoras](../tests/e2e/revisao-v7-source-panel.spec.js) |
| Áudio | [Disponibilidade](../tests/runtime/revisao-v7-audio-readiness.test.js), [validação de bytes](../tests/runtime/resource-audio.test.js) e [player](../tests/e2e/audio-tool.spec.js) |
| Ações e estados | [Configurações](../tests/e2e/revisao-v7-settings.spec.js), [conta/dispositivo](../tests/e2e/revisao-v7-account-device.spec.js), [Home](../tests/e2e/revisao-v7-home-design.spec.js), [autoria](../tests/e2e/revisao-v7-authoring-actions.spec.js), [painéis](../tests/e2e/revisao-v7-panels.spec.js) e [hipóteses](../tests/e2e/revisao-v7-hypotheses.spec.js) |

H003 foi reproduzida como transitoriedade do aviso de tentativa: salvar ou
recarregar limpa o aviso; tentar avançar com lacunas vazias o regenera, e o
comentário autoral permanece. H004 não se confirmou como invisibilidade ou
impedimento de interação nas lacunas por escolha e por texto em 390/1280 px.
A lacuna de texto vazia continua discreta; a prova técnica não mede descoberta
espontânea por estudantes. Esses resultados não justificam inventar uma falha
de persistência nem certificar usabilidade geral.

H008 confirmou a junção entre rótulo e contagem em “Dados e definições”. O
componente agora insere separação textual, conservando quebra natural e
navegação por teclado; os dois casos passaram em 390/1280 px. H005 confirmou
as fronteiras de 2 MiB no envelope público e de 8 MiB na leitura interna. O
erro de tamanho passa a orientar mudança de recorte/curso, sem recomendar
repetir a mesma leitura. A [prova de comparação](experimentos/revisao-v7/comparacao-grande.md)
documenta os 13 casos HTTP locais, os 12 casos de mensagem e seis E2E, com seus
limites de identidade e dados simulados. Isso não identifica retroativamente
a causa exata do episódio hospedado registrado no acervo.

H009 foi confirmado separadamente de O034. O layout posicionava o rótulo de um
fluxo sob o preenchimento de um gateway: a oclusão medida era de 36,7% e persistia
em Unidade, Explicação e tela inteira com pan/zoom. Usar `xlabel` para os fluxos
do BPMN eliminou a oclusão nos três conjuntos comparados. O traçado permanece
poligonal; a alternativa de linhas retas atravessou um nó no conjunto mais denso.
A regressão cobre os dois hosts em 390/1280 px e uma lacuna operável no rótulo.
Não se generalizou a mudança aos demais diagramas sem defeito demonstrado.

## Validação humana posterior e limites

As migrations, Functions e runtime web/Android integram a candidata de publicação
como um conjunto compatível. A preparação e os gates de promoção precisam conservar
a identidade dos bytes aprovados. Os cursos hospedados consultados não
foram editados: as reancoragens descritas em O028/O058 permanecem uma aplicação
de dados separada, com os destinos verificados neste relatório.

As validações objetivas não demonstram que uma explicação ensina bem nem que um
parecer semântico está correto. Os ensaios expuseram esse limite e conservaram
suas primeiras falhas. A revisão independente e a correção continuam necessárias
quando houver insuficiência. Os testes visuais cobrem os estados e dimensões
declarados; não certificam toda combinação possível de conteúdo aceito.

D017 exige uma observação humana posterior, que uma execução autônoma não pode
inventar. Os estados a observar são: primeira abertura de M14 corrigida,
Exploração e retorno em M23/M28/M29/M32, gramática visual de pilha e SysML,
leitura de legendas, comentário com a barra acessível, foco e estados destrutivos
de configurações. Os testes locais fornecem as condições reproduzíveis.

Permanecem decisões humanas de produto sobre posição dos controles
administrativos, relação/herança das fontes, apresentação de citações curtas,
superfície de credenciais e momento/terminologia de acesso público aos arquivos.
H006 registra uma restrição da coleta, não uma autorização para criar produto
de controle de custos nem para executar chamadas pagas sem teto autorizado.

## Rastreabilidade dos IDs

A matriz mantém todos os 167 IDs, incluindo erratas e fatos já aceitos.
“Resolvido” identifica comportamento técnico validado localmente; não substitui D017. Fatos já aceitos foram preservados e testados. Hipóteses mantêm o resultado da investigação, inclusive quando não foi possível demonstrar causalidade. Ocorrências em conteúdo hospedado distinguem a barreira transversal validada da reautoria/reancoragem ainda não aplicada.

| ID | Resultado rastreado | Status | Mecanismo / arquivos principais |
| --- | --- | --- | --- |
| D001 | Ações devem ser icon-only em todo o produto. | Resolvido por mudança transversal | src/ui/renderHomeScreen.js; src/ui/VisitorSettings.js; src/ui/CourseAuthoringSurface.js; public/main.js |
| D002 | Foco e seleção devem manter o contorno inteiro. | Resolvido por mudança transversal | public/styles.css; public/authoring-settings.css; componentes UI com focus-visible |
| D003 | Remover Dicionário, Gramática e Leitura como recursos próprios. | Resolvido por mudança transversal | src/resources/catalog/resourceCatalog.js; src/resources/packages/*; supabase/functions/_shared/aralearn/runtime/resources/packages/*; migração 20260924172159_revisao_v7_component_removal.sql |
| D004 | Toda faixa de áudio deve usar um único player pedagógico. | Resolvido por mudança transversal | src/resources/packages/audio/index.js; src/resources/packages/audio/interaction.js; src/ui/CourseAudioPanel.js |
| D005 | Áudio inviável deve ser barrado antes de publicar por MCP/Actions. | Resolvido por mudança transversal | supabase/migrations/20260924182348_revisao_v7_audio_readiness.sql; src/domain/courseMedia.js; docs/autoria-mcp.md |
| D006 | A superfície usa uma única largura conceitual mobile. | Resolvido por mudança transversal | public/styles.css; src/resources/sdk/diagramViewport.js; renderers de estudo |
| D007 | Tabela deve expor funções semânticas, não layout autoral. | Resolvido por mudança transversal | src/resources/packages/table/index.js; public/styles.css .runtime-table-wrap |
| D008 | Notação e leitura enriquecidas atravessam componentes sem interação estrutural. | Resolvido por mudança transversal | src/resources/packages/paragraph/index.js; src/resources/packages/paragraph/richText.js; src/resources/sdk/mathExpression.js |
| D009 | Interface cognitiva MCP/Actions deve ser pequena, explícita e validada. | Resolvido por mudança transversal | supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js; docs/downloads/aralearn-chatgpt-action-openapi.yaml; scripts/buildChatGptActionOpenApi.mjs |
| D010 | Leitura/pronúncia deve ser transversal, incluindo IPA e variantes. | Resolvido por mudança transversal | src/resources/packages/paragraph/richText.js; src/resources/packages/interlinear-gloss/index.js; src/resources/sdk/html.js |
| D011 | Matriz permanece própria quando há interação interna. | Resolvido | src/resources/packages/matrix/index.js; catálogo de resources |
| D012 | Visualização é principal e legenda é secundária. | Resolvido | src/resources/packages/plane/index.js; src/resources/packages/chart/index.js; public/styles.css |
| D013 | Citações devem ficar separadas da prosa explicativa. | Resolvido por mudança transversal | src/study/studyCitations.js; src/ui/CourseSourcesPanel.js; src/resources/packages/paragraph/richText.js |
| D014 | Conteúdo pedagógico não deve expor mensagens operacionais. | Resolvido por mudança transversal | src/resources/kernel/packageRegistry.js; src/ui/renderState.js; packages de áudio e parágrafo |
| D015 | Calculadora deve ter experiência convencional real. | Resolvido | src/resources/packages/calculator/index.js; src/resources/packages/calculator/interaction.js |
| D016 | Estruturas complexas devem oferecer zoom/ampliação. | Resolvido por mudança transversal | src/resources/sdk/diagramViewport.js; packages de diagrama |
| D017 | Toda correção relevante exige validação humana focal posterior. | Investigado e mantido aberto por decisão humana | Roteiro público na seção “Validação humana posterior e limites” deste relatório |
| D018 | Fluxograma preserva tela inteira e geometria orientada pelo conteúdo. | Resolvido | src/resources/packages/flow/index.js; src/flowchart/*; diagramViewport.js |
| D019 | Fragilidades pedagógicas devem ser corrigidas upstream. | Resolvido por mudança transversal | src/domain/coursePedagogicalAudit.js; supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js; scripts/verifyV7AuthoringExperiments.mjs |
| D020 | Práticas compartilham o ciclo resposta→validação→feedback→avanço. | Resolvido por mudança transversal | src/study/CourseStudyApplication.js; src/resources/sdk/responseInteraction.js |
| D021 | Unidade e Explicação usam compatibilidade compartilhada. | Resolvido por mudança transversal | src/study/studyExplanation.js; src/render/renderPackageStudyUnit.js; src/resources/sdk/diagramViewport.js |
| D022 | Simplificar a LLM sem podar representações pedagógicas. | Resolvido por mudança transversal | courseHumanTasks.js; courseKnowledge.js; catálogo de components |
| D023 | Produção pedagógica deve ser focal, não lote cognitivo grande. | Resolvido por mudança transversal | courseFocalMaterialization.js rejeita mais de uma microssequência; courseHumanTasks.js aplica a conclusão ao agrupamento operacional; course-focal-materialization.test.js |
| D024 | Auditoria pós-materialização é segunda barreira semântica. | Resolvido por mudança transversal | src/domain/courseContentInspection.js; src/domain/coursePedagogicalAudit.js; renderCourseContentInspection.js |
| D025 | Choice e gap devem ser escolhidos pela evidência, não conveniência. | Resolvido por mudança transversal | src/resources/packages/choice-response/index.js; gap-response/index.js; coursePedagogicalAudit.js |
| D026 | Ordenação usa lista vertical e controles subir/descer. | Resolvido | src/resources/packages/ordering-response/index.js; public/styles.css |
| D027 | response.open deve ser removido completamente. | Resolvido por mudança transversal | src/resources/catalog/resourceCatalog.js; packageRegistry.js; src/persistence/courseContentUpgradeV7.js; migrations de remoção |
| D028 | Remoção decidida não pode virar legado permanente. | Resolvido por mudança transversal | resourceCatalog.js; packageRegistry.js; scripts/validateCourseRuntime.mjs; docs/schema-change-log.md |
| D029 | Estruturas complexas não devem ser espremidas para caber. | Resolvido por mudança transversal | renderPackageStudyUnit.js; diagramViewport.js; public/styles.css |
| P001 | ACESSO-01 foi considerado localmente bom. | Resolvido | src/ui/AuthGate.js; fluxo de entrada |
| P002 | Feedback de Texto explicado deve aliviar leitura. | Resolvido por mudança transversal | Autoria e auditoria avaliam repetição, utilidade e extensão; coursePedagogicalAudit.js. Texto de curso existente não é truncado automaticamente |
| P003 | Título interno do feedback pode ser dispensável. | Resolvido por mudança transversal | Diretriz de auditoria para títulos dispensáveis e exemplo sem cabeçalho obrigatório; course-pedagogical-audit.test.js |
| P004 | Painel inicial de Configurações foi considerado adequado. | Resolvido | src/ui/VisitorSettings.js; public/main.js |
| P005 | Preferências de autoria e Conectar assistente usam ícones distintos. | Resolvido | src/ui/VisitorSettings.js; public/main.js |
| P006 | Estados online/offline observados são claros. | Resolvido | src/ui/renderHomeScreen.js renderRuntimeStatusControl |
| P007 | Fluxo principal do Editar é quase claro, com exceção administrativa. | Resolvido | src/ui/CourseAuthoringSurface.js; manualStudyUnitEdit.js |
| P008 | Títulos do estudo devem ser simples e sem prefixos redundantes. | Resolvido por mudança transversal | labels em packages; renderPackageStudyUnit.js; courseKnowledge.js |
| P009 | Microteoria deve abrir pela função que cumpre. | Resolvido por mudança transversal | src/resources/packages/paragraph/index.js; conteúdo do catálogo |
| P010 | Capitalização do corpo deve ser normal. | Resolvido por mudança transversal | renderers e labels de packages; docs/componentes-didaticos.md |
| P011 | Overlays equivalentes devem ter títulos padronizados. | Resolvido por mudança transversal | src/study/studyExplanation.js; src/ui/study support renderers |
| P012 | Gap não deve rotular opções nem criar espaçamento excessivo. | Resolvido por mudança transversal | gap-response/index.js; public/styles.css .token-options/.token-option |
| P013 | Legenda da glosa deve se distinguir do corpo. | Resolvido | interlinear-gloss/index.js; public/styles.css |
| P014 | Âncora/trecho fica subordinado à obra. | Resolvido por mudança transversal | renderBibliographicReference.js; public/study-references.css |
| P015 | Overlay usa Referências simples e não estado vazio verboso. | Resolvido por mudança transversal | src/study/studyExplanation.js; studyCitations.js |
| P016 | Retorno de escolha errada de M04 deve ser preservado. | Resolvido | choice-response/index.js; CourseStudyApplication.js |
| P017 | Exemplos estruturados usam blocos próprios quando isso ajuda. | Resolvido | paragraph/index.js; table/index.js |
| P018 | Tabela-verdade reutiliza Tabela quando a semântica permite. | Resolvido | truth-table/index.js; table/index.js; masking em gap-response |
| P019 | Diagrama de relação M16 é preservado se comunica corretamente. | Resolvido | relation-map/index.js |
| P020 | Estado humano mostrado de conjuntos é preservado. | Resolvido | set-diagram/index.js |
| P021 | Componentes recentes precisam de mais hierarquia e polimento. | Resolvido por mudança transversal | public/styles.css; study-references.css; packages especializados |
| P022 | Código mostra discretamente sua linguagem. | Resolvido | src/resources/packages/code/index.js; styles |
| P023 | Call stack deve ensinar sua gramática visual. | Resolvido | src/resources/packages/call-stack/index.js; public/styles.css |
| P024 | Terminal permanece especializado e introduz sua convenção progressivamente. | Resolvido | src/resources/packages/terminal-session/index.js |
| P025 | Memory layout enfatiza posição, intervalo e direção. | Resolvido | src/resources/packages/memory-layout/index.js; diagramViewport.js |
| P026 | Captions ajudam a ler, sem virar nome técnico do package. | Resolvido por mudança transversal | captions dos packages de diagrama; public/styles.css |
| P027 | Tabela de transição mantém especialização estado×evento. | Resolvido | state-transition-table package; catálogo |
| I001 | Validação, feedback e avanço usam ciclo compartilhado. | Resolvido por mudança transversal | CourseStudyApplication.validateResponse/stepStudyUnit; responseInteraction.js |
| I002 | Gap usa renderer compartilhado para alternativas e retorno. | Resolvido por mudança transversal | src/resources/packages/gap-response/index.js |
| I003 | Zoom/pan/tela inteira são apoios legítimos e reais. | Resolvido por mudança transversal | src/resources/sdk/diagramViewport.js; packages de diagrama |
| I004 | Mecânica de âncora web/PDF já existe. | Resolvido por mudança transversal | src/study/sourceDocumentUrl.js; studyCitations.js; renderBibliographicReference.js |
| I005 | Autoria já possui planejamento e evidência pedagógica. | Resolvido por mudança transversal | src/domain/*; materializadores Supabase; courseKnowledge.js |
| I006 | Unidade e Explicação reutilizam renderer de componentes. | Resolvido por mudança transversal | src/study/studyExplanation.js; src/render/renderPackageStudyUnit.js |
| I007 | Parte e microssequência são conceitos distintos. | Resolvido por mudança transversal | src/domain/courseAuthoringParts.js; courseHumanMaterialization.js; docs/parametros-de-autoria.md |
| I008 | Choice/gap/ordering têm capacidade além dos exemplos mínimos. | Resolvido por mudança transversal | choice-response/index.js; gap-response/index.js; ordering-response/index.js |
| I009 | Fixtures anteriores eram inclinadas a choice single. | Resolvido por mudança transversal | tests/fixtures; tests/runtime; tests/e2e |
| I010 | Inspeção IA registra julgamento, não certificação. | Resolvido por mudança transversal | src/domain/courseContentInspection.js; coursePedagogicalAudit.js |
| H001 | Controles administrativos do Editar podem estar mal posicionados. | Investigado e mantido aberto por decisão humana | src/ui/CourseAuthoringSurface.js; src/ui/manualStudyUnitEdit.js |
| H002 | Barra fixa pode sobrepor cartões em rolagem natural. | Resolvido por mudança transversal | public/styles.css; src/study/CourseStudyScreen.js |
| H003 | Aviso de completar lacunas pode não persistir após recarregar. | Investigado: comportamento transitório esperado | gap-response/index.js; persistence de estudo |
| H004 | Lacuna vazia pode ter descoberta visual insuficiente. | Investigado: falha não reproduzida; validação humana pendente | gap-response/index.js; public/styles.css |
| H005 | Comparação de curso grande pode atingir limite de serviço. | Investigado: limites tratados; causa histórica não demonstrada | src/ui/CourseCopyDialog.js; migrations comparison; CourseAnalyticsPanel.js |
| H006 | Demonstração paga de IA pode não ter teto acumulado de US$1. | Registrado: restrição da coleta, sem requisito de produto inferido | Restrição de coleta preservada; não é requisito de controle de custos do produto. Nenhuma correção de orçamento inferida desta hipótese |
| H007 | Preferências podem trocar de estado rápido demais no carregamento. | Resolvido por mudança transversal | src/ui/AuthoringProcessPreferencesSettings.js; src/ui/VisitorSettings.js |
| H008 | Rótulos de tabelas podem parecer colados à contagem. | Resolvido | src/ui/CourseAnalyticsPanel.js; public/styles.css |
| H009 | Rótulo de fluxo M21 pode ser cortado pela pintura. | Resolvido | Confirmada oclusão de 36,7%; bpmn-process/index.js usa xlabel nos fluxos; revisao-v7-bpmn-labels.spec.js, quatro provas de interação |
| H010 | Carga MCP/Actions pode induzir soluções pedagógicas mínimas. | Investigado: mudança transversal validada; causalidade não demonstrada | courseHumanTasks.js; courseKnowledge.js; docs/autoria-*; experimentos |
| H011 | Exemplos mínimos podem favorecer choice single. | Investigado: mudança transversal validada; causalidade não demonstrada | tests/fixtures; catálogo de exemplos; experiments |
| H012 | Partes/lotes maiores podem degradar qualidade pedagógica. | Investigado: mudança transversal validada; causalidade não demonstrada | courseAuthoringParts.js; courseHumanMaterialization.js; experiments |
| O001 | Feedback de ACESSO-01/M01-R1 é excessivamente longo. | Resolvido por mudança transversal | Correção upstream de autoria/auditoria e feedback específico; coursePedagogicalAudit.js. Sem corte automático de conteúdo persistido |
| O002 | Ícone duplicado em Preferências de autoria e Conectar assistente. | Resolvido | src/ui/VisitorSettings.js; public/main.js |
| O003 | Contorno de foco/seleção aparece cortado em superfícies antigas. | Resolvido por mudança transversal | public/styles.css; public/authoring-settings.css; focus-visible |
| O004 | Controles administrativos do Editar não eram compreensíveis. | Investigado e mantido aberto por decisão humana | CourseAuthoringSurface.js; manualStudyUnitEdit.js |
| O005 | Conta e Aparência ainda não foram julgadas diretamente. | Investigado e mantido aberto por decisão humana | VisitorSettings.js; StudyDeviceSettings.js; public/main.js |
| O006 | M01 tem desalinhamento pedagógico. | Mecanismo transversal validado; conteúdo hospedado pendente | Barreira upstream em coursePedagogicalAudit.js e courseHumanMaterialization.js; a reautoria do conteúdo hospedado não foi aplicada nesta entrega local |
| O007 | Mensagens de bastidor aparecem no conteúdo. | Resolvido por mudança transversal | packageRegistry.js accessibleText; renderState.js; audio/index.js |
| O008 | Explicação mistura fontes próprias e fontes de unidade. | Resolvido por mudança transversal | src/study/studyExplanation.js; studyCitations.js |
| O009 | Dicionário/Gramática sobrepõem Explicação. | Resolvido por mudança transversal | resourceCatalog.js; docs; migrations históricas; remoção de packages |
| O010 | Leitura complementar duplica encaminhamento externo. | Resolvido por mudança transversal | resourceCatalog.js; docs; migration component removal |
| O011 | Títulos de overlays equivalentes eram inconsistentes. | Resolvido por mudança transversal | studyExplanation.js; renderers de overlays |
| O012 | Citações multilíngues ficam densas quando concatenadas. | Resolvido por mudança transversal | annotated-text/index.js; interlinear-gloss/index.js; paragraph/richText.js |
| O013 | Gap tem rótulo redundante e espaçamento excessivo em quebra. | Resolvido por mudança transversal | gap-response/index.js; public/styles.css .token-options |
| O014 | Legenda da glosa é pouco diferenciada. | Resolvido | interlinear-gloss/index.js; public/styles.css |
| O015 | Player de áudio expunha metadados técnicos e hierarquia ruim. | Resolvido | audio/index.js; audio/interaction.js; CourseAudioPanel.js |
| O016 | Autoria ainda não demonstra barrar áudio inviável upstream. | Resolvido por mudança transversal | migration 20260924182348_revisao_v7_audio_readiness.sql; courseMedia.js; courseHumanMaterialization.js |
| O017 | Trecho/âncora tinha peso maior que a referência. | Resolvido por mudança transversal | renderBibliographicReference.js; study-references.css |
| O018 | Tabela larga perde referência durante rolagem. | Resolvido por mudança transversal | public/styles.css .runtime-table-wrap; table/index.js |
| O019 | accessibleText aparece literalmente no estudo. | Resolvido por mudança transversal | packageRegistry.js; paragraph/richText.js; conteúdo de M09 |
| O020 | Legenda do plano cartesiano é visualmente carregada. | Resolvido | src/resources/packages/plane/index.js; styles |
| O021 | Comentário aberto pode cobrir barra inferior/Explicação. | Resolvido por mudança transversal | public/styles.css .study-continue-popup-shell; tests/e2e/revisao-v7-study-surface.spec.js em 320/390/1280 px |
| O022 | Feedback genérico substitui comentário sobre a resposta. | Resolvido por mudança transversal | coursePedagogicalAudit.js; buildResourceCatalogCourse.mjs; materializadores |
| O023 | Objetivo/comando e evidência prática estão desalinhados. | Resolvido por mudança transversal | coursePedagogicalAudit.js associa objetivo/requisito/operação/resposta; courseHumanMaterialization.js; gerações e correção B-2 |
| O024 | M09/M10 exigem pressupostos não desenvolvidos. | Mecanismo transversal validado; conteúdo hospedado pendente | Base focal da auditoria inclui Explicação, requisitos e prática; docs/modelo-didatico.md. A reautoria desses conteúdos hospedados não foi aplicada nesta entrega local |
| O025 | M13 reconhece princípio em vez de estimar→calcular→verificar. | Resolvido | calculator package; coursePedagogicalAudit.js; materialization |
| O026 | Calculadora anterior não era convencional. | Resolvido | calculator/index.js; calculator/interaction.js |
| O027 | M14 bloqueava antes do overview por mascaramento incompatível. | Resolvido | gap-response.js; truth-table/index.js; CourseStudyScreen.js; packageRegistry.js |
| O028 | Âncoras de M16/M17 divergem de afirmações locais. | Mecanismo transversal validado; conteúdo hospedado pendente | Base de auditoria com fontes associadas; course-ai-inspection-pglite.test.js; destinos corretos localizados. Cursos hospedados ainda exigem reancoragem explícita |
| O029 | Componentes recentes têm hierarquia visual pouco polida. | Resolvido por mudança transversal | public/styles.css; packages especializados |
| O030 | Zoom de M18 corta conteúdo no enquadramento. | Resolvido por mudança transversal | diagramViewport.js; package do caso |
| O031 | Citação de M09 não era ocorrência localizável no contrato. | Resolvido por mudança transversal | studyCitations.js; courseInspectionCitations.js; paragraph/richText.js |
| O032 | Fluxograma corta no cartão e zoom precisa mudar visivelmente. | Resolvido por mudança transversal | flow/index.js; flowchart; diagramViewport.js |
| O033 | Errata: veredito tardio M19/M20 foi substituído. | Resolvido por mudança transversal | CourseStudyApplication.js; D020/I001 |
| O034 | BPMN omitia rótulos de eventos/gateway na figura. | Resolvido | bpmn-process/index.js; graphviz.js |
| O035 | Ainda há ações textuais contra icon-only. | Resolvido por mudança transversal | VisitorSettings.js; CoursePartsPanel.js; CourseAuthoringSurface.js; AssistantConnectionSettings.js |
| O036 | Ações destrutivas não têm sinalização/agrupamento uniforme. | Resolvido por mudança transversal | renderHomeScreen.js; VisitorSettings.js; public/styles.css |
| O037 | Controle de status também faz flush/sincronização. | Resolvido por mudança transversal | renderHomeScreen.js; CourseAuthoringSurface.js; CourseStudyApplication.js |
| O038 | Configurações tinha vão fixo excessivo e escondia ação. | Resolvido por mudança transversal | public/styles.css; authoring-settings.css; StudyDeviceSettings.js |
| O039 | Ícones Home/Planejamento/Preferências têm escopo/efeito pouco distinguível. | Resolvido por mudança transversal | renderHomeScreen.js; CourseCurriculumMap.js; AuthoringProcessPreferencesSettings.js |
| O040 | Seleção de fontes repete texto e desperdiça espaço. | Resolvido por mudança transversal | CourseSourcesPanel.js; sourceOccurrenceForm.js |
| O041 | Contagem de fontes usa 10+ sem total. | Resolvido por mudança transversal | CourseSourcesPanel.js:880; pagination nextCursor |
| O042 | Revisão de observação apagava retorno e reabria item. | Resolvido por mudança transversal | CourseAnnotationRepository.js; migration 20260924171236_revisao_v7_observation_preservation.sql |
| O043 | Responder/revisar mudava workflow implicitamente. | Resolvido por mudança transversal | courseAnchoredAnnotations.js; CourseAnnotationRepository.js |
| O044 | Fila em lote mostra ações sem selecionáveis. | Resolvido | src/ui/renderCourseAuthoringObservationQueue.js:101-104; courseAuthoringObservationQueue.js |
| O045 | Áudio pequeno aparecia como 0.0 MiB. | Resolvido | src/ui/CourseAudioPanel.js:sizeLabel |
| O046 | Remoção de áudio não tinha Cancelar explícito e retorno genérico. | Resolvido | src/ui/CourseAudioPanel.js:sheetActions/feedback |
| O047 | Exportação JSON não confirmava sucesso. | Resolvido | src/ui/CourseAnalyticsPanel.js:665-675 |
| O048 | Filtro sem resultados escondia coleção e contexto. | Resolvido | src/ui/CourseObservationsPanel.js:510-512 |
| O049 | Explicação cortava componentes; M23 é ocorrência transversal. | Resolvido por mudança transversal | studyExplanation.js; renderPackageStudyUnit.js; diagramViewport.js |
| O050 | M28 cortava nomes mesmo ampliado. | Resolvido por mudança transversal | src/resources/packages/entity-relationship/index.js; src/resources/sdk/graphviz.js; medição anterior ao layout nos dois hosts |
| O051 | M29 cortava título e FK internamente na Explicação. | Resolvido por mudança transversal | system-diagrams/shared.js; entity-relationship/index.js; database-schema/index.js |
| O052 | M32 truncava rótulo após escolha. | Resolvido por mudança transversal | system-internal-block/index.js; renderers compartilhados |
| O053 | Set diagram omitia marcador quando faltava clearance. | Resolvido | src/resources/packages/set-diagram/index.js; revisao-v7-sets.test.js e revisao-v7-ordering-sets.spec.js |
| O054 | OpenAPI concentra geração/vinculação sensível e efêmera. | Resolvido | Aviso de segredo efêmero, fechamento e substituição do par antes da ação em AssistantConnectionSettings.js; testes revisao-v7-settings. A posição/superfície permanece Q016 |
| O055 | Loading do Planejamento tinha retorno visual fraco. | Resolvido por mudança transversal | src/ui/CourseDesignPanel.js; courseAuthoringRoute.js |
| O056 | Estados vazios de autoria eram silenciosos ou só ícone. | Resolvido por mudança transversal | CourseAudioPanel.js; CourseAuthoringSurface.js bibliography; Q015 |
| O057 | Compositor de observação permite envio com texto vazio. | Resolvido por mudança transversal | renderStudyUnitObservationSheet.js e seus consumidores compartilham validade de envio; revisao-v7-panels.spec.js |
| O058 | M22 não verificou trecho formal no destino externo. | Mecanismo transversal validado; conteúdo hospedado pendente | Passagem localizada no PDF da aula, página 8; auditoria associa URL/âncora/ocorrência e exige demonstração. URL do curso hospedado preservada até atualização dos dados |
| O059 | Rótulos de transição ficam colados às setas. | Resolvido | src/resources/packages/state-machine/index.js; src/resources/sdk/graphviz.js |
| O060 | Código não expunha language declarada. | Resolvido | src/resources/packages/code/index.js; code renderer |
| O061 | Call stack não ensinava gramática ao leigo. | Resolvido | src/resources/packages/call-stack/index.js; styles |
| O062 | Terminal exibia metadados antes da convenção. | Resolvido | src/resources/packages/terminal-session/index.js |
| O063 | Memory layout imprimia vocabulário técnico incidental. | Resolvido | src/resources/packages/memory-layout/index.js |
| O064 | Operações de endereço/intervalo não tinham alvos de prática correspondentes. | Resolvido | src/resources/packages/memory-layout/index.js practiceTargets; coursePracticeAuthoring.js |
| O065 | Captions descreviam package/notação em vez da leitura. | Resolvido por mudança transversal | captions em software-system-context/entity-relationship/database-schema/system-internal-block |
| O066 | SysML interno é correto, mas pouco didático ao leigo. | Resolvido | system-internal-block/index.js; visual renderer |
| O067 | Ordenação usava geometria esquerda/direita incompatível. | Resolvido por mudança transversal | ordering-response/index.js; public/styles.css |
| O068 | response.open ainda aparece como legado em caminhos históricos. | Resolvido por mudança transversal | Remoção física dos packages/runtime; migration 20260924172159; courseContentUpgradeV7.js; revisao-v7-component-migration.test.js e revisao-v7-cache-upgrade.test.js |
| O069 | Preferência de granularidade pode ser reinterpretada pelo agente. | Resolvido por mudança transversal | courseHumanTasks.js materializar_parte; courseHumanMaterialization.js; courseAuthoringParts.js |
| Q001 | Questão v5 sobre ciclo comum foi fechada e virou D020/I001/I002. | Resolvido por mudança transversal | CourseStudyApplication.js; gap-response.js; spec §11 |
| Q002 | Ainda falta revisar Conta e Aparência com o proprietário. | Investigado e mantido aberto por decisão humana | VisitorSettings.js; StudyDeviceSettings.js; public/main.js |
| Q003 | Solução final de tabela larga mobile continua aberta. | Resolvido por mudança transversal | table/index.js; public/styles.css .runtime-table-wrap; diagramViewport.js |
| Q004 | Autoria/validação de áudio ainda precisa reconciliar D005. | Resolvido por mudança transversal | audio readiness migration; courseMedia.js; docs/autoria-mcp.md |
| Q005 | Conteúdo enriquecido, TeX/LaTeX, ruby e IPA ainda precisam decisão técnica/humana. | Resolvido por mudança transversal | paragraph/richText.js; mathExpression.js; interlinear-gloss.js |
| Q006 | Relação/herança entre fontes de Explicação e Unidade não foi escolhida. | Investigado e mantido aberto por decisão humana | studyExplanation.js; CourseSourcesPanel.js; studyCitations.js |
| Q007 | Experiência visual de âncoras/fontes precisa validação final. | Resolvido por mudança transversal | renderBibliographicReference.js; sourceDocumentUrl.js; CourseSourcesPanel.js |
| Q008 | Forma visual final da glosa ainda é escolha técnica/design. | Resolvido por mudança transversal | interlinear-gloss/index.js; public/styles.css |
| Q009 | Tratamento inline de palavras/expressões citadas continua aberto. | Investigado e mantido aberto por decisão humana | paragraph/richText.js; annotated-text/index.js |
| Q010 | Segmentação de línguas sem espaços ainda precisa contrato e decisão. | Resolvido por mudança transversal | paragraph/richText.js; interlinear-gloss/index.js |
| Q011 | Falta explicar e reforçar por que a arquitetura permitiu práticas fracas. | Resolvido por mudança transversal | coursePedagogicalAudit.js; materialization; contract/experiments |
| Q012 | Zoom como alternativa de tabela larga depende de Q003. | Resolvido por mudança transversal | diagramViewport.js; public/styles.css; table/index.js |
| Q013 | Legenda do grafo matemático M15 precisa separar repertório de defeito. | Resolvido | src/resources/packages/graph/index.js decodifica V/E e contagens; revisao-v7-legends.spec.js em 320/390/1280 px |
| Q014 | Falta localizar estados/dados que perdem marcador de conjuntos. | Resolvido por mudança transversal | set-diagram/index.js e casos estreitos em revisao-v7-sets.test.js; fallback visual em revisao-v7-ordering-sets.spec.js |
| Q015 | Estados vazios fora da Explicação devem distinguir ausência e carregamento. | Resolvido por mudança transversal | Texto visível na biblioteca de áudio e bibliografia de autoria; preservado o silêncio específico da Explicação; revisao-v7-panels.spec.js |
| Q016 | Superfície/confirmação de credenciais OpenAPI continua escolha. | Investigado e mantido aberto por decisão humana | AssistantConnectionSettings.js; public/main.js |
| Q017 | Terminologia/momento de acesso público a documentos requer arquivo real. | Investigado e mantido aberto por decisão humana | CourseSourcesPanel.js; source permissions |
| Q018 | Vocabulário de implementação em M36–M38 foi fechado. | Resolvido por mudança transversal | packages de M36–M38; D014/P026/O065; remoção response.open |
| Q019 | Comparação de recortes orienta o destino estrutural de partes. | Resolvido por mudança transversal | Uma microssequência por chamada; parte derivada como agrupamento técnico; comparação e limites em experimentos/revisao-v7/README.md |
| Q020 | Capacidade de múltiplas lacunas exige ensaio e coerência global. | Resolvido por mudança transversal | gap-response/index.js; ensaios 2/4/6 e controle de 12 em experimentos/revisao-v7/gap-Q020 e gap-Q020-replica; auditoria semântica |
