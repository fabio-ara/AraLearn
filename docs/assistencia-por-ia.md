# Assistência por IA

No AraLearn, a assistência por IA existe para reduzir o trabalho de autoria sem substituir a autoria. O sistema usa serviços textuais para propor trilhas, explicações, exemplos e exercícios, mas o que vale no app é sempre o documento local recompilado, validado e persistido pelo próprio produto.

A especificação dos envelopes de geração está em [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). Aqui o foco é outro: o papel do serviço textual, o papel do app, a seleção de contexto e a governança do mecanismo. A base crítica e pedagógica desse desenho está em [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md).

## Onde a IA entra

O AraLearn usa serviços textuais em dois momentos:

1. **planejamento da trilha**: a partir de um escopo, o serviço pode sugerir curso, módulos, lições e microssequências;
2. **materialização local de cards**: a partir de uma microssequência aberta, o serviço pode propor forma didática e preencher conteúdo para aquela etapa.

Fora desses momentos, o projeto continua sendo manipulado pelo próprio app e pelo usuário.

## O que continua sob responsabilidade do app

O app continua responsável por:

- manter o projeto persistido;
- selecionar o contexto da intervenção;
- montar contratos transitórios objetivos;
- indicar recursos disponíveis;
- recompilar a estrutura final;
- validar a saída;
- preservar versões;
- impedir que respostas inválidas alterem o projeto.

Essa separação é central para o desenho do produto. O serviço textual não é tratado como dono do documento final.

## O que cabe ao serviço textual

Ao serviço textual cabe:

- interpretar o escopo recebido;
- sugerir organização da trilha;
- escolher a forma didática de cada card dentro das opções disponíveis;
- escrever títulos, enunciados, textos, alternativas e feedbacks nos campos previstos;
- respeitar as fronteiras declaradas por `guide`, `covers`, `checks` e recursos liberados.

Em outras palavras, o serviço textual trabalha como colaborador de autoria dentro de um espaço controlado.

## Seleção estrutural de contexto

No fluxo local atual, o app monta o contexto de modo explícito. Em vez de enviar “o curso inteiro” ou uma massa difusa de histórico, ele reúne:

- o caminho estrutural da etapa aberta: curso, módulo, lição e microssequência;
- o `guide` ativo;
- objetivo, papel, cobertura e verificações da microssequência;
- dependências declaradas em `dependsOn`;
- referências escolhidas pelo usuário para aquela intervenção;
- a próxima microssequência planejada, quando houver;
- a versão atual e os cards existentes, quando a operação é de correção;
- fontes anexadas e resolvidas explicitamente.

Isso torna auditável a origem do contexto usado em cada chamada.

## Campos controlados e valores canônicos

Além de selecionar o contexto, o AraLearn reduz margem de erro transformando decisões recorrentes em campos controlados e valores canônicos.

Na prática, isso significa que o serviço textual não escreve o projeto inteiro “em prosa”. Ele recebe:

- catálogos fechados de recursos;
- listas fechadas de operações e papéis;
- campos específicos para cada etapa;
- valores estáveis para escolhas repetidas, como tipo de card, modo de exercício e estrutura esperada.

Esse desenho cumpre duas funções:

- reduz ambiguidade na interpretação da tarefa;
- permite que o app recompilhe e valide o resultado final com mais segurança.

## O motor estruturado de geração

No código e em parte da documentação técnica, a expressão `Structured Engine` designa o **motor estruturado de geração**. Ele é o runtime principal dos serviços textuais já integrados.

Seu funcionamento pode ser resumido assim:

1. o app delimita a intervenção;
2. o serviço textual escolhe forma e preenche conteúdo dentro de campos controlados;
3. o app recompila o card ou a estrutura final;
4. o app valida e, se necessário, pede correção localizada;
5. só então a nova versão é persistida.

Essa estratégia foi adotada porque modelos econômicos tendem a errar mais quando recebem contexto excessivo, esquema amplo demais ou tarefa mista demais.

## Por que dividir a geração

Uma única chamada grande exigiria que o serviço textual:

- planejasse a intenção local;
- escolhesse o recurso adequado;
- escrevesse todos os cards;
- mantivesse o formato JSON correto;
- respeitasse escopo e dependências ao mesmo tempo.

O AraLearn separa essas responsabilidades em etapas menores porque isso melhora robustez e custo operacional.

## Serviços e integrações

O contrato do projeto foi mantido independente do fornecedor de texto. No estado atual, o repositório prevê integração com:

- [DeepSeek API](https://api-docs.deepseek.com/), hoje usada por endpoint compatível com a interface de chat da OpenAI;
- [Gemini API](https://ai.google.dev/api/), usada por integração nativa;
- serviços compatíveis com a interface de chat da OpenAI;
- serviço local por linha de comando;
- serviço falso para testes.

O repositório também inclui relatórios auditáveis de execução real, especialmente com `deepseek-v4-flash`, em [`tests/reports/`](../tests/reports/).

## Privacidade, custo e persistência

O AraLearn foi desenhado com persistência local como padrão. Isso reduz dependência de servidor e ajuda a manter o projeto disponível depois do uso do serviço remoto.

Quando o usuário opta por uma API externa, o contexto necessário para a intervenção é enviado ao serviço configurado. Por isso, custo e tratamento de dados continuam sujeitos às políticas do fornecedor escolhido.

Essa questão não é periférica. O público inicial do produto inclui estudantes-trabalhadores, o que torna custo e fricção de acesso parte da própria arquitetura de adoção do app.

## Validação e falha fechada

A assistência por IA no AraLearn nunca atua sozinha. Toda resposta passa por validação estrutural e didática mínima.

Se a resposta:

- viola o contrato;
- usa campos indevidos;
- produz prática aberta onde o app exige prática fechada;
- materializa contexto insuficiente;
- entra em conflito com dependências ou escopo;

então ela é corrigida localmente, se isso for seguro, ou rejeitada. O projeto anterior permanece intacto.

Esse comportamento é intencional. O objetivo não é “salvar qualquer resposta”, mas proteger a integridade do projeto.

## Governança da autoria

A regra editorial do produto é simples:

- o serviço textual propõe;
- o app delimita, recompila e valida;
- o usuário aprova, corrige ou rejeita.

Essa ordem evita confundir conveniência de geração com transferência de autoria.
