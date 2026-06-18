function gerarRelatorio(chamadas, opcoes = {}) {
  const { ramal } = opcoes;
  const lista = ramal
    ? chamadas.filter((c) => {
        const ext = c.extension || c.ramal || c.src || c.dst || '';
        return String(ext) === String(ramal);
      })
    : chamadas;

  const total = lista.length;
  if (total === 0) {
    return {
      total: 0,
      atendidas: 0,
      naoAtendidas: 0,
      ocupado: 0,
      falha: 0,
      taxaAtendimento: 0,
      duracaoTotalSeg: 0,
      duracaoMediaSeg: 0,
      custo: 0,
      topRamais: [],
      porHora: {},
      chamadas: [],
    };
  }

  let atendidas = 0, naoAtendidas = 0, ocupado = 0, falha = 0;
  let duracaoTotal = 0, custo = 0;
  const contagemRamais = {};
  const porHora = {};

  lista.forEach((c) => {
    const status = (c.status || c.disposition || c.estado || '').toUpperCase();
    if (status === 'ANSWERED' || status === 'ATENDIDA' || status === 'ATENDIDO') atendidas++;
    else if (status === 'NO ANSWER' || status === 'NAO_ATENDIDA' || status === 'PERDIDA') naoAtendidas++;
    else if (status === 'BUSY' || status === 'OCUPADO') ocupado++;
    else falha++;

    const dur = Number(c.duration || c.duracao || c.billsec || 0);
    duracaoTotal += dur;

    const valor = Number(c.cost || c.custo || c.valor || 0);
    custo += valor;

    const ext = String(c.extension || c.ramal || c.src || c.dst || 'N/A');
    contagemRamais[ext] = (contagemRamais[ext] || 0) + 1;

    const dtStr = c.start_time || c.data_hora || c.calldate || c.timestamp;
    if (dtStr) {
      try {
        const hora = new Date(dtStr).getHours();
        if (!isNaN(hora)) porHora[hora] = (porHora[hora] || 0) + 1;
      } catch {}
    }
  });

  const topRamais = Object.entries(contagemRamais)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, qtd]) => ({ ramal: ext, chamadas: qtd }));

  return {
    total,
    atendidas,
    naoAtendidas,
    ocupado,
    falha,
    taxaAtendimento: total > 0 ? Math.round((atendidas / total) * 100) : 0,
    duracaoTotalSeg: duracaoTotal,
    duracaoMediaSeg: total > 0 ? Math.round(duracaoTotal / total) : 0,
    custo: Math.round(custo * 100) / 100,
    topRamais,
    porHora,
    chamadas: lista,
  };
}

function segs(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h > 0) return `${h}h ${m}m ${seg}s`;
  if (m > 0) return `${m}m ${seg}s`;
  return `${seg}s`;
}

function formatarParaWhatsApp(relatorio, periodo = {}) {
  const { startDate, endDate } = periodo;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const cabecalho = startDate && endDate
    ? `📊 *Relatório de Chamadas*\n📅 ${startDate} a ${endDate}`
    : `📊 *Relatório de Chamadas*\n📅 ${hoje}`;

  const linhas = [
    cabecalho,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    `📞 *Total:* ${relatorio.total}`,
    `✅ *Atendidas:* ${relatorio.atendidas} (${relatorio.taxaAtendimento}%)`,
    `❌ *Não atendidas:* ${relatorio.naoAtendidas}`,
    `🔴 *Ocupado:* ${relatorio.ocupado}`,
    `⚠️ *Falha:* ${relatorio.falha}`,
    '',
    `⏱️ *Duração total:* ${segs(relatorio.duracaoTotalSeg)}`,
    `📈 *Duração média:* ${segs(relatorio.duracaoMediaSeg)}`,
  ];

  if (relatorio.custo > 0) {
    linhas.push(`💰 *Custo:* R$ ${relatorio.custo.toFixed(2)}`);
  }

  if (relatorio.topRamais.length > 0) {
    linhas.push('', '━━━━━━━━━━━━━━━━━━━━', '📟 *Top Ramais:*');
    relatorio.topRamais.slice(0, 5).forEach((r, i) => {
      linhas.push(`   ${i + 1}. Ramal ${r.ramal}: ${r.chamadas} chamada(s)`);
    });
  }

  if (Object.keys(relatorio.porHora).length > 0) {
    linhas.push('', '━━━━━━━━━━━━━━━━━━━━', '🕐 *Pico de chamadas:*');
    const horasPico = Object.entries(relatorio.porHora)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    horasPico.forEach(([h, qtd]) => {
      linhas.push(`   ${String(h).padStart(2, '0')}:00h → ${qtd} chamada(s)`);
    });
  }

  linhas.push('', '_Gerado por Claudio API_');
  return linhas.join('\n');
}

function formatarResumoDiario(relatorio) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  return [
    `📊 *Resumo do dia ${hoje}*`,
    `📞 Total: ${relatorio.total} | ✅ ${relatorio.atendidas} | ❌ ${relatorio.naoAtendidas}`,
    `✔️ Taxa: ${relatorio.taxaAtendimento}% | ⏱️ Média: ${segs(relatorio.duracaoMediaSeg)}`,
  ].join('\n');
}

module.exports = { gerarRelatorio, formatarParaWhatsApp, formatarResumoDiario };
