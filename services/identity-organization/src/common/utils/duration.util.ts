// Matches the literal-template type `jsonwebtoken`/`ms` expect for JwtSignOptions.expiresIn.
export type DurationString = `${number}${'s' | 'm' | 'h' | 'd'}`;

export function asDuration(value: string): DurationString {
  if (!/^\d+(s|m|h|d)$/.test(value.trim())) {
    throw new Error(`Invalid duration format: "${value}". Expected e.g. "15m", "7d".`);
  }
  return value as DurationString;
}

const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected e.g. "15m", "7d".`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_TO_MS[unit];
}
