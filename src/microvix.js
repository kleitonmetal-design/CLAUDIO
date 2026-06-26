const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVIX_BASE_URL = process.env.MICROVIX_BASE_URL || 'https://webapi.microvix.com.br/1.0/api';
const MICROVIX_CNPJ = process.env.MICROVIX_CNPJ;
const MICROVIX_EMPRESA_KEY = process.env.MICROVIX_EMPRESA_KEY;
const MICROVIX_USUARIO_KEY = process.env.MICROVIX_USUARIO_KEY;

function request(path, params = {}) {
    return new Promise((resolve, reject) => {
        const query = new URLSearchParams({
            cnpj: MICROVIX_CNPJ,
            empresakey: MICROVIX_EMPRESA_KEY,
            usuariokey: MICROVIX_USUARIO_KEY,
            ...params
        }).toString();

        let parsedUrl;
        try {
            parsedUrl = new URL(`${MICROVIX_BASE_URL}/${path}?${query}`);
        } catch (err) {
            return reject(new Error(`URL inválida do Microvix: ${err.message}`));
        }

        const lib = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(data);
                    }
                } else {
                    reject(new Error(`Microvix API erro ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}

function validarCredenciais() {
    if (!MICROVIX_CNPJ || !MICROVIX_EMPRESA_KEY || !MICROVIX_USUARIO_KEY) {
        throw new Error('Credenciais do Microvix não configuradas (MICROVIX_CNPJ, MICROVIX_EMPRESA_KEY, MICROVIX_USUARIO_KEY).');
    }
}

async function extrairVendas({ dataInicio, dataFim, loja } = {}) {
    validarCredenciais();
    const params = {};
    if (dataInicio) params.dtini = dataInicio;
    if (dataFim) params.dtfim = dataFim;
    if (loja) params.loja = loja;
    return request('vendas', params);
}

async function extrairProdutos({ pagina = 1, itensPorPagina = 100, categoria } = {}) {
    validarCredenciais();
    const params = { pagina, itenspagina: itensPorPagina };
    if (categoria) params.categoria = categoria;
    return request('produtos', params);
}

async function extrairEstoque({ loja } = {}) {
    validarCredenciais();
    const params = {};
    if (loja) params.loja = loja;
    return request('estoque', params);
}

async function extrairClientes({ pagina = 1, itensPorPagina = 100 } = {}) {
    validarCredenciais();
    return request('clientes', { pagina, itenspagina: itensPorPagina });
}

async function extrairPedidos({ dataInicio, dataFim, status } = {}) {
    validarCredenciais();
    const params = {};
    if (dataInicio) params.dtini = dataInicio;
    if (dataFim) params.dtfim = dataFim;
    if (status) params.status = status;
    return request('pedidos', params);
}

module.exports = {
    extrairVendas,
    extrairProdutos,
    extrairEstoque,
    extrairClientes,
    extrairPedidos
};
