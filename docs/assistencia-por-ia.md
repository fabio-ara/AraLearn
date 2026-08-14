# Assistência por modelo de linguagem

O AraLearn usa modelos de linguagem como instrumentos de autoria, não como
fontes automáticas de verdade. A pessoa delimita o alvo e descreve a mudança;
o modelo propõe conteúdo estruturado; contratos e validadores determinam o que
pode ser aplicado; a pessoa avalia o resultado.

Essa divisão responde a um problema concreto. Um pedido em linguagem natural
é conveniente, mas pode ser ambíguo. Um modelo também pode alterar mais do que
foi solicitado ou produzir uma estrutura inválida. Por outro lado, restringir
toda autoria a formulários técnicos tornaria correções pedagógicas simples
desnecessariamente difíceis. O AraLearn combina linguagem natural para
expressar intenção com limites determinísticos para exercer autoridade.

## Duas escalas de autoria

Há duas formas complementares de assistência:

| Escala | Ponto de partida | Finalidade |
| --- | --- | --- |
| contextual | conteúdo selecionado no aplicativo | corrigir texto, recompor um card ou alterar recipientes delimitados |
| estrutural | curso ou workspace acessado por uma integração | planejar cursos, reorganizar partes, auditar e publicar |

A assistência contextual é **ascendente**: começa no objeto que a pessoa está
vendo e pode subir somente até o recipiente explicitamente selecionado. A
autoria estrutural é **descendente**: parte do propósito do curso, planeja a
árvore e materializa suas unidades. A primeira não é uma versão reduzida nem
um fallback da segunda; cada uma possui autoridade e contratos próprios.

Este capítulo explica principalmente a assistência contextual. O percurso
estrutural é apresentado em [Criar cursos pelo chat](criar-cursos-pelo-chat.md)
e aprofundado em [Autoria por Model Context Protocol](autoria-mcp.md).

## A seleção como limite de autoridade

Ao tocar em um card ou em uma parte selecionável de um recurso, a pessoa
declara o maior conjunto de dados que aquela solicitação pode modificar. O
pedido pode escolher uma operação menor dentro desse conjunto, mas não pode
ampliá-lo.

Exemplo: se somente o rótulo de um nó foi selecionado, “melhore esta
explicação” pode alterar esse texto. “Acrescente outro nó” exige selecionar o
card inteiro, porque muda a estrutura da representação. Mesmo que o modelo
devolva um novo nó, o resultado é rejeitado quando a seleção não o autoriza.

Conteúdo vizinho pode ser enviado para preservar coerência, mas é marcado como
**contexto somente para leitura**. Essa separação é feita antes da chamada ao
serviço. Portanto, a obediência ao escopo não depende de o modelo interpretar
corretamente uma frase como “não altere os outros cards”.

## Edição no próprio conteúdo

Leitura, edição manual e assistência usam o mesmo card renderizado. O sistema
não converte a representação em um formulário de JSON nem abre uma cópia
paralela do conteúdo.

No modo manual, somente folhas textuais que o contrato identifica de maneira
inequívoca se tornam editáveis. Relações, identidades, coordenadas, respostas
corretas, topologia e outros elementos estruturais permanecem protegidos. Essa
decisão reduz a chance de uma correção de redação corromper o objeto
representado.

Na assistência, toques sucessivos acrescentam ou retiram objetos da seleção.
O contorno visual é desenhado sem alterar as dimensões do card. A conversa
aparece junto da superfície de estudo; fechar a conversa não destrói a seleção
atual.

## Operações em um card

O card admite três operações fechadas.

### Editar texto

`edit_text` altera somente caminhos textuais previamente autorizados. O modelo
não devolve o card inteiro: devolve pares de caminho e novo valor.

```json
{
  "message": "Explicação reescrita sem pressupor o conceito posterior.",
  "edits": [
    {
      "path": "content[0].data.text",
      "value": "Nova explicação autocontida."
    }
  ]
}
```

O aplicativo aplica esses pares sobre uma cópia congelada do card e prova que
nenhum outro campo mudou. Essa forma é mais econômica para modelos menores e
mais segura do que pedir uma reprodução integral da estrutura.

### Recompor o card

`recompose_card` exige a seleção do card inteiro. Ela permite trocar ou
combinar representações, alterar a forma de resposta e reconstruir feedbacks,
preservando a identidade e a posição do card.

A recomposição ocorre em duas etapas. Primeiro, o sistema procura no catálogo
uma composição compatível com a intenção pedagógica. Depois, o modelo recebe
somente os contratos dos recursos escolhidos e preenche esses contratos. O
catálogo inteiro não é inserido no contexto.

Essa consulta progressiva evita dois extremos: obrigar o modelo a memorizar
todos os schemas ou transmitir dezenas de contratos em cada pedido. Também
permite acrescentar um package ao catálogo sem reescrever o prompt geral.

### Restaurar uma versão

`restore_version` move a conversa para uma versão exata já existente. A
restauração é local e determinística: não se pede ao modelo que tente lembrar
ou recriar o texto anterior.

## Conversa, desfazer e ramificações

A assistência do card conserva uma conversa curta durante a sessão. Cada novo
pedido recebe o card corrente, o contexto didático pertinente e a
ancestralidade ativa da conversa.

O limite atual é de oito turnos e nove versões do card. Esse limite contém uso
de memória e evita transformar a conversa em uma cópia histórica do curso.
Pedidos que resultam em explicação sem mudança são registrados como conversa,
mas não criam uma versão fictícia. Falhas de transporte ou validação não são
registradas como se tivessem sido aplicadas.

**Desfazer** e **Refazer** movem um cursor entre versões exatas. Quando a
pessoa desfaz e depois solicita uma mudança diferente, inicia-se outro ramo; a
linha de refazer abandonada deixa de ser a linha ativa. Uma alteração externa
do mesmo card invalida a conversa, porque restaurar um snapshot antigo sobre
conteúdo novo poderia apagar trabalho legítimo.

Pedido, resposta e versões da conversa não são persistidos no curso, no
IndexedDB nem no Supabase. O conteúdo confirmado é persistido; o diálogo usado
para chegar a ele permanece efêmero. Proveniência editorial e conversa de
assistência são responsabilidades diferentes.

## Autoridade por nível

### Card

- uma ou mais instâncias selecionadas autorizam apenas edição de seus textos;
- o card inteiro autoriza edição textual ou recomposição;
- a identidade, o caminho e a posição do card permanecem fixos;
- esse nível não cria outro card.

Cada instância tem um identificador de alvo: `content:<id>` para conteúdo,
`response:<id>` para resposta e `feedback:<id>` para feedback. Esses
identificadores ligam a seleção visual ao caminho persistido.

### Microssequência

- alguns cards selecionados podem ser atualizados, removidos ou reordenados;
- os cards não selecionados são apenas contexto;
- todos os cards selecionados concedem também autoridade sobre o recipiente e
  permitem criar até oito cards nele;
- uma microssequência vazia pode ser selecionada para receber o primeiro card.

Selecionar todos os filhos concede autoridade sobre o recipiente, mas não
obriga uma criação. O pedido ainda determina a operação.

### Lição

- uma ou mais microssequências selecionadas podem ser reorganizadas ou
  removidas;
- exatamente uma microssequência selecionada pode receber novos cards;
- todas as microssequências selecionadas concedem autoridade para criar, no
  máximo, uma microssequência irmã por envio;
- uma lição vazia pode receber sua primeira microssequência.

Não há assistência contextual nos níveis de módulo ou curso. Nessa escala, a
mudança precisa ser planejada pela autoria estrutural.

## Como o contexto é montado

Um modelo precisa de contexto suficiente para preservar progressão, mas não
deve receber o curso inteiro por conveniência. O AraLearn monta um envelope
compacto que pode incluir:

- caminho na árvore e objetivos da unidade;
- tópicos ensinados e verificados;
- erros esperados e dependências;
- orientações de inclusão e exclusão;
- posição dos elementos e vizinhos próximos;
- índice resumido da lição;
- conversa ativa, quando houver.

Somente os alvos selecionados aparecem como graváveis. Os demais elementos são
serializados separadamente como leitura. Há um orçamento de tamanho; barreiras
pedagógicas obrigatórias, como exclusões explícitas, não são silenciosamente
removidas para caber. Se o contexto essencial ultrapassar o limite seguro, a
operação é recusada e precisa ser dividida.

Esse desenho também reduz custo e truncamento em modelos mais leves. Janela de
contexto grande não é justificativa para transmitir dados sem finalidade.

## Do pedido à gravação

Uma solicitação aplicada percorre estas etapas:

1. a seleção, a revisão e uma impressão digital do conteúdo são congeladas;
2. o contexto somente para leitura e os alvos graváveis são montados;
3. quando necessário, o catálogo seleciona representações e fornece seus
   contratos;
4. o serviço produz uma saída estruturada;
5. o AraLearn valida schema, semântica, referências, compatibilidade e escopo;
6. a mudança é confirmada integralmente com controle de revisão;
7. o card renderizado mostra o resultado.

O controle de revisão usa **compare-and-swap (CAS)**: a gravação só é aceita se
o estado ainda corresponder à revisão lida no início. Se outra operação alterou
o alvo durante a chamada, o resultado antigo não sobrescreve silenciosamente o
novo.

Uma resposta estruturalmente inválida pode receber uma tentativa orientada de
correção. Falhas transitórias de transporte têm repetição limitada. Não há
troca silenciosa de modelo, provider, representação ou escopo, pois isso
tornaria custo e comportamento imprevisíveis.

## Validação não é avaliação pedagógica

Os validadores verificam, entre outros pontos:

- envelope, slot e versão de cada package;
- identidades, posições, dependências e referências;
- opções, respostas e alvos de lacuna;
- compatibilidade entre conteúdo, resposta e feedback;
- ausência de mudanças fora da seleção;
- integridade dos objetos usados pela renderização.

Essas verificações impedem estados formalmente inválidos. Não provam que uma
explicação é verdadeira, suficiente ou adequada ao público. Recomendações de
interação humano–IA enfatizam visibilidade, controle, possibilidade de
correção e prevenção de confiança excessiva ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai); [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). A responsabilidade factual e pedagógica continua
humana, conforme também recomendado para IA generativa em educação
([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Persistência e funcionamento sem conexão

Depois de validada, uma mudança é salva primeiro no dispositivo. Se o curso
remoto não puder ser atualizado naquele momento, uma fila durável conserva a
operação pendente. Pedido, resposta e contexto do modelo não entram nessa
fila.

Ao reconectar, o aplicativo relê a composição e tenta combinar mudanças em
folhas diferentes. Se dois dispositivos alteraram o mesmo texto, o conflito é
apresentado para decisão; a versão local não é descartada silenciosamente.
Autoridade obtida apenas de cache nunca libera mudança estrutural, exclusão ou
publicação.

Modelos remotos exigem rede. Edição manual continua disponível offline. Um
serviço executado no próprio dispositivo também pode prestar assistência sem
internet, desde que esteja acessível e a autoridade necessária já tenha sido
confirmada.

## Providers, modelos e credenciais

**Provider** é o serviço que recebe a requisição; **modelo** é a versão do
sistema de linguagem escolhida nesse serviço. A interface apresenta presets
compatíveis com os adaptadores correntes e uma opção de configuração manual.

Nenhum provider é selecionado como fallback. A pessoa escolhe o serviço e o
modelo antes do primeiro envio. A configuração pode usar:

- a API do DeepSeek;
- a API do Gemini;
- endpoint compatível com OpenAI;
- serviço local compatível com a integração do Codex CLI.

O modelo recomendado no produto pode mudar conforme custo, latência,
disponibilidade e capacidade de produzir JSON estruturado. Por isso, a
garantia do AraLearn não é “usar determinado modelo”, mas aplicar o mesmo
limite de autoridade e o mesmo validador depois de qualquer provider
compatível.

A chave de API fica apenas na memória da página. Ela não é gravada em
IndexedDB, armazenamento simples do navegador, curso ou endereço. Trocar a
família do provider limpa a chave atual; fechar ou recarregar a aplicação exige
informá-la novamente.

Endpoints externos precisam usar HTTPS. HTTP é admitido somente para endereços
locais explícitos. A política de segurança do artefato deve autorizar a origem
do serviço no momento da compilação.

Custos, retenção e políticas de uso dependem do provider. O AraLearn reduz o
contexto e valida a resposta, mas não controla o processamento realizado pelo
serviço remoto. Antes de enviar conteúdo sensível, a instalação precisa
avaliar termos, localização dos dados e política institucional.

## Permissões

As permissões derivam da sessão e do alvo corrente. Estado desconhecido falha
como somente leitura.

| Conteúdo | Conta comum | Conta com capacidade editorial |
| --- | --- | --- |
| curso privado próprio | edição e assistência | edição e assistência |
| curso oficial | estudo | edição autorizada na continuidade oficial |
| curso privado de outra pessoa | sem edição | sem edição por esta função global |

Editar um curso oficial não cria automaticamente uma cópia privada. Levar um
curso privado ao catálogo é uma operação editorial explícita da autoria
estrutural.

## Alternativas rejeitadas

### Enviar o card inteiro para qualquer mudança

Foi rejeitado porque aumenta tokens, facilita alterações acidentais e obriga o
modelo a reproduzir estrutura que não precisava mudar. Patches de caminhos são
preferidos para edição textual.

### Confiar somente no prompt para limitar escopo

Foi rejeitado porque uma instrução textual não constitui autorização. A
seleção, os schemas fechados e a comparação do resultado exercem o limite.

### Guardar toda a conversa como proveniência

Foi rejeitado porque aumenta armazenamento, mistura rascunho com estado
editorial e transmite dados sem necessidade. O curso guarda o resultado; a
proveniência autoral possui registros próprios; a conversa curta é volátil.

### Trocar automaticamente para um modelo mais caro

Foi rejeitado porque muda custo e comportamento sem consentimento. Uma falha é
informada, e a pessoa decide se deseja outra configuração.

## Como testar com um serviço real

Os testes comuns usam respostas determinísticas e não consomem APIs pagas. Uma
bateria real do DeepSeek existe para manutenção explícita:

```powershell
$env:DEEPSEEK_API_KEY = "<chave temporária>"
npm run smoke:deepseek:bottom-up:real
Remove-Item Env:DEEPSEEK_API_KEY
```

Ela usa fixtures sintéticas, limita a quantidade de chamadas e produz somente
contagens locais, sem registrar chave, prompt, resposta ou curso. Esse smoke
verifica compatibilidade operacional do provider; não avalia qualidade
educacional.

Os formatos canônicos aparecem em [Fluxos, instruções e
contratos](fluxos-prompts-e-contratos.md). A política de dados está em
[Privacidade](privacidade.md).
