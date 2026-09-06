# Guia da pessoa autora

O AraLearn permite planejar, produzir e revisar um curso sem transformar a
autoria em administração de processos técnicos. A conversa com GPT coordena o
trabalho amplo; a interface visual mantém mapa, conteúdo, fontes, observações,
configuração e Analytics ao alcance do contexto.

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

O primeiro resultado substantivo é o mapa de todo o curso:

```text
curso → módulos → lições → microssequências
```

Confira todos os módulos, as lições e as microssequências, a progressão, as
dependências relevantes e a cobertura do escopo. O chat pode mostrar uma
síntese, mas o mapa completo precisa estar acessível no AraLearn.

Peça mudanças de cobertura, ordem, profundidade ou ênfase antes de aprovar. A
aprovação vale somente para o mapa apresentado. Ela não aprova exercícios,
componentes, formulações nem unidades de estudo que ainda serão produzidas.

## Produzir em partes

Depois do mapa, partes dividem a produção em lotes manejáveis. Elas não aparecem
na hierarquia curricular e podem ser redimensionadas sem alterar módulos, lições
ou microssequências.

Para cada parte:

1. leia a progressão local proposta no chat;
2. corrija somente decisões substantivas;
3. aprove a preparação daquele lote;
4. abra as unidades materializadas no AraLearn;
5. inspecione o percurso antes de seguir.

O chat deve permanecer curto. Detalhes ficam no mapa e no conteúdo, não em
explicações sobre o mecanismo do AraLearn.

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
que define significado, unidade, limites e escopos de cada ajuste. Ela reúne
conteúdo, prática, conversa e cadência de produção. Os alvos de palavras e de
produção orientam o trabalho; não são licença para omitir conteúdo necessário.

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

Mapa global antes dos lotes, aprovação apenas do que estava inspecionável e
linguagem pública compreensível são invariantes. As dimensões pedagógicas e
editoriais podem ser calibradas sem criar uma entidade para cada heurística.

## Trabalhar com fontes

Diferencie fonte de escopo, evidência de avaliação e fonte técnica ou
conceitual. Uma ementa determina o que cobrir; questões ajudam a calibrar a
aplicação; fontes técnicas sustentam explicações. Uma prova não se torna
autoridade conceitual automática.

Metadados, localizações e papéis continuam contestáveis. Um PDF enviado por
conversa só deve ser guardado quando essa intenção estiver clara.

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
