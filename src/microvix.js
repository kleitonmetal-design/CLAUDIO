const axios = require('axios');

const BASE_URL = process.env.MICROVIX_URL || 'https://webapi.microvix.com.br/1.0/api';
const CHAVE = process.env.MICROVIX_CHAVE;
const CNPJ = process.env.MICROVIX_CNPJ;

function authParams() {
    return { chave: CHAVE, cnpj: CNPJ };
}

async function get(endpoint, extraParams = {}) {
    if (!CHAVE || !CNPJ) {
        throw new Error('Credenciais Microvix não configuradas (MICROVIX_CHAVE e MICROVIX_CNPJ).');
    }
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
        params: { ...authParams(), ...extraParams },
        timeout: 30000
    });
    return response.data;
}

async function buscarPedidos(params = {}) {
    return get('/integracao/pedido', params);
}

async function buscarProdutos(params = {}) {
    return get('/integracao/produto', params);
}

async function buscarClientes(params = {}) {
    return get('/integracao/cliente', params);
}

async function buscarEstoque(params = {}) {
    return get('/integracao/estoque', params);
}

async function buscarFinanceiro(params = {}) {
    return get('/integracao/financeiro', params);
}

module.exports = {
    buscarPedidos,
    buscarProdutos,
    buscarClientes,
    buscarEstoque,
    buscarFinanceiro
};
