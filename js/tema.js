// Aplica o tema (claro / escuro / automático) antes da página aparecer, para não piscar.
// © Arthur Ramon da Silva — Todos os direitos reservados.
(function () {
  var escolha = 'auto';
  try { escolha = localStorage.getItem('hype_tema') || 'auto'; } catch (e) {}
  var escuro = escolha === 'escuro' || (escolha === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
})();
