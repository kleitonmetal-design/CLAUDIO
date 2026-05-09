const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const { buscarDadosDiarios } = require('./microvox');
const { gerarRelatorioDiario, gerarRelatorioJSON } = require('./reports');

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'chave_reserva_seguranca';
const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

const REPORT_RECIPIENTS = process.env.REPORT_RECIPIENTS
    ? process.env.REPORT_RECIPIENTS.split(',').map(n => n.trim()).filter(Boolean)
    : [];

const REPORT_TIME = process.env.REPORT_TIME || '08:00';

// ─── Utilitários ─────────────────────────────────────────────────────────────

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
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                console.log(`[Claudio] WhatsApp → ${phone} | Status: ${res.statusCode}`);
                resolve({ statusCode: res.statusCode, body: data });
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function autenticar(req, res) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        console.error('ALERTA: Tentativa de acesso sem chave válida.');
        res.status(401).json({ error: 'Não autorizado.' });
        return false;
    }
    return true;
}

// ─── Agendamento de Relatório Diário ─────────────────────────────────────────

function agendarRelatorioDiario() {
    if (REPORT_RECIPIENTS.length === 0) {
        console.log('[Claudio] Nenhum destinatário configurado em REPORT_RECIPIENTS. Relatório automático desativado.');
        return;
    }

    const [hora, minuto] = REPORT_TIME.split(':').map(Number);
    if (isNaN(hora) || isNaN(minuto)) {
        console.error(`[Claudio] REPORT_TIME inválido: "${REPORT_TIME}". Use o formato HH:MM.`);
        return;
    }

    function calcularProximoDisparo() {
        const agora = new Date();
        const disparo = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        disparo.setHours(hora, minuto, 0, 0);
        if (disparo <= agora) disparo.setDate(disparo.getDate() + 1);
        return disparo - agora;
    }

    function disparar() {
        const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        console.log(`[Claudio] Disparando relatório automático — ${hoje}`);

        buscarDadosDiarios()
            .then(dados => {
                const texto = gerarRelatorioDiario(dados);
                return Promise.allSettled(
                    REPORT_RECIPIENTS.map(numero => enviarWhatsApp(numero, texto))
                );
            })
            .then(resultados => {
                resultados.forEach((r, i) => {
                    if (r.status === 'rejected') {
                        console.error(`[Claudio] Falha ao enviar relatório para ${REPORT_RECIPIENTS[i]}:`, r.reason?.message);
                    }
                });
            })
            .catch(err => console.error('[Claudio] Erro ao gerar relatório automático:', err.message))
            .finally(() => setTimeout(disparar, calcularProximoDisparo()));
    }

    setTimeout(disparar, calcularProximoDisparo());
    console.log(`[Claudio] Relatório diário agendado para ${REPORT_TIME} (Brasília) → ${REPORT_RECIPIENTS.join(', ')}`);
}

// ─── Rotas ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).json({ status: 'API Claudio está ativa' });
});

app.get('/health', (req, res) => {
    res.status(200).send('API do Claudio: Operacional e Segura');
});

/**
 * POST /webhook
 * Recebe mensagem do Make e encaminha ao WhatsApp via Evolution API.
 */
app.post('/webhook', async (req, res) => {
    if (!autenticar(req, res)) return;

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
        await enviarWhatsApp(phone.trim(), message.trim());
    } catch (err) {
        console.error('[Claudio] Erro ao enviar mensagem WhatsApp:', err.message);
    }
});

/**
 * POST /relatorio
 * Gera relatório Microvox e envia via WhatsApp para os destinatários informados.
 * Body: { destinatarios?: string[], data?: "YYYY-MM-DD" }
 */
app.post('/relatorio', async (req, res) => {
    if (!autenticar(req, res)) return;

    const { destinatarios, data } = req.body;

    const alvos = Array.isArray(destinatarios) && destinatarios.length > 0
        ? destinatarios
        : REPORT_RECIPIENTS;

    if (alvos.length === 0) {
        return res.status(400).json({
            error: 'Nenhum destinatário informado. Passe "destinatarios" no body ou configure REPORT_RECIPIENTS.',
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Relatório sendo gerado e enviado...',
        destinatarios: alvos,
        timestamp: new Date().toISOString(),
    });

    try {
        const dados = await buscarDadosDiarios(data);
        const texto = gerarRelatorioDiario(dados, data);

        const resultados = await Promise.allSettled(
            alvos.map(numero => enviarWhatsApp(numero, texto))
        );

        resultados.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`[Claudio] Falha ao enviar relatório para ${alvos[i]}:`, r.reason?.message);
            }
        });

        if (dados.erros && dados.erros.length > 0) {
            console.warn('[Claudio] Avisos ao buscar dados Microvox:', dados.erros.join(' | '));
        }
    } catch (err) {
        console.error('[Claudio] Erro ao processar /relatorio:', err.message);
    }
});

/**
 * GET /relatorio/preview
 * Retorna o relatório em JSON e texto sem enviar ao WhatsApp.
 * Query: ?data=YYYY-MM-DD
 */
app.get('/relatorio/preview', async (req, res) => {
    if (!autenticar(req, res)) return;

    const { data } = req.query;

    try {
        const dados = await buscarDadosDiarios(data);
        const texto = gerarRelatorioDiario(dados, data);
        const json = gerarRelatorioJSON(dados, data);

        res.status(200).json({
            texto,
            dados: json,
            erros: dados.erros,
        });
    } catch (err) {
        console.error('[Claudio] Erro ao gerar preview do relatório:', err.message);
        res.status(500).json({ error: 'Erro ao buscar dados do Microvox.', detalhe: err.message });
    }
});

// ─── Inicialização ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
    agendarRelatorioDiario();
});
