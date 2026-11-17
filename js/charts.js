// Gráficos (Chart.js)
// © Arthur Ramon da Silva — Todos os direitos reservados.
export const COR = { s1: '#2a78d6', s2: '#eb6834', grade: '#ebe9e2', texto: '#4a4842' };

function preparar(canvas) {
  if (!window.Chart) {
    canvas.closest('.grafico').innerHTML = '<p class="muted small">Gráfico indisponível. Os números estão na tabela abaixo.</p>';
    return null;
  }
  const C = window.Chart;
  C.defaults.font.family = getComputedStyle(document.documentElement).fontFamily;
  C.defaults.font.size = 12;
  C.defaults.color = COR.texto;
  return C;
}

const dica = { backgroundColor: '#1c1b19', padding: 8, cornerRadius: 4, boxPadding: 3, usePointStyle: true };
const legenda = (n) => ({ display: n > 1, position: 'bottom', align: 'start', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 8, boxHeight: 8, padding: 14 } });
const eixos = (empilhado) => ({
  x: { stacked: empilhado, grid: { display: false }, border: { color: COR.grade }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
  y: { stacked: empilhado, beginAtZero: true, grid: { color: COR.grade }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 } },
});

export function barras(canvas, { rotulos, series, empilhado = false }) {
  const C = preparar(canvas); if (!C) return null;
  return new C(canvas, {
    type: 'bar',
    data: { labels: rotulos, datasets: series.map((s) => ({ label: s.rotulo, data: s.dados, backgroundColor: s.cor, borderRadius: 3, borderSkipped: 'start', maxBarThickness: 26, borderColor: '#fff', borderWidth: empilhado ? { top: 2 } : 0 })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: legenda(series.length), tooltip: dica }, scales: eixos(empilhado) },
  });
}

export function linhas(canvas, { rotulos, series }) {
  const C = preparar(canvas); if (!C) return null;
  return new C(canvas, {
    type: 'line',
    data: { labels: rotulos, datasets: series.map((s) => ({ label: s.rotulo, data: s.dados, borderColor: s.cor, backgroundColor: s.cor, borderWidth: 2, tension: 0.25, pointRadius: 3.5, pointHoverRadius: 5, spanGaps: true, borderDash: s.tracejado ? [5, 4] : [] })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: legenda(series.length), tooltip: dica }, scales: eixos(false) },
  });
}

export function tabelaDados(rotulos, series) {
  return `<details class="dados"><summary>Ver os números</summary><div class="tabela-wrap"><table class="tabela">
    <thead><tr><th></th>${series.map((s) => `<th class="dir">${s.rotulo}</th>`).join('')}</tr></thead>
    <tbody>${rotulos.map((r, i) => `<tr><td>${r}</td>${series.map((s) => `<td class="dir num">${s.dados[i] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
