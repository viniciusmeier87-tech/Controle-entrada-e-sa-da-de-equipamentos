// Service worker minimo - apenas registra sem interceptar nada
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
// Sem fetch handler - tudo vai direto para a rede
