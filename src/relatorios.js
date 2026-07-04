/**
 * Converte um CSV (formato padrão de resposta do WebService do Microvix) em registros.
 */
function parseCsv(csvTexto, delimitador = ';') {
    const linhas = String(csvTexto).trim().split(/\r?\n/).filter(Boolean);
    if (linhas.length === 0) {
        return [];
    }

    const cabecalho = linhas[0].split(delimitador).map((campo) => campo.trim());

    return linhas.slice(1).map((linha) => {
        const valores = linha.split(delimitador);
        return cabecalho.reduce((registro, campo, indice) => {
            registro[campo] = (valores[indice] || '').trim();
            return registro;
        }, {});
    });
}

function gerarRelatorioResumo(registros) {
    return {
        totalRegistros: registros.length,
        colunas: registros.length > 0 ? Object.keys(registros[0]) : [],
        geradoEm: new Date().toISOString()
    };
}

function gerarCsv(registros) {
    if (registros.length === 0) {
        return '';
    }

    const colunas = Object.keys(registros[0]);
    const linhas = registros.map((registro) =>
        colunas.map((coluna) => registro[coluna] ?? '').join(';')
    );

    return [colunas.join(';'), ...linhas].join('\n');
}

module.exports = {
    parseCsv,
    gerarRelatorioResumo,
    gerarCsv
};
