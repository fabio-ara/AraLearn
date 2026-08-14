# Compartilhamento de JSON no Android

## Vocabulário da integração

- **JSON** é um formato textual estruturado, usado aqui para representar um documento de curso;
- **camada nativa** é a parte escrita para o Android; uma **Activity** representa uma tela ou ponto de interação do aplicativo;
- **Intent** é a mensagem com que o Android pede a um aplicativo que abra ou receba conteúdo; `ACTION_VIEW`, `ACTION_SEND` e `ACTION_SEND_MULTIPLE` identificam modalidades desse pedido;
- **WebView** é o navegador incorporado ao aplicativo Android; **JavaScript** é a linguagem que executa a interface web dentro dele;
- **UTF-8** é a codificação de caracteres exigida para preservar o texto; **MiB** é uma unidade binária de tamanho, equivalente a 1.048.576 bytes;
- **runtime web** é o código da aplicação enquanto está em execução no navegador incorporado;
- **contrato** é o conjunto de regras que define a forma e o significado aceitos para o documento;
- **repositório relacional** é a camada que grava e consulta entidades relacionadas sem tratar o arquivo recebido como autoridade por si só;
- **workspace** é a área persistente de autoria; **gateway** é o serviço que autentica, autoriza e traduz pedidos externos para operações do AraLearn;
- **MCP** (*Model Context Protocol*) conecta um assistente às ferramentas do gateway; uma **Action** oferece operações equivalentes por uma interface HTTP descrita em **OpenAPI**, formato legível por máquinas para documentar operações de rede;
- **PDF** (*Portable Document Format*) e **DOCX** são formatos de documento, respectivamente paginado e de processamento de texto; nenhum deles é convertido por esta integração;
- **`requestId`** é o identificador estável de uma tentativa de escrita, usado para reconhecer sua repetição;
- **APK** é o arquivo instalável do aplicativo Android.

O Android permite que um aplicativo receba texto ou arquivos enviados por
**Abrir com** e **Compartilhar**. No AraLearn, a camada nativa já captura um
documento JSON e o encaminha à `WebView`. A aplicação web, porém, ainda não
implementa o receptor `AraLearnAndroidImport.receiveSharedJson`. Portanto,
esta integração não realiza uma importação completa na versão atual.

Esta distinção é importante: receber bytes do sistema operacional não equivale
a validar, apresentar e incorporar um curso.

## O que já está implementado

`MainActivity` aceita `ACTION_VIEW`, `ACTION_SEND` e
`ACTION_SEND_MULTIPLE` para conteúdo JSON, texto ou fluxo binário. A captura:

- lê no máximo 5 MiB;
- rejeita conteúdo vazio, ilegível ou incompatível com texto UTF-8;
- conserva o nome da origem quando disponível;
- procura o primeiro fluxo legível em um compartilhamento múltiplo;
- marca a Intent como consumida para não repeti-la ao recriar a tela;
- aguarda a `WebView` ficar pronta antes de chamar o receptor JavaScript.

O conteúdo pendente fica somente na memória da Activity. Se o processo Android
for encerrado antes da entrega, não há fila persistente que permita retomá-lo.

## O que ainda falta

O runtime web precisaria definir o receptor JavaScript, analisar o contrato,
mostrar uma confirmação compreensível e delegar a gravação a uma operação de
importação autorizada. Nenhuma dessas etapas está disponível no aplicativo
estudantil atual. O repositório relacional também rejeita explicitamente a
importação autoral nessa superfície.

Por isso, a versão atual não deve prometer:

- confirmação com botões **Importar** e **Cancelar**;
- reconhecimento e incorporação de `aralearn.library.v1`;
- criação de workspace a partir do arquivo;
- conversão de PDF, DOCX, imagem, áudio ou página web;
- uso do conteúdo compartilhado como mensagem para um modelo de linguagem.

## Como adicionar conteúdo hoje

### Pré-condição

Tenha uma conta com acesso ao workspace de autoria — o espaço persistente que
guarda a árvore corrente do curso — e use uma integração MCP ou o GPT
personalizado com Action configurado para esse ambiente.

### Passos

1. Abra a superfície de autoria compatível.
2. Localize ou crie o workspace.
3. Leia a revisão atual antes de qualquer gravação.
4. Use as ferramentas de importação ou criação oferecidas pelo gateway, de
   acordo com a permissão da conta.
5. Confira o conteúdo em **Trilhas**.

### Resultado esperado

O conteúdo passa pelo contrato relacional e pela autorização do serviço, fica
visível em Trilhas e pode ser retomado por outra sessão autorizada.

### Offline e recuperação

Autoria remota exige conexão. Se a rede cair, não repita uma escrita com novo
`requestId` sem antes consultar o workspace; uma primeira tentativa pode ter
sido concluída no servidor. A leitura atual determina se é preciso retomar ou
enviar uma nova operação.

## Critérios para concluir a integração Android

Uma implementação futura só deve ser considerada pronta quando:

1. o receptor JavaScript existir no runtime realmente empacotado;
2. o documento for validado antes de qualquer alteração;
3. a pessoa vir origem, formato e efeito antes de confirmar;
4. cancelar não alterar o estado;
5. o resultado usar uma operação relacional autorizada, sem criar um segundo
   armazenamento paralelo;
6. Intent repetida, arquivo múltiplo, processo encerrado e documento acima do
   limite tiverem comportamento testado;
7. os testes cobrirem APK e navegador interno, e não apenas a captura nativa.

## Diagnóstico

| Sintoma | Interpretação atual | Ação |
| --- | --- | --- |
| O Android informa que recebeu o arquivo, mas nada é importado | A captura nativa ocorreu, mas o receptor web não existe | Use o fluxo de autoria remoto. |
| Nenhum arquivo é recebido | Tipo incompatível, conteúdo vazio, leitura negada ou tamanho acima de 5 MiB | Compartilhe um JSON textual menor e confirme a permissão de leitura; ainda assim, a importação não será concluída nesta versão. |
| O mesmo arquivo reaparece ao girar a tela | A Intent não foi marcada como consumida | Trate como regressão na camada nativa e registre o cenário reproduzível. |
| O conteúdo some após encerrar o processo | A pendência nativa não é persistente | Reabra o arquivo quando houver um receptor web implementado; hoje, use a autoria remota. |
