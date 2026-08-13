# Revisão de literatura

## Escopo e método

Esta é uma revisão narrativa orientada ao design do AraLearn. Ela organiza
fontes já verificadas para explicitar decisões, controvérsias e lacunas do
artefato. Não é uma revisão sistemática e não deve ser apresentada como tal.
Buscas futuras da dissertação precisam registrar bases, descritores, datas,
critérios de inclusão, seleção e avaliação de qualidade.

A unidade de análise não é “tecnologia educacional funciona?”, mas a relação:

```text
problema situado → construto → mecanismo de design → manifestação observável
→ interpretação limitada → avaliação
```

As referências bibliográficas canônicas ficam em [referencias.bib](referencias.bib).
A matriz que liga teoria e código fica em [Matriz de rastreabilidade
pedagógica](matriz-rastreabilidade-pedagogica.md).

## Estudante-trabalhador, mobilidade e autodireção

O público do AraLearn estuda em períodos curtos, sujeitos a interrupção e com
conectividade variável. Esse contexto justifica investigar portabilidade,
retomada e carga operacional; não prova que fragmentar conteúdo melhora a
aprendizagem. A revisão de interfaces móveis de Ahmad Faudzi et al. (2023)
mostra diversidade de frameworks e reforça a necessidade de avaliação situada.
Lai, Saab e Admiraal (2022) encontraram estratégias cognitivas,
metacognitivas, sociais e afetivas no uso autodirigido de tecnologia móvel,
mas num domínio específico de aprendizagem de línguas.

De Gagne et al. (2019) localizaram apenas 17 estudos de microlearning na
educação de profissionais da saúde. A variedade de intervenções e contextos
impede tratar “microlearning” como dose universal. No AraLearn,
**microssequência** é uma unidade operacional intermediária entre card e lição;
sua duração e composição precisam ser avaliadas, não presumidas.

## Carga cognitiva e representações

Sweller (1988) e Sweller, Van Merriënboer e Paas (1998) sustentam examinar a
carga extrínseca criada pelo desenho da tarefa. Mayer (2009), Ainsworth (2006)
e trabalhos sobre atenção dividida ajudam a justificar contiguidade,
segmentação e escolha de representações. Essas teorias não autorizam concluir
que qualquer diagrama, card curto ou interface minimalista reduz carga.

O catálogo extensível de packages trata forma como parte do conteúdo quando a
operação depende de estrutura tabular, espacial, hierárquica, relacional,
linguística, sistêmica ou química. A revisão específica, incluindo evidências
contrárias e limites de transferência, está em [Fundamentação pedagógica dos
resources](fundamentacao-pedagogica-dos-resources.md).

## Recuperação, exemplos, espaçamento e feedback

Prática de recuperação pode favorecer retenção posterior (Karpicke & Roediger,
2008), enquanto exemplos resolvidos e retirada gradual de apoio podem ser
úteis na aquisição inicial. O efeito depende do conhecimento prévio, da tarefa
e do apoio. Espaçamento e intercalação também possuem moderadores; por isso o
AraLearn registra dependências e retomadas sem impor intervalo universal.

Feedback formativo não é apenas a exibição de uma resposta. Nicol e
Macfarlane-Dick (2006), Shute (2008), Carless e Boud (2018) e Wood (2021)
destacam interpretação, autorregulação, diálogo e possibilidade de ação. Isso
orienta feedback localizado e observações situadas, mas não permite inferir
compreensão a partir de clique, resposta revelada, categoria ou ausência de
comentário.

## Agência, autorregulação e colaboração

Zimmerman (2002) descreve autorregulação como ciclo de planejamento,
desempenho e reflexão. O AraLearn oferece escopo escolhido, trilhas, progresso
de retomada e autoria, sem declarar que a interface produz autorregulação.
Freire (1996) ajuda a distinguir autonomia de abandono; Vygotsky (1978) e a
literatura de scaffolding situam mediação e apoio.

Wenger (1998) e Bridwell-Mitchell (2016) ajudam a investigar participação e
agência em práticas compartilhadas. Papéis de workspace são, contudo,
primeiro um mecanismo de responsabilidade e acesso. Pertencer a um workspace
ou possuir um papel não constitui evidência de colaboração ou aprendizagem.

## IA generativa, RAG e responsabilidade

RAG combina geração e recuperação de informação (Lewis et al., 2020). O MCP do
AraLearn emprega recuperação lexical estreita de instruções e contratos; isso
reduz contexto repetido, mas não garante factualidade pedagógica. A assistência
bottom-up recebe alvo delimitado, usa saída estruturada, valida a mudança e a
registra diretamente. No card, uma conversa curta conserva versões locais para
desfazer, refazer e restaurar sem persistir o diálogo no curso.

A orientação da UNESCO (2023) enfatiza abordagem centrada nas pessoas,
proteção de dados, adequação pedagógica e responsabilidade humana. No AraLearn,
LLM não recebe autoridade para ampliar o escopo selecionado, publicar ou
interpretar analytics sem contrato e ação humana correspondente.

## Learning analytics e risco de vigilância

Tsai e Martinez-Maldonado (2022) tratam feedback informado por dados como
processo humano e dialógico, com participação de estudantes e professores.
Prinsloo e Slade (2017) situam privacidade e ética como condições da prática de
analytics, não como adições posteriores.

Por isso, #63 fica limitada a perguntas pedagógicas previamente declaradas.
Abertura, tempo, clique, tentativa e resposta revelada não serão usados como
proxies de atenção, esforço ou domínio. Observações explícitas e estados de
retomada podem apoiar decisão, desde que a interpretação e a intervenção
estejam documentadas antes da coleta.

## Pesquisa e avaliação do artefato

O Design-Based Research Collective (2003) relaciona teoria, intervenção e
prática em contextos complexos. Hevner et al. (2004) distinguem a construção e
avaliação rigorosa de artefatos em design science. O AraLearn usa essas
tradições como orientação metodológica complementar: ciclos de construção
precisam produzir tanto um artefato utilizável quanto conhecimento sobre os
mecanismos e limites observados.

O protocolo correspondente está em [Protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).

## Lacunas que permanecem abertas

- compreender uso real por estudantes-trabalhadores em condições de
  interrupção, cansaço e conectividade variável;
- comparar unidade curta com coerência do percurso, evitando superficialidade;
- avaliar compreensão, retenção e transferência separadamente de usabilidade;
- observar se Ler/Editar e autoria assistida preservam agência;
- avaliar se observação → retorno → melhoria forma um ciclo compreensível;
- investigar efeitos e riscos de workspaces em contextos pessoais e coletivos;
- definir qualquer indicador de analytics antes de armazená-lo;
- comparar sistematicamente o conjunto integrado do AraLearn com LMS,
  flashcards, microlearning, tutores, ferramentas de autoria por IA e sistemas
  local-first.

## Sínteses relacionadas

- [Quadro teórico](quadro-teorico.md)
- [Glossário de construtos](glossario-construtos.md)
- [Modelo didático](modelo-didatico.md)
- [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
- [Contribuição e originalidade](contribuicao-originalidade.md)
