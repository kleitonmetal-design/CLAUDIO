function toFloat(value) {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
}

function toInt(value) {
    const n = parseInt(value, 10);
    return isNaN(n) ? 0 : n;
}

// Agrupa um array por uma chave e aplica uma função acumuladora
function groupBy(arr, keyFn, reduceFn, initialFn) {
    const map = new Map();
    for (const item of arr) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, initialFn(item));
        reduceFn(map.get(key), item);
    }
    return Array.from(map.values());
}

function gerarRelatorioVendas(vendas, detalhes = []) {
    if (!vendas || vendas.length === 0) {
        return { totalVendas: 0, totalValor: 0, ticketMedio: 0, vendasPorLoja: [], vendasPorDia: [] };
    }

    const totalVendas = vendas.length;
    const totalValor = vendas.reduce((acc, v) => acc + toFloat(v.VALOR_TOTAL || v.VL_TOTAL), 0);
    const ticketMedio = totalVendas > 0 ? totalValor / totalVendas : 0;

    const vendasPorLoja = groupBy(
        vendas,
        (v) => v.COD_LOJA || v.cod_loja || 'N/A',
        (acc, v) => {
            acc.quantidade += 1;
            acc.valor += toFloat(v.VALOR_TOTAL || v.VL_TOTAL);
        },
        (v) => ({ loja: v.COD_LOJA || v.cod_loja || 'N/A', quantidade: 0, valor: 0 })
    ).sort((a, b) => b.valor - a.valor);

    const vendasPorDia = groupBy(
        vendas,
        (v) => {
            const dt = v.DT_EMISSAO || v.DT_VENDA || '';
            return dt.substring(0, 10);
        },
        (acc, v) => {
            acc.quantidade += 1;
            acc.valor += toFloat(v.VALOR_TOTAL || v.VL_TOTAL);
        },
        (v) => ({
            data: (v.DT_EMISSAO || v.DT_VENDA || '').substring(0, 10),
            quantidade: 0,
            valor: 0,
        })
    ).sort((a, b) => a.data.localeCompare(b.data));

    // Produtos mais vendidos (se detalhes disponíveis)
    const produtosMaisVendidos = detalhes.length > 0
        ? groupBy(
            detalhes,
            (d) => d.COD_PRODUTO || d.cod_produto || 'N/A',
            (acc, d) => {
                acc.quantidade += toInt(d.QUANTIDADE || d.QTD);
                acc.valor += toFloat(d.VALOR_TOTAL || d.VL_TOTAL);
            },
            (d) => ({
                codigo: d.COD_PRODUTO || d.cod_produto || 'N/A',
                descricao: d.DESCRICAO || d.DESC_PRODUTO || '',
                quantidade: 0,
                valor: 0,
            })
        ).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10)
        : [];

    return {
        totalVendas,
        totalValor: parseFloat(totalValor.toFixed(2)),
        ticketMedio: parseFloat(ticketMedio.toFixed(2)),
        vendasPorLoja,
        vendasPorDia,
        produtosMaisVendidos,
        geradoEm: new Date().toISOString(),
    };
}

function gerarRelatorioClientes(clientes) {
    if (!clientes || clientes.length === 0) {
        return { totalClientes: 0, clientesPorCidade: [], clientesPorEstado: [] };
    }

    const totalClientes = clientes.length;

    const clientesPorEstado = groupBy(
        clientes,
        (c) => c.ESTADO || c.UF || 'N/A',
        (acc) => { acc.quantidade += 1; },
        (c) => ({ estado: c.ESTADO || c.UF || 'N/A', quantidade: 0 })
    ).sort((a, b) => b.quantidade - a.quantidade);

    const clientesPorCidade = groupBy(
        clientes,
        (c) => `${c.CIDADE || c.MUNICIPIO || 'N/A'}/${c.ESTADO || c.UF || 'N/A'}`,
        (acc) => { acc.quantidade += 1; },
        (c) => ({
            cidade: c.CIDADE || c.MUNICIPIO || 'N/A',
            estado: c.ESTADO || c.UF || 'N/A',
            quantidade: 0,
        })
    ).sort((a, b) => b.quantidade - a.quantidade).slice(0, 20);

    const comEmail = clientes.filter(c => c.EMAIL && c.EMAIL.trim() !== '').length;

    return {
        totalClientes,
        comEmail,
        percentualComEmail: totalClientes > 0 ? parseFloat(((comEmail / totalClientes) * 100).toFixed(1)) : 0,
        clientesPorEstado,
        clientesPorCidade,
        geradoEm: new Date().toISOString(),
    };
}

function gerarRelatorioProdutos(produtos) {
    if (!produtos || produtos.length === 0) {
        return { totalProdutos: 0, produtosPorCategoria: [], produtosAtivos: 0 };
    }

    const totalProdutos = produtos.length;
    const produtosAtivos = produtos.filter(
        p => (p.SITUACAO || p.ATIVO || '').toString().toUpperCase() === 'A' ||
             (p.SITUACAO || p.ATIVO || '').toString() === '1'
    ).length;

    const produtosPorCategoria = groupBy(
        produtos,
        (p) => p.DEPARTAMENTO || p.CATEGORIA || p.COD_DEPARTAMENTO || 'N/A',
        (acc) => { acc.quantidade += 1; },
        (p) => ({
            categoria: p.DEPARTAMENTO || p.CATEGORIA || p.COD_DEPARTAMENTO || 'N/A',
            quantidade: 0,
        })
    ).sort((a, b) => b.quantidade - a.quantidade);

    return {
        totalProdutos,
        produtosAtivos,
        produtosInativos: totalProdutos - produtosAtivos,
        produtosPorCategoria,
        geradoEm: new Date().toISOString(),
    };
}

module.exports = {
    gerarRelatorioVendas,
    gerarRelatorioClientes,
    gerarRelatorioProdutos,
};
