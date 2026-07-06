const microvix = require('./microvix');

function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.dados)) return payload.dados;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
}

function formatCurrency(value) {
    const numero = Number(value) || 0;
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toCsv(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const linhas = [headers.join(',')];
    for (const row of rows) {
        linhas.push(headers.map((header) => escape(row[header])).join(','));
    }
    return linhas.join('\n');
}

function buildVendasSummary(vendas, { dataInicial, dataFim } = {}) {
    const valorTotal = vendas.reduce((soma, venda) => soma + (Number(venda.valorTotal ?? venda.valor ?? 0)), 0);

    return [
        'Relatório de Vendas - Microvix',
        dataInicial && dataFim ? `Período: ${dataInicial} a ${dataFim}` : null,
        `Total de vendas: ${vendas.length}`,
        `Valor total: ${formatCurrency(valorTotal)}`
    ].filter(Boolean).join('\n');
}

async function gerarRelatorioVendas(dataInicial, dataFim) {
    const vendas = extractList(await microvix.getVendas(dataInicial, dataFim));

    return {
        resumo: buildVendasSummary(vendas, { dataInicial, dataFim }),
        csv: toCsv(vendas),
        totalRegistros: vendas.length
    };
}

module.exports = {
    extractList,
    toCsv,
    buildVendasSummary,
    gerarRelatorioVendas
};
