import {type Item} from './model';

export function profileLabel(user: Item, lang = 'es') {
  const labels: Record<string, [string, string]> = {
    root: ['Administrador principal', 'Administrador principal'],
    admin: ['Administrador', 'Administrador'],
    delegate: ['Asesor de Flota', 'Assessor de Flota'],
    reservation: ['Asociado', 'Associat'],
    pending: ['Pendiente de asignar', 'Pendent d’assignar'],
  };
  return (labels[user.role] || labels.pending)[lang === 'ca' ? 1 : 0];
}
