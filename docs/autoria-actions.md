# Autoria por Actions

[Actions](https://developers.openai.com/api/docs/actions/introduction) é o recurso
do [ChatGPT](https://chatgpt.com), uma aplicação externa ao AraLearn. Ele permite
a um assistente personalizado nesse serviço consultar dados e executar tarefas
por uma interface de programação, ou API. O arquivo OpenAPI descreve os
pedidos que esse cliente pode enviar. No AraLearn, ele oferece as mesmas tarefas
do [catálogo MCP](autoria-mcp.md#tarefas-disponíveis), com o mesmo conteúdo salvo
e as mesmas regras de autorização.

A pessoa autora orienta a produção e inspeciona os objetos e suas fontes no
aplicativo. O assistente executa as tarefas autorizadas; a declaração de revisão
humana permanece expressa e vinculada ao conteúdo inspecionado. O
[guia de autoria por conversa](criar-cursos-pelo-chat.md) apresenta esse percurso.

O contrato 4.0.0 permite desenvolver explicações e fontes antes das unidades
e retomar a produção conforme as preferências e os pontos de revisão escolhidos. As capacidades e seus efeitos
estão no [catálogo comum do MCP](autoria-mcp.md#tarefas-disponíveis).
`salvar_explicacoes` preserva as unidades existentes; `materializar_parte`
reutiliza as bases salvas e recebe somente aquelas que também serão alteradas.

O pedido **Debater com GPT** copiado da Autoria pode ser colado na conversa do
assistente externo já conectado por Actions. Ele fornece identidade, recorte e revisão, sem
chamar a API ao copiar. O assistente lê o estado corrente pelas Actions existentes e
discute a proposta antes de qualquer aplicação autorizada. A configuração de
Actions e a leitura efetiva continuam necessárias; copiar o pedido não comprova
que o cliente acessou o curso. A declaração humana de revisão pode ser
registrada na Autoria ou por `declarar_revisao`, com a referência do conteúdo
salvo e a escolha expressa da pessoa. Ela permanece separada da aprovação do
mapa, do mandato de produção e da avaliação feita pelo assistente.

O OpenAPI publicável está em
[`downloads/aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml).

## Operações

As [tabelas de leituras e escritas do catálogo](autoria-mcp.md#tarefas-disponíveis)
definem as **54 tarefas semânticas** de Actions. O OpenAPI as oferece por
**30 operações HTTP**: 24 diretas e seis grupos contextuais. Uma operação HTTP
é o pedido enviado a um endereço do serviço; um grupo permite escolher entre
várias tarefas por esse mesmo endereço. Argumentos, validação e efeitos derivam
do catálogo comum ao MCP.

| Operação agrupada | Tarefas disponíveis |
| --- | --- |
| `acesso_do_curso` | `consultar_acesso`, `definir_visibilidade`, `alterar_acesso`, `definir_acesso_arquivos`, `definir_politica_revisao` |
| `estrutura_curricular` | `alterar_curso`, `excluir_curso`, `salvar_ramo_curricular`, `mover_ramo_curricular`, `duplicar_ramo_curricular`, `remover_ramo_curricular`, `reordenar_unidades` |
| `desenho_instrucional` | `consultar_repertorio_instrucional`, `manter_unidade_analise`, `manter_requisito_evidencia`, `vincular_repertorio_instrucional`, `registrar_aplicacoes_instrucionais`, `aplicar_configuracao_instrucional`, `ajustar_orientacao`, `ajustar_componentes` |
| `preferencias_de_autoria` | `consultar_preferencias_autoria`, `salvar_preferencias_autoria` |
| `perfis_de_autoria` | `consultar_perfis`, `salvar_perfil`, `excluir_perfil`, `prever_aplicacao_perfil`, `aplicar_perfil` |
| `observacoes_autorais` | `consultar_observacoes`, `registrar_observacao`, `editar_observacao` |

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
seções seguintes, os nomes designam tarefas; o agrupamento só determina a
forma de transportá-las.

Cada descrição informa quando usar e quando não usar a operação. Isso permite ao
modelo distinguir, por exemplo, salvar o mapa curricular de definir um lote de
produção, consultar observações de preparar uma revisão e manter metadados de
uma fonte de incorporar seu PDF.

## Referências humanas

O modelo identifica objetos por título, posição ou referência humana já vista.
O servidor resolve internamente identidades, concorrência e repetição segura.
Esses controles não aparecem como perguntas rotineiras para a pessoa autora.

Exemplos:

- `salvar_mapa_curricular` recebe uma proposta completa como rascunho;
  `salvar_ramo_curricular` recebe somente o ramo e os campos que precisam mudar;
- `aprovar_mapa_curricular` recebe a referência da versão persistida inspecionada,
  sem reenviar ou regenerar a árvore;
- `mover_ramo_curricular`, `duplicar_ramo_curricular` e
  `remover_ramo_curricular` recebem o alvo e a intenção explícitos. Módulo e
  lição distinguem títulos repetidos; descendentes e dados úteis são tratados
  pela operação existente no curso;
- `salvar_parte` recebe título, intenção, progressão local e referências a
  microssequências que já pertencem ao mapa;
- `salvar_explicacoes` desenvolve bases e fontes antes das unidades;
- `materializar_parte` recebe as unidades que concretizam o lote autorizado,
  distingue ideias introduzidas de ideias estabelecidas usadas ou retomadas e
  distribui a cobertura obrigatória informada pela preparação focal;
- `reordenar_unidades` recebe a ordem completa do recorte e conserva identidades,
  texto, fontes e registros aplicados; omitir unidade não a remove;
- `ajustar_configuracao` fixa ou delega parâmetros no escopo;
  `ajustar_orientacao` e `ajustar_componentes` mantêm orientações e políticas
  contextuais para o trabalho futuro;
- `manter_fonte` recebe somente as mudanças ou retiradas realmente solicitadas.

`copiar_curso` prepara uma cópia de curso próprio ou com permissão explícita de
cópia. O servidor devolve uma confirmação opaca, valor que deve ser reutilizado
sem edição, vinculado à conta e à intenção;
a chamada confirmada reutiliza esse valor, inclusive após uma resposta perdida.
A cópia pertence à pessoa solicitante, começa privada com arquivos restritos e
mantém conteúdo, configuração, fontes, PDFs e áudios. Acessos, progresso e
anotações pessoais continuam na origem. Leitura pública não concede cópia.

`comparar_cursos` confronta dois recortes identificados por curso e, opcionalmente,
lote, microssequência ou unidade. `exportar_autoria` entrega o artefato literal e
sua leitura autoral. Ambas exigem acesso de autoria aos cursos selecionados.
A exportação usa JSON, formato que organiza conteúdo e metadados em campos.
Ela sempre entrega fragmentos, inclusive quando cabe em uma resposta;
a comparação usa fragmentos quando o resultado é grande. A continuação é opaca,
como nas demais leituras. Na exportação, o hífen inseparável U+2011 é representado
pelo escape JSON `\u2011`. Os trechos devem ser concatenados antes de `JSON.parse`,
que interpreta o JSON e recupera o conteúdo original. As posições usam UTF-16,
a representação de texto do JavaScript; elas e o hash de continuação
correspondem ao JSON com esse escape. A comparação não certifica equivalência pedagógica.

Para produzir conteúdo, `consultar_componentes` primeiro busca candidatos pela
função instrucional e depois lê o contrato exato apenas do componente escolhido.
O assistente não consulta o catálogo para variar a aparência.

Uma referência ambígua não é resolvida por acaso. A resposta orienta o assistente a
pedir um título ou posição mais específica.

## Planejamento e produção

O assistente retoma o estado real, lê preferências pessoais e condições do curso,
identifica o objeto corrente e consulta suas observações pendentes. Mapa
curricular, base explicativa, desenho e unidades podem ser trabalhados no
contexto. A explicação de uma microssequência existente pode ser produzida e
revisada enquanto o mapa ainda é rascunho e antes de existir unidade. No foco
Conteúdo, ela pode ser o resultado completo do mandato. Abrir a base salva
lê conteúdo existente, sem chamar um modelo de linguagem.

Quando houver decisão de aprovar o mapa, o assistente lê todas as páginas pertinentes
da versão persistida e usa sua `referenciaParaAprovar` em
`aprovar_mapa_curricular`. Síntese, página parcial ou árvore reconstruída não
substituem essa base. Alterações posteriores exigem nova inspeção da versão
que se pretende aprovar.

No Ciclo completo, partes agrupam a produção das unidades e respeitam as condições
da preparação vigente. Elas não são pais curriculares; seus limites podem
mudar sem alterar o mapa. O assistente apresenta a progressão breve, prepara e
materializa dentro do mandato e relê o conteúdo real. Continua conforme a
cadência e os pontos de revisão escolhidos, sem criar aprovação adicional por
causa da granularidade do lote. O [fluxo comum](autoria-mcp.md#fluxo-de-conversa)
detalha essas relações.

Divisão, reunião e reordenação reutilizam `salvar_parte`, com referências às
microssequências existentes e posição opcional do lote. O contrato focal admite
até 64 microssequências e conserva o texto da intenção e da progressão para
revisão antes de salvar. No AraLearn, **Reorganizar lotes** mostra a prévia desses
agrupamentos. A operação não recria as unidades nem modifica suas configurações
aplicadas; mudanças concorrentes e respostas incertas mantêm a disciplina de
revisão e recuperação do mesmo pedido.

Aprovar o mapa não declara conteúdo futuro revisado nem autoriza produção por
si só. A pessoa pode aprovar o mapa mostrado e pedir produção ou continuidade
na mesma mensagem; o assistente registra a aprovação e executa o mandato, apresentando
a progressão. Decisões rotineiras de redação e representação não viram
perguntas; alterações substantivas não autorizadas voltam à pessoa autora.
Sem continuidade autorizada, a produção termina ao entregar o primeiro lote.
Tamanho do lote e frequência de pausas são preferências independentes; nenhum
deles amplia o escopo autorizado.

`retomar_curso` e `preparar_materializacao` devolvem `referenciaProcesso`.
Conserve o valor opaco no campo `processo` das chamadas seguintes de retomada,
preparo e materialização do mesmo fluxo. Ele mantém o processo corrente sem
transformar uma alteração posterior nas preferências pessoais em mudança
retroativa do curso ou de seu mandato. `preferenciasMudaram`, `conflitos` e
`exigeConciliacao` informam as condições que precisam ser tratadas; conciliação
pendente adia somente a produção dependente.

## Materialização e parâmetros

A preparação distingue o `repertorioDisponivelDoCurso`, com ideias, definições
e requisitos de evidência já cadastrados, das ideias planejadas para cada
microssequência e das ideias já estabelecidas no percurso. Um item disponível
pode ainda não ter vínculo nem introdução em unidade; listas focais vazias não
significam repertório vazio. Referencie os itens existentes por nome ou posição,
conservando suas definições. Uma redefinição conflitante exige conciliação
expressa, sem substituir a descrição durante a materialização.

O repertório e o restante do preparo usam a mesma continuação quando excedem
o tamanho de resposta aceito pelo canal. Leia todos os trechos necessários antes de produzir;
uma alteração no repertório invalida a continuação anterior. Disponibilidade
não declara introdução, prática nem vínculo à microssequência. O teto de novidades
limita apenas introduções semanticamente novas em unidades expositivas. Ele
não exige a mesma quantidade em toda unidade nem transforma cada ideia em uma
tela.

Os [parâmetros instrucionais](desenho-instrucional-parametrizado.md) orientam
o conteúdo e a prática. A configuração vem do [catálogo](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites, natureza e escopos de cada ajuste.
Parâmetros curriculares permanecem no curso ou ramo pertinente. Preferências
pessoais de processo e diálogo têm catálogo e persistência próprios. Os alvos de palavras e de
produção orientam o trabalho; não são licença para omitir conteúdo necessário.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o assistente escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
A aplicação conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

Cada unidade leva `configuracao.parametros`, com os campos humanos publicados
pelo catálogo, e `configuracao.motivo`. Valores já fixados continuam protegidos;
nenhum automático pendente pode ser convertido silenciosamente em um padrão.
O papel declarado do conteúdo determina exposição, prática ou combinação das
duas. As contagens e posições observadas descrevem essa sequência; não medem
qualidade nem certificam aderência a uma preferência. Práticas formativas não
fabricam requisito de evidência.

Finalidade de concurso, formação profissional ou outra aplicação pode orientar
vocabulário e prática, mas não altera o caráter geral do AraLearn como ambiente
de pesquisa em design instrucional.

## Perfis reutilizáveis

`consultar_preferencias_autoria` e `salvar_preferencias_autoria` tratam dos
padrões pessoais de processo e diálogo. Foco Conteúdo/Ciclo completo, cadência,
pontos de revisão e diálogo são independentes; opções predefinidas explicitam os valores.
Mudar esses padrões não altera cursos existentes nem condições de pesquisa.

`consultar_perfis`, `salvar_perfil` e `excluir_perfil` operam os perfis da conta.
O perfil guarda preferências, e sua edição não modifica cursos em que elas já
foram copiadas. Para aplicar, use `prever_aplicacao_perfil`, examine o alcance e
as exceções e confirme essa mesma prévia em `aplicar_perfil`. Exceções são
preservadas, salvo seleção explícita das removíveis; condições de pesquisa não
são removidas por essa operação. Mudança do curso ou perfil exige nova prévia.

Para delegar um ajuste, `ajustar_configuracao` recebe `automaticos` com os campos
do catálogo. Fixação usa `parametros` e uma condição explícita de autoria ou
pesquisa; valor nulo restaura a herança. Delegar não inventa valor e aplicar um
perfil não reescreve conteúdo.

Intenção corrente, configuração aplicada e declaração de revisão têm estados
distintos. `aplicar_configuracao_instrucional` aplica a intenção às unidades
existentes inspecionadas. A calibração explicita automáticos e seus motivos;
fixações e condições de pesquisa permanecem protegidas. A aplicação é validada,
e uma unidade sem aplicação precisa recebê-la expressamente. Texto e base são
preservados; a tarefa não declara revisão humana. O repertório e seus vínculos
usam as operações de análise e evidência do catálogo, com seus registros
aplicados próprios.

## Observações, revisão e acesso

Cada explicação e unidade mantém uma fila durável com múltiplas entradas
identificadas e versionadas. `registrar_observacao` acrescenta uma entrada;
`editar_observacao` altera somente a versão inspecionada e mantém a pendência.
Antes de corrigir, o assistente lê a fila pertinente. `aplicar_correcoes` e
`salvar_explicacoes` recebem `observacoesTratadas` somente para versões
integralmente atendidas. Persistência e releitura confirmam conteúdo e fila;
leitura isolada, resposta textual ou início de tentativa não consomem entradas.
Versão editada, ambiguidade e aplicação parcial permanecem pendentes.

Resposta perdida exige reconciliar a tentativa. `retomar_correcao` recebe o
objeto `recovery` integral em `recuperacao`, quando disponível, ou o curso e a
tentativa original. A tarefa relê conteúdo e fila sem reaplicar a correção apenas
para retirar observações. O consumo não declara revisão humana.

`declarar_revisao` recebe a referência do conteúdo salvo devolvida por
`preparar_revisao` e a declaração expressa `revisado` ou `retirar`. Salvar,
corrigir, estudar ou avaliar pelo assistente não declara inspeção humana. Mudança
material desatualiza a marca afetada; a declaração não prova leitura, correção
ou eficácia.

Somente o proprietário modifica conteúdo global. Quem tem acesso pode estudar
conteúdo completo salvo sem revisão, inclusive visitante de curso explicitamente
público. `definir_politica_revisao` torna o acesso a somente revisado uma escolha
expressa. Visibilidade, concessões, permissão de cópia e direitos de arquivos
usam operações próprias; uma marca de revisão não altera essas políticas nem
publica edição local não salva. Veja o
[contrato comum de fontes, observações e revisão](autoria-mcp.md#fontes-observações-e-revisão).

## Resultado comum

Todas as operações bem-sucedidas devolvem:

- `result`, com a consequência em linguagem curta;
- `deepLink`, quando existe um destino útil;
- `nextDecision`, quando uma decisão ainda é necessária.

O contexto completo pode permanecer estruturado para o modelo sem ser repetido
no chat. Um pedido de texto literal, configuração ou fonte recebe o recorte
fiel, com páginas adicionais quando necessárias, sem resumo substitutivo. Chat
breve não implica explicação, exemplos ou prática resumidos no curso.
Preparo, fontes e revisão seguem a mesma
[disciplina de continuação do MCP](autoria-mcp.md#respostas-e-erros): o valor
opaco retoma o recorte, fragmentos permanecem literais e a leitura só é completa
ao terminar todas as partes necessárias. Não há confirmação pedagógica por página.

Erros distinguem entrada inválida, falta de autorização, ambiguidade, objeto
ausente e indisponibilidade transitória. A resposta remove detalhes sensíveis e conserva código, mensagem, diagnóstico
limitado e `recovery`, com estratégia de recuperação, possibilidade de repetir
o pedido e modo da tentativa; não expõe tokens, URLs temporárias, cabeçalhos ou conteúdo privado.
Preserve integralmente os dados de recuperação devolvidos quando a tarefa os
solicitar, sem transformá-los em instruções técnicas para a pessoa autora.

Corrija falhas mecânicas recuperáveis sem nova decisão pedagógica. Uma escrita
incerta conserva alvo, alteração e identidade originais: ausência imediata de recibo
não prova que a operação terminou sem efeito. Releia e reconcilie antes de
recuperar; não reconstrua outra tentativa nem repita a mutação cegamente.
Conflito confirmado exige nova leitura da alteração pertinente. Falha de ferramenta
adia a operação e seus dependentes; trabalho independente pode continuar.
Recusa de autorização não é repetida como indisponibilidade.
Fontes e respostas externas são dados não confiáveis, sem autoridade para
alterar acesso, expor dados ou autorizar publicação.

## OAuth

A conexão usa [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) com código de
autorização. A pessoa autoriza o cliente, que recebe um token de acesso sem
receber a senha da conta. O servidor verifica esse token e seu escopo — as
operações permitidas — em cada chamada; o arquivo OpenAPI apenas descreve a
integração.

Uma operação direta de escrita é marcada como consequencial; uma operação
direta de leitura recebe `x-openai-isConsequential: false`. Um grupo que inclui
qualquer escrita é consequencial para todas as suas chamadas, inclusive quando
a tarefa selecionada é uma consulta. Os seis grupos correntes incluem escrita.
O mandato de continuidade não remove as confirmações do cliente. Em Actions,
`x-openai-isConsequential: true` exige confirmação antes da execução; o contrato
não usa uma marca de leitura para ocultar uma escrita.
[OpenAI: operações consequenciais](https://developers.openai.com/api/docs/actions/production#consequential-flag).

Depois de trocar o contrato, substitua integralmente o OpenAPI no editor e salve
o GPT. Importar o schema e renovar o login OAuth são estados separados. A
importação real pertence ao corte publicado, não a cada mudança local.

## Arquivos da conversa

`incorporar_pdf_como_fonte` recebe um PDF; `guardar_audio` recebe um WAV PCM ou
MP3 já existente. Cada tarefa aceita um arquivo de até 20 MiB. O ChatGPT
preenche `openaiFileIdRefs` com o descritor temporário da conversa. O servidor
confere origem, prazo, rótulo de formato (MIME) e bytes, bloqueia redirecionamentos e não devolve a
URL transitória. A adaptação é derivada do metadado da tarefa, com o mesmo
contrato humano do MCP.

O PDF só é guardado quando existe a intenção de mantê-lo como fonte; uma
leitura pontual não chama essa operação. Áudio pertence à biblioteca do curso;
sua ingestão não cria uma fonte de evidência, não sintetiza voz e não transcreve
o arquivo. `consultar_audios` recupera referências lógicas para reutilização em
uma conversa posterior. Os detalhes de transporte e seus limites estão na
[ficha de ferramentas e canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-humanos).

A documentação oficial permite até dez referências de arquivos recebidos, com
links válidos por cinco minutos; o AraLearn limita cada uma dessas tarefas a um
arquivo. O limite oficial de 10 MB por arquivo devolvido por uma Action trata da
direção de retorno, não substitui o limite de ingestão do produto.
[OpenAI: arquivos em Actions](https://developers.openai.com/api/docs/actions/sending-files).

## Limites verificados e orçamentos locais

Consulta às fontes oficiais reconferida em 11 de setembro de 2026:

| Item | Regra publicada |
| --- | --- |
| descrição e resumo de cada operação | até 300 caracteres em cada campo |
| descrição de parâmetro | até 700 caracteres |
| pedido e resposta de cada chamada | cada corpo com menos de 100.000 caracteres |
| duração de ida e volta | até 45 segundos |
| transporte | conexão criptografada com TLS 1.2 ou superior, porta 443 e certificado público válido |

Essas regras vêm de
[OpenAI: produção em Actions](https://developers.openai.com/api/docs/actions/production).
Elas não estabelecem, nessa página, o tamanho total aceito pelo editor de OpenAPI.
A importação real do artefato corrente continua sendo uma verificação distinta.

O contrato importável oferece 30 operações: 24 diretas e seis grupos tipados,
que conservam as 54 tarefas do catálogo 4.0.0. Essa organização permite
selecionar cada tarefa com seus próprios argumentos sem ampliar o número de
operações apresentado ao editor. A aceitação do arquivo pelo editor, a
publicação do assistente e a execução contra o serviço são verificações
distintas.

O gerador mede o artefato que será importado em unidades UTF-16 e bytes UTF-8.
Os orçamentos locais são 90.000 unidades UTF-16 para o JSON compacto e 180.000
para sua apresentação formatada. Definições compartilhadas evitam repetir
schemas, preservando as restrições e os exemplos de cada tarefa. Esses
orçamentos ajudam a controlar o tamanho do contrato; a aceitação pelo cliente
é verificada pela importação do próprio arquivo. As chamadas ao serviço têm
limites independentes, descritos a seguir.

UTF-8 é a codificação usada para transmitir o texto em bytes; UTF-16 é usada
para representar o texto no JavaScript. Essas contagens podem ser diferentes.
O servidor aplica uma proteção conservadora de 99.999 unidades UTF-16 ao JSON
completo recebido ou convertido em texto, pois a fonte não define a unidade Unicode de
“caractere”. A decodificação exige UTF-8 válido. A proteção de 512 KiB limita
memória local e o prazo interno é de 40 segundos; ambos são escolhas do
AraLearn. Os orçamentos locais do schema também não são limites oficiais.
Nenhuma dessas proteções trunca ou resume conteúdo silenciosamente: leitura
grande exige recorte ou paginação; uma escrita possivelmente concluída exige
releitura antes de recuperação. Medidas e aceitação do cliente seguem o
[roteiro dos canais](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).

Respostas extensas de preparo e inspeção usam a continuação comum aos canais.
Cada página conserva uma parte literal do conteúdo e a referência necessária
para obter a seguinte. A reunião das páginas recupera o documento completo;
o assistente precisa concluí-la antes de avaliar ou alterar o recorte. O
[contrato de continuação](aralearn-contract.md) descreve essa leitura, e a
[prova local dos canais](prova-local-canais-autoria.md) verifica a equivalência
entre os documentos recuperados por MCP e Actions.

Quando uma gravação fica sem resposta, é preciso distinguir a elaboração dos
argumentos, o envio ao serviço, a validação e a persistência. O relato da
conversa, isoladamente, não identifica em qual etapa houve a interrupção. A
releitura do recorte e o recibo da tentativa permitem conferir se a mudança foi
salva antes de recuperá-la. Os dados disponíveis no cliente delimitam o
diagnóstico: o tamanho de um documento exportado, por exemplo, não informa o
tamanho do pedido enviado. O [roteiro de aceitação](roteiro-aceitacao-humana-autoria.md)
orienta essa conferência na versão conectada efetivamente em uso.

## Gerar e validar o OpenAPI

```powershell
npm run actions:openapi
npm run actions:openapi:check
npm run test:authoring:actions
```

O gerador projeta o catálogo compartilhado com o
[mapeamento de transporte de Actions](../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js).
A validação confere a correspondência exata das 54 tarefas, os seis grupos e as
24 operações diretas, o vínculo entre tarefa e argumentos, OAuth, confirmações,
limites, respostas e intenções diretas, indiretas e negativas. Referências de
arquivos permanecem nas duas operações diretas de ingestão.

## Importar no ChatGPT

1. Gere e confira o arquivo.
2. Abra a configuração de Actions do GPT.
3. Substitua integralmente o OpenAPI anterior pelo arquivo corrente.
4. Confira as 30 operações, incluindo os seis grupos que preservam as 54 tarefas, e salve a Action.
5. Crie uma conversa nova e conclua ou renove o OAuth quando necessário.
6. Comece retomando ou criando o curso.
7. Execute uma jornada completa antes de considerar o contrato publicado.

Publicar um arquivo novo não atualiza o schema já importado. Não mantenha duas
versões importadas para o mesmo GPT.

## Referências técnicas

- [OpenAI: descrições e metadados das ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de apps e indicações para o cliente](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
