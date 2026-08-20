# Estado corrente do produto

Esta página registra o estado observado em **2026-08-20**. Ela distingue
implementação, ligação entre camadas, acesso, uso e evidência. Um teste local
comprova o comportamento no ambiente testado; a coluna correspondente informa
quando ainda falta comprovação no serviço hospedado, no APK ou com pessoas.

O contrato corrente usa o Curso como identidade comum de Estudo, Autoria,
Pesquisa e Model Context Protocol (MCP). A revisão de banco declarada no
manifesto é `20260820101500`.

## Como ler a matriz

- **Existe:** há implementação identificável na revisão corrente.
- **Conectado:** interface, domínio, persistência e serviço participam do mesmo
  caso de uso.
- **Acessível:** informa quem pode chegar à capacidade e por qual superfície.
- **Uso verificado:** separa execução automatizada, uso em navegador e uso no
  serviço publicado.
- **Funciona:** resume a evidência técnica disponível.
- **Necessário:** indica se a capacidade resolve um problema atual.
- **Alinhamento:** compara a solução com a intenção corrente do produto.
- **Limites e destino:** registra o que a evidência ainda não autoriza afirmar e
  qual providência operacional permanece.

**Parcial** descreve uma ligação ou comprovação incompleta. Não significa
aproximação percentual de conclusão. Teste de software também não demonstra
aprendizagem, compreensão ou usabilidade humana.

## Matriz por caso de uso

| Caso de uso | Existe | Conectado | Acessível | Uso verificado | Funciona | Necessário | Alinhamento | Limites e destino |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| listar e abrir Cursos concretos | Sim | Lista paginada, controlador, rota, banco e MCP usam o mesmo `courseId` | Pessoa autenticada vê Cursos próprios e Cursos recebidos para Estudo | Testes e navegador local | Busca, paginação, retorno e vínculo direto abrem o mesmo Curso sem baixar toda a composição | Sim | Alto | A publicação desta revisão e a medição com cardinalidade hospedada ainda precisam de comprovação |
| estudar o Curso vivo | Sim | Revisão, entidades paginadas, composição validada, IndexedDB e mecanismo de renderização formam um único fluxo | Proprietário e pessoa com acesso direto | Testes focais e navegador local | Navegação curricular, prática, retorno, progresso, marcas de revisão e Fontes visíveis foram exercitados | Sim | Alto | Revalidar instalação e atualização do APK e a revisão hospedada; o funcionamento não prova eficácia educacional |
| continuar o estudo sem conexão | Sim | Composição já validada, estado pessoal e filas específicas permanecem no dispositivo | Pessoa que já sincronizou o Curso | Testes de reinício, reconexão e duas abas | A última revisão válida continua disponível; estado pessoal e Observações retomam o envio sem duplicação | Sim | Alto | Um dispositivo desconhecido com escrita antiga ainda não sincronizada não pode ser recuperado depois da migração que remove o armazenamento anterior |
| criar um Curso privado | Sim | Interface e MCP usam o mesmo domínio, API, transação e revisão | Pessoa autenticada torna-se proprietária | Testes locais | A criação idempotente produz identidade, metadados e plano inicial sob autorização | Sim | Alto | O padrão de 7 a 12 Partes é configurável e não constitui regra pedagógica |
| planejar e organizar por Partes | Sim | Planejamento, itens, Partes, vínculos de produção e atividade são lidos e alterados pelas duas interfaces | Proprietário | Testes locais | É possível editar campos do plano, criar, reordenar, dividir e unir Partes e mover Microssequências sem apagar conteúdo | Sim | Alto | Parte é unidade operacional; o dimensionamento adequado continua sujeito ao conteúdo e à avaliação |
| produzir uma Parte com assistência conversacional | Sim | O cliente conectado lê plano, parâmetros, componentes, Fontes e Observações e confirma etapas limitadas no servidor | Proprietário autenticado por OAuth | Testes de domínio, serviço e MCP | Etapas são retomáveis, idempotentes e transacionais; o progresso deriva do conteúdo confirmado | Sim | Alto | A interface visual prepara o pedido, mas não executa a produção sozinha; falta o ensaio final no cliente conversacional hospedado |
| configurar parâmetros e componentes didáticos | Sim | Área Parâmetros e MCP chamam a mesma resolução por escopo e a mesma operação atômica de política | Proprietário | Testes de domínio, banco, MCP e interface | Valor efetivo, origem, herança, preferência, disponibilidade e bloqueio permanecem inspecionáveis | Sim | Alto | Valores aplicados são fatos declarados de desenho; não medem qualidade ou aprendizagem |
| descobrir e validar componentes didáticos | Sim | Navegador e função remota usam o mesmo catálogo gerado e recuperam um contrato versionado por consulta | Proprietário na Autoria e no MCP | Auditoria dos 32 pacotes, testes do núcleo, função remota e MCP | A busca devolve até oito candidatos; 22 pacotes são mantidos e 10 possuem restrições de uso declaradas | Sim | Alto | Disponibilidade técnica e adequação contextual são relações distintas; o uso real continua concentrado em poucos componentes |
| percorrer Unidades na Inspeção | Sim | Consulta paginada, janela vertical, posição local e endereços diretos usam a revisão fixada do Curso | Proprietário | Navegador em 360, 390, 430 e 1280 px; claro, escuro, movimento reduzido e duas abas | Páginas de 12 Unidades, janela de até 36, retorno exato, reconexão e atualização localizada possuem cobertura | Sim | Alto | Respostas ficam inertes; inspeção rápida não constitui medida de atenção ou qualidade da revisão humana |
| manter perfil e compartilhar para Estudo | Sim | Perfil, avatar privado, acesso direto, lista de Estudo e MCP usam a mesma autorização | Proprietário concede ou revoga; favorecido recebe somente Estudo | Testes locais com duas identidades | Nome, foto, concessão e revogação possuem operações idempotentes e proteção no banco | Sim | Alto | Não há grupos, organizações, convite pendente ou coautoria; validar mensagens e avatar em aparelhos reais |
| excluir a própria conta | Sim | O aplicativo envia uma solicitação confirmada; a API autentica a pessoa, deriva seus Cursos e caminhos privados, remove PDFs e avatares e chama a função transacional, que recusa resíduos antes de excluir a conta e seus Cursos | Somente a própria pessoa, após confirmação literal | Testes de API, controlador e banco | A operação falha sem excluir a conta quando resta um objeto privado; confirmação, ordem de bloqueio, limpeza física e remoção relacional possuem cobertura | Sim | Alto | Exige conexão; uma URL de envio de PDF ou sessão ainda válida pode criar objeto órfão depois da exclusão, por isso a operação hospedada exige inventário posterior às duas janelas |
| registrar Observações situadas | Sim | Estudo, Autoria e MCP usam Anotação ancorada, versões, fila local e persistência protegida | Estudante vê somente as próprias; proprietário recebe a caixa de entrada | Testes de banco, repositório, reconexão, duas abas e navegador | Texto original, alvo, revisão, canal, estado, resposta e classificação corrigível permanecem rastreáveis | Sim | Alto | Ausência, quantidade, categoria e tempo de tratamento não diagnosticam compreensão, dificuldade ou aprendizagem |
| registrar Fontes, Âncoras e proveniência | Sim | Interface, MCP, banco e leitura redigida em Estudo compartilham identidades e revisões | Catálogo e edição pertencem ao proprietário; Estudo recebe apenas citações autorizadas | Testes focais e fluxo local com PostgreSQL e armazenamento de objetos | Metadados estruturados, relações, Âncoras, referências importadas e aplicação por alvo possuem contratos comuns | Sim | Alto | Proveniência identifica origem e transformação; não prova correção factual ou autoria científica |
| anexar PDF a uma Fonte | Sim | Envio direto assinado, confirmação transacional, vínculo à revisão da Fonte e transferência autorizada formam o fluxo | Proprietário | Testes de banco, armazenamento de objetos, deduplicação, autorização e limites | PDF de até 20 MiB, no máximo oito por revisão de Fonte e 64 MiB de conteúdo único por Curso; impressões digitais SHA-256 iguais reutilizam os bytes quando permitido | Sim | Alto | O serviço hospedado ainda precisa da migração e da verificação pós-publicação; fora da exclusão integral da conta, retirar bytes sem vínculo exige política de retenção e prova de segurança |
| auditar, corrigir e verificar uma Unidade | Sim | Contexto focal, rodada, achado, proposta, comparação, aplicação, nova rodada e reversão usam o mesmo ciclo na interface e no MCP | Proprietário | Testes de domínio, banco, MCP e navegador | Quatro dimensões, evidência por Fonte e Âncora, concorrência, confirmação, métricas do ciclo e endereços diretos possuem cobertura | Sim | Alto | A correção corrente altera conteúdo e Fontes da Unidade focal; auditoria factual mantém incerteza quando a evidência não sustenta conclusão |
| criar e comparar variantes | Sim | Área Variantes e MCP usam ponto comum de planejamento, Cursos independentes e comparação factual | Proprietário | Testes de domínio, PostgreSQL e navegador nos tamanhos de referência | De duas a oito variantes conservam diferenças declaradas, revisões, produção, Fontes, PDFs e desvinculação sem excluir Curso | Sim | Alto para comparação descritiva | Não há participantes, atribuição, desfecho ou inferência causal; uma comparação técnica não equivale a experimento |
| consultar fatos de Autoria em Pesquisa | Sim | Banco, domínio, API, painel, exportação e MCP usam o mesmo recorte versionado | Proprietário | Testes de domínio, PostgreSQL, interface e MCP | Sete conjuntos de fatos, filtros, paginação, gráfico, tabela, CSV, JSON, denominador e dados ausentes usam os mesmos valores | Sim | Alto | Os fatos descrevem Autoria; não incluem telemetria comportamental de Estudo nem medem aprendizagem |
| pedir análise e visualização no cliente conversacional | Sim | A vista de Pesquisa do MCP fornece conteúdo estruturado, representação textual, componente visual opcional e endereços para o AraLearn | Proprietário conectado por OAuth; a forma visual depende do suporte do cliente | Testes locais do servidor MCP e do componente | Tabela e gráfico derivam do mesmo contrato; a operação continua útil sem componente visual | Sim | Alto | Falta a verificação final numa sessão real do cliente conectado e no serviço publicado |
| operar dentro dos limites gratuitos do Supabase | Parcial | Paginação, limites de resposta, anexos deduplicados e consultas sob demanda reduzem banco, armazenamento, transferência e funções remotas | Operação administrativa, sem painel próprio | Limites oficiais e cenários locais foram registrados | A arquitetura evita depósito analítico, processamento periódico, cópia de Curso por edição e um objeto por Unidade | Sim | Alto | Medir tamanho, transferência, invocações, latência e crescimento depois da migração hospedada e da remoção autorizada das estruturas substituídas |
| manter somente a arquitetura corrente | Parcial | O código de execução, a interface, o MCP e os testes correntes usam Curso; módulos substituídos de autoria e sincronização genérica foram retirados | Não é uma capacidade exposta | Busca estática e inventário vertical | O saldo no repositório é negativo em tabelas conceituais, rotas, módulos, ferramentas e testes | Sim | Alto | Estruturas físicas substituídas ainda exigem backup restaurado, plano exato e autorização específica antes da remoção remota |
| publicar a revisão integrada | Ainda não | Versão web, Android, manifesto, migrações, funções remotas, Pages e versão publicada formam uma única etapa de validação | Pessoas usuárias somente depois da publicação | A linha pública anterior continua sendo a referência hospedada | A automação de construção e verificação existe | Sim | Alto | Concluir a suíte integral, a inspeção visual real, o ensaio de recuperação e os testes hospedados antes de declarar esta revisão publicada |

## Relações do Curso vivo

**Descrição textual:** um Curso possui identidade e revisão próprias. O plano e
a composição pertencem a essa identidade; estado pessoal, Observações, Fontes,
auditorias, variantes e fatos de Pesquisa mantêm relações próprias. Estudo,
Autoria e MCP consultam o mesmo objeto.

```mermaid
flowchart TD
    C[Curso vivo] --> H[Composição didática]
    H --> MO[Módulos]
    MO --> LI[Lições]
    LI --> MI[Microssequências didáticas]
    MI --> U[Unidades de estudo]
    C --> P[Plano instrucional]
    P --> PA[Partes de autoria]
    C --> F[Fontes e Âncoras]
    F -->|atribuição ao plano| P
    F -->|atribuição ao conteúdo| U
    C --> O[Observações situadas]
    C --> A[Auditorias, achados e correções]
    O -. vínculo opcional .-> A
    C --> V[Variantes comparáveis]
    C --> R[Fatos de Pesquisa]
    C --> PE[Proprietário e acessos de Estudo]
    C --> ES[Estado pessoal por pessoa]
    AU[Autoria] <--> C
    MCP[Cliente conectado por MCP] <--> C
    E[Estudo] <--> C
```

## Carregamento e autoridade

**Descrição textual:** a lista inicial recebe apenas descritores. Ao abrir um
Curso, a aplicação fixa uma revisão, pagina as entidades, recompõe e valida o
documento e só então atualiza o IndexedDB. Fontes, auditoria, variantes e
Pesquisa possuem leituras próprias, limitadas e autorizadas.

```mermaid
flowchart LR
    L[Lista paginada] --> O[Abrir Curso]
    O --> D{Destino}
    D --> R[Fixar revisão]
    R --> E[Paginar entidades]
    E --> V[Compor e validar]
    V --> I[IndexedDB]
    I --> S[Estudo]
    D --> P[Planejamento e Parâmetros]
    D --> IN[Inspeção paginada]
    D --> F[Fontes e PDFs]
    D --> A[Auditoria e correções]
    D --> VA[Variantes]
    D --> Q[Pesquisa]
```

## Evidência visual

A captura móvel de Estudo em 390 por 844 px documenta a composição de conteúdo
e controles usada como referência:

![Unidade de estudo em tela móvel clara, com conteúdo central e controles
iconográficos.](screenshots/study/study-card-390-light.png)

A lista móvel de Autoria, também em 390 por 844 px, documenta a entrada dos
Cursos próprios:

![Lista de Cursos da Autoria em tela móvel clara, com busca, criação e três
Cursos.](screenshots/authoring/authoring-courses-390-light.png)

Capturas anteriores de outras superfícies não definem o estado atual. A
documentação só adota uma nova imagem depois de conferir a aplicação real em
360, 390 e 430 px e em 1280 px, nos modos claro e escuro, com texto extenso,
teclado e interação.

## Condições restantes para publicação

O código corrente já reúne as capacidades funcionais do Curso vivo. A publicação ainda
depende dos seguintes resultados operacionais:

1. reconstrução limpa do banco e aprovação de migrações, RLS, pgTAP, funções
   remotas, MCP, navegador e Android;
2. conferência do inventário, contagens e impressões digitais da migração dos
   Cursos existentes;
3. verificação visual real em celular e computador, inclusive sobreposições,
   área segura, textos extensos e retomada;
4. comprovação no serviço hospedado de autenticação, Estudo, Autoria, Fontes,
   Pesquisa, MCP e endereços diretos;
5. medição final de banco, armazenamento, transferência e funções remotas;
6. alinhamento de versão, manifesto, site, APK e publicação.

A remoção física remota das estruturas substituídas possui uma validação
própria. Ela requer exportação, contagens e impressões digitais, restauração em
ambiente descartável, estratégia de recuperação e autorização específica. Essa
cautela não impede a validação e a publicação das partes não destrutivas da
entrega.
