// WhatsApp sem número: abre o WhatsApp para a pessoa escolher o grupo (ou o contato) e mandar.
// No celular abre o aplicativo; no computador abre o WhatsApp Web numa aba só dele.
// © Arthur Ramon da Silva — Todos os direitos reservados.

export const ehCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));   // iPad se passando por Mac

export function linkWhatsSemNumero(texto = '') {
  const t = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return ehCelular() ? `https://wa.me/${t}` : `https://web.whatsapp.com/${texto ? `send${t}` : ''}`;
}

export function abrirWhatsApp(texto = '') {
  const url = linkWhatsSemNumero(texto);
  if (ehCelular()) { location.href = url; return; }
  const w = window.open(url, 'whatsapp');
  if (w) w.opener = null;
}
