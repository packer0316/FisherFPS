// Audio integrations subscribe here. Payloads use world coordinates and game currency.
export const gameEvents = new EventTarget();
export function emit(type, detail = {}) {
  gameEvents.dispatchEvent(new CustomEvent(type, { detail }));
}
