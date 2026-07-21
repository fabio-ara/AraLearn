# Compartilhamento no Android

O runtime Android pode receber arquivos compartilhados por outros aplicativos. Esse recurso reduz o atrito entre encontrar material e transformá-lo em referência, entrada de geração ou conteúdo pessoal no AraLearn. A publicação oficial permanece somente leitura; qualquer alteração confirmada é aplicada a uma cópia pessoal.

## Como funciona

O usuário escolhe um arquivo em outro aplicativo e usa a ação de compartilhar com o AraLearn. O runtime recebe o arquivo e o oferece como possível referência, fonte de geração ou documento de intercâmbio, sem alterar uma publicação oficial.

O aproveitamento dependerá do tipo de arquivo, da extração disponível e da ação explicitamente escolhida pelo autor.

Quando o arquivo é um documento `aralearn.contract` v3, a interface valida o conteúdo antes de normalizá-lo em linhas relacionais pessoais. O JSON não permanece como unidade persistida.

## Quando é útil

O compartilhamento ajuda quando a preparação de conteúdo começa fora do AraLearn, por exemplo:

- abrir uma apostila em PDF no celular;
- enviar um DOCX para servir de base a uma lição;
- aproveitar arquivo recebido por mensagem;
- importar um projeto JSON v3 exportado anteriormente;
- transformar anotações em fonte para uma trilha.

## Relação com a geração

Receber um arquivo não gera automaticamente uma trilha ou cards. O arquivo pode servir como fonte para planejamento ou geração, desde que o usuário acione e confirme a operação correspondente na interface.

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

O arquivo é lido no dispositivo. Compartilhá-lo com o AraLearn não cria sincronização contínua com a fonte original. Se o usuário importar o conteúdo, suas linhas pessoais entram na réplica relacional e seguem a sincronização granular; se apenas o anexar a uma geração, somente o contexto necessário é enviado ao provedor escolhido.

Operações com IA remota dependem do serviço configurado pelo usuário e das políticas desse serviço. Nenhuma delas concede acesso administrativo ao catálogo oficial.
