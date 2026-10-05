# Áudio no estudo

O áudio pode integrar uma unidade ou a
[explicação compartilhada](explicacao-e-revisao-humana.md). Sua função depende
da tarefa: ouvir um exemplo, reconhecer um som ou acompanhar uma explicação.
Abra o ícone da ferramenta para escolher uma faixa, controlar sua reprodução e
consultar a alternativa textual disponível.

O estudo utiliza gravações guardadas no curso. Durante a preparação, a autoria
também pode ensaiar a leitura de um texto com a voz do dispositivo. Para entregar
esse conteúdo por publicação, compartilhamento ou materialização, cada faixa
precisa de um arquivo incorporado. A escuta pela autoria verifica pronúncia,
ritmo e adequação à tarefa; o sistema confere o formato e a integridade do
arquivo.

| Escolha | Quando é útil | O que considerar |
| --- | --- | --- |
| Voz do dispositivo | Ler um texto sem preparar uma gravação | A voz e o idioma disponíveis variam entre aparelhos; uma voz pode usar serviço remoto. |
| Arquivo guardado | Usar uma gravação conferida pela autoria | A reprodução depende do acesso autorizado ao arquivo e de sua transferência pela rede. |
| Geração por serviço | Produzir um arquivo a partir de texto | Exige envio autorizado, credencial e cota do serviço; a autoria precisa ouvir o resultado. |

## Voz do dispositivo

Na Autoria, **Áudio → Configuração** permite escolher idioma, velocidade e voz preferida. A lista vem do dispositivo e pode variar entre navegadores. Se a voz escolhida não estiver disponível ou não corresponder ao idioma, o aplicativo pede que a escolha seja revista. Quando não há uma voz definida, procura uma opção local compatível.

Uma voz local realiza a síntese no dispositivo. Uma voz remota envia o texto a um serviço e depende de conexão. Para usá-la, o curso precisa permitir essa opção e a ferramenta pede autorização de quem escuta, identificando a voz. Autorizar não inicia a fala: use **Reproduzir**. Essa autorização termina ao fechar a ferramenta.

A velocidade aceita de 0,25 a 2 vezes o ritmo normal. O mecanismo de voz pode impor seus próprios limites. Fechar a ferramenta ou iniciar outra faixa encerra a reprodução anterior. A fala local pode funcionar sem rede quando a voz e a configuração necessárias já estão disponíveis.

Na voz nativa, o tempo decorrido depende dos eventos informados pelo navegador.
A duração permanece desconhecida durante a fala; um evento de término com tempo
válido pode informar a duração dessa execução. O controle para escolher um
ponto da faixa, chamado de busca ou *seek*, fica disponível apenas para arquivos
com duração conhecida. Uma nova fala pode usar outra voz ou velocidade e começa
com duração novamente desconhecida. Esse ensaio prepara a gravação exigida para
entrega.

## Arquivos e alternativas

Em **Áudio → Arquivos**, escolha o arquivo, confira a prévia e use **Guardar áudio**. Guardar não o inclui automaticamente no conteúdo: escolha a faixa ao compor a unidade ou a explicação. Uma ferramenta pode reunir várias faixas com nomes e idiomas diferentes.

O exemplo técnico do catálogo corresponde a uma [gravação incluída nos testes](../tests/fixtures/audio/README.md).
Para experimentá-lo em um curso, guarde esse arquivo primeiro e use a referência
devolvida pelo sistema. Copiar o JSON não coloca a gravação na biblioteca.

Os formatos aceitos são WAV com PCM inteiro, que guarda amostras de som sem compressão, e MP3, que usa compressão. O limite é de 20 MiB por arquivo e 64 MiB no conjunto de PDFs e áudios do curso. Um MiB equivale a 1.048.576 bytes, unidade usada nesses limites.

O autor prepara a alternativa textual de cada faixa conforme a tarefa:

| Disponibilidade | Comportamento |
| --- | --- |
| **Sempre** | O texto acompanha a faixa desde a abertura. |
| **Por escolha** | Aparece quando o estudante solicita. |
| **Após responder** | Fica disponível depois da resposta ou do retorno da prática. |

Em uma tarefa de escuta, o nome da faixa não deve antecipar a resposta. A alternativa textual precisa permitir compreender ou realizar uma tarefa equivalente; sua adequação depende do conteúdo preparado pela autoria. Na edição, o proprietário pode consultar e corrigir esses textos.

A reprodução de arquivos usa o elemento HTML `<audio>` e seus metadados para
pausar, percorrer a faixa, mostrar duração e ajustar a velocidade. Seek só é
habilitado quando a duração está disponível. Se um arquivo não puder ser
reproduzido, a ferramenta informa a falha. O download confere tipo, tamanho e
SHA-256 antes de entregar os bytes ao navegador. Remover um áudio ainda usado
é recusado; substitua ou retire o vínculo antes. Consulte o [HTML Standard,
mídia](https://html.spec.whatwg.org/multipage/media.html).

## Acesso e uso sem conexão

Num curso privado, o proprietário consulta a biblioteca inteira. Uma pessoa com acesso compartilhado recebe somente os arquivos associados ao conteúdo que está autorizada a abrir. Para visitantes de um curso público, o áudio também precisa estar associado ao conteúdo e ter sua disponibilidade pública autorizada. Tornar o curso público disponibiliza os arquivos por padrão, preservando restrições explícitas aplicáveis; isso não expõe a visitantes a biblioteca autoral inteira nem áudios sem associação ao conteúdo de estudo.

Cada abertura de um arquivo confirma o acesso pela rede. Depois de recebido, ele pode continuar tocando enquanto a ferramenta está aberta, mas não passa a integrar uma biblioteca permanente para uso sem conexão. Uma falha não aciona outro serviço de voz. Já a voz local pode funcionar offline nas condições explicadas acima.

Revogar acesso impede novas autorizações, mas não recolhe os dados já recebidos pela pessoa. Os mecanismos e limites de autorização estão descritos em [Privacidade](privacidade.md).

## Gerar e guardar com Gemini

Na Autoria, **Gerar voz** utiliza o serviço Gemini configurado no aplicativo. Informe o texto, escolha uma voz, forneça a credencial temporária e autorize o envio e o consumo da sua cota. A credencial não fica guardada no curso nem no perfil. Abrir uma unidade ou reproduzir uma faixa existente não gera outra gravação.

Ouça o resultado antes de guardar. Pronúncia, sotaque e ritmo podem precisar de
ajuste, sobretudo em conteúdo especializado. Confira as condições do idioma e
da voz na [documentação de geração de fala](https://ai.google.dev/gemini-api/docs/speech-generation)
e examine a gravação da tarefa concreta.

A interface gera a gravação em ritmo normal; a velocidade configurada no curso é aplicada ao reproduzi-la. Para textos longos, divida a gravação por partes que façam sentido na aprendizagem. O aplicativo aceita até 16 mil caracteres por fala e não corta o texto automaticamente; o serviço também tem seus próprios limites.

Se a resposta da geração se perder, outro pedido pode produzir outra cobrança e outro arquivo. O aplicativo não repete essa geração automaticamente. Se o arquivo já chegou e somente o envio ao curso ficou pendente, a recuperação reutiliza o mesmo conteúdo recebido. Cancelar a espera não comprova que o fornecedor deixou de receber o pedido.

## Custo, privacidade e disponibilidade

A geração de fala a partir de texto, chamada de *text-to-speech* (TTS), usa a
cota da conta informada na autoria. Antes de gerar, confira a disponibilidade
do modelo `gemini-2.5-flash-preview-tts`, os
[preços](https://ai.google.dev/gemini-api/docs/pricing) e os
[limites do projeto](https://ai.google.dev/gemini-api/docs/rate-limits).
Esse é o identificador fixado na implementação do AraLearn. A oferta atual do
fornecedor pode apresentar outros modelos; utilizá-los exige atualizar e
verificar a integração.

Tokens são as unidades de processamento usadas pelo serviço. A relação entre
tokens, caracteres e duração varia com o conteúdo, por isso uma estimativa de
custo precisa considerar o modelo e os dados efetivamente processados.

Os [termos da Gemini API](https://ai.google.dev/gemini-api/terms) distinguem o
tratamento de dados conforme o serviço e a região. Nas condições gerais de uso
gratuito, admitem melhoria de produtos e análise por revisores humanos; por
isso, reservam esse uso a conteúdo sem dados pessoais, confidenciais ou
sensíveis. Para serviços pagos, estabelecem tratamento próprio e retenção
limitada ligada à segurança. Há condições específicas para o Espaço Econômico
Europeu, a Suíça e o Reino Unido. Confira as regras da conta e da região antes
de autorizar o envio na interface.

O identificador implementado pertence à linha de prévia do fornecedor. Se a
oferta mudar ou o modelo ficar indisponível, o pedido pode falhar até que a
integração seja atualizada. Consulte a
[política de descontinuação](https://ai.google.dev/gemini-api/docs/deprecations).

## Arquivo exigido para entrega

As guardas de domínio verificam as faixas quando um curso é publicado, quando
o conteúdo é entregue a uma pessoa compartilhada e quando uma unidade nova ou
alterada é materializada. Nesses três casos, cada faixa de áudio precisa ser
`kind: "file"`, apontar para mídia ativa do mesmo curso e coincidir em tipo,
tamanho e hash. Curso público também precisa permitir a entrega pública dos
arquivos. Uma síntese nativa ou arquivo ausente bloqueia a operação.

A biblioteca continua privada e separada do conteúdo até uma faixa referenciá-la.
Uma falha de reprodução não aciona outra voz automaticamente; a alternativa
textual permanece o caminho acessível.

## Referência de implementação

Os mecanismos abaixo distinguem uma escolha de reprodução e uma transferência
de arquivo. Essa diferença preserva acesso e integridade.

### Síntese pelo navegador

A Web Speech API é o recurso pelo qual o navegador oferece síntese de voz. Ela reproduz a fala, mas não oferece uma operação para exportar as amostras como arquivo. A indicação de voz local vem do campo `localService` informado pelo navegador; não certifica pronúncia ou disponibilidade em outro aparelho. [Especificação Web Speech API, seção de síntese](https://webaudio.github.io/web-speech-api/#tts-section).

### Integridade e transferência dos arquivos

O servidor confere o arquivo recebido e a autorização para guardá-lo. Também
registra seu tamanho, formato e **hash**, resumo calculado que permite verificar
se os mesmos bytes chegaram ao armazenamento. O curso referencia a identidade
do áudio, não seu endereço interno de armazenamento.

Na reprodução, o aplicativo confere o arquivo e cria um objeto em memória, chamado **Blob**, para disponibilizar seus bytes ao navegador. O endereço local desse objeto é liberado ao terminar o uso. Mesmo um arquivo com estrutura aceita pode falhar no decodificador de um navegador, que transforma os dados em som; a ferramenta informa essa situação e permite tentar novamente.

O endereço autorizado de download dura 60 segundos. Uma autorização já emitida conserva essa janela até expirar, mesmo depois de uma revogação. [Acesso a arquivos no Storage](https://supabase.com/docs/guides/storage/serving/downloads).

Um envio interrompido é recuperado com o mesmo pedido e os mesmos bytes. Preparações de envio expiram depois de dez minutos; a consulta à biblioteca permite limpar objetos incompletos vencidos antes de nova tentativa. O contrato de transferência pelos clientes está em [Autoria por MCP](autoria-mcp.md), [Actions/OpenAPI](autoria-actions.md) e [Contrato de conteúdo](aralearn-contract.md).

### Adaptador de geração

O adaptador converte o pedido do AraLearn para o serviço externo e recebe a gravação. A implementação usa `gemini-2.5-flash-preview-tts` e uma das 30 vozes cadastradas; a existência de outros modelos do fornecedor não altera essa escolha. [Documentação de geração de fala](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

O [adaptador implementado](../src/generation/providers/geminiSpeechProvider.js)
aceita PCM mono de 16 bits a 24 kHz: um canal de som com 24 mil amostras por
segundo e 16 bits por amostra. Ele organiza essas amostras como WAV, verifica a
estrutura e calcula o hash antes de oferecer o arquivo para ser guardado. Uma
resposta com formato incompatível produz erro e exige conferir a integração com
a [API de fala](https://ai.google.dev/gemini-api/docs/speech-generation).

O adaptador aceita uma instrução de ritmo para consumidores que a solicitem explicitamente. Ela orienta o modelo, sem garantir duração exata. A interface usa apenas a velocidade de reprodução para não aplicar o mesmo ajuste duas vezes.

O limite local de 16 mil caracteres convive com os limites remotos do modelo e
da conta. Como o serviço mede entrada e saída segundo suas próprias unidades,
um texto aceito pelo aplicativo ainda pode exceder a capacidade remota. A
[documentação de modelos](https://ai.google.dev/gemini-api/docs/models) permite
conferir a oferta vigente antes de planejar gravações extensas.

Testes com respostas sintéticas verificam formato, integridade e recuperação sem consumir um serviço real. A qualidade da voz, a cota da conta e a integração paga dependem de uma execução real autorizada e da escuta do resultado.
