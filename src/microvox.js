const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVOX_URL = process.env.MICROVOX_URL;
const MICROVOX_TOKEN = process.env.MICROVOX_TOKEN;
const MICROVOX_ACCOUNT = process.env.MICROVOX_ACCOUNT;

function request(path, params = {}) {
    return new Promise((resolve, reject) => {
        if (!MICROVOX_URL || !MICROVOX_TOKEN) {
            return reject(new Error('MICROVOX_URL e MICROVOX_TOKEN são obrigatórios'));
        }

        const query = new URLSearchParams(params).toString();
        const fullPath = query ? `${path}?${query}` : path;

        let parsed;
        try {
            parsed = new URL(`${MICROVOX_URL}${fullPath}`);
        } catch (err) {
            return reject(new Error(`URL inválida do Microvox: ${err.message}`));
        }

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${MICROVOX_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...(MICROVOX_ACCOUNT ? { 'X-Account': MICROVOX_ACCOUNT } : {})
            }
        };

        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    return reject(new Error(`Microvox retornou status ${res.statusCode}: ${data}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function normalizarChamadas(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    if (raw && Array.isArray(raw.calls)) return raw.calls;
    if (raw && Array.isArray(raw.records)) return raw.records;
    return [];
}

async function getChamadas(startDate, endDate, ramal = null) {
    const params = { start_date: startDate, end_date: endDate };
    if (ramal) params.extension = ramal;
    if (MICROVOX_ACCOUNT) params.account = MICROVOX_ACCOUNT;

    // Tenta múltiplos endpoints comuns da API Microvox
    const endpoints = ['/api/v1/calls', '/api/calls', '/calls', '/cdr'];
    for (const ep of endpoints) {
        try {
            const raw = await request(ep, params);
            const chamadas = normalizarChamadas(raw);
            if (chamadas.length >= 0) return chamadas;
        } catch {
            continue;
        }
    }
    throw new Error('Não foi possível acessar a API do Microvox. Verifique MICROVOX_URL e MICROVOX_TOKEN.');
}

async function getRamais() {
    const endpoints = ['/api/v1/extensions', '/api/extensions', '/extensions', '/ramais'];
    for (const ep of endpoints) {
        try {
            const raw = await request(ep);
            const ramais = Array.isArray(raw) ? raw : (raw.data || raw.extensions || []);
            return ramais;
        } catch {
            continue;
        }
    }
    throw new Error('Não foi possível listar ramais do Microvox.');
}

async function verificarConexao() {
    const endpoints = ['/api/v1/status', '/api/status', '/status', '/health', '/ping'];
    for (const ep of endpoints) {
        try {
            await request(ep);
            return true;
        } catch {
            continue;
        }
    }
    // Tenta chamadas sem data para ver se a API responde
    try {
        const hoje = new Date().toISOString().split('T')[0];
        await getChamadas(hoje, hoje);
        return true;
    } catch {
        return false;
    }
}

module.exports = { getChamadas, getRamais, verificarConexao };
