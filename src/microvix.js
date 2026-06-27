const axios = require('axios');

const MICROVIX_URL = process.env.MICROVIX_URL || 'https://webapi.microvix.com.br/1.0/api';
const MICROVIX_PORTAL = process.env.MICROVIX_PORTAL;
const MICROVIX_USUARIO = process.env.MICROVIX_USUARIO;
const MICROVIX_SENHA = process.env.MICROVIX_SENHA;
const MICROVIX_EMPRESA = process.env.MICROVIX_EMPRESA || '1';

function buildAuthParams() {
    return {
        portal: MICROVIX_PORTAL,
        usuario: MICROVIX_USUARIO,
        senha: MICROVIX_SENHA,
        empresa: MICROVIX_EMPRESA,
    };
}

function validateCredentials() {
    if (!MICROVIX_PORTAL || !MICROVIX_USUARIO || !MICROVIX_SENHA) {
        throw new Error('Credenciais Microvix não configuradas. Defina MICROVIX_PORTAL, MICROVIX_USUARIO e MICROVIX_SENHA.');
    }
}

async function get(endpoint, params = {}) {
    validateCredentials();
    const url = `${MICROVIX_URL}/${endpoint}`;
    const response = await axios.get(url, {
        params: { ...buildAuthParams(), ...params },
        timeout: 30000,
    });
    return response.data;
}

async function post(endpoint, body = {}) {
    validateCredentials();
    const url = `${MICROVIX_URL}/${endpoint}`;
    const response = await axios.post(url, { ...buildAuthParams(), ...body }, {
        timeout: 30000,
    });
    return response.data;
}

async function getVendas(dataInicio, dataFim) {
    const params = {};
    if (dataInicio) params.data_inicio = dataInicio;
    if (dataFim) params.data_fim = dataFim;
    return get('transacoes', params);
}

async function getProdutos(params = {}) {
    return get('produtos', params);
}

async function getClientes(params = {}) {
    return get('clientes', params);
}

async function getLojas() {
    return get('empresas');
}

async function getEstoque(params = {}) {
    return get('estoque', params);
}

module.exports = { getVendas, getProdutos, getClientes, getLojas, getEstoque };
