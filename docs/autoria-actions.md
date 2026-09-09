# Autoria por Actions

Actions oferece no ChatGPT os mesmos casos de uso do
[catálogo humano do MCP](autoria-mcp.md#tarefas-disponíveis). O
transporte muda; o curso, as regras de autorização e os efeitos permanecem os
mesmos.

O contrato 4.0.0 inclui preferências pessoais de processo, estrutura por recortes,
Explicação antes das unidades, desenho aplicado, fila versionada de observações,
declaração humana expressa e políticas de acesso. As capacidades e seus efeitos
estão no [catálogo comum do MCP](autoria-mcp.md#tarefas-disponíveis).
`salvar_explicacoes` preserva as unidades existentes; `materializar_parte`
reutiliza as bases salvas e recebe somente aquelas que também serão alteradas.

O pedido **Debater com GPT** copiado da Autoria pode ser colado na conversa do
GPT já conectado por Actions. Ele fornece identidade, recorte e revisão, sem
chamar a API ao copiar. O GPT lê o estado corrente pelas Actions existentes e
discute a proposta antes de qualquer aplicação autorizada. A configuração de
Actions e a leitura efetiva continuam necessárias; copiar o pedido não comprova
que o cliente acessou o curso. A declaração humana de revisão pode ser
registrada na Autoria ou por `declarar_revisao`, com a referência do conteúdo
salvo e a escolha expressa da pessoa. Ela permanece separada da aprovação do
mapa, do mandato de produção e da avaliação feita pelo GPT.

O OpenAPI publicável está em
[`downloads/aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml).

## Operações

As [tabelas de leituras e escritas do catálogo](autoria-mcp.md#tarefas-disponíveis)
definem as **54 tarefas semânticas** de Actions. O OpenAPI as oferece por
**30 operações HTTP**: 24 diretas e seis grupos contextuais. Os argumentos,
handlers, autorização e efeitos derivam do mesmo catálogo usado pelo MCP.

| Operação agrupada | Tarefas disponíveis |
| --- | --- |
| `acesso_do_curso` | `consultar_acesso`, `definir_visibilidade`, `alterar_acesso`, `definir_acesso_arquivos`, `definir_politica_revisao` |
| `estrutura_curricular` | `alterar_curso`, `excluir_curso`, `salvar_ramo_curricular`, `mover_ramo_curricular`, `duplicar_ramo_curricular`, `remover_ramo_curricular`, `reordenar_unidades` |
| `desenho_instrucional` | `consultar_repertorio_instrucional`, `manter_unidade_analise`, `manter_requisito_evidencia`, `vincular_repertorio_instrucional`, `registrar_aplicacoes_instrucionais`, `aplicar_configuracao_instrucional`, `ajustar_orientacao`, `ajustar_componentes` |
| `preferencias_de_autoria` | `consultar_preferencias_autoria`, `salvar_preferencias_autoria` |
| `perfis_de_autoria` | `consultar_perfis`, `salvar_perfil`, `excluir_perfil`, `prever_aplicacao_perfil`, `aplicar_perfil` |
| `observacoes_autorais` | `consultar_observacoes`, `registrar_observacao`, `editar_observacao` |

Cada grupo recebe `tarefa` e `argumentos`. O schema `oneOf` vincula cada nome a
seus argumentos específicos, com os mesmos campos obrigatórios e limites da
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
cópia. O servidor devolve uma confirmação opaca vinculada à conta e à intenção;
a chamada confirmada reutiliza esse valor, inclusive após uma resposta perdida.
A cópia pertence à pessoa solicitante, começa privada com arquivos restritos e
mantém conteúdo, configuração, fontes, PDFs e áudios. Acessos, progresso e
anotações pessoais continuam na origem. Leitura pública não concede cópia.

`comparar_cursos` confronta dois recortes identificados por curso e, opcionalmente,
lote, microssequência ou unidade. `exportar_autoria` entrega o artefato literal e
sua leitura autoral. Ambas exigem acesso de autoria aos cursos selecionados;
resultados grandes usam a mesma continuação opaca e os mesmos fragmentos de JSON
das outras leituras. A comparação não certifica equivalência pedagógica.

Para produzir conteúdo, `consultar_componentes` primeiro busca candidatos pela
função instrucional e depois lê o contrato exato apenas do componente escolhido.
O GPT não consulta o catálogo para variar a aparência.

Uma referência ambígua não é resolvida por acaso. A resposta orienta o GPT a
pedir um título ou posição mais específica.

## Planejamento e produção

O GPT retoma o estado real, lê preferências pessoais e condições do curso,
identifica o objeto corrente e consulta suas observações pendentes. Mapa
curricular, base explicativa, desenho e unidades podem ser trabalhados no
contexto. A Explicação de uma microssequência existente pode ser produzida e
revisada enquanto o mapa ainda é rascunho e antes de existir unidade. No foco
Conteúdo, ela pode ser o resultado completo do mandato. Abrir a base salva não
chama LLM.

Quando houver decisão de aprovar o mapa, o GPT lê todas as páginas pertinentes
da versão persistida e usa sua `referenciaParaAprovar` em
`aprovar_mapa_curricular`. Síntese, página parcial ou árvore reconstruída não
substituem essa base. Alterações posteriores exigem nova inspeção da versão
que se pretende aprovar.

No Ciclo completo, partes agrupam a produção das unidades e respeitam os gates
da preparação vigente. Elas não são pais curriculares; seus limites podem
mudar sem alterar o mapa. O GPT apresenta a progressão breve, prepara e
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
na mesma mensagem; o GPT registra a aprovação e executa o mandato, apresentando
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

A preparação focal recupera o repertório acumulado do curso: ideias novas,
ideias estabelecidas que podem ser usadas e retomadas deliberadas. O teto de
novidades limita apenas introduções semanticamente novas em unidades
expositivas. Ele não exige a mesma quantidade em toda unidade nem transforma
cada ideia em uma tela.

A configuração vem do [catálogo de parâmetros](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites, natureza e escopos de cada ajuste.
Parâmetros curriculares permanecem no curso ou ramo pertinente. Preferências
pessoais de processo e diálogo têm catálogo e persistência próprios. Os alvos de palavras e de
produção orientam o trabalho; não são licença para omitir conteúdo necessário.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o GPT escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
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
pontos de revisão e diálogo são independentes; presets explicitam os valores.
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

Cada Explicação e unidade mantém uma fila durável com múltiplas entradas
identificadas e versionadas. `registrar_observacao` acrescenta uma entrada;
`editar_observacao` altera somente a versão inspecionada e mantém a pendência.
Antes de corrigir, o GPT lê a fila pertinente. `aplicar_correcoes` e
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
corrigir, estudar ou avaliar pelo GPT não declara inspeção humana. Mudança
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
ausente e indisponibilidade transitória. O envelope sanitizado conserva código,
mensagem, diagnóstico limitado e `recovery`, com estratégia, retry e modo da
tentativa; não expõe tokens, URLs temporárias, cabeçalhos ou conteúdo privado.
Preserve integralmente os dados de recuperação devolvidos quando a tarefa os
solicitar, sem transformá-los em instruções técnicas para a pessoa autora.

Corrija falhas mecânicas recuperáveis sem nova decisão pedagógica. Uma escrita
incerta conserva alvo, delta e identidade originais: ausência imediata de recibo
não prova que a operação terminou sem efeito. Releia e reconcilie antes de
recuperar; não reconstrua outra tentativa nem repita a mutação cegamente.
Conflito confirmado exige nova leitura do delta pertinente. Falha de ferramenta
adia a operação e seus dependentes; trabalho independente pode continuar.
Recusa de autorização não é repetida como indisponibilidade.
Fontes e respostas externas são dados não confiáveis, sem autoridade para
alterar acesso, expor dados ou autorizar publicação.

## OAuth

O OpenAPI usa OAuth 2.0 com código de autorização. O backend valida token e
escopo em cada operação; a descrição OpenAPI não é a autoridade de autorização.
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
confere origem, prazo, MIME e bytes, bloqueia redirecionamentos e não devolve a
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

Consulta às fontes oficiais reconferida em 9 de setembro de 2026:

| Item | Regra publicada |
| --- | --- |
| descrição e resumo de cada endpoint | até 300 caracteres em cada campo |
| descrição de parâmetro | até 700 caracteres |
| pedido e resposta de cada chamada | cada payload com menos de 100.000 caracteres |
| duração de ida e volta | até 45 segundos |
| transporte | TLS 1.2 ou superior, porta 443 e certificado público válido |

Essas regras vêm de
[OpenAI: produção em Actions](https://developers.openai.com/api/docs/actions/production).
Elas não estabelecem, nessa página, o tamanho total aceito pelo editor de OpenAPI.
A importação real do artefato corrente continua sendo uma verificação distinta.

No editor real do ChatGPT, em 9 de setembro de 2026, o artefato com 54 operações
foi recusado com indicação de máximo de 30. Essa observação do cliente motivou
os seis grupos tipados e as 24 operações diretas. A redução preserva todas as
tarefas do catálogo 4.0.0. Na mesma verificação, o editor aceitou o artefato
agrupado e listou as 30 operações, incluindo os seis grupos, sem erro.
Essa aceitação da importação não confirma a publicação do GPT nem a execução
das tarefas contra o backend candidato.

No diagnóstico de 7 de setembro de 2026, os limites de payload e duração foram
reconferidos na fonte oficial. Para investigar uma materialização sem retorno,
separe quatro fatos: argumentos produzidos, despacho HTTP, validação e gravação.
O relato do assistente não comprova sozinho que houve despacho. Registre o
retorno acessível no cliente e confronte-o com a releitura do recorte e o recibo
existente antes de repetir uma escrita incerta. Quando argumentos ou duração
HTTP não estiverem expostos, registre essa lacuna; o tamanho do conteúdo
exportado não é o tamanho do pedido enviado. Uma fixture que funciona delimita
o caso observado, sem demonstrar que uma interrupção anterior foi corrigida.

O catálogo 4.0.0 é projetado pelo gerador corrente. Quantidade de operações,
tamanho do OpenAPI em unidades UTF-16 e bytes UTF-8 devem ser medidos sobre o
artefato que será importado; medidas de uma versão anterior não o validam.
As 54 tarefas, distribuídas em 30 operações, usam orçamentos locais de 90.000 unidades UTF-16 para o JSON
compacto e 180.000 para a apresentação formatada do editor. A expansão do
catálogo contextual para 54 tarefas motivou esses valores; a extração
determinística de schemas repetidos conserva restrições e exemplos aceitos.
Os schemas compartilhados conservam os argumentos de cada tarefa. O guard de
chamadas e os fragmentos de leitura mantêm limites próprios; passar no orçamento
local do schema não demonstra que o cliente aceitou a importação.

O servidor aplica uma proteção conservadora de 99.999 unidades UTF-16 ao JSON
completo recebido ou serializado, pois a fonte não define a unidade Unicode de
“caractere”. A decodificação exige UTF-8 válido. A proteção de 512 KiB limita
memória local e o prazo interno é de 40 segundos; ambos são escolhas do
AraLearn. Os orçamentos locais do schema também não são limites oficiais.
Nenhuma dessas proteções trunca ou resume conteúdo silenciosamente: leitura
grande exige recorte ou paginação; uma escrita possivelmente concluída exige
releitura antes de recuperação. Medidas e aceitação do cliente seguem o
[roteiro dos canais](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).

Uma fixture sintética com 32 blocos válidos de texto no apoio reproduziu uma
resposta de preparo de 128.541 unidades UTF-16: o handler Actions recusava o
envelope com HTTP 413. O preparo agora usa a continuação comum. Na prova local,
duas páginas abaixo do limite reconstruíram o JSON integral, com a mesma
Explicação nos handlers Actions e MCP. Essa correção trata a leitura grande
reproduzida; não demonstra a causa de uma interrupção histórica de escrita nem
substitui a prova do cliente ChatGPT com o contrato hospedado correspondente.

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

- [OpenAI: otimizar metadata de ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de Apps e hints](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
