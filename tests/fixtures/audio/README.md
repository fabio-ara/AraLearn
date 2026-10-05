# Gravação do exemplo de áudio

[aralearn-greeting.wav](aralearn-greeting.wav) contém a fala sintética “Good morning. How are you?”,
gerada localmente com a voz Microsoft Zira em 24/09/2026, sem serviço remoto.
É a gravação correspondente ao exemplo canônico do
[componente de áudio](../../../src/resources/packages/audio/index.js).

O [teste do componente](../../runtime/resource-audio.test.js) verifica formato,
tamanho e SHA-256, a impressão digital calculada a partir dos bytes do arquivo.
Para usar esse exemplo em um curso, guarde primeiro o arquivo na biblioteca
de áudio e use a referência devolvida por `guardar_audio`. O JSON de exemplo
descreve a faixa; sua disponibilidade em um curso depende dessa gravação na
biblioteca, conforme a [autoria de áudio](../../../docs/autoria-mcp.md).
