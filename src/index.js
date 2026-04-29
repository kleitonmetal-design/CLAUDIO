require('dotenv').config();
const express = require('express');
const client = require('./whatsapp');

const app = express();
app.use(express.json());

// Habilitar CORS para webhooks
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'default_key_change_this';

// Middleware de autenticação por API Key
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'API Key inválida ou não fornecida.' 
    });
  }
  
  next();
};

// Health Check - Para verificar se a API está ativa
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'API está rodando',
    timestamp: new Date().toISOString()
  });
});

// GET /status - Verificar status da conexão WhatsApp
app.get('/status', (req, res) => {
  const state = client.info ? 'connected' : 'disconnected';
  res.json({ 
    status: state,
    info: client.info || null,
    timestamp: new Date().toISOString()
  });
});

// POST /send-message - Enviar mensagem via WhatsApp
// Headers: Authorization: Bearer {API_KEY}
// Body: { "phone": "5511999999999", "message": "Olá!" }
app.post('/send-message', authenticateApiKey, async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ 
      error: 'Campos obrigatórios ausentes',
      required: ['phone', 'message'],
      example: { phone: '5511999999999', message: 'Olá!' }
    });
  }

  // Validar formato do telefone
  if (!/^\d+$/.test(phone.replace('@c.us', ''))) {
    return res.status(400).json({ 
      error: 'Formato de telefone inválido',
      example: '5511999999999'
    });
  }

  // Formato esperado pelo whatsapp-web.js: número@c.us
  const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;

  try {
    // Verificar se o usuário está registrado no WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(404).json({ 
        error: 'Número não encontrado',
        message: 'Este número não está registrado no WhatsApp.',
        phone
      });
    }

    // Enviar mensagem
    await client.sendMessage(chatId, message);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      phone,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    return res.status(500).json({ 
      error: 'Erro ao enviar mensagem',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /webhook - Endpoint webhook para Make.com
// Aceita o mesmo formato que /send-message
app.post('/webhook', authenticateApiKey, async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ 
      error: 'Campos obrigatórios ausentes',
      required: ['phone', 'message']
    });
  }

  const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;

  try {
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(404).json({ 
        error: 'Número não encontrado no WhatsApp',
        phone
      });
    }

    await client.sendMessage(chatId, message);
    
    return res.status(200).json({ 
      success: true,
      message: 'Mensagem processada pelo webhook',
      phone,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Erro no webhook:', err);
    return res.status(500).json({ 
      error: 'Erro ao processar webhook',
      details: err.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Send message: POST http://localhost:${PORT}/send-message`);
  console.log(`🔗 Webhook: POST http://localhost:${PORT}/webhook`);
  console.log(`ℹ️  Status: GET http://localhost:${PORT}/status`);
});