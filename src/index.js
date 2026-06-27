const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
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

function sendWhatsApp(phone, message) {
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
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
            console.log(`[Claudio] Mensagem enviada para ${phone}. Status: ${response.statusCode}. Resposta: ${data}`);
        });
    });
    request.on('error', err => console.error('[Claudio] Erro ao enviar para Evolution API:', err.message));
    request.write(payload);
    request.end();
}

/**
 * Rota do Webhook
 */
app.post('/webhook', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        return res.status(401).json({ error: 'Não autorizado.' });
    }

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
        timestamp: new Date().toISOString(),
    });

    try {
        sendWhatsApp(phone, message);
    } catch (err) {
        console.error('[Claudio] Erro inesperado:', err.message);
    }
});

/**
 * Rotas do Microvix — Extração de dados e geração de relatórios
 */
function authMiddleware(req, res, next) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
}

// GET /microvix/relatorio/vendas?periodo=hoje|semana|mes
app.get('/microvix/relatorio/vendas', authMiddleware, async (req, res) => {
    const periodo = ['hoje', 'semana', 'mes'].includes(req.query.periodo) ? req.query.periodo : 'hoje';
    try {
        const relatorio = await reports.gerarRelatorioVendas(periodo);
        res.status(200).json({ status: 'success', periodo, relatorio });
    } catch (err) {
        console.error('[Microvix] Erro ao gerar relatório de vendas:', err.message);
        res.status(500).json({ error: 'Falha ao extrair dados do Microvix.', detalhe: err.message });
    }
});

// GET /microvix/relatorio/produtos
app.get('/microvix/relatorio/produtos', authMiddleware, async (req, res) => {
    try {
        const relatorio = await reports.gerarRelatorioProdutos();
        res.status(200).json({ status: 'success', relatorio });
    } catch (err) {
        console.error('[Microvix] Erro ao gerar relatório de produtos:', err.message);
        res.status(500).json({ error: 'Falha ao extrair dados do Microvix.', detalhe: err.message });
    }
});

// GET /microvix/relatorio/clientes
app.get('/microvix/relatorio/clientes', authMiddleware, async (req, res) => {
    try {
        const relatorio = await reports.gerarRelatorioClientes();
        res.status(200).json({ status: 'success', relatorio });
    } catch (err) {
        console.error('[Microvix] Erro ao gerar relatório de clientes:', err.message);
        res.status(500).json({ error: 'Falha ao extrair dados do Microvix.', detalhe: err.message });
    }
});

// GET /microvix/relatorio/completo?periodo=hoje|semana|mes
app.get('/microvix/relatorio/completo', authMiddleware, async (req, res) => {
    const periodo = ['hoje', 'semana', 'mes'].includes(req.query.periodo) ? req.query.periodo : 'hoje';
    try {
        const relatorio = await reports.gerarRelatorioCompleto(periodo);
        res.status(200).json({ status: 'success', periodo, relatorio });
    } catch (err) {
        console.error('[Microvix] Erro ao gerar relatório completo:', err.message);
        res.status(500).json({ error: 'Falha ao extrair dados do Microvix.', detalhe: err.message });
    }
});

// POST /microvix/relatorio/enviar — gera relatório e envia via WhatsApp
// Body: { phone: "5511999999999", tipo: "completo|vendas|produtos|clientes", periodo: "hoje|semana|mes" }
app.post('/microvix/relatorio/enviar', authMiddleware, async (req, res) => {
    const phone = req.body.phone || req.body.number;
    const tipo = ['completo', 'vendas', 'produtos', 'clientes'].includes(req.body.tipo) ? req.body.tipo : 'completo';
    const periodo = ['hoje', 'semana', 'mes'].includes(req.body.periodo) ? req.body.periodo : 'hoje';

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
        return res.status(400).json({ error: 'Campo obrigatório: phone' });
    }

    res.status(200).json({
        status: 'success',
        message: `Gerando relatório ${tipo} e enviando ao WhatsApp...`,
        timestamp: new Date().toISOString(),
    });

    try {
        let relatorio;
        if (tipo === 'vendas') relatorio = await reports.gerarRelatorioVendas(periodo);
        else if (tipo === 'produtos') relatorio = await reports.gerarRelatorioProdutos();
        else if (tipo === 'clientes') relatorio = await reports.gerarRelatorioClientes();
        else relatorio = await reports.gerarRelatorioCompleto(periodo);

        sendWhatsApp(phone, relatorio);
        console.log(`[Microvix] Relatório ${tipo} enviado para ${phone}`);
    } catch (err) {
        console.error('[Microvix] Erro ao gerar/enviar relatório:', err.message);
    }
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
