import {dateAdd, isAdmin, type Item} from './model.ts';

// These values are Barcelona wall-clock times, matching the existing shifts API.
// Do not let the browser timezone change the selected date or minute.
export function validLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + ':00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 16) === value;
}

export function clockLabel(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ') || '0 min';
}

export type CoveragePeriod = {start: number; end: number; userIds: string[]};

export function dayCoverage(shifts: Item[], day: string): CoveragePeriod[] {
  const start = day + 'T00:00', end = dateAdd(day, 1) + 'T00:00';
  const minute = (value: string) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  const ranges = shifts.filter(s => s.status !== 'cancelled' &&
    typeof s.start === 'string' && typeof s.end === 'string' &&
    validLocalDateTime(s.start) && validLocalDateTime(s.end) && s.end > s.start &&
    s.start < end && s.end > start).map(s => ({
      start: s.start < start ? 0 : minute(s.start),
      end: s.end >= end ? 1440 : minute(s.end),
      userId: String(s.userId),
    }));
  const bounds = [...new Set([0, 1440, ...ranges.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
  const periods: CoveragePeriod[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i], end = bounds[i + 1];
    const userIds = [...new Set(ranges.filter(r => r.start < end && r.end > start).map(r => r.userId))].sort();
    const previous = periods.at(-1);
    if (previous && previous.userIds.length === userIds.length && previous.userIds.every((id, j) => id === userIds[j])) previous.end = end;
    else periods.push({start, end, userIds});
  }
  return periods;
}

export type ShiftDraft = {day: string; startTime: string; endTime: string; nextDay: boolean; userId: string};
export function draftTimes(draft: ShiftDraft) {
  const start = `${draft.day}T${draft.startTime}`;
  // Validate the date before dateAdd, including dates such as February 30.
  if (!validLocalDateTime(start) || !validLocalDateTime(`${draft.day}T${draft.endTime}`)) return null;
  const end = `${draft.nextDay ? dateAdd(draft.day, 1) : draft.day}T${draft.endTime}`;
  const duration = (Date.parse(end + ':00Z') - Date.parse(start + ':00Z')) / 60000;
  return duration > 0 && duration <= 1440 ? {start, end, duration} : null;
}

// The capability comes from the authenticated backend, preserving the old UI until rollout.
export function shiftControls(user: Item, shift: Item, coordinationReady = false) {
  const active = user.status === 'active' && ['root', 'admin', 'delegate'].includes(user.role) && shift.status !== 'cancelled';
  const manages = active && (isAdmin(user) || shift.userId === user.id);
  return {
    edit: active && (isAdmin(user) || (coordinationReady && manages)),
    delete: coordinationReady && manages,
    requestCancellation: !coordinationReady && manages && shift.status === 'confirmed',
    decideCancellation: active && isAdmin(user) && shift.status === 'cancel_requested',
  };
}
