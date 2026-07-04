const axios = require('axios');

// WebService de integração do Linx Microvix (protocolo XML documentado publicamente)
const MICROVIX_ENDPOINT = process.env.MICROVIX_ENDPOINT || 'http://webapi.microvix.com.br/1.0/api/integracao';
const MICROVIX_USER = process.env.MICROVIX_USER;
const MICROVIX_PASSWORD = process.env.MICROVIX_PASSWORD;

function escapeXml(valor) {
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildRequestXml(comando, parametros = {}, formato = 'csv') {
    const parametrosXml = Object.entries(parametros)
        .map(([id, valor]) => `<Parameter id="${escapeXml(id)}">${escapeXml(valor)}</Parameter>`)
        .join('');

    return '<LinxMicrovix>' +
        `<Authentication user="${escapeXml(MICROVIX_USER)}" password="${escapeXml(MICROVIX_PASSWORD)}"/>` +
        `<ResponseFormat>${formato}</ResponseFormat>` +
        `<Command name="${escapeXml(comando)}">${parametrosXml}</Command>` +
        '</LinxMicrovix>';
}

/**
 * Executa um comando genérico contra o WebService do Microvix.
 * Comandos e parâmetros variam conforme o contrato liberado para a loja (ex: 'ClientesFornec').
 */
async function consultar(comando, parametros = {}, formato = 'csv') {
    if (!MICROVIX_USER || !MICROVIX_PASSWORD) {
        throw new Error('Credenciais do Microvix não configuradas (MICROVIX_USER / MICROVIX_PASSWORD).');
    }

    const body = buildRequestXml(comando, parametros, formato);

    const response = await axios.post(MICROVIX_ENDPOINT, body, {
        headers: { 'Content-Type': 'application/xml' }
    });

    return response.data;
}

async function obterClientesFornecedores({ cnpjEmp, dataInicial, dataFim }) {
    return consultar('ClientesFornec', {
        cnpjEmp,
        data_inicial: dataInicial,
        data_fim: dataFim
    });
}

module.exports = {
    consultar,
    obterClientesFornecedores,
    buildRequestXml
};
