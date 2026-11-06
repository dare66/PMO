// Central configuration. Secrets come ONLY from the environment - never from source.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
function bool(name: string, def = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: req('DATABASE_URL'),
  jwtSecret: (() => {
    const s = req('JWT_SECRET');
    if (s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    return s;
  })(),
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
  corsOrigin: process.env.CORS_ORIGIN ?? '',
  seedDemo: bool('SEED_DEMO'),
  demoPassword: process.env.DEMO_PASSWORD ?? '',
  adminEmail: process.env.ADMIN_EMAIL ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  cookieSecure: bool('COOKIE_SECURE', false),
  jobsEnabled: bool('JOBS_ENABLED', true),
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'local') as 'local' | 'anthropic' | 'openai_compatible',
    externalAllowed: bool('AI_EXTERNAL_ALLOWED', false),
    model: process.env.AI_MODEL ?? '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL ?? '',
    openaiApiKey: process.env.OPENAI_COMPATIBLE_API_KEY ?? '',
    monthlyTokenBudget: Number(process.env.AI_MONTHLY_TOKEN_BUDGET ?? 2_000_000),
  },
  fileDir: process.env.FILE_STORAGE_DIR ?? '/data/files',
};
export type Config = typeof config;
