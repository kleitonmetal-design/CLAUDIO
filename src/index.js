const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const microvox = require('./microvox');
const reports = require('./reports');

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
 * Middleware de autenticação reutilizável.
 */
function authenticate(req, res, next) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
}

/**
 * Extrai e valida parâmetros de data da query string.
 */
function parseDateParams(query) {
    const { start_date, end_date, startDate, endDate, page, limit, status } = query;
    return {
        startDate: start_date || startDate || null,
        endDate: end_date || endDate || null,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status || undefined,
    };
}

/**
 * GET /microvox/health
 * Verifica conectividade com a API do Microvox.
 */
app.get('/microvox/health', authenticate, async (req, res) => {
    try {
        const result = await microvox.ping();
        res.json({ status: 'ok', microvox: result });
    } catch (err) {
        res.status(502).json({ status: 'erro', message: err.message });
    }
});

/**
 * GET /microvox/calls
 * Retorna chamadas brutas do Microvox com filtros opcionais.
 * Query: start_date, end_date, page, limit, status
 */
app.get('/microvox/calls', authenticate, async (req, res) => {
    try {
        const params = parseDateParams(req.query);
        const result = await microvox.getCalls(params);
        res.json(result);
    } catch (err) {
        console.error('[Microvox] Erro ao buscar chamadas:', err.message);
        res.status(502).json({ error: err.message });
    }
});

/**
 * GET /microvox/agents
 * Retorna dados de agentes/operadores.
 */
app.get('/microvox/agents', authenticate, async (req, res) => {
    try {
        const params = parseDateParams(req.query);
        const result = await microvox.getAgents(params);
        res.json(result);
    } catch (err) {
        console.error('[Microvox] Erro ao buscar agentes:', err.message);
        res.status(502).json({ error: err.message });
    }
});

/**
 * GET /microvox/queues
 * Retorna dados de filas/ramais.
 */
app.get('/microvox/queues', authenticate, async (req, res) => {
    try {
        const params = parseDateParams(req.query);
        const result = await microvox.getQueues(params);
        res.json(result);
    } catch (err) {
        console.error('[Microvox] Erro ao buscar filas:', err.message);
        res.status(502).json({ error: err.message });
    }
});

/**
 * GET /report/json
 * Gera relatório completo em JSON (sumário + agrupamentos por data/agente/fila).
 * Query: start_date, end_date
 */
app.get('/report/json', authenticate, async (req, res) => {
    try {
        const params = parseDateParams(req.query);
        const calls = await microvox.getAllCalls(params);
        const report = reports.generateReport(calls, params);
        res.json(report);
    } catch (err) {
        console.error('[Report] Erro ao gerar relatório JSON:', err.message);
        res.status(502).json({ error: err.message });
    }
});

/**
 * GET /report/csv
 * Gera CSV com chamadas individuais.
 * Query: start_date, end_date, type (calls|dates|agents)
 */
app.get('/report/csv', authenticate, async (req, res) => {
    try {
        const params = parseDateParams(req.query);
        const type = req.query.type || 'calls';
        const calls = await microvox.getAllCalls(params);

        let csv;
        let filename;

        if (type === 'dates') {
            csv = reports.generateDateSummaryCSV(calls);
            filename = 'relatorio_por_data.csv';
        } else if (type === 'agents') {
            csv = reports.generateAgentSummaryCSV(calls);
            filename = 'relatorio_por_agente.csv';
        } else {
            csv = reports.generateCallsCSV(calls);
            filename = 'chamadas.csv';
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv); // BOM para compatibilidade com Excel
    } catch (err) {
        console.error('[Report] Erro ao gerar CSV:', err.message);
        res.status(502).json({ error: err.message });
    }
});

/**
 * POST /report/whatsapp
 * Gera relatório e envia via WhatsApp.
 * Body: { phone, start_date, end_date }
 */
app.post('/report/whatsapp', authenticate, async (req, res) => {
    const { phone, start_date, end_date } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
        return res.status(400).json({ error: 'Campo obrigatório: phone' });
    }

    if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
        return res.status(503).json({ error: 'Evolution API não configurada.' });
    }

    try {
        const params = { startDate: start_date, endDate: end_date };
        const calls = await microvox.getAllCalls(params);
        const message = reports.generateWhatsAppSummary(calls, params);

        res.status(200).json({
            status: 'success',
            message: 'Relatório sendo enviado via WhatsApp...',
            timestamp: new Date().toISOString(),
        });

        // Envio assíncrono para a Evolution API
        let parsedUrl;
        try {
            parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
        } catch (err) {
            console.error('[Report/WhatsApp] URL inválida:', err.message);
            return;
        }

        const payload = JSON.stringify({ number: phone.trim(), text: message });

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
                console.log(`[Report/WhatsApp] Relatório enviado para ${phone}. Status: ${response.statusCode}`);
            });
        });

        request.on('error', (err) => {
            console.error('[Report/WhatsApp] Erro ao enviar:', err.message);
        });

        request.write(payload);
        request.end();

    } catch (err) {
        console.error('[Report] Erro ao gerar/enviar relatório:', err.message);
        res.status(502).json({ error: err.message });
    }
});

// Porta dinâmica para o ambiente do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
