const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { gerarRelatorioVendas, gerarRelatorioProdutos, gerarRelatorioClientes, gerarRelatorioCompleto } = require('./reports');

const app = express();

// Configurações de segurança e tráfego
app.use(cors());
app.use(express.json());

// Variáveis de ambiente
const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

function autenticar(req, res, next) {
  const apikey = req.headers['apikey'] || req.headers['x-apikey'];
  if (!apikey || apikey !== API_KEY) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  next();
}

function enviarWhatsApp(phone, text) {
  return new Promise((resolve, reject) => {
    if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
      return reject(new Error('Variáveis da Evolution API não configuradas.'));
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
    } catch (e) {
      return reject(new Error('URL inválida da Evolution API.'));
    }
    const payload = JSON.stringify({ number: phone, text });
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

/**
 * Rota de Diagnóstico (Raiz)
 */
app.get('/', (req, res) => {
    res.status(200).json({ status: 'API Claudio está ativa' });
});

/**
 * Rota de Diagnóstico (Health Check)
 * Necessária para o Render saber que o sistema está 'Live'.
 */
app.get('/health', (req, res) => {
    res.status(200).send('API do Claudio: Operacional e Segura');
});

// ── Rotas Microvix ──────────────────────────────────────────────────────────

app.get('/microvix/relatorio/vendas', autenticar, async (req, res) => {
  const periodo = ['hoje', 'semana', 'mes'].includes(req.query.periodo) ? req.query.periodo : 'hoje';
  try {
    const relatorio = await gerarRelatorioVendas(periodo);
    res.json({ ok: true, relatorio });
  } catch (err) {
    console.error('[Microvix] Erro vendas:', err.message);
    res.status(502).json({ error: 'Falha ao consultar dados do Microvix.', detalhe: err.message });
  }
});

app.get('/microvix/relatorio/produtos', autenticar, async (req, res) => {
  try {
    const relatorio = await gerarRelatorioProdutos();
    res.json({ ok: true, relatorio });
  } catch (err) {
    console.error('[Microvix] Erro produtos:', err.message);
    res.status(502).json({ error: 'Falha ao consultar dados do Microvix.', detalhe: err.message });
  }
});

app.get('/microvix/relatorio/clientes', autenticar, async (req, res) => {
  try {
    const relatorio = await gerarRelatorioClientes();
    res.json({ ok: true, relatorio });
  } catch (err) {
    console.error('[Microvix] Erro clientes:', err.message);
    res.status(502).json({ error: 'Falha ao consultar dados do Microvix.', detalhe: err.message });
  }
});

app.get('/microvix/relatorio/completo', autenticar, async (req, res) => {
  const periodo = ['hoje', 'semana', 'mes'].includes(req.query.periodo) ? req.query.periodo : 'hoje';
  try {
    const relatorio = await gerarRelatorioCompleto(periodo);
    res.json({ ok: true, relatorio });
  } catch (err) {
    console.error('[Microvix] Erro completo:', err.message);
    res.status(502).json({ error: 'Falha ao consultar dados do Microvix.', detalhe: err.message });
  }
});

app.post('/microvix/relatorio/enviar', autenticar, async (req, res) => {
  const { phone, tipo = 'completo', periodo = 'hoje' } = req.body;
  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    return res.status(400).json({ error: 'Campo obrigatório: phone' });
  }
  try {
    let relatorio;
    if (tipo === 'vendas')   relatorio = await gerarRelatorioVendas(periodo);
    else if (tipo === 'produtos') relatorio = await gerarRelatorioProdutos();
    else if (tipo === 'clientes') relatorio = await gerarRelatorioClientes();
    else                          relatorio = await gerarRelatorioCompleto(periodo);

    await enviarWhatsApp(phone.trim(), relatorio.texto);
    console.log(`[Microvix] Relatório "${tipo}" enviado para ${phone}`);
    res.json({ ok: true, message: 'Relatório enviado via WhatsApp.' });
  } catch (err) {
    console.error('[Microvix] Erro ao enviar relatório:', err.message);
    res.status(500).json({ error: 'Falha ao gerar ou enviar relatório.', detalhe: err.message });
  }
});

// ── Webhook ──────────────────────────────────────────────────────────────────

/**
 * Rota do Webhook
 */
app.post('/webhook', async (req, res) => {
    // Verificação de Autenticação
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];

    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    // Suporte flexível para diferentes nomes de campos vindos do Make [cite: 46, 47, 48]
    const phone = req.body.phone || req.body.number;
    const message = req.body.message || req.body.textMessage || (req.body.textMessage && req.body.textMessage.text);

    // Validação de campos obrigatórios
    const errors = [];
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
        errors.push('Campo obrigatório: phone');
    }
    if (!message || typeof message !== 'string' || message.trim() === '') {
        errors.push('Campo obrigatório: message');
    }

    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validação falhou', 
            details: errors 
        });
    }

    // Resposta imediata para evitar Timeout no Make [cite: 19]
    res.status(200).json({
        status: 'success',
        message: 'Mensagem recebida pelo Claudio! Enviando ao WhatsApp...',
        timestamp: new Date().toISOString()
    });

    // Envio assíncrono para a Evolution API
    try {
        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            console.error('ERRO: Variáveis de ambiente da Evolution API não configuradas.');
            return;
        }

        // Montagem e validação da URL [cite: 22, 132]
        let parsedUrl;
        try {
            const endpoint = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
            parsedUrl = new URL(endpoint);
        } catch (err) {
            console.error('ERRO: URL inválida da Evolution API:', err.message);
            return;
        }

        const payload = JSON.stringify({
            number: phone,
            text: message
        });

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

        const request = lib.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                // Uso correto de crases para template literals 
                console.log(`[Claudio] Mensagem enviada para ${phone}. Status: ${response.statusCode}. Resposta: ${data}`);
            });
        });

        request.on('error', (err) => {
            console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
        });

        request.write(payload);
        request.end();

    } catch (err) {
        console.error('[Claudio] Erro inesperado:', err.message);
    }
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
