const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('Escaneie o QR Code abaixo com o WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp conectado!');
});

client.on('auth_failure', () => {
  console.error('Falha na autenticação. Delete a pasta .wwebjs_auth e tente novamente.');
});

client.on('disconnected', (reason) => {
  console.warn('Cliente desconectado:', reason);
});

client.initialize();

module.exports = client;
