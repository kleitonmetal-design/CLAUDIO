const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const microvox = require('./microvox');
const {
    gerarCSV,
    gerarHTMLRelatorio,
    calcularEstatisticasCDR,
    calcularEstatisticasAgentes,
    calcularEstatisticasFilas,
    salvarRelatorio,
    listarRelatorios,
    lerRelatorio,
    formatarSegundos
} = require('./reports');

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
 * Rotas de Relatórios Microvox
 */

// Lista os relatórios gerados
app.get('/relatorios', authenticateApiKey, (req, res) => {
    const lista = listarRelatorios();
    res.status(200).json({ total: lista.length, relatorios: lista });
});

// Download de um relatório específico
app.get('/relatorios/:arquivo', authenticateApiKey, (req, res) => {
    const nome = path.basename(req.params.arquivo);
    const resultado = lerRelatorio(nome);

    if (!resultado) {
        return res.status(404).json({ error: 'Relatório não encontrado.' });
    }

    const tipo = nome.endsWith('.html') ? 'text/html' : 'text/csv; charset=utf-8';
    res.setHeader('Content-Type', tipo);
    if (!nome.endsWith('.html')) {
        res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    }
    res.send(resultado.conteudo);
});

// Extrai dados do Microvox e gera relatórios
app.post('/relatorios/extrair', authenticateApiKey, async (req, res) => {
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const toISO = d => d.toISOString().split('T')[0];
    const startDate = req.body.data_inicio || toISO(ontem);
    const endDate = req.body.data_fim || toISO(hoje);
    const timestamp = hoje.toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (!process.env.MICROVOX_URL) {
        return res.status(503).json({ error: 'MICROVOX_URL não configurada.' });
    }

    res.status(202).json({
        status: 'processing',
        message: 'Extração iniciada. Os relatórios estarão disponíveis em /relatorios.',
        periodo: { inicio: startDate, fim: endDate }
    });

    // Execução assíncrona da extração
    try {
        const [cdr, agentes, filas] = await Promise.allSettled([
            microvox.getCDR(startDate, endDate),
            microvox.getRelatorioAgentes(startDate, endDate),
            microvox.getRelatorioFilas(startDate, endDate)
        ]);

        const dadosCDR = cdr.status === 'fulfilled' ? cdr.value : [];
        const dadosAgentes = agentes.status === 'fulfilled' ? agentes.value : [];
        const dadosFilas = filas.status === 'fulfilled' ? filas.value : [];

        if (cdr.status === 'rejected') console.error('[Claudio] Erro CDR Microvox:', cdr.reason?.message);
        if (agentes.status === 'rejected') console.error('[Claudio] Erro Agentes Microvox:', agentes.reason?.message);
        if (filas.status === 'rejected') console.error('[Claudio] Erro Filas Microvox:', filas.reason?.message);

        const estatsCDR = calcularEstatisticasCDR(dadosCDR);
        const estatsAgentes = calcularEstatisticasAgentes(dadosAgentes);
        const estatsFilas = calcularEstatisticasFilas(dadosFilas);

        // CSV - CDR
        const csvCDR = gerarCSV(
            dadosCDR,
            ['id', 'data_hora', 'origem', 'destino', 'duracao_segundos', 'tipo', 'status', 'agente', 'ramal'],
            ['ID', 'Data/Hora', 'Origem', 'Destino', 'Duração (s)', 'Tipo', 'Status', 'Agente', 'Ramal']
        );
        salvarRelatorio(`cdr_${startDate}_${endDate}_${timestamp}.csv`, csvCDR);

        // CSV - Agentes
        const csvAgentes = gerarCSV(
            dadosAgentes,
            ['agente', 'ramal', 'total_chamadas', 'chamadas_atendidas', 'chamadas_perdidas', 'tempo_em_chamada_segundos', 'tma_segundos'],
            ['Agente', 'Ramal', 'Total', 'Atendidas', 'Perdidas', 'Tempo em Chamada (s)', 'TMA (s)']
        );
        salvarRelatorio(`agentes_${startDate}_${endDate}_${timestamp}.csv`, csvAgentes);

        // CSV - Filas
        const csvFilas = gerarCSV(
            dadosFilas,
            ['fila', 'total_chamadas', 'atendidas', 'abandonadas', 'tempo_medio_espera_segundos', 'nivel_servico_percentual'],
            ['Fila', 'Total', 'Atendidas', 'Abandonadas', 'TMA Espera (s)', 'Nível de Serviço (%)']
        );
        salvarRelatorio(`filas_${startDate}_${endDate}_${timestamp}.csv`, csvFilas);

        // HTML - Relatório consolidado
        const periodo = `${startDate} a ${endDate}`;
        const html = gerarHTMLRelatorio('Relatório Microvox', periodo, [
            {
                nome: 'Resumo de Chamadas (CDR)',
                stats: estatsCDR,
                statLabels: {
                    total: 'Total de Chamadas',
                    atendidas: 'Atendidas',
                    naoAtendidas: 'Não Atendidas',
                    duracaoTotal: 'Duração Total',
                    tmaMedio: 'TMA Médio'
                },
                formatarStats: { duracaoTotal: formatarSegundos, tmaMedio: formatarSegundos },
                tabela: dadosCDR.slice(0, 500),
                campos: ['data_hora', 'origem', 'destino', 'duracao_segundos', 'tipo', 'status', 'agente'],
                labels: ['Data/Hora', 'Origem', 'Destino', 'Duração', 'Tipo', 'Status', 'Agente'],
                formatarColunas: { duracao_segundos: formatarSegundos }
            },
            {
                nome: 'Desempenho por Agente',
                stats: estatsAgentes,
                statLabels: {
                    totalAgentes: 'Agentes',
                    totalChamadas: 'Total de Chamadas',
                    totalAtendidas: 'Atendidas',
                    tmaGeral: 'TMA Geral'
                },
                formatarStats: { tmaGeral: formatarSegundos },
                tabela: dadosAgentes,
                campos: ['agente', 'ramal', 'total_chamadas', 'chamadas_atendidas', 'chamadas_perdidas', 'tempo_em_chamada_segundos', 'tma_segundos'],
                labels: ['Agente', 'Ramal', 'Total', 'Atendidas', 'Perdidas', 'Tempo Chamada', 'TMA'],
                formatarColunas: { tempo_em_chamada_segundos: formatarSegundos, tma_segundos: formatarSegundos }
            },
            {
                nome: 'Performance por Fila',
                stats: estatsFilas,
                statLabels: {
                    totalFilas: 'Filas',
                    totalChamadas: 'Total',
                    totalAtendidas: 'Atendidas',
                    totalAbandonadas: 'Abandonadas',
                    nivelServicoMedio: 'Nível de Serviço Médio'
                },
                formatarStats: { nivelServicoMedio: v => `${v}%` },
                tabela: dadosFilas,
                campos: ['fila', 'total_chamadas', 'atendidas', 'abandonadas', 'tempo_medio_espera_segundos', 'nivel_servico_percentual'],
                labels: ['Fila', 'Total', 'Atendidas', 'Abandonadas', 'TMA Espera', 'Nível Serviço'],
                formatarColunas: {
                    tempo_medio_espera_segundos: formatarSegundos,
                    nivel_servico_percentual: v => `${v}%`
                }
            }
        ]);
        salvarRelatorio(`relatorio_${startDate}_${endDate}_${timestamp}.html`, html);

        console.log(`[Claudio] Relatórios Microvox gerados: ${startDate} a ${endDate}`);

    } catch (err) {
        console.error('[Claudio] Erro na extração Microvox:', err.message);
    }
});

function authenticateApiKey(req, res, next) {
    const apikey = req.headers['apikey'] || req.headers['x-apikey'];
    if (!apikey || apikey !== API_KEY) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
}

// Porta dinâmica para o ambiente do Render [cite: 33, 167]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Claudio rodando na porta ${PORT}`);
});
