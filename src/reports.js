// Gera relatório analítico estruturado a partir de registros CDR do Microvox

function gerarRelatorio(registros, { startDate, endDate, ramal } = {}) {
    const total = registros.length;
    let atendidas = 0, perdidas = 0, ocupado = 0, outras = 0;
    let duracaoTotal = 0, custoTotal = 0;
    const contagemRamal = {};
    const contagemHora  = {};

    for (const r of registros) {
        // Normaliza status (APIs diferentes usam nomes diferentes)
        const status = (r.status || r.disposition || r.billsec > 0 ? 'answered' : 'noanswer').toLowerCase();
        const duracao = Number(r.billsec || r.duration || r.talk_time || 0);
        const custo   = Number(r.cost || r.charge || r.billed || 0);

        if (status === 'answered' || status === 'atendida') atendidas++;
        else if (status === 'noanswer' || status === 'perdida' || status === 'missed') perdidas++;
        else if (status === 'busy' || status === 'ocupado') ocupado++;
        else outras++;

        duracaoTotal += duracao;
        custoTotal   += custo;

        // Agrega por ramal originador
        const ext = String(r.src || r.extension || r.ramal || r.from || 'desconhecido');
        contagemRamal[ext] = (contagemRamal[ext] || 0) + 1;

        // Agrega por hora do dia
        const ts = r.calldate || r.start_time || r.created_at || r.date;
        if (ts) {
            const hora = new Date(ts).getHours();
            if (!isNaN(hora)) {
                const k = String(hora).padStart(2, '0') + 'h';
                contagemHora[k] = (contagemHora[k] || 0) + 1;
            }
        }
    }

    const taxaAtendimento = total > 0 ? ((atendidas / total) * 100).toFixed(1) : '0.0';
    const duracaoMedia = atendidas > 0 ? Math.round(duracaoTotal / atendidas) : 0;

    const topRamais = Object.entries(contagemRamal)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ext, qtd]) => ({ ramal: ext, chamadas: qtd }));

    const distribuicaoHora = Object.entries(contagemHora)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hora, qtd]) => ({ hora, chamadas: qtd }));

    return {
        periodo: { inicio: startDate || null, fim: endDate || null },
        ramal: ramal || null,
        resumo: { total, atendidas, perdidas, ocupado, outras, taxaAtendimento: `${taxaAtendimento}%` },
        duracao: {
            total: duracaoTotal,
            totalFormatado: formatarSegundos(duracaoTotal),
            media: duracaoMedia,
            mediaFormatado: formatarSegundos(duracaoMedia)
        },
        custo: {
            total: custoTotal.toFixed(2),
            moeda: 'BRL'
        },
        topRamais,
        distribuicaoHora
    };
}

function formatarSegundos(segundos) {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (h > 0) return `${h}h ${m}min ${s}s`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
}

function formatarParaWhatsApp(relatorio) {
    const r = relatorio;
    const periodo = r.periodo.inicio && r.periodo.fim
        ? `📅 *${formatarData(r.periodo.inicio)} → ${formatarData(r.periodo.fim)}*`
        : `📅 *Hoje*`;

    const ramalInfo = r.ramal ? `\n🔢 Ramal: *${r.ramal}*` : '';

    const topRamaisTexto = r.topRamais.length > 0
        ? r.topRamais.slice(0, 5)
            .map((t, i) => `  ${i + 1}. Ramal ${t.ramal}: ${t.chamadas} chamadas`)
            .join('\n')
        : '  Nenhum dado';

    const distHoraTexto = r.distribuicaoHora.length > 0
        ? r.distribuicaoHora
            .map(d => `  ${d.hora}: ${d.chamadas}`)
            .join('\n')
        : '  Nenhum dado';

    return [
        `🏢 *Relatório Microvox*`,
        periodo,
        ramalInfo,
        ``,
        `📊 *Resumo de Chamadas*`,
        `• Total: *${r.resumo.total}*`,
        `• ✅ Atendidas: *${r.resumo.atendidas}* (${r.resumo.taxaAtendimento})`,
        `• ❌ Perdidas: *${r.resumo.perdidas}*`,
        `• 🔴 Ocupado: *${r.resumo.ocupado}*`,
        ``,
        `⏱️ *Duração*`,
        `• Total: *${r.duracao.totalFormatado}*`,
        `• Média/chamada: *${r.duracao.mediaFormatado}*`,
        r.custo.total !== '0.00' ? `\n💰 *Custo Total: R$ ${r.custo.total}*` : '',
        ``,
        `📞 *Top Ramais*`,
        topRamaisTexto,
        ``,
        `🕐 *Distribuição por Hora*`,
        distHoraTexto,
        ``,
        `_Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_`
    ].filter(l => l !== '').join('\n');
}

function formatarData(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return d ? `${d}/${m}/${y}` : str;
}

module.exports = { gerarRelatorio, formatarParaWhatsApp };
