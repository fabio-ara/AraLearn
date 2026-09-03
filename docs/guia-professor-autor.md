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

O AraLearn mantém quatro dimensões pedagógicas configuráveis:

- teto de ideias novas por unidade expositiva;
- formas de explicação;
- oportunidades mínimas de prática por requisito;
- dimensões de variação da prática.

Também mantém dois alvos editoriais quantitativos flexíveis: palavras por
resposta de autoria e palavras por unidade de estudo. Eles orientam a extensão,
mas não são limites e não autorizam resumir, omitir ou fragmentar conteúdo para
atingir uma contagem.

No estado `default`, o GPT precisa calibrar automaticamente os valores para cada
microssequência ou unidade conforme conteúdo, função e público; não aplica um
preset fixo. Em pesquisa, a pessoa pode fixar valores deliberadamente, e esses
valores prevalecem.

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
