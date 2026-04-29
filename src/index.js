const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'mudar_nas_configuracoes_do_render';

// Rota para o Render saber que está tudo OK (Health Check)
app.get('/health', (req, res) => res.status(200).send('Online'));

// Rota onde o Make vai bater
app.post('/webhook', (req, res) => {
  const { apikey } = req.headers;

  if (!apikey || apikey !== API_KEY) {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }

  console.log('Dados recebidos:', req.body);

  // Resposta imediata para evitar Timeout no Make
  res.status(200).json({ status: 'success', message: 'Recebido!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
