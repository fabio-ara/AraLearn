# Autoria por Actions

[Actions](https://developers.openai.com/api/docs/actions/introduction) é um recurso
do [ChatGPT](https://chatgpt.com), uma aplicação externa ao AraLearn. Ele permite
a um assistente personalizado nesse serviço consultar dados e executar tarefas
por uma interface de programação, ou API. A **OpenAPI** descreve, em um formato
padronizado, os pedidos e as respostas dessa interface. O arquivo de descrição
do AraLearn oferece as mesmas tarefas do [catálogo MCP](autoria-mcp.md#tarefas-disponíveis),
com o mesmo conteúdo salvo e as mesmas regras de autorização.

A pessoa autora orienta a produção e inspeciona os objetos e suas fontes no
aplicativo. O assistente executa as tarefas autorizadas; a declaração de revisão
humana permanece expressa e vinculada ao conteúdo inspecionado. O
[guia de autoria por conversa](criar-cursos-pelo-chat.md) apresenta esse percurso.

O arquivo importável está em
[`downloads/aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml).
Para configurar a conexão pela interface, siga o [manual ilustrado do ChatGPT](chatgpt.md#actions-em-um-gpt-personalizado),
que reúne a importação do arquivo, a autorização da conta e o teste de leitura.

## Operações

As [tabelas de leituras e escritas do catálogo](autoria-mcp.md#tarefas-disponíveis)
definem as **56 tarefas de autoria** do catálogo **11.1.0**. O OpenAPI as
oferece por **30 operações HTTP**: 24 diretas e seis grupos contextuais.
Uma operação HTTP é o pedido enviado a um endereço do serviço; um grupo permite
escolher entre várias tarefas por esse mesmo endereço. Argumentos, validação
e efeitos derivam do catálogo comum ao MCP.

| Operação agrupada | Tarefas disponíveis |
| --- | --- |
| `acesso_do_curso` | `consultar_acesso`, `definir_visibilidade`, `alterar_acesso`, `definir_acesso_arquivos`, `definir_politica_revisao` |
| `estrutura_curricular` | `alterar_curso`, `excluir_curso`, `salvar_ramo_curricular`, `mover_ramo_curricular`, `duplicar_ramo_curricular`, `remover_ramo_curricular`, `reordenar_unidades` |
| `desenho_instrucional` | `consultar_repertorio_instrucional`, `manter_unidade_analise`, `manter_requisito_evidencia`, `vincular_repertorio_instrucional`, `registrar_aplicacoes_instrucionais`, `aplicar_configuracao_instrucional`, `ajustar_orientacao`, `ajustar_componentes` |
| `preferencias_de_autoria` | `consultar_preferencias_autoria`, `salvar_preferencias_autoria` |
| `perfis_de_autoria` | `consultar_perfis`, `salvar_perfil`, `excluir_perfil`, `prever_aplicacao_perfil`, `aplicar_perfil` |
| `observacoes_autorais` | `consultar_observacoes`, `registrar_observacao`, `editar_observacao`, `registrar_inspecao`, `decidir_observacao` |

Cada grupo recebe `tarefa` e `argumentos`. O schema, que define os dados
aceitos, usa `oneOf` para permitir uma das alternativas e vincular cada nome
a seus argumentos específicos, com os mesmos campos obrigatórios e limites da
tarefa. Por exemplo, uma chamada a `acesso_do_curso` pode receber:

```json
{
  "tarefa": "consultar_acesso",
  "argumentos": { "curso": "Redes para iniciantes" }
}
```

As outras 24 tarefas mantêm seu próprio nome como operação e recebem os
argumentos diretamente. Isso inclui `incorporar_pdf_como_fonte` e
`guardar_audio`, cujo `openaiFileIdRefs` permanece na raiz do pedido. Nas
seções seguintes, os nomes designam tarefas; o agrupamento determina a
forma de transportá-las.

Cada descrição situa a finalidade da operação. Salvar o mapa curricular
altera o planejamento; definir uma parte organiza sua produção. Consultar
observações recupera os apontamentos; preparar uma revisão reúne também o
conteúdo que será examinado. Da mesma forma, manter os dados bibliográficos
de uma fonte e incorporar seu documento são operações distintas.

## Referências humanas

As tarefas localizam cursos por título e objetos por título, posição ou
referência recebida numa leitura anterior. Uma referência é **opaca** quando o
cliente deve devolvê-la exatamente como a recebeu, sem interpretar seu conteúdo.
Ela identifica uma versão ou tentativa; o servidor confere novamente os direitos
da pessoa antes de agir. Títulos ambíguos exigem uma indicação mais precisa.

Os [fluxos comuns](fluxos-prompts-e-contratos.md) explicam como a intenção da
pessoa se relaciona com a tarefa escolhida. A
[estrutura por referência](estrutura-curricular-por-referencia.md) detalha
movimentação, cópia e remoção de ramos sem perda de suas relações.

## Planejamento e produção

O planejamento define a organização curricular. Nesse percurso, uma
**microssequência** reúne unidades que desenvolvem um objetivo delimitado.
A **explicação** desenvolve o assunto e suas fontes, oferecendo uma base
consultável pelas unidades. O [modelo didático](modelo-didatico.md) relaciona
essas funções. A explicação pode ser produzida antes das unidades, mesmo com
o mapa em rascunho. `salvar_explicacoes` conserva as unidades existentes; na
produção delas, `materializar_parte` reutiliza as bases salvas e recebe somente
aquelas que também serão criadas ou alteradas.

Para mapas extensos ainda sem módulos, `salvar_mapa_curricular` aceita público,
pré-requisitos, escopo completo e `modulos: []`. A construção continua com
`salvar_ramo_curricular`, no grupo `estrutura_curricular`, preservando o texto
de cada ramo. O [fluxo de construção do mapa](fluxos-prompts-e-contratos.md#mapa-curricular-e-bases-explicativas)
explica a sequência e a proteção do planejamento já salvo.

Aprovação do mapa, autorização para produzir e revisão do conteúdo correspondem
a decisões diferentes da pessoa. O [percurso comum](fluxos-prompts-e-contratos.md#mapa-curricular-e-bases-explicativas)
relaciona essas etapas, e a [referência de processo](fluxos-prompts-e-contratos.md#conservar-o-acordo-durante-a-retomada)
conserva o acordo de trabalho durante a retomada.

Na conversa com o GPT conectado, a pessoa pode discutir uma explicação já
salva. O assistente consulta o objeto pelas operações de Actions, apresenta a
proposta e aplica a alteração autorizada. Depois da gravação, o conteúdo pode
ser inspecionado no aplicativo e retomado na mesma conversa.

## Materialização e parâmetros

Antes de salvar unidades, é preciso relacionar o conteúdo da explicação ao
que o percurso deverá ensinar e praticar. A **reconciliação** identifica a
função de cada componente ou passagem da explicação nesse desenvolvimento.
O **repertório** registra os conhecimentos acompanhados, enquanto os
requisitos de evidência descrevem as operações que as atividades deverão
solicitar. O [fluxo de produção](fluxos-prompts-e-contratos.md#produção-incremental-por-partes)
desenvolve essas relações.

A gravação coordenada das unidades e de seus registros de autoria é chamada
de **materialização**. `preparar_materializacao` oferece uma consulta antecipada
opcional: recebe em `unidades` as mesmas propostas usadas na escrita e verifica
sua relação com a base reconciliada, o repertório e os requisitos. Também
confere as escolhas de apresentação, as fontes, a prática e a cobertura
prevista. Sem `referenciaPreparo`, a materialização executa essa verificação
internamente antes de gravar e devolve os bloqueios para correção. Uma
referência explícita precisa continuar válida para a base e a intenção atuais.

A reconciliação declara a função do componente inteiro, sem indicar trecho,
ou de uma passagem literal. O servidor deriva os campos de texto pertinentes,
chamados de **folhas textuais**, e `alvo` distingue partes repetidas. A
explicação permanece a base consultável; as unidades desenvolvem o ensino,
os exemplos e as práticas previstas. Quando falta o ensino de um conhecimento
nesse percurso, o preparo indica o passo necessário para completar a produção.

Uma **parte** agrupa microssequências para coordenar a produção, preservando
a hierarquia curricular. `materializar_parte` recebe o foco de uma única
microssequência e resolve a parte no servidor. Identificadores de instâncias,
versões correntes e posições finais podem ser omitidos e são derivados pela
operação. `unidade` identifica uma unidade existente a substituir; unidades
omitidas permanecem. `concluir: false` conserva a produção parcial.

Práticas novas exigem resposta avaliável pelo aplicativo e retorno explicativo
utilizável sem conexão, também chamado de **feedback**. Uma escolha automática
exige um valor contextual e sua justificativa antes da produção. Valores
fixados e condições de pesquisa prevalecem. A **configuração aplicada** registra
as escolhas daquela produção e permanece distinta da intenção para trabalhos
futuros. Os [campos de configuração](aralearn-contract.md#campos-de-configuração-nos-canais)
detalham os valores e os alcances admitidos.

## Perfis reutilizáveis

Perfis guardam escolhas para aplicação em cursos. A prévia mostra alcance e
exceções; a aplicação copia o que foi confirmado. Editar ou excluir o perfil
depois conserva os cursos que receberam uma cópia. As
[preferências de autoria](parametros-de-autoria.md) explicam perfil, padrão
pessoal e acordo de um trabalho em andamento.

## Observações, revisão e acesso

Uma observação pode reunir vários alvos, cada um com sua base e seu estado.
Salvar uma correção torna o conteúdo novo vigente. A observação permanece
pendente até `decidir_observacao` registrar a decisão humana sobre os alvos
apresentados: aceitar o resultado ou encerrar a questão sem alteração. Uma
decisão parcial conserva os demais alvos.

`registrar_inspecao` guarda o parecer da IA sobre a base lida. Já a declaração
humana de revisão registra a inspeção expressa da pessoa sobre a explicação
ou unidade salva. O [fluxo de revisão](fluxos-prompts-e-contratos.md#observações-revisão-e-privacidade)
e as [regras de acesso](aralearn-contract.md#revisão-do-conteúdo) distinguem
essas operações de tornar um curso acessível e disponibilizar seus arquivos.

A fila fornece `referenciasComparacao` por alvo. Envie a referência inteira em
`preparar_revisao.comparacao` e recupere suas continuações para examinar o
conteúdo e as fontes anteriores e vigentes. A lista compacta conserva versões
e **hashes**, impressões digitais calculadas dos dados. A comparação recupera
o conteúdo literal que corresponde a essas referências.

O núcleo compartilhado com MCP informa quando uma correção invalida a aplicação
instrucional. Nesse caso, releia o conteúdo, verifique e reaplique as escolhas
com `aplicar_configuracao_instrucional` e faça nova inspeção, preservando as
condições fixadas. Parecer `consistent` exige aplicação instrucional nas
unidades pertinentes da base focal; `needs_attention` permite registrar essa
insuficiência enquanto ela existir.

`registrar_inspecao` recebe a referência da base focal e exige seis dimensões
em novos pareceres: `alignment`, `evidence`, `representation`, `feedback`,
`sufficiency` e `configuration`. Cada uma recebe justificativa e trechos da
base no campo `evidence`, conforme os [critérios comuns](fluxos-prompts-e-contratos.md#auditoria-pedagógica-focal).
O servidor confere versão e `basisHash` e identifica a necessidade de nova
inspeção quando a base muda.

O parecer registra o julgamento do assistente sobre esse recorte. A leitura
crítica avalia sua justificativa em relação ao material; resultados de
aprendizagem exigem investigação com estudantes, conforme o
[protocolo de avaliação](protocolo-avaliacao-artefato.md).

`configuration` confronta os parâmetros aplicados com conteúdo e percurso,
preservando preferências contextuais e fixações. Pareceres de formatos
anteriores continuam legíveis quando presentes. Cinco dimensões só permitem
recuperar a tentativa exata já salva; uma nova avaliação da base exige seis.
A [referência de compatibilidade](fluxos-prompts-e-contratos.md#auditoria-pedagógica-focal)
explica a preservação desses registros.

Para um pedido explícito de curso público, execute `definir_visibilidade` no grupo
`acesso_do_curso`, com `confirmado: true`, e confira o estado salvo usando
`consultar_acesso`. A publicação disponibiliza os arquivos por padrão e conserva
as restrições explícitas da fonte ou do arquivo. Uma escolha diferente pode
ser informada no próprio pedido de publicação. Se faltar um argumento
obrigatório, a resposta identifica o campo a completar.

## Resultado comum

As operações devolvem `result`, com o resultado, e podem incluir `deepLink`,
para inspeção no aplicativo, e `nextDecision`, quando uma escolha ainda falta.
A resposta estruturada conserva os dados necessários ao cliente; a conversa
pode apresentar o resultado e o caminho de inspeção sem reproduzir todos os
controles internos.

Cada entrada de `links` contém `relation`, `target`, `label`, `url` e, quando
disponível, `revision`; o primeiro endereço corresponde a `deepLink`. A relação
distingue o conteúdo dos espaços de observações, fontes, planejamento e
parâmetros. Use o endereço e a identidade recebidos para a intenção apresentada.

Uma continuação indica que há mais dados do mesmo recorte. O cliente recupera
as partes necessárias antes de considerar a leitura completa. O
[contrato de continuação](aralearn-contract.md#continuação-e-reconstrução-do-conteúdo)
explica como reconstruir o texto literal, inclusive na exportação.

Erros informam código, mensagem, diagnóstico limitado e `recovery`, com dados
para retomada. Se uma resposta se perder depois do envio, a mudança pode já
estar salva. A [recuperação da tentativa](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção)
usa o conteúdo e o recibo originais antes de decidir se há algo a repetir.

## OAuth

A conexão usa [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) com código de
autorização. A pessoa autoriza o cliente, que recebe um token de acesso, uma
credencial para chamar o serviço, sem receber a senha da conta. O servidor
verifica esse token e seu escopo — as operações permitidas — em cada chamada.
O arquivo OpenAPI descreve a integração; a autorização determina o acesso.

Uma operação de escrita recebe uma indicação para que o cliente peça
confirmação, chamada de marca consequencial. Uma operação direta de leitura
recebe `x-openai-isConsequential: false`. Um grupo que inclui qualquer escrita
é consequencial para todas as suas chamadas, inclusive quando a tarefa
selecionada é uma consulta. Os seis grupos correntes incluem escrita.
Em Actions, `x-openai-isConsequential: true` exige confirmação antes da execução.
A autorização para continuar um trabalho conserva essas confirmações próprias
do cliente, conforme a [referência de operações consequenciais](https://developers.openai.com/api/docs/actions/production#consequential-flag).

Depois de trocar o contrato, substitua integralmente o OpenAPI no editor e
salve o GPT. Importar o schema e renovar o login OAuth são etapas separadas.
Confira a importação na versão que será usada nas conversas.

## Arquivos da conversa

`incorporar_pdf_como_fonte` recebe um documento em formato PDF; `guardar_audio`
recebe WAV PCM, áudio não comprimido, ou MP3 já existente. Cada tarefa aceita
um arquivo de até 20 MiB, isto é, 20 × 1.048.576 bytes. O ChatGPT preenche
`openaiFileIdRefs` com o descritor temporário da conversa. O servidor confere
esse descritor e os dados binários, ou bytes, recebidos, incluindo origem,
prazo e rótulo de formato (MIME). Também bloqueia redirecionamentos e descarta
a URL transitória. A adaptação deriva do metadado da tarefa, com o mesmo
contrato de autoria do MCP.

O documento é guardado quando existe a intenção de mantê-lo como fonte; uma
leitura pontual conserva o arquivo fora do curso. Áudio pertence à biblioteca
do curso: a tarefa guarda um arquivo já existente para reutilização,
separadamente dos vínculos de fontes e dos serviços de síntese ou transcrição.
`consultar_audios` recupera referências lógicas para uma conversa posterior.
A [composição nos canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-de-autoria)
relaciona essas referências aos componentes usados no conteúdo.

Publicar, compartilhar ou materializar conteúdo novo com áudio exige faixa de
arquivo ativa, com tipo, tamanho e hash conferidos e acesso compatível. A voz
nativa serve ao ensaio de reprodução no dispositivo; para essas operações,
é necessário incorporar uma gravação. O servidor verifica essa condição
antes da escrita ou da entrega.

A documentação oficial permite até dez referências de arquivos recebidos,
com links válidos por cinco minutos; o AraLearn limita cada uma dessas tarefas
a um arquivo. Para arquivos devolvidos por uma Action, a documentação oficial
fixa 10 MB por arquivo. A entrada no AraLearn segue os 20 MiB definidos acima.
Veja [Arquivos em Actions](https://developers.openai.com/api/docs/actions/sending-files).

## Limites verificados e orçamentos locais

Fontes oficiais consultadas em 5 de outubro de 2026:

| Item | Regra publicada |
| --- | --- |
| descrição e resumo de cada operação | até 300 caracteres em cada campo |
| descrição de parâmetro | até 700 caracteres |
| pedido e resposta de cada chamada | cada corpo com menos de 100.000 caracteres |
| duração de ida e volta | até 45 segundos |
| transporte | conexão criptografada com TLS 1.2 ou superior, porta 443 e certificado público válido |

Essas regras vêm de [Produção em Actions](https://developers.openai.com/api/docs/actions/production).
O tamanho total aceito pelo editor de OpenAPI precisa ser verificado pela
importação do arquivo corrente: a página especifica os limites das chamadas
e dos campos, mas não estabelece um tamanho total para esse arquivo.

O contrato importável oferece 30 operações: 24 diretas e seis grupos com
argumentos definidos para cada tarefa. Essa organização conserva as 56 tarefas
do catálogo 11.1.0. A aceitação do arquivo pelo editor, a publicação do
assistente e a execução contra o serviço são verificações distintas.

O gerador confere o tamanho em unidades UTF-16, a contagem usada por
`String.length` em JavaScript. O arquivo compacto, incluindo a quebra de linha
final, precisa ter menos de 100.000 unidades; sua apresentação formatada
precisa ter menos de 210.000. Esses são os orçamentos locais definidos em
[buildChatGptActionOpenApi.mjs](../scripts/buildChatGptActionOpenApi.mjs).
Definições compartilhadas evitam repetir schemas, preservando as restrições
e os exemplos de cada tarefa. Os orçamentos controlam o tamanho do contrato;
a importação confere sua aceitação pelo cliente.

UTF-8 é a codificação usada para transmitir o texto em bytes; UTF-16 é usada
para representar o texto no JavaScript. Essas contagens podem ser diferentes.
O servidor aplica uma proteção conservadora de 99.999 unidades UTF-16 ao JSON
completo recebido ou convertido em texto, pois a fonte não define a unidade
Unicode de “caractere”. A decodificação exige UTF-8 válido. A proteção de
512 KiB limita a memória local, e o prazo interno é de 40 segundos; ambos são
escolhas do AraLearn.

O serviço informa o limite atingido. Uma leitura grande usa recorte ou
paginação. Se o tempo se esgotar depois de uma escrita, a gravação pode ter
terminado; o cliente relê o resultado antes da recuperação. Medidas e aceitação
do cliente seguem o [roteiro dos canais](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).

Leituras extensas de planejamento e revisão usam a continuação comum aos canais.
Para recuperar uma confirmação perdida de `salvar_mapa_curricular`, use
`consultar_planejamento` com `resumo: true`: situação, revisão e referência
vigente cabem numa resposta pequena. A aprovação exige a inspeção do mapa e a
decisão expressa da pessoa. Se a produção encontrar um mapa ainda em rascunho,
apresente a versão salva para aprovação ou use `autonomo: true` quando o pedido
já autorizar produzir sem essa revisão. Se faltar o mapa, complete primeiro
esse planejamento.

Cada página conserva uma parte literal do conteúdo e a referência necessária
para obter a seguinte. A reunião das páginas recupera o documento completo;
o assistente precisa concluí-la antes de avaliar ou alterar o recorte. O
[contrato de continuação](aralearn-contract.md#continuação-e-reconstrução-do-conteúdo)
descreve essa leitura, e a [prova local dos canais](prova-local-canais-autoria.md)
verifica a equivalência entre os documentos recuperados por MCP e Actions.

Quando uma gravação fica sem resposta, o diagnóstico acompanha o pedido desde
a elaboração dos argumentos até o salvamento, passando pelo transporte e pela
validação. Releia o recorte e o recibo da tentativa para conferir se a mudança
foi salva antes de recuperá-la. Para investigar um limite de tamanho, examine
o pedido efetivamente enviado; o documento exportado pode ter outra extensão.
O [roteiro de aceitação](roteiro-aceitacao-humana-autoria.md) orienta essa
conferência na versão conectada em uso.

## Gerar e validar o OpenAPI

```powershell
npm run actions:openapi
npm run actions:openapi:check
npm run test:authoring:actions
```

O gerador projeta o catálogo compartilhado com o
[mapeamento de transporte de Actions](../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js).
A validação confere se as 56 tarefas continuam representadas pelos seis grupos
e pelas 24 operações diretas. Também percorre os vínculos entre tarefas e
argumentos, seus limites e as regras transversais de autorização, confirmação
e resposta, inclusive nas formas direta, indireta e negativa de expressar uma
intenção. Referências de arquivos permanecem nas duas operações diretas de
recebimento de anexos.

## Importar no ChatGPT

1. Gere e confira o arquivo.
2. Abra a configuração de Actions do GPT.
3. Substitua integralmente o OpenAPI anterior pelo arquivo corrente.
4. Confira as 30 operações, incluindo os seis grupos que preservam as 56 tarefas, e salve a Action.
5. Crie uma conversa nova e conclua ou renove o OAuth quando necessário.
6. Comece retomando ou criando o curso.
7. Execute uma jornada completa antes de considerar o contrato publicado.

A reimportação é necessária quando o documento OpenAPI muda. Uma correção
interna que preserve esse contrato, como um ajuste no retorno de autenticação
OAuth, conserva o arquivo já importado. Quando o contrato mudar no
repositório, reimporte a versão completa no cliente.

## Referências técnicas

- [OpenAI: descrições e metadados das ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de apps e indicações para o cliente](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
