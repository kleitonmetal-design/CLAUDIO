const axios = require('axios');

const MICROVOX_URL = process.env.MICROVOX_URL;
const MICROVOX_TOKEN = process.env.MICROVOX_TOKEN;
const MICROVOX_USERNAME = process.env.MICROVOX_USERNAME;
const MICROVOX_PASSWORD = process.env.MICROVOX_PASSWORD;

function buildClient() {
    if (!MICROVOX_URL) {
        throw new Error('MICROVOX_URL não configurada nas variáveis de ambiente.');
    }

    const headers = { 'Content-Type': 'application/json' };

    if (MICROVOX_TOKEN) {
        headers['Authorization'] = `Bearer ${MICROVOX_TOKEN}`;
    } else if (MICROVOX_USERNAME && MICROVOX_PASSWORD) {
        const encoded = Buffer.from(`${MICROVOX_USERNAME}:${MICROVOX_PASSWORD}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
    } else {
        throw new Error('Credenciais do Microvox não configuradas (MICROVOX_TOKEN ou MICROVOX_USERNAME/MICROVOX_PASSWORD).');
    }

    return axios.create({ baseURL: MICROVOX_URL, headers, timeout: 30000 });
}

async function getCDR(startDate, endDate) {
    const client = buildClient();
    const response = await client.get('/api/v1/cdr', {
        params: { data_inicio: startDate, data_fim: endDate }
    });
    return normalizeCDR(response.data);
}

async function getRelatorioAgentes(startDate, endDate) {
    const client = buildClient();
    const response = await client.get('/api/v1/agentes/relatorio', {
        params: { data_inicio: startDate, data_fim: endDate }
    });
    return normalizeAgentes(response.data);
}

async function getRelatorioFilas(startDate, endDate) {
    const client = buildClient();
    const response = await client.get('/api/v1/filas/relatorio', {
        params: { data_inicio: startDate, data_fim: endDate }
    });
    return normalizeFilas(response.data);
}

// Normaliza o retorno do CDR para um formato padronizado
function normalizeCDR(data) {
    const registros = Array.isArray(data) ? data : (data.data || data.registros || data.records || []);
    return registros.map(r => ({
        id: r.id || r.uniqueid || '',
        data_hora: r.data_hora || r.calldate || r.datetime || '',
        origem: r.origem || r.src || r.source || '',
        destino: r.destino || r.dst || r.destination || '',
        duracao_segundos: parseInt(r.duracao || r.duration || r.billsec || 0, 10),
        tipo: r.tipo || r.direction || r.calltype || '',
        status: r.status || r.disposition || r.hangup_cause || '',
        agente: r.agente || r.agent || r.accountcode || '',
        ramal: r.ramal || r.extension || r.dstchannel || '',
        gravacao: r.gravacao || r.recording || r.recordingfile || ''
    }));
}

function normalizeAgentes(data) {
    const registros = Array.isArray(data) ? data : (data.data || data.agentes || data.agents || []);
    return registros.map(r => ({
        agente: r.agente || r.agent || r.name || '',
        ramal: r.ramal || r.extension || '',
        total_chamadas: parseInt(r.total_chamadas || r.total_calls || 0, 10),
        chamadas_atendidas: parseInt(r.chamadas_atendidas || r.answered_calls || 0, 10),
        chamadas_perdidas: parseInt(r.chamadas_perdidas || r.missed_calls || 0, 10),
        tempo_em_chamada_segundos: parseInt(r.tempo_em_chamada || r.talk_time || 0, 10),
        tempo_disponivel_segundos: parseInt(r.tempo_disponivel || r.available_time || 0, 10),
        tempo_pausa_segundos: parseInt(r.tempo_pausa || r.pause_time || 0, 10),
        tma_segundos: parseInt(r.tma || r.aht || r.average_handle_time || 0, 10)
    }));
}

function normalizeFilas(data) {
    const registros = Array.isArray(data) ? data : (data.data || data.filas || data.queues || []);
    return registros.map(r => ({
        fila: r.fila || r.queue || r.name || '',
        total_chamadas: parseInt(r.total_chamadas || r.total_calls || 0, 10),
        atendidas: parseInt(r.atendidas || r.answered || 0, 10),
        abandonadas: parseInt(r.abandonadas || r.abandoned || 0, 10),
        tempo_medio_espera_segundos: parseInt(r.tempo_medio_espera || r.avg_wait_time || 0, 10),
        nivel_servico_percentual: parseFloat(r.nivel_servico || r.service_level || 0)
    }));
}

module.exports = { getCDR, getRelatorioAgentes, getRelatorioFilas };
