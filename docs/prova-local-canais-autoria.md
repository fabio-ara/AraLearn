# Prova local de Actions e MCP

`npm run test:authoring:channels:local` executa o mesmo conteúdo sintético nos dois endpoints Edge da stack Supabase local. Reutiliza a autorização OAuth dos testes existentes e as fixtures do runner de autoria atual. O cliente é Node: esta prova não representa importação de OpenAPI no GPT, seleção de ferramentas pelo ChatGPT, revisão humana ou comportamento hospedado.

A stack deve estar iniciada, com as migrações atuais aplicadas e as funções Edge servindo a candidata. Configure `ARALEARN_SUPABASE_URL`, `ARALEARN_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` com a saída local de `supabase status -o json`, sem imprimir os valores. O runner rejeita URL que não seja HTTP em loopback. A chave administrativa serve somente para criar e remover a pessoa sintética e para a releitura independente; as tarefas dos canais usam tokens OAuth próprios dessa pessoa.

O consentimento de Actions espera a aplicação local em `http://127.0.0.1:4182`. Se a stack usar outra porta, defina `ARALEARN_LOCAL_APPLICATION_ORIGIN` com a origem local exata configurada na função. Esse valor também mantém a releitura independente coerente com os links da aplicação. O helper aceita somente HTTP em loopback e continua conferindo o destino do consentimento; não segue um destino externo inesperado.

Cada canal cria um curso privado descartável, uma fonte sintética com âncora e um mapa de seis microssequências. Produz dois lotes sucessivos, cada um com três microssequências, seis unidades e três Explicações previamente escritas. A aprovação do mapa é uma operação sintética da fixture e não aprova conteúdo de curso real. O fluxo não chama a aprovação humana do conteúdo.

Depois de cada lote, o runner lê a exportação pelo próprio canal até terminar a continuação. Reconstitui o JSON literal e o compara com o export da mesma revisão, lido independentemente pelo adapter sobre PostgREST. Confere contagens, texto integral de cada Explicação e preservação das unidades, apoio e registros de proveniência do primeiro lote depois do segundo. A comparação de proveniência usa a identidade da microssequência, pois a ordem do inventário de fontes não é a ordem curricular.

O recibo JSON de saída mede separadamente os argumentos, o corpo HTTP de requisição e o corpo HTTP de resposta: bytes UTF-8, unidades de código UTF-16 e pontos de código Unicode. Mede também o tempo entre o envio de cada tarefa e o término da leitura da resposta. Esse tempo não inclui o fluxo OAuth; não estima tempo humano nem desempenho do ChatGPT. Cabeçalhos e credenciais não entram na medição de tamanho. O cabeçalho de contrato observado acompanha cada operação, sem hash fixado no runner.

A limpeza remove somente os cursos criados pela execução, revoga/remove o cliente MCP sintético e exclui a pessoa de teste. O cliente de Actions pertence à pessoa sintética e é removido pela relação `ON DELETE CASCADE`. Uma falha de limpeza impede resultado de sucesso. A suíte integral não é disparada por esse comando.

Esta carga é representativa, não um limite universal de volume. O resultado de transporte não demonstra suficiência pedagógica. A matriz do catálogo inteiro e as conversas novas nos clientes efetivos continuam sendo gates separados da entrega.
