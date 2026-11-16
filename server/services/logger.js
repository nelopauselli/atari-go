/**
 * Logs de eventos de la app en una línea por evento, con nombre fijo y campos clave=valor:
 *
 *   2026-11-15T22:00:00.000Z INFO  match.end matchId=… roomId=… reason=capture moves=23
 *
 * Así se puede filtrar con grep por evento (`match.end`) o seguir una entidad de punta a
 * punta (`matchId=…`, `playerId=…`). Los valores con espacios van entre comillas.
 * LOG_LEVEL (debug | info | warn | error, por defecto info) define desde qué nivel se escribe.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[String(process.env.LOG_LEVEL || '').toLowerCase()] || LEVELS.info;

function formatValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') value = JSON.stringify(value);
  const text = String(value);
  return text === '' || /[\s"=]/.test(text) ? JSON.stringify(text) : text;
}

function write(level, event, fields = {}) {
  if (LEVELS[level] < minLevel) return;
  let err = null;
  const parts = [new Date().toISOString(), level.toUpperCase().padEnd(5), event];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Error) {
      err = value;
      parts.push(`${key}=${formatValue(value.message)}`);
      continue;
    }
    parts.push(`${key}=${formatValue(value)}`);
  }
  let line = parts.join(' ');
  if (err && err.stack) line += `\n${err.stack}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (event, fields) => write('debug', event, fields),
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};
