const axios = require('axios');

// Cliente de integração com a API do Microvix (Linx Microvix)
// Referência pública: http://webapi.microvix.com.br/1.0/api/integracao (autenticação básica)
const MICROVIX_BASE_URL = process.env.MICROVIX_BASE_URL || 'http://webapi.microvix.com.br/1.0/api/integracao';
const MICROVIX_USER = process.env.MICROVIX_USER;
const MICROVIX_PASS = process.env.MICROVIX_PASS;
const MICROVIX_CNPJ = process.env.MICROVIX_CNPJ;

function assertConfigured() {
    if (!MICROVIX_USER || !MICROVIX_PASS || !MICROVIX_CNPJ) {
        throw new Error(
            'Credenciais do Microvix não configuradas. Defina MICROVIX_USER, MICROVIX_PASS e MICROVIX_CNPJ.'
        );
    }
}

/**
 * Executa uma chamada genérica a um endpoint da API de integração do Microvix.
 */
async function request(endpoint, params = {}) {
    assertConfigured();

    const response = await axios.get(`${MICROVIX_BASE_URL}/${endpoint}`, {
        auth: { username: MICROVIX_USER, password: MICROVIX_PASS },
        params: { cnpjEmp: MICROVIX_CNPJ, ...params },
        timeout: 15000
    });

    return response.data;
}

async function getVendas(dataInicial, dataFim) {
    return request('Vendas', { data_inicial: dataInicial, data_fim: dataFim });
}

async function getClientesFornecedores(dataInicial, dataFim) {
    return request('ClientesFornec', { data_inicial: dataInicial, data_fim: dataFim });
}

async function getProdutos(dataInicial, dataFim) {
    return request('Produtos', { data_inicial: dataInicial, data_fim: dataFim });
}

module.exports = {
    request,
    getVendas,
    getClientesFornecedores,
    getProdutos
};
