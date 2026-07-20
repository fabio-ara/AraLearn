# Compartilhamento no Android — capacidade futura

O runtime estudantil atual não recebe arquivos como cursos, não importa projetos pessoais e não usa documentos compartilhados para gerar conteúdo. O curso oficial selecionado permanece somente leitura. Este documento preserva uma possibilidade de integração futura, que dependerá da criação explícita de um fluxo autoral separado.

## Como poderá funcionar

Numa fase futura, o usuário poderá escolher um arquivo em outro app e compartilhá-lo com uma ferramenta de autoria vinculada ao AraLearn. O arquivo poderá servir como referência ou como documento de intercâmbio, sem alterar uma publicação oficial.

O aproveitamento dependerá do tipo de arquivo, da extração disponível e da ação explicitamente escolhida pelo autor.

Se essa fase aceitar um documento `aralearn.contract` v3, uma fronteira administrativa ou autoral deverá validar o conteúdo antes de normalizá-lo em linhas relacionais. O JSON não poderá permanecer como unidade persistida.

## Quando é útil

O compartilhamento futuro poderá ajudar quando a preparação de conteúdo começar fora do AraLearn, por exemplo:

- abrir uma apostila em PDF no celular;
- enviar um DOCX para servir de base a uma lição;
- aproveitar arquivo recebido por mensagem;
- enviar um projeto JSON v3 para uma ferramenta autoral autorizada;
- transformar anotações em fonte para uma trilha.

## Relação com a geração

Receber um arquivo não deverá gerar automaticamente uma trilha ou cards. O arquivo poderá servir como fonte para uma ferramenta autoral futura, desde que o usuário acione uma operação explícita fora do runtime estudantil.

Se houver uso futuro de modelo de linguagem, apenas o contexto necessário poderá ser enviado pelo serviço autoral configurado.

## Limitações

Uma implementação futura não garantirá aproveitamento perfeito. A qualidade dependerá de:

- formato do arquivo;
- qualidade da extração textual;
- presença de imagens ou tabelas complexas;
- clareza do material original;
- revisão posterior do usuário.

Quando a extração não for suficiente, o autor deverá revisar ou recusar o material produzido.

## Privacidade

Uma implementação futura deverá informar onde o arquivo será lido e exigir autorização antes de qualquer envio. O conteúdo não poderá entrar na réplica estudantil nem seguir a sincronização de progresso e comentários; autoria e publicação terão protocolo próprio.

Operações com IA remota, se implementadas, dependerão do serviço autoral e das políticas desse serviço.
