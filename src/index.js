const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { fetchChamadas, fetchRamais, verificarConexao } = require('./microvox');
const { gerarRelatorioChamadas, formatarRelatorioWhatsApp } = require('./reports');

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

function autenticar(req, res) {
  const apikey = req.headers['apikey'] || req.headers['x-apikey'];
  if (!apikey || apikey !== API_KEY) {
    console.error('ALERTA: Tentativa de acesso sem chave válida.');
    res.status(401).json({ error: 'Não autorizado.' });
    return false;
  }
  return true;
}

function enviarWhatsApp(phone, message) {
  return new Promise((resolve, reject) => {
    if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
      return reject(new Error('Variáveis de ambiente da Evolution API não configuradas.'));
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
    } catch (err) {
      return reject(new Error('URL inválida da Evolution API: ' + err.message));
    }

    const payload = JSON.stringify({ number: phone, text: message });

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const req = lib.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`Evolution API retornou ${response.statusCode}: ${data}`));
        }
        resolve(data);
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// --- Rotas de diagnóstico ---

app.get('/', (req, res) => {
  res.status(200).json({ status: 'API Claudio está ativa' });
});

app.get('/health', (req, res) => {
  res.status(200).send('API do Claudio: Operacional e Segura');
});

// --- Webhook (Make.com → WhatsApp) ---

app.post('/webhook', async (req, res) => {
  if (!autenticar(req, res)) return;

  const phone = req.body.phone || req.body.number;
  const message = req.body.message || req.body.textMessage || (req.body.textMessage && req.body.textMessage.text);

  const errors = [];
  if (!phone || typeof phone !== 'string' || phone.trim() === '') errors.push('Campo obrigatório: phone');
  if (!message || typeof message !== 'string' || message.trim() === '') errors.push('Campo obrigatório: message');

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validação falhou', details: errors });
  }

  res.status(200).json({
    status: 'success',
    message: 'Mensagem recebida pelo Claudio! Enviando ao WhatsApp...',
    timestamp: new Date().toISOString()
  });

  try {
    await enviarWhatsApp(phone.trim(), message.trim());
    console.log(`[Claudio] Mensagem enviada para ${phone}`);
  } catch (err) {
    console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
  }
});

// --- Rotas Microvox ---

app.get('/microvox/status', async (req, res) => {
  if (!autenticar(req, res)) return;
  try {
    const ok = await verificarConexao();
    res.status(ok ? 200 : 503).json({ status: ok ? 'conectado' : 'indisponível' });
  } catch (err) {
    res.status(503).json({ status: 'indisponível', erro: err.message });
  }
});

app.get('/microvox/ramais', async (req, res) => {
  if (!autenticar(req, res)) return;
  try {
    const ramais = await fetchRamais();
    res.status(200).json({ total: ramais.length, ramais });
  } catch (err) {
    console.error('[Microvox] Erro ao buscar ramais:', err.message);
    res.status(502).json({ error: 'Erro ao buscar ramais do Microvox', detalhe: err.message });
  }
});

app.get('/microvox/dados', async (req, res) => {
  if (!autenticar(req, res)) return;

  const { startDate, endDate, ramal } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: startDate e endDate (YYYY-MM-DD)' });
  }

  try {
    const chamadas = await fetchChamadas(startDate, endDate, ramal || null);
    res.status(200).json({ total: chamadas.length, chamadas });
  } catch (err) {
    console.error('[Microvox] Erro ao buscar dados:', err.message);
    res.status(502).json({ error: 'Erro ao buscar dados do Microvox', detalhe: err.message });
  }
});

app.post('/microvox/relatorio', async (req, res) => {
  if (!autenticar(req, res)) return;

  const { startDate, endDate, ramal, phone } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: startDate e endDate (YYYY-MM-DD)' });
  }

  try {
    const chamadas = await fetchChamadas(startDate, endDate, ramal || null);
    const relatorio = gerarRelatorioChamadas(chamadas);
    const texto = formatarRelatorioWhatsApp(relatorio, { inicio: startDate, fim: endDate });

    res.status(200).json({
      status: 'success',
      relatorio,
      mensagemWhatsApp: texto
    });

    if (phone) {
      enviarWhatsApp(phone, texto).catch(err =>
        console.error('[Microvox] Erro ao enviar WhatsApp:', err.message)
      );
    }
  } catch (err) {
    console.error('[Microvox] Erro ao gerar relatório:', err.message);
    res.status(502).json({ error: 'Erro ao gerar relatório', detalhe: err.message });
  }
});

app.post('/microvox/relatorio/ramal', async (req, res) => {
  if (!autenticar(req, res)) return;

  const { startDate, endDate, ramal, phone } = req.body;
  if (!startDate || !endDate || !ramal) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: startDate, endDate e ramal' });
  }

  try {
    const chamadas = await fetchChamadas(startDate, endDate, ramal);
    const relatorio = gerarRelatorioChamadas(chamadas);
    const texto = `📱 Ramal: *${ramal}*\n\n` + formatarRelatorioWhatsApp(relatorio, { inicio: startDate, fim: endDate });

    res.status(200).json({
      status: 'success',
      ramal,
      relatorio,
      mensagemWhatsApp: texto
    });

    if (phone) {
      enviarWhatsApp(phone, texto).catch(err =>
        console.error('[Microvox] Erro ao enviar WhatsApp:', err.message)
      );
    }
  } catch (err) {
    console.error('[Microvox] Erro ao gerar relatório por ramal:', err.message);
    res.status(502).json({ error: 'Erro ao gerar relatório por ramal', detalhe: err.message });
  }
});

app.post('/microvox/resumo', async (req, res) => {
  if (!autenticar(req, res)) return;

  const { phone } = req.body;
  const hoje = new Date().toISOString().split('T')[0];

  try {
    const chamadas = await fetchChamadas(hoje, hoje);
    const relatorio = gerarRelatorioChamadas(chamadas);
    const texto = `📊 *RESUMO DO DIA — ${hoje}*\n\n` +
      formatarRelatorioWhatsApp(relatorio, { inicio: hoje, fim: hoje });

    res.status(200).json({
      status: 'success',
      data: hoje,
      resumo: relatorio.resumo,
      mensagemWhatsApp: texto
    });

    if (phone) {
      enviarWhatsApp(phone, texto).catch(err =>
        console.error('[Microvox] Erro ao enviar resumo WhatsApp:', err.message)
      );
    }
  } catch (err) {
    console.error('[Microvox] Erro ao gerar resumo:', err.message);
    res.status(502).json({ error: 'Erro ao gerar resumo do dia', detalhe: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
