import { EventEmitter } from "events";

const realtimeEventBus = new EventEmitter();

export function emitRealtimeEvent(event: string, payload: unknown) {
  realtimeEventBus.emit(event, payload);
}

export function onRealtimeEvent(event: string, handler: (payload: any) => void) {
  realtimeEventBus.on(event, handler);
  return () => realtimeEventBus.off(event, handler);
}

export default realtimeEventBus;
