/* ================================================================
   SERVICE WORKER — Handle Push Notifications
   ================================================================ */

self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'LocaLink';
    const options = {
        body: data.body || 'You have a new message',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="120" fill="black">📍</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><circle cx="96" cy="96" r="90" fill="%235b6af5"/></svg>',
        tag: data.tag || 'notification',
        requireInteraction: data.type === 'call' ? true : false,
        data: data.data || {}
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const urlToOpen = new URL('/', self.location).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});
