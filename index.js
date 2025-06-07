const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');
const colors = require('colors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn, exec } = require('child_process');

const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
        headless: true,
        args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
    },
    webVersionCache: { 
        type: 'remote', 
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
    ffmpeg: './ffmpeg.exe',
    authStrategy: new LocalAuth({ clientId: "client" })
});
const config = require('./config/config.json');

client.on('qr', (qr) => {
    console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] Scan the QR below : `);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.clear();
    const consoleText = './config/console.txt';
    fs.readFile(consoleText, 'utf-8', (err, data) => {
        if (err) {
            console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] Console Text not found!`.yellow);
            console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] ${config.name} is Already!`.green);
        } else {
            console.log(data.green);
            console.log(`[${moment().tz(config.timezone).format('HH:mm:ss')}] ${config.name} is Already!`.green);
        }
    });
});

// Função para extrair link de imagem do VSCO
async function extrairLinkVSCO(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const regex = /<img[^>]+srcset="([^"]*vsco[^\"]*\.jpg[^"]*)"/i;
                const match = data.match(regex);
                if (match && match[1]) {
                    let src = match[1];
                    if (src.startsWith("//")) src = "https:" + src;
                    resolve(src);
                } else {
                    reject("Nenhuma imagem encontrada no link VSCO.");
                }
            });
        }).on('error', (err) => {
            reject(err.message);
        });
    });
}

// Função para baixar a imagem do VSCO usando ffmpeg e enviar
async function baixarImagemVSCO(url, message) {
    try {
        console.log(`[>] Solicitado download de imagem VSCO: ${url}`);
        const linkImagem = await extrairLinkVSCO(url);
        const nomeArquivo = linkImagem.split("/").pop().split("?")[0];

        console.log(`[✓] Baixando com ffmpeg: ${linkImagem}`);

        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-headers', 'Referer: https://vsco.co/\nUser-Agent: Mozilla/5.0',
            '-i', linkImagem,
            nomeArquivo
        ]);

        ffmpeg.on('close', async (code) => {
            if (code === 0) {
                console.log(`[✓] Salvo como ${nomeArquivo}`);
                try {
                    const media = MessageMedia.fromFilePath(nomeArquivo);
                    await client.sendMessage(message.from, media);
                    fs.unlinkSync(nomeArquivo);
                } catch (err) {
                    console.log('[x] Erro ao enviar mídia:', err);
                    client.sendMessage(message.from, 'Erro ao enviar a imagem.');
                }
            } else {
                console.log(`[x] Erro no ffmpeg (code ${code})`);
                client.sendMessage(message.from, 'Erro ao baixar a imagem com ffmpeg.');
            }
        });
    } catch (err) {
        console.log(`[x] Erro ao baixar imagem VSCO: ${err}`);
        client.sendMessage(message.from, `Erro ao baixar imagem VSCO: ${err}`);
    }
}

client.on('message', async (message) => {
    const isGroups = message.from.endsWith('@g.us');
    if ((isGroups && config.groups) || !isGroups) {

        // Sticker comando com prefixo 's'
        if (message.body.startsWith(`${config.prefix}s`)) {
            if (message.type === "image" || message.type === "video" || message.type === "gif") {
                if (config.log) console.log(`[${'!'.red}] ${message.from.replace("@c.us", "").yellow} created sticker`);
                try {
                    const media = await message.downloadMedia();
                    client.sendMessage(message.from, media, {
                        sendMediaAsSticker: true,
                        stickerName: config.name,
                        stickerAuthor: config.author,
                        stickerMetadata: { resize: true }
                    });
                } catch {
                    client.sendMessage(message.from, "*erro");
                }
            }
            else if (message.body === `${config.prefix}s`) {
                if (config.log) console.log(`[${'!'.red}] ${message.from.replace("@c.us", "").yellow} created sticker`);
                const quotedMsg = await message.getQuotedMessage(); 
                if (message.hasQuotedMsg && quotedMsg.hasMedia) {
                    try {
                        const media = await quotedMsg.downloadMedia();
                        client.sendMessage(message.from, media, {
                            sendMediaAsSticker: true,
                            stickerName: config.name,
                            stickerAuthor: config.author,
                            stickerMetadata: { resize: true }
                        });
                    } catch {
                        client.sendMessage(message.from, "erro");
                    }
                } else {
                    client.sendMessage(message.from, "Responda com o arquivo bula..");
                }
            }
        }
        
        // Mudar nome e autor sticker
        else if (message.body.startsWith(`${config.prefix}r`)) {
            if (config.log) console.log(`[${'!'.red}] ${message.from.replace("@c.us", "").yellow} r the author name on the sticker`);
            if (message.body.includes('|')) {
                let name = message.body.split('|')[0].replace(message.body.split(' ')[0], '').trim();
                let author = message.body.split('|')[1].trim();
                const quotedMsg = await message.getQuotedMessage(); 
                if (message.hasQuotedMsg && quotedMsg.hasMedia) {
                    try {
                        const media = await quotedMsg.downloadMedia();
                        client.sendMessage(message.from, media, {
                            sendMediaAsSticker: true,
                            stickerName: name,
                            stickerAuthor: author,
                            stickerMetadata: { resize: true }
                        });
                    } catch {
                        client.sendMessage(message.from, "erro");
                    }
                } else {
                    client.sendMessage(message.from, "Responda Sticker primeir");
                }
            } else {
                client.sendMessage(message.from, `Run the command :\n*${config.prefix}r <name> | <author>*`);
            }
        }

        // Comando !vsco para baixar imagem
        else if (message.body.startsWith('!vsco ')) {
            const url = message.body.replace('!vsco ', '').trim();
            if (!url) return client.sendMessage(message.from, 'Envie o comando com a URL do VSCO: !vsco <url>');
            await baixarImagemVSCO(url, message);
        }

        // Comando !yt para baixar áudio do YouTube
        else if (message.body.startsWith(`${config.prefix}yt `)) {
            const url = message.body.replace(`${config.prefix}yt `, '').trim();
            console.log(`[CMD] ${config.prefix}yt => ${url}`);
            if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
                return client.sendMessage(message.from, 'manda um link valido porra');
            }

            const outputPath = path.resolve(__dirname, 'ytmp3_output');
            if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath);

            client.sendMessage(message.from, 'Baixanu aguarde...');

            const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}/%(title)s.%(ext)s" "${url}"`;

            exec(command, async (error, stdout, stderr) => {
                if (error) {
                    console.error('[yt-dlp error]', error.message);
                    return client.sendMessage(message.from, 'link invalido ou codigo quebrado me avisaaaaaaa');
                }

                const files = fs.readdirSync(outputPath).filter(file => file.endsWith('.mp3'));
                if (files.length === 0) return client.sendMessage(message.from, 'deu nn');

                const mp3File = path.join(outputPath, files[0]);

                try {
                    const media = MessageMedia.fromFilePath(mp3File);
                    await client.sendMessage(message.from, media);
                    fs.unlinkSync(mp3File);
                } catch (err) {
                    console.log('[x] Erro ao enviar MP3:', err);
                    client.sendMessage(message.from, 'deu erro');
                }
            });
            return;
        }

        // Marcar mensagem como lida (original)
        else {
            client.getChatById(message.id.remote).then(async (chat) => {
                await chat.sendSeen();
            });
        }
    }
});

client.initialize();

