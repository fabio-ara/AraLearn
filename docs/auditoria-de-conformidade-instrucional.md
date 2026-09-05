# Revisão e correções do Curso

Revisar um curso significa voltar ao conteúdo corrente, localizar uma questão e
examinar o percurso necessário para corrigi-la. A revisão pode começar numa
StudyUnit, numa Observação, numa fonte, numa mudança de parâmetro ou numa
representação inadequada. Ela não atribui nota ao curso e não mede aprendizagem.

## O ciclo de revisão

```text
inspecionar → observar → preparar a revisão → propor correções
→ decidir → aplicar → reinspecionar
```

A pessoa pode abrir qualquer StudyUnit, inclusive antiga, e registrar uma
Observação. Quando várias Units compartilham o mesmo problema, a seleção em lote
grava uma Observação separada em cada alvo. Não existe um objeto permanente de
lote.

Antes de propor mudanças, o GPT usa `preparar_revisao` para reler as Observações
abertas e o contexto pedagógico pertinente. A resposta identifica o problema, o
conjunto que precisa mudar e uma proposta concreta. A pessoa decide antes de
`aplicar_correcoes` alterar o curso.

## Contexto pedagogicamente afetado

O alvo anotado não determina sozinho o alcance do reparo. Uma mudança pode exigir
releitura de Units anteriores e posteriores quando atingir:

- progressão e conhecimentos prévios;
- transições entre ideias ou atividades;
- exemplos que dependem da explicação alterada;
- prática e consolidação;
- Fontes, Âncoras ou atribuições;
- parâmetros efetivos da microssequência.

O GPT deve propor o menor conjunto coerente de mudanças. Isso pode significar
manter Units que foram lidas como contexto, alterar mais de uma Unit ou criar uma
distribuição mais adequada da novidade. Revisão focal não significa substituição
isolada por padrão.

## Julgamento semântico e verificações determinísticas

O servidor verifica estrutura, autorização, referências, limites e concorrência.
Adequação pedagógica, factual e editorial exige julgamento da pessoa ou do GPT
com evidência suficiente.

Uma representação estruturalmente válida ainda pode ser inadequada. Se a
inspeção de componente indicar que ela condensou uma relação importante ou é
apenas substituta da forma necessária, a revisão deve apresentar um achado e
uma proposta de representação melhor. Não existe quota de variedade: parágrafo
e escolha continuam corretos quando cumprem a função instrucional.

## Fontes e contestação

A revisão apresenta a referência da fonte, o papel que ela cumpre e a Âncora ou
o trecho pertinente. Uma fonte pode apoiar uma afirmação, contextualizar,
contrastar ou fornecer um exemplo. Esses papéis não são intercambiáveis.

Fonte e Âncora continuam contestáveis. A pessoa pode corrigir metadados, ajustar
a localização, mudar a relação com a Unit ou retirar a fonte. Identidade e
localização demonstram proveniência; não demonstram, sozinhas, qualidade ou
verdade da afirmação.

## Parâmetros e próxima revisão

As escolhas de conteúdo, prática, conversa e cadência do catálogo, os alvos
editoriais e a direção editorial são consultados no escopo efetivo. Uma definição feita na
microssequência ou unidade de estudo rege a próxima geração ou revisão daquele
escopo. No estado `default`, o GPT precisa calibrá-los automaticamente para esse
contexto. Alvos de palavras e direção editorial podem orientar extensão, estilo
e organização, mas não eliminar ou comprimir conteúdo necessário; quando uma
unidade fica densa demais, o curso ganha mais unidades coerentes.

## Aplicação e reinspeção

`aplicar_correcoes` recebe referências humanas das Units e seus conteúdos e
fontes propostos. A camada confiável resolve identidades e a revisão corrente,
recusa ambiguidade ou falta de acesso e tenta novamente apenas quando consegue
preservar a mesma intenção.

Depois da aplicação, abra o endereço retornado e reinspecione o conjunto
afetado. A alteração aplicada não prova que o problema foi resolvido. A
Observação pode então ser respondida ou resolvida de acordo com o estado
corrente.

O AraLearn conserva o conteúdo, a configuração, as fontes e as Observações
necessários ao trabalho. A conversa não cria um histórico universal de rodadas,
achados ou estados anteriores. Git, backup e exportação explícita cumprem as
funções de recuperação e pesquisa que exigem um artefato congelado.

## Na interface e na conversa

Em **Conteúdo**, o ícone de Observações abre o contexto da StudyUnit. A pessoa
pode navegar pelo índice, voltar a uma Unit antiga, selecionar várias Units e
consultar fontes sem sair do percurso. **Analytics** resume quantitativamente o
desenho corrente e intervenções humanas explicitamente observáveis.

No MCP e em Actions, o percurso usa quatro tarefas humanas:

- `consultar_observacoes` lê o recorte solicitado;
- `preparar_revisao` amplia o contexto sem alterar o curso;
- `registrar_observacao` grava um apontamento em uma ou várias Units;
- `aplicar_correcoes` grava o conjunto aprovado.

As respostas de coordenação trazem o resultado, um endereço pertinente e uma
próxima decisão. O conteúdo completo permanece no AraLearn, em vez de ser
repetido na conversa.

Consulte [Observações e Anotações ancoradas](observacoes-pedagogicas.md),
[Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md) e
[Autoria pelo MCP](autoria-mcp.md).
