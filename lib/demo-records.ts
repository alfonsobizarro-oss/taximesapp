import type {Item, State} from './model';

// Read-only presentation hints. Never classify a production record by its ID alone,
// and never mutate flags, stored text, users or approvals when changing branding.
export function isDemoRecord(kind: string, row: Item): boolean {
  if (row.demo === true) return true;
  if (kind === 'messages') return row.id === 'msg-1' && row.text === 'Bienvenidos a la prueba de Taximés. Los asociados y las incidencias de esta versión son ficticios.';
  if (kind === 'documents') return row.id === 'doc-1' && row.title === 'Guía de la versión de prueba' && row.body === 'Esta aplicación contiene datos ficticios. Puedes consultar asociados, registrar incidencias y apuntarte al cuadrante. El Excel actualizado se incorporará después. No cargues datos reales hasta completar las pruebas de acceso y notificaciones.';
  if (kind === 'polls') return row.id === 'poll-1' && row.title === '¿Qué horario prefieres para la reunión de delegados?' && JSON.stringify(row.options) === JSON.stringify(['Mañana', 'Tarde', 'Indiferente']);
  return false;
}
export function hasDemoRecords(state: State): boolean {
  return ['users', 'members', 'incidents', 'messages', 'documents', 'polls'].some(kind =>
    (state[kind as keyof State] as Item[]).some(row => isDemoRecord(kind, row)));
}
