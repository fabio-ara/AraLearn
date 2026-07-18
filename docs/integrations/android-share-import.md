# Compartilhamento no Android

No Android, o AraLearn pode receber arquivos compartilhados por outros apps. Esse recurso reduz o atrito entre encontrar material e transformá-lo em fonte de estudo.

## Como funciona

O usuário escolhe um arquivo em outro app e usa a ação de compartilhar com o AraLearn. O app recebe o arquivo e o trata como possível entrada para estudo, referência de organização ou projeto a importar.

O aproveitamento posterior depende do tipo de arquivo, da extração disponível e da ação escolhida pelo usuário.

Quando o arquivo é um documento `aralearn.contract` v3, o app valida o conteúdo e o normaliza imediatamente em linhas relacionais. O JSON recebido não permanece como unidade persistida.

## Quando é útil

O compartilhamento ajuda quando o estudo começa fora do AraLearn, por exemplo:

- abrir uma apostila em PDF no celular;
- enviar um DOCX para servir de base a uma lição;
- aproveitar arquivo recebido por mensagem;
- importar um projeto JSON v3 exportado anteriormente;
- transformar anotações em fonte para uma trilha.

## Relação com a geração

Receber um arquivo não significa gerar automaticamente uma trilha ou cards. O arquivo pode servir como fonte para planejamento da trilha ou geração local, desde que o usuário acione a operação correspondente.

Quando houver uso de modelo de linguagem por API, apenas o contexto necessário para a chamada deve ser enviado ao serviço configurado.

## Limitações

Receber o arquivo não garante aproveitamento perfeito. A qualidade depende de:

- formato do arquivo;
- qualidade da extração textual;
- presença de imagens ou tabelas complexas;
- clareza do material original;
- revisão posterior do usuário.

Quando a extração não for suficiente, o usuário deve revisar e corrigir a orientação gerada.

## Privacidade

O arquivo compartilhado é lido no próprio dispositivo. Compartilhá-lo com o AraLearn não cria sincronização contínua com a fonte original; se o conteúdo for importado, suas linhas entram na réplica e seguem o protocolo normal de sincronização com o Supabase canônico.

Operações com IA remota, quando usadas, dependem do serviço configurado pelo usuário e das políticas desse serviço.
