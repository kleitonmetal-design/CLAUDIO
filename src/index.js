const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const microvox = require('./microvox');
const reports = require('./reports');

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

function autenticar(req, res, next) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
}

function enviarWhatsApp(phone, message) {
    if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
        console.error('ERRO: Variáveis de ambiente da Evolution API não configuradas.');
        return;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
    } catch (err) {
        console.error('ERRO: URL inválida da Evolution API:', err.message);
        return;
    }

    const payload = JSON.stringify({ number: phone, text: message });
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY,
            'Content-Length': Buffer.byteLength(payload)
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => console.log(`[Claudio] WhatsApp → ${phone} | status ${res.statusCode}`));
    });
    req.on('error', err => console.error('[Claudio] Erro Evolution API:', err.message));
    req.write(payload);
    req.end();
}

// ── Rotas de diagnóstico ────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).json({ status: 'API Claudio está ativa' });
});

app.get('/health', (req, res) => {
    res.status(200).send('API do Claudio: Operacional e Segura');
});

// ── Webhook ─────────────────────────────────────────────────────────────────

app.post('/webhook', autenticar, async (req, res) => {
    const phone   = req.body.phone || req.body.number;
    const message = req.body.message || req.body.textMessage ||
                    (req.body.textMessage && req.body.textMessage.text);

    const errors = [];
    if (!phone   || typeof phone   !== 'string' || !phone.trim())   errors.push('Campo obrigatório: phone');
    if (!message || typeof message !== 'string' || !message.trim()) errors.push('Campo obrigatório: message');
    if (errors.length) return res.status(400).json({ error: 'Validação falhou', details: errors });

    res.status(200).json({
        status: 'success',
        message: 'Mensagem recebida pelo Claudio! Enviando ao WhatsApp...',
        timestamp: new Date().toISOString()
    });

    try { enviarWhatsApp(phone, message); } catch (err) {
        console.error('[Claudio] Erro inesperado:', err.message);
    }
});

// ── Rotas Microvox ───────────────────────────────────────────────────────────

app.get('/microvox/status', autenticar, async (req, res) => {
    try {
        const resultado = await microvox.verificarConectividade();
        res.json({ status: 'conectado', ...resultado });
    } catch (err) {
        res.status(503).json({ status: 'erro', message: err.message });
    }
});

app.get('/microvox/ramais', autenticar, async (req, res) => {
    try {
        const ramais = await microvox.listarRamais();
        res.json({ total: ramais.length, ramais });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

app.get('/microvox/dados', autenticar, async (req, res) => {
    const { startDate, endDate, ramal } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
    }
    try {
        const chamadas = await microvox.buscarChamadas(startDate, endDate, ramal);
        res.json({ total: chamadas.length, chamadas });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

app.post('/microvox/relatorio', autenticar, async (req, res) => {
    const { startDate, endDate, phone } = req.body;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
    }
    try {
        const chamadas = await microvox.buscarChamadas(startDate, endDate);
        const relatorio = reports.gerarRelatorio(chamadas);
        const periodo = `${startDate} a ${endDate}`;
        const mensagemWhatsApp = reports.formatarParaWhatsApp(relatorio, periodo);

        if (phone) {
            enviarWhatsApp(phone, mensagemWhatsApp);
        }

        res.json({ relatorio, mensagemWhatsApp, enviado: !!phone });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

app.post('/microvox/relatorio/ramal', autenticar, async (req, res) => {
    const { startDate, endDate, ramal, phone } = req.body;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate e endDate são obrigatórios' });
    }
    if (!ramal) {
        return res.status(400).json({ error: 'ramal é obrigatório' });
    }
    try {
        const chamadas = await microvox.buscarChamadas(startDate, endDate, ramal);
        const relatorio = reports.gerarRelatorio(chamadas, ramal);
        const periodo = `${startDate} a ${endDate}`;
        const mensagemWhatsApp = reports.formatarParaWhatsApp(relatorio, periodo);

        if (phone) {
            enviarWhatsApp(phone, mensagemWhatsApp);
        }

        res.json({ relatorio, mensagemWhatsApp, enviado: !!phone });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

app.post('/microvox/resumo', autenticar, async (req, res) => {
    const hoje = new Date().toISOString().split('T')[0];
    const { phone } = req.body || {};
    try {
        const chamadas = await microvox.buscarChamadas(hoje, hoje);
        const relatorio = reports.gerarRelatorio(chamadas);
        const mensagemWhatsApp = reports.formatarParaWhatsApp(relatorio, `Hoje (${hoje})`);

        if (phone) {
            enviarWhatsApp(phone, mensagemWhatsApp);
        }

        res.json({ relatorio, mensagemWhatsApp, enviado: !!phone });
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

// ── Servidor ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
