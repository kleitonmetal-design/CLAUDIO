const microvix = require('./microvix');

function formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('pt-BR');
}

function getDateRange(tipo) {
    const hoje = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (tipo === 'hoje') {
        const s = fmt(hoje);
        return { inicio: s, fim: s };
    }
    if (tipo === 'semana') {
        const inicio = new Date(hoje);
        inicio.setDate(hoje.getDate() - 6);
        return { inicio: fmt(inicio), fim: fmt(hoje) };
    }
    if (tipo === 'mes') {
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        return { inicio: fmt(inicio), fim: fmt(hoje) };
    }
    return { inicio: fmt(hoje), fim: fmt(hoje) };
}

function sumarizarVendas(transacoes) {
    if (!Array.isArray(transacoes)) transacoes = [];

    const totalBruto = transacoes.reduce((acc, t) => acc + (parseFloat(t.valor_total) || 0), 0);
    const totalDesconto = transacoes.reduce((acc, t) => acc + (parseFloat(t.desconto) || 0), 0);
    const totalLiquido = totalBruto - totalDesconto;
    const ticketMedio = transacoes.length > 0 ? totalLiquido / transacoes.length : 0;

    const porFormaPagamento = {};
    transacoes.forEach(t => {
        const forma = t.forma_pagamento || 'Não informado';
        if (!porFormaPagamento[forma]) porFormaPagamento[forma] = { qtd: 0, valor: 0 };
        porFormaPagamento[forma].qtd += 1;
        porFormaPagamento[forma].valor += parseFloat(t.valor_total) || 0;
    });

    return { totalBruto, totalDesconto, totalLiquido, ticketMedio, qtdVendas: transacoes.length, porFormaPagamento };
}

function formatarRelatorioVendas(transacoes, periodo) {
    const s = sumarizarVendas(transacoes);

    const linhasPagamento = Object.entries(s.porFormaPagamento)
        .sort((a, b) => b[1].valor - a[1].valor)
        .map(([forma, dados]) => `  • ${forma}: ${dados.qtd} vendas — ${formatCurrency(dados.valor)}`)
        .join('\n');

    return [
        `📊 *RELATÓRIO DE VENDAS*`,
        `📅 Período: ${periodo}`,
        ``,
        `🛒 Total de vendas: ${s.qtdVendas}`,
        `💰 Faturamento bruto: ${formatCurrency(s.totalBruto)}`,
        `🏷️ Descontos: ${formatCurrency(s.totalDesconto)}`,
        `✅ Faturamento líquido: ${formatCurrency(s.totalLiquido)}`,
        `🎯 Ticket médio: ${formatCurrency(s.ticketMedio)}`,
        ``,
        `💳 *Por forma de pagamento:*`,
        linhasPagamento || '  Sem dados',
    ].join('\n');
}

function formatarRelatorioProdutos(produtos) {
    if (!Array.isArray(produtos)) produtos = [];

    const ativos = produtos.filter(p => p.ativo !== false && p.situacao !== 'inativo');
    const inativos = produtos.length - ativos.length;

    const comEstoque = ativos.filter(p => (parseFloat(p.estoque) || 0) > 0);
    const semEstoque = ativos.filter(p => (parseFloat(p.estoque) || 0) <= 0);

    const estoqueTotal = ativos.reduce((acc, p) => acc + (parseFloat(p.estoque) || 0), 0);

    const top5 = [...ativos]
        .sort((a, b) => (parseFloat(b.estoque) || 0) - (parseFloat(a.estoque) || 0))
        .slice(0, 5)
        .map(p => `  • ${p.descricao || p.nome || 'Produto'}: ${parseFloat(p.estoque) || 0} un.`)
        .join('\n');

    return [
        `📦 *RELATÓRIO DE PRODUTOS*`,
        ``,
        `📋 Total de produtos: ${produtos.length}`,
        `✅ Ativos: ${ativos.length}`,
        `❌ Inativos: ${inativos}`,
        ``,
        `🏪 Com estoque: ${comEstoque.length}`,
        `⚠️ Sem estoque: ${semEstoque.length}`,
        `📊 Estoque total: ${estoqueTotal.toFixed(0)} unidades`,
        ``,
        `🔝 *Maiores estoques:*`,
        top5 || '  Sem dados',
    ].join('\n');
}

function formatarRelatorioClientes(clientes) {
    if (!Array.isArray(clientes)) clientes = [];

    const ativos = clientes.filter(c => c.ativo !== false);
    const pj = clientes.filter(c => c.tipo === 'J' || c.cnpj);
    const pf = clientes.filter(c => c.tipo === 'F' || c.cpf);

    const novos30dias = clientes.filter(c => {
        if (!c.data_cadastro) return false;
        const d = new Date(c.data_cadastro);
        const diff = (new Date() - d) / (1000 * 60 * 60 * 24);
        return diff <= 30;
    });

    return [
        `👥 *RELATÓRIO DE CLIENTES*`,
        ``,
        `📋 Total de clientes: ${clientes.length}`,
        `✅ Ativos: ${ativos.length}`,
        `🏢 Pessoa Jurídica: ${pj.length}`,
        `👤 Pessoa Física: ${pf.length}`,
        `🆕 Novos (últimos 30 dias): ${novos30dias.length}`,
    ].join('\n');
}

async function gerarRelatorioVendas(periodo = 'hoje') {
    const { inicio, fim } = getDateRange(periodo);
    const nomePeriodo = periodo === 'hoje' ? 'Hoje' : periodo === 'semana' ? 'Últimos 7 dias' : `${formatDate(inicio)} a ${formatDate(fim)}`;

    const transacoes = await microvix.getVendas(inicio, fim);
    return formatarRelatorioVendas(transacoes, nomePeriodo);
}

async function gerarRelatorioProdutos() {
    const produtos = await microvix.getProdutos();
    return formatarRelatorioProdutos(produtos);
}

async function gerarRelatorioClientes() {
    const clientes = await microvix.getClientes();
    return formatarRelatorioClientes(clientes);
}

async function gerarRelatorioCompleto(periodo = 'hoje') {
    const [vendas, produtos, clientes] = await Promise.all([
        gerarRelatorioVendas(periodo).catch(e => `❌ Vendas: ${e.message}`),
        gerarRelatorioProdutos().catch(e => `❌ Produtos: ${e.message}`),
        gerarRelatorioClientes().catch(e => `❌ Clientes: ${e.message}`),
    ]);
    return [vendas, '', '─────────────────', '', produtos, '', '─────────────────', '', clientes].join('\n');
}

module.exports = {
    gerarRelatorioVendas,
    gerarRelatorioProdutos,
    gerarRelatorioClientes,
    gerarRelatorioCompleto,
};
