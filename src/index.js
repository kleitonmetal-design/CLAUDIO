const express = require('express');
const client = require('./whatsapp');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// POST /send-message
// Body: { "phone": "5511999999999", "message": "Olá!" }
app.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Os campos "phone" e "message" são obrigatórios.' });
  }

  // Formato esperado pelo whatsapp-web.js: número@c.us
  const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;

  try {
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(404).json({ error: 'Número não encontrado no WhatsApp.' });
    }

    await client.sendMessage(chatId, message);
    return res.json({ success: true, message: 'Mensagem enviada com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao enviar mensagem.', details: err.message });
  }
});

// GET /status
app.get('/status', (req, res) => {
  const state = client.info ? 'connected' : 'disconnected';
  res.json({ status: state });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
