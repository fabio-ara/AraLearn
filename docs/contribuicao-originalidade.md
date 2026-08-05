# Contribuição e originalidade

## Posição cautelosa

A originalidade do AraLearn não foi demonstrada por revisão sistemática nem por
avaliação comparativa completa. Portanto, este documento formula uma
**contribuição integrada a investigar**, não uma declaração de primazia.

## Problema de integração

Ferramentas existentes cobrem partes relevantes:

- LMS organizam oferta, matrícula e acompanhamento institucional;
- flashcards e repetição espaçada apoiam revisão;
- ambientes de microlearning distribuem unidades curtas;
- wikis, buscadores e cadernos apoiam consulta e organização;
- tutores e chats com IA explicam ou geram conteúdo;
- ferramentas de autoria produzem cursos e objetos;
- analytics apresentam dados de percurso;
- aplicativos offline mantêm conteúdo no dispositivo.

O AraLearn investiga a integração frugal destas necessidades para a mesma
pessoa estudar, observar, revisar e criar sem transformar cada operação em
cópia integral ou cada rastro em julgamento.

## Síntese investigada

```text
necessidade específica
→ planejamento assistido
→ composição por partes correntes
→ microssequências com representação adequada
→ prática não punitiva
→ estudo móvel e offline
→ retomada
→ observação situada e retorno
→ melhoria humana ou assistida de alvo mínimo
→ nova publicação
→ avaliação
```

## Componentes da contribuição

### Escala didática intermediária

A microssequência tenta preservar contexto que o card isolado perde e
manejabilidade que a lição extensa pode perder em uso móvel. “Microteoria” é
um termo operacional, não um novo construto pedagógico estabelecido.

### Autoria assistida em duas escalas

O fluxo top-down usa chat, recuperação e operações atômicas para compor curso,
módulo, lição e microssequência. O bottom-up mantém o card em estudo, delimita
resources, cards ou microssequências, valida internamente e grava o resultado
de modo direto e reversível. A contribuição possível está na coordenação dessas
escalas sob o mesmo contrato, não no uso de LLM em si.

### Composição frugal e publicação explícita

Workspaces guardam uma linha corrente por parte. Publicar compõe um JSON
imutável; selecionar um curso cria vínculo, não cópia. Essa arquitetura deve
ser comparada por armazenamento, manutenção, conflito e compreensão do usuário.

### Ciclo qualitativo de melhoria

Observações permanecem situadas no card, recebem resposta e podem ser ligadas a
reparo confirmado. O ciclo privilegia manifestação explícita e diálogo em vez
de inferir atenção ou dificuldade de telemetria ambígua.

### Analytics por recusa produtiva

O AraLearn trata como decisão de design não armazenar tentativas, tempo em
tela, ranking ou inferências de atenção. Indicadores futuros só entram quando
pergunta, construto, intervenção, limite e custo estiverem definidos. A
originalidade possível está tanto no que o sistema integra quanto no que se
recusa a medir.

## Matriz comparativa a executar

| Família | Comparar | Pergunta para o AraLearn |
| --- | --- | --- |
| LMS | autoria, papéis, publicação, acompanhamento | é possível coordenar sem a complexidade e vigilância comuns? |
| flashcards | recuperação, espaçamento, retomada | microssequência preserva mais coerência sem perder leveza? |
| microlearning | tamanho, contexto e continuidade | a unidade curta evita superficialidade em percursos longos? |
| tutor/ITS | adaptação, feedback e diagnóstico | controle humano e menor inferência sacrificam ou preservam valor? |
| chat com IA | flexibilidade, factualidade e continuidade | contratos e composição reduzem deriva sem engessar a autoria? |
| ferramenta de autoria | expressividade e esforço | duas escalas permitem correção pequena e estrutura extensa? |
| analytics | dados, agência, intervenção e ética | quais decisões úteis sobrevivem sem telemetria punitiva? |
| local-first/offline | disponibilidade, conflito e custo | a réplica favorece continuidade com regras compreensíveis? |

## Alegações permitidas hoje

- o artefato implementa dezoito resources estruturados sob contrato v4;
- autoria bottom-up e top-down usam escopos e persistências distintas;
- workspaces são compostos por partes correntes e publicações explícitas;
- estudo selecionado funciona offline após sincronização;
- observações são correntes, situadas e não copiam o card;
- testes automatizados cobrem contratos e jornadas especificadas;
- armazenamento e payload possuem orçamentos versionados.

## Alegações ainda não permitidas

- o AraLearn melhora aprendizagem, retenção ou transferência;
- microssequências são superiores a aulas, textos ou flashcards;
- ausência de gamificação reduz ansiedade;
- IA delimitada produz cursos pedagogicamente melhores;
- workspaces aumentam colaboração;
- modo claro, escuro ou minimalista reduz carga cognitiva;
- observações melhoram automaticamente o material;
- o artefato é único ou primeiro em sua combinação;
- funciona igualmente em qualquer público, conteúdo ou instituição.

## Evidência necessária

A contribuição se fortalece se estudos mostrarem, com limitações explícitas:

- jornada compreensível por estudantes-trabalhadores leigos;
- retomada robusta em interrupção e conectividade variável;
- coerência entre microteoria, prática e percurso;
- controle compreendido sobre IA e publicação;
- uso efetivo do ciclo observação → retorno → melhoria;
- sustentabilidade do armazenamento com múltiplos usuários;
- diferenças relevantes frente a ferramentas comparáveis;
- casos em que o desenho falha ou precisa ser abandonado.

## Relações documentais

- [Revisão de literatura](revisao-de-literatura.md)
- [Quadro teórico](quadro-teorico.md)
- [Protocolo de avaliação](protocolo-avaliacao-artefato.md)
- [Visão do produto](visao-do-produto.md)
- [Arquitetura](arquitetura.md)
