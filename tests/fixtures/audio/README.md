# Gravação do exemplo de áudio

`aralearn-greeting.wav` contém a fala sintética “Good morning. How are you?”,
gerada localmente com a voz Microsoft Zira em 24/09/2026, sem serviço remoto.
É a gravação correspondente ao exemplo canônico de `aralearn.resource.audio`.

O teste `tests/runtime/resource-audio.test.js` verifica formato, tamanho e SHA-256.
Para usar esse exemplo em um curso, guarde primeiro o arquivo na biblioteca
de áudio e use a referência devolvida por `guardar_audio`. O JSON de exemplo
não registra mídia em um curso nem comprova que o arquivo já está disponível nele.
