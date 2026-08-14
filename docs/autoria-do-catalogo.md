# Autoria e publicação do catálogo

Autoria, estudo e publicação são estados relacionados, mas não equivalentes.
Uma pessoa precisa testar partes de um curso antes de concluí-lo; uma equipe
precisa revisar uma versão exata sem receber acesso a toda a biblioteca
privada; estudantes precisam continuar vendo uma publicação estável enquanto
outra revisão é preparada.

O AraLearn separa essas responsabilidades em três objetos:

- **workspace:** espaço mutável em que pessoas autorizadas planejam e editam;
- **artefato:** documento imutável produzido a partir de uma revisão validada;
- **publicação:** referência que torna um artefato disponível num destino.

Essa separação evita usar rótulos burocráticos como “rascunho” e “publicado”
para controlar se um card pode ser renderizado. Qualquer parte materializada e
válida do workspace já pode ser estudada em Trilhas. Publicar serve para fixar
e distribuir uma revisão, não para ativar a renderização.

## Onde cada conteúdo aparece

| Superfície | Conteúdo | Finalidade |
| --- | --- | --- |
| Trilhas | workspace próprio e cursos escolhidos | organizar e estudar |
| submissão | artefato privado identificado por hash | oferecer uma revisão exata à avaliação |
| Coleções | publicação oficial completa | distribuir o catálogo da instância |

Um plano aparece em Trilhas depois que a estrutura inicial do workspace é
confirmada. À medida que cards são materializados, o mesmo item passa a ser
estudável. Não surge uma segunda cópia do projeto.

## Por que o workspace é composto

Um curso extenso pode conter centenas de cards. Salvar o documento integral a
cada pequena correção aumentaria transferência, processamento e armazenamento.
Também tornaria conflitos mais amplos: duas pessoas modificando lições
distintas disputariam a mesma cópia inteira.

O workspace remoto conserva partes atuais em registros separados. Uma operação
altera somente as partes necessárias; o servidor recompõe a visão do curso e
valida o resultado antes de confirmar a revisão. Esse desenho permite:

- construir uma microssequência por vez;
- copiar ou mover partes com identidades bem definidas;
- retomar a autoria sem depender do histórico do chat;
- detectar concorrência por revisão;
- materializar um artefato integral apenas quando necessário.

“Composto” não significa que o estudante recebe fragmentos desconexos. A
composição é uma estratégia de persistência autoral; a leitura continua
apresentando a árvore coerente.

## Operações sobre a árvore

A integração pode:

- registrar curso, módulos, lições e microssequências planejadas;
- salvar os cards de uma microssequência;
- corrigir metadados ou um card;
- copiar, mover, renomear ou excluir partes;
- juntar e separar microssequências;
- transformar um módulo em curso ou um curso em módulo.

Copiar cria novas identidades e preserva a origem. Mover transfere a parte e a
remove da origem na mesma confirmação. Não há compartilhamento oculto de uma
subárvore mutável entre dois cursos.

Cada comando informa a revisão esperada e uma chave de idempotência. Se a
revisão mudou, a operação não sobrescreve o estado novo. Se a resposta se
perdeu, repetir a mesma tentativa não duplica conteúdo.

## Revisão humana durante a construção

Mostrar todos os exercícios de um curso extenso em cada rodada produziria mais
leitura do que decisão. A revisão padrão apresenta microteorias, finalidade,
quantidade e variedade das práticas, recursos escolhidos e questões abertas.
As práticas permanecem acessíveis sob demanda.

Esse resumo é uma vista de revisão, não outra fonte de conteúdo. Uma correção
pontual relê o card canônico e preserva sua identidade. O procedimento completo
está em [Criar cursos pelo chat](criar-cursos-pelo-chat.md).

## Artefatos imutáveis

Um artefato é o JSON integral de uma composição validada. Antes de gravá-lo, o
servidor calcula um hash criptográfico SHA-256. O hash funciona como identidade
do conteúdo: qualquer alteração, mesmo pequena, produz outro valor com
probabilidade prática extremamente alta.

Imutabilidade foi escolhida por três razões:

1. uma revisão recebida para avaliação não muda enquanto é lida;
2. metadados relacionais podem apontar exatamente para o conteúdo validado;
3. atualizar o catálogo troca uma referência, em vez de sobrescrever o arquivo
   que outras operações ainda podem usar.

Guardar uma cópia integral a cada comando do workspace seria desperdício;
guardar somente a composição mutável impediria uma revisão estável. O desenho
híbrido usa registros relacionais durante a edição e artefatos integrais nos
pontos em que estabilidade é necessária.

Um artefato antigo permanece enquanto uma publicação ou submissão válida o
referenciar. Depois de perder todas as referências, torna-se elegível à coleta
de lixo. “Imutável” não significa “retido para sempre”.

## Submissão editorial

Submeter significa oferecer uma revisão privada exata para avaliação. A
submissão registra o hash do artefato e pode incluir uma nota curta; não concede
à equipe editorial acesso aos demais cursos privados da pessoa.

```text
workspace da autoria
→ artefato privado
→ submissão
→ fila editorial
→ workspace de revisão independente
→ ajustes, rejeição ou publicação
```

Há no máximo uma submissão ativa do mesmo curso por pessoa. Repetir o mesmo
hash recupera o envio existente. Uma nova revisão pode substituir um envio que
ainda aguarda na fila, mas não atropela uma revisão já assumida.

Quem revisa assume um item por tempo limitado, lê o artefato submetido e abre
um workspace editorial independente. A reserva evita duas decisões
simultâneas. Depois de expirar, outra pessoa pode assumir o trabalho. Pedir
ajustes ou rejeitar exige justificativa; publicar um curso completo aceita a
submissão.

Quando há pedido de ajustes, a autoria continua em seu próprio workspace,
produz outro artefato e envia o novo hash. A decisão anterior pode permanecer
como registro compacto sem conservar outra cópia integral do curso.

## Capacidades e autorização

Um **papel** descreve a relação da pessoa com um workspace ou com a instância.
Uma **capacidade** é a ação resultante dessa relação, como submeter ou publicar.
**Autorização** é a decisão feita para uma operação concreta, considerando
conta, alvo e estado atuais.

Essa sequência importa: escrever “sou editor” num prompt não concede
capacidade. O servidor resolve as relações no banco e autoriza cada chamada.

As capacidades podem incluir:

- criar e editar conteúdo privado;
- submeter curso próprio;
- consultar e assumir a fila editorial;
- publicar e organizar o catálogo;
- administrar participantes de um workspace específico.

Uma capacidade editorial global não concede acesso ao progresso, às Trilhas ou
às observações pessoais de outras pessoas. Triagem pedagógica exige relação
apropriada com o workspace correspondente.

## Publicação em Coleções

Somente uma composição completa pode ser publicada como curso oficial. O
servidor recompõe a árvore, valida os contratos, calcula o hash, grava o
artefato e atualiza a referência corrente do curso.

Coleções e classificação são metadados relacionais. Renomear uma coleção ou
transferir um curso entre coleções não reescreve a árvore pedagógica. Adicionar
um curso oficial a Trilhas é uma ação pessoal distinta; abrir o curso não o
seleciona nem o move.

Uma conta editorial pode publicar diretamente o próprio workspace quando tem
a capacidade necessária. Conteúdo entregue por outra pessoa segue a submissão
e a revisão, preservando a separação entre autoria e decisão editorial.

## Fixtures de catálogo

Uma **fixture** é um artefato de referência mantido no repositório para
implantação e testes repetíveis. Fixtures oficiais seguem um fluxo de
publicação administrativa separado da autoria cotidiana:

```powershell
npm run catalog:validate
npm run catalog:publish
```

O primeiro comando valida localmente; o segundo exige credencial administrativa
e materializa as fixtures selecionadas na instância. Fixture não é um formato
alternativo de editar cursos no aplicativo.

## Falhas e recuperação

| Situação | Resultado seguro |
| --- | --- |
| falha antes da confirmação | nenhuma parte é marcada como gravada |
| resposta perdida depois da confirmação | a mesma chave recupera o resultado sem duplicar |
| revisão concorrente | o alvo é relido antes de reaplicar a intenção |
| artefato privado incompleto | pode ser testado, mas não entra em Coleções |
| reserva editorial expirada | outra pessoa pode assumir sem continuar um workspace abandonado |
| capacidade insuficiente | o curso permanece no destino já autorizado |

## Alternativas rejeitadas

### Uma cópia integral do workspace por alteração

Foi rejeitada por custo de armazenamento e por ampliar conflitos. Partes
correntes mais artefatos nos pontos de estabilidade preservam controle de
revisão com menos duplicação.

### Um estado “publicado” para liberar o estudo

Foi rejeitado porque mistura qualidade editorial com capacidade de renderizar.
Partes válidas podem ser testadas antes da conclusão; publicação continua sendo
distribuição de uma revisão estável.

### Acesso editorial a toda a biblioteca privada

Foi rejeitado por excesso de autoridade. A submissão aponta somente para o
artefato escolhido.

### Editar o arquivo publicado no lugar

Foi rejeitado porque destruiria a identidade da revisão lida e dificultaria
auditoria, cache e recuperação. A atualização cria outro artefato e troca a
referência corrente.

A implementação detalhada aparece em [Plano de controle e
artefatos](plano-de-controle-e-artefatos.md). O protocolo da integração está em
[Autoria por Model Context Protocol](autoria-mcp.md), e o formato do curso está
no [Contrato público](aralearn-contract.md).
