# Contratos do AraLearn

Os contratos do AraLearn protegem a fronteira entre interface, conversa, Edge
Functions e banco. Eles descrevem objetos e efeitos observáveis; a topologia de
tabelas, controles de concorrência e credenciais permanecem internos.

## Princípios

- O Curso corrente é a autoridade compartilhada.
- Uma escrita declara sua intenção e o estado lido.
- O servidor volta a verificar propriedade e versão.
- Resposta perdida pode ser recuperada por recibo temporário.
- Dados ausentes permanecem ausentes.
- Julgamento pedagógico não é apresentado como validação do banco.
- Contrato substituído não permanece como alias ou fallback público.

## Curso e estrutura

`aralearn.course.v1` representa a composição curricular validada usada em
Estudo e nas réplicas locais. Leituras de Autoria usam projeções menores:
descritor do Curso, páginas de entidades e inspeção de StudyUnits.

O plano corrente usa `aralearn.course-instructional-plan.v2`. Ele contém título,
objetivo, público, escopo, faixa heurística de Partes, resultados pretendidos,
AnalysisUnits, requisitos de evidência e Partes. A Parte contém posição, título,
intenção e Microssequências vinculadas.

Módulo, Lição, Microssequência e StudyUnit formam a hierarquia didática. Parte é
lote de autoria e não aparece como pai curricular.

## Desenho

`aralearn.course-design.v2` consulta configuração corrente por escopo.
`aralearn.course-design-change.v2` confirma uma definição ou restauração de
herança.

Os quatro parâmetros pedagógicos são identificados de forma estável. Direção
editorial e política de componentes permanecem campos distintos.

Uma StudyUnit produzida guarda:

- `aralearn.study-unit-design-snapshot.v1`, com o recorte aplicado de plano e
  configuração;
- `aralearn.study-unit-design-application.v1`, com novidades introduzidas,
  formas, componentes e prática observada.

Esses objetos são focais. Não reproduzem o Curso nem a execução que os criou.

## Fontes e PDFs

`aralearn.course-sources.v2` pagina o catálogo corrente e devolve, de forma
singular, a Fonte focal ou a atribuição corrente de um alvo.
Fonte e Âncora têm uma versão corrente usada para concorrência. Uma atribuição
relaciona o alvo atual a Fontes, papéis e Âncoras.

`aralearn.course-source-change.v1` confirma alterações bibliográficas,
ancoragem, proveniência e remoção de PDF.

A incorporação server-side usa:

- `aralearn.course-source-pdf-ingestion-preparation.v1` para o preparo curto;
- `aralearn.course-source-pdf-ingestion.v1` depois que bytes e vínculo foram
  confirmados;
- `aralearn.course-source-pdf-download.v1` para autorizar o serviço a emitir
  uma URL assinada de leitura.

O caminho e o resumo SHA-256 não são argumentos de uma tarefa humana. O serviço
os deriva dos bytes. Criar ou revisar a Fonte e vincular o PDF ocorre numa única
transação e avança a revisão do Curso uma vez.

`aralearn.course-study-citations.v1` entrega ao Estudo somente citação, endereço
permitido e seletor de Âncora necessários à Unit.

## Observações e revisão

`aralearn.course-anchored-annotation.v1` representa uma Observação com alvo,
categoria, estado, origem e versão. As projeções de página e mudança usam
`aralearn.course-anchored-annotation-page.v1` e
`aralearn.course-anchored-annotation-change.v1`.

Seleção de várias StudyUnits cria Observações independentes. Preparar revisão e
aplicar correções são casos de uso humanos sobre conteúdo corrente; não criam
um contrato permanente de lote ou de auditoria.

## Analytics

`aralearn.course-authoring-analytics.v2` contém:

- Curso e escopo selecionado;
- desenho quantitativo;
- autoria quantitativa corrente;
- dados ausentes;
- deep link opcional.

Não há páginas de fatos ou dicionário separado. O JSON baixado é o próprio
snapshot normalizado.

## Cópia pessoal e estado de Estudo

Uma pessoa com acesso ao Estudo não altera o Curso original. A primeira edição
contextual pode usar `aralearn.personal-course-copy-edit.v1` para criar sua
cópia privada e aplicar a mudança na mesma transação.

Progresso, posição e marcas para rever usam contratos pessoais e versões
separadas do Curso. Observações próprias têm sincronização distinta porque seu
texto, autorização e conflitos são diferentes.

## Catálogo humano de Autoria

MCP e Actions compartilham o catálogo `aralearn.human-authoring-tasks`, versão
2.0.5. O catálogo possui dezesseis tarefas: oito leituras e oito escritas.

Cada definição contém:

- nome e título;
- descrição com “quando usar” e “quando não usar”;
- schema de entrada humana;
- schema de resultado;
- hints de somente leitura, consequência e acesso externo.

O resultado comum possui `result`, `deepLink` e `nextDecision`. Um campo de
contexto pode acompanhar leituras sem alterar a mensagem curta.

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
`fonte` anexa ou reanexa o PDF a uma Fonte existente; `titulo` cria uma nova.

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
de composição, Fontes e Observações possuem limites próprios.

Exceder um limite não autoriza truncar conteúdo pedagógico. A solução é reduzir
o recorte técnico ou distribuir conteúdo por mais StudyUnits.

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
