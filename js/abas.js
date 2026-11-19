// Abas (Próximas/Anteriores, Semana/Mês/Ano...): a marcação desliza de uma opção para a outra.
// Vale para todo .abas do site, inclusive quando a tela se redesenha (lembra de onde a marcação estava).
// © Arthur Ramon da Silva — Todos os direitos reservados.
const ultimo = new Map();   // aba -> { x, w }
const chave = (a) => a.id || [...a.querySelectorAll(':scope > button')].map((b) => b.textContent.trim().replace(/\s*\(.*\)$/, '')).join('|');

function enfeitar(a) {
  if (a.querySelector(':scope > .abas-ind')) return;
  a.classList.add('com-ind');
  const ind = document.createElement('span');
  ind.className = 'abas-ind';
  ind.setAttribute('aria-hidden', 'true');
  a.prepend(ind);
  const ativo = () => a.querySelector(':scope > button.ativo');
  const pos = (b) => ({ x: b.offsetLeft, w: b.offsetWidth });
  const por = ({ x, w }, animar) => {
    ind.classList.toggle('sem-anim', !animar);
    ind.style.width = `${w}px`;
    ind.style.transform = `translateX(${x}px)`;
    ind.style.opacity = 1;
  };
  const mover = (animar = true) => {
    const b = ativo();
    if (!b || !b.offsetWidth) { ind.style.opacity = 0; return; }
    const p = pos(b); ultimo.set(chave(a), p); por(p, animar);
  };
  const antes = ultimo.get(chave(a));
  if (antes) { por(antes, false); void ind.offsetWidth; requestAnimationFrame(() => mover(true)); } else mover(false);
  // Clicou: a marcação já vai para lá, sem esperar a tela carregar
  a.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.parentElement !== a || b.disabled) return;
    a.querySelectorAll(':scope > button').forEach((x) => x.classList.toggle('ativo', x === b));
    mover(true);
  });
  a.addEventListener('hype:medir', () => mover(false));
  new MutationObserver(() => mover(true)).observe(a, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
}

const procurar = (raiz) => { if (raiz.matches?.('.abas')) enfeitar(raiz); raiz.querySelectorAll?.('.abas').forEach(enfeitar); };
new MutationObserver((muds) => { for (const m of muds) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('abas-ind')) procurar(n); })
  .observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', () => document.querySelectorAll('.abas.com-ind').forEach((a) => a.dispatchEvent(new Event('hype:medir'))));
procurar(document);
