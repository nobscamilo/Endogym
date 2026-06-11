const DEFAULT_APP_TIME_ZONE = 'Europe/Madrid';

export function getAppTimeZone() {
  return process.env.APP_TIME_ZONE || DEFAULT_APP_TIME_ZONE;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function partsInTimeZone(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

export function dateKeyInTimeZone(date = new Date(), timeZone = getAppTimeZone()) {
  const p = partsInTimeZone(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return d.toISOString().slice(0, 10);
}

export function mondayDateKeyFor(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const jsDay = d.getUTCDay(); // 0=Dom ... 6=Sab, sobre la fecha civil.
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  return addDaysToDateKey(dateKey, diff);
}

export function currentWeekKey(date = new Date(), timeZone = getAppTimeZone()) {
  return mondayDateKeyFor(dateKeyInTimeZone(date, timeZone));
}

function timeZoneOffsetMs(date, timeZone) {
  const p = partsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

export function dateKeyStartIso(dateKey, timeZone = getAppTimeZone()) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let instant = new Date(localAsUtc);
  for (let i = 0; i < 3; i += 1) {
    instant = new Date(localAsUtc - timeZoneOffsetMs(instant, timeZone));
  }
  return instant.toISOString();
}

export function dateKeyBoundsIso(dateKey, timeZone = getAppTimeZone()) {
  return {
    startIso: dateKeyStartIso(dateKey, timeZone),
    endIso: dateKeyStartIso(addDaysToDateKey(dateKey, 1), timeZone),
  };
}
