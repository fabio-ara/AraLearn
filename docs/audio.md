# Áudio no estudo

O áudio é uma ferramenta da unidade. Abra seu ícone para escolher uma faixa, reproduzir, parar ou consultar a alternativa textual disponível. Uma unidade pode reunir várias faixas com nomes e idiomas diferentes. O texto da unidade continua responsável por explicar a tarefa.

| Origem | O que fica no curso | Reprodução e conexão |
| --- | --- | --- |
| Voz do dispositivo | Texto, idioma e alternativa da faixa | Usa uma voz compatível instalada ou oferecida pelo navegador. Voz local não envia o texto a um serviço de síntese. Voz remota depende de conexão e de autorização de quem escuta. |
| Arquivo | Identidade do áudio guardado no curso | Reproduz o arquivo autorizado, com controles do navegador para pausar e percorrer a faixa. |
| Serviço de geração | Depois de gerar e guardar, um arquivo como os demais | O proprietário envia explicitamente o texto ao serviço configurado. Escutar o arquivo guardado não faz outra geração. |

## Voz do dispositivo

Os ajustes do curso indicam idioma, velocidade, voz preferida e se o curso permite vozes remotas. A lista de vozes vem do dispositivo: pode demorar a chegar, variar entre navegadores ou não oferecer o idioma necessário. O AraLearn procura uma voz local compatível quando não há voz escolhida. Uma escolha que desapareceu ou não corresponde ao idioma da faixa precisa ser revista; o aplicativo não a substitui silenciosamente.

Se a voz disponível for remota, a autorização do curso é apenas a primeira condição. A ferramenta mostra o nome da voz e pede a quem escuta autorização para enviar o texto daquela faixa. Marcar a autorização não inicia a fala: é preciso escolher **Reproduzir**. Essa autorização termina ao fechar a ferramenta. Uma voz local é identificada pela informação `localService` fornecida pelo navegador; isso não certifica a qualidade da pronúncia nem a disponibilidade em outro aparelho. A Web Speech API oferece reprodução, sem uma operação para exportar as amostras como arquivo. [Especificação Web Speech API](https://webaudio.github.io/web-speech-api/).

A velocidade de reprodução aceita valores de 0,25 a 2 vezes a velocidade normal. Na fala nativa, o mecanismo de voz pode impor limites próprios. No arquivo, o ajuste usa o controle de velocidade do navegador. Fechar a ferramenta ou iniciar outra faixa encerra a reprodução anterior.

## Arquivos e alternativas

Os formatos aceitos são WAV com PCM inteiro e MP3. O limite por arquivo é 20 MiB; a cota de arquivos do curso reúne PDFs e áudios e totaliza 64 MiB de conteúdo único. O servidor confere os bytes e o acesso. O curso guarda hash, tamanho e tipo de mídia, sem URL de Storage. A reprodução usa um Blob verificado e libera essa URL temporária quando termina sua utilização. Um arquivo com estrutura aceita ainda pode falhar no decodificador de um navegador; nesse caso a ferramenta informa a falha e permite tentar novamente.

Em um curso privado, a pessoa proprietária consulta a biblioteca inteira; uma pessoa com acesso compartilhado obtém apenas arquivos associados à unidade que abriu. Para visitantes de um curso público, o arquivo também precisa estar associado à unidade e o proprietário precisa ter confirmado a disponibilidade pública dos arquivos do curso. Tornar o curso público, sozinho, não libera os áudios. Um arquivo solto na biblioteca não vira um recurso público por existir no mesmo curso.

Remover um arquivo da biblioteca conserva as faixas que o referenciavam, mas elas passam a informar indisponibilidade. O proprietário pode reenviar os mesmos bytes ou escolher outro áudio para a faixa. Um envio interrompido deve ser confirmado com o mesmo pedido e os mesmos bytes; o aplicativo não transforma a dúvida sobre o resultado em outro arquivo. Preparações de upload expiram após dez minutos, e a consulta da biblioteca permite limpar os objetos incompletos vencidos antes de uma nova tentativa.

O proprietário define a alternativa textual de cada faixa conforme a tarefa:

- **Sempre:** acompanha a faixa desde a abertura.
- **Por escolha:** aparece quando o estudante solicita a alternativa.
- **Após responder:** fica disponível depois da resposta ou do feedback da prática.

Em uma tarefa de escuta, evite pôr a resposta no nome da faixa. Use a condição adequada para não antecipar pela transcrição o que se pretende reconhecer pelo som. A alternativa deve permitir compreender ou realizar uma tarefa equivalente; sua qualidade depende do conteúdo preparado pelo autor. Na edição, o proprietário pode consultar e corrigir os textos completos.

A fala nativa pode funcionar offline quando a voz local correspondente e a configuração já estão disponíveis no dispositivo. Para arquivo, cada abertura confirma o acesso pela rede; os bytes baixados ficam em memória enquanto a ferramenta está aberta. Isso permite continuar aquela reprodução, mas não constitui uma biblioteca offline durável. Falhas de configuração, conexão, acesso ou decodificação são mostradas; elas não acionam outro serviço de voz.

A URL de download autorizada dura 60 segundos. Revogar acesso impede novas autorizações; uma URL já emitida conserva sua janela até expirar, e a revogação não recolhe bytes que a pessoa já recebeu. [Acesso a arquivos no Storage](https://supabase.com/docs/guides/storage/serving/downloads).

## Gerar e guardar com Gemini

Em Autoria, a geração usa o adaptador Gemini, com o modelo `gemini-2.5-flash-preview-tts` e uma das 30 vozes publicadas pelo fornecedor. O formulário exige texto, voz configurada, credencial temporária e consentimento explícito antes de enviar o pedido. A credencial não integra o curso nem seu perfil. O adaptador não roda ao abrir uma unidade ou ao escolher a reprodução nativa. [Vozes e geração de fala](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

O serviço retorna PCM mono de 16 bits a 24 kHz. O adaptador empacota as amostras como WAV, verifica sua estrutura e calcula o hash antes de oferecer o arquivo à ingestão. O texto permanece no idioma informado; a pronúncia, o sotaque e a execução de instruções de ritmo precisam ser ouvidos e revistos pelo autor. Há suporte declarado para português, inglês, japonês, coreano e chinês mandarim, entre outros idiomas. Isso não é uma garantia de qualidade para qualquer conteúdo especializado. [Idiomas e formato de saída](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

A interface gera em ritmo normal; a velocidade configurada no curso é aplicada ao reproduzir o arquivo. O adaptador também aceita uma instrução de ritmo para outros consumidores explícitos, mas ela é uma orientação ao modelo, sem duração exata garantida. Aplicar essa instrução e depois a mesma velocidade de reprodução multiplicaria os efeitos, por isso a interface não faz ambos.

O aplicativo aceita até 16 mil caracteres por fala; o fornecedor também impõe seu limite de contexto. O modelo documenta 8.192 tokens de entrada e 16.384 de saída. Caracteres e tokens são medidas diferentes: um texto dentro do limite local ainda pode exceder a capacidade do serviço. Divida a gravação por partes que façam sentido na aprendizagem; o aplicativo não corta o texto automaticamente. [Limites do modelo](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts).

Se a resposta da geração se perder, uma nova geração pode produzir outra cobrança e outro arquivo. O aplicativo não reenvia automaticamente esse pedido. Quando o arquivo já foi recebido e apenas o envio ao curso precisa ser repetido, a tentativa reutiliza os mesmos bytes. Cancelar a espera também não prova que o fornecedor deixou de receber o pedido.

## Custo, privacidade e disponibilidade

Consulta de referência em 5 de setembro de 2026: o Gemini 2.5 Flash Preview TTS oferece nível gratuito e, no nível pago, informa US$ 0,50 por milhão de tokens de texto de entrada e US$ 10 por milhão de tokens de áudio de saída. Cotas dependem do projeto e do nível da conta; estes valores não prometem gratuidade ou saldo disponível para uma conta específica. Confira a cobrança antes de gerar. [Preços](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-preview-tts), [limites por projeto](https://ai.google.dev/gemini-api/docs/rate-limits).

Nos serviços gratuitos, os termos do Google admitem uso do conteúdo para melhoria de produtos e revisão humana e orientam a não enviar dados pessoais, confidenciais ou sensíveis. Para serviços pagos, há condições diferentes de uso do conteúdo, além de retenções ligadas a segurança e abuso. O consentimento da interface não substitui a leitura das condições aplicáveis à conta. [Termos da Gemini API](https://ai.google.dev/gemini-api/terms).

O modelo é uma versão de prévia e sua oferta pode mudar. O AraLearn mantém o modelo escolhido explicitamente; indisponibilidade não provoca troca automática de fornecedor ou modelo. A prova local com respostas sintéticas verifica contrato, tratamento de erros e bytes. A qualidade de uma voz real, a quota de uma conta e a integração paga exigem uma execução real autorizada. [Política de descontinuação](https://ai.google.dev/gemini-api/docs/deprecations).
