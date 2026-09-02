# Guia da pessoa autora

O AraLearn permite planejar, produzir e revisar um Curso sem transformar a
autoria numa administração de processos técnicos. A conversa com GPT realiza o
trabalho amplo por MCP ou Actions. A interface visual mantém conteúdo,
navegação, Fontes, Observações, configuração e Analytics ao alcance do contexto.

## Começar um Curso

Na interface, crie um Curso privado com título e objetivo. Na conversa, descreva
público, finalidade, conhecimentos prévios e restrições realmente importantes.
O GPT deve recolher apenas o contexto mínimo que falta, sem transformar o início
num questionário.

Depois de `criar_curso`, abra o deep link retornado. A Autoria entra diretamente
em **Conteúdo**. Um Curso novo ainda não precisa exibir painéis vazios; o próximo
passo natural é planejar sua primeira Parte.

## Planejar Parte por Parte

Parte é um lote operacional. Ela reúne Microssequências que podem ser aprovadas,
produzidas e revistas juntas, mas não entra na hierarquia pedagógica do Curso.

O percurso padrão é incremental:

1. o GPT propõe somente a próxima Parte;
2. a pessoa aprova ou pede uma mudança;
3. `salvar_parte` registra título, intenção e Microssequências completas;
4. o GPT relê o plano e propõe a próxima Parte.

Cada Microssequência salva informa Módulo, Lição, objetivos, função,
AnalysisUnits e requisitos de evidência. Sete a doze Partes pode ser uma boa
faixa para muitos Cursos, mas nunca é meta nem gate. Uma Parte anterior continua
revisável por título ou posição.

## Inventariar a novidade

Uma AnalysisUnit representa uma novidade semanticamente independente para o
público, a tarefa e o contexto. Antes de produzir conteúdo, inventarie também
conceitos auxiliares, relações, distinções, condições, procedimentos e operações
intelectuais que precisem ser aprendidos.

Não use um tópico amplo para esconder várias novidades. Termo apenas incidental
não vira AnalysisUnit. Conhecimento já estabelecido pode reaparecer para apoiar
uma relação nova, mas essa relação precisa constar no inventário.

O teto de AnalysisUnits novas por StudyUnit controla distribuição, não o tamanho
arbitrário da unidade conceitual. Com teto 1 ou 2, preserve o mesmo inventário e
crie quantas StudyUnits forem necessárias para ensinar tudo com clareza.

## Produzir StudyUnits

Depois de aprovar a Parte, o GPT usa `preparar_materializacao`. Essa leitura traz
somente inventário, conhecimentos estabelecidos, configuração e Fontes do
recorte. A proposta de StudyUnits deve explicitar introduções, formas de
explicação, componentes e oportunidades de prática.

StudyUnit focal não é resumo. Definição, contexto, mecanismo, relação, exemplo,
contraste, representação, recuperação e prática podem ocupar Units diferentes.
Tamanho de tela e direção editorial não autorizam retirar conteúdo necessário.

Escolha cada componente pela função instrucional. Tabela, sequência,
classificação, código, diagrama ou contraste podem ser melhores que um parágrafo.
Parágrafo e escolha continuam válidos quando cumprem a função; não existe quota
de variedade.

Prática deve ser suficiente e variada segundo a configuração. Consolidação
local pode recuperar conhecimento sem fabricar um requisito de evidência.

## Navegar pelo conteúdo

Em **Conteúdo**, uma StudyUnit domina o leitor. Use anterior e próxima para o
percurso próximo; índice e pesquisa para chegar rapidamente a qualquer Unit;
deep links para retornar ao alvo exato. Voltar e avançar preservam posição e
contexto útil.

Ações recorrentes aparecem como ícones com nomes acessíveis. Parâmetros, Fontes
e Observações abrem no contexto, sem uma segunda coluna administrativa.

## Ajustar a configuração

O AraLearn mantém quatro parâmetros pedagógicos:

- teto de novas AnalysisUnits por StudyUnit;
- formas de explicação por AnalysisUnit;
- oportunidades mínimas de prática por requisito;
- dimensões de variação da prática.

Direção editorial é separada. Ela pode orientar extensão, estilo, títulos e
organização, mas não comprimir o inventário nem reduzir prática necessária.

No uso comum, o GPT calibra automaticamente os valores a partir do contexto. Em
autoria deliberada ou pesquisa, a pessoa pode fixá-los. Consulte a configuração
efetiva no Curso ou na Microssequência da StudyUnit; limpar uma definição
restaura a herança do escopo mais amplo.

## Trabalhar com Fontes

Uma Fonte reúne referência bibliográfica corrente, Âncoras e vínculos com o
Curso. A Âncora aponta para página, seção, trecho ou outra localização
verificável. O papel informa por que a Fonte aparece: apoio, contexto, contraste,
exemplo ou outra relação declarada.

Abra **Fontes** a qualquer momento. Metadados, Âncoras e papéis continuam
contestáveis: adote, corrija, substitua ou remova o que não sustenta o uso
pretendido.

Para incorporar um PDF por conversa, envie exatamente um arquivo na mesma
mensagem e descreva a intenção. O serviço valida os bytes, grava o objeto em
Storage privado e liga o anexo à Fonte. O endereço de leitura é temporário e
somente pessoas autorizadas o recebem.

## Observar, revisar e corrigir

Voltar a qualquer ponto do Curso é a forma principal de reversibilidade. Abra
uma StudyUnit antiga, registre uma Observação e peça revisão. Para o mesmo
apontamento em várias Units, selecione os alvos; cada Observação fica independente.

A revisão segue este percurso:

```text
inspecionar → observar → preparar contexto → propor correções
→ decidir → aplicar → reinspecionar
```

O GPT não deve alterar apenas a Unit anotada quando a questão atinge progressão,
pré-requisitos, transições, exemplos ou prática. `preparar_revisao` relê o
conjunto pertinente; `aplicar_correcoes` grava somente o conjunto aprovado.

Uma representação válida pode ser inadequada à função. Nesse caso, a proposta
precisa explicar o problema e indicar uma alternativa concreta. Depois de
aplicar, reinspecione o resultado; aplicação não demonstra resolução.

## Ler Analytics

**Analytics** responde rapidamente como o artefato corrente foi desenhado e
onde houve intervenção humana explícita. O filtro troca entre Curso, Parte,
Microssequência e StudyUnit.

**Desenho** mostra, entre outras contagens, StudyUnits, parâmetros usados,
AnalysisUnits, introduções, formas explicativas, componentes, prática,
dimensões de variação e Fontes por papel. **Autoria** mostra Observações,
parâmetros definidos, Units revisadas manualmente e origem observável de criação
e última revisão.

Ausência de atribuição aparece como não disponível, nunca como zero. **Exportar
Analytics** baixa o mesmo snapshot JSON dos números visíveis. Essas contagens
não são score de qualidade, aprendizagem ou percentual de autoria humana.

## Comparar condições

Quando uma pesquisa precisar comparar teto 1 e 2 ou outra configuração, crie
Cursos privados independentes e fixe uma condição em cada um. Preserve o mesmo
inventário semântico e documente as diferenças deliberadas. Não existe entidade
de Variante: separação explícita dos Cursos é suficiente e evita transformar a
comparação num histórico universal.

Analytics ajuda a conferir o desenho produzido, mas uma conclusão sobre
aprendizagem exige participantes, instrumentos e análise próprios.

## Pessoas e acesso

Somente a pessoa proprietária edita o Curso e usa sua Autoria conversacional.
Um acesso direto concede Estudo no Curso original. Se quem estuda editar esse
conteúdo, a aplicação cria um Curso privado próprio; o original não muda.

Fontes privadas, PDFs, Observações e Analytics seguem a mesma autorização do
Curso. Ocultar um controle na interface não substitui a recusa no servidor.

## Conexão e recuperação

Estudo pode usar a última composição local válida. Progresso e Observações
possuem filas próprias para retomada. Planejamento, produção, configuração,
Fontes, revisão e Analytics precisam do estado remoto corrente.

Se uma resposta de escrita se perder, consulte o objeto antes de repetir. Em
conflito, releia e reconcilie a intenção. Não tente forçar números de revisão ou
identidades internas.

O Curso é mutável; recuperação técnica vem de Git, backup e restauração. Quando
uma pesquisa precisar congelar uma condição, exporte explicitamente o estado e
a configuração pertinentes.

## Checklist de revisão autoral

Antes de considerar uma Parte pronta, confira:

- todo conhecimento necessário aparece no inventário e foi ensinado;
- o teto distribuiu novidade sem ampliar artificialmente AnalysisUnits;
- exemplos, contrastes e representações cumprem uma função clara;
- prática é abundante e varia nas dimensões definidas;
- Fontes e Âncoras sustentam o papel declarado;
- direção editorial não retirou conteúdo necessário;
- Observações abertas foram consideradas no contexto afetado;
- o resultado funciona em tela pequena, por teclado e com foco correto.

Para percursos conversacionais completos, consulte [Criar e revisar Cursos por
conversa](criar-cursos-pelo-chat.md), [Autoria pelo MCP](autoria-mcp.md) e
[Autoria por Actions](autoria-actions.md).
