const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVOX_URL   = process.env.MICROVOX_URL;
const MICROVOX_TOKEN = process.env.MICROVOX_TOKEN;
const MICROVOX_ACCOUNT = process.env.MICROVOX_ACCOUNT;

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        if (!MICROVOX_URL || !MICROVOX_TOKEN) {
            return reject(new Error('MICROVOX_URL e MICROVOX_TOKEN são obrigatórios.'));
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(`${MICROVOX_URL.replace(/\/$/, '')}${path}`);
        } catch (err) {
            return reject(new Error(`URL inválida do Microvox: ${err.message}`));
        }

        const payload = body ? JSON.stringify(body) : null;
        const headers = {
            'Authorization': `Bearer ${MICROVOX_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (MICROVOX_ACCOUNT) headers['X-Account-ID'] = MICROVOX_ACCOUNT;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            headers
        };

        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(data ? JSON.parse(data) : {}); }
                    catch { resolve(data); }
                } else {
                    reject(new Error(`Microvox respondeu ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function buildQuery(params) {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return qs ? `?${qs}` : '';
}

// Normaliza diferentes formatos de resposta da API para um array
function normalizar(resposta) {
    if (Array.isArray(resposta)) return resposta;
    if (resposta && Array.isArray(resposta.data))  return resposta.data;
    if (resposta && Array.isArray(resposta.calls)) return resposta.calls;
    if (resposta && Array.isArray(resposta.result)) return resposta.result;
    if (resposta && Array.isArray(resposta.records)) return resposta.records;
    return [];
}

async function verificarConectividade() {
    // Tenta endpoints comuns de status/ping
    const tentativas = ['/api/v1/status', '/api/status', '/status', '/ping', '/api/v1/ping'];
    for (const path of tentativas) {
        try {
            await request('GET', path, null);
            return { status: 'conectado', endpoint: path };
        } catch (_) { /* tenta próximo */ }
    }
    // Último recurso: tenta listar ramais
    try {
        await request('GET', '/api/v1/extensions', null);
        return { status: 'conectado', endpoint: '/api/v1/extensions' };
    } catch (err) {
        throw new Error(`Não foi possível conectar ao Microvox: ${err.message}`);
    }
}

async function listarRamais() {
    const tentativas = ['/api/v1/extensions', '/api/extensions', '/api/v1/ramais'];
    for (const path of tentativas) {
        try {
            const res = await request('GET', path, null);
            return normalizar(res);
        } catch (_) { /* tenta próximo */ }
    }
    throw new Error('Não foi possível obter a lista de ramais do Microvox.');
}

async function buscarChamadas({ startDate, endDate, ramal } = {}) {
    const qs = buildQuery({ start_date: startDate, end_date: endDate, extension: ramal });
    const tentativas = [
        `/api/v1/cdr${qs}`,
        `/api/v1/calls${qs}`,
        `/api/cdr${qs}`,
        `/api/calls${qs}`
    ];
    for (const path of tentativas) {
        try {
            const res = await request('GET', path, null);
            return normalizar(res);
        } catch (_) { /* tenta próximo */ }
    }
    throw new Error('Não foi possível obter os dados de chamadas do Microvox.');
}

module.exports = { verificarConectividade, listarRamais, buscarChamadas };
