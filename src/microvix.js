'use strict';

const axios = require('axios');

const BASE_URL = process.env.MICROVIX_URL || 'https://webapi.microvix.com.br/1.0/api';
const PORTAL   = process.env.MICROVIX_PORTAL;
const USUARIO  = process.env.MICROVIX_USUARIO;
const SENHA    = process.env.MICROVIX_SENHA;
const EMPRESA  = process.env.MICROVIX_EMPRESA || '1';

function credenciais() {
  return { portal: PORTAL, usuario: USUARIO, senha: SENHA, empresa: EMPRESA };
}

async function chamar(endpoint, params = {}) {
  const resp = await axios.get(`${BASE_URL}/${endpoint}`, {
    params: { ...credenciais(), ...params },
    timeout: 30000
  });
  return resp.data;
}

function periodoParaDatas(periodo) {
  const hoje = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  if (periodo === 'semana') {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 7);
    return { dataInicio: fmt(inicio), dataFim: fmt(hoje) };
  }
  if (periodo === 'mes') {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { dataInicio: fmt(inicio), dataFim: fmt(hoje) };
  }
  return { dataInicio: fmt(hoje), dataFim: fmt(hoje) };
}

async function getVendas(dataInicio, dataFim) {
  return chamar('vendas', { dtInicio: dataInicio, dtFim: dataFim });
}

async function getProdutos() {
  return chamar('produtos', { timestamp: 0 });
}

async function getClientes() {
  return chamar('clientes', { timestamp: 0 });
}

async function getLojas() {
  return chamar('lojas');
}

async function getEstoque() {
  return chamar('estoque', { timestamp: 0 });
}

module.exports = { getVendas, getProdutos, getClientes, getLojas, getEstoque, periodoParaDatas };
