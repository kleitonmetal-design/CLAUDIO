/**
 * Formata segundos em string legível (ex: 1h 23min 45s).
 */
function formatarDuracao(segundos) {
    if (!segundos || isNaN(segundos)) return '0s';
    const s = Math.round(Number(segundos));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const partes = [];
    if (h > 0) partes.push(`${h}h`);
    if (m > 0) partes.push(`${m}min`);
    if (sec > 0 || partes.length === 0) partes.push(`${sec}s`);
    return partes.join(' ');
}

/**
 * Formata data no padrão brasileiro (DD/MM/AAAA).
 */
function formatarData(date) {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Extrai métricas de chamadas do payload da Microvox.
 * Suporta diferentes formatos de resposta.
 */
function extrairMetricasChamadas(dados) {
    if (!dados) return null;

    const lista = dados.data || dados.chamadas || dados.calls || dados.records || dados || [];
    const registros = Array.isArray(lista) ? lista : [];

    const total = registros.length || dados.total || dados.total_calls || 0;
    const atendidas = registros.filter(c =>
        (c.status || c.situacao || '').toLowerCase() === 'atendida' ||
        (c.answered === true) || (c.status === 'answered')
    ).length || dados.answered || dados.atendidas || 0;

    const perdidas = registros.filter(c =>
        (c.status || c.situacao || '').toLowerCase() === 'perdida' ||
        (c.answered === false) || (c.status === 'missed') || (c.status === 'abandoned')
    ).length || dados.missed || dados.perdidas || 0;

    const duracoes = registros
        .map(c => Number(c.duracao || c.duration || c.talk_time || 0))
        .filter(d => d > 0);

    const tmaMedio = duracoes.length > 0
        ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
        : Number(dados.tma || dados.avg_duration || 0);

    const taxaAtendimento = total > 0 ? Math.round((atendidas / total) * 100) : 0;

    return { total, atendidas, perdidas, tmaMedio, taxaAtendimento };
}

/**
 * Extrai métricas de filas do payload da Microvox.
 */
function extrairMetricasFilas(dados) {
    if (!dados) return null;

    const lista = dados.data || dados.filas || dados.queues || dados || [];
    const filas = Array.isArray(lista) ? lista : [];

    return filas.map(f => ({
        nome: f.nome || f.name || f.queue || 'Sem nome',
        totalChamadas: Number(f.total || f.total_calls || f.calls || 0),
        atendidas: Number(f.atendidas || f.answered || 0),
        abandonadas: Number(f.abandonadas || f.abandoned || f.missed || 0),
        tmeMedio: Number(f.tme || f.avg_wait || f.avg_wait_time || 0),
        tmaMedio: Number(f.tma || f.avg_talk || f.avg_talk_time || 0),
        nivel_servico: Number(f.nivel_servico || f.service_level || 0),
    }));
}

/**
 * Extrai métricas de agentes do payload da Microvox.
 */
function extrairMetricasAgentes(dados) {
    if (!dados) return null;

    const lista = dados.data || dados.agentes || dados.agents || dados || [];
    const agentes = Array.isArray(lista) ? lista : [];

    return agentes
        .map(a => ({
            nome: a.nome || a.name || a.agent || 'Desconhecido',
            chamadas: Number(a.chamadas || a.calls || a.total_calls || 0),
            atendidas: Number(a.atendidas || a.answered || 0),
            tmaMedio: Number(a.tma || a.avg_talk || a.avg_talk_time || 0),
            loginTime: Number(a.login_time || a.tempo_logado || 0),
        }))
        .sort((a, b) => b.chamadas - a.chamadas);
}

/**
 * Gera relatório diário completo em texto formatado para WhatsApp.
 * @param {{chamadas, filas, agentes, erros}} dadosDiarios
 * @param {Date|string} [data]
 * @returns {string}
 */
function gerarRelatorioDiario(dadosDiarios, data) {
    const { chamadas, filas, agentes, erros } = dadosDiarios;
    const dataRef = formatarData(data);
    const linhas = [];

    linhas.push(`*📊 Relatório Diário — ${dataRef}*`);
    linhas.push(`_Gerado em: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_`);
    linhas.push('');

    // Resumo de chamadas
    const mc = extrairMetricasChamadas(chamadas);
    if (mc) {
        linhas.push('*📞 Resumo de Chamadas*');
        linhas.push(`• Total recebidas: *${mc.total}*`);
        linhas.push(`• Atendidas: *${mc.atendidas}* (${mc.taxaAtendimento}%)`);
        linhas.push(`• Perdidas/Abandonadas: *${mc.perdidas}*`);
        linhas.push(`• TMA médio: *${formatarDuracao(mc.tmaMedio)}*`);
        linhas.push('');
    }

    // Filas de atendimento
    const mf = extrairMetricasFilas(filas);
    if (mf && mf.length > 0) {
        linhas.push('*🗂️ Filas de Atendimento*');
        mf.forEach(f => {
            const taxa = f.totalChamadas > 0
                ? Math.round((f.atendidas / f.totalChamadas) * 100)
                : 0;
            linhas.push(`\n*${f.nome}*`);
            linhas.push(`  • Chamadas: ${f.totalChamadas} | Atendidas: ${f.atendidas} (${taxa}%)`);
            linhas.push(`  • Abandonadas: ${f.abandonadas}`);
            if (f.tmeMedio) linhas.push(`  • TME: ${formatarDuracao(f.tmeMedio)}`);
            if (f.tmaMedio) linhas.push(`  • TMA: ${formatarDuracao(f.tmaMedio)}`);
            if (f.nivel_servico) linhas.push(`  • Nível de Serviço: ${f.nivel_servico}%`);
        });
        linhas.push('');
    }

    // Top agentes
    const ma = extrairMetricasAgentes(agentes);
    if (ma && ma.length > 0) {
        linhas.push('*👤 Performance dos Agentes*');
        const top = ma.slice(0, 5);
        top.forEach((a, i) => {
            linhas.push(`${i + 1}. *${a.nome}* — ${a.chamadas} chamadas | TMA: ${formatarDuracao(a.tmaMedio)}`);
        });
        if (ma.length > 5) {
            linhas.push(`_...e mais ${ma.length - 5} agente(s)_`);
        }
        linhas.push('');
    }

    // Erros (se houver)
    if (erros && erros.length > 0) {
        linhas.push('_⚠️ Alguns dados não puderam ser carregados._');
    }

    linhas.push('_Fonte: Microvox_');

    return linhas.join('\n');
}

/**
 * Gera relatório em formato JSON estruturado (para integrações).
 * @param {{chamadas, filas, agentes}} dadosDiarios
 * @param {Date|string} [data]
 * @returns {Object}
 */
function gerarRelatorioJSON(dadosDiarios, data) {
    const { chamadas, filas, agentes } = dadosDiarios;
    return {
        data: formatarData(data),
        geradoEm: new Date().toISOString(),
        chamadas: extrairMetricasChamadas(chamadas),
        filas: extrairMetricasFilas(filas),
        agentes: extrairMetricasAgentes(agentes),
    };
}

module.exports = {
    gerarRelatorioDiario,
    gerarRelatorioJSON,
    formatarDuracao,
    formatarData,
};
