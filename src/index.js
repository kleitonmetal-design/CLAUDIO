const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const { checkStatus, fetchRamais, fetchChamadas } = require('./microvox');
const { gerarRelatorio, formatarParaWhatsApp, formatarResumoDiario } = require('./reports');

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

// ─── Autenticação ──────────────────────────────────────────────────────────────

function autenticar(req, res) {
  const apikey = req.headers['apikey'] || req.headers['x-apikey'];
  if (!apikey || apikey !== API_KEY) {
    res.status(401).json({ error: 'Não autorizado.' });
    return false;
  }
  return true;
}

// ─── Envio WhatsApp via Evolution API ──────────────────────────────────────────

function enviarWhatsApp(phone, message) {
  return new Promise((resolve, reject) => {
    if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
      return reject(new Error('Variáveis Evolution API não configuradas'));
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
    } catch (e) {
      return reject(new Error(`URL Evolution inválida: ${e.message}`));
    }

    const payload = JSON.stringify({ number: phone, text: message });
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Rotas base ────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => res.status(200).json({ status: 'API Claudio está ativa' }));
app.get('/health', (_req, res) => res.status(200).send('API do Claudio: Operacional e Segura'));

// ─── Webhook (envio manual WhatsApp) ──────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  if (!autenticar(req, res)) return;

  const phone = req.body.phone || req.body.number;
  const message = req.body.message || req.body.textMessage;

  const errors = [];
  if (!phone || typeof phone !== 'string' || !phone.trim()) errors.push('Campo obrigatório: phone');
  if (!message || typeof message !== 'string' || !message.trim()) errors.push('Campo obrigatório: message');
  if (errors.length) return res.status(400).json({ error: 'Validação falhou', details: errors });

  res.status(200).json({
    status: 'success',
    message: 'Mensagem recebida pelo Claudio! Enviando ao WhatsApp...',
    timestamp: new Date().toISOString(),
  });

  try {
    const resultado = await enviarWhatsApp(phone, message);
    console.log(`[Claudio] Mensagem enviada para ${phone}. Status: ${resultado.status}`);
  } catch (err) {
    console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
  }
});

// ─── Rotas Microvox ────────────────────────────────────────────────────────────

// GET /microvox/status — verifica conectividade com o Microvox
app.get('/microvox/status', async (req, res) => {
  if (!autenticar(req, res)) return;
  try {
    const resultado = await checkStatus();
    res.json(resultado.conectado
      ? { status: 'conectado' }
      : { status: 'desconectado', erro: resultado.erro });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /microvox/ramais — lista ramais cadastrados
app.get('/microvox/ramais', async (req, res) => {
  if (!autenticar(req, res)) return;
  try {
    const ramais = await fetchRamais();
    res.json({ total: ramais.length, ramais });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /microvox/dados?startDate=&endDate=&ramal= — chamadas brutas em JSON
app.get('/microvox/dados', async (req, res) => {
  if (!autenticar(req, res)) return;
  const { startDate, endDate, ramal } = req.query;
  try {
    const chamadas = await fetchChamadas(startDate, endDate, ramal);
    res.json({ total: chamadas.length, chamadas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /microvox/relatorio — relatório do período; envia via WhatsApp se phone informado
// Body: { startDate, endDate, phone? }
app.post('/microvox/relatorio', async (req, res) => {
  if (!autenticar(req, res)) return;
  const { startDate, endDate, phone } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
  }

  try {
    const chamadas = await fetchChamadas(startDate, endDate);
    const relatorio = gerarRelatorio(chamadas);
    const mensagemWhatsApp = formatarParaWhatsApp(relatorio, { startDate, endDate });

    const resposta = { relatorio, mensagemWhatsApp };

    if (phone) {
      res.json({ ...resposta, whatsapp: 'enviando...' });
      try {
        const r = await enviarWhatsApp(phone, mensagemWhatsApp);
        console.log(`[Claudio] Relatório enviado para ${phone}. Status: ${r.status}`);
      } catch (err) {
        console.error('[Claudio] Falha ao enviar relatório via WhatsApp:', err.message);
      }
    } else {
      res.json(resposta);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /microvox/relatorio/ramal — relatório filtrado por ramal
// Body: { startDate, endDate, ramal, phone? }
app.post('/microvox/relatorio/ramal', async (req, res) => {
  if (!autenticar(req, res)) return;
  const { startDate, endDate, ramal, phone } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
  }
  if (!ramal) {
    return res.status(400).json({ error: 'ramal é obrigatório' });
  }

  try {
    const chamadas = await fetchChamadas(startDate, endDate, ramal);
    const relatorio = gerarRelatorio(chamadas, { ramal });
    const mensagemWhatsApp = formatarParaWhatsApp(relatorio, { startDate, endDate });

    const resposta = { ramal, relatorio, mensagemWhatsApp };

    if (phone) {
      res.json({ ...resposta, whatsapp: 'enviando...' });
      try {
        const r = await enviarWhatsApp(phone, mensagemWhatsApp);
        console.log(`[Claudio] Relatório ramal ${ramal} enviado para ${phone}. Status: ${r.status}`);
      } catch (err) {
        console.error('[Claudio] Falha ao enviar relatório ramal via WhatsApp:', err.message);
      }
    } else {
      res.json(resposta);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /microvox/resumo — resumo consolidado do dia atual
// Body: { phone? }
app.post('/microvox/resumo', async (req, res) => {
  if (!autenticar(req, res)) return;
  const { phone } = req.body;

  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const chamadas = await fetchChamadas(hoje, hoje);
    const relatorio = gerarRelatorio(chamadas);
    const mensagemWhatsApp = formatarResumoDiario(relatorio);

    const resposta = { data: hoje, relatorio, mensagemWhatsApp };

    if (phone) {
      res.json({ ...resposta, whatsapp: 'enviando...' });
      try {
        const r = await enviarWhatsApp(phone, mensagemWhatsApp);
        console.log(`[Claudio] Resumo diário enviado para ${phone}. Status: ${r.status}`);
      } catch (err) {
        console.error('[Claudio] Falha ao enviar resumo via WhatsApp:', err.message);
      }
    } else {
      res.json(resposta);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
