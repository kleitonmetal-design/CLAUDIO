const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVOX_URL = process.env.MICROVOX_URL;
const MICROVOX_API_KEY = process.env.MICROVOX_API_KEY;
const MICROVOX_USERNAME = process.env.MICROVOX_USERNAME;
const MICROVOX_PASSWORD = process.env.MICROVOX_PASSWORD;

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        if (!MICROVOX_URL) {
            return reject(new Error('MICROVOX_URL não configurada.'));
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(`${MICROVOX_URL}${path}`);
        } catch (err) {
            return reject(new Error(`URL Microvox inválida: ${err.message}`));
        }

        const payload = body ? JSON.stringify(body) : null;

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        if (MICROVOX_API_KEY) {
            headers['Authorization'] = `Bearer ${MICROVOX_API_KEY}`;
            headers['apikey'] = MICROVOX_API_KEY;
        }

        if (MICROVOX_USERNAME && MICROVOX_PASSWORD) {
            const credentials = Buffer.from(`${MICROVOX_USERNAME}:${MICROVOX_PASSWORD}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        }

        if (payload) {
            headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            headers,
        };

        const lib = parsedUrl.protocol === 'https:' ? https : http;

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    return reject(new Error(`Microvox API retornou ${res.statusCode}: ${data}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => reject(err));

        if (payload) req.write(payload);
        req.end();
    });
}

function formatDate(date) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function buildQuery(params) {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return qs ? `?${qs}` : '';
}

async function buscarChamadas(dataInicio, dataFim) {
    const qs = buildQuery({
        data_inicio: formatDate(dataInicio),
        data_fim: formatDate(dataFim),
    });
    return request('GET', `/api/reports/calls${qs}`);
}

async function buscarFilas(dataInicio, dataFim) {
    const qs = buildQuery({
        data_inicio: formatDate(dataInicio),
        data_fim: formatDate(dataFim),
    });
    return request('GET', `/api/reports/queues${qs}`);
}

async function buscarAgentes(dataInicio, dataFim) {
    const qs = buildQuery({
        data_inicio: formatDate(dataInicio),
        data_fim: formatDate(dataFim),
    });
    return request('GET', `/api/reports/agents${qs}`);
}

async function buscarDadosDiarios(data) {
    const ref = data ? new Date(data) : new Date();
    const dataInicio = formatDate(ref);
    const dataFim = formatDate(ref);

    const [chamadas, filas, agentes] = await Promise.allSettled([
        buscarChamadas(dataInicio, dataFim),
        buscarFilas(dataInicio, dataFim),
        buscarAgentes(dataInicio, dataFim),
    ]);

    return {
        chamadas: chamadas.status === 'fulfilled' ? chamadas.value : null,
        filas: filas.status === 'fulfilled' ? filas.value : null,
        agentes: agentes.status === 'fulfilled' ? agentes.value : null,
        erros: [chamadas, filas, agentes]
            .filter(r => r.status === 'rejected')
            .map(r => r.reason?.message),
    };
}

module.exports = {
    buscarChamadas,
    buscarFilas,
    buscarAgentes,
    buscarDadosDiarios,
};
