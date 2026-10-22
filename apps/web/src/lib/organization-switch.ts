const CHANNEL = 'anderp-organization';

/** Recarga completa en Egresos: Base siempre existe, así que la ruta es válida en cualquier organización (F20 CA-14). */
export function goHome(): void {
  window.location.assign('/egresos');
}

/** Avisa a las otras pestañas del navegador de que la organización de la sesión cambió. */
export function announceSwitch(): void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage('switched');
  channel.close();
}

/** Las otras pestañas recargan en cuanto una cambia de organización. Se llama una vez en `main.tsx`. */
export function listenForSwitch(): void {
  new BroadcastChannel(CHANNEL).onmessage = goHome;
}
