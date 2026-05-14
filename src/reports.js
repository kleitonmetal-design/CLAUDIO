/**
 * Duração em segundos para string legível (ex: 01h 23m 45s)
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${String(h).padStart(2, '0')}h`);
    if (m > 0 || h > 0) parts.push(`${String(m).padStart(2, '0')}m`);
    parts.push(`${String(s).padStart(2, '0')}s`);
    return parts.join(' ');
}

/**
 * Determina a disposição (status) de uma chamada, normalizando diferentes formatos.
 */
function getDisposition(record) {
    const raw = (record.disposition || record.status || record.state || '').toUpperCase();
    if (raw.includes('ANSWER')) return 'ATENDIDA';
    if (raw.includes('BUSY')) return 'OCUPADO';
    if (raw.includes('NO ANSWER') || raw === 'NOANSWER') return 'NÃO ATENDIDA';
    if (raw.includes('FAIL')) return 'FALHA';
    return raw || 'DESCONHECIDA';
}

/**
 * Extrai o ramal/número de origem de um registro CDR.
 */
function getSource(record) {
    return record.src || record.caller || record.from || record.callerid || 'Desconhecido';
}

/**
 * Extrai o destino de um registro CDR.
 */
function getDestination(record) {
    return record.dst || record.destination || record.to || record.called || 'Desconhecido';
}

/**
 * Extrai a duração efetiva (tempo falando) de um registro CDR.
 */
function getBillsec(record) {
    return parseInt(record.billsec || record.talk_time || record.duration_talk || 0, 10);
}

/**
 * Extrai a duração total (incluindo toque) de um registro CDR.
 */
function getTotalDuration(record) {
    return parseInt(record.duration || record.total_duration || 0, 10);
}

/**
 * Processa uma lista de registros CDR e retorna um objeto de relatório estruturado.
 * @param {Array} records - Registros CDR do Micrivox
 * @param {Object} options
 * @param {string} options.startDate
 * @param {string} options.endDate
 * @returns {Object} Relatório estruturado
 */
function generateCDRReport(records, { startDate, endDate } = {}) {
    if (!Array.isArray(records) || records.length === 0) {
        return {
            periodo: { inicio: startDate, fim: endDate },
            resumo: { total: 0, atendidas: 0, naoAtendidas: 0, ocupado: 0, falha: 0 },
            duracao: { totalSegundos: 0, mediaSegundos: 0 },
            custo: { total: 0 },
            porRamal: [],
            porHora: {},
            geradoEm: new Date().toISOString(),
        };
    }

    let atendidas = 0;
    let naoAtendidas = 0;
    let ocupado = 0;
    let falha = 0;
    let totalBillsec = 0;
    let totalCusto = 0;

    const porRamal = {};
    const porHora = {};

    for (const rec of records) {
        const disposicao = getDisposition(rec);
        const src = getSource(rec);
        const billsec = getBillsec(rec);
        const duration = getTotalDuration(rec);
        const custo = parseFloat(rec.cost || rec.valor || rec.price || 0);

        // Contagem por disposição
        if (disposicao === 'ATENDIDA') atendidas++;
        else if (disposicao === 'NÃO ATENDIDA') naoAtendidas++;
        else if (disposicao === 'OCUPADO') ocupado++;
        else falha++;

        totalBillsec += billsec;
        totalCusto += custo;

        // Agrupamento por ramal de origem
        if (!porRamal[src]) {
            porRamal[src] = { ramal: src, total: 0, atendidas: 0, duracaoSegundos: 0, custo: 0 };
        }
        porRamal[src].total++;
        if (disposicao === 'ATENDIDA') porRamal[src].atendidas++;
        porRamal[src].duracaoSegundos += billsec;
        porRamal[src].custo += custo;

        // Agrupamento por hora do dia
        const hora = extrairHora(rec);
        if (hora !== null) {
            if (!porHora[hora]) porHora[hora] = 0;
            porHora[hora]++;
        }
    }

    const total = records.length;
    const ramaisOrdenados = Object.values(porRamal)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    return {
        periodo: { inicio: startDate, fim: endDate },
        resumo: { total, atendidas, naoAtendidas, ocupado, falha },
        duracao: {
            totalSegundos: totalBillsec,
            mediaSegundos: total > 0 ? Math.round(totalBillsec / atendidas || 0) : 0,
        },
        custo: { total: parseFloat(totalCusto.toFixed(2)) },
        porRamal: ramaisOrdenados,
        porHora,
        geradoEm: new Date().toISOString(),
    };
}

/**
 * Extrai a hora (0–23) de um registro CDR.
 */
function extrairHora(record) {
    const raw = record.calldate || record.start_time || record.datetime || record.date || null;
    if (!raw) return null;
    try {
        return new Date(raw).getHours();
    } catch {
        return null;
    }
}

/**
 * Formata o relatório estruturado como texto para envio via WhatsApp.
 * @param {Object} report - Retorno de generateCDRReport
 * @returns {string}
 */
function formatReportForWhatsApp(report) {
    const { periodo, resumo, duracao, custo, porRamal } = report;

    const taxaAtendimento = resumo.total > 0
        ? ((resumo.atendidas / resumo.total) * 100).toFixed(1)
        : '0.0';

    const linhas = [
        `*RELATÓRIO DE LIGAÇÕES - MICRIVOX*`,
        `Período: ${periodo.inicio || '?'} a ${periodo.fim || '?'}`,
        ``,
        `*RESUMO GERAL*`,
        `Total de chamadas: ${resumo.total}`,
        `Atendidas: ${resumo.atendidas} (${taxaAtendimento}%)`,
        `Não atendidas: ${resumo.naoAtendidas}`,
        `Ocupado: ${resumo.ocupado}`,
        `Falhas: ${resumo.falha}`,
        ``,
        `*DURAÇÃO*`,
        `Tempo total (falando): ${formatDuration(duracao.totalSegundos)}`,
        `Média por atendida: ${formatDuration(duracao.mediaSegundos)}`,
    ];

    if (custo.total > 0) {
        linhas.push(``, `*CUSTO*`, `Total: R$ ${custo.total.toFixed(2)}`);
    }

    if (porRamal.length > 0) {
        linhas.push(``, `*TOP RAMAIS*`);
        porRamal.slice(0, 5).forEach((r, i) => {
            linhas.push(
                `${i + 1}. Ramal ${r.ramal}: ${r.total} chamadas (${r.atendidas} atendidas) — ${formatDuration(r.duracaoSegundos)}`
            );
        });
    }

    linhas.push(``, `_Gerado em: ${new Date(report.geradoEm).toLocaleString('pt-BR')}_`);

    return linhas.join('\n');
}

module.exports = { generateCDRReport, formatReportForWhatsApp, formatDuration };
