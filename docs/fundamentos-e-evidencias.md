# Fundamentos e evidências

Este documento separa:

- decisões apoiadas por literatura;
- decisões de engenharia plausíveis, mas não diretamente testadas no AraLearn;
- hipóteses ainda abertas, que exigem avaliação empírica própria.

Ele existe para evitar duas distorções:

- prometer mais do que a evidência sustenta;
- esconder escolhas normativas atrás de linguagem técnica.

## Como ler este documento

Cada bloco abaixo usa três rótulos:

- `amparado`: há literatura suficientemente próxima para justificar a direção;
- `escolha de engenharia`: a decisão é razoável, mas deriva mais de restrição do produto do que de evidência direta;
- `hipótese aberta`: a decisão precisa de teste específico no AraLearn.

## 1. Microssequências pequenas

### Decisão do AraLearn

O AraLearn organiza o estudo em microssequências pequenas, com progressão local e cards enxutos.

### Status

`amparado`, com ressalvas.

### Base

- A literatura de microlearning sugere utilidade para unidades pequenas, especialmente em contextos móveis e de retomada, mas também alerta que microlearning isolado não basta para percursos mais amplos.
- Isso combina com a escolha do AraLearn de usar unidades pequenas dentro de uma hierarquia maior, e não como única forma de aprendizagem.

### O que a evidência não autoriza dizer

- que “pequeno” é sempre melhor;
- que qualquer fragmentação melhora retenção;
- que microlearning substitui curso, aula, leitura longa ou estudo aprofundado.

## 2. Prática ativa em vez de resumo

### Decisão do AraLearn

O app privilegia prática, recuperação ativa, lacunas e checagem de domínio em vez de resumo genérico.

### Status

`amparado`.

### Base

- Revisões de técnicas de estudo colocam `practice testing` e `distributed practice` entre as estratégias de maior utilidade.
- O efeito de teste e a recuperação ativa têm boa sustentação empírica.

### Implicação para o produto

O AraLearn deve preferir:

- pedir resposta;
- pedir escolha;
- pedir reconstrução;
- pedir aplicação;

em vez de só recontar o conteúdo.

## 3. Exemplo guiado antes de prática difícil

### Decisão do AraLearn

O percurso preferido é:

1. contexto;
2. microteoria;
3. exemplo guiado;
4. prática;
5. consolidação.

### Status

`amparado`.

### Base

- A literatura sobre worked examples e cognitive load sustenta o uso de exemplos resolvidos, especialmente para novatos.
- Também sustenta cautela com descoberta desassistida e com salto prematuro para resolução sem apoio.

### Implicação para o produto

O AraLearn não deve tratar “exemplo” como ornamento. Ele é parte da mediação.

## 4. Feedback corretivo no próprio ciclo

### Decisão do AraLearn

Cards de prática precisam ter feedback corretivo quando o formato exige.

### Status

`amparado`.

### Base

- A literatura sobre feedback mostra que ele é mais útil quando ajuda a preencher uma lacuna entre o estado atual e o objetivo da tarefa.
- Meta-análises também mostram que os efeitos de feedback variam e dependem do tipo de feedback.

### Implicação para o produto

O feedback do AraLearn deve priorizar:

- a tarefa;
- o processo;
- o próximo passo;

e não elogio vazio ou repetição da resposta.

## 5. Cobertura separada de repetição

### Decisão do AraLearn

O app separa `domainItem` de `practiceVariant`.

### Status

`escolha de engenharia` fortemente inspirada pela literatura.

### Base

- A literatura ajuda a justificar variação de prática, worked examples, feedback e foco em capacidades.
- Mas o esquema específico `domainItem` + `practiceVariant` é desenho do AraLearn, não padrão consolidado da área.

### Implicação para o produto

Essa separação deve ser tratada como modelo operacional do app, não como verdade teórica universal.

## 6. LLM sob contrato curto e controlado

### Decisão do AraLearn

O app restringe a LLM com:

- contratos pequenos;
- listas fechadas;
- `cardPlan` determinístico;
- validação local;
- reiteração curta.

### Status

`amparado`.

### Base

- Trabalhos sobre controlled natural language mostram que tradução confiável entre linguagem livre e estrutura formal continua problemática.
- Trabalhos sobre heurísticas em NLP mostram que sistemas fortes ainda acertam muitas vezes por pistas superficiais.
- Portanto, restringir tarefa, saída e vocabulário é mais defensável do que pedir “entendimento pedagógico livre”.

### Implicação para o produto

O AraLearn não deve vender “compreensão semântica plena” do texto. Deve vender restrição de tarefa e validação local.

## 7. Heurísticas textuais fracas

### Decisão do AraLearn

A checagem didática usa heurísticas textuais, mas agora as rebaixa a sinal fraco quando não há base estrutural ou declarativa suficiente.

### Status

`amparado`.

### Base

- Literatura de avaliação automática e NLP mostra que sinais superficiais podem ser úteis, mas também frágeis e sujeitos a erro.
- O AraLearn, portanto, não deve bloquear nem reiterar automaticamente só porque um texto “parece genérico”.

### Implicação para o produto

Sinais textuais devem servir para:

- aviso;
- revisão assistida;
- melhoria futura de prompts e contratos;

e não como falso julgamento semântico forte.

## 8. Local-first e offline-first

### Decisão do AraLearn

O app trata persistência local como trilha principal e rede como apoio, não como pré-requisito constante.

### Status

`amparado`.

### Base

- A literatura e a engenharia de local-first software sustentam autonomia local, progresso offline e redução de dependência da nuvem.
- Há também trabalhos sobre segurança e consistência em sistemas local-first.

### Implicação para o produto

O AraLearn deve preservar:

- operação local;
- exportabilidade;
- reversibilidade;
- separação entre contrato estrutural e backup completo.

## 9. Mobile-first

### Decisão do AraLearn

O app privilegia experiência móvel e celular como condição real de uso.

### Status

`amparado`, mas ainda com necessidade de evidência própria.

### Base

- Revisões de mobile-based microlearning em adultos sugerem potencial em contextos de aprendizagem móvel.
- A própria literatura também mostra que esse campo ainda precisa de estudos mais situados por domínio e desenho didático.

### Implicação para o produto

Faz sentido otimizar para uso móvel, mas o AraLearn ainda precisa medir:

- qualidade real de retomada;
- fricção de leitura;
- efeito do tamanho dos cards;
- custo cognitivo em viewport pequena.

## 10. Prestação de contas e revisão humana

### Decisão do AraLearn

O app mantém:

- aceitação/exclusão de iteração;
- separação entre rascunho e estudo;
- rastreabilidade mínima por `sourceRefs`;
- documentação explícita das limitações.

### Status

`amparado`.

### Base

- Revisões sobre smart technology em educação apontam a necessidade de accountability e maior pesquisa sobre impactos.
- Isso reforça a escolha do AraLearn de não tratar saída de IA como verdade final nem como conteúdo autojustificado.

## 11. O que ainda não está amparado o suficiente

Os pontos abaixo não devem ser apresentados como “comprovados”:

- quantidade ideal de cards por microssequência;
- thresholds exatos das heurísticas textuais;
- efeito dos presets específicos do AraLearn;
- superioridade de um tipo de card em cada disciplina;
- efeito do `domainMap` sobre retenção real;
- ganho líquido da continuação automática sobre revisão manual;
- impacto do versionamento local sobre aprendizagem.

Esses itens são `hipótese aberta`.

## 12. Política de documentação do produto

Ao documentar o AraLearn:

- diferenciar evidência, hipótese e escolha de engenharia;
- evitar prometer “entendimento” quando há só heurística;
- registrar decisões que nasceram de restrição operacional;
- atualizar referências quando a arquitetura mudar.

## Referências

Aprendizagem, prática e feedback:

- Roediger, H. L., & Karpicke, J. D. (2006). *Test-enhanced learning: taking memory tests improves long-term retention*. Psychological Science. https://pubmed.ncbi.nlm.nih.gov/16507066/
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). *Improving Students’ Learning With Effective Learning Techniques*. APS. https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html/comment-page-1
- Hattie, J., & Timperley, H. (2007). *The Power of Feedback*. Review of Educational Research. https://assess.ucr.edu/sites/g/files/rcwecm2336/files/2019-02/hattietimperley_2007.pdf
- Wisniewski, B., Zierer, K., & Hattie, J. (2020). *The Power of Feedback Revisited: A Meta-Analysis of Educational Feedback Research*. Frontiers in Psychology. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.03087/full
- Sweller, J., & Cooper, G. A. (1985). *The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra*. https://onderwijs.felienne.nl/vakdidactiek/materiaal/sweller_worked_examples.pdf
- van Gog, T. (2018). *Learning How to Solve Problems by Studying Examples*. https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/632DFF3E1B3166EB325A59BD6028B6EA/9781108416016c8_183-208.pdf/learning-how-to-solve-problems-by-studying-examples.pdf
- Wieman, C. E., Salehi, S., & Burkholder, E. W. (2019). *DIY productive failure: boosting performance in a large undergraduate biology course*. npj Science of Learning. https://www.nature.com/articles/s41539-019-0040-6

Microlearning e mobile learning:

- Mohammed, G. S., Wakil, K., & Nawroly, S. S. (2018). *The effectiveness of microlearning to improve students’ learning ability*. https://doi.org/10.3991/ijim.v12i3.7983
- Sankaranarayanan, S., et al. (2024). *A systematic review of mobile-based microlearning in adult learner contexts*. https://doaj.org/article/b6b940948b034e489c5bd28c73307897
- Rof, A., et al. (2024). *Exploring learner satisfaction and the effectiveness of microlearning in higher education*. The Internet and Higher Education, 62, 100952. https://repositori.tecnocampus.cat/bitstream/handle/20.500.12367/2941/rof_internethigheduc_expl.pdf?isAllowed=y&sequence=1

LLM, linguagem controlada e limites semânticos:

- Neuhaus, F., & Barkmeyer Jr., E. (2013). *RECON -- A Controlled English for Business Rules*. NIST. https://www.nist.gov/publications/recon-controlled-english-business-rules
- Njonko, P. B. F., Cardey, S., Greenfield, P., & El Abed, W. (2014). *RuleCNL: A Controlled Natural Language for Business Rule Specifications*. https://arxiv.org/abs/1406.2096
- McCoy, T., Pavlick, E., & Linzen, T. (2019). *Right for the Wrong Reasons: Diagnosing Syntactic Heuristics in Natural Language Inference*. ACL Anthology. https://aclanthology.org/P19-1334/

Arquitetura local-first e accountability:

- Kleppmann, M., Wiggins, A., van Hardenberg, P., & McGranaghan, M. (2019). *Local-first software: You own your data, in spite of the cloud*. https://www.inkandswitch.com/essay/local-first/
- Haas, D., et al. (2023). *LoRe: A Programming Model for Verifiably Safe Local-First Software*. https://arxiv.org/abs/2304.07133
- Høiland-Jørgensen, M., et al. (2021). *Augmenting SQLite for Local-First Software*. https://munin.uit.no/handle/10037/24430
- Garshi, A., Jakobsen, M. W., Nyborg-Christensen, J., Ostnes, D., & Ovchinnikova, M. (2020). *Smart technology in the classroom: a systematic review. Prospects for algorithmic accountability*. https://arxiv.org/abs/2007.06374
