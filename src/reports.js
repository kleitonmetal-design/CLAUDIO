const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

function ensureReportsDir() {
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
}

function formatarSegundos(segundos) {
    const s = Math.abs(parseInt(segundos, 10) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

function escaparCSV(valor) {
    const str = (valor === null || valor === undefined) ? '' : String(valor);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function gerarCSV(dados, campos, labels) {
    if (!dados || dados.length === 0) return '';
    const header = labels ? labels.join(',') : campos.join(',');
    const linhas = dados.map(row => campos.map(c => escaparCSV(row[c])).join(','));
    return [header, ...linhas].join('\n');
}

function calcularEstatisticasCDR(dados) {
    if (!dados || dados.length === 0) return {};
    const total = dados.length;
    const atendidas = dados.filter(r => ['ANSWERED', 'atendida', 'answered'].includes((r.status || '').toLowerCase())).length;
    const naoAtendidas = total - atendidas;
    const duracaoTotal = dados.reduce((acc, r) => acc + (parseInt(r.duracao_segundos, 10) || 0), 0);
    const tmaMedio = atendidas > 0 ? Math.round(duracaoTotal / atendidas) : 0;
    return { total, atendidas, naoAtendidas, duracaoTotal, tmaMedio };
}

function calcularEstatisticasAgentes(dados) {
    if (!dados || dados.length === 0) return {};
    const totalChamadas = dados.reduce((acc, r) => acc + (r.total_chamadas || 0), 0);
    const totalAtendidas = dados.reduce((acc, r) => acc + (r.chamadas_atendidas || 0), 0);
    const tmaGeral = dados.length > 0
        ? Math.round(dados.reduce((acc, r) => acc + (r.tma_segundos || 0), 0) / dados.length)
        : 0;
    return { totalAgentes: dados.length, totalChamadas, totalAtendidas, tmaGeral };
}

function calcularEstatisticasFilas(dados) {
    if (!dados || dados.length === 0) return {};
    const totalChamadas = dados.reduce((acc, r) => acc + (r.total_chamadas || 0), 0);
    const totalAtendidas = dados.reduce((acc, r) => acc + (r.atendidas || 0), 0);
    const totalAbandonadas = dados.reduce((acc, r) => acc + (r.abandonadas || 0), 0);
    const nivelServicoMedio = dados.length > 0
        ? (dados.reduce((acc, r) => acc + (r.nivel_servico_percentual || 0), 0) / dados.length).toFixed(1)
        : 0;
    return { totalFilas: dados.length, totalChamadas, totalAtendidas, totalAbandonadas, nivelServicoMedio };
}

function gerarHTMLRelatorio(titulo, periodo, secoes) {
    const agora = new Date().toLocaleString('pt-BR');

    const secoesHTML = secoes.map(({ nome, stats, statLabels, formatarStats, tabela, campos, labels, formatarColunas }) => {
        const statsHTML = stats && statLabels ? Object.entries(stats).map(([k, v]) => {
            const label = statLabels[k] || k;
            const valor = formatarStats && formatarStats[k] ? formatarStats[k](v) : v;
            return `<div class="stat-card"><div class="stat-value">${valor}</div><div class="stat-label">${label}</div></div>`;
        }).join('') : '';

        const theadHTML = labels ? `<tr>${labels.map(l => `<th>${l}</th>`).join('')}</tr>` : '';
        const tbodyHTML = tabela && tabela.length > 0 ? tabela.map(row =>
            `<tr>${campos.map(c => {
                let val = row[c] !== undefined ? row[c] : '';
                if (formatarColunas && formatarColunas[c]) val = formatarColunas[c](val);
                return `<td>${val}</td>`;
            }).join('')}</tr>`
        ).join('') : `<tr><td colspan="${campos ? campos.length : 1}" class="empty">Sem dados para o período</td></tr>`;

        return `
        <section>
            <h2>${nome}</h2>
            ${statsHTML ? `<div class="stats-grid">${statsHTML}</div>` : ''}
            <div class="table-wrapper">
                <table>
                    <thead>${theadHTML}</thead>
                    <tbody>${tbodyHTML}</tbody>
                </table>
            </div>
        </section>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f6f9; color: #333; }
  header { background: #1a3c5e; color: #fff; padding: 24px 32px; }
  header h1 { font-size: 1.6rem; font-weight: 700; }
  header p { font-size: 0.9rem; opacity: 0.8; margin-top: 4px; }
  main { max-width: 1200px; margin: 24px auto; padding: 0 24px; }
  section { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); padding: 24px; margin-bottom: 24px; }
  section h2 { font-size: 1.1rem; color: #1a3c5e; border-bottom: 2px solid #e8ecf0; padding-bottom: 12px; margin-bottom: 20px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #f0f4f8; border-radius: 6px; padding: 16px; text-align: center; }
  .stat-value { font-size: 1.6rem; font-weight: 700; color: #1a3c5e; }
  .stat-label { font-size: 0.78rem; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .table-wrapper { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { background: #1a3c5e; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; white-space: nowrap; }
  td { padding: 9px 12px; border-bottom: 1px solid #eef0f3; }
  tr:hover td { background: #f8fafc; }
  .empty { text-align: center; color: #999; padding: 32px; }
  footer { text-align: center; color: #999; font-size: 0.8rem; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>${titulo}</h1>
  <p>Período: ${periodo} &nbsp;|&nbsp; Gerado em: ${agora}</p>
</header>
<main>
${secoesHTML}
</main>
<footer>Relatório gerado automaticamente pelo sistema Claudio &middot; Microvox</footer>
</body>
</html>`;
}

function salvarRelatorio(nome, conteudo) {
    ensureReportsDir();
    const filepath = path.join(REPORTS_DIR, nome);
    fs.writeFileSync(filepath, conteudo, 'utf8');
    return filepath;
}

function listarRelatorios() {
    ensureReportsDir();
    return fs.readdirSync(REPORTS_DIR)
        .filter(f => f.endsWith('.csv') || f.endsWith('.html'))
        .map(f => {
            const stat = fs.statSync(path.join(REPORTS_DIR, f));
            return { arquivo: f, tamanho: stat.size, criado_em: stat.birthtime.toISOString() };
        })
        .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
}

function lerRelatorio(nome) {
    ensureReportsDir();
    const filepath = path.join(REPORTS_DIR, nome);
    if (!fs.existsSync(filepath)) return null;
    return { conteudo: fs.readFileSync(filepath, 'utf8'), filepath };
}

module.exports = {
    gerarCSV,
    gerarHTMLRelatorio,
    calcularEstatisticasCDR,
    calcularEstatisticasAgentes,
    calcularEstatisticasFilas,
    salvarRelatorio,
    listarRelatorios,
    lerRelatorio,
    formatarSegundos
};
