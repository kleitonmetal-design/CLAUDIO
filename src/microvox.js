const axios = require('axios');

const MICROVOX_URL = process.env.MICROVOX_URL;
const MICROVOX_TOKEN = process.env.MICROVOX_TOKEN;
const MICROVOX_ACCOUNT = process.env.MICROVOX_ACCOUNT;

function criarCliente() {
  if (!MICROVOX_URL || !MICROVOX_TOKEN) {
    throw new Error('Variáveis MICROVOX_URL e MICROVOX_TOKEN não configuradas');
  }

  const headers = {
    'Authorization': `Bearer ${MICROVOX_TOKEN}`,
    'Content-Type': 'application/json'
  };
  if (MICROVOX_ACCOUNT) headers['X-Account'] = MICROVOX_ACCOUNT;

  return axios.create({ baseURL: MICROVOX_URL, headers, timeout: 15000 });
}

function normalizarChamada(c) {
  return {
    id: c.id || c.call_id || c.callId,
    ramal: c.extension || c.ramal || c.src || c.source,
    destino: c.destination || c.destino || c.dst,
    inicio: c.start || c.start_time || c.inicio || c.started_at,
    duracao: Number(c.duration || c.duracao || c.billsec || 0),
    status: (c.status || c.disposition || c.estado || '').toLowerCase(),
    tipo: c.direction || c.tipo || c.calltype,
    custo: Number(c.cost || c.custo || c.price || 0)
  };
}

function extrairLista(data) {
  return Array.isArray(data) ? data : (data.data || data.calls || data.chamadas || data.records || []);
}

async function fetchChamadas(startDate, endDate, ramal = null) {
  const client = criarCliente();
  const params = { start_date: startDate, end_date: endDate };
  if (ramal) params.extension = ramal;
  if (MICROVOX_ACCOUNT) params.account = MICROVOX_ACCOUNT;

  const tentativas = ['/cdr', '/calls', '/relatorios/chamadas'];
  let ultimoErro;

  for (const endpoint of tentativas) {
    try {
      const { data } = await client.get(endpoint, { params });
      return extrairLista(data).map(normalizarChamada);
    } catch (err) {
      ultimoErro = err;
    }
  }

  throw new Error(`Falha ao buscar chamadas: ${ultimoErro.message}`);
}

async function fetchRamais() {
  const client = criarCliente();
  const params = MICROVOX_ACCOUNT ? { account: MICROVOX_ACCOUNT } : {};

  const tentativas = ['/extensions', '/ramais'];
  let ultimoErro;

  for (const endpoint of tentativas) {
    try {
      const { data } = await client.get(endpoint, { params });
      return extrairLista(data);
    } catch (err) {
      ultimoErro = err;
    }
  }

  throw new Error(`Falha ao buscar ramais: ${ultimoErro.message}`);
}

async function verificarConexao() {
  try {
    const client = criarCliente();
    await client.get('/health');
    return true;
  } catch {
    try {
      await fetchRamais();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { fetchChamadas, fetchRamais, verificarConexao };
