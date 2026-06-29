const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

// ── Utilitários ──────────────────────────────────────────────────────────────

function autenticar(req, res, next) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
}

function enviarWhatsApp(phone, text) {
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
        const request = lib.request(options, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => resolve({ statusCode: response.statusCode, data }));
        });

        request.on('error', reject);
        request.write(payload);
        request.end();
    });
}

// ── Rotas de diagnóstico ──────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).json({ status: 'API Claudio está ativa' });
});

app.get('/health', (req, res) => {
    res.status(200).send('API do Claudio: Operacional e Segura');
});

// ── Webhook (Make.com → WhatsApp) ─────────────────────────────────────────────

app.post('/webhook', autenticar, async (req, res) => {
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

    res.status(200).json({
        status: 'success',
        message: 'Mensagem recebida pelo Claudio! Enviando ao WhatsApp...',
        timestamp: new Date().toISOString()
    });

    enviarWhatsApp(phone, message)
        .then(({ statusCode }) => {
            console.log(`[Claudio] Mensagem enviada para ${phone}. Status: ${statusCode}`);
        })
        .catch(err => {
            console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
        });
});

// ── Rotas Microvox ────────────────────────────────────────────────────────────

app.get('/microvox/status', autenticar, async (req, res) => {
    try {
        const { verificarConexao } = require('./microvox');
        const conectado = await verificarConexao();
        if (conectado) {
            return res.json({ status: 'conectado' });
        }
        return res.status(503).json({ status: 'desconectado', erro: 'Não foi possível conectar ao Microvox' });
    } catch (err) {
        res.status(500).json({ status: 'erro', erro: err.message });
    }
});

app.get('/microvox/ramais', autenticar, async (req, res) => {
    try {
        const { getRamais } = require('./microvox');
        const ramais = await getRamais();
        res.json({ total: ramais.length, ramais });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/microvox/dados', autenticar, async (req, res) => {
    const { startDate, endDate, ramal } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Parâmetros obrigatórios: startDate e endDate (YYYY-MM-DD)' });
    }

    try {
        const { getChamadas } = require('./microvox');
        const chamadas = await getChamadas(startDate, endDate, ramal || null);
        res.json({ total: chamadas.length, startDate, endDate, ramal: ramal || null, chamadas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/microvox/relatorio', autenticar, async (req, res) => {
    const { startDate, endDate, phone } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Campos obrigatórios: startDate e endDate (YYYY-MM-DD)' });
    }

    try {
        const { gerarRelatorio } = require('./reports');
        const relatorio = await gerarRelatorio(startDate, endDate);

        if (phone) {
            enviarWhatsApp(phone, relatorio.mensagemWhatsApp)
                .then(({ statusCode }) => {
                    console.log(`[Claudio/Microvox] Relatório enviado para ${phone}. Status: ${statusCode}`);
                })
                .catch(err => {
                    console.error('[Claudio/Microvox] Erro ao enviar relatório:', err.message);
                });
        }

        res.json(relatorio);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/microvox/relatorio/ramal', autenticar, async (req, res) => {
    const { startDate, endDate, ramal, phone } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Campos obrigatórios: startDate e endDate (YYYY-MM-DD)' });
    }
    if (!ramal) {
        return res.status(400).json({ error: 'Campo obrigatório: ramal' });
    }

    try {
        const { gerarRelatorio } = require('./reports');
        const relatorio = await gerarRelatorio(startDate, endDate, ramal);

        if (phone) {
            enviarWhatsApp(phone, relatorio.mensagemWhatsApp)
                .then(({ statusCode }) => {
                    console.log(`[Claudio/Microvox] Relatório de ramal ${ramal} enviado para ${phone}. Status: ${statusCode}`);
                })
                .catch(err => {
                    console.error('[Claudio/Microvox] Erro ao enviar relatório de ramal:', err.message);
                });
        }

        res.json(relatorio);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/microvox/resumo', autenticar, async (req, res) => {
    const { phone } = req.body;

    try {
        const { gerarResumoDia } = require('./reports');
        const resumo = await gerarResumoDia();

        if (phone) {
            enviarWhatsApp(phone, resumo.mensagemWhatsApp)
                .then(({ statusCode }) => {
                    console.log(`[Claudio/Microvox] Resumo do dia enviado para ${phone}. Status: ${statusCode}`);
                })
                .catch(err => {
                    console.error('[Claudio/Microvox] Erro ao enviar resumo:', err.message);
                });
        }

        res.json(resumo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Servidor ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
