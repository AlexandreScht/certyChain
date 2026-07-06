/**
 * Flattens a partial query object into the `Record<string, string>` shape the
 * typed hono client (`hc`) expects for `{ query }` — dropping empty entries so
 * optional filters never serialize as the literal string "undefined".
 */
export function toQueryRecord(
  params: Record<string, string | number | boolean | undefined | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return out;
}
