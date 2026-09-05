# Analytics da autoria

A área **Analytics** descreve, com números simples, o estado atual de um curso:

1. como o conteúdo foi desenhado;
2. onde houve intervenção humana explícita.

Ela não reconstitui a execução técnica, não atribui nota de qualidade e não
mede aprendizagem ou participação humana. Os números caracterizam o artefato e
ações observáveis.

## Como consultar

1. Abra um curso próprio em **Autoria**.
2. Entre em **Analytics**.
3. Selecione o escopo: curso, parte, microssequência ou unidade de estudo.
4. Leia os números de **Desenho** e **Autoria**.
5. Expanda somente a tabela necessária para conferir sua composição.

Uma referência interna localiza o recorte, mas a interface mostra seu nome
humano. Parte, nesse seletor, é apenas um lote de produção; não é nível do mapa
curricular.

## Desenho

A síntese apresenta:

- unidades de estudo no escopo;
- unidades de análise, isto é, ideias semanticamente acompanhadas no percurso;
- oportunidades de prática;
- fontes relacionadas.

Essas quantidades descrevem presença e distribuição. Não substituem a inspeção
sequencial do conteúdo.

### Configuração aplicada

A tabela usa as doze definições do catálogo 1.2.0 e mostra as escolhas
efetivamente registradas. Quatro delas são parâmetros pedagógicos:

- teto de ideias novas por unidade expositiva;
- formas de explicação requeridas;
- mínimo de oportunidades distintas de prática por requisito;
- dimensões de variação requeridas para a prática.

Duas definições são alvos editoriais quantitativos flexíveis:

- palavras por resposta de autoria;
- palavras por unidade de estudo.

As demais orientam distribuição e posição das práticas, granularidade de parte
e lote, frequência de pausa e preferência da conversa. Parte, lote e pausa têm
escopo de curso. O catálogo organiza essas decisões em conteúdo, prática,
conversa e cadência; não presume que uma intenção automática ainda sem valor
tenha sido aplicada.

Quando unidades do mesmo escopo usam valores diferentes, a distribuição informa
quantas receberam cada valor, sua origem — calibração contextual, decisão da
pessoa autora ou condição de pesquisa —, o escopo e as unidades em que foram
aplicados. Direção editorial permanece separada. Para o conteúdo, a extensão
observada informa total, mínimo, mediana, média e máximo de palavras por
unidade, o que permite comparar alvo e resultado sem tratar a diferença como
erro automático.

As direções editoriais são camadas acumuladas ao longo dos escopos. Uma mesma
unidade pode receber, por exemplo, uma direção do curso e outra da
microssequência. Portanto, suas contagens podem se sobrepor e não formam uma
partição das unidades do recorte.

O modo automático exige uma escolha contextual registrada; a ausência de valor
não representa um preset fixo. Herdar e fixar são intenções distintas. Um valor
fixado deliberadamente pelo pesquisador prevalece e aparece como definição
explícita. Isso permite investigar diferentes desenhos sem
transformar uma aplicação específica em padrão universal.

Os alvos de palavras não são mínimos ou máximos, não medem qualidade e não
autorizam comprimir conhecimento, ocultar decisões ou fragmentar unidades. A
distribuição observada descreve o artefato produzido; não julga sua adequação.
O alvo de resposta de autoria caracteriza o desenho configurado. Ele não é
tratado como medida de uma conversa observada: o AraLearn não persiste
transcrição para Analytics.

### Conteúdo e representações

As tabelas relacionam:

- cada ideia acompanhada e suas introduções, usos e retomadas;
- a distribuição de novidades entre unidades;
- formas explicativas aplicadas;
- componentes e representações usados.

Comparar tetos diferentes não autoriza agrupar ideias independentes numa unidade
de análise maior. O repertório pode permanecer igual enquanto sua distribuição
entre unidades muda.

### Prática e fontes

A última tabela de desenho apresenta:

- oportunidades por requisito de evidência;
- oportunidades que exercitam cada dimensão de variação;
- fontes, âncoras e unidades relacionadas, agrupadas pelo papel da fonte.

Contar uma oportunidade não demonstra que alguém aprendeu. O número informa
apenas que o artefato oferece aquela prática.

## Autoria

A síntese mostra:

- observações humanas ainda abertas;
- parâmetros definidos explicitamente e ainda vigentes;
- unidades cuja última revisão observável foi manual.

A tabela complementar informa observações criadas e resolvidas e agrupa unidades
pela origem de sua criação e última revisão. Essas contagens não formam
percentual de autoria nem score de colaboração. Ausência de intervenção
registrada não significa concordância.

Quando a origem corrente não pode ser atribuída com segurança, Analytics a
mantém ausente; não converte desconhecimento em zero nem reconstrói uma história
por inferência.

## De onde vêm os números

Analytics deriva o snapshot das autoridades correntes sempre que possível:
estrutura, planejamento, configuração efetiva, unidades, componentes, fontes,
âncoras e observações. Intervenções humanas entram apenas quando o estado
corrente conserva origem explícita com significado estável.

A decisão histórica de desenho e a aplicação semântica corrente são distintas.
Editar apenas o título conserva ambas sem atualizar a data da decisão. Alterar
o conteúdo ou a posição na estrutura conserva a decisão histórica, mas retira
os mapeamentos anteriores da análise corrente até uma nova aplicação validada.
Essa ausência é informada; não se deduz que o conteúdo novo conserva as mesmas
ideias somente porque usa os mesmos componentes.

O contrato técnico `aralearn.course-authoring-analytics.v3` contém somente o
curso e o escopo, desenho quantitativo, autoria quantitativa, dados ausentes e
um endereço opcional.

O AraLearn não transforma conversa, raciocínio privado, cliques, rolagem ou
tempo em tela numa segunda história do curso.

## Exportar

O botão **Baixar dados de autoria** salva um JSON com o mesmo snapshot
normalizado mostrado na tela, incluindo a configuração efetivamente aplicada e
selada na materialização das unidades. Esse estado pode ser confrontado entre
publicações ou cópias experimentais, desde que o protocolo preserve também o
artefato correspondente.

O arquivo não é uma cópia completa do curso, não congela sozinho o artefato e
não cria uma versão imutável. Uma investigação que precise reproduzir conteúdo,
parâmetros e condições deve usar também uma exportação explícita do artefato.
Isso dispensa ledger ou histórico universal dentro do curso corrente.

## Limites de interpretação

Analytics caracteriza o desenho instrucional e intervenções observáveis. Não
mede compreensão, retenção, transferência, atenção, esforço, dificuldade ou
qualidade global. Esses resultados exigem pergunta, população, instrumento,
tratamento de dados ausentes e análise definidos no protocolo da pesquisa.

Consulte o [Guia do pesquisador](guia-pesquisador.md) para formular perguntas e
registrar limites de inferência.
