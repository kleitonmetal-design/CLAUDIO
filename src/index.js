const express = require('express');
const cors = require('cors');
const app = express();

// Configurações de segurança e tráfego
app.use(cors());
app.use(express.json());

// Pega a chave de segurança que você configurou no painel do Render
const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';

/**
 * Rota de Diagnóstico (Health Check)
 * Necessária para o Render saber que o sistema está 'Live'.
 */
app.get('/health', (req, res) => {
  res.status(200).send('API do Claudio: Operacional e Segura');
});

/**
 * Rota do Webhook
 * Onde o Make.com vai entregar os dados do Claude.
 */
app.post('/webhook', (req, res) => {
  const { apikey } = req.headers;

  // Verificação de Integridade e Autenticação
  if (!apikey || apikey !== API_KEY) {
    console.error('ALERTA: Tentativa de acesso sem chave válida.');
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  const dadosRecebidos = req.body;
  console.log('Dados processados com sucesso:', dadosRecebidos);

  // Resposta imediata para evitar o erro de Timeout (40s) no Make
  res.status(200).json({ 
    status: 'success', 
    message: 'Recebido pelo Claudio!',
    timestamp: new Date().toISOString()
  });
});

// Porta dinâmica para o ambiente do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
