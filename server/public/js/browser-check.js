// Detecta navegadores que no soportan las tecnologías de la app (módulos ES,
// import maps, fetch, variables CSS) y muestra un aviso en lugar de una página en blanco.
// Escrito en ES5 a propósito: tiene que poder ejecutarse en Internet Explorer.
(function () {
  function supported() {
    try {
      var script = document.createElement('script');
      if (!('noModule' in script)) return false;
      if (!window.HTMLScriptElement || typeof HTMLScriptElement.supports !== 'function') return false;
      if (!HTMLScriptElement.supports('importmap')) return false;
      if (typeof window.fetch !== 'function' || typeof window.Promise !== 'function') return false;
      if (!window.CSS || !CSS.supports || !CSS.supports('--a', '0')) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  if (supported()) return;

  var html =
    '<div style="max-width:560px;margin:60px auto;padding:32px;font-family:Roboto,Arial,sans-serif;' +
    'color:#212529;background:#fff;border:1px solid #dee2e6;border-radius:8px;text-align:center;">' +
    '<h1 style="font-size:24px;margin:0 0 16px;">Navegador no compatible</h1>' +
    '<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">' +
    'Atari-Go Online usa tecnologías web modernas que tu navegador no soporta.</p>' +
    '<p style="font-size:16px;line-height:1.5;margin:0;">' +
    'Por favor, ingresá con una versión actualizada de ' +
    '<a href="https://www.google.com/chrome/">Google Chrome</a>, ' +
    '<a href="https://www.mozilla.org/firefox/">Mozilla Firefox</a>, ' +
    '<a href="https://www.microsoft.com/edge">Microsoft Edge</a> o Safari.</p>' +
    '</div>';

  document.documentElement.removeAttribute('data-bs-theme');
  document.body.style.background = '#f8f9fa';
  document.body.innerHTML = html;
})();
