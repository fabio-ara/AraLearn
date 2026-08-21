# Auditoria da interface

Auditar a interface significa verificar se a pessoa consegue localizar,
estudar e alterar o que lhe pertence sem conhecer detalhes internos do sistema.
Não basta encontrar elementos no DOM: é preciso provar conexão com o domínio,
persistência, autorização, rede e comportamento real.

## 1. Método

Cada requisito é examinado em seis níveis:

1. **semântica:** o controle representa a tarefa anunciada;
2. **conexão:** a interação alcança o domínio e o serviço corretos;
3. **autoridade:** interface, Edge Function e PostgreSQL impõem o mesmo limite;
4. **estado:** carregamento, vazio, ausência de conexão, conflito e falha são distinguíveis;
5. **interação:** toque, teclado, foco, retorno e rolagem funcionam;
6. **proporcionalidade:** DOM, volume de dados, cópia local e chamadas têm limites verificáveis.

As evidências possuem alcances diferentes:

| Evidência | O que demonstra | O que não demonstra |
| --- | --- | --- |
| inspeção de código | responsabilidade e fluxo previsto | execução no navegador |
| teste unitário | regra isolada | geometria e integração completas |
| teste de navegador | jornada e medidas no motor real | compreensão humana prolongada |
| PostgreSQL real | restrições, concorrência e privilégios | disponibilidade hospedada futura |
| avaliação com pessoas | compreensão e carga percebida na amostra | ausência geral de defeitos |

Uma alegação só é confirmada dentro do alcance da evidência usada.

## 2. Navegação corrente

```text
Shell
├── Estudo
│   └── Curso → Módulo → Lição → Microssequência → Unidade de estudo
├── Autoria
│   └── Curso próprio
│       ├── poucos destinos conceituais compactos
│       └── capacidades reveladas por objeto e tarefa
│           ├── planejar, parametrizar e acompanhar Partes
│           ├── percorrer, inspecionar, editar, anotar e conferir Fontes
│           ├── auditar, corrigir, verificar e reverter
│           └── compartilhar, comparar Variantes e consultar Pesquisa
└── Conta e aparência
```

Estudo lista Cursos próprios e compartilhados. Autoria lista somente Cursos
próprios; receber acesso direto não concede edição. O seletor Estudo/Autoria
muda a tarefa sem criar outra identidade de Curso.

O vocabulário visível usa Curso, Parte, Módulo, Lição, Microssequência e Unidade
de estudo. Revisão CAS, cursor, hashes e nomes de RPC pertencem ao protocolo e
só aparecem quando necessários ao diagnóstico.

## 3. Tela inicial, Estudo e estado pessoal

A tela inicial usa listas finas paginadas. Um item informa o necessário para localizar
e abrir o Curso, sem baixar milhares de Unidades. Ao entrar em Estudo, o cliente
fixa uma revisão, lê páginas de entidades, recusa mistura entre revisões,
recompõe `aralearn.course.v1` e só então substitui a cópia local válida.

O percurso de Estudo apresenta uma Unidade por vez. Resposta e feedback são
locais ao ciclo corrente; avançar não espera a persistência remota. Progresso e
marcas para rever formam o estado pessoal v2. Anotações ancoradas próprias usam
persistência separada; nenhum desses fluxos incrementa a revisão autoral do
Curso apenas por continuidade ou triagem.

Sem rede, conteúdo íntegro já carregado pode continuar em Estudo. Estado pessoal
e Anotações ancoradas possuem filas separadas para uso sem conexão. Alteração autoral fora
desse contrato não simula sucesso quando o servidor ou a revisão corrente não
estão disponíveis.

O proprietário coordena a caixa de entrada pela versão global. Estudo coordena
cópia local, paginação e duas abas por uma versão monotônica privada da própria
projeção; atividade de terceiros não muda esse valor nem se torna observável.

## 4. Autoria

### Comparação com a linha anterior ao corte 2.0

A auditoria tomou a revisão
`9e7ddc013d8efcf2918bf2b5b03f506217098e15`, que declarava a versão 0.0.20,
como linha de comparação funcional. O objetivo não foi recuperar sua
arquitetura, mas identificar comportamentos úteis perdidos durante o corte e
reimplementá-los sobre o domínio vigente.

| Capacidade observada na 0.0.20 | Decisão na candidata corrente |
| --- | --- |
| edição diretamente nos textos renderizados do Card | restaurada nos campos textuais declarados pelos componentes da Unidade de estudo, usando o renderer corrente em Estudo e Inspeção |
| assistência contextual com serviço de linguagem configurado no aplicativo | restaurada como sugestão focal complementar; produção usa relay local com a credencial externa, recorte mínimo, prévia e validação antes de aplicar ao rascunho |
| desfazer e refazer alterações locais | mantidos no rascunho da sessão; a reversão persistida continua sendo uma operação auditável do domínio corrente |
| prática, progresso, temas, uso sem conexão e retorno ao ponto de estudo | preservados no Estudo corrente e protegidos por testes próprios |
| Workspace, publicação e rotas autorais anteriores | deliberadamente não restaurados; Curso e Unidade de estudo continuam sendo as identidades canônicas |
| persistência de conversa, configuração antiga e editor paralelo | deliberadamente não restaurados; produção mantém a credencial no relay externo, a conversa é transitória e toda mudança usa o editor, a validação, a API e o banco correntes |

Essa comparação impede tanto apagar capacidades úteis durante uma troca de
modelo quanto reintroduzir contratos sem consumidor apenas porque existiam na
versão anterior.

### Planejamento

Planejamento edita título, objetivo, público, escopo, faixa preferencial, itens
e Partes em linguagem natural. Criar, dividir, unir,
reordenar ou retirar uma Parte não altera implicitamente a hierarquia didática.
O compositor do ChatGPT conserva alvo, intenção, argumento e endereço de
retorno. Copiar um pedido não inicia materialização, não grava progresso e não
altera a cópia local.

### Parâmetros

Parâmetros percorre Curso, Módulo, Lição e Microssequência e separa valor
efetivo, atribuição local, orientação original, interpretação e política de
componentes. Numa Microssequência, a cobertura planejada oferece controles de seleção
para atribuir unidades de análise e requisitos de evidência. O estado visual é
a relação muitos-para-muitos real: não apresenta o plano inteiro como se todo
item pertencesse a todo alvo e não exige JSON.

### Fontes

A área Fontes mantém catálogo privado, revisões, Âncoras e atribuições. O envio de PDF
ocorre em duas fases: a API de Cursos autoriza o objeto, o navegador o envia ao
Storage privado e uma operação relacional confirma o vínculo. A interface não
trata um arquivo enviado, mas ainda não confirmado, como parte do Curso.

### Estrutura

Estrutura apresenta Módulos, Lições e Microssequências em páginas compactas.
Ela serve para localização; não duplica a sequência de leitura da Inspeção.

### Inspeção

Inspeção apresenta uma sequência vertical fiel de Unidades, com a prática
desativada. O proprietário pode ativar a edição manual ou a assistência por API
somente nos campos textuais que o componente declara editáveis. O filtro aceita
Curso, Parte, Unidades sem Parte, Módulo, Lição ou Microssequência. Um link
profundo usa âncora inclusiva; páginas posteriores e anteriores usam cursor
`{studyUnitId}`. Âncora e cursor são mutuamente exclusivos.

A interface pede 12 itens por página, admite resposta de até 24 e mantém no DOM
no máximo 36 Unidades. Itens distantes viram espaçadores, e a busca ocorre nas
duas direções. O contexto fixo, foco, controles abertos e posição visual não
devem saltar quando a janela muda.

A posição local conserva escopo, `studyUnitId`, deslocamento em relação ao topo
fixo e revisão. Atualização concorrente reancora pela identidade; alvo removido
explicitamente é informado como ausente. Coordenação entre abas não interrompe
uma interação recente.

O armazenamento temporário distingue revisão e pedido completo, inclusive escopo, âncora ou cursor,
direção, limite e `maxBytes`. Conserva no máximo quatro páginas ou 8 MiB por
Curso. Sem rede, somente a página exata pode reaparecer, marcada como sem conexão ou
desatualizada. Revogação ou outra perda de autoridade purga página e posição.

### Edição manual e assistência por API

Estudo e Inspeção instanciam o mesmo editor contextual sobre o mesmo renderer.
A interface não converte a Unidade em um formulário genérico: ativa somente os
trechos autorizados pelo contrato do componente, recompõe respostas associadas
quando a relação é inequívoca e valida o envelope completo antes de salvar.
Pessoa com acesso apenas a Estudo não recebe os comandos de edição.

A assistência complementar usa o mesmo alvo e o mesmo rascunho. O aviso antes do
envio enumera pedido, valores textuais editáveis, título da Unidade, papel
pedagógico, tópicos e mensagens anteriores. Fontes, PDFs, outras Unidades,
`targetId`, `studyUnitId` e chaves não integram o envelope. A saída estruturada
só pode devolver `changes` com no máximo um caminho autorizado e precisa formar
uma Unidade válida. A pessoa examina a sugestão no renderer, aplica ao rascunho
ou descarta e ainda confirma a gravação pelo fluxo manual.

Cada valor editável da chamada admite até 6.000 caracteres, o conjunto até
12.000 e a resposta até 8.000 tokens. A disponibilidade é calculada antes de
abrir a sobreposição. Em código ou terminal extensos, o botão desabilitado
expõe o motivo em `aria-label` e `title`, enquanto **Editar** continua ativo.

Em produção, somente o relay local aparece: `127.0.0.1`, `localhost` ou
`10.0.2.2`, na porta 4183. A credencial do provider fica configurada nesse
serviço, fora do AraLearn. **Serviço local** aparece fixo; a pessoa informa
modelo e pedido, e o endpoint fica recolhido em **Conexão**. Fechar a
sobreposição limpa conversa, instrução e candidata. Um runtime explícito de desenvolvimento pode exibir providers
remotos e campo de chave, acompanhado do alerta de que o navegador não protege
credenciais duradouras. A chave fica apenas em memória e segue no cabeçalho;
cada provider aceita somente sua própria origem. O verificador do site, a
política de conteúdo e o verificador de artefatos precisam concordar sobre o
modo e a lista exata de origens.

### Discussões e correções

A área separa Observações, rodadas, achados e correções. Responder ou resolver
uma Observação não altera conteúdo. Aplicar uma correção exige confirmação,
conserva o estado anterior e ainda precisa de outra rodada para verificar o
critério focal. Essas operações exigem conexão.

### Variantes

A área Variantes cria Cursos independentes a partir de um mesmo ponto do planejamento
e compara diferenças declaradas, fatos correntes e desvios. Desvincular uma
variante não exclui o Curso. A interface não apresenta a comparação como
experimento nem como evidência de aprendizagem.

### Pesquisa

Pesquisa apresenta fatos da Autoria, definições de métricas, filtros, gráfico,
tabela equivalente e exportação. A mesma consulta está disponível no MCP. A
interface preserva denominador, dados ausentes e limites de interpretação e
não transforma contagens descritivas em conclusão causal.

### Pessoas

O proprietário concede Estudo por e-mail exato de uma conta existente e revoga
pelo identificador retornado. Não há diretório, papel de coautoria ou convite
pendente. A confirmação e a mensagem precisam distinguir acesso para Estudo de
autoridade autoral.

### Rascunho, foco e repetição

Uma renderização provocada por validação, carregamento auxiliar ou falha de
rede não pode converter trabalho digitado em valores persistidos antigos. Os
painéis de Parâmetros, Fontes, Variantes, Observações, Inspeção e Auditoria
conservam valores, seções abertas e o foco pertinente. Cancelar ou descartar
remove o rascunho; uma atualização remota é adiada enquanto ele estiver ativo.

Quando a conexão termina sem resposta depois de uma escrita, o painel conserva
também o envelope pendente. Reenviar pelo formulário efetivamente renderizado,
sem alterar os campos, precisa repetir o mesmo comando, revisão esperada,
identidades geradas e `requestId`. Essa verificação cobre a interação natural,
e não uma segunda chamada artificial sobre um formulário já retirado do DOM.

Confirmações de alterações sensíveis são diálogos do produto, com nome do
objeto, alcance e verbo correspondente à consequência. Elas contêm a navegação
por Tab, aceitam Esc e clique externo quando cancelar é seguro e devolvem o foco
ao acionador. A releitura de uma operação já confirmada pelo MCP não abre um
segundo diálogo.

## 5. Paridade entre interface e MCP

A vista MCP `study_units` usa a mesma leitura exclusiva do proprietário usada pela Inspeção. A auditoria
compara escopos, revisão esperada, âncora, cursor, direção, limite, orçamento de
bytes, links profundos, ordem e erros. Uma das superfícies não pode corrigir ou
reinterpretar silenciosamente a resposta da outra.

Uma página normal usa orçamento de 512 KiB, configurável entre 64 KiB e
1.500.000 bytes. A projeção completa falha fechada acima de 1,75 MiB, preservando
margem sob o teto de 2 MiB. A interface deve apresentar erro recuperável sem
tentar carregar o Curso inteiro por uma rota alternativa silenciosa.

## 6. Autoridade e falha fechada

Esconder um controle não é barreira de segurança. A auditoria confirma em
conjunto:

- Autoria e MCP listam somente Cursos próprios;
- a RPC de Inspeção é concedida somente a `service_role` e revalida o ator;
- a função auxiliar privada não possui execução para papéis de cliente;
- Curso compartilhado permanece acessível apenas em Estudo;
- conflito de revisão conserva a intenção e exige releitura;
- revogação impede nova leitura pela rede e elimina a cópia privada conhecida.

Segurança por linha, privilégios e checagem de propriedade são camadas
complementares. Uma função privilegiada incorreta não é corrigida apenas por
esconder a rota na interface.

## 7. Sistema visual e acessibilidade

Verificação proporcional abre a aplicação real em 360, 390 e 430 px e em computador,
nos temas claro, escuro e Sistema. Deve conferir:

- ausência de conteúdo além da largura da página e de controles cortados;
- uma única região principal de rolagem vertical em toda a Autoria;
- foco visível, ordem de teclado e retorno ao acionador;
- nomes e estados acessíveis para ícones;
- alvos de toque e reorganização com ampliação;
- contraste de texto, controles, feedback e dados;
- preservação de foco e posição durante paginação e atualização.

Automação de contraste e árvore acessível não substitui leitor de tela nem teste
com participantes. A referência normativa é [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 8. Auditoria semântica sem falso positivo visual

O corte de domínio usa `study_unit`, `studyUnits` e Unidade de estudo. A auditoria automática
de resíduos deve rejeitar identificadores, operações e atributos antigos quando
representam essa entidade. Ele não deve reprovar classes CSS genéricas que
descrevem apenas aparência, como `.clean-card`, `.card-title`,
`.runtime-card-sheet`, `.card-sheet-content` ou `.card-answer-dock`.

Essa distinção precisa ser sintática e contextual, não uma permissão ampla para
qualquer ocorrência. Um `data-*`, variável ou função que nomeia a entidade com
o termo substituído continua sendo regressão mesmo dentro de um componente
visual.

## 9. Matriz mínima de jornadas

| Jornada | Evidência principal |
| --- | --- |
| Estudo, progresso e revisão | testes de `CourseStudy*` e estado pessoal v2 |
| Observações próprias, uso sem conexão e duas abas | testes da folha de Unidade e de `CourseAnnotationRepository` |
| Autoria compacta, rota e capacidades progressivas | testes da superfície, rota e painéis especializados; devem rejeitar largura acima de 430 px, segunda coluna e nove rótulos permanentes |
| Autoria integrada no Supabase local | jornada autenticada por `public/main.js`, IndexedDB, API, PostgreSQL, Storage, RLS, OAuth com PKCE e MCP |
| edição manual contextual | `manual-study-unit-edit.test.js` e `manual-study-unit-edit.spec.js`, inclusive 32 componentes, prática, propriedade, conflito, resposta ambígua, snapshot confirmado e uso sem rede |
| assistência contextual por API | `study-unit-provider-assistance.test.js`, `provider-runtime-security.test.js`, `study-unit-provider-assistance.spec.js` e prova vertical real com relay local |
| Inspeção, janela, cópia local, ausência de conexão e posição | `course-inspection-sequence.test.js` e testes do controlador |
| Interface e MCP sob a mesma propriedade | testes de MCP, roteador, adaptador e API |
| restrições e concorrência | `course-postgres-concurrency.test.js` após recriação real |
| pacotes no renderizador fiel | `package-study-rendering-regressions.test.js` |
| Curso único e acesso direto ao Estudo | testes do repositório, API, RLS e manifesto |

Testes automatizados não demonstram que pessoas leigas compreendem a navegação,
que a carga cognitiva é baixa em uso prolongado ou que o Free Plan suportará a
carga real. Esses pontos continuam dependentes de avaliação humana e observação
operacional.

O conjunto focal de runtime da edição contextual passou 136/136 verificações
para recibo 2xx, promoção do snapshot e de `course.v1`, leitura offline por
Estudo e Inspeção, limpeza por releitura igual, expiração por revisão superior,
purga por logout ou revogação e rebase do CAS após atualização externa. O
cenário `SIGNED_OUT` também mantém uma chamada ao provider pendente e comprova
aborto, ausência de callback tardio, remoção da sobreposição e da credencial e
nenhum erro de página. O grupo visual integrado correspondente passou 9/9,
separadamente da listagem.

O inventário corrente de `npx playwright test --list` possui 111 testes em nove
arquivos: 73 no percurso compacto de
`tests/e2e/course-authoring-cutover.spec.js`, seis no arquivo de edição manual
e três no arquivo da assistência por API. Esses nove cenários integrados passaram
9/9. Enumerar os 111 casos não significa que toda a suíte foi aprovada; o
relatório do gate precisa registrar resultado e ambiente. A prova vertical separada cria
duas identidades no Supabase local, percorre a interface pública real, grava
Curso, Parte, estrutura, Fonte e PDF, confronta PostgreSQL e Storage e confirma
negativas de RLS. Depois completa OAuth com PKCE, usa `lerCurso` e
`alterarCurso` pelo MCP, vincula uma Microssequência à Parte e registra a etapa
inicial de uma materialização. Ao recuperar o foco, a interface e o IndexedDB
recebem a revisão canônica, mostram o andamento e abrem **Ver etapas** sem nova
confirmação nem escrita. O encerramento comprova ausência de resíduos dos
usuários, Cursos, entidades, materializações, objetos, clientes OAuth e
consentimentos criados pelo ensaio. Essa evidência é local e automatizada; não
comprova o app público do ChatGPT, o ambiente hospedado candidato nem
compreensão humana.

A matriz visual focal passou 10/10 em 51,4 segundos: 360, 390, 430 e 1280 px nos
temas claro e escuro, além de Before/After e rodada de Auditoria em 1280 px. Ela
mede largura máxima de 430 px, centralização no computador, uma única coluna
principal, ausência de overflow global e nome acessível contextual com tooltip
na ação do ChatGPT. O ESLint também passou. Essa execução não altera a distinção anterior:
os 111 casos listados continuam sendo inventário, não resultado integral.

O mesmo roteiro vertical inclui, na candidata, a edição manual, a assistência
pelo relay local e a releitura da revisão salva na interface, API, PostgreSQL
e IndexedDB. Ele confronta os eventos `manual` e `provider_assistance` e inspeciona
o pedido do relay para excluir Fonte, PDF e identidades internas. O roteiro local
passou duas vezes; a repetição mais recente, depois da correção que separa
loopback de rede local, concluiu 1/1 em 14,2 segundos. As 21/21 verificações
focais dessa classificação também passaram. Essas provas continuam insuficientes
para os critérios hospedados e humanos.

A revisão independente da assistência executou 84/84 verificações focais, repetiu
34/34 depois do último reparo da ponte e aprovou os três cenários Playwright do
provider. A compilação Android de depuração e os 28/28 testes de implantação
também passaram. Essas provas confirmam limites, cancelamento, ausência de
credencial no cliente e separação dos artefatos Android e Pages; não substituem
o ensaio do Pages com acesso real à rede local nem a instalação do APK de release
com relay real em dispositivo.

A inspeção visual local desta revisão percorreu a lista de Cursos em 360, 390,
430 e 1280 px; Planejamento em 390 px claro e 1280 px escuro; Parâmetros e Fontes
em 1280 px claro; e Auditoria e correções em 360, 390 e 430 px. Nessas capturas,
a superfície permaneceu única, centralizada e sem corte, coluna adicional ou
overflow aparente, com os quatro destinos iconográficos. Os arquivos de todas as
larguras são artefatos temporários da suíte e podem ser sobrescritos. O conjunto
persistente de capturas em todas as larguras e nos dois temas, assim como a
aceitação humana, continua pendente na #144.

## 10. Critérios de aprovação

Uma mudança de interface é aprovada quando:

1. usa o vocabulário corrente sem nome semântico alternativo;
2. mantém Estudo e Autoria ligados ao mesmo Curso;
3. falha fechada em propriedade, revisão e tamanho da resposta;
4. preserva posição, foco e contexto em paginação e atualização;
5. não usa página aproximada como substituta quando está sem conexão;
6. limita página, DOM e armazenamento temporário conforme o contrato;
7. funciona por toque e teclado nas quatro larguras de referência;
8. mantém paridade com o MCP quando a capacidade é compartilhada;
9. atualiza testes e auditoria automática sem confundir classe visual com entidade;
10. declara o que ainda depende de aceitação humana ou operação hospedada.
