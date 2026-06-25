function gerarRelatorio(chamadas, ramalFiltro) {
    if (!Array.isArray(chamadas)) chamadas = [];

    const lista = ramalFiltro
        ? chamadas.filter(c => {
            const ext = String(c.extension || c.ramal || c.src || c.dst || '');
            return ext === String(ramalFiltro);
        })
        : chamadas;

    const total = lista.length;

    const contar = (...statuses) =>
        lista.filter(c => {
            const s = (c.disposition || c.status || c.callstatus || '').toLowerCase();
            return statuses.some(st => s === st);
        }).length;

    const atendidas = contar('answered', 'atendida', 'completed');
    const perdidas  = contar('no answer', 'noanswer', 'perdida', 'missed');
    const ocupado   = contar('busy', 'ocupado');
    const outros    = total - atendidas - perdidas - ocupado;
    const taxaAtendimento = total > 0 ? Math.round((atendidas / total) * 100) : 0;

    const duracoes = lista.map(c => Number(c.duration || c.duracao || c.billsec || 0)).filter(d => d > 0);
    const duracaoTotal = duracoes.reduce((a, b) => a + b, 0);
    const duracaoMedia = duracoes.length ? Math.round(duracaoTotal / duracoes.length) : 0;

    const custoTotal = lista.reduce((acc, c) => acc + Number(c.cost || c.custo || c.preco || 0), 0);

    const porRamal = {};
    lista.forEach(c => {
        const ext = String(c.extension || c.ramal || c.src || c.dst || 'desconhecido');
        porRamal[ext] = (porRamal[ext] || 0) + 1;
    });
    const topRamais = Object.entries(porRamal)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ramal, qtd]) => ({ ramal, qtd }));

    const porHora = {};
    lista.forEach(c => {
        const ts = c.start_time || c.calldate || c.datetime || c.created_at || '';
        if (!ts) return;
        const hora = new Date(ts).getHours();
        if (!isNaN(hora)) {
            const chave = `${String(hora).padStart(2, '0')}:00`;
            porHora[chave] = (porHora[chave] || 0) + 1;
        }
    });
    const distribuicaoPorHora = Object.entries(porHora)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([hora, qtd]) => ({ hora, qtd }));

    return {
        resumo: { total, atendidas, perdidas, ocupado, outros, taxaAtendimento },
        duracao: { totalSegundos: duracaoTotal, mediaSegundos: duracaoMedia },
        custo: custoTotal.toFixed(2),
        topRamais,
        distribuicaoPorHora,
        ...(ramalFiltro ? { ramalFiltrado: ramalFiltro } : {})
    };
}

function fmtSegundos(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${m}m ${r}s`;
    if (m > 0) return `${m}m ${r}s`;
    return `${r}s`;
}

function formatarParaWhatsApp(relatorio, periodo) {
    const { resumo, duracao, custo, topRamais, distribuicaoPorHora, ramalFiltrado } = relatorio;

    const titulo = ramalFiltrado
        ? `*Relatório de Chamadas — Ramal ${ramalFiltrado}*`
        : '*Relatório de Chamadas*';

    const linhasRamais = topRamais.length
        ? topRamais.map((r, i) => `  ${i + 1}. Ramal ${r.ramal}: ${r.qtd} chamada(s)`).join('\n')
        : '  Nenhum dado disponível';

    const linhasHora = distribuicaoPorHora.length
        ? distribuicaoPorHora.map(h => `  ${h.hora} — ${h.qtd} chamada(s)`).join('\n')
        : '  Nenhum dado disponível';

    return [
        titulo,
        periodo ? `_Período: ${periodo}_` : '',
        '',
        '📊 *Resumo*',
        `  Total de chamadas: *${resumo.total}*`,
        `  ✅ Atendidas: ${resumo.atendidas}`,
        `  ❌ Perdidas: ${resumo.perdidas}`,
        `  🔴 Ocupado: ${resumo.ocupado}`,
        `  Taxa de atendimento: *${resumo.taxaAtendimento}%*`,
        '',
        '⏱ *Duração*',
        `  Total: ${fmtSegundos(duracao.totalSegundos)}`,
        `  Média por chamada: ${fmtSegundos(duracao.mediaSegundos)}`,
        '',
        `💰 *Custo estimado:* R$ ${custo}`,
        '',
        '📞 *Top Ramais*',
        linhasRamais,
        '',
        '🕐 *Distribuição por Hora*',
        linhasHora
    ].filter(l => l !== null).join('\n');
}

module.exports = { gerarRelatorio, formatarParaWhatsApp };
