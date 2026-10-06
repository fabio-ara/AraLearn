# Prova local de Actions e MCP

A prova local confere se pedidos enviados pelos dois canais de autoria chegam aos
serviços e se o conteúdo salvo pode ser recuperado por inteiro. O programa usa
[Node.js](https://nodejs.org/en/about), que executa JavaScript fora do navegador,
para enviar o mesmo caso de teste a [Actions](autoria-actions.md) e
[MCP](autoria-mcp.md). Actions descreve operações no formato OpenAPI; MCP permite
que uma aplicação descubra e chame ferramentas. Os serviços são executados no
[Supabase local](supabase.md), com conta e cursos de teste descartáveis.

O teste cobre a comunicação e a gravação dos dados, chamadas de transporte e
persistência. A importação do OpenAPI em um cliente real, a escolha de ferramentas
pelo assistente e a realização das tarefas por uma pessoa pertencem ao
[roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).

<a id="preparar-o-ambiente"></a>

## Preparar e executar

Inicie os serviços locais conforme o [guia do desenvolvedor](guia-desenvolvedor.md#preparação).
As migrações, que atualizam a estrutura e as funções do banco, devem estar
aplicadas. As Edge Functions — os serviços que recebem os pedidos — precisam
executar a versão candidata.

Configure `ARALEARN_SUPABASE_URL`, `ARALEARN_SUPABASE_PUBLISHABLE_KEY` e
`SUPABASE_SECRET_KEY` a partir da saída local de `supabase status -o json`, sem
publicar seus valores. O programa aceita somente endereços HTTP com
`127.0.0.1` ou `localhost` e porta explícita. Esses endereços de loopback apontam
para a própria máquina e impedem que a prova seja dirigida ao serviço hospedado.

A chave administrativa cria e remove a conta sintética e permite uma leitura
independente do resultado. Durante a autoria, os canais usam tokens OAuth dessa
conta: credenciais emitidas pelo processo de autorização do cliente. Assim, a
produção percorre os controles de acesso dos canais. A chave administrativa fica
restrita à preparação, à conferência independente e à limpeza do caso.

O consentimento de Actions espera o aplicativo local em
`http://127.0.0.1:4182`. Se o ambiente usar outra porta, defina
`ARALEARN_LOCAL_APPLICATION_ORIGIN` com a origem exata configurada na função.
Esse valor mantém a leitura independente coerente com os links do aplicativo.
O auxiliar de teste confere o destino do consentimento e aceita apenas HTTP local.

Na raiz do repositório, execute:

```sh
npm run test:authoring:channels:local
```

O comando executa [o caso local dos canais](../supabase/tests/course-authoring-channels-local-smoke.mjs),
sem disparar a suíte integral. Ao terminar com sucesso, escreve no terminal um
relatório em JSON, formato estruturado de dados.

## Produzir e reler

No [modelo didático](modelo-didatico.md), cada microssequência reúne uma
explicação de apoio e unidades de estudo voltadas a um objetivo. Cada canal cria
um curso privado descartável com um mapa de seis microssequências. Registra
também uma fonte sintética com âncora: o registro identifica o material, e a
âncora localiza um trecho, conforme o [modelo de fontes](fontes-e-citacoes.md).

Duas partes de autoria agrupam três microssequências cada. Cada parte é produzida
em três chamadas sucessivas, com uma microssequência, duas unidades e uma
explicação por chamada. As duas primeiras mantêm a produção parcial; a terceira
conclui a parte. A aprovação do mapa é uma decisão simulada do caso de teste;
a revisão humana do conteúdo permanece sem declaração.

Depois de concluir cada parte, o programa lê todas as páginas da exportação pelo
próprio canal. Reconstitui o JSON literal, preservando campos e textos, e o compara
com a exportação da mesma revisão obtida por uma leitura independente do banco.
Essa segunda leitura usa o adaptador do produto sobre PostgREST, serviço que
expõe operações do PostgreSQL pela Web.

A comparação confere contagens, texto integral de cada explicação e preservação
das unidades, bases e vínculos com fontes da primeira parte depois da segunda.
A atribuição das fontes é comparada pela identidade da microssequência,
conservando a correspondência mesmo quando as listas têm ordens diferentes.

<a id="medir-e-encerrar"></a>

## Interpretar as medidas

O relatório mede separadamente os argumentos da tarefa, o corpo do pedido HTTP
e o corpo da resposta. Para cada um, registra bytes UTF-8, unidades de código
UTF-16 e pontos de código Unicode. São medidas diferentes do mesmo texto:
tamanho em bytes, unidades usadas pela representação do JavaScript e quantidade
de pontos de código. Por exemplo, `𝑥` ocupa quatro bytes em UTF-8 e duas unidades
de código UTF-16, mas representa um único ponto de código Unicode. A comparação
com um limite precisa usar a unidade de medida em que esse limite foi definido.

Cabeçalhos e credenciais ficam fora dessa medição. A identificação do contrato
é lida da resposta e acompanha cada operação, em vez de usar um hash fixado no
programa de teste. O tempo medido começa no envio da tarefa e termina ao concluir
a leitura da resposta. A autorização OAuth, a geração pelo assistente e o trabalho
da pessoa autora ficam fora desse intervalo.

## Conferir a limpeza e o resultado

A limpeza remove somente os cursos criados pela execução, revoga e remove o
cliente MCP sintético e exclui a conta de teste. O cliente de Actions é removido
pela relação `ON DELETE CASCADE`, que apaga o registro dependente quando a conta
sintética é excluída. Uma falha de limpeza impede o resultado de sucesso e
preserva as identidades pendentes para investigação.

A execução bem-sucedida confirma a produção, a recuperação e a preservação do
conteúdo nesse caso reproduzível. Determinar o volume máximo dos canais exige
outras cargas de teste. Avaliar a suficiência pedagógica exige examinar conteúdo,
público e objetivos. A cobertura de todas as ferramentas e as conversas novas nos
clientes reais seguem o [roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).
