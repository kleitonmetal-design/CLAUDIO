const axios = require('axios');

const MICRIVOX_URL = process.env.MICRIVOX_URL;
const MICRIVOX_TOKEN = process.env.MICRIVOX_TOKEN;
const MICRIVOX_ACCOUNT = process.env.MICRIVOX_ACCOUNT;

function getClient() {
    if (!MICRIVOX_URL || !MICRIVOX_TOKEN) {
        throw new Error('Variáveis MICRIVOX_URL e MICRIVOX_TOKEN não configuradas.');
    }

    return axios.create({
        baseURL: MICRIVOX_URL,
        headers: {
            'Authorization': `Bearer ${MICRIVOX_TOKEN}`,
            'Content-Type': 'application/json',
        },
        timeout: 15000,
    });
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function getDefaultRange() {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 1);
    return { inicio: formatDate(inicio), fim: formatDate(hoje) };
}

async function buscarChamadas(dataInicio, dataFim) {
    const client = getClient();
    const { inicio, fim } = dataInicio && dataFim
        ? { inicio: dataInicio, fim: dataFim }
        : getDefaultRange();

    const params = { data_inicio: inicio, data_fim: fim };
    if (MICRIVOX_ACCOUNT) params.conta = MICRIVOX_ACCOUNT;

    const response = await client.get('/chamadas', { params });
    return response.data;
}

async function buscarRamal(ramal, dataInicio, dataFim) {
    const client = getClient();
    const { inicio, fim } = dataInicio && dataFim
        ? { inicio: dataInicio, fim: dataFim }
        : getDefaultRange();

    const response = await client.get(`/ramais/${ramal}/chamadas`, {
        params: { data_inicio: inicio, data_fim: fim },
    });
    return response.data;
}

async function buscarResumo(dataInicio, dataFim) {
    const client = getClient();
    const { inicio, fim } = dataInicio && dataFim
        ? { inicio: dataInicio, fim: dataFim }
        : getDefaultRange();

    const params = { data_inicio: inicio, data_fim: fim };
    if (MICRIVOX_ACCOUNT) params.conta = MICRIVOX_ACCOUNT;

    const response = await client.get('/relatorios/resumo', { params });
    return response.data;
}

module.exports = { buscarChamadas, buscarRamal, buscarResumo, getDefaultRange };
