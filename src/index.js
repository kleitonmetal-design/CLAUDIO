const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const microvix = require('./microvix');
const { gerarRelatorioPersonalizado } = require('./reports');

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
    enviarWhatsApp(phone, message).catch((err) => {
        console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
    });
});

/**
 * Endpoint de extração e envio de relatório via WhatsApp
 * Body: { tipo, phone, dataInicio?, dataFim?, loja? }
 * tipo: 'vendas' | 'estoque' | 'pedidos'
 */
app.post('/relatorio', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];

    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { tipo, phone, dataInicio, dataFim, loja } = req.body;
    const tiposValidos = ['vendas', 'estoque', 'pedidos'];

    if (!tipo || !tiposValidos.includes(tipo)) {
        return res.status(400).json({
            error: 'Campo obrigatório: tipo',
            validos: tiposValidos
        });
    }

    res.status(200).json({
        status: 'success',
        message: `Extração de ${tipo} iniciada. ${phone ? 'Relatório será enviado ao WhatsApp.' : 'Relatório retornado na resposta.'}`
    });

    try {
        const extratores = {
            vendas: () => microvix.extrairVendas({ dataInicio, dataFim, loja }),
            estoque: () => microvix.extrairEstoque({ loja }),
            pedidos: () => microvix.extrairPedidos({ dataInicio, dataFim })
        };

        const dados = await extratores[tipo]();
        const filtros = { dataInicio, dataFim, loja };
        const relatorio = gerarRelatorioPersonalizado(tipo, dados, filtros);

        console.log(`[Claudio] Relatório ${tipo} gerado:\n${relatorio}`);

        if (phone && EVOLUTION_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE) {
            await enviarWhatsApp(phone, relatorio);
        }
    } catch (err) {
        console.error(`[Claudio] Erro ao gerar relatório ${tipo}:`, err.message);
    }
});

/**
 * Endpoint para extrair dados brutos do Microvix (retorna JSON)
 * Query: tipo, dataInicio?, dataFim?, loja?, pagina?
 */
app.get('/extracao', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];

    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { tipo, dataInicio, dataFim, loja, pagina } = req.query;
    const tiposValidos = ['vendas', 'estoque', 'pedidos', 'produtos', 'clientes'];

    if (!tipo || !tiposValidos.includes(tipo)) {
        return res.status(400).json({
            error: 'Parâmetro obrigatório: tipo',
            validos: tiposValidos
        });
    }

    try {
        const extratores = {
            vendas: () => microvix.extrairVendas({ dataInicio, dataFim, loja }),
            estoque: () => microvix.extrairEstoque({ loja }),
            pedidos: () => microvix.extrairPedidos({ dataInicio, dataFim }),
            produtos: () => microvix.extrairProdutos({ pagina: pagina || 1 }),
            clientes: () => microvix.extrairClientes({ pagina: pagina || 1 })
        };

        const dados = await extratores[tipo]();
        return res.status(200).json({ status: 'success', tipo, dados });
    } catch (err) {
        console.error(`[Claudio] Erro na extração ${tipo}:`, err.message);
        return res.status(500).json({ error: err.message });
    }
});

function enviarWhatsApp(phone, message) {
    return new Promise((resolve, reject) => {
        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            return reject(new Error('Variáveis da Evolution API não configuradas.'));
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`);
        } catch (err) {
            return reject(new Error(`URL inválida da Evolution API: ${err.message}`));
        }

        const payload = JSON.stringify({ number: phone, text: message });
        const lib = parsedUrl.protocol === 'https:' ? https : http;

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

        const req = lib.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                console.log(`[Claudio] WhatsApp ${phone}. Status: ${response.statusCode}`);
                resolve(data);
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
