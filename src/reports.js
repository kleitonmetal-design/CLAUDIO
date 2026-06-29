const { getChamadas } = require('./microvox');

function calcularDuracaoMedia(chamadas) {
    const comDuracao = chamadas.filter(c => {
        const dur = c.duration || c.duracao || c.call_duration || 0;
        return Number(dur) > 0;
    });
    if (!comDuracao.length) return 0;
    const total = comDuracao.reduce((acc, c) => {
        return acc + Number(c.duration || c.duracao || c.call_duration || 0);
    }, 0);
    return Math.round(total / comDuracao.length);
}

function formatarDuracao(segundos) {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function calcularTopRamais(chamadas, limite = 5) {
    const contagem = {};
    for (const c of chamadas) {
        const ramal = c.extension || c.ramal || c.src || c.source || 'desconhecido';
        contagem[ramal] = (contagem[ramal] || 0) + 1;
    }
    return Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limite)
        .map(([ramal, total]) => ({ ramal, total }));
}

function calcularDistribuicaoHora(chamadas) {
    const dist = {};
    for (const c of chamadas) {
        const ts = c.start_time || c.datetime || c.created_at || c.data;
        if (!ts) continue;
        const hora = new Date(ts).getHours();
        if (!isNaN(hora)) dist[hora] = (dist[hora] || 0) + 1;
    }
    return dist;
}

function normalizarStatus(c) {
    const status = (c.status || c.disposition || c.resultado || '').toLowerCase();
    if (['answered', 'atendida', 'connected', 'success', 'ok'].some(s => status.includes(s))) return 'atendida';
    if (['no answer', 'noanswer', 'perdida', 'missed', 'no_answer'].some(s => status.includes(s))) return 'perdida';
    if (['busy', 'ocupado', 'congestion'].some(s => status.includes(s))) return 'ocupado';
    return 'outra';
}

function analisarChamadas(chamadas) {
    let atendidas = 0, perdidas = 0, ocupado = 0, outras = 0;
    let duracaoTotal = 0;
    let custoTotal = 0;

    for (const c of chamadas) {
        const status = normalizarStatus(c);
        if (status === 'atendida') atendidas++;
        else if (status === 'perdida') perdidas++;
        else if (status === 'ocupado') ocupado++;
        else outras++;

        duracaoTotal += Number(c.duration || c.duracao || c.call_duration || 0);
        custoTotal += Number(c.cost || c.custo || c.valor || 0);
    }

    const total = chamadas.length;
    const taxaAtendimento = total > 0 ? ((atendidas / total) * 100).toFixed(1) : '0.0';
    const duracaoMedia = calcularDuracaoMedia(chamadas);
    const topRamais = calcularTopRamais(chamadas);
    const distribuicaoPorHora = calcularDistribuicaoHora(chamadas);

    return {
        total,
        atendidas,
        perdidas,
        ocupado,
        outras,
        taxaAtendimento: parseFloat(taxaAtendimento),
        duracaoTotal,
        duracaoMedia,
        custoTotal: parseFloat(custoTotal.toFixed(2)),
        topRamais,
        distribuicaoPorHora
    };
}

function formatarRelatorioWhatsApp(relatorio, startDate, endDate) {
    const { total, atendidas, perdidas, ocupado, taxaAtendimento,
            duracaoTotal, duracaoMedia, custoTotal, topRamais, distribuicaoPorHora } = relatorio;

    const horasPico = Object.entries(distribuicaoPorHora)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([h, n]) => `${h}h (${n})`)
        .join(', ');

    const topRamaisTexto = topRamais
        .map((r, i) => `  ${i + 1}. Ramal ${r.ramal}: ${r.total} chamadas`)
        .join('\n');

    return `*📞 Relatório de Chamadas — Microvox*
Período: ${startDate} a ${endDate}

*Resumo Geral*
Total de chamadas: *${total}*
✅ Atendidas: *${atendidas}*
❌ Perdidas: *${perdidas}*
🔴 Ocupado: *${ocupado}*
Taxa de atendimento: *${taxaAtendimento}%*

*Duração*
Total: *${formatarDuracao(duracaoTotal)}*
Média por chamada: *${formatarDuracao(duracaoMedia)}*
${custoTotal > 0 ? `Custo estimado: *R$ ${custoTotal.toFixed(2)}*` : ''}

*Top Ramais*
${topRamaisTexto || '  Sem dados de ramais'}

*Horários de Pico*
${horasPico || 'Sem dados suficientes'}

_Gerado automaticamente pelo Claudio_`;
}

async function gerarRelatorio(startDate, endDate, ramal = null) {
    const chamadas = await getChamadas(startDate, endDate, ramal);
    const analise = analisarChamadas(chamadas);
    const mensagemWhatsApp = formatarRelatorioWhatsApp(analise, startDate, endDate);

    return {
        periodo: { startDate, endDate },
        ramal: ramal || null,
        dados: analise,
        chamadas,
        mensagemWhatsApp
    };
}

async function gerarResumoDia() {
    const hoje = new Date().toISOString().split('T')[0];
    return gerarRelatorio(hoje, hoje);
}

module.exports = { gerarRelatorio, gerarResumoDia, analisarChamadas, formatarRelatorioWhatsApp };
