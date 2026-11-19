// Campos com cara do Hype: listas de escolha (select), data e hora.
// O campo original do navegador continua na página, escondido, guardando o valor: o resto do código
// (value, eventos change/input, required) funciona igual. Só a parte que a pessoa vê e toca é nossa.
// Para manter um campo nativo: data-nativo no elemento.
// © Arthur Ramon da Silva — Todos os direitos reservados.

const SETA = '<svg class="i seta" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CAL = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const RELOGIO = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// No celular a lista/calendário já resolve: sem abrir o teclado por cima
const toque = window.matchMedia('(pointer: coarse)').matches;
const z = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Janelinha flutuante (lista, calendário) ----------
let popAberto = null;
function fecharPop() {
  if (!popAberto) return;
  const { el, aoFechar } = popAberto;
  popAberto = null;
  el.remove();
  aoFechar?.();
}
function abrirPop(ancora, el, { aoFechar, largura } = {}) {
  fecharPop();
  el.classList.add('pop-campo');
  document.body.appendChild(el);
  const r = ancora.getBoundingClientRect();
  el.style.minWidth = `${largura || r.width}px`;
  const alto = el.offsetHeight, vh = window.innerHeight, vw = window.innerWidth;
  const cabeEmbaixo = r.bottom + 6 + alto < vh - 8 || r.top < alto + 14;
  el.style.top = `${cabeEmbaixo ? r.bottom + 6 : r.top - alto - 6}px`;
  el.style.left = `${Math.max(8, Math.min(r.left, vw - el.offsetWidth - 8))}px`;
  el.classList.toggle('acima', !cabeEmbaixo);
  popAberto = { el, ancora, aoFechar };
  return el;
}
document.addEventListener('pointerdown', (e) => {
  if (popAberto && !popAberto.el.contains(e.target) && !popAberto.ancora.contains(e.target)) fecharPop();
}, true);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && popAberto) { e.stopPropagation(); e.preventDefault(); const a = popAberto.ancora; fecharPop(); a.querySelector('button, input')?.focus(); }
}, true);
let larguraJanela = window.innerWidth;   // no celular o teclado muda só a altura: não fecha por isso
window.addEventListener('resize', () => { if (window.innerWidth !== larguraJanela) { larguraJanela = window.innerWidth; fecharPop(); } });
document.addEventListener('scroll', (e) => { if (popAberto && !popAberto.el.contains(e.target)) fecharPop(); }, true);
window.addEventListener('hashchange', fecharPop);

// Quando o código muda o valor (el.value = ...), a parte visível acompanha
function vigiarValor(el, proto, aoMudar) {
  for (const prop of ['value', 'selectedIndex', 'valueAsDate']) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d?.set) continue;
    Object.defineProperty(el, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); aoMudar(); } });
  }
}
const avisar = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

const classesVisiveis = (el) => [...el.classList].filter((c) => c !== 'campo-nativo' && c !== 'hidden').join(' ');

function embrulhar(el, classe) {
  const caixa = document.createElement('span');
  caixa.className = `campo ${classe}`;
  if (el.style.cssText) { caixa.style.cssText = el.style.cssText; el.style.cssText = ''; }
  if (caixa.style.width === 'auto') caixa.classList.add('auto');   // do tamanho do texto (não corta o "2026")
  el.parentNode.insertBefore(caixa, el);
  caixa.appendChild(el);
  el.classList.add('campo-nativo');
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  // Se o código esconder o campo (classe hidden), esconde a parte visível junto
  const esconder = () => caixa.classList.toggle('hidden', el.classList.contains('hidden') || el.hidden);
  new MutationObserver(esconder).observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
  esconder();
  return caixa;
}

// ---------- Lista de escolha ----------
function enfeitarSelect(sel) {
  const caixa = embrulhar(sel, 'campo-sel');
  const bt = document.createElement('button');
  bt.type = 'button';
  bt.className = `${classesVisiveis(sel)} campo-botao`;
  bt.setAttribute('aria-haspopup', 'listbox');
  if (sel.title) bt.title = sel.title;
  if (sel.getAttribute('aria-label')) bt.setAttribute('aria-label', sel.getAttribute('aria-label'));
  const rotulo = document.querySelector(sel.id ? `label[for="${CSS.escape(sel.id)}"]` : 'x');
  if (rotulo) { rotulo.htmlFor = ''; rotulo.addEventListener('click', () => bt.focus()); bt.setAttribute('aria-label', rotulo.textContent.replace('*', '').trim()); }
  caixa.appendChild(bt);
  const pintar = () => {
    const o = sel.options[sel.selectedIndex];
    bt.innerHTML = `<span class="campo-texto ${o && o.value === '' ? 'vazio' : ''}">${escH(o ? o.textContent : '')}</span>${SETA}`;
    bt.disabled = sel.disabled;
  };
  vigiarValor(sel, HTMLSelectElement.prototype, pintar);
  new MutationObserver(pintar).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
  sel.addEventListener('change', pintar);
  sel.addEventListener('focus', () => bt.focus());
  pintar();

  const escolher = (i) => { if (i !== sel.selectedIndex) { sel.selectedIndex = i; avisar(sel); } fecharPop(); bt.focus(); };
  const abrir = () => {
    if (sel.disabled) return;
    const lista = document.createElement('div');
    lista.setAttribute('role', 'listbox');
    lista.innerHTML = [...sel.options].map((o, i) => (o.hidden ? '' : `<button type="button" role="option" data-i="${i}" class="${i === sel.selectedIndex ? 'atual' : ''} ${o.value === '' ? 'vazio' : ''}" ${o.disabled ? 'disabled' : ''} aria-selected="${i === sel.selectedIndex}">${escH(o.textContent)}</button>`)).join('');
    lista.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) escolher(Number(b.dataset.i)); });
    lista.addEventListener('keydown', (e) => {
      const itens = [...lista.querySelectorAll('button:not([disabled])')];
      const k = itens.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); itens[Math.min(itens.length - 1, k + 1)]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); itens[Math.max(0, k - 1)]?.focus(); }
      else if (e.key === 'Tab') fecharPop();
      else if (e.key.length === 1) {
        const l = e.key.toLowerCase();
        const achou = [...itens.slice(k + 1), ...itens.slice(0, k + 1)].find((b) => b.textContent.trim().toLowerCase().normalize('NFD').startsWith(l));
        achou?.focus();
      }
    });
    abrirPop(caixa, lista, { aoFechar: () => caixa.classList.remove('aberto') });
    caixa.classList.add('aberto');
    const atual = lista.querySelector('.atual') || lista.querySelector('button:not([disabled])');
    atual?.focus({ preventScroll: true });
    atual?.scrollIntoView({ block: 'nearest' });
  };
  bt.addEventListener('click', () => (popAberto?.ancora === caixa ? fecharPop() : abrir()));
  bt.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir(); }
  });
}

// ---------- Data (dd/mm/aaaa + calendário) ----------
function enfeitarData(inp) {
  const caixa = embrulhar(inp, 'campo-data');
  const txt = document.createElement('input');
  txt.type = 'text';
  txt.inputMode = 'numeric';
  txt.autocomplete = 'off';
  txt.placeholder = 'dd/mm/aaaa';
  txt.readOnly = toque;
  txt.maxLength = 10;
  txt.className = `${classesVisiveis(inp)} campo-digitar`;
  const bt = document.createElement('button');
  bt.type = 'button';
  bt.className = 'campo-icone';
  bt.tabIndex = -1;
  bt.setAttribute('aria-label', 'Abrir calendário');
  bt.innerHTML = CAL;
  caixa.append(txt, bt);
  if (inp.id) { const r = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`); if (r) { r.htmlFor = ''; r.addEventListener('click', () => txt.focus()); txt.setAttribute('aria-label', r.textContent.replace('*', '').trim()); } }
  const deISO = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');
  const pintar = () => { txt.value = deISO(inp.value); txt.disabled = inp.disabled; bt.disabled = inp.disabled; caixa.classList.toggle('invalido', false); };
  vigiarValor(inp, HTMLInputElement.prototype, pintar);
  new MutationObserver(pintar).observe(inp, { attributes: true, attributeFilter: ['disabled'] });
  pintar();
  const dentroDosLimites = (iso) => (!inp.min || iso >= inp.min) && (!inp.max || iso <= inp.max);
  const definir = (iso) => { if (iso !== inp.value) { inp.value = iso; avisar(inp); } else pintar(); };

  // Digitando: 13112026 vira 13/11/2026
  txt.addEventListener('input', () => {
    const d = txt.value.replace(/\D/g, '').slice(0, 8);
    txt.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    caixa.classList.remove('invalido');
    if (d.length === 8) {
      const iso = `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
      const ok = !Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) && isoDe(new Date(`${iso}T12:00:00`)) === iso;
      if (ok && dentroDosLimites(iso)) { definir(iso); if (popAberto?.ancora === caixa) desenharCal(iso); } else caixa.classList.add('invalido');
    }
  });
  txt.addEventListener('blur', () => { setTimeout(() => { if (popAberto?.ancora !== caixa) { if (!txt.value) { if (inp.value && !inp.required) definir(''); else pintar(); } else pintar(); } }, 150); });
  txt.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); abrirCal(); }
    if (e.key === 'Enter' && popAberto?.ancora === caixa) { e.preventDefault(); fecharPop(); }
  });

  let mesCal = null; let pop = null;
  const desenharCal = (foco) => {
    const base = foco ? new Date(`${foco}T12:00:00`) : mesCal;
    mesCal = new Date(base.getFullYear(), base.getMonth(), 1, 12);
    const hoje = isoDe(new Date());
    const ini = new Date(mesCal); ini.setDate(1 - ini.getDay());
    const dias = [];
    for (let i = 0; i < 42; i++) { const d = new Date(ini); d.setDate(ini.getDate() + i); dias.push(d); }
    const ultimaSemana = dias.slice(35).every((d) => d.getMonth() !== mesCal.getMonth()) ? 35 : 42;
    pop.innerHTML = `<div class="cal-topo"><button type="button" data-n="-1" aria-label="Mês anterior">‹</button><b>${MESES[mesCal.getMonth()]} de ${mesCal.getFullYear()}</b><button type="button" data-n="1" aria-label="Próximo mês">›</button></div>
      <div class="cal-grade">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => `<span class="cal-sem ${i === 5 ? 'sexta' : ''}">${l}</span>`).join('')}
      ${dias.slice(0, ultimaSemana).map((d) => { const iso = isoDe(d); return `<button type="button" data-d="${iso}" class="${d.getMonth() !== mesCal.getMonth() ? 'fora' : ''} ${iso === hoje ? 'hoje' : ''} ${iso === inp.value ? 'atual' : ''} ${d.getDay() === 5 ? 'sexta' : ''}" ${dentroDosLimites(iso) ? '' : 'disabled'}>${d.getDate()}</button>`; }).join('')}</div>
      <div class="cal-pe">${dentroDosLimites(hoje) ? '<button type="button" data-d="hoje">Hoje</button>' : '<span></span>'}${!inp.required && inp.value ? '<button type="button" data-d="">Limpar</button>' : ''}</div>`;
  };
  const abrirCal = () => {
    if (inp.disabled) return;
    pop = document.createElement('div');
    pop.className = 'cal';
    mesCal = new Date(`${inp.value || (inp.max && inp.max < isoDe(new Date()) ? inp.max : inp.min && inp.min > isoDe(new Date()) ? inp.min : isoDe(new Date()))}T12:00:00`);
    desenharCal();
    pop.addEventListener('mousedown', (e) => e.preventDefault());   // não tira o foco do campo
    pop.addEventListener('click', (e) => {
      const n = e.target.closest('[data-n]'); if (n) { mesCal.setMonth(mesCal.getMonth() + Number(n.dataset.n)); desenharCal(); return; }
      const d = e.target.closest('[data-d]'); if (!d || d.disabled) return;
      definir(d.dataset.d === 'hoje' ? isoDe(new Date()) : d.dataset.d);
      fecharPop(); txt.focus();
    });
    abrirPop(caixa, pop, { largura: 280, aoFechar: () => caixa.classList.remove('aberto') });
    caixa.classList.add('aberto');
  };
  bt.addEventListener('click', () => (popAberto?.ancora === caixa ? fecharPop() : (abrirCal(), txt.focus())));
  txt.addEventListener('click', () => { if (popAberto?.ancora !== caixa) abrirCal(); });
}

// ---------- Hora (hh:mm + lista de horários) ----------
function enfeitarHora(inp) {
  const caixa = embrulhar(inp, 'campo-hora');
  const txt = document.createElement('input');
  txt.type = 'text';
  txt.inputMode = 'numeric';
  txt.autocomplete = 'off';
  txt.placeholder = '--:--';
  txt.readOnly = toque;
  txt.maxLength = 5;
  txt.className = `${classesVisiveis(inp)} campo-digitar`;
  const ic = document.createElement('span');
  ic.className = 'campo-icone';
  ic.innerHTML = RELOGIO;
  caixa.append(txt, ic);
  if (inp.id) { const r = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`); if (r) { r.htmlFor = ''; r.addEventListener('click', () => txt.focus()); txt.setAttribute('aria-label', r.textContent.replace('*', '').trim()); } }
  const pintar = () => { txt.value = inp.value ? inp.value.slice(0, 5) : ''; txt.disabled = inp.disabled; caixa.classList.remove('invalido'); };
  vigiarValor(inp, HTMLInputElement.prototype, pintar);
  pintar();
  const definir = (h) => { if (h !== inp.value) { inp.value = h; avisar(inp); } else pintar(); };
  const horarios = [];
  for (let h = 6; h < 24; h++) for (const m of ['00', '30']) horarios.push(`${z(h)}:${m}`);

  let lista = null;
  const abrirLista = () => {
    if (inp.disabled) return;
    lista = document.createElement('div');
    lista.className = 'lista-horas';
    lista.innerHTML = horarios.map((h) => `<button type="button" data-h="${h}" class="${h === inp.value ? 'atual' : ''}">${h}</button>`).join('');
    lista.addEventListener('mousedown', (e) => e.preventDefault());
    lista.addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (b) { definir(b.dataset.h); fecharPop(); txt.blur(); } });
    abrirPop(caixa, lista, { aoFechar: () => caixa.classList.remove('aberto') });
    caixa.classList.add('aberto');
    rolarPara(inp.value || '19:00');
  };
  const rolarPara = (h) => {
    if (!lista) return;
    const alvo = [...lista.children].find((b) => b.dataset.h >= h) || lista.lastElementChild;
    lista.querySelectorAll('.perto').forEach((b) => b.classList.remove('perto'));
    alvo.classList.add('perto');
    lista.scrollTop = alvo.offsetTop - lista.clientHeight / 2 + alvo.offsetHeight / 2;
  };
  txt.addEventListener('focus', () => { if (popAberto?.ancora !== caixa) abrirLista(); });
  txt.addEventListener('click', () => { if (popAberto?.ancora !== caixa) abrirLista(); });
  // Digitando: 1930 vira 19:30
  txt.addEventListener('input', () => {
    let d = txt.value.replace(/\D/g, '').slice(0, 4);
    if (d.length === 1 && Number(d) > 2) d = `0${d}`;
    txt.value = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
    caixa.classList.remove('invalido');
    if (d.length >= 2) rolarPara(`${d.slice(0, 2)}:${d.length === 4 ? d.slice(2) : '00'}`);
    if (d.length === 4) {
      const ok = Number(d.slice(0, 2)) < 24 && Number(d.slice(2)) < 60;
      if (ok) definir(`${d.slice(0, 2)}:${d.slice(2)}`); else caixa.classList.add('invalido');
    }
  });
  txt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && popAberto?.ancora === caixa) {
      e.preventDefault();
      const p = lista?.querySelector('.perto');
      if (txt.value.length < 5 && p) definir(p.dataset.h);
      fecharPop();
    }
    if (e.key === 'Tab') fecharPop();
  });
  txt.addEventListener('blur', () => {
    setTimeout(() => {
      if (popAberto?.ancora === caixa) fecharPop();
      const d = txt.value.replace(/\D/g, '');
      if (!d) { if (inp.value) definir(''); return; }
      if (d.length <= 2 && Number(d) < 24) { definir(`${z(Number(d))}:00`); return; }   // "19" vira 19:00
      if (d.length === 3) { const h = `0${d[0]}:${d.slice(1)}`; if (Number(d.slice(1)) < 60) { definir(h); return; } }
      pintar();
    }, 120);
  });
}

// ---------- Mês (relatórios) ----------
function enfeitarMes(inp) {
  const caixa = embrulhar(inp, 'campo-sel campo-mes');
  const bt = document.createElement('button');
  bt.type = 'button';
  bt.className = `${classesVisiveis(inp)} campo-botao`;
  caixa.appendChild(bt);
  const pintar = () => {
    const v = inp.value;
    bt.innerHTML = `<span class="campo-texto ${v ? '' : 'vazio'}">${v ? `${MESES[Number(v.slice(5, 7)) - 1]} de ${v.slice(0, 4)}` : 'Escolher mês'}</span>${SETA}`;
    bt.disabled = inp.disabled;
  };
  vigiarValor(inp, HTMLInputElement.prototype, pintar);
  pintar();
  let ano;
  const desenhar = (pop) => {
    const max = inp.max || '9999-12', min = inp.min || '0000-01';
    pop.innerHTML = `<div class="cal-topo"><button type="button" data-a="-1" aria-label="Ano anterior">‹</button><b>${ano}</b><button type="button" data-a="1" aria-label="Próximo ano">›</button></div>
      <div class="grade-meses">${MESES.map((m, i) => { const v = `${ano}-${z(i + 1)}`; return `<button type="button" data-m="${v}" class="${v === inp.value ? 'atual' : ''}" ${v > max || v < min ? 'disabled' : ''}>${m.slice(0, 3)}</button>`; }).join('')}</div>`;
  };
  bt.addEventListener('click', () => {
    if (popAberto?.ancora === caixa) return fecharPop();
    ano = Number((inp.value || isoDe(new Date())).slice(0, 4));
    const pop = document.createElement('div');
    pop.className = 'cal';
    desenhar(pop);
    pop.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (a) { ano += Number(a.dataset.a); desenhar(pop); return; }
      const m = e.target.closest('[data-m]'); if (!m || m.disabled) return;
      if (m.dataset.m !== inp.value) { inp.value = m.dataset.m; avisar(inp); }
      fecharPop(); bt.focus();
    });
    abrirPop(caixa, pop, { largura: 260, aoFechar: () => caixa.classList.remove('aberto') });
    caixa.classList.add('aberto');
  });
}

// ---------- Liga tudo, inclusive o que aparece depois (telas e janelas novas) ----------
function enfeitar(raiz) {
  raiz.querySelectorAll?.('select:not([multiple]):not([data-nativo]):not(.campo-nativo)').forEach(enfeitarSelect);
  raiz.querySelectorAll?.('input[type=date]:not([data-nativo]):not(.campo-nativo)').forEach(enfeitarData);
  raiz.querySelectorAll?.('input[type=time]:not([data-nativo]):not(.campo-nativo)').forEach(enfeitarHora);
  raiz.querySelectorAll?.('input[type=month]:not([data-nativo]):not(.campo-nativo)').forEach(enfeitarMes);
}
new MutationObserver((muds) => {
  for (const m of muds) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('pop-campo')) {
    if (n.matches('select, input[type=date], input[type=time], input[type=month]')) enfeitar(n.parentNode); else enfeitar(n);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
enfeitar(document);
