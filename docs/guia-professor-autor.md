# Guia da pessoa autora

No AraLearn, a pessoa autora cria cursos com assistência de inteligência
artificial e revisão humana. A conversa usa ferramentas autorizadas para
consultar e alterar o curso, por [MCP](autoria-mcp.md), protocolo de conexão com
assistentes, ou por [Actions/OpenAPI](autoria-actions.md), integração com ações
descritas em um contrato estruturado. Esses canais permitem planejar, produzir e corrigir; o aplicativo oferece o mapa, o conteúdo salvo e as fontes
para inspeção. O curso pode partir de um tema, de uma ementa, de slides ou de
outros materiais de estudo.

A pessoa define o objetivo, examina propostas, decide o que aplicar e confere o
resultado. Gerar ou salvar um texto não o torna revisado. A
[revisão autoral](explicacao-e-revisao-humana.md#revisão-independente-por-objeto)
registra separadamente a declaração humana sobre cada explicação ou unidade
salva que foi inspecionada.

## Começar um curso

Crie um curso privado com título e objetivo. Na conversa, descreva público,
finalidade, conhecimentos prévios, escopo e restrições que realmente importam.
O assistente pergunta quando falta uma decisão capaz de mudar o desenho.

A pessoa autora não é presumida como estudante. “O público é iniciante” descreve
o curso; “você está começando do zero” atribuiria sem base uma condição à pessoa
que o está criando.

## Compartilhar estudo e arquivos

Em **Pessoas e acesso**, escolha privado ou público. A mudança exige confirmação;
ao publicar, confira também se os arquivos ficam sem acesso público ou disponíveis
para leitura pública. A concessão de acesso ao curso não libera, por si só, um PDF
restrito no curso público. Em **Fontes**, cada fonte e cada PDF podem herdar a
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

O mapa organiza o curso em módulos; cada módulo reúne lições, e cada lição
reúne microssequências didáticas, pequenos percursos com objetivo próprio.
As unidades de estudo serão produzidas dentro dessas microssequências. O
[modelo didático](modelo-didatico.md) desenvolve essas relações.

Confira todos os módulos, as lições e as microssequências, a progressão, as
dependências relevantes e a cobertura do escopo. O chat pode mostrar uma
síntese, mas o mapa completo precisa estar acessível no AraLearn.

Peça mudanças de cobertura, ordem, profundidade ou ênfase antes de aprovar. A
aprovação corresponde à versão completa salva que você inspecionou. O mapa
pode evoluir por ramos, e uma explicação
pode ser desenvolvida antes dessa aprovação. Aprovar o mapa não aprova exercícios,
componentes, formulações nem unidades de estudo que ainda serão produzidas.

## Produzir em partes

As partes dividem a produção em recortes manejáveis. Elas não aparecem
na hierarquia curricular e podem ser redimensionadas sem alterar módulos, lições
ou microssequências.

Para cada parte:

1. confira o recorte e a progressão local conforme o trabalho combinado;
2. desenvolva e inspecione a explicação e suas fontes;
3. no Ciclo completo, prepare o desenho e as unidades a partir dessa base;
4. abra o resultado salvo e inspecione os objetos pertinentes;
5. continue segundo a cadência e os pontos de revisão escolhidos.

O tamanho da conversa pode acompanhar sua preferência. O mapa e o conteúdo
salvos conservam o trabalho completo, mesmo quando a resposta do assistente é curta.

## Inspecionar e ajustar no aplicativo

Em **Planejamento**, use a seta para revelar um ramo e **Objetivo** para ler o
texto completo. **Explicação prevista** apresenta a finalidade, os pressupostos,
as relações e as fontes propostas para a microssequência. As fontes previstas
abrem sua inspeção; quando o título não pode ser consultado, o aplicativo
informa essa indisponibilidade sem afirmar que a fonte foi removida. Os acessos
ao conteúdo e os vínculos de cobertura levam ao
ponto correspondente; voltar conserva o mapa que estava aberto.

Em **Conteúdo**, **Mostrar várias unidades** amplia a leitura. Selecione os
alvos separadamente quando quiser registrar uma observação em lote. O comando
**Editar** de qualquer unidade a focaliza e preserva o trabalho pendente nas
condições indicadas pelo aviso. Essa edição é manual; **Assistência por IA** fica
em Estudo.

O ícone **Explicação** da unidade abre a base explicativa compartilhada pela
microssequência. Na sua inspeção, confira o conteúdo desenvolvido, os
pressupostos, as relações e as fontes. Ela pode ser produzida e revisada
antes das unidades, inclusive com o mapa ainda em rascunho. Depois, confira as
unidades com respostas, feedback e os vínculos pertinentes a cada uma.
**Editar Explicação** abre os campos textuais editáveis dos componentes já
presentes. Examine a prévia e use **Salvar Explicação** ou **Cancelar edição**.
Essa edição não acrescenta componentes nem gera apoio ausente. Salvar preserva
os demais dados e vínculos; confira se os trechos citados ainda sustentam o
texto alterado. Mudanças materiais desatualizam a revisão do objeto afetado.
Conteúdo completo salvo pode ser estudado por quem tem acesso mesmo sem essa
marca; exigir somente conteúdo revisado é uma política opcional do curso.

Cada explicação e cada unidade tem sua própria **Revisão autoral**. Depois de
inspecionar o objeto e salvar ou descartar edições pendentes, use **Marcar como
revisado**; **Retirar marca de revisão** desfaz a declaração. A marca referencia
o conteúdo salvo e não demonstra leitura, correção ou eficácia. No chat, a
tarefa `declarar_revisao` também registra a escolha humana expressa sobre o
objeto referenciado. Salvar uma edição ou corrigir uma observação não faz essa
declaração. Se o resultado ficar incerto, **Confirmar resultado** recupera o
mesmo pedido, inclusive ao reabrir a inspeção.

**Parâmetros** reúne as escolhas sobre a apresentação e a prática, como o limite
de ideias novas por unidade. O controle fica no contexto do objeto: curso e ramo no Planejamento,
microssequência junto da explicação e unidade em sua inspeção. Permite distinguir intenção
automática, valor fixado por você e herança de uma escolha mais ampla, como
a do curso. Trocar o escopo conserva os ajustes ainda não
salvos em seu contexto. **Observações** pode ser aberta apenas para consultar;
um texto alterado ou um envio parcial é que exige retomar o trabalho antes de
uma operação incompatível.

Depois de produzir outro lote pela conversa, use a nuvem para atualizar o
curso. A leitura preserva a unidade focal quando ela ainda existe. No modo
manual, a consulta explícita continua disponível e não muda a preferência do
dispositivo para automática. Uma cópia local disponível não confirma que a
última produção já foi recebida.

## Acompanhar ideias ao longo do percurso

O repertório acumulado reúne o conhecimento necessário para acompanhar o curso.
Ao produzir uma unidade, o assistente distingue:

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

Os [parâmetros de desenho](desenho-instrucional-parametrizado.md) orientam, por
exemplo, quantas ideias novas apresentar juntas e como distribuir a prática.
O catálogo define o significado, os limites e o alcance de cada ajuste. A
**intenção corrente** orienta o próximo trabalho; a **configuração aplicada**
guarda as escolhas usadas na produção de uma unidade. A revisão humana
continua sendo uma declaração separada sobre o conteúdo salvo.
Os alvos de palavras e de produção orientam o trabalho; não são licença para
omitir conteúdo necessário.

**Configurações** tem os mesmos quatro grupos em Estudo e Autoria: **Conta**,
**Aparência**, **Sincronização e dados deste dispositivo** e **Preferências de
autoria**. Manutenção aparece somente para o papel autorizado. As preferências
pessoais de autoria separam foco **Conteúdo / Ciclo completo**, cadência, pontos
de revisão e diálogo. O assistente as consulta ao retomar; salvá-las não altera cursos,
configurações aplicadas ou condições de pesquisa retroativamente. Conteúdo
trabalha bases e fontes; Ciclo completo inclui desenho e unidades no recorte
combinado. A cadência define se o trabalho avança por microssequência, parte
ou lote; os pontos de revisão indicam em que momentos você quer inspecionar.

Automático é uma intenção sem valor numérico implícito. Antes de produzir as unidades,
o assistente escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
A aplicação conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

Você pode salvar um perfil de preferências e copiá-lo para um curso após
examinar a prévia. As exceções existentes são preservadas, salvo seleção
explícita, e condições de pesquisa continuam protegidas. Editar ou excluir o
perfil depois não muda cursos já configurados. Distribuição e posição da
prática orientam o desenho; as contagens calculadas mostram o que foi
declarado e onde aparece, sem atribuir uma nota pedagógica.

Direção editorial é separada. Ela pode orientar extensão, estilo, títulos e
organização, mas não retirar conteúdo necessário.

A configuração deve conservar a relação com o mapa inspecionado e com a
finalidade de cada unidade. Ajustes editoriais orientam a apresentação; a
suficiência da explicação continua sendo uma decisão sobre o conteúdo.

## Trabalhar com fontes

Diferencie fonte de escopo, evidência de avaliação e fonte técnica ou
conceitual. Uma ementa determina o que cobrir; questões ajudam a calibrar a
aplicação; fontes técnicas sustentam explicações. Uma prova não se torna
autoridade conceitual automática.

Os dados bibliográficos, os trechos citados e o papel de cada fonte precisam
ser conferidos, como explica [Fontes, citações e referências](fontes-e-citacoes.md). Um PDF enviado por
conversa só deve ser guardado quando essa intenção estiver clara.

Na inspeção da explicação, consulte as referências no fim do corpo para
conferir a obra, a localização no material e sua relação com o trecho associado. Os vínculos pertencem ao apoio compartilhado da
microssequência; não é preciso repeti-los em cada unidade. Ao localizar uma
ocorrência, selecione o trecho literal do conteúdo mostrado. A posição do bloco
distingue textos iguais; o caminho completo do alvo selecionado aparece abaixo
do seletor, mesmo quando a largura da tela limita o rótulo da opção. Uma referência
sem ocorrência vale para o apoio inteiro; uma citação direta continua exigindo
localizador na fonte. Fechar o detalhe da fonte retorna aos vínculos da mesma
explicação, preservando o recorte da inspeção.

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

Use **Debater com GPT** para copiar uma referência do objeto e discuti-lo numa
conversa conectada. Esse é o nome atual do controle; o pedido apenas identifica
o contexto, e o assistente precisa reler o estado salvo. Discuta a proposta,
autorize a alteração e volte ao mesmo objeto para conferir se o problema foi
resolvido. A ferramenta não inicia sozinha uma chamada de IA no aplicativo.

Cada explicação e unidade conserva uma fila durável de observações autorais.
O campo de texto acrescenta uma entrada; o ícone com contagem abre a fila para
consulta e edição. O assistente lê as pendências pertinentes antes de corrigir. Somente
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

A área **Dados de autoria** apresenta contagens e descrições do desenho aplicado e das
intervenções registradas, conforme a [referência de Analytics](analytics-instrucionais.md).
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
