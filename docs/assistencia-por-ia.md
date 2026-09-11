# Assistência por modelo de linguagem

O AraLearn usa modelos de linguagem para ajudar a planejar cursos, desenvolver
explicações, escolher representações e preparar atividades. A pessoa autora
define o objetivo, orienta a produção e inspeciona o conteúdo e sua relação com
as fontes. O material permanece acessível e revisável no aplicativo entre as
sessões de trabalho.

Na autoria por conversa, um assistente externo se conecta ao AraLearn para
consultar e alterar o curso pelas [integrações de autoria](#três-formas-de-assistência). A
interface também permite editar diretamente e pedir assistência sobre um trecho.
O conteúdo estruturado descreve o que será apresentado; os
[contratos](aralearn-contract.md) verificam sua forma e as operações permitidas.
A conferência factual e pedagógica exige inspecionar o material e as fontes,
mesmo quando essa validação técnica termina sem erros.

A supervisão precisa ser descrita pelo controle exercido em cada fluxo. O
referencial de [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao), p. 69, distingue
*human-in-the-loop*, com decisão humana necessária antes de efeitos relevantes,
de *human-on-the-loop*, com acompanhamento e possibilidade de intervenção.
No AraLearn, a autorização delimita a produção e os pontos de revisão dão acesso
ao material para inspeção. A exigência de conteúdo revisado para estudo é uma
[política expressa do curso](explicacao-e-revisao-humana.md), separada da simples
gravação. Essa configuração determina quais efeitos dependem de revisão prévia.

## Três formas de assistência

O AraLearn oferece três integrações relacionadas, mas distintas:

- **Assistência por IA** aparece dentro da unidade, da microssequência e da
  lição e usa OpenAI, Gemini ou DeepSeek, escolhidos pela pessoa;
- **Model Context Protocol (MCP)** é o protocolo pelo qual um cliente de IA
  compatível descobre e utiliza as tarefas de autoria;
- **Actions/OpenAPI** oferece essas tarefas a um assistente personalizado no
  [ChatGPT](https://chatgpt.com), uma aplicação externa ao AraLearn, por
  operações descritas em um arquivo OpenAPI.

Os três caminhos obedecem às mesmas regras do curso, com credenciais e sessões
próprias. O catálogo conversacional inclui criação, cópia, exclusão e acesso a
cursos. Dados do perfil pessoal, avatar e exclusão da conta continuam na
interface autenticada.

Separar as tarefas de autoria dos modelos é uma escolha de arquitetura que
favorece o uso de clientes diferentes. A integração concreta depende dos
recursos e da autenticação de cada cliente; as provas de MCP e Actions têm
alcances próprios. Os provedores da assistência interna são os três adaptadores
listados acima.

## A sessão de assistência por IA

A assistência interna mantém uma conversa sobre o recorte aberto — unidade,
microssequência ou lição, conforme o [modelo didático](modelo-didatico.md).
Esse alvo é fixado ao iniciar a sessão, que progride assim:

1. a pessoa descreve o problema ou objetivo;
2. o modelo responde à discussão; uma explicação pode vir sem proposta de mudança;
3. a pessoa discute, corrige, discorda ou acrescenta condições;
4. quando houver uma mudança solicitada, a proposta incorpora as condições da conversa;
5. **Preparar prévia** gera e valida o resultado, sem alterar o rascunho;
6. **Original** e **Prévia** permitem conferir o conteúdo com o mesmo mecanismo de apresentação usado no estudo;
7. **Aplicar ao rascunho** aceita o resultado conferido; **Descartar prévia** o remove;
8. **Salvar proposta** grava o rascunho com a revisão original; **Descartar rascunho** restaura o original.

Fechar a sessão apaga mensagens, configuração e qualquer proposta ainda não
aplicada. Um resultado já aceito permanece no rascunho; a conversa não entra no
conteúdo do curso nem no [armazenamento do servidor ou do dispositivo](persistencia-relacional.md).
Os recibos de gravação também não incluem a conversa.

### Escopos de escrita

A sessão pode trabalhar com:

- composição e conteúdo da unidade de estudo;
- estrutura e conteúdo da microssequência didática;
- criação, remoção e reordenação de microssequências no escopo da lição.

O alvo corrente permanece visível durante edição e prévia. Uma proposta para
microssequência não recebe autoridade sobre outra microssequência; uma proposta
para lição não altera módulos, outras lições ou dados pessoais.

Edição focal, assistência e alterações estruturais são exclusivas do
proprietário, também quando ele estuda seu próprio curso. Receber acesso privado
ou abrir um curso público permite estudar e, com conta, registrar observações;
isso não concede edição nem cria uma cópia automaticamente. Cópias próprias
existentes continuam cursos independentes sob a autoridade de seu proprietário.

## Contexto enviado

O conjunto enviado ao modelo inclui a instrução da pessoa, até oito mensagens
recentes da sessão, a proposta corrente, o caminho didático e o conteúdo
necessário para compreender o alvo.
Para a unidade, inclui os componentes e campos editáveis. Para a
microssequência, inclui sua ordem e suas unidades. Para a lição, inclui as
microssequências e o contexto curricular suficiente para criar, remover ou
reordenar sem perder relações.

O contexto é somente leitura. Identificadores de autorização, credenciais,
arquivos do armazenamento e dados pessoais externos ao recorte não são enviados.
O contexto tem limite de 96 KiB, ou 98.304 bytes. O resumo curricular pode ser reduzido fora do
alvo; se o conteúdo necessário à alteração ainda não couber, a interface informa
o limite e preserva o rascunho.

O AraLearn envia esse contexto diretamente ao provedor escolhido, que pode aplicar
seus próprios termos de tratamento. A revisão humana continua necessária mesmo
com essa seleção de campos, pois o próprio conteúdo educacional pode conter dado
pessoal ou informação sensível.

## Descoberta e geração de componentes

Quando a proposta usa componentes didáticos, o AraLearn reutiliza
`consultarComponentesDidaticos`, que identifica representações adequadas e
fornece o contrato de cada componente. Ao preparar a prévia, a sessão descobre
os componentes, obtém seus contratos, gera a proposta e a valida antes da
inspeção e da aplicação ao rascunho.

A descoberta começa por famílias e intenção. O modelo recebe somente os
contratos dos componentes escolhidos, um por chamada. A composição gerada passa
pela validação de cada [pacote de componente](componentes-didaticos.md), de suas
relações internas e de sua apresentação no estudo.

Reparos são limitados a duas tentativas e recebem os erros estruturados da
validação anterior. Se a proposta continuar inválida, a sessão preserva o
conteúdo corrente e explica a falha. O JSON, formato estruturado usado para descrever os componentes, pode ser
válido sem que a proposta seja apresentável. A aplicação depende também da
prévia e da decisão da pessoa.

## Aplicação ao rascunho e concorrência

Antes de alterar o rascunho, o AraLearn prepara a candidata, verifica-a com o
mesmo mecanismo que apresenta a unidade no estudo e aguarda **Aplicar ao rascunho**. Falha
de geração, validação ou apresentação preserva o conteúdo corrente. Uma
candidata aceita e válida substitui somente o rascunho do alvo; a gravação é
uma operação separada.

Cada escrita informa a revisão esperada do curso e as versões focais
necessárias. Se outra sessão alterar o alvo entre leitura e gravação, o servidor
recusa a proposta. A candidata continua no rascunho para conferência ou descarte;
a revisão mais nova não substitui a revisão original do pedido. Atualizações de
fundo ficam suspensas durante a conversa e enquanto houver rascunho, evitando
substituir o trabalho local por conteúdo externo.

Cada escrita recebe uma identidade estável, `requestId`, para recuperar seu recibo quando a
resposta da rede se perde. Repetir a mesma identidade com conteúdo diferente é
conflito. Essa repetição segura não amplia o escopo confirmado.

Se a resposta da gravação se perder, salvar novamente confere o mesmo pedido.
Descartar nessa situação exige confirmação focal: remove o rascunho local,
mas não desfaz uma gravação que já possa ter sido concluída no curso.

## Provedor remoto e credencial da sessão

A pessoa escolhe OpenAI, Gemini ou DeepSeek, informa o modelo quando necessário
e fornece a própria chave. A chave permanece apenas em memória durante a sessão,
segue somente no cabeçalho da chamada ao provedor escolhido e não entra no
curso, banco, armazenamento local, arquivos ou registros de execução do aplicativo.

Sair, recarregar ou fechar a interface cancela a chamada pendente e apaga
provedor, modelo, chave, conversa e qualquer candidata ainda não aplicada. Uma
alteração já aceita permanece no rascunho. Uma resposta tardia não pode reabrir
a sessão nem aplicar conteúdo. Os endereços dos serviços são definidos pelos
adaptadores; a interface pede apenas as escolhas necessárias ao uso.

A pessoa precisa revisar o recorte e os termos do provedor. A permanência da
chave somente em memória não altera sua validade no serviço. Testes automatizados
usam respostas simuladas, sem custo; uma prova real exige credencial autorizada
e limite de consumo definido. Testes simulados não demonstram interoperabilidade
com a conta e o modelo de um serviço real.

## MCP e Actions

MCP e Actions expõem as mesmas tarefas do catálogo compartilhado. O assistente
consulta o estado salvo, prepara o trabalho autorizado e o grava por operações
que distinguem leitura e escrita. A produção das unidades de estudo a partir
do planejamento é chamada de materialização.

O assistente localiza objetos por título, posição ou referência humana. A camada
confiável resolve identidades e concorrência. Assim, a conversa pode coordenar
uma mudança e um próximo passo sem transformar detalhes do banco em trabalho da
pessoa autora.

MCP usa OAuth 2.1 e Actions mantém sua própria conexão OAuth. Esse mecanismo
permite autorizar o cliente sem lhe entregar a senha da conta. Actions descreve
as operações num arquivo OpenAPI; MCP oferece descoberta de ferramentas. Os dois canais chegam ao mesmo curso e obedecem à
mesma autorização. A [Autoria por MCP](autoria-mcp.md) e o guia de [Autoria por
Actions](autoria-actions.md) desenvolvem as diferenças de transporte.

## Planejamento, fontes e revisão

O planejamento organiza módulos, lições e microssequências num mapa curricular,
que pode ser desenvolvido por recortes coerentes. A explicação de uma
microssequência reúne o conteúdo desenvolvido, seus pressupostos, relações e
fontes; pode ser produzida e revista antes das unidades, inclusive com o mapa
em rascunho. O [modelo didático](modelo-didatico.md) relaciona mapa, explicação
e percurso de estudo.

As preferências distinguem o foco **Conteúdo**, dedicado às explicações e
fontes, do **Ciclo completo**, que inclui também desenho e unidades. Cadência,
pontos de revisão e diálogo são escolhas independentes. Quando o trabalho
inclui unidades, partes agrupam sua produção em lotes operacionais. O assistente
prepara o lote, apresenta a progressão e produz dentro da autorização vigente,
reutilizando as explicações salvas. Mudar os limites de uma parte conserva o
currículo.

Aprovar o mapa confirma a versão completa inspecionada. Autorizar produção
define o que o assistente pode fazer. Declarar revisão registra a inspeção
humana de conteúdo já salvo. Essas decisões permanecem distintas, e os
[pontos de revisão](explicacao-e-revisao-humana.md) dão acesso ao objeto e às
fontes que a pessoa precisa conferir. Uma autorização de continuidade permite
avançar entre lotes até o limite combinado ou uma decisão substantiva pendente.

Antes de produzir, o assistente reúne configuração, fontes e repertório acumulado do
recorte. Ele diferencia ideias introduzidas, ideias estabelecidas apenas usadas
e retomadas deliberadas. A resposta coordenadora informa o resultado, abre o
destino pertinente e formula no máximo uma decisão seguinte.

A configuração orienta conteúdo, prática, conversa e cadência de produção. O
[desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
explica essas escolhas; o [catálogo de parâmetros](../src/domain/courseDesignParameters.js)
define seus tipos, limites e escopos.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o assistente escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
O registro aplicado à unidade conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

Ao abrir o minichat, o aplicativo lê a configuração efetiva do foco pela mesma
revisão do conteúdo original. Ele não calcula herança nem preenche valores
pendentes. Se a revisão divergir, pede sincronização e reabertura; a leitura não
substitui a versão original usada para proteger o rascunho. A conversa recebe fixações, delegações,
motivos e conflitos. Uma proposta de edição não segue enquanto houver conflito
de configuração.

Os alvos de palavras por resposta de autoria e por unidade de estudo orientam a
extensão, mas não são limites e não autorizam esconder decisões ou comprimir
conteúdo necessário.

Fontes e suas âncoras — localizações dos trechos usados — ficam no curso salvo,
com os [vínculos que indicam como sustentam o conteúdo](fontes-e-citacoes.md).
Um arquivo anexado à conversa só se torna
fonte persistente quando essa intenção está clara. Em outra sessão, a
assistência pode localizar a fonte pelo título e reler suas âncoras; memória da
conversa e novo upload não substituem esse estado.

Uma revisão começa pelas observações abertas e inclui outras unidades quando a
mudança afeta progressão, pré-requisitos, exemplos, prática ou transições. O
assistente propõe um conjunto coerente e aplica as correções autorizadas. A
releitura confirma o conteúdo e as versões de observações efetivamente atendidas;
a [reconciliação da tentativa](auditoria-de-conformidade-instrucional.md#aplicação-e-reinspeção)
permite conferir uma resposta perdida sem reaplicar a alteração. A declaração
humana de revisão continua sendo uma decisão expressa.

## Limites de interpretação

Contratos podem demonstrar integridade técnica, autorização e correspondência
entre referências. Eles não demonstram verdade científica, qualidade global ou
aprendizagem. Recomendações de interação humano-IA ressaltam visibilidade,
controle e possibilidade de correção
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Num estudo de
decisão assistida por IA, intervenções que forçavam reflexão reduziram
dependência excessiva, mas acrescentaram custo; esse resultado é situado e não
garante o mesmo efeito na autoria educacional
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). No uso
educacional de modelos generativos, a responsabilidade factual e pedagógica permanece humana
([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

Consulte [Criar cursos pelo chat](criar-cursos-pelo-chat.md) para o percurso
conversacional e [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md)
para a relação entre intenção, confirmação e escrita estruturada.

<!-- referências locais: início -->

## Referências

- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao): Brasil. Ministério da Educação (2026). **Referencial para Desenvolvimento e Uso Responsáveis de Inteligência Artificial na Educação.** Ministério da Educação.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
