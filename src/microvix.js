const axios = require('axios');
const xml2js = require('xml2js');

const MICROVIX_URL = process.env.MICROVIX_URL || 'http://webapi.microvix.com.br/1.0/api/integracao';
const MICROVIX_CNPJ = process.env.MICROVIX_CNPJ;
const MICROVIX_CHAVE = process.env.MICROVIX_CHAVE;
const MICROVIX_DOMINIO = process.env.MICROVIX_DOMINIO;

function buildXmlBody(metodo, parametros = []) {
    const params = parametros
        .map(({ chave, valor }) => `<parametro><chave>${chave}</chave><valor>${valor}</valor></parametro>`)
        .join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<content>
  <cnpjEmpresa>${MICROVIX_CNPJ}</cnpjEmpresa>
  <chave>${MICROVIX_CHAVE}</chave>
  <dominio>${MICROVIX_DOMINIO}</dominio>
  <metodo>${metodo}</metodo>
  <parametros>${params}</parametros>
</content>`;
}

async function parseXmlResponse(xmlString) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    const result = await parser.parseStringPromise(xmlString);

    // A resposta do Microvix vem encapsulada em <string> ou diretamente como <root>
    const root = result?.string?.root || result?.root || result;

    // Normaliza os registros: retorna array mesmo com 1 item
    const keys = Object.keys(root);
    if (keys.length === 0) return [];

    const dataKey = keys[0];
    const records = root[dataKey];
    return Array.isArray(records) ? records : [records];
}

async function fetchData(metodo, parametros = []) {
    if (!MICROVIX_CNPJ || !MICROVIX_CHAVE || !MICROVIX_DOMINIO) {
        throw new Error('Variáveis de ambiente do Microvix não configuradas (MICROVIX_CNPJ, MICROVIX_CHAVE, MICROVIX_DOMINIO).');
    }

    const xmlBody = buildXmlBody(metodo, parametros);

    const response = await axios.post(MICROVIX_URL, xmlBody, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        timeout: 30000,
    });

    return parseXmlResponse(response.data);
}

// Timestamp padrão 0 = todos os registros desde o início
async function getLojas() {
    return fetchData('LinxLojas', [{ chave: 'timestamp', valor: '0' }]);
}

async function getProdutos(timestamp = 0) {
    return fetchData('LinxProdutos', [{ chave: 'timestamp', valor: String(timestamp) }]);
}

async function getClientes(timestamp = 0) {
    return fetchData('LinxClientes', [{ chave: 'timestamp', valor: String(timestamp) }]);
}

async function getVendedores(timestamp = 0) {
    return fetchData('LinxVendedores', [{ chave: 'timestamp', valor: String(timestamp) }]);
}

async function getVendas(dtInicio, dtFim, codLoja = 0) {
    return fetchData('LinxVendas', [
        { chave: 'dtInicio', valor: dtInicio },
        { chave: 'dtFim', valor: dtFim },
        { chave: 'cod_loja', valor: String(codLoja) },
        { chave: 'timestamp', valor: '0' },
    ]);
}

async function getVendasDetalhes(dtInicio, dtFim, codLoja = 0) {
    return fetchData('LinxVendasDetalhes', [
        { chave: 'dtInicio', valor: dtInicio },
        { chave: 'dtFim', valor: dtFim },
        { chave: 'cod_loja', valor: String(codLoja) },
        { chave: 'timestamp', valor: '0' },
    ]);
}

module.exports = {
    getLojas,
    getProdutos,
    getClientes,
    getVendedores,
    getVendas,
    getVendasDetalhes,
};
