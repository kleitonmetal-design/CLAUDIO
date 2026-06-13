const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVOX_URL = process.env.MICROVOX_URL;
const MICROVOX_API_KEY = process.env.MICROVOX_API_KEY;
const MICROVOX_ACCOUNT = process.env.MICROVOX_ACCOUNT;

/**
 * Executa uma requisição HTTP/HTTPS genérica para a API do Microvox.
 */
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        if (!MICROVOX_URL) {
            return reject(new Error('MICROVOX_URL não configurado.'));
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(`${MICROVOX_URL}${path}`);
        } catch (err) {
            return reject(new Error(`URL inválida do Microvox: ${err.message}`));
        }

        const payload = body ? JSON.stringify(body) : null;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + (parsedUrl.search || ''),
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };

        if (MICROVOX_API_KEY) {
            options.headers['Authorization'] = `Bearer ${MICROVOX_API_KEY}`;
            options.headers['apikey'] = MICROVOX_API_KEY;
        }

        if (payload) {
            options.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const lib = parsedUrl.protocol === 'https:' ? https : http;

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`Microvox API erro ${res.statusCode}: ${data}`));
                    }
                } catch {
                    reject(new Error(`Resposta inválida do Microvox: ${data}`));
                }
            });
        });

        req.on('error', (err) => reject(err));

        if (payload) req.write(payload);
        req.end();
    });
}

/**
 * Constrói query string com filtros de data e paginação.
 */
function buildQuery(params = {}) {
    const q = new URLSearchParams();
    if (MICROVOX_ACCOUNT) q.set('account', MICROVOX_ACCOUNT);
    if (params.startDate) q.set('start_date', params.startDate);
    if (params.endDate) q.set('end_date', params.endDate);
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('limit', params.limit || 100);
    if (params.status) q.set('status', params.status);
    return q.toString() ? `?${q.toString()}` : '';
}

/**
 * Extrai registros de chamadas do Microvox.
 * @param {object} params - { startDate, endDate, page, limit, status }
 */
async function getCalls(params = {}) {
    const qs = buildQuery(params);
    return request('GET', `/api/v1/calls${qs}`);
}

/**
 * Extrai todas as chamadas paginando automaticamente.
 */
async function getAllCalls(params = {}) {
    let page = 1;
    let allCalls = [];
    let hasMore = true;

    while (hasMore) {
        const result = await getCalls({ ...params, page, limit: 100 });
        const calls = result.data || result.calls || result.records || result || [];

        if (!Array.isArray(calls) || calls.length === 0) {
            hasMore = false;
        } else {
            allCalls = allCalls.concat(calls);
            const total = result.total || result.totalCount || null;
            hasMore = total ? allCalls.length < total : calls.length === 100;
            page++;
        }
    }

    return allCalls;
}

/**
 * Extrai dados de filas/ramais do Microvox.
 */
async function getQueues(params = {}) {
    const qs = buildQuery(params);
    return request('GET', `/api/v1/queues${qs}`);
}

/**
 * Extrai dados de agentes/operadores do Microvox.
 */
async function getAgents(params = {}) {
    const qs = buildQuery(params);
    return request('GET', `/api/v1/agents${qs}`);
}

/**
 * Extrai relatório de atendimentos do Microvox.
 */
async function getAttendances(params = {}) {
    const qs = buildQuery(params);
    return request('GET', `/api/v1/attendances${qs}`);
}

/**
 * Retorna estatísticas consolidadas do Microvox.
 */
async function getStats(params = {}) {
    const qs = buildQuery(params);
    return request('GET', `/api/v1/stats${qs}`);
}

/**
 * Verifica conectividade com a API do Microvox.
 */
async function ping() {
    return request('GET', '/api/v1/health');
}

module.exports = { getCalls, getAllCalls, getQueues, getAgents, getAttendances, getStats, ping };
