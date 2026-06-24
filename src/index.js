const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const microvox = require('./microvox');
const reports  = require('./reports');

const app = express();

// Configurações de segurança e tráfego
app.use(cors());
app.use(express.json());

// Variáveis de ambiente
const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

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

// Utilitário reutilizável para envio via Evolution API
function enviarWhatsApp(phone, message) {
    return new Promise((resolve, reject) => {
        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            return reject(new Error('Variáveis de ambiente da Evolution API não configuradas.'));
        }
        let parsedUrl;
        try {
            parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
        } catch (err) {
            return reject(new Error(`URL inválida da Evolution API: ${err.message}`));
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
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
                else reject(new Error(`Evolution API respondeu ${res.statusCode}: ${data}`));
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Middleware de autenticação reutilizável
function autenticar(req, res, next) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
}

// ─── Rotas Microvox ──────────────────────────────────────────────────────────

// Verifica conectividade com o Microvox
app.get('/microvox/status', autenticar, async (req, res) => {
    try {
        const resultado = await microvox.verificarConectividade();
        res.status(200).json(resultado);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Lista ramais cadastrados
app.get('/microvox/ramais', autenticar, async (req, res) => {
    try {
        const ramais = await microvox.listarRamais();
        res.status(200).json({ total: ramais.length, ramais });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Retorna chamadas brutas em JSON (filtragem por período e ramal via query)
app.get('/microvox/dados', autenticar, async (req, res) => {
    const { startDate, endDate, ramal } = req.query;
    try {
        const chamadas = await microvox.buscarChamadas({ startDate, endDate, ramal });
        res.status(200).json({ total: chamadas.length, chamadas });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Gera relatório do período; envia via WhatsApp se 'phone' informado
app.post('/microvox/relatorio', autenticar, async (req, res) => {
    const { startDate, endDate, phone } = req.body;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Campos obrigatórios: startDate, endDate' });
    }
    try {
        const chamadas = await microvox.buscarChamadas({ startDate, endDate });
        const relatorio = reports.gerarRelatorio(chamadas, { startDate, endDate });
        const mensagemWhatsApp = reports.formatarParaWhatsApp(relatorio);

        if (phone) {
            try {
                await enviarWhatsApp(phone, mensagemWhatsApp);
            } catch (err) {
                console.error('[Microvox] Erro ao enviar WhatsApp:', err.message);
            }
        }

        res.status(200).json({ relatorio, mensagemWhatsApp });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Relatório filtrado por ramal
app.post('/microvox/relatorio/ramal', autenticar, async (req, res) => {
    const { startDate, endDate, ramal, phone } = req.body;
    if (!startDate || !endDate || !ramal) {
        return res.status(400).json({ error: 'Campos obrigatórios: startDate, endDate, ramal' });
    }
    try {
        const chamadas = await microvox.buscarChamadas({ startDate, endDate, ramal });
        const relatorio = reports.gerarRelatorio(chamadas, { startDate, endDate, ramal });
        const mensagemWhatsApp = reports.formatarParaWhatsApp(relatorio);

        if (phone) {
            try {
                await enviarWhatsApp(phone, mensagemWhatsApp);
            } catch (err) {
                console.error('[Microvox] Erro ao enviar WhatsApp:', err.message);
            }
        }

        res.status(200).json({ relatorio, mensagemWhatsApp });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// Resumo consolidado do dia atual
app.post('/microvox/resumo', autenticar, async (req, res) => {
    const { phone } = req.body;
    const hoje = new Date().toISOString().split('T')[0];
    try {
        const chamadas = await microvox.buscarChamadas({ startDate: hoje, endDate: hoje });
        const relatorio = reports.gerarRelatorio(chamadas, { startDate: hoje, endDate: hoje });
        const mensagemWhatsApp = reports.formatarParaWhatsApp(relatorio);

        if (phone) {
            try {
                await enviarWhatsApp(phone, mensagemWhatsApp);
            } catch (err) {
                console.error('[Microvox] Erro ao enviar WhatsApp:', err.message);
            }
        }

        res.status(200).json({ relatorio, mensagemWhatsApp });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rota do Webhook
 */
app.post('/webhook', autenticar, async (req, res) => {
    // Suporte flexível para diferentes nomes de campos vindos do Make
    const phone = req.body.phone || req.body.number;
    const message = req.body.message || req.body.textMessage || (req.body.textMessage && req.body.textMessage.text);

    const errors = [];
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
        errors.push('Campo obrigatório: phone');
    }
    if (!message || typeof message !== 'string' || message.trim() === '') {
        errors.push('Campo obrigatório: message');
    }

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Validação falhou', details: errors });
    }

    // Resposta imediata para evitar Timeout no Make
    res.status(200).json({
        status: 'success',
        message: 'Mensagem recebida pelo Claudio! Enviando ao WhatsApp...',
        timestamp: new Date().toISOString()
    });

    enviarWhatsApp(phone, message).catch((err) => {
        console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
    });
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
