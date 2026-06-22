const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const microvix = require('./microvix');
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
 * Rotas de Extração de Dados e Relatórios - Microvix
 * Requerem autenticação via API_KEY (header 'apikey')
 */

const TIPOS_RELATORIO = {
    pedidos: { buscar: microvix.buscarPedidos, gerar: reports.gerarRelatorioPedidos },
    estoque: { buscar: microvix.buscarEstoque, gerar: reports.gerarRelatorioEstoque },
    clientes: { buscar: microvix.buscarClientes, gerar: reports.gerarRelatorioClientes },
    financeiro: { buscar: microvix.buscarFinanceiro, gerar: reports.gerarRelatorioFinanceiro }
};

// GET /microvix/:tipo - Extrai dados do Microvix e retorna relatório formatado
app.get('/microvix/:tipo', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const tipo = req.params.tipo.toLowerCase();
    const handler = TIPOS_RELATORIO[tipo];

    if (!handler) {
        return res.status(400).json({
            error: 'Tipo de relatório inválido.',
            tipos_disponiveis: Object.keys(TIPOS_RELATORIO)
        });
    }

    try {
        const dados = await handler.buscar(req.query);
        const formato = req.query.formato || 'json';

        if (formato === 'texto') {
            const texto = handler.gerar(dados);
            return res.status(200).type('text/plain').send(texto);
        }

        return res.status(200).json({
            tipo,
            total: Array.isArray(dados) ? dados.length : (dados?.data?.length || 0),
            gerado_em: new Date().toISOString(),
            dados
        });
    } catch (err) {
        console.error(`[Microvix] Erro ao buscar ${tipo}:`, err.message);
        return res.status(502).json({
            error: 'Falha ao comunicar com a API Microvix.',
            detalhe: err.message
        });
    }
});

// POST /microvix/relatorio/whatsapp - Gera relatório e envia via WhatsApp
app.post('/microvix/relatorio/whatsapp', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { tipo, phone } = req.body;
    if (!tipo || !phone) {
        return res.status(400).json({ error: 'Campos obrigatórios: tipo, phone' });
    }

    const handler = TIPOS_RELATORIO[tipo.toLowerCase()];
    if (!handler) {
        return res.status(400).json({
            error: 'Tipo de relatório inválido.',
            tipos_disponiveis: Object.keys(TIPOS_RELATORIO)
        });
    }

    res.status(200).json({
        status: 'success',
        message: `Relatório de ${tipo} sendo gerado e enviado para ${phone}...`,
        timestamp: new Date().toISOString()
    });

    try {
        const dados = await handler.buscar(req.query);
        const texto = handler.gerar(dados);

        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            console.error('[Microvix] Evolution API não configurada.');
            return;
        }

        const endpoint = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
        let parsedUrl;
        try { parsedUrl = new URL(endpoint); } catch (e) {
            console.error('[Microvix] URL inválida da Evolution API:', e.message);
            return;
        }

        const payload = JSON.stringify({ number: phone, text: texto });
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
                console.log(`[Microvix] Relatório de ${tipo} enviado para ${phone}. Status: ${response.statusCode}`);
            });
        });
        request.on('error', (err) => {
            console.error('[Microvix] Erro ao enviar relatório via WhatsApp:', err.message);
        });
        request.write(payload);
        request.end();

    } catch (err) {
        console.error(`[Microvix] Erro ao gerar relatório de ${tipo}:`, err.message);
    }
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
