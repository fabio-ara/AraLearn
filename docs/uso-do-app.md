# Uso do app

Usar o AraLearn é passar de um tema amplo para uma etapa concreta de estudo. O fluxo do app foi desenhado para reduzir o atrito entre intenção, organização, materialização e revisão.

## 1. Definir o escopo

O primeiro passo é declarar o que será estudado.

Um escopo pode conter:

- tema ou disciplina;
- objetivo;
- itens que devem entrar;
- itens que devem ficar fora;
- observações de prova, notação, fonte ou abordagem.

Em termos práticos, o escopo responde a três perguntas:

```text
O que quero estudar?
O que precisa entrar?
O que precisa ficar fora?
```

## 2. Planejar a trilha

Depois do escopo, o usuário pode pedir ao app uma proposta de trilha.

Essa etapa cria:

- curso;
- módulos;
- lições;
- microssequências.

Ela não cria cards. Sua função é organizar o caminho antes da produção do material local.

## 3. Navegar pela estrutura

A navegação segue a hierarquia do projeto:

```text
curso -> módulo -> lição -> microssequência
```

Cada microssequência aparece com:

- título;
- objetivo;
- papel na trilha;
- dependências;
- tópicos cobertos;
- critérios de verificação;
- status.

Os status possíveis são:

- `planned`
- `generated`
- `needs_review`
- `ready`

## 4. Abrir uma microssequência

Ao abrir uma microssequência, o usuário passa da estrutura ao trabalho local. É nessa etapa que o estudo deixa de ser apenas plano e vira material estudável.

Quando uma intervenção é pedida, o app considera:

- a microssequência aberta;
- suas dependências declaradas;
- o `guide` ativo da lição ou do módulo;
- referências escolhidas pelo usuário;
- fontes anexadas e resolvidas explicitamente;
- a próxima microssequência planejada, quando houver;
- cards já existentes, se a operação for de correção.

## 5. Escolher a ação local

O trabalho local pode assumir quatro formas principais.

### Gerar cards na microssequência atual

Usado quando a etapa ainda não tem cards ou quando o usuário quer uma nova versão.

### Corrigir cards da microssequência atual

Usado quando já existe versão ativa e o usuário quer ajustar explicação, prática, recurso, feedback ou escopo.

### Criar uma microssequência de apoio

Usado quando surge uma lacuna local que merece uma etapa própria. Essa etapa não substitui a trilha principal; ela ajuda o usuário a resolver a dificuldade e voltar ao percurso.

### Gerar a próxima microssequência planejada

Usado quando o usuário quer continuar a lição sem replanejar o curso inteiro.

## 6. O que acontece durante a geração local

Na experiência do usuário, a geração local pode ser entendida em três movimentos:

1. o app delimita a intervenção;
2. o serviço textual propõe forma e conteúdo;
3. o app recompila, valida e salva apenas o que passou pelo contrato.

Isso significa que a resposta não entra diretamente no projeto. Se houver problema de formato, de escopo ou de coerência didática mínima, o sistema tenta correção localizada ou simplesmente rejeita a saída.

## 7. Acompanhar a execução

Cada intervenção registra um histórico com etapa atual, estado e progresso. Em linguagem interna, o fluxo costuma passar por momentos como:

```text
prepare -> plan -> draft -> compile -> validate -> complete
```

Para o usuário, o ponto essencial é outro: o projeto anterior permanece íntegro mesmo quando a intervenção falha.

## 8. Revisar versões

Cada geração ou correção cria uma nova versão de cards para aquela microssequência. A versão ativa é a usada no estudo; versões anteriores continuam disponíveis para comparação, restauração ou auditoria.

Isso permite melhorar uma etapa sem apagar automaticamente o que já existia.

## 9. Estudar os cards

Os cards podem usar texto, lacuna, múltipla escolha, código, tabela, matriz, plano, grafo, fluxograma, mapa de relações ou árvore.

O app aplica validações mínimas antes de aceitar uma versão:

- exercício textual deve ser fechado;
- `choice` precisa de alternativas e resposta válida;
- recursos visuais precisam de dados suficientes;
- o contexto local necessário deve aparecer no próprio card;
- a variação de caso deve existir quando o papel do card a exige.

Essas regras não substituem revisão de conteúdo. Elas funcionam como piso de integridade do material persistido.

## 10. Serviços de geração

O AraLearn pode operar com serviços diferentes sem mudar o contrato do projeto. No estado atual, o repositório prevê integração com:

- [DeepSeek API](https://api-docs.deepseek.com/);
- [Gemini API](https://ai.google.dev/api/);
- endpoints compatíveis com a interface de chat da OpenAI;
- serviço local por linha de comando;
- serviço falso para testes.

A troca de serviço afeta custo, latência e comportamento do modelo, mas não altera o fluxo central do app.

## 11. Persistência local

O projeto é mantido localmente como referência primária. Isso significa que o material salvo continua disponível no dispositivo, pode ser exportado em JSON e não depende de um servidor central para existir como projeto.

Quando o usuário usa um serviço remoto, apenas o contexto necessário para aquela intervenção é enviado ao serviço configurado.

## Fluxo resumido

```text
definir escopo
-> planejar a trilha
-> abrir uma microssequência
-> gerar ou corrigir cards
-> estudar
-> criar apoio local quando necessário
-> voltar à trilha principal
-> continuar
```

O app foi desenhado para reduzir a distância entre intenção de estudo e material utilizável: uma etapa concreta, ligada a uma trilha maior, pronta para revisão humana e persistida no próprio projeto.
