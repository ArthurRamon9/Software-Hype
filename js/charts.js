// Gráficos (Chart.js) com visual padronizado
// © Arthur Ramon da Silva — Todos os direitos reservados.
export const COR = { s1: '#2a78d6', s2: '#eb6834', s1Soft: 'rgba(42,120,214,.12)', grid: '#eeedf3', texto: '#55526a' };

function base() {
  const C = window.Chart;
  C.defaults.font.family = "'Inter', system-ui, sans-serif";
  C.defaults.font.size = 12;
  C.defaults.color = COR.texto;
  return C;
}

const tooltip = {
  backgroundColor: '#15131f', padding: 10, cornerRadius: 8, titleFont: { weight: '600' },
  boxPadding: 4, usePointStyle: true,
};
const eixos = (empilhado = false, max) => ({
  x: { stacked: empilhado, grid: { display: false }, border: { color: COR.grid }, ticks: { maxRotation: 0, autoSkipPadding: 10 } },
  y: { stacked: empilhado, beginAtZero: true, max, grid: { color: COR.grid }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 6 } },
});

function semGrafico(canvas) {
  canvas.closest('.chart-box').innerHTML = '<p class="muted small">Não foi possível carregar o gráfico. Veja os dados na tabela abaixo.</p>';
  return null;
}

export function barras(canvas, { labels, series, empilhado = false, sufixo = '' }) {
  if (!window.Chart) return semGrafico(canvas);
  const C = base();
  return new C(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label, data: s.data, backgroundColor: s.cor, borderRadius: 4, borderSkipped: 'start',
        maxBarThickness: 28, borderColor: '#fff', borderWidth: empilhado ? { top: 2 } : 0,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: series.length > 1, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8 } },
        tooltip: { ...tooltip, callbacks: { label: (c) => ` ${c.dataset.label}: ${c.formattedValue}${sufixo}` } },
      },
      scales: eixos(empilhado),
    },
  });
}

export function linhas(canvas, { labels, series, sufixo = '', max }) {
  if (!window.Chart) return semGrafico(canvas);
  const C = base();
  return new C(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label, data: s.data, borderColor: s.cor, backgroundColor: i === 0 ? COR.s1Soft : 'transparent',
        fill: i === 0 && series.length === 1, tension: 0.3, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: s.cor, pointBorderColor: '#fff', pointBorderWidth: 2, spanGaps: true, borderDash: s.tracejado ? [5, 4] : [],
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: series.length > 1, position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
        tooltip: { ...tooltip, callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw === null ? '—' : c.formattedValue + sufixo}` } },
      },
      scales: eixos(false, max),
    },
  });
}

// Tabela alternativa (acessibilidade) para qualquer gráfico
export function tabelaAlt(labels, series, sufixo = '') {
  return `<details class="table-alt"><summary>Ver dados em tabela</summary><div class="table-wrap"><table class="table">
    <thead><tr><th></th>${series.map((s) => `<th class="num">${s.label}</th>`).join('')}</tr></thead>
    <tbody>${labels.map((l, i) => `<tr><td>${l}</td>${series.map((s) => `<td class="num">${s.data[i] ?? '—'}${s.data[i] != null ? sufixo : ''}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}
