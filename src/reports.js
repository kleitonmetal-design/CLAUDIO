const STATUS_ATENDIDA = ['answered', 'atendida', 'answer', 'completed'];
const STATUS_NAO_ATENDIDA = ['no answer', 'noanswer', 'nao_atendida', 'missed', 'no_answer'];
const STATUS_OCUPADO = ['busy', 'ocupado'];

function formatarDuracao(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function gerarRelatorioChamadas(chamadas) {
  const total = chamadas.length;
  const atendidas = chamadas.filter(c => STATUS_ATENDIDA.includes(c.status)).length;
  const naoAtendidas = chamadas.filter(c => STATUS_NAO_ATENDIDA.includes(c.status)).length;
  const ocupado = chamadas.filter(c => STATUS_OCUPADO.includes(c.status)).length;
  const falha = Math.max(0, total - atendidas - naoAtendidas - ocupado);

  const duracaoTotal = chamadas.reduce((s, c) => s + c.duracao, 0);
  const duracaoMedia = atendidas > 0 ? Math.round(duracaoTotal / atendidas) : 0;
  const custoTotal = chamadas.reduce((s, c) => s + c.custo, 0);
  const taxaAtendimento = total > 0 ? ((atendidas / total) * 100).toFixed(1) : '0.0';

  const contagemRamal = {};
  chamadas.forEach(c => {
    if (c.ramal) contagemRamal[c.ramal] = (contagemRamal[c.ramal] || 0) + 1;
  });
  const topRamais = Object.entries(contagemRamal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ramal, qtd]) => ({ ramal, qtd }));

  const porHora = {};
  chamadas.forEach(c => {
    if (c.inicio) {
      const hora = new Date(c.inicio).getHours();
      if (!isNaN(hora)) porHora[hora] = (porHora[hora] || 0) + 1;
    }
  });

  return {
    resumo: {
      total,
      atendidas,
      naoAtendidas,
      ocupado,
      falha,
      taxaAtendimento: `${taxaAtendimento}%`
    },
    duracao: {
      totalSegundos: duracaoTotal,
      totalFormatado: formatarDuracao(duracaoTotal),
      mediaSegundos: duracaoMedia,
      mediaFormatada: formatarDuracao(duracaoMedia)
    },
    custo: {
      total: custoTotal.toFixed(2),
      moeda: 'BRL'
    },
    topRamais,
    distribuicaoPorHora: porHora,
    geradoEm: new Date().toISOString()
  };
}

function formatarRelatorioWhatsApp(relatorio, periodo = {}) {
  const { resumo, duracao, custo, topRamais } = relatorio;
  const periodoTexto = periodo.inicio && periodo.fim
    ? `*${periodo.inicio}* a *${periodo.fim}*`
    : 'período selecionado';

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  let texto = `📊 *RELATÓRIO DE CHAMADAS*\n`;
  texto += `🗓️ Período: ${periodoTexto}\n`;
  texto += `⏱️ Gerado: ${agora}\n\n`;

  texto += `📞 *RESUMO*\n`;
  texto += `• Total: *${resumo.total}*\n`;
  texto += `• ✅ Atendidas: *${resumo.atendidas}* (${resumo.taxaAtendimento})\n`;
  texto += `• ❌ Não atendidas: *${resumo.naoAtendidas}*\n`;
  texto += `• 🔴 Ocupado: *${resumo.ocupado}*\n`;
  if (resumo.falha > 0) texto += `• ⚠️ Falha: *${resumo.falha}*\n`;

  texto += `\n⏳ *DURAÇÃO*\n`;
  texto += `• Total em ligação: *${duracao.totalFormatado}*\n`;
  texto += `• Duração média: *${duracao.mediaFormatada}*\n`;

  if (Number(custo.total) > 0) {
    texto += `\n💰 *CUSTO TOTAL*: R$ *${custo.total}*\n`;
  }

  if (topRamais.length > 0) {
    texto += `\n📱 *TOP RAMAIS*\n`;
    topRamais.slice(0, 5).forEach((r, i) => {
      texto += `${i + 1}. Ramal ${r.ramal}: *${r.qtd}* chamada(s)\n`;
    });
  }

  return texto.trim();
}

module.exports = { gerarRelatorioChamadas, formatarRelatorioWhatsApp };
