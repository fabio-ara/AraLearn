# Observações e Anotações ancoradas

## Problema educacional

Uma dúvida, sugestão ou percepção de erro costuma surgir no ponto exato em que
uma pessoa estuda ou inspeciona o Curso. Se o registro exigir sair desse
contexto e reconstruí-lo depois, informação útil se perde. O AraLearn chama o
controle de interface de **Observação** e o objeto do domínio de **Anotação
ancorada**.

Uma Anotação ancorada é um registro protegido, ligado a um alvo identificável
do Curso. Ela não é parte do conteúdo canônico, não concede autoria e não
altera automaticamente o Curso. Podem existir **várias** anotações da mesma
pessoa no mesmo alvo; salvar uma nova não substitui as anteriores.

## Alvos, origens e canais

Uma anotação aponta para exatamente um destes alvos:

- Curso;
- Módulo;
- Lição;
- Tópico;
- Microssequência didática;
- Unidade de estudo.

A origem registra quem ou o que produziu a manifestação; o canal registra por
onde ela entrou. O contrato fechado admite:

| Origem | Canais coerentes |
| --- | --- |
| pessoa autora (`author`) | `authoring_interface`, `authoring_chat` ou `unknown_legacy` migrado |
| estudante (`learner`) | `study_interface` ou `unknown_legacy` migrado |
| auditoria humana (`human_audit`) | `audit_interface` ou `unknown_legacy` migrado |
| auditoria automática (`automatic_audit`) | `audit_automation` ou `unknown_legacy` migrado |
| legado sem origem verificável (`unknown_legacy`) | `unknown_legacy` |

Registros migrados podem conservar um canal legado desconhecido quando a
origem é conhecida. As superfícies correntes criam apenas anotações de pessoa
autora ou estudante. As origens de auditoria continuam no contrato fechado de
Anotações, mas o ciclo de auditoria não cria nem muda uma Anotação
implicitamente.

## Categorias e estados

Categoria é opcional. Na interface, **Sem categoria** representa valor nulo;
as demais opções são:

| Categoria | Uso esperado |
| --- | --- |
| **Dúvida** (`question`) | há uma pergunta que precisa de esclarecimento |
| **Possível erro** (`possible_error`) | algo parece incorreto e precisa ser verificado |
| **Trecho confuso** (`confusing`) | texto, exemplo, prática ou representação é difícil de interpretar |
| **Sugestão** (`suggestion`) | existe uma proposta concreta de melhoria |

A categoria organiza a triagem. **Possível erro** não confirma um erro e não
autoriza correção automática.

| Estado | Significado operacional |
| --- | --- |
| **Aberta** (`open`) | ainda aguarda tratamento |
| **Considerada** (`considered`) | foi examinada ou recebeu resposta, mas continua em acompanhamento |
| **Resolvida** (`resolved`) | o tratamento foi encerrado |
| **Retirada** (`withdrawn`) | quem pode retirar o registro solicitou sua remoção |

Não existe estado “incorporada”. Uma resposta ou resolução não prova que o
Curso mudou; correção e verificação pertencem ao ciclo owner-only próprio.

## Classificação de assunto sem inferência semântica

A classificação automática é deliberadamente exata e limitada:

- se o alvo é exatamente um **Tópico**, esse Tópico é o único assunto
  automático, com método `exact_topic_target`;
- Curso, Módulo, Lição, Microssequência e Unidade permanecem sem assunto
  inferido, com método `target_scope_unclassified`;
- registros migrados sem classificação verificável usam
  `legacy_unclassified`.

O sistema não deduz Tópicos pela prosa, pela posição curricular ou por
similaridade. O proprietário pode corrigir os assuntos em uma ação humana
separada, registrada como `human_topic_selection`; essa seleção efetiva não
apaga o fato automático original.

## Registrar no Estudo

1. Na Unidade corrente, abra **Observação**.
2. Escolha uma categoria ou deixe **Sem categoria**.
3. Escreva um texto específico e salve.

O texto admite no máximo 2.000 escalares Unicode e 16 KiB em UTF-8. Quebras de
linha, retorno de carro e tabulação são preservados; outros caracteres de
controle são recusados. A folha mostra todas as anotações próprias daquela
Unidade, com categoria, estado, sincronização e eventual resposta do
proprietário. É possível criar outras, revisar texto e categoria ou retirar um
registro conforme as capacidades recebidas do servidor.

Uma pessoa estudante lê somente as próprias anotações. Colegas nunca recebem
os registros uns dos outros. A pessoa proprietária vê todas as anotações do
Curso porque é responsável pela triagem. Nessa leitura, a identidade de quem
contribuiu é o objeto
`contributor={kind:'protected_person',role,ref,label}`. `ref` é um pseudônimo
aleatório persistido no formato `person-` seguido de 16 dígitos hexadecimais;
não é derivado de Curso/UUID, não contém UUID ou e-mail e não é reversível pelo
contrato. Nem mesmo conhecer o UUID do roster permite correlacioná-lo. A
interface mostra apenas o `label` pseudônimo protegido, por exemplo “Estudante
7A3F”; nunca mostra `ref`, UUID ou e-mail.

### Sem conexão e em duas abas

Comandos feitos offline entram numa outbox específica de anotações, separada do
estado pessoal. Ela admite até 128 comandos e 256 KiB por Curso. O cache local
admite até 2 MiB, 48 alvos e 128 anotações por alvo; páginas têm até 24 itens e
no máximo 128 páginas são mantidas por alvo, ainda respeitando 128 itens
agregados. Cada cursor precisa ser novo e não pode se repetir durante a carga.

Duas abas da mesma conta coordenam atualização por `BroadcastChannel`, mas a
mensagem leva somente identidade do Curso, versão da projeção privada daquela
pessoa e até 128 IDs de anotação — nunca texto bruto. A outra aba relê o
IndexedDB compartilhado e tenta atualizar a visão sem sobrescrever um rascunho
aberto. Perda de acesso ou outra perda de autoridade elimina cache, outbox e
entrega local daquele Curso.

Uma indicação **pendente**, **sincronizando**, **sincronizada**, **em conflito**
ou **falhou** descreve entrega, não tratamento pedagógico. Preserve os dados do
aplicativo até a sincronização se houver comandos importantes ainda pendentes.

## Triar na Autoria

**Auditoria e correções** é a sétima área funcional da Autoria e conserva
`section=observations`. Sua aba **Observações** apresenta uma única caixa de
entrada do Curso. O resumo informa total correspondente, contagens por origem,
canal e estado e total sem classificação; os filtros cobrem origem, canal,
estado, categoria, ausência de categoria, assunto e hierarquia, com opção de
incluir descendentes. Cada resultado oferece links profundos para o alvo e para
a tela de detalhe.

A pessoa proprietária pode criar uma anotação autoral no Curso, Módulo, Lição,
Tópico ou Microssequência. Para anotar uma Unidade, parte da **Inspeção**, que
conserva o alvo exato. No detalhe, as capacidades retornadas pelo servidor
determinam se é possível considerar, responder, resolver, reabrir, retirar,
revisar texto/categoria ou corrigir assuntos.

Uma resposta do proprietário admite no máximo 2.000 escalares Unicode e 16 KiB.
A síntese breve usada por fluxos conversacionais admite 500 escalares e 4 KiB.
Nenhuma dessas ações modifica a composição do Curso por si só.

## Autoria por MCP

O MCP continua expondo exatamente seis ferramentas públicas. Não existe uma
sétima ferramenta exclusiva para observações:

- `lerCurso` usa a vista `anchored_annotations` para caixa de entrada, alvo ou
  detalhe;
- `alterarCurso` usa a operação `update_anchored_annotations` para criar,
  revisar, retirar, considerar, responder, resolver, reabrir ou corrigir
  assuntos.

Uma criação pelo MCP exige confirmação humana explícita (`confirmed: true`) e
uma síntese breve não vazia. O servidor usa a confirmação como guarda de
entrada e não a grava como dado do domínio. Veja [Autoria por
MCP](autoria-mcp.md) para o protocolo completo.

O ciclo de auditoria também não cria ferramenta paralela: usa
`lerCurso audit_cycle` e `alterarCurso update_audit_cycle` dentro das mesmas
seis ferramentas. Uma ação sugerida `resolve|reopen` sobre uma Observação não é
executada ali; requer outro comando explícito de Anotações com a versão
corrente.

## Paginação, versões e quotas

Leituras de caixa de entrada, alvo e detalhe usam páginas de no máximo 24 itens,
cursor opaco de até 240 caracteres e resposta de até 256 KiB. O DTO de item é
`aralearn.course-anchored-annotation.v1` e informa caminho observado e corrente,
certeza sobre a revisão observada, classificação, capacidades e links
profundos.

O servidor admite, incluindo tombstones de retirada:

- até 128 anotações correntes por pessoa, Curso e alvo;
- até 512 anotações correntes por pessoa e Curso;
- até 256 versões ou eventos por anotação em operações ordinárias.

Retirada e exclusão de conta permanecem disponíveis mesmo quando o teto de
versões foi alcançado. O preflight de quota também conta o ator nulo do legado,
para que a migração não contorne limites por ausência de identidade.

O proprietário recebe o contador global monotônico do conjunto de anotações.
No Estudo, `annotationSetVersion` é o contador monotônico privado da projeção
da própria pessoa: atividade alheia não o altera nem pode ser percebida por
ele. Esse contador contém somente coordenação, não texto nem nova autoridade de
domínio. Sua linha permanece até a exclusão da pessoa ou do Curso para preservar
monotonicidade do cache; ela não participa do TTL de texto, tombstone ou
recibo. Criar e corrigir assuntos também exigem a revisão esperada do Curso;
revisar texto, mudar estado ou responder usam a versão aplicável ao leitor sem
avançar artificialmente a revisão geral do conteúdo.

## Privacidade, retenção e retirada

Enquanto uma anotação está aberta, considerada ou resolvida e o Curso existe,
o servidor conserva texto corrente, síntese breve e resposta necessários à
função. Eventos de revisão são append-only, mas guardam hashes e metadados
limitados, não as versões anteriores do texto bruto.

Retirar uma anotação redige imediatamente texto, síntese e resposta e cria um
tombstone. Tombstone e recibo técnico expiram logicamente em até 14 dias; então
deixam de ser legíveis, pagináveis, contar quota ou admitir repetição. A limpeza
física da linha e dos eventos é oportunista quando o Curso é lido ou alterado e
processa por toque um lote de até 128 tombstones e 256 recibos expirados; Curso
inativo pode continuar fisicamente sujo porque não há cron nem promessa de hard
delete nessa janela. A exclusão da conta retira e redige imediatamente suas
contribuições, sujeitas à mesma
expiração. Excluir o Curso remove os registros por cascade.
Anotações ativas ou resolvidas não são apagadas automaticamente por idade:
quem opera uma instalação precisa declarar sua política institucional de
retenção.

Quando um achado referencia uma Anotação, a junção guarda apenas identidade e
versão, sem texto, pseudônimo ou pessoa. Antes da limpeza física, uma retirada é
projetada no achado como indisponível e sem link. Depois do hard delete, o
cascade remove somente a junção e seu ID; rodada, achado e correção permanecem.

Cópias para pesquisa não são criadas por padrão. Qualquer uso exige protocolo
explícito, minimizado e governado; anotações não viram automaticamente
resultado, métrica ou conjunto de treinamento.

## Interpretação responsável

Feedback situado pode apoiar ação, mas a literatura não comprova a eficácia
desta implementação ([Shute (2008)](referencias.md#ref-shute2008feedback);
[Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)). São
inferências indevidas:

- “não anotou, portanto compreendeu”;
- “anotou muito, portanto tem dificuldade”;
- “marcou possível erro, portanto o Curso está errado”;
- “a ausência de registros demonstra qualidade docente”;
- “recebeu resposta ou foi resolvida, portanto houve aprendizagem”.

Quantidade, ausência, categoria, estado, resposta, resolução e timestamps não
medem atenção, dificuldade, aprendizagem, qualidade ou eficácia pedagógica. O
instante capturado é somente uma pista de contexto, nunca duração de sessão. O
AraLearn não usa esses sinais para nota, ranking, perfil de risco ou inferência
automática.
