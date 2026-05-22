# Uso do app

Este guia descreve o fluxo principal do AraLearn: criar escopo, gerar trilha, abrir microssequência, materializar cards, estudar, revisar e persistir o projeto.

O AraLearn foi pensado para baixa fricção. O usuário deve gastar menos energia configurando ferramenta e mais energia estudando.

## 1. Criar o escopo

O usuário começa informando o que quer estudar. Esse escopo pode ser simples ou detalhado.

Campos principais:

- título do curso ou tema;
- objetivo opcional;
- prioridade de evidências;
- módulos;
- expressões do que entra em cada módulo;
- expressões do que fica fora;
- observações;
- estilo de avaliação ou uso.

Essas informações formam o contrato `aralearn.scope.v1`.

Em linguagem comum, esse contrato responde a três perguntas:

```text
O que quero estudar?
O que deve entrar?
O que deve ficar fora?
```

O escopo pode ser preenchido manualmente ou importado como JSON válido.

## 2. Gerar a trilha

Ao solicitar a geração da trilha, o app deve:

1. validar o contrato de escopo;
2. chamar o provider configurado;
3. validar a saída estrutural;
4. aplicar o resultado ao projeto local.

O resultado esperado é uma árvore com curso, módulos, lições e microssequências planejadas. Os cards ainda não precisam existir.

Essa etapa é chamada tecnicamente de `top-down`. O termo significa apenas que o app começa pelo planejamento geral antes de criar os cards.

## 3. Navegar pela árvore

Depois da geração estrutural, o usuário navega por:

```text
curso -> módulo -> lição -> microssequência
```

Cada microssequência possui status:

- `planned`: planejada, ainda sem cards;
- `generated`: possui uma versão de cards;
- `needs_review`: recebeu alteração que pede revisão;
- `ready`: foi considerada pronta pelo usuário.

Essa árvore ajuda o estudante a saber onde está e por que aquela etapa existe.

## 4. Estudar uma microssequência

Ao abrir uma microssequência, o usuário pode materializar cards para estudo.

Essa etapa é chamada tecnicamente de `bottom-up`. O termo significa que o app parte da necessidade local: a microssequência aberta, seu objetivo, suas dependências e o pedido do usuário.

O usuário pode:

- gerar cards para a etapa planejada;
- criar mais cards na mesma microssequência;
- criar microssequência adicional de apoio;
- corrigir cards já existentes;
- seguir para a próxima microssequência planejada;
- marcar a etapa como pronta.

Essas ações permitem estudar e revisar em tempo real. O usuário não precisa preparar todo o curso antes de começar.

## 5. Usar a aba Edição

Na aba `Edição`, o fluxo tem duas áreas:

- `Pedido`: texto editável da intervenção atual, com ação, materialização preferida, anexos e modelo;
- `Retorno da intervenção`: feedback persistido da última chamada, somente leitura por padrão, com botão de edição quando o usuário quiser ajustar o texto-base da próxima iteração.

Se a geração couber em uma chamada, o retorno marca a etapa como concluída. Se houver erro recuperável ou necessidade de continuação, o campo de retorno mostra um texto acionável para a próxima tentativa.

## 6. Revisar versões

Cada geração ou ajuste cria uma nova versão da microssequência. Isso permite comparar resultados e preservar histórico.

A versão ativa é a usada para estudo. Versões preservadas podem continuar disponíveis para inspeção ou recuperação.

Essa decisão protege o usuário contra uma falha comum em ferramentas de IA: perder um resultado anterior ao pedir uma melhoria.

## 7. Criar complemento

Quando faltar uma etapa intermediária, o usuário pode criar uma microssequência de apoio.

Esse complemento fica ligado à microssequência de origem e deve resolver uma lacuna local, sem refazer a organização inteira do curso.

Complemento não é replanejamento amplo. É uma intervenção situada.

## 8. Configurar provider

A área de provider permite escolher e configurar diferentes fontes de IA:

- Gemini;
- DeepSeek;
- OpenAI compatível;
- Codex CLI local;
- Fake provider para testes.

Dependendo do provider, o usuário informa modelo, chave de API, base URL, token ou endpoint local.

A escolha do provider não muda a regra de autoria. A IA auxilia; o usuário revisa e decide.

## 9. Estudar offline

O AraLearn é local-first/offline-first. Depois que a trilha e os cards estão persistidos, o estudo pode ocorrer sem depender de uma conversa ativa com IA.

Isso é importante para uso em transporte público, pausas curtas, ambientes sem internet ou momentos em que o usuário só quer estudar o que já foi produzido.

## 10. Exportar, importar e auditar

Como o projeto segue contrato público, ele pode ser exportado, importado, validado e inspecionado.

Há dois formatos principais:

- projeto AraLearn, com o contrato público do conteúdo;
- backup completo, com projeto e progresso.

A exportação facilita portabilidade. A importação facilita continuidade. A validação evita que JSON inválido substitua o projeto local.

## Fluxo resumido

```text
informar escopo
-> gerar trilha
-> abrir microssequência
-> gerar cards
-> estudar
-> revisar ou ampliar
-> persistir
-> continuar
```

A proposta do AraLearn é reduzir o caminho entre querer estudar e ter uma etapa estudável diante do usuário.
