const https = require('https');
const http = require('http');
const { URL } = require('url');

const MICROVOX_URL = process.env.MICROVOX_URL || '';
const MICROVOX_TOKEN = process.env.MICROVOX_TOKEN || '';
const MICROVOX_ACCOUNT = process.env.MICROVOX_ACCOUNT || '';

function makeRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    if (!MICROVOX_URL || !MICROVOX_TOKEN) {
      return reject(new Error('MICROVOX_URL e MICROVOX_TOKEN são obrigatórios'));
    }

    let urlStr;
    try {
      urlStr = `${MICROVOX_URL.replace(/\/$/, '')}${endpoint}`;
      const parsed = new URL(urlStr);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          parsed.searchParams.set(k, v);
        }
      });
      if (MICROVOX_ACCOUNT) parsed.searchParams.set('account', MICROVOX_ACCOUNT);
      urlStr = parsed.toString();
    } catch (e) {
      return reject(new Error(`URL inválida: ${e.message}`));
    }

    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MICROVOX_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Microvox retornou ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout na conexão com o Microvox'));
    });

    req.on('error', (err) => reject(new Error(`Erro de rede: ${err.message}`)));
    req.end();
  });
}

function normalizarChamadas(raw) {
  // O Microvox pode retornar a lista em vários formatos
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.records)) return raw.records;
  if (raw && Array.isArray(raw.chamadas)) return raw.chamadas;
  if (raw && Array.isArray(raw.cdr)) return raw.cdr;
  return [];
}

async function checkStatus() {
  try {
    await makeRequest('/api/status');
    return { conectado: true };
  } catch (e) {
    // Tenta endpoint alternativo
    try {
      await makeRequest('/status');
      return { conectado: true };
    } catch {
      return { conectado: false, erro: e.message };
    }
  }
}

async function fetchRamais() {
  try {
    const raw = await makeRequest('/api/extensions');
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.extensions)) return raw.extensions;
    if (raw && Array.isArray(raw.ramais)) return raw.ramais;
    return [];
  } catch (e) {
    const raw = await makeRequest('/api/ramais');
    return Array.isArray(raw) ? raw : [];
  }
}

async function fetchChamadas(startDate, endDate, ramal) {
  const params = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (ramal) params.extension = ramal;

  let raw;
  try {
    raw = await makeRequest('/api/cdr', params);
  } catch {
    // Tenta endpoints alternativos comuns em sistemas Microvox
    try {
      raw = await makeRequest('/api/calls', params);
    } catch {
      raw = await makeRequest('/cdr', params);
    }
  }

  return normalizarChamadas(raw);
}

module.exports = { checkStatus, fetchRamais, fetchChamadas };
