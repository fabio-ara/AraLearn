# Guia da pessoa autora

O AraLearn permite planejar, produzir e revisar um curso sem transformar a
autoria em administração de processos técnicos. A conversa com GPT coordena o
trabalho amplo; a interface visual mantém mapa, conteúdo, fontes, observações,
configuração e Analytics ao alcance do contexto.

No **Planejamento**, abra a microssequência e sua **Explicação prevista** para
examinar finalidade, pressupostos, relações e fontes. As fontes previstas mostram o título
do catálogo na mesma revisão do plano e abrem sua inspeção. Quando o título
não pode ser consultado, o link permanece como **Fonte prevista · título
indisponível**; isso não afirma que a fonte foi removida. O apoio é compartilhado
pelas unidades dessa microssequência. Uma parte com **Conteúdo produzido** tem
material já disponível para inspeção; esse estado não atesta revisão humana.
Mapa aprovado e autorização para produzir não aprovam textos ainda não vistos.

O ícone de Explicação na fileira da unidade abre a base explicativa da
microssequência. Em telas estreitas, quando há ferramentas nessa fileira, **Visualizar**
fica no menu de detalhes da unidade para preservar o tamanho dos controles.

**Debater com GPT** oferece uma referência copiável do objeto e da revisão em
exame. Cole-a na conversa conectada por MCP ou Actions, peça a leitura atual e
discuta a proposta. O pedido não escreve no curso nem inicia assistência por
API na Autoria. Depois de uma aplicação autorizada, reinspecione o mesmo recorte;
somente a decisão explícita de revisão do conteúdo registra a aprovação humana.

Junto à declaração de revisão, confira o objeto e a versão salva em exame.
A marca da Explicação não revisa automaticamente as unidades, e a marca de uma
unidade não alcança as demais. Os vínculos pertinentes integram a base da revisão.

## Começar um curso

Crie um curso privado com título e objetivo. Na conversa, descreva público,
finalidade, conhecimentos prévios, escopo e restrições que realmente importam.
O GPT pergunta somente quando falta uma decisão capaz de mudar o desenho.

A pessoa autora não é presumida como estudante. “O público é iniciante” descreve
o curso; “você está começando do zero” atribuiria sem base uma condição à pessoa
que o está criando.

## Compartilhar estudo e arquivos

Em **Pessoas e acesso**, escolha privado ou público. A mudança exige confirmação;
ao publicar, confira também se os arquivos ficam restritos às pessoas autorizadas
ou disponíveis a visitantes. Em **Fontes**, cada fonte e cada PDF podem herdar a
regra anterior ou definir uma exceção. O arquivo prevalece sobre a fonte, que
prevalece sobre o curso. Um arquivo já baixado não pode ser recolhido.

Para um acesso individual, use **Conceder acesso**, digite ao menos dois caracteres
do `@identificador`, escolha o resultado e confirme. A busca mostra somente
identificador e foto opcional, sem e-mail. O identificador escolhido deve
continuar o mesmo no momento da confirmação; se mudou, refaça a busca.

A pessoa favorecida pode estudar e enviar observações, sem editar o curso.
Visitantes de um curso público leem, praticam e marcam Rever localmente; precisam
entrar numa conta para observar. Retirar uma concessão não impede a leitura se
o curso continua público. Tornar privado bloqueia novos acessos de visitantes e
contas não favorecidas, preservando proprietário e acessos individuais.

## Aprovar o mapa curricular

O mapa organiza o curso:

```text
curso → módulos → lições → microssequências
```

Confira todos os módulos, as lições e as microssequências, a progressão, as
dependências relevantes e a cobertura do escopo. O chat pode mostrar uma
síntese, mas o mapa completo precisa estar acessível no AraLearn.

Peça mudanças de cobertura, ordem, profundidade ou ênfase antes de aprovar. A
aprovação usa a referência da versão persistida que foi inspecionada, sem
regenerar a árvore no envio. O mapa pode evoluir por ramos, e uma Explicação
pode ser desenvolvida antes dessa aprovação. Aprovar o mapa não aprova exercícios,
componentes, formulações nem unidades de estudo que ainda serão produzidas.

## Produzir em partes

Partes dividem a produção em lotes manejáveis. Elas não aparecem
na hierarquia curricular e podem ser redimensionadas sem alterar módulos, lições
ou microssequências.

Para cada parte:

1. confira o recorte e a progressão local conforme o trabalho combinado;
2. desenvolva e inspecione a Explicação e suas fontes;
3. no Ciclo completo, prepare o desenho e as unidades a partir dessa base;
4. abra o resultado salvo e inspecione os objetos pertinentes;
5. continue segundo a cadência e os pontos de revisão escolhidos.

O chat deve permanecer curto. Detalhes ficam no mapa e no conteúdo, não em
explicações sobre o mecanismo do AraLearn.

## Inspecionar e ajustar no aplicativo

Em **Planejamento**, use a seta para revelar um ramo e **Objetivo** para ler o
texto completo. Os acessos ao conteúdo e os vínculos de cobertura levam ao
ponto correspondente; voltar conserva o mapa que estava aberto.

Em **Conteúdo**, **Mostrar várias unidades** amplia a leitura. Selecione os
alvos separadamente quando quiser registrar uma observação em lote. O comando
**Editar** de qualquer unidade a focaliza e preserva o trabalho pendente nas
condições indicadas pelo aviso. Essa edição é manual; a Assistência por IA fica
em Estudo.

Na inspeção da **Explicação**, confira a base explicativa salva: conteúdo
desenvolvido, pressupostos, relações e fontes. Ela pode ser produzida e revisada
antes das unidades, inclusive com o mapa ainda em rascunho. Depois, confira as
unidades com respostas, feedback e os vínculos pertinentes a cada uma.
**Editar Explicação** abre os campos textuais editáveis dos componentes já
presentes. Examine a prévia e use **Salvar Explicação** ou **Cancelar edição**.
Essa edição não acrescenta componentes nem gera apoio ausente. Salvar preserva
os demais dados e vínculos; confira se os trechos citados ainda sustentam o
texto alterado. Mudanças materiais desatualizam a revisão do objeto afetado.
Conteúdo completo salvo pode ser estudado por quem tem acesso mesmo sem essa
marca; exigir somente conteúdo revisado é uma política opcional do curso.

Cada Explicação e cada unidade tem sua própria **Revisão autoral**. Depois de
inspecionar o objeto e salvar ou descartar edições pendentes, use **Marcar como
revisado**; **Retirar marca de revisão** desfaz a declaração. A marca referencia
o conteúdo salvo e não demonstra leitura, correção ou eficácia. No chat, a
tarefa `declarar_revisao` também registra a escolha humana expressa sobre o
objeto referenciado. Salvar uma edição ou corrigir uma observação não faz essa
declaração. Se o resultado ficar incerto, **Confirmar resultado** recupera o
mesmo pedido, inclusive ao reabrir a inspeção.

**Parâmetros** fica no contexto do objeto: curso e ramo no Planejamento,
microssequência junto da Explicação e unidade em sua inspeção. Permite distinguir intenção
automática, valor fixo e herança. Trocar o escopo conserva os ajustes ainda não
salvos em seu contexto. **Observações** pode ser aberta apenas para consultar;
um texto alterado ou um envio parcial é que exige retomar o trabalho antes de
uma operação incompatível.

Depois de produzir outro lote pela conversa, use a nuvem para atualizar o
curso. A leitura preserva a unidade focal quando ela ainda existe. No modo
manual, a consulta explícita continua disponível e não muda a preferência do
dispositivo para automática. Uma cópia local disponível não confirma que a
última produção já foi recebida.

## Acompanhar ideias ao longo do percurso

O repertório acumulado inclui conceitos, relações, condições, procedimentos e
operações necessários para aprender. Ao produzir uma unidade, o GPT distingue:

- ideias novas introduzidas ali;
- ideias já estabelecidas e apenas utilizadas;
- ideias estabelecidas retomadas de propósito.

Uma ideia pode ser desenvolvida em várias unidades. Retomada não volta a contar
como introdução. O teto de novidades limita apenas quantas ideias
semanticamente novas aparecem juntas numa unidade expositiva; não exige uma
quantidade exata e não transforma prática em exposição.

## Produzir unidades coerentes

Uma unidade de estudo é uma experiência didática, não um fragmento mínimo de
texto. Evite:

- compactar conceitos, relações e exemplos num resumo denso;
- atomizar uma explicação simples em telas sem progressão perceptível.

Se um conhecimento necessário não foi declarado como pré-requisito, ensine-o
antes do uso. Ensinar dois conceitos separados não basta quando a relação entre
eles também é essencial.

Quando fizer sentido, intercale problema, explicação, exemplo, previsão,
aplicação, comparação, prática e integração. Tarefas complexas podem avançar de
exemplo resolvido para exemplo parcial, prática com pistas e situação nova. Não
use nenhuma dessas sequências como molde obrigatório.

## Escolher componentes e prática

Escolha a representação pela função: tabela para estado, diagrama para relação
espacial, linha do tempo para mudança, comparação lado a lado para discriminação
e resposta aberta para explicar ou justificar. Parágrafo e escolha continuam
adequados quando cumprem a função. Variedade visual, sozinha, não é critério.

Prática faz parte da aprendizagem e pode aparecer antes, durante e depois da
explicação. Use previsão, identificação, aplicação, diagnóstico, justificativa,
conclusão de exemplo e integração conforme o objetivo.

## Ajustar o desenho

A configuração vem do [catálogo de parâmetros](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites e escopos de cada ajuste. Intenção
corrente, configuração aplicada e declaração de revisão são registros distintos.
Os alvos de palavras e de produção orientam o trabalho; não são licença para
omitir conteúdo necessário.

**Configurações** tem os mesmos quatro grupos em Estudo e Autoria: **Conta**,
**Aparência**, **Sincronização e dados deste dispositivo** e **Preferências de
autoria**. Manutenção aparece somente para o papel autorizado. As preferências
pessoais de autoria separam foco **Conteúdo / Ciclo completo**, cadência, pontos
de revisão e diálogo. O GPT as consulta ao retomar; salvá-las não altera cursos,
configurações aplicadas ou condições de pesquisa retroativamente. Conteúdo
trabalha bases e fontes; Ciclo completo inclui desenho e unidades no recorte combinado.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o GPT escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
A aplicação conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

Você pode salvar um perfil de preferências e copiá-lo para um curso após
examinar a prévia. As exceções existentes são preservadas, salvo seleção
explícita, e condições de pesquisa continuam protegidas. Editar ou excluir o
perfil depois não muda cursos já configurados. Distribuição e posição da
prática orientam o desenho; as observações calculadas mostram o que foi
declarado e onde aparece, sem atribuir uma nota pedagógica.

Direção editorial é separada. Ela pode orientar extensão, estilo, títulos e
organização, mas não retirar conteúdo necessário.

Referência ao mapa efetivamente inspecionado e linguagem pública compreensível
são invariantes. As dimensões pedagógicas e
editoriais podem ser calibradas sem criar uma entidade para cada heurística.

## Trabalhar com fontes

Diferencie fonte de escopo, evidência de avaliação e fonte técnica ou
conceitual. Uma ementa determina o que cobrir; questões ajudam a calibrar a
aplicação; fontes técnicas sustentam explicações. Uma prova não se torna
autoridade conceitual automática.

Metadados, localizações e papéis continuam contestáveis. Um PDF enviado por
conversa só deve ser guardado quando essa intenção estiver clara.

Na inspeção da Explicação, consulte as referências no fim do corpo para conferir obra, localizador,
papel e trecho associado. Os vínculos pertencem ao apoio compartilhado da
microssequência; não é preciso repeti-los em cada unidade. Ao localizar uma
ocorrência, selecione o trecho literal do conteúdo mostrado. A posição do bloco
distingue textos iguais; o caminho completo do alvo selecionado aparece abaixo
do seletor, mesmo quando a largura da tela limita o rótulo da opção. Uma referência
sem ocorrência vale para o apoio inteiro; uma citação direta continua exigindo
localizador na fonte. Fechar o detalhe da fonte retorna aos vínculos da mesma
Explicação, preservando o recorte da inspeção.

Conferir a referência bibliográfica não aprova automaticamente o conteúdo.
Alterar texto, fonte ou vínculo pode desatualizar a revisão do objeto afetado. Uma
gravação cujo resultado ficou incerto deve ser recuperada pelo mesmo pedido
antes de iniciar outra edição; o aplicativo conserva esse pedido localmente.

## Revisar como estudante

Antes de considerar uma parte pronta, percorra as unidades na ordem:

- a primeira usa apenas pré-requisitos declarados?
- cada novidade recebeu preparação suficiente?
- alguma relação essencial foi pressuposta?
- há saltos ou repetições improdutivas?
- alguma unidade está densa demais?
- a sequência foi fragmentada demais?
- os exemplos tornam o mecanismo observável?
- as práticas exigem somente o que já foi ensinado?
- ao final, a pessoa consegue realizar o objetivo?

Divida unidades densas, funda fragmentos e reescreva transições quando
necessário. A quantidade deve emergir do conhecimento e do domínio esperado.

## Observar e corrigir

Voltar a qualquer ponto do curso é a forma principal de reversibilidade. Abra
uma unidade antiga, registre uma observação e peça revisão. Se a questão afetar
progressão, pré-requisitos, transições, exemplos ou prática, a correção deve
considerar todos os pontos pertinentes.

```text
inspecionar → observar → preparar contexto → propor
→ decidir → aplicar → reinspecionar
```

Aplicar uma proposta não demonstra que ela resolveu o problema; confira o
conteúdo corrente.

Cada Explicação e unidade conserva uma fila durável de observações autorais.
O campo de texto acrescenta uma entrada; o ícone com contagem abre a fila para
consulta e edição. O GPT lê as pendências pertinentes antes de corrigir. Somente
a versão exata cuja correção foi persistida e confirmada por releitura sai da
fila. Ler, responder ou começar uma tentativa não consome a entrada; versões
editadas, conflitos e aplicações parciais permanecem pendentes. Se a resposta
se perder, a retomada reconcilia conteúdo e fila pela mesma tentativa.

No minichat **Assistência por IA**, disponível ao proprietário em Estudo, você
pode discutir sem alterar conteúdo. Quando houver proposta, use **Preparar
prévia**, compare **Original** e **Prévia** e escolha **Aplicar ao rascunho**.
Salvar continua uma decisão separada. Descartar a prévia ou o rascunho preserva
o original; uma falha de geração ou um conflito não autoriza sobrescrevê-lo.

## Usar Analytics em pesquisa

Analytics descreve o desenho efetivamente aplicado e intervenções observáveis.
Mostra valores, origem, escopo e uso nas unidades, além de repertório, prática,
componentes e fontes.

Uma exportação permite confrontar o estado entre publicações ou cópias
experimentais, desde que o protocolo preserve também o artefato correspondente.
Ela não mede aprendizagem nem cria um histórico universal.

Para comparar condições, use cursos privados independentes, fixe somente os
valores que distinguem as condições e documente o que deve permanecer igual.
Finalidade de concurso ou qualquer outro contexto é uma configuração possível,
não o padrão do AraLearn.

Consulte [Criar e revisar cursos por conversa](criar-cursos-pelo-chat.md),
[Autoria pelo MCP](autoria-mcp.md) e [Autoria por Actions](autoria-actions.md).
