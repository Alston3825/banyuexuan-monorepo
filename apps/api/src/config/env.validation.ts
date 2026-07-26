const REQUIRED_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`);
  }
  return config;
}
