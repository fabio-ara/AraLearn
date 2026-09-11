# Prova local de Actions e MCP

`npm run test:authoring:channels:local` verifica se o mesmo conteúdo de teste é
produzido e recuperado pelos dois canais de autoria. Ele envia pedidos aos
serviços de [Actions](autoria-actions.md) e [MCP](autoria-mcp.md) executados no
[ambiente Supabase local](supabase.md), sem acessar cursos reais.

O programa de teste usa [Node.js](https://nodejs.org/en/about), ambiente que
executa JavaScript fora do navegador. Essa prova verifica transporte e persistência;
a importação do OpenAPI, a escolha de ferramentas por um assistente e a jornada
humana nos clientes reais são verificações separadas.

## Preparar o ambiente

O conjunto de serviços locais deve estar iniciado, com as migrações atuais
aplicadas e as Edge Functions — os serviços que recebem os pedidos — executando
a versão candidata. Configure `ARALEARN_SUPABASE_URL`,
`ARALEARN_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` a partir da saída
local de `supabase status -o json`, sem publicar seus valores. O programa aceita
somente endereços HTTP de loopback, que apontam para a própria máquina.

A chave administrativa é usada para criar e remover a pessoa sintética e fazer
uma leitura independente do resultado. As tarefas de autoria usam tokens OAuth
próprios dessa pessoa. OAuth é o mecanismo de autorização do cliente; assim, a
prova percorre os controles dos canais durante a produção, em vez de gravar o
conteúdo com a chave administrativa.

O consentimento de Actions espera o aplicativo local em
`http://127.0.0.1:4182`. Se o ambiente usar outra porta, defina
`ARALEARN_LOCAL_APPLICATION_ORIGIN` com a origem exata configurada na função.
Esse valor também mantém a leitura independente coerente com os links do
aplicativo. O auxiliar de teste continua aceitando apenas HTTP local e
conferindo o destino do consentimento.

## Produzir e reler

Cada canal cria um curso privado descartável, uma fonte sintética com âncora e
um mapa de seis microssequências. Produz dois lotes sucessivos, cada um com três
microssequências, seis unidades e três explicações fornecidas no pedido de
materialização. A aprovação do mapa pertence ao caso de teste; o fluxo não declara revisão humana
do conteúdo.

Depois de cada lote, o programa lê a exportação pelo próprio canal até terminar
a continuação. Reconstitui o JSON literal, formato estruturado que conserva os
campos e textos, e o compara com a exportação da mesma revisão obtida por uma
leitura independente do banco. Essa segunda leitura usa o adaptador do produto
sobre PostgREST, serviço que expõe operações do PostgreSQL pela Web.

A comparação confere contagens, texto integral de cada explicação e preservação
das unidades, bases e vínculos com fontes do primeiro lote depois do segundo.
A atribuição das fontes é comparada pela identidade da microssequência, pois a
ordem do catálogo de fontes não é a ordem curricular.

## Medir e encerrar

O recibo JSON mede separadamente os argumentos da tarefa, o corpo do pedido
HTTP e o corpo da resposta. Para cada um, registra bytes UTF-8, unidades de
código UTF-16 e pontos de código Unicode. Essas medidas distinguem tamanho em
bytes, representação usada pelo JavaScript e caracteres codificados, evitando
comparar limites de unidades diferentes. Cabeçalhos e credenciais ficam fora
dessa medição. A identificação do contrato observado acompanha cada operação,
sem um hash fixado no programa de teste.

O tempo medido começa no envio da tarefa e termina ao concluir a leitura da
resposta. Ele não inclui a autorização OAuth nem representa o tempo de geração
do assistente ou o trabalho da pessoa autora.

A limpeza remove somente os cursos criados pela execução, revoga e remove o
cliente MCP sintético e exclui a pessoa de teste. O cliente de Actions é removido
pela relação `ON DELETE CASCADE`, que apaga o registro dependente quando a pessoa
sintética é excluída. Uma falha de limpeza impede o resultado de sucesso. Esse
comando não dispara a suíte integral.

A carga delimita um caso reproduzível, sem definir o volume máximo dos canais
ou a suficiência pedagógica do conteúdo. A matriz do catálogo inteiro e as
conversas novas nos clientes efetivos continuam etapas próprias do
[roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).
