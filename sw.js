// Service worker do Vistoria de Imóveis: guarda o aplicativo no aparelho para funcionar sem internet.
//
// - Página (index.html): tenta a internet primeiro, para sempre receber a versão mais nova;
//   sem conexão, ou com conexão lenta (mais de 4 s), usa a cópia guardada.
// - Bibliotecas, ícones e manifesto: usa a cópia guardada; só busca na internet se faltar.
//
// Ao trocar bibliotecas ou ícones, aumente VERSAO para que os aparelhos baixem os arquivos novos.
const VERSAO = 'v2';
const CACHE = `vistoria-${VERSAO}`;
const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'lib/jspdf.umd.min.js',
  'lib/pdf.min.js',
  'lib/pdf.worker.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // apaga caches de versões anteriores
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n.startsWith('vistoria-') && n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function redePrimeiro(req) {
  return new Promise(resolve => {
    let respondeu = false;
    const usarCache = () => caches.match(req, { ignoreSearch: true })
      .then(r => r || caches.match('index.html'))
      .then(r => { if (!respondeu && r) { respondeu = true; resolve(r); } });
    const timer = setTimeout(usarCache, 4000);
    fetch(req).then(resp => {
      clearTimeout(timer);
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      if (!respondeu) { respondeu = true; resolve(resp); }
    }).catch(() => { clearTimeout(timer); usarCache().then(() => { if (!respondeu) resolve(Response.error()); }); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(redePrimeiro(req)); return; }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
