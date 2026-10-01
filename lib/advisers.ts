import {type State} from './model';

export const coordinationEvents = ['substitution_requested', 'substitution_accepted', 'substitution_cancelled', 'coverage_gap', 'adviser_status_changed'] as const;
export function madridMinute(now = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function addMinutes(local: string, minutes: number) {
  return new Date(Date.parse(local + ':00Z') + minutes * 60000).toISOString().slice(0, 16);
}
export function nextMinute(now = new Date()) {
  return madridMinute(new Date(Math.ceil(now.getTime() / 60000) * 60000));
}
export function coveringShifts(s: State) {
  const active = new Set(s.users.filter(u => u.status === 'active' && ['root', 'admin', 'delegate'].includes(u.role)).map(u => u.id));
  return s.shifts.filter(sh => sh.status !== 'cancelled' && sh.start < sh.end && active.has(sh.userId));
}
export function advisersNow(s: State, at: string) {
  const shifts = coveringShifts(s);
  const active = shifts.filter(sh => sh.start <= at && sh.end > at);
  const people = [...new Set(active.map(sh => sh.userId))].map(userId => {
    const own = active.filter(sh => sh.userId === userId);
    let until = own.reduce((end, sh) => sh.end > end ? sh.end : end, at);
    // Adjacent/overlapping slots for the same person constitute continuous coverage.
    for (const sh of shifts.filter(sh => sh.userId === userId).sort((a, b) => a.start.localeCompare(b.start))) {
      if (sh.start <= until && sh.end > until) until = sh.end;
    }
    const saved = s.adviserStatuses?.find(row => row.userId === userId && row.until > at && row.updatedLocal <= at && own.some(sh => row.shiftIds?.includes(sh.id)));
    return {userId, user: s.users.find(u => u.id === userId), until, status: saved?.status || 'available', explicitStatus: !!saved, shifts: own};
  });
  // A boundary that does not change the set of covering people is not an adviser change.
  const bounds = [...new Set(shifts.flatMap(sh => [sh.start, sh.end]).filter(value => value > at))].sort();
  const ids = (point: string) => [...new Set(shifts.filter(sh => sh.start <= point && sh.end > point).map(sh => sh.userId))].sort().join('|');
  const current = ids(at), nextChange = bounds.find(point => ids(point) !== current) || null;
  const nextStart = shifts.map(sh => sh.start).filter(value => value > at).sort()[0] || null;
  const nextEnd = active.map(sh => sh.end).sort()[0] || null;
  const previousEnd = shifts.map(sh => sh.end).filter(value => value <= at).sort().at(-1) || null;
  const horizon = addMinutes(at, 360);
  const points = [...new Set([at, horizon, ...bounds.filter(value => value < horizon)])].sort();
  const upcoming: {start: string; end: string; userIds: string[]}[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const userIds = [...new Set(shifts.filter(sh => sh.start <= points[i] && sh.end > points[i]).map(sh => String(sh.userId)))].sort();
    const last = upcoming.at(-1);
    if (last && last.userIds.join('|') === userIds.join('|')) last.end = points[i + 1];
    else upcoming.push({start: points[i], end: points[i + 1], userIds});
  }
  return {people, nextChange, nextStart, nextEnd, gapSince: people.length ? null : previousEnd, upcoming};
}
