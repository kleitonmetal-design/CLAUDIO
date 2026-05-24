const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { buscarChamadas, buscarRamal, buscarResumo, getDefaultRange } = require('./micrivox');
const { gerarRelatorioTexto, gerarRelatorioDeResumo } = require('./reports');

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
 * Utilitário interno: envia mensagem via Evolution API
 */
async function enviarWhatsApp(phone, message) {
    if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
        throw new Error('Variáveis da Evolution API não configuradas.');
    }

    const endpoint = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
    const parsedUrl = new URL(endpoint);
    const payload = JSON.stringify({ number: phone, text: message });

    return new Promise((resolve, reject) => {
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
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Rota: Relatório de chamadas Micrivox → WhatsApp
 * Body: { phone, data_inicio?, data_fim? }
 */
app.post('/micrivox/relatorio', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { phone, data_inicio, data_fim } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
        return res.status(400).json({ error: 'Campo obrigatório: phone' });
    }

    try {
        const { inicio, fim } = data_inicio && data_fim
            ? { inicio: data_inicio, fim: data_fim }
            : getDefaultRange();

        const dados = await buscarChamadas(inicio, fim);
        const periodo = `${inicio} a ${fim}`;
        const texto = gerarRelatorioTexto(dados, { periodo });

        await enviarWhatsApp(phone.trim(), texto);

        console.log(`[Claudio/Micrivox] Relatório enviado para ${phone} | Período: ${periodo}`);
        res.status(200).json({ status: 'success', message: 'Relatório gerado e enviado via WhatsApp.', periodo });
    } catch (err) {
        console.error('[Claudio/Micrivox] Erro ao gerar relatório:', err.message);
        res.status(500).json({ error: 'Erro ao gerar relatório.', detail: err.message });
    }
});

/**
 * Rota: Relatório por ramal Micrivox → WhatsApp
 * Body: { phone, ramal, data_inicio?, data_fim? }
 */
app.post('/micrivox/relatorio/ramal', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { phone, ramal, data_inicio, data_fim } = req.body;

    const errors = [];
    if (!phone || typeof phone !== 'string' || phone.trim() === '') errors.push('Campo obrigatório: phone');
    if (!ramal || typeof ramal !== 'string' || ramal.trim() === '') errors.push('Campo obrigatório: ramal');

    if (errors.length > 0) {
        return res.status(400).json({ error: 'Validação falhou', details: errors });
    }

    try {
        const { inicio, fim } = data_inicio && data_fim
            ? { inicio: data_inicio, fim: data_fim }
            : getDefaultRange();

        const dados = await buscarRamal(ramal.trim(), inicio, fim);
        const periodo = `${inicio} a ${fim}`;
        const texto = gerarRelatorioTexto(dados, { periodo, ramal: ramal.trim() });

        await enviarWhatsApp(phone.trim(), texto);

        console.log(`[Claudio/Micrivox] Relatório do ramal ${ramal} enviado para ${phone}`);
        res.status(200).json({ status: 'success', message: `Relatório do ramal ${ramal} enviado via WhatsApp.`, periodo });
    } catch (err) {
        console.error('[Claudio/Micrivox] Erro ao gerar relatório de ramal:', err.message);
        res.status(500).json({ error: 'Erro ao gerar relatório de ramal.', detail: err.message });
    }
});

/**
 * Rota: Dados brutos de chamadas Micrivox (JSON)
 * Query: ?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
 */
app.get('/micrivox/dados', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { data_inicio, data_fim } = req.query;

    try {
        const dados = await buscarChamadas(data_inicio, data_fim);
        res.status(200).json({ status: 'success', data: dados });
    } catch (err) {
        console.error('[Claudio/Micrivox] Erro ao buscar dados:', err.message);
        res.status(500).json({ error: 'Erro ao buscar dados do Micrivox.', detail: err.message });
    }
});

/**
 * Rota: Resumo consolidado Micrivox → WhatsApp
 * Body: { phone, data_inicio?, data_fim? }
 */
app.post('/micrivox/resumo', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { phone, data_inicio, data_fim } = req.body;

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
        return res.status(400).json({ error: 'Campo obrigatório: phone' });
    }

    try {
        const { inicio, fim } = data_inicio && data_fim
            ? { inicio: data_inicio, fim: data_fim }
            : getDefaultRange();

        const resumo = await buscarResumo(inicio, fim);
        const periodo = `${inicio} a ${fim}`;
        const texto = gerarRelatorioDeResumo(resumo, { periodo });

        await enviarWhatsApp(phone.trim(), texto);

        console.log(`[Claudio/Micrivox] Resumo enviado para ${phone} | Período: ${periodo}`);
        res.status(200).json({ status: 'success', message: 'Resumo enviado via WhatsApp.', periodo });
    } catch (err) {
        console.error('[Claudio/Micrivox] Erro ao gerar resumo:', err.message);
        res.status(500).json({ error: 'Erro ao gerar resumo.', detail: err.message });
    }
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
