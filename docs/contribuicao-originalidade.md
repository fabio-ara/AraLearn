# Contribuição e originalidade

## Posição cautelosa

A originalidade do AraLearn não foi demonstrada por revisão sistemática,
patenteabilidade, estudo de mercado exaustivo ou avaliação comparativa completa.
Este documento formula uma **contribuição integrada a investigar**. Não afirma
que o produto seja o primeiro, único ou superior.

Gregor e Hevner (2013) recomendam posicionar contribuições de Design Science
Research em relação à maturidade do problema e da solução. No estado atual, o
AraLearn combina componentes conhecidos para um problema situado e introduz
alguns mecanismos de integração cuja utilidade e transferibilidade precisam
ser avaliadas. A contribuição pode envolver artefato, princípios de design,
explicações de mecanismo, método de avaliação e resultados negativos.

## Problema de integração

Famílias existentes cobrem partes relevantes:

- LMS organizam oferta, matrícula, papéis e acompanhamento institucional;
- flashcards e repetição espaçada apoiam revisão;
- ambientes de microlearning distribuem unidades curtas;
- tutores inteligentes e chats com IA explicam ou geram conteúdo;
- ferramentas de autoria produzem cursos e objetos;
- bibliotecas de visualização representam domínios específicos;
- learning analytics apresentam dados de percurso;
- sistemas local-first mantêm réplicas no dispositivo.

O problema investigado não é a ausência absoluta desses componentes. É a
coordenação, num app móvel e frugal, de estudo profundo, prática variada,
representação acadêmica, retomada offline, autoria em duas escalas, proveniência,
controle humano da IA e recusa de proxies comportamentais punitivos.

## Configuração investigada

```text
necessidade educacional
→ planejamento antes do custo de produção
→ composição por partes correntes
→ teoria progressiva sem quantidade fixa
→ resource escolhido pelo gesto cognitivo
→ prática variada e feedback acionável
→ estudo móvel/offline e retomada
→ observação situada
→ reparo humano ou assistido de alvo mínimo
→ versão distribuível
→ avaliação DBR/DSR
```

Nenhuma seta é um efeito demonstrado. A cadeia é uma teoria de mudança
provisória.

## Camadas de contribuição possíveis

### C1 — artefato instanciado

Um kernel de curso que compõe packages independentes, contratos especializados,
persistência local-first, autoria por MCP e assistência contextual por API. A
evidência é técnica: código, schemas, testes, build e execução reproduzível.

### C2 — arquitetura de representação

Um catálogo legível por máquina e por autor organiza resources por intenção,
gesto cognitivo, domínio, operação, risco e affordance. O agente consulta a
lista antes do contrato específico, permitindo expansão sem contrato
monolítico. A contribuição não é “usar Graphviz/Vega/MathML”, mas separar
semântica autoral, package acadêmico e kernel de execução.

### C3 — modelo didático operacional

Microssequência articula pré-requisitos, explicação progressiva, exemplo,
prática e feedback em quantidade variável. “Microssequência” e “microteoria”
são termos do artefato; só se tornam contribuição teórica após avaliação e
abstração além do caso.

### C4 — autoria em duas escalas

Autoria top-down compõe curso e partes por chat/MCP. Autoria bottom-up mantém o
card visível, separa contexto somente leitura de texto gravável, permite
conversa iterável e conserva versões reversíveis. A contribuição possível está
na coordenação de escopo, contrato, revisão e responsabilidade, não no uso de
LLM em si.

### C5 — governança e proveniência frugais

Partes correntes, histórico de mudanças, papéis locais e publicação como
materialização explícita podem apoiar auditoria sem copiar integralmente o
curso a cada ação. A alegação precisa ser sustentada por medidas de
armazenamento, conflito, compreensão de permissões e capacidade de reconstruir
decisões.

### C6 — ciclo qualitativo de melhoria

Observações voluntárias permanecem situadas no card, recebem retorno e podem
ser relacionadas a reparo confirmado. O desenho privilegia manifestação e
diálogo em vez de inferir dificuldade de telemetria ambígua.

### C7 — recusa produtiva de analytics

O AraLearn não armazena tentativas, tempo, ranking ou proxies de atenção por
padrão. Um indicador futuro exige pergunta, construto, manifestação,
intervenção, limite e custo anteriores à coleta. Essa escolha é contribuição
normativa e de governança; seus efeitos ainda precisam ser investigados.

### C8 — conhecimento de design e limites

Os episódios podem produzir princípios condicionais, por exemplo: “quando uma
tarefa depende de estrutura relacional e o estudante conhece a convenção, um
package especializado pode reduzir tradução; quando a convenção é desconhecida,
o mesmo package pode aumentar carga”. Princípios devem incluir contexto,
mecanismo, resultado, evidência e caso de falha.

## Matriz de novidade a investigar

| Dimensão | Elementos conhecidos | Configuração do AraLearn | Comparação necessária |
| --- | --- | --- | --- |
| escala didática | aula, lição, objeto, card, microlearning | microssequência sem duração fixa e sem teoria resumida | coerência, profundidade e manejabilidade |
| representação | multimídia e bibliotecas de gráficos | catálogo semântico + package + contrato progressivo | adequação da escolha e compreensão por domínio |
| prática | quiz, flashcard, gap, resposta aberta | resposta incorporada ao objeto e selecionada pela operação | recuperação, retenção e transferência |
| autoria | editor, chat, gerador de curso | top-down por MCP + bottom-up contextual/reversível | esforço, erro de escopo e qualidade |
| persistência | LMS remoto, cache, exportação | réplica local + partes correntes + versão distribuível | offline, conflito, armazenamento e auditabilidade |
| governança | papéis globais e publicação | workspace local, proveniência e capacidades revogáveis | compreensão, segurança e coordenação |
| feedback | resultado automático e comentário | feedback de prática + observação situada + reparo | interpretação, ação e responsabilidade |
| analytics | dashboard e predição | coleta somente após pergunta/intervenção | utilidade que permanece sem vigilância |

## Alegações por nível de evidência

### Permitidas por inspeção e teste técnico

- o artefato implementa packages versionados sob um kernel comum;
- o catálogo permite descobrir intenção antes de solicitar contrato;
- autoria bottom-up e top-down usam escopos distintos;
- versões locais permitem desfazer, refazer e restaurar no fluxo definido;
- estudo sincronizado funciona offline nos cenários automatizados;
- observações são situadas e não precisam copiar o card;
- armazenamento, payload e jornadas possuem verificações versionadas.

Essas alegações devem apontar para a [Matriz de conformidade
técnica](matriz-conformidade-tecnica.md).

### Permitidas somente após avaliação de uso

- pessoas leigas compreendem percurso, resources, papéis e reversão;
- a retomada reduz atrito sob interrupção real;
- o catálogo melhora a seleção autoral de representação;
- a assistência reduz erro de escopo ou retrabalho;
- workspaces sustentam coordenação compreensível;
- o ciclo observação → retorno → reparo produz ação útil.

### Permitidas somente após avaliação de aprendizagem

- uma intervenção melhora compreensão, retenção ou transferência;
- microssequências preservam profundidade melhor que alternativa;
- um resource reduz carga extrínseca ou melhora interpretação;
- prática e feedback favorecem aprendizagem posterior;
- desenho não punitivo altera ansiedade ou estratégia.

### Ainda proibidas

- o AraLearn é universalmente eficaz;
- microssequências são superiores a aulas, textos ou flashcards;
- mais resources significam maior qualidade;
- ausência de gamificação reduz ansiedade;
- IA delimitada produz cursos corretos;
- workspaces aumentam colaboração;
- modo claro, escuro ou minimalista reduz carga;
- publicação representa aprovação acadêmica;
- o artefato é único ou primeiro em sua combinação.

## Contribuição negativa e resultados adversos

Remover um resource redundante, abandonar uma representação incompreensível,
demonstrar que um controle de IA é apenas simbólico ou identificar que uma
microssequência fragmenta o conteúdo são resultados relevantes. O programa
deve publicar:

- mecanismos que não funcionaram;
- populações ou domínios em que falharam;
- custos e efeitos adversos;
- mudanças de hipótese;
- packages fundidos, retirados ou restringidos;
- resultados nulos e explicações rivais sobreviventes.

Essa documentação reduz viés de sobrevivência e torna a contribuição útil para
outros projetos.

## Evidência necessária para sustentar a contribuição

| Contribuição | Evidência mínima | Evidência mais forte |
| --- | --- | --- |
| artefato/kernel/packages | código, schema, testes e build reproduzível | avaliação externa de arquitetura e manutenção longitudinal |
| catálogo progressivo | contrato e busca demonstrados | comparação de seleção, erro e contexto com alternativa monolítica |
| modelo didático | rubrica e casos de estresse | ciclos DBR com novatos, retenção e transferência |
| autoria em duas escalas | tarefas completas e escopo preservado | comparação de qualidade, retrabalho e controle percebido |
| local-first/frugalidade | offline, sync, bytes e custos | uso longitudinal sob rede e dispositivos reais |
| workspace/proveniência | isolamento, revogação e reconstrução | coordenação real e compreensão de responsabilidade |
| observação situada | registro, retorno e reparo reencontráveis | evidência de ação e melhoria, com casos negativos |
| recusa de proxies | ausência técnica e política explícita | co-design e comparação de decisões legítimas sem vigilância |

## Forma de comunicação na dissertação ou tese

Cada alegação deve seguir:

```text
contribuição alegada
→ problema e literatura relacionada
→ artefato/princípio produzido
→ episódio de avaliação
→ evidência e incerteza
→ explicação rival
→ limite de transferência
```

A seção de contribuição deve separar: (a) o que foi construído; (b) o que foi
demonstrado tecnicamente; (c) o que foi observado com participantes; (d) o que
foi aprendido sobre design; e (e) o que permanece hipótese.

## Relações documentais

- [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
- [Revisão de literatura](revisao-de-literatura.md)
- [Quadro teórico](quadro-teorico.md)
- [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
- [Protocolo de avaliação](protocolo-avaliacao-artefato.md)
- [Visão do produto](visao-do-produto.md)
- [Arquitetura](arquitetura.md)
