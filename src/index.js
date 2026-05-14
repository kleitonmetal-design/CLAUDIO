const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { fetchCDR } = require('./micrivox');
const { generateCDRReport, formatReportForWhatsApp } = require('./reports');

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

/**
 * Valida e normaliza uma data no formato YYYY-MM-DD.
 * Retorna null se inválida.
 */
function parseDate(value) {
    if (!value || typeof value !== 'string') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return value;
}

/**
 * Rota: Gerar relatório de chamadas do Micrivox (retorna JSON)
 *
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }
 * Header: apikey
 */
app.post('/report/generate', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const startDate = parseDate(req.body.startDate);
    const endDate = parseDate(req.body.endDate);

    if (!startDate || !endDate) {
        return res.status(400).json({
            error: 'Campos obrigatórios: startDate e endDate (formato YYYY-MM-DD).',
        });
    }

    if (startDate > endDate) {
        return res.status(400).json({ error: 'startDate não pode ser posterior a endDate.' });
    }

    try {
        const records = await fetchCDR(startDate, endDate);
        const report = generateCDRReport(records, { startDate, endDate });
        return res.status(200).json({ status: 'success', report });
    } catch (err) {
        console.error('[Claudio] Erro ao gerar relatório Micrivox:', err.message);
        return res.status(502).json({ error: 'Erro ao buscar dados do Micrivox.', detail: err.message });
    }
});

/**
 * Rota: Gerar relatório e enviar via WhatsApp
 *
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", phone: "5511999999999" }
 * Header: apikey
 */
app.post('/report/send', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const startDate = parseDate(req.body.startDate);
    const endDate = parseDate(req.body.endDate);
    const phone = req.body.phone || req.body.number;

    const errors = [];
    if (!startDate || !endDate) errors.push('Campos obrigatórios: startDate e endDate (formato YYYY-MM-DD).');
    if (startDate && endDate && startDate > endDate) errors.push('startDate não pode ser posterior a endDate.');
    if (!phone || typeof phone !== 'string' || phone.trim() === '') errors.push('Campo obrigatório: phone.');

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Validação falhou', details: errors });
    }

    // Resposta imediata para evitar timeout
    res.status(200).json({
        status: 'success',
        message: 'Relatório sendo gerado e enviado ao WhatsApp...',
        timestamp: new Date().toISOString(),
    });

    // Processamento assíncrono
    try {
        const records = await fetchCDR(startDate, endDate);
        const report = generateCDRReport(records, { startDate, endDate });
        const message = formatReportForWhatsApp(report);

        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            console.error('[Claudio] Variáveis de ambiente da Evolution API não configuradas.');
            return;
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
        } catch (err) {
            console.error('[Claudio] URL inválida da Evolution API:', err.message);
            return;
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
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const request = lib.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                console.log(`[Claudio] Relatório enviado para ${phone}. Status: ${response.statusCode}`);
            });
        });

        request.on('error', (err) => {
            console.error('[Claudio] Erro ao enviar relatório para Evolution API:', err.message);
        });

        request.write(payload);
        request.end();

    } catch (err) {
        console.error('[Claudio] Erro ao processar relatório Micrivox:', err.message);
    }
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
