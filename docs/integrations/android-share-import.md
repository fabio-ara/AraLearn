# Compartilhamento no Android

O AraLearn no Android pode receber arquivos compartilhados por outros aplicativos. O recurso permite transformar material encontrado fora do aplicativo em referência, base de criação ou conteúdo pessoal. A publicação oficial continua preservada; qualquer conteúdo confirmado segue para uma nova revisão imutável.

## Como funciona

A pessoa escolhe um arquivo em outro aplicativo e usa a ação de compartilhar com o AraLearn. O aplicativo recebe o arquivo e o oferece como referência, fonte de geração ou documento de intercâmbio, sem alterar uma publicação oficial.

O aproveitamento dependerá do tipo de arquivo, da extração disponível e da ação explicitamente escolhida pelo autor.

Quando o arquivo é um documento `aralearn.contract` v4, a interface valida o conteúdo antes de enviá-lo ao motor de artefatos. A revisão JSON permanece imutável no Storage e o dispositivo mantém somente sua projeção local para estudo offline.

## Quando é útil

O compartilhamento ajuda quando a preparação de conteúdo começa fora do AraLearn, por exemplo:

- abrir uma apostila em PDF no celular;
- enviar um DOCX para servir de base a uma lição;
- aproveitar arquivo recebido por mensagem;
- importar um projeto JSON v4 exportado pelo contrato atual;
- transformar anotações em fonte para uma trilha.

## Relação com a geração

Receber um arquivo não gera automaticamente uma trilha ou cards. O arquivo pode servir como fonte para planejamento ou geração quando a pessoa aciona e confirma essa operação.

Quando houver uso de modelo de linguagem, apenas o contexto necessário pode ser enviado ao serviço configurado pelo usuário.

## Limitações

O recebimento não garante aproveitamento perfeito. A qualidade depende de:

- formato do arquivo;
- qualidade da extração textual;
- presença de imagens ou tabelas complexas;
- clareza do material original;
- revisão posterior do usuário.

Quando a extração não for suficiente, o usuário deve revisar ou recusar o material produzido.

## Privacidade

O arquivo é lido no dispositivo. Compartilhá-lo com o AraLearn não cria sincronização contínua com a fonte original. Se a pessoa importar o conteúdo, ele passa a integrar seus dados e segue a sincronização do aplicativo; se apenas o anexar a uma geração, somente o contexto necessário é enviado ao serviço escolhido.

Operações com IA remota dependem do serviço configurado pelo usuário e das políticas desse serviço. Nenhuma delas concede acesso administrativo ao catálogo oficial.
