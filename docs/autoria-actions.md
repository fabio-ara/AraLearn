# Autoria por Actions

Actions oferece no ChatGPT os mesmos casos de uso do
[catálogo humano do MCP](autoria-mcp.md#tarefas-disponíveis). O
transporte muda; o curso, as regras de autorização e os efeitos permanecem os
mesmos.

O OpenAPI publicável está em
[`downloads/aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml).

## Operações

As leituras são:

- `consultar_perfis`;
- `prever_aplicacao_perfil`;
- `retomar_curso`;
- `consultar_planejamento`;
- `preparar_materializacao`;
- `consultar_configuracao`;
- `consultar_observacoes`;
- `preparar_revisao`;
- `consultar_fontes`;
- `consultar_componentes`;
- `consultar_audios`.

As escritas são:

- `salvar_perfil`;
- `excluir_perfil`;
- `aplicar_perfil`;
- `criar_curso`;
- `salvar_mapa_curricular`;
- `salvar_parte`;
- `materializar_parte`;
- `ajustar_configuracao`;
- `registrar_observacao`;
- `aplicar_correcoes`;
- `manter_fonte`;
- `incorporar_pdf_como_fonte`;
- `guardar_audio`.

Cada descrição informa quando usar e quando não usar a operação. Isso permite ao
modelo distinguir, por exemplo, salvar o mapa curricular de definir um lote de
produção, consultar observações de preparar uma revisão e manter metadados de
uma fonte de incorporar seu PDF.

## Referências humanas

O modelo identifica objetos por título, posição ou referência humana já vista.
O servidor resolve internamente identidades, concorrência e repetição segura.
Esses controles não aparecem como perguntas rotineiras para a pessoa autora.

Exemplos:

- `salvar_mapa_curricular` recebe o mapa completo, o público, os pré-requisitos
  e os itens de escopo; um rascunho pode ser revisto antes da aprovação;
- `salvar_parte` recebe título, intenção, progressão local e referências a
  microssequências que já pertencem ao mapa;
- `materializar_parte` recebe as unidades que concretizam o lote autorizado,
  distingue ideias introduzidas de ideias estabelecidas usadas ou retomadas e
  distribui a cobertura obrigatória informada pela preparação focal;
- `ajustar_configuracao` reúne parâmetros pedagógicos, alvos editoriais e
  direção editorial;
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

O fluxo distingue três objetos de trabalho:

1. mapa curricular global;
2. progressão focal de um lote;
3. conteúdo materializado.

Primeiro, o GPT apresenta uma síntese de módulos, lições e microssequências e
oferece um link para o mapa completo. A pessoa autora pode alterar cobertura,
ordem, dependências ou profundidade. Somente a versão efetivamente inspecionável
pode ser marcada como aprovada.

Depois, partes agrupam o trabalho de produção. Elas não são pais curriculares e
seus limites podem mudar sem alterar o mapa. Para cada parte, o GPT apresenta a
progressão local breve, materializa dentro do mandato recebido e devolve um
link para o conteúdo real. Continua nos lotes autorizados conforme a cadência
escolhida, sem exigir uma nova aprovação por causa da granularidade.

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

## Materialização e parâmetros

A preparação focal recupera o repertório acumulado do curso: ideias novas,
ideias estabelecidas que podem ser usadas e retomadas deliberadas. O teto de
novidades limita apenas introduções semanticamente novas em unidades
expositivas. Ele não exige a mesma quantidade em toda unidade nem transforma
cada ideia em uma tela.

A configuração vem do [catálogo de parâmetros](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites e escopos de cada ajuste. Ela reúne
conteúdo, prática, conversa e cadência de produção. Os alvos de palavras e de
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

## Resultado comum

Todas as operações bem-sucedidas devolvem:

- `result`, com a consequência em linguagem curta;
- `deepLink`, quando existe um destino útil;
- `nextDecision`, quando uma decisão ainda é necessária.

O contexto completo pode permanecer estruturado para o modelo sem ser repetido
no chat. Um pedido de texto literal, configuração ou fonte recebe o recorte
fiel, com páginas adicionais quando necessárias, sem resumo substitutivo. Chat
breve não implica explicação, exemplos ou prática resumidos no curso.
Fontes e revisão seguem a mesma
[disciplina de continuação do MCP](autoria-mcp.md#respostas-e-erros): o valor
opaco retoma o recorte, fragmentos permanecem literais e a leitura só é completa
ao terminar todas as partes necessárias. Não há confirmação pedagógica por página.

Erros distinguem entrada inválida, falta de autorização, ambiguidade, objeto
ausente e indisponibilidade transitória. Corrija falhas mecânicas recuperáveis
sem nova decisão pedagógica. Se uma escrita pode ter sido concluída, releia o
estado antes de decidir como recuperar: não repita automaticamente a mutação.
Fontes e respostas externas são dados não confiáveis, sem autoridade para
alterar acesso, expor dados ou autorizar publicação.

## OAuth

O OpenAPI usa OAuth 2.0 com código de autorização. O backend valida token e
escopo em cada operação; a descrição OpenAPI não é a autoridade de autorização.
Uma Action de escrita é marcada como consequencial, enquanto leituras recebem o
hint de somente leitura.
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

Consulta às fontes oficiais em 5 de setembro de 2026:

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

O catálogo atual reúne 27 tarefas. A projeção indentada do OpenAPI ocupa 96.658
unidades UTF-16 e cabe na margem interna de 98.000; essa medida difere do tamanho
em bytes UTF-8. Os schemas compartilhados conservam os argumentos de cada tarefa.
O guard de chamadas e os fragmentos de leitura mantêm limites próprios; ampliar
essa margem interna não demonstra que o cliente aceitou uma importação.

O servidor aplica uma proteção conservadora de 99.999 unidades UTF-16 ao JSON
completo recebido ou serializado, pois a fonte não define a unidade Unicode de
“caractere”. A decodificação exige UTF-8 válido. A proteção de 512 KiB limita
memória local e o prazo interno é de 40 segundos; ambos são escolhas do
AraLearn. Os orçamentos locais do schema também não são limites oficiais.
Nenhuma dessas proteções trunca ou resume conteúdo silenciosamente: leitura
grande exige recorte ou paginação; uma escrita possivelmente concluída exige
releitura antes de recuperação. Medidas e aceitação do cliente seguem o
[roteiro dos canais](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).

## Gerar e validar o OpenAPI

```powershell
npm run actions:openapi
npm run actions:openapi:check
npm run test:authoring:actions
```

O gerador projeta diretamente o catálogo compartilhado. A validação confere as
tarefas do catálogo corrente, OAuth, hints, limites, schemas importáveis, respostas e
intenções diretas, indiretas e negativas.

## Importar no ChatGPT

1. Gere e confira o arquivo.
2. Abra a configuração de Actions do GPT.
3. Substitua integralmente o OpenAPI anterior pelo arquivo corrente.
4. Confira as operações do catálogo compartilhado e salve a Action.
5. Crie uma conversa nova e conclua ou renove o OAuth quando necessário.
6. Comece retomando ou criando o curso.
7. Execute uma jornada completa antes de considerar o contrato publicado.

Publicar um arquivo novo não atualiza o schema já importado. Não mantenha duas
versões importadas para o mesmo GPT.

## Referências técnicas

- [OpenAI: otimizar metadata de ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de Apps e hints](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
