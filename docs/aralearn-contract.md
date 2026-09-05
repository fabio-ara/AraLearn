# Contratos do AraLearn

Os contratos do AraLearn protegem a fronteira entre interface, conversa, Edge
Functions e banco. Eles descrevem objetos e efeitos observáveis; a topologia de
tabelas, controles de concorrência e credenciais permanecem internos.

## Princípios

- O curso corrente é a autoridade compartilhada.
- Uma escrita declara sua intenção e o estado lido.
- O servidor volta a verificar propriedade e versão.
- Resposta perdida pode ser recuperada por recibo temporário.
- Dados ausentes permanecem ausentes.
- Julgamento pedagógico não é apresentado como validação do banco.
- Contrato substituído não permanece como alias ou fallback público.

## Curso e estrutura

`aralearn.course.v1` representa a composição curricular validada usada em
Estudo e nas réplicas locais. Leituras de autoria usam projeções menores:
descritor do curso, páginas de entidades e inspeção de unidades de estudo.

O plano corrente usa `aralearn.course-instructional-plan.v3`. Ele contém título,
objetivo, público, pré-requisitos declarados, escopo, mapa curricular completo,
repertório acumulado, requisitos de evidência e partes operacionais. O mapa pode
estar ausente, em rascunho ou aprovado. Uma parte contém posição, título,
intenção, progressão local e vínculos com microssequências já existentes.

Módulo, lição, microssequência e unidade de estudo formam a hierarquia didática.
Parte é lote de autoria e não aparece como pai curricular. Salvar ou redimensionar
uma parte não cria nem reorganiza currículo.

A composição estrutural aceita `courseMetadata: {title, objective}` opcional,
inclusive sem alterações de entidades. Metadados, entidades e atribuições são
validados na mesma transação, com uma revisão esperada e um recibo de repetição.
As contagens da resposta continuam representando entidades. Esse campo não
pertence à edição focal de uma unidade de estudo.

A cobertura associa cada item obrigatório às microssequências previstas e às
unidades materializadas que o desenvolveram. O estado aprovado só é aceito para
um mapa completo quanto ao escopo declarado; nenhuma unidade de estudo é criada
como efeito dessa aprovação.

## Pessoas e acesso

`aralearn.person-profile.v2` contém UUID, identificador público escolhido, avatar
opcional e data de atualização. Não expõe e-mail nem segundo nome de exibição.
Identificadores usam ASCII minúsculo, 3–30 caracteres e extremos alfanuméricos;
o `@` inicial é aceito na entrada. Perfis ainda sem identificador exigem escolha.

`aralearn.course-list.v2` distingue `owned`, `shared` e `public`, com permissões
explícitas de editar e observar. Busca de pessoas exige curso próprio, prefixo
de ao menos dois caracteres e no máximo dez resultados; o grant confirma UUID
e identificador selecionados. Troca ou reutilização do identificador não
redireciona permissões já concedidas.

Cursos começam privados. Tornar público exige confirmação e política de acesso
a arquivos. Visitantes recebem somente projeções de estudo e não podem editar
nem registrar observações. Pessoas autenticadas com acesso podem enviar suas observações;
somente o proprietário altera o curso.

## Desenho

`aralearn.course-design.v3` consulta configuração corrente por escopo.
`aralearn.course-design-change.v3` confirma uma definição ou restauração de
herança.

O catálogo 1.2.0 define identidades, tipos, valores permitidos, unidades, grupos,
escopos e rótulos usados pela UI, pelas integrações e pela projeção SQL. Reúne
conteúdo, prática, conversa e cadência. Direção editorial e política de componentes
permanecem campos distintos. Alvos de palavras são flexíveis e não autorizam
compressão. Partes, lotes e pausas não são acoplados entre si.

Uma atribuição com `mode: automatic` pode ter `value: null`: trata-se de intenção
local de delegar a escolha, distinta da ausência de atribuição, que restaura
herança. Uma escolha automática aplicada exige valor tipado e motivo; fixações
de autoria e pesquisa não são substituídas pela calibração automática.
Conflitos com condições de pesquisa em escopos ancestrais bloqueiam a escrita
incompatível e a produção até serem resolvidos.

Perfis de autoria pertencem à conta. CRUD usa revisão corrente e recibo para
repetição do mesmo pedido. A prévia e a aplicação verificam as revisões do curso
e do perfil. Aplicar copia preferências de catálogo, conserva exceções por
padrão e remove somente exceções selecionadas que não sejam de pesquisa.
Reaplicar valores equivalentes não aumenta a revisão; conteúdo e snapshots
existentes ficam preservados. A cópia não mantém referência viva ao perfil.

Uma unidade de estudo produzida guarda:

- `aralearn.study-unit-design-snapshot.v2`, com o recorte aplicado de plano e
  configuração;
- `aralearn.study-unit-design-application.v1`, com ideias introduzidas, ideias
  estabelecidas utilizadas, formas, componentes e prática observada.

Esses objetos são focais. Não reproduzem o curso nem a execução que os criou.
Retomadas são identificadas quando a explicação mobiliza novamente uma ideia
estabelecida sem apresentá-la como nova. O plano deriva do estado corrente onde
cada ideia foi introduzida, usada ou retomada; não existe ledger paralelo.

O valor `default` de configuração exige resolução contextual automática pelo GPT
no escopo da microssequência ou unidade antes da produção. Uma definição
explícita do pesquisador prevalece sobre essa calibração.

O contrato fixa a ordem de decisões, os limites de aprovação e a fronteira
pública. Ele não transforma continuidade narrativa, redução de apoio ou outra
heurística pedagógica em estado obrigatório. Essas dimensões são realizadas
pela composição e pelos parâmetros existentes quando pertinentes.

## Fontes e PDFs

`aralearn.course-sources.v3` pagina o catálogo corrente e devolve, de forma
singular, a fonte focal ou a atribuição corrente de um alvo.
Fonte e âncora têm uma versão corrente usada para concorrência. Uma atribuição
relaciona o alvo atual a fontes, papéis e âncoras.

`aralearn.course-source-change.v1` confirma alterações bibliográficas,
ancoragem, proveniência e remoção de PDF.

A incorporação server-side usa:

- `aralearn.course-source-pdf-ingestion-preparation.v1` para o preparo curto;
- `aralearn.course-source-pdf-ingestion.v1` depois que bytes e vínculo foram
  confirmados;
- `aralearn.course-source-pdf-download.v1` para autorizar o serviço a emitir
  uma URL assinada de leitura.

O aplicativo recebe `aralearn.course-source-pdf-download.v2`, com referência
lógica do arquivo e URL temporária, sem caminho interno de Storage. A política
efetiva respeita a exceção do arquivo, depois a da fonte e depois a do curso;
essa autorização não torna o bucket público.

O caminho e o resumo SHA-256 não são argumentos de uma tarefa humana. O serviço
os deriva dos bytes. Criar ou revisar a fonte e vincular o PDF ocorre numa única
transação e avança a revisão do curso uma vez.

`aralearn.course-study-citations.v2` entrega ao Estudo citação, endereço
permitido, seletor e localização legível necessários à unidade, além de
referências lógicas dos anexos disponíveis. Trechos privados de verificação e
caminhos de Storage ficam fora dessa projeção.

## Áudio e ferramentas de estudo

Ferramentas são instâncias de pacotes de conteúdo em `content[]`, identificadas
por `manifest.tool` e ativadas por `toolInteraction.bind`. O núcleo oferece
abertura, foco, fechamento e serviços de acesso; cada pacote fornece a própria
interação. Áudio, calculadora, gramática, dicionário e leitura compartilham os
contratos de descoberta, normalização, materialização e edição dos demais
pacotes. Uma consulta instrucional não cria automaticamente uma atribuição de
fonte.

`aralearn.course-media.v1` oferece configuração de áudio na revisão solicitada
ou catálogo paginado exclusivo do proprietário. A configuração contém idioma,
velocidade, preferência de voz nativa, permissão para voz remota e serviço
opcional; não contém credenciais. Faixas nativas guardam texto, enquanto faixas
de arquivo guardam somente SHA-256, tamanho e tipo validados pelo serviço.

`aralearn.course-media-ingestion.v1` confirma o envio de WAV PCM ou MP3.
`aralearn.course-media-change.v1` confirma configuração e remoção. As mutações
usam revisão esperada, identidade da solicitação e recibo idempotente; o limite
conjunto de PDFs e áudios é verificado com reservas sob concorrência. Remoção e
exclusão de conta conservam intenção de limpeza recuperável no Storage privado.

`aralearn.course-media-download.v1` liga o endereço temporário ao curso, à
revisão, à Unidade e ao trio binário do arquivo. Estudantes só acessam arquivos
referenciados na Unidade corrente; visitantes também dependem da política
pública de arquivos do curso. O cliente confere tamanho, formato e hash antes
de criar um Blob local, que é descartado ao fechar a ferramenta. Não há URL de
Storage persistida no conteúdo nem cópia de bytes no IndexedDB. A configuração
nativa pode ser reutilizada offline somente na mesma revisão do curso e é
purgada quando o acesso é retirado.

## Observações e revisão

`aralearn.course-anchored-annotation.v1` representa uma observação com alvo,
categoria, estado, origem e versão. As projeções de página e mudança usam
`aralearn.course-anchored-annotation-page.v1` e
`aralearn.course-anchored-annotation-change.v1`.

Seleção de várias unidades de estudo cria observações independentes. Preparar revisão e
aplicar correções são casos de uso humanos sobre conteúdo corrente; não criam
um contrato permanente de lote ou de auditoria.

## Analytics

`aralearn.course-authoring-analytics.v2` contém:

- curso e escopo selecionado;
- desenho quantitativo;
- autoria quantitativa corrente;
- dados ausentes;
- deep link opcional.

Não há páginas de fatos ou dicionário separado. O JSON baixado é o próprio
snapshot normalizado.

## Recuperação de cópias próprias e estado de Estudo

O comando de criação automática de cópia por estudante foi retirado.
`aralearn.owned-course-copy-recovery.v1` consulta a prova migrada de uma intenção
anterior e retorna `confirmed`, `unchanged` ou `unresolved`. A confirmação exige
origem e edição compatíveis e propriedade atual do alvo; distingue versões
iniciais das atuais, sem reaplicar conteúdo. Cópias existentes continuam próprias
e rascunhos sem prova permanecem disponíveis para decisão explícita.

Progresso, posição e marcas para rever usam contratos pessoais e versões
separadas do curso. Observações próprias têm sincronização distinta porque seu
texto, autorização e conflitos são diferentes.
Visitantes reutilizam o armazenamento local em compartimento separado das
contas, sem enviar estado pessoal à nuvem nem registrar observações.

## Catálogo humano de Autoria

MCP e Actions compartilham o catálogo `aralearn.human-authoring-tasks`, versão
2.3.4. O catálogo possui dezessete tarefas: oito leituras e nove escritas.

Cada definição contém:

- nome e título;
- descrição com “quando usar” e “quando não usar”;
- schema de entrada humana;
- schema de resultado;
- hints de somente leitura, consequência e acesso externo.

O resultado comum possui `result`, `deepLink` e `nextDecision`. Um campo de
contexto pode acompanhar a continuação das chamadas sem virar texto do chat.

## Projeção MCP

`tools/list` publica diretamente o catálogo humano permitido pelo escopo OAuth.
`tools/call` valida o argumento antes do caso de uso e devolve texto breve mais
`structuredContent`. Recursos visuais são ligados somente às tarefas que têm um
consumidor atual.

O servidor identifica o catálogo por versão e hash. Depois de uma mudança, o app
precisa de **Refresh** e a conversa deve ser nova. Renovar o login OAuth é
necessário somente se a autorização ou a conta também mudar. Não há aliases de
ferramentas antigas.

## Projeção Actions

O gerador `buildChatGptActionOpenApi.mjs` cria uma operação HTTP por tarefa. O
OpenAPI conserva OAuth, hints e schemas importáveis e não duplica o catálogo.

`incorporar_pdf_como_fonte` adapta `openaiFileIdRefs` fornecido pelo ChatGPT. A
URL temporária do transporte é aceita apenas de origem autorizada e não entra no
schema que o modelo precisa preencher. A tarefa recebe exatamente um destino:
`fonte` anexa ou reanexa o PDF a uma fonte existente; `titulo` cria uma nova.

## Erros

Erros públicos distinguem:

- entrada inválida;
- autenticação ou autorização ausente;
- referência ambígua;
- objeto inexistente;
- conflito de estado;
- limite excedido;
- indisponibilidade transitória.

Uma resposta de erro informa se a operação pode ser retomada e qual decisão
humana falta. Detalhes internos do PostgreSQL e do Storage são traduzidos na
borda.

## Limites de tamanho

Cada camada limita corpo, resposta, listas e texto antes de alocar trabalho
desnecessário. PDFs aceitam até 20 MiB e são lidos como fluxo limitado. Páginas
de composição, fontes e observações possuem limites próprios.

Exceder um limite não autoriza truncar conteúdo pedagógico. A solução é reduzir
o recorte técnico ou distribuir conteúdo por mais unidades de estudo.

## Verificação

```powershell
npm run test:authoring:contract
npm run test:authoring:mcp
npm run test:authoring:actions
npm run validate:course-runtime
```

Os testes conferem catálogo, schemas, autorização, erros retomáveis, paridade de
transportes e integração com os casos de uso. O cliente real é validado em uma
conexão e conversa novas depois da publicação.
