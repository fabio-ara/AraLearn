# Fluxos, instruções e contratos

Uma conversa de Autoria precisa ligar linguagem humana a uma mudança verificável
no Curso sem obrigar a pessoa a operar o protocolo. O GPT interpreta a intenção;
schemas delimitam a tarefa; o servidor decide autorização e concorrência.

## Estado de máquina e fala humana

A pessoa fala sobre título, objetivo, Parte, Microssequência, StudyUnit, Fonte,
Observação e consequência. A camada confiável trabalha internamente com
identidades, versões e repetição segura.

Essa separação não esconde o efeito. Antes de uma escrita ainda não autorizada,
o GPT apresenta a mudança concreta e pede uma decisão. Depois, responde com o
resultado, um link pertinente e, no máximo, a próxima decisão.

## Uma autoridade, três entradas

A interface, o MCP e Actions operam o mesmo Curso. A interface oferece campos e
controles; na conversa, a pessoa descreve intenção e o GPT escolhe uma tarefa
humana. Todos chegam às mesmas regras de propriedade e aos mesmos casos de uso.

O canal de transporte não cria outro histórico nem altera o significado da
mudança.

## Tarefas conversacionais

MCP e Actions compartilham dezesseis tarefas:

| Fase | Leituras | Escritas |
| --- | --- | --- |
| retomada | `retomar_curso` | `criar_curso` |
| planejamento | `consultar_planejamento` | `salvar_parte` |
| produção | `preparar_materializacao` | `materializar_parte` |
| configuração | `consultar_configuracao` | `ajustar_configuracao` |
| revisão | `consultar_observacoes`, `preparar_revisao` | `registrar_observacao`, `aplicar_correcoes` |
| Fontes | `consultar_fontes` | `manter_fonte`, `incorporar_pdf_como_fonte` |
| representação | `consultar_componentes` | gravação ocorre junto da StudyUnit |

Perfil, avatar, acesso direto, exclusão de conta e Manutenção permanecem ações da
aplicação autenticada.

## Seleção de contexto

Cada leitura devolve o menor recorte que sustenta sua fase:

- planejamento traz a Parte corrente ou solicitada;
- preparação de materialização traz inventário, configuração e Fontes da Parte;
- configuração traz herança e aplicação efetiva;
- Observações trazem a caixa ou seleção humana;
- preparação de revisão inclui o percurso potencialmente afetado;
- Fontes trazem catálogo, Fonte focal ou proveniência de uma Unit;
- componentes trazem somente candidatos pertinentes à função instrucional.

A resposta pode conservar contexto estruturado completo sem reproduzi-lo como
texto longo. Deep links levam à Parte, StudyUnit, Fonte ou área pertinente.

## Planejamento incremental

O GPT recolhe contexto mínimo e propõe uma Parte. Depois da decisão,
`salvar_parte` grava título, intenção e as Microssequências da Parte, incluindo
Módulo, Lição, objetivos, função, AnalysisUnits e requisitos de evidência.

A próxima proposta só aparece depois da releitura do plano. Uma Parte anterior
continua revisável por posição ou título. A faixa de sete a doze Partes é
heurística e nunca gate.

## Plano, desenho e composição

O plano responde o que precisa ser ensinado e organiza o trabalho em Partes. O
desenho responde que parâmetros e direção editorial regem o escopo. A composição
contém as StudyUnits e suas representações.

Replanejar não apaga automaticamente conteúdo. Mudar parâmetro não reescreve
StudyUnits anteriores por implicação. Uma revisão pode propor alterações em
vários pontos quando a coerência pedagógica exigir.

## Configuração

Os quatro parâmetros pedagógicos controlam distribuição de novidade, formas de
explicação, quantidade de prática e dimensões de variação. Direção editorial é
separada. Limpar uma definição restaura herança; não grava uma narrativa de
limpeza.

O uso comum permite calibração automática a partir do contexto. Uma pesquisa
pode fixar condições explícitas. Configuração formal só é acrescentada quando
produz diferença educacional concreta.

## Produção por Parte

```text
Parte aprovada
→ preparação focal
→ StudyUnits propostas
→ decisão humana
→ gravação atômica
→ inspeção em Conteúdo
```

A preparação inventaria toda novidade necessária. Cada StudyUnit declara o que
introduz, formas de explicação, componentes e prática. O teto distribui as
AnalysisUnits; não permite tornar uma unidade conceitual maior para esconder
novidades.

Depois da gravação, a StudyUnit conserva snapshot e aplicação focal de desenho.
A execução intermediária não permanece como produto.

## Proveniência e anexos

Fonte, Âncora e atribuição são estado corrente. O GPT consulta e mantém esses
objetos por referência humana. A versão usada para concorrência fica na camada
confiável.

Um PDF anexado só é incorporado com intenção inequívoca de armazenamento. A
borda calcula o resumo criptográfico, prepara cota, usa a Storage API, verifica
os bytes e ativa o vínculo. Uma URL transitória do transporte não entra no
estado do Curso.

## Descoberta progressiva de componentes

`consultar_componentes` recebe função, estrutura ou operação que precisa ser
representada. O GPT consulta quando a escolha não é evidente, valida o contrato
do candidato e usa o componente na StudyUnit.

A biblioteca não é consultada preventivamente e não existe quota de variedade.
Parágrafo e escolha continuam adequados quando cumprem a função.

## Observações e revisão

Uma Observação registra o apontamento no alvo. Selecionar várias Units produz
registros separados. Preparar revisão amplia o contexto para progressão,
pré-requisitos, exemplos, prática e transições afetadas.

A pessoa decide sobre a proposta; `aplicar_correcoes` grava o conjunto e a
reinspeção verifica o resultado corrente. Não há entidade permanente de lote
nem snapshots universais antes/depois.

## Concorrência e repetição segura

A camada confiável resolve IDs e versões a partir das referências humanas. Se o
Curso mudou, ela relê e reconstrói a mesma intenção quando isso é seguro. Uma
ambiguidade material volta à conversa.

Recibos temporários recuperam respostas perdidas. Repetição não autorizada,
entrada inválida e falta de acesso não são tratadas como falha transitória.

## Persistência e privacidade

O Curso conserva somente o estado funcional. A conversa, cadeia de pensamento,
cliques e tempo em tela não alimentam o banco nem Analytics. PDFs e avatares
ficam em buckets privados; segredos permanecem nas Edge Functions.

Analytics deriva configuração e composição atuais e intervenções explicitamente
observáveis. Seu JSON é um snapshot quantitativo, não a composição completa do
Curso.

## Respostas a falhas

Uma resposta segura informa:

1. o que foi confirmado;
2. o que permanece incerto;
3. a menor ação para retomar.

O GPT não anuncia sucesso sem releitura quando a resposta pode ter sido perdida.
Também não despeja detalhes de transporte numa decisão pedagógica.

Consulte [Criar e revisar Cursos por conversa](criar-cursos-pelo-chat.md),
[Autoria pelo MCP](autoria-mcp.md) e [Autoria por Actions](autoria-actions.md).
