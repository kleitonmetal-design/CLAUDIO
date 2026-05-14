const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICRIVOX_URL = process.env.MICRIVOX_URL;
const MICRIVOX_API_KEY = process.env.MICRIVOX_API_KEY;
const MICRIVOX_ACCOUNT = process.env.MICRIVOX_ACCOUNT;

/**
 * Faz uma requisição HTTP/HTTPS autenticada para a API do Micrivox.
 */
function micrivoxRequest(path, params = {}) {
    return new Promise((resolve, reject) => {
        if (!MICRIVOX_URL || !MICRIVOX_API_KEY) {
            return reject(new Error('Variáveis MICRIVOX_URL e MICRIVOX_API_KEY não configuradas.'));
        }

        const query = new URLSearchParams(params).toString();
        const fullPath = query ? `${path}?${query}` : path;

        let parsedUrl;
        try {
            parsedUrl = new URL(MICRIVOX_URL);
        } catch {
            return reject(new Error('MICRIVOX_URL inválida.'));
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: fullPath,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${MICRIVOX_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };

        const lib = parsedUrl.protocol === 'https:' ? https : http;

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`Micrivox retornou status ${res.statusCode}: ${data}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error('Resposta da Micrivox não é JSON válido.'));
                }
            });
        });

        req.on('error', (err) => reject(new Error(`Erro de conexão com Micrivox: ${err.message}`)));
        req.end();
    });
}

/**
 * Busca registros de CDR (Call Detail Records) do Micrivox.
 * @param {string} startDate - Data inicial no formato YYYY-MM-DD
 * @param {string} endDate   - Data final no formato YYYY-MM-DD
 * @returns {Promise<Array>} Lista de registros de chamadas
 */
async function fetchCDR(startDate, endDate) {
    const params = {
        start_date: startDate,
        end_date: endDate,
    };

    if (MICRIVOX_ACCOUNT) {
        params.account = MICRIVOX_ACCOUNT;
    }

    const response = await micrivoxRequest('/api/v1/cdr', params);

    // Normaliza diferentes formatos de resposta da API
    if (Array.isArray(response)) return response;
    if (response.data && Array.isArray(response.data)) return response.data;
    if (response.records && Array.isArray(response.records)) return response.records;
    if (response.calls && Array.isArray(response.calls)) return response.calls;

    throw new Error('Formato de resposta CDR não reconhecido.');
}

/**
 * Busca ramais/extensões cadastrados no Micrivox.
 * @returns {Promise<Array>}
 */
async function fetchExtensions() {
    const response = await micrivoxRequest('/api/v1/extensions');
    if (Array.isArray(response)) return response;
    if (response.data && Array.isArray(response.data)) return response.data;
    return [];
}

module.exports = { fetchCDR, fetchExtensions };
