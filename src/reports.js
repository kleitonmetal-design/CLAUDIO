function formatarMoeda(valor) {
    const num = parseFloat(valor) || 0;
    return `R$ ${num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatarData(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('pt-BR');
}

function gerarRelatorioVendas(dados, { dataInicio, dataFim, loja } = {}) {
    const itens = Array.isArray(dados) ? dados : (dados.vendas || dados.items || dados.data || []);

    const totalVendas = itens.length;
    const valorTotal = itens.reduce((acc, v) => acc + (parseFloat(v.valor_total || v.total || v.valorTotal || 0)), 0);
    const ticketMedio = totalVendas > 0 ? valorTotal / totalVendas : 0;

    const vendasPorLoja = {};
    itens.forEach((v) => {
        const lojaId = v.loja || v.cod_loja || v.codigoLoja || 'Geral';
        if (!vendasPorLoja[lojaId]) vendasPorLoja[lojaId] = { qtd: 0, valor: 0 };
        vendasPorLoja[lojaId].qtd += 1;
        vendasPorLoja[lojaId].valor += parseFloat(v.valor_total || v.total || v.valorTotal || 0);
    });

    const topLojasTexto = Object.entries(vendasPorLoja)
        .sort((a, b) => b[1].valor - a[1].valor)
        .slice(0, 5)
        .map(([id, info]) => `  • Loja ${id}: ${info.qtd} vendas | ${formatarMoeda(info.valor)}`)
        .join('\n');

    const periodo = dataInicio && dataFim
        ? `${formatarData(dataInicio)} a ${formatarData(dataFim)}`
        : 'Período atual';

    return [
        `📊 *RELATÓRIO DE VENDAS - MICROVIX*`,
        `📅 Período: ${periodo}`,
        loja ? `🏪 Loja: ${loja}` : null,
        ``,
        `*Resumo Geral*`,
        `• Total de vendas: ${totalVendas}`,
        `• Valor total: ${formatarMoeda(valorTotal)}`,
        `• Ticket médio: ${formatarMoeda(ticketMedio)}`,
        ``,
        topLojasTexto ? `*Top Lojas*\n${topLojasTexto}` : null,
        ``,
        `_Gerado em: ${new Date().toLocaleString('pt-BR')}_`
    ].filter(l => l !== null).join('\n');
}

function gerarRelatorioEstoque(dados, { loja } = {}) {
    const itens = Array.isArray(dados) ? dados : (dados.estoque || dados.items || dados.data || []);

    const totalItens = itens.length;
    const semEstoque = itens.filter(i => (parseFloat(i.saldo || i.quantidade || i.qty || 0)) <= 0).length;
    const comEstoque = totalItens - semEstoque;

    const valorEstoque = itens.reduce((acc, i) => {
        const saldo = parseFloat(i.saldo || i.quantidade || i.qty || 0);
        const custo = parseFloat(i.custo || i.preco_custo || i.costPrice || 0);
        return acc + (saldo * custo);
    }, 0);

    const semEstoqueItens = itens
        .filter(i => (parseFloat(i.saldo || i.quantidade || i.qty || 0)) <= 0)
        .slice(0, 10)
        .map(i => `  • ${i.descricao || i.nome || i.name || i.codigo || 'Produto'}`)
        .join('\n');

    return [
        `📦 *RELATÓRIO DE ESTOQUE - MICROVIX*`,
        loja ? `🏪 Loja: ${loja}` : null,
        ``,
        `*Resumo*`,
        `• Total de SKUs: ${totalItens}`,
        `• Com estoque: ${comEstoque}`,
        `• Sem estoque: ${semEstoque}`,
        `• Valor em estoque: ${formatarMoeda(valorEstoque)}`,
        ``,
        semEstoque > 0 ? `*Produtos sem estoque (primeiros 10)*\n${semEstoqueItens}` : `✅ Todos os produtos com estoque`,
        ``,
        `_Gerado em: ${new Date().toLocaleString('pt-BR')}_`
    ].filter(l => l !== null).join('\n');
}

function gerarRelatorioPedidos(dados, { dataInicio, dataFim } = {}) {
    const itens = Array.isArray(dados) ? dados : (dados.pedidos || dados.items || dados.data || []);

    const totalPedidos = itens.length;
    const valorTotal = itens.reduce((acc, p) => acc + (parseFloat(p.valor_total || p.total || p.valorTotal || 0)), 0);

    const porStatus = {};
    itens.forEach((p) => {
        const status = p.status || p.situacao || 'Indefinido';
        if (!porStatus[status]) porStatus[status] = { qtd: 0, valor: 0 };
        porStatus[status].qtd += 1;
        porStatus[status].valor += parseFloat(p.valor_total || p.total || p.valorTotal || 0);
    });

    const statusTexto = Object.entries(porStatus)
        .sort((a, b) => b[1].qtd - a[1].qtd)
        .map(([status, info]) => `  • ${status}: ${info.qtd} pedidos | ${formatarMoeda(info.valor)}`)
        .join('\n');

    const periodo = dataInicio && dataFim
        ? `${formatarData(dataInicio)} a ${formatarData(dataFim)}`
        : 'Período atual';

    return [
        `📋 *RELATÓRIO DE PEDIDOS - MICROVIX*`,
        `📅 Período: ${periodo}`,
        ``,
        `*Resumo*`,
        `• Total de pedidos: ${totalPedidos}`,
        `• Valor total: ${formatarMoeda(valorTotal)}`,
        ``,
        statusTexto ? `*Por Status*\n${statusTexto}` : null,
        ``,
        `_Gerado em: ${new Date().toLocaleString('pt-BR')}_`
    ].filter(l => l !== null).join('\n');
}

function gerarRelatorioPersonalizado(tipo, dados, filtros = {}) {
    switch (tipo) {
        case 'vendas': return gerarRelatorioVendas(dados, filtros);
        case 'estoque': return gerarRelatorioEstoque(dados, filtros);
        case 'pedidos': return gerarRelatorioPedidos(dados, filtros);
        default: return `📊 *Relatório: ${tipo}*\n\nDados extraídos com sucesso.\n_Gerado em: ${new Date().toLocaleString('pt-BR')}_`;
    }
}

module.exports = {
    gerarRelatorioVendas,
    gerarRelatorioEstoque,
    gerarRelatorioPedidos,
    gerarRelatorioPersonalizado
};
