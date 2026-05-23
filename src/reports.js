/**
 * Geração de relatórios em CSV e JSON a partir de dados do Microvox.
 */

/**
 * Converte array de objetos para CSV.
 */
function toCSV(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const escape = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
    };

    const lines = [
        headers.join(','),
        ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
    ];

    return lines.join('\r\n');
}

/**
 * Agrega chamadas por data (YYYY-MM-DD).
 */
function aggregateByDate(calls) {
    const byDate = {};

    for (const call of calls) {
        const date = (call.date || call.start_time || call.created_at || '').slice(0, 10);
        if (!date) continue;

        if (!byDate[date]) {
            byDate[date] = { date, total: 0, answered: 0, missed: 0, avgDurationSec: 0, _durationSum: 0 };
        }

        byDate[date].total++;

        const status = (call.status || call.disposition || '').toLowerCase();
        if (['answered', 'atendida', 'connected', 'completada'].includes(status)) {
            byDate[date].answered++;
        } else {
            byDate[date].missed++;
        }

        const duration = Number(call.duration || call.billsec || call.talk_time || 0);
        byDate[date]._durationSum += duration;
        byDate[date].avgDurationSec = Math.round(byDate[date]._durationSum / byDate[date].answered || 0);
    }

    return Object.values(byDate)
        .map(({ _durationSum, ...row }) => row)
        .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Agrega chamadas por agente/operador.
 */
function aggregateByAgent(calls) {
    const byAgent = {};

    for (const call of calls) {
        const agent = call.agent || call.operator || call.agent_name || call.dst || 'Desconhecido';

        if (!byAgent[agent]) {
            byAgent[agent] = { agent, total: 0, answered: 0, missed: 0, totalDurationSec: 0 };
        }

        byAgent[agent].total++;
        const status = (call.status || call.disposition || '').toLowerCase();
        if (['answered', 'atendida', 'connected', 'completada'].includes(status)) {
            byAgent[agent].answered++;
        } else {
            byAgent[agent].missed++;
        }
        byAgent[agent].totalDurationSec += Number(call.duration || call.billsec || 0);
    }

    return Object.values(byAgent).sort((a, b) => b.total - a.total);
}

/**
 * Agrega chamadas por fila/ramal.
 */
function aggregateByQueue(calls) {
    const byQueue = {};

    for (const call of calls) {
        const queue = call.queue || call.queue_name || call.extension || 'Desconhecido';

        if (!byQueue[queue]) {
            byQueue[queue] = { queue, total: 0, answered: 0, missed: 0, avgWaitSec: 0, _waitSum: 0 };
        }

        byQueue[queue].total++;
        const status = (call.status || call.disposition || '').toLowerCase();
        if (['answered', 'atendida', 'connected', 'completada'].includes(status)) {
            byQueue[queue].answered++;
        } else {
            byQueue[queue].missed++;
        }

        const wait = Number(call.wait_time || call.holdtime || call.wait || 0);
        byQueue[queue]._waitSum += wait;
        byQueue[queue].avgWaitSec = Math.round(byQueue[queue]._waitSum / byQueue[queue].total);
    }

    return Object.values(byQueue)
        .map(({ _waitSum, ...row }) => row)
        .sort((a, b) => b.total - a.total);
}

/**
 * Calcula sumário geral de uma lista de chamadas.
 */
function summarize(calls) {
    let answered = 0, missed = 0, totalDuration = 0;

    for (const call of calls) {
        const status = (call.status || call.disposition || '').toLowerCase();
        if (['answered', 'atendida', 'connected', 'completada'].includes(status)) {
            answered++;
            totalDuration += Number(call.duration || call.billsec || 0);
        } else {
            missed++;
        }
    }

    const total = calls.length;
    const attendanceRate = total > 0 ? ((answered / total) * 100).toFixed(1) : '0.0';
    const avgDuration = answered > 0 ? Math.round(totalDuration / answered) : 0;

    return {
        total,
        answered,
        missed,
        attendanceRate: `${attendanceRate}%`,
        avgDurationSec: avgDuration,
        avgDurationMin: (avgDuration / 60).toFixed(1),
    };
}

/**
 * Gera relatório completo estruturado.
 */
function generateReport(calls, { startDate, endDate } = {}) {
    const summary = summarize(calls);
    const byDate = aggregateByDate(calls);
    const byAgent = aggregateByAgent(calls);
    const byQueue = aggregateByQueue(calls);

    return {
        meta: {
            generatedAt: new Date().toISOString(),
            startDate: startDate || null,
            endDate: endDate || null,
            totalRecords: calls.length,
        },
        summary,
        byDate,
        byAgent,
        byQueue,
    };
}

/**
 * Gera CSV de chamadas individuais.
 */
function generateCallsCSV(calls) {
    return toCSV(calls);
}

/**
 * Gera CSV do sumário por data.
 */
function generateDateSummaryCSV(calls) {
    return toCSV(aggregateByDate(calls));
}

/**
 * Gera CSV do sumário por agente.
 */
function generateAgentSummaryCSV(calls) {
    return toCSV(aggregateByAgent(calls));
}

/**
 * Gera texto formatado para envio via WhatsApp.
 */
function generateWhatsAppSummary(calls, { startDate, endDate } = {}) {
    const s = summarize(calls);
    const period = startDate && endDate ? `${startDate} a ${endDate}` : 'período selecionado';

    return [
        `📊 *Relatório Microvox* — ${period}`,
        '',
        `📞 Total de chamadas: ${s.total}`,
        `✅ Atendidas: ${s.answered} (${s.attendanceRate})`,
        `❌ Perdidas: ${s.missed}`,
        `⏱ Duração média: ${s.avgDurationMin} min`,
        '',
        `_Gerado em ${new Date().toLocaleString('pt-BR')}_`,
    ].join('\n');
}

module.exports = {
    toCSV,
    summarize,
    aggregateByDate,
    aggregateByAgent,
    aggregateByQueue,
    generateReport,
    generateCallsCSV,
    generateDateSummaryCSV,
    generateAgentSummaryCSV,
    generateWhatsAppSummary,
};
