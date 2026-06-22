function formatarMoeda(valor) {
    const num = parseFloat(valor) || 0;
    return `R$ ${num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatarData(data) {
    if (!data) return 'N/A';
    const d = new Date(data);
    if (isNaN(d)) return data;
    return d.toLocaleDateString('pt-BR');
}

function gerarRelatorioPedidos(dados) {
    const pedidos = Array.isArray(dados) ? dados : (dados?.pedidos || dados?.data || []);
    const total = pedidos.reduce((acc, p) => acc + (parseFloat(p.valor_total || p.total || 0)), 0);
    const qty = pedidos.length;

    const linhas = pedidos.slice(0, 20).map((p, i) => {
        const num = p.numero_pedido || p.id || i + 1;
        const dt = formatarData(p.data_pedido || p.data || p.created_at);
        const vl = formatarMoeda(p.valor_total || p.total);
        const status = p.status || '';
        return `${String(i + 1).padStart(2, '0')}. Pedido #${num} | ${dt} | ${vl} | ${status}`.trimEnd();
    });

    const aviso = qty > 20 ? `\n... e mais ${qty - 20} pedidos.` : '';

    return [
        '📦 *RELATÓRIO DE PEDIDOS*',
        `📅 Gerado em: ${formatarData(new Date())}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ...linhas,
        aviso,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📊 Total de pedidos: *${qty}*`,
        `💰 Valor total: *${formatarMoeda(total)}*`
    ].filter(Boolean).join('\n');
}

function gerarRelatorioEstoque(dados) {
    const itens = Array.isArray(dados) ? dados : (dados?.estoque || dados?.data || []);
    const semEstoque = itens.filter(p => (parseFloat(p.saldo || p.quantidade || 0)) <= 0);
    const estoqueBaixo = itens.filter(p => {
        const qtd = parseFloat(p.saldo || p.quantidade || 0);
        const min = parseFloat(p.estoque_minimo || p.minimo || 0);
        return qtd > 0 && min > 0 && qtd <= min;
    });

    const linhas = itens.slice(0, 20).map((p, i) => {
        const cod = p.codigo || p.id || i + 1;
        const nome = (p.descricao || p.nome || 'Produto').substring(0, 30);
        const qtd = parseFloat(p.saldo || p.quantidade || 0);
        const alerta = qtd <= 0 ? ' ❌' : '';
        return `${String(i + 1).padStart(2, '0')}. [${cod}] ${nome} | Qtd: ${qtd}${alerta}`;
    });

    const aviso = itens.length > 20 ? `\n... e mais ${itens.length - 20} itens.` : '';

    return [
        '🏭 *RELATÓRIO DE ESTOQUE*',
        `📅 Gerado em: ${formatarData(new Date())}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ...linhas,
        aviso,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📦 Total de SKUs: *${itens.length}*`,
        semEstoque.length > 0 ? `❌ Sem estoque: *${semEstoque.length}* itens` : null,
        estoqueBaixo.length > 0 ? `⚠️ Estoque baixo: *${estoqueBaixo.length}* itens` : null
    ].filter(Boolean).join('\n');
}

function gerarRelatorioClientes(dados) {
    const clientes = Array.isArray(dados) ? dados : (dados?.clientes || dados?.data || []);
    const qty = clientes.length;

    const linhas = clientes.slice(0, 20).map((c, i) => {
        const nome = (c.nome || c.razao_social || 'Cliente').substring(0, 30);
        const doc = c.cpf || c.cnpj || '';
        const cidade = c.cidade || '';
        return `${String(i + 1).padStart(2, '0')}. ${nome} | ${doc} | ${cidade}`.trimEnd();
    });

    const aviso = qty > 20 ? `\n... e mais ${qty - 20} clientes.` : '';

    return [
        '👥 *RELATÓRIO DE CLIENTES*',
        `📅 Gerado em: ${formatarData(new Date())}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ...linhas,
        aviso,
        `━━━━━━━━━━━━━━━━━━━━`,
        `👤 Total de clientes: *${qty}*`
    ].filter(Boolean).join('\n');
}

function gerarRelatorioFinanceiro(dados) {
    const lancamentos = Array.isArray(dados) ? dados : (dados?.financeiro || dados?.data || []);
    const totalEntradas = lancamentos
        .filter(l => (l.tipo || '').toLowerCase() === 'entrada' || parseFloat(l.valor || 0) > 0)
        .reduce((acc, l) => acc + Math.abs(parseFloat(l.valor || 0)), 0);
    const totalSaidas = lancamentos
        .filter(l => (l.tipo || '').toLowerCase() === 'saida' || parseFloat(l.valor || 0) < 0)
        .reduce((acc, l) => acc + Math.abs(parseFloat(l.valor || 0)), 0);

    const linhas = lancamentos.slice(0, 20).map((l, i) => {
        const dt = formatarData(l.data || l.data_vencimento);
        const desc = (l.descricao || l.historico || '').substring(0, 25);
        const vl = formatarMoeda(l.valor);
        const tipo = l.tipo || '';
        return `${String(i + 1).padStart(2, '0')}. ${dt} | ${desc} | ${vl} | ${tipo}`.trimEnd();
    });

    const aviso = lancamentos.length > 20 ? `\n... e mais ${lancamentos.length - 20} lançamentos.` : '';

    return [
        '💵 *RELATÓRIO FINANCEIRO*',
        `📅 Gerado em: ${formatarData(new Date())}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ...linhas,
        aviso,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📈 Total entradas: *${formatarMoeda(totalEntradas)}*`,
        `📉 Total saídas: *${formatarMoeda(totalSaidas)}*`,
        `💰 Saldo: *${formatarMoeda(totalEntradas - totalSaidas)}*`
    ].filter(Boolean).join('\n');
}

module.exports = {
    gerarRelatorioPedidos,
    gerarRelatorioEstoque,
    gerarRelatorioClientes,
    gerarRelatorioFinanceiro
};
