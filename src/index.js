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
 * Envia uma mensagem de texto via Evolution API.
 */
function sendWhatsAppMessage(phone, message) {
    return new Promise((resolve, reject) => {
        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            return reject(new Error('Variáveis de ambiente da Evolution API não configuradas.'));
        }

        let parsedUrl;
        try {
            const endpoint = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
            parsedUrl = new URL(endpoint);
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

        const request = lib.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                console.log(`[Claudio] Mensagem enviada para ${phone}. Status: ${response.statusCode}. Resposta: ${data}`);
                resolve({ statusCode: response.statusCode, data });
            });
        });

        request.on('error', reject);
        request.write(payload);
        request.end();
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
        await sendWhatsAppMessage(phone, message);
    } catch (err) {
        console.error('[Claudio] Erro ao enviar para Evolution API:', err.message);
    }
});

/**
 * Rota de Extração de Dados do Microvix e Geração de Relatórios
 * Consulta as vendas do período informado, monta um relatório (resumo + CSV)
 * e, opcionalmente, envia o resumo por WhatsApp para o número informado.
 */
app.post('/reports/microvix/vendas', async (req, res) => {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];

    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { dataInicial, dataFim, phone } = req.body;

    if (!dataInicial || !dataFim) {
        return res.status(400).json({
            error: 'Validação falhou',
            details: ['Campos obrigatórios: dataInicial, dataFim']
        });
    }

    try {
        const relatorio = await reports.gerarRelatorioVendas(dataInicial, dataFim);

        if (phone) {
            try {
                await sendWhatsAppMessage(phone, relatorio.resumo);
            } catch (err) {
                console.error('[Claudio] Erro ao enviar relatório por WhatsApp:', err.message);
            }
        }

        res.status(200).json(relatorio);
    } catch (err) {
        console.error('[Claudio] Erro ao gerar relatório do Microvix:', err.message);
        res.status(502).json({ error: 'Falha ao extrair dados do Microvix', details: err.message });
    }
});

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
