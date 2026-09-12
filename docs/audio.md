# Áudio no estudo

O áudio pode integrar uma unidade ou a
[explicação compartilhada](explicacao-e-revisao-humana.md). Sua função depende
da tarefa: ouvir um exemplo, reconhecer um som ou acompanhar uma explicação.
Abra o ícone da ferramenta para escolher uma faixa, controlar sua reprodução e
consultar a alternativa textual disponível.

Há duas formas de escutar: pedir ao dispositivo que leia um texto ou reproduzir um arquivo já guardado no curso. O autor também pode gerar uma gravação por um serviço externo e, depois de ouvi-la, guardá-la como arquivo.

| Escolha | Quando é útil | O que considerar |
| --- | --- | --- |
| Voz do dispositivo | Ler um texto sem preparar uma gravação | A voz e o idioma disponíveis variam entre aparelhos; uma voz pode usar serviço remoto. |
| Arquivo guardado | Usar uma gravação conferida pela autoria | A reprodução depende do acesso autorizado ao arquivo e de sua transferência pela rede. |
| Geração por serviço | Produzir um arquivo a partir de texto | Exige envio autorizado, credencial e cota do serviço; a autoria precisa ouvir o resultado. |

## Voz do dispositivo

Na Autoria, **Áudio → Configuração** permite escolher idioma, velocidade e voz preferida. A lista vem do dispositivo e pode variar entre navegadores. Se a voz escolhida não estiver disponível ou não corresponder ao idioma, o aplicativo pede que a escolha seja revista. Quando não há uma voz definida, procura uma opção local compatível.

Uma voz local realiza a síntese no dispositivo. Uma voz remota envia o texto a um serviço e depende de conexão. Para usá-la, o curso precisa permitir essa opção e a ferramenta pede autorização de quem escuta, identificando a voz. Autorizar não inicia a fala: use **Reproduzir**. Essa autorização termina ao fechar a ferramenta.

A velocidade aceita de 0,25 a 2 vezes o ritmo normal. O mecanismo de voz pode impor seus próprios limites. Fechar a ferramenta ou iniciar outra faixa encerra a reprodução anterior. A fala local pode funcionar sem rede quando a voz e a configuração necessárias já estão disponíveis.

## Arquivos e alternativas

Em **Áudio → Arquivos**, escolha o arquivo, confira a prévia e use **Guardar áudio**. Guardar não o inclui automaticamente no conteúdo: escolha a faixa ao compor a unidade ou a explicação. Uma ferramenta pode reunir várias faixas com nomes e idiomas diferentes.

Os formatos aceitos são WAV com PCM inteiro, que guarda amostras de som sem compressão, e MP3, que usa compressão. O limite é de 20 MiB por arquivo e 64 MiB no conjunto de PDFs e áudios do curso. Um MiB equivale a 1.048.576 bytes, unidade usada nesses limites.

O autor prepara a alternativa textual de cada faixa conforme a tarefa:

| Disponibilidade | Comportamento |
| --- | --- |
| **Sempre** | O texto acompanha a faixa desde a abertura. |
| **Por escolha** | Aparece quando o estudante solicita. |
| **Após responder** | Fica disponível depois da resposta ou do retorno da prática. |

Em uma tarefa de escuta, o nome da faixa não deve antecipar a resposta. A alternativa textual precisa permitir compreender ou realizar uma tarefa equivalente; sua adequação depende do conteúdo preparado pela autoria. Na edição, o proprietário pode consultar e corrigir esses textos.

A reprodução de arquivos usa os controles do navegador para pausar, percorrer a faixa e ajustar a velocidade. Se um arquivo não puder ser reproduzido, a ferramenta informa a falha. Remover um áudio da biblioteca conserva as faixas que o utilizavam, mas elas passam a indicar indisponibilidade. O autor pode reenviar o mesmo arquivo ou selecionar outro.

## Acesso e uso sem conexão

Num curso privado, o proprietário consulta a biblioteca inteira. Uma pessoa com acesso compartilhado recebe somente os arquivos associados ao conteúdo que está autorizada a abrir. Para visitantes de um curso público, o áudio também precisa estar associado ao conteúdo e ter sua disponibilidade pública autorizada. Tornar o curso público disponibiliza os arquivos por padrão, preservando restrições explícitas aplicáveis; isso não expõe a visitantes a biblioteca autoral inteira nem áudios sem associação ao conteúdo de estudo.

Cada abertura de um arquivo confirma o acesso pela rede. Depois de recebido, ele pode continuar tocando enquanto a ferramenta está aberta, mas não passa a integrar uma biblioteca permanente para uso sem conexão. Uma falha não aciona outro serviço de voz. Já a voz local pode funcionar offline nas condições explicadas acima.

Revogar acesso impede novas autorizações, mas não recolhe os dados já recebidos pela pessoa. Os mecanismos e limites de autorização estão descritos em [Privacidade](privacidade.md).

## Gerar e guardar com Gemini

Na Autoria, **Gerar voz** utiliza o serviço Gemini configurado no aplicativo. Informe o texto, escolha uma voz, forneça a credencial temporária e autorize o envio e o consumo da sua cota. A credencial não fica guardada no curso nem no perfil. Abrir uma unidade ou reproduzir uma faixa existente não gera outra gravação.

Ouça o resultado antes de guardar. Pronúncia, sotaque e ritmo podem precisar de
ajuste, sobretudo em conteúdo especializado. O serviço declara suporte a
português, inglês, japonês e outros idiomas. Cada gravação ainda precisa ser
conferida pela autoria. Consulte
[Vozes e geração de fala](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

A interface gera a gravação em ritmo normal; a velocidade configurada no curso é aplicada ao reproduzi-la. Para textos longos, divida a gravação por partes que façam sentido na aprendizagem. O aplicativo aceita até 16 mil caracteres por fala e não corta o texto automaticamente; o serviço também tem seus próprios limites.

Se a resposta da geração se perder, outro pedido pode produzir outra cobrança e outro arquivo. O aplicativo não repete essa geração automaticamente. Se o arquivo já chegou e somente o envio ao curso ficou pendente, a recuperação reutiliza o mesmo conteúdo recebido. Cancelar a espera não comprova que o fornecedor deixou de receber o pedido.

## Custo, privacidade e disponibilidade

A referência de preços conferida em 11 de setembro de 2026 informa um nível
gratuito e outro pago para a geração de fala a partir de texto (*text-to-speech*,
TTS). No Gemini 2.5 Flash Preview TTS, o nível pago indicava US$ 0,50 por milhão
de tokens de texto de entrada e US$ 10 por milhão de tokens de áudio de saída.

Tokens são unidades usadas pelo serviço para processar texto ou áudio; não
correspondem a um número fixo de caracteres ou segundos. A cota e a cobrança
dependem do projeto e da conta. Confira os
[preços](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-preview-tts)
e os [limites por projeto](https://ai.google.dev/gemini-api/docs/rate-limits)
antes de gerar.

Nos serviços gratuitos, os termos do Google admitem uso do conteúdo para melhoria de produtos e revisão humana e orientam a não enviar dados pessoais, confidenciais ou sensíveis. Os serviços pagos têm condições diferentes, além de retenções ligadas a segurança e abuso. A autorização na interface não substitui a conferência das condições da conta. [Termos da Gemini API](https://ai.google.dev/gemini-api/terms).

O modelo implementado é uma versão de prévia e sua oferta pode mudar. O AraLearn não troca automaticamente de modelo ou fornecedor quando ela fica indisponível. Consulte a [política de descontinuação](https://ai.google.dev/gemini-api/docs/deprecations).

## Referência de implementação

Os mecanismos abaixo permitem distinguir uma escolha de reprodução, uma transferência de arquivo e uma nova geração. Essa diferença é importante para preservar acesso, integridade e controle de consumo.

### Síntese pelo navegador

A Web Speech API é o recurso pelo qual o navegador oferece síntese de voz. Ela reproduz a fala, mas não oferece uma operação para exportar as amostras como arquivo. A indicação de voz local vem do campo `localService` informado pelo navegador; não certifica pronúncia ou disponibilidade em outro aparelho. [Especificação Web Speech API](https://webaudio.github.io/web-speech-api/).

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

O serviço retorna um canal de som com 24 mil amostras por segundo e 16 bits por amostra: PCM mono de 16 bits a 24 kHz. O adaptador organiza essas amostras como WAV, verifica a estrutura e calcula o hash antes de oferecer o arquivo para ser guardado. [Formato de saída](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

O adaptador aceita uma instrução de ritmo para consumidores que a solicitem explicitamente. Ela orienta o modelo, sem garantir duração exata. A interface usa apenas a velocidade de reprodução para não aplicar o mesmo ajuste duas vezes.

Além do limite local de caracteres, o modelo documenta 8.192 tokens de entrada e 16.384 de saída. Como caracteres e tokens não têm uma correspondência fixa, um texto aceito localmente ainda pode exceder o limite remoto. [Limites do modelo](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts).

Testes com respostas sintéticas verificam formato, integridade e recuperação sem consumir um serviço real. A qualidade da voz, a cota da conta e a integração paga dependem de uma execução real autorizada e da escuta do resultado.
