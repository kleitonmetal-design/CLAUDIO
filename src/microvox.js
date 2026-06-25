const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVOX_URL = process.env.MICROVOX_URL;
const MICROVOX_TOKEN = process.env.MICROVOX_TOKEN;
const MICROVOX_ACCOUNT = process.env.MICROVOX_ACCOUNT;

function fazerRequisicao(url) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return reject(new Error(`URL inválida: ${url}`));
        }

        const lib = parsed.protocol === 'https:' ? https : http;
        const headers = {
            'Authorization': `Bearer ${MICROVOX_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (MICROVOX_ACCOUNT) headers['X-Account'] = MICROVOX_ACCOUNT;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + (parsed.search || ''),
            method: 'GET',
            headers,
            timeout: 15000
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch { resolve(data); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout na requisição ao Microvox')); });
        req.end();
    });
}

function normalizarArray(dados) {
    if (Array.isArray(dados)) return dados;
    for (const chave of ['data', 'records', 'calls', 'chamadas', 'extensions', 'ramais']) {
        if (dados && Array.isArray(dados[chave])) return dados[chave];
    }
    return [];
}

function validarCredenciais() {
    if (!MICROVOX_URL || !MICROVOX_TOKEN) {
        throw new Error('MICROVOX_URL e MICROVOX_TOKEN são obrigatórios');
    }
}

async function tentarEndpoints(caminhos) {
    for (const caminho of caminhos) {
        try {
            return await fazerRequisicao(`${MICROVOX_URL}${caminho}`);
        } catch (_) {
            // tenta próximo
        }
    }
    throw new Error(`Nenhum endpoint respondeu: ${caminhos.join(', ')}`);
}

async function verificarConectividade() {
    validarCredenciais();
    const caminhos = ['/api/v1/status', '/api/status', '/status', '/health', '/api/v1/extensions'];
    const resposta = await tentarEndpoints(caminhos);
    return { conectado: true, resposta };
}

async function listarRamais() {
    validarCredenciais();
    const caminhos = ['/api/v1/extensions', '/api/extensions', '/extensions', '/api/v1/ramais', '/api/ramais'];
    const dados = await tentarEndpoints(caminhos);
    return normalizarArray(dados);
}

async function buscarChamadas(startDate, endDate, ramal) {
    validarCredenciais();
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (ramal) params.set('extension', ramal);
    const qs = `?${params}`;
    const caminhos = [
        `/api/v1/cdr${qs}`,
        `/api/v1/calls${qs}`,
        `/api/cdr${qs}`,
        `/api/calls${qs}`,
        `/cdr${qs}`
    ];
    const dados = await tentarEndpoints(caminhos);
    return normalizarArray(dados);
}

module.exports = { verificarConectividade, listarRamais, buscarChamadas };
