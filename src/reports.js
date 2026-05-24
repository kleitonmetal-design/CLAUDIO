function segundosParaHMS(segundos) {
    const s = Math.floor(segundos || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${m}m ${ss}s`;
    if (m > 0) return `${m}m ${ss}s`;
    return `${ss}s`;
}

function calcularMetricas(chamadas) {
    const lista = Array.isArray(chamadas) ? chamadas : (chamadas.chamadas || chamadas.data || []);
    const total = lista.length;
    const atendidas = lista.filter(c => c.status === 'atendida' || c.atendida === true).length;
    const perdidas = lista.filter(c => c.status === 'perdida' || c.atendida === false).length;
    const durTotal = lista.reduce((acc, c) => acc + (c.duracao || c.duration || 0), 0);
    const durMedia = total > 0 ? Math.floor(durTotal / total) : 0;

    const entrantes = lista.filter(c => c.tipo === 'entrante' || c.direction === 'inbound').length;
    const saintes = lista.filter(c => c.tipo === 'sainte' || c.direction === 'outbound').length;

    const taxaAtendimento = total > 0 ? Math.round((atendidas / total) * 100) : 0;

    return { total, atendidas, perdidas, entrantes, saintes, durTotal, durMedia, taxaAtendimento };
}

function gerarRelatorioTexto(dados, opcoes = {}) {
    const { periodo, ramal } = opcoes;
    const m = calcularMetricas(dados);

    const linhas = [
        `📊 *RELATÓRIO MICRIVOX*`,
        periodo ? `📅 Período: ${periodo}` : '',
        ramal ? `🔢 Ramal: ${ramal}` : '',
        ``,
        `📞 *Chamadas*`,
        `• Total: ${m.total}`,
        `• Atendidas: ${m.atendidas} ✅`,
        `• Perdidas: ${m.perdidas} ❌`,
        `• Taxa de atendimento: ${m.taxaAtendimento}%`,
        ``,
        `↕️ *Direção*`,
        `• Entrantes: ${m.entrantes}`,
        `• Saintes: ${m.saintes}`,
        ``,
        `⏱️ *Duração*`,
        `• Total em ligação: ${segundosParaHMS(m.durTotal)}`,
        `• Duração média: ${segundosParaHMS(m.durMedia)}`,
        ``,
        `🕐 Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    ];

    return linhas.filter(l => l !== null && l !== undefined).join('\n');
}

function gerarRelatorioDeResumo(resumo, opcoes = {}) {
    const { periodo } = opcoes;

    if (!resumo || typeof resumo !== 'object') {
        return '❌ Nenhum dado de resumo disponível.';
    }

    const linhas = [
        `📊 *RELATÓRIO RESUMO MICRIVOX*`,
        periodo ? `📅 Período: ${periodo}` : '',
        ``,
    ];

    const mapeamento = {
        total_chamadas: '📞 Total de chamadas',
        chamadas_atendidas: '✅ Chamadas atendidas',
        chamadas_perdidas: '❌ Chamadas perdidas',
        tempo_total: '⏱️ Tempo total (s)',
        tempo_medio: '⏱️ Tempo médio (s)',
        taxa_atendimento: '📈 Taxa de atendimento',
    };

    for (const [chave, label] of Object.entries(mapeamento)) {
        if (resumo[chave] !== undefined) {
            linhas.push(`• ${label}: ${resumo[chave]}`);
        }
    }

    linhas.push('');
    linhas.push(`🕐 Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

    return linhas.filter(l => l !== null).join('\n');
}

module.exports = { gerarRelatorioTexto, gerarRelatorioDeResumo, calcularMetricas };
