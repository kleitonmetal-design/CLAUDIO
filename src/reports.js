'use strict';

const { getVendas, getProdutos, getClientes, getEstoque, periodoParaDatas } = require('./microvix');

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function gerarRelatorioVendas(periodo = 'hoje') {
  const { dataInicio, dataFim } = periodoParaDatas(periodo);
  const dados = await getVendas(dataInicio, dataFim);
  const vendas = Array.isArray(dados) ? dados : dados.vendas || dados.data || [];

  const totalVendas = vendas.length;
  const faturamento = vendas.reduce((s, v) => s + Number(v.valorTotal || v.total || 0), 0);
  const descontos   = vendas.reduce((s, v) => s + Number(v.desconto || v.valorDesconto || 0), 0);
  const ticketMedio = totalVendas > 0 ? faturamento / totalVendas : 0;

  const porFormaPag = {};
  vendas.forEach((v) => {
    const fp = v.formaPagamento || v.tipoPagamento || 'Outros';
    porFormaPag[fp] = (porFormaPag[fp] || 0) + 1;
  });

  const linhasForma = Object.entries(porFormaPag)
    .sort((a, b) => b[1] - a[1])
    .map(([fp, qt]) => `  • ${fp}: ${qt} venda(s)`)
    .join('\n');

  const texto = `*Relatório de Vendas — ${periodo.charAt(0).toUpperCase() + periodo.slice(1)}*
📅 Período: ${dataInicio} a ${dataFim}

💰 Faturamento: ${moeda(faturamento)}
🛒 Total de vendas: ${totalVendas}
🎫 Ticket médio: ${moeda(ticketMedio)}
🏷️ Descontos: ${moeda(descontos)}

💳 Por forma de pagamento:
${linhasForma || '  (sem dados)'}`;

  return { dataInicio, dataFim, totalVendas, faturamento, descontos, ticketMedio, porFormaPag, texto };
}

async function gerarRelatorioProdutos() {
  const dados = await getProdutos();
  const produtos = Array.isArray(dados) ? dados : dados.produtos || dados.data || [];

  const total    = produtos.length;
  const ativos   = produtos.filter((p) => p.ativo === 'S' || p.ativo === true || p.status === 'A').length;
  const inativos = total - ativos;

  const estoqueTotal = produtos.reduce((s, p) => s + Number(p.saldo || p.estoque || 0), 0);

  const top5 = [...produtos]
    .sort((a, b) => Number(b.saldo || b.estoque || 0) - Number(a.saldo || a.estoque || 0))
    .slice(0, 5)
    .map((p) => `  • ${p.descricao || p.nome || p.codigo}: ${Number(p.saldo || p.estoque || 0)} un.`)
    .join('\n');

  const texto = `*Relatório de Produtos*

📦 Total de produtos: ${total}
✅ Ativos: ${ativos}
❌ Inativos: ${inativos}
🏭 Estoque total: ${estoqueTotal} un.

🏆 Top 5 em estoque:
${top5 || '  (sem dados)'}`;

  return { total, ativos, inativos, estoqueTotal, texto };
}

async function gerarRelatorioClientes() {
  const dados = await getClientes();
  const clientes = Array.isArray(dados) ? dados : dados.clientes || dados.data || [];

  const total = clientes.length;
  const pf    = clientes.filter((c) => c.tipoPessoa === 'F' || c.tipo === 'PF').length;
  const pj    = clientes.filter((c) => c.tipoPessoa === 'J' || c.tipo === 'PJ').length;

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const novos = clientes.filter((c) => {
    const dt = new Date(c.dataCadastro || c.dtCadastro || 0);
    return dt >= trintaDiasAtras;
  }).length;

  const texto = `*Relatório de Clientes*

👥 Total de clientes: ${total}
🧑 Pessoa Física: ${pf}
🏢 Pessoa Jurídica: ${pj}
🆕 Novos (últimos 30 dias): ${novos}`;

  return { total, pf, pj, novos, texto };
}

async function gerarRelatorioCompleto(periodo = 'hoje') {
  const [vendas, produtos, clientes] = await Promise.all([
    gerarRelatorioVendas(periodo),
    gerarRelatorioProdutos(),
    gerarRelatorioClientes()
  ]);

  const texto = `${vendas.texto}\n\n---\n\n${produtos.texto}\n\n---\n\n${clientes.texto}`;

  return { vendas, produtos, clientes, texto };
}

module.exports = { gerarRelatorioVendas, gerarRelatorioProdutos, gerarRelatorioClientes, gerarRelatorioCompleto };
