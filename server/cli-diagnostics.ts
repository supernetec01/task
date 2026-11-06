/** Stable, non-secret diagnostics; never serialize PG errors or connection URLs. */
export function cliFailure(error: any) {
  const codes = [error?.code, ...(error?.errors || []).map((child: any) => child?.code)];
  const known: Record<string, { message: string; hint: string }> = {
    CONFIG_REQUIRED: {
      message: 'DATABASE_URL is not configured.',
      hint: 'Set DATABASE_URL privately in the project .env, then retry.',
    },
    CONFIG_INVALID: {
      message:
        'The database connection configuration is invalid or still contains a template password.',
      hint: 'Edit DATABASE_URL (or MIGRATION_DATABASE_URL for migrate) in .env; never paste it into chat.',
    },
    ECONNREFUSED: {
      message: 'PostgreSQL refused the connection.',
      hint: 'Start the PostgreSQL Windows service. Check the host and port in .env; use 127.0.0.1 for a local server, then run npm run migrate.',
    },
    ENOTFOUND: {
      message: 'The PostgreSQL host could not be resolved.',
      hint: 'Check the database hostname in the private .env configuration.',
    },
    '28P01': {
      message: 'PostgreSQL rejected the database username/password.',
      hint: 'Correct the database credentials in .env. This is the database password, not the website admin password.',
    },
    '28000': {
      message: 'PostgreSQL denied authentication.',
      hint: 'Check the local PostgreSQL pg_hba.conf and database account configuration.',
    },
    '3D000': {
      message: 'The configured PostgreSQL database does not exist.',
      hint: 'Create the intended database with pgAdmin or createdb, then run npm run migrate.',
    },
    '42703': {
      message: 'The database schema does not contain a required column (possibly username).',
      hint: 'Run npm run migrate successfully, then run Bootstrap.ps1 again.',
    },
    '42P01': {
      message: 'The database schema has not been initialized.',
      hint: 'Run npm run migrate against the intended database before bootstrap.',
    },
    '42501': {
      message: 'The database account lacks the required privileges.',
      hint: 'Use the configured migration role for migrations; give the application role the documented DML privileges.',
    },
    ETIMEDOUT: {
      message: 'The database connection timed out.',
      hint: 'Check the PostgreSQL service, host, port and local firewall.',
    },
    EPERM: {
      message: 'The execution environment denied access to the database socket.',
      hint: 'Check execution permissions; do not reset the database or replace credentials to work around a socket denial.',
    },
  };
  const code = codes.find((code) => code && known[code]);
  if (code) return { code, ...known[code] };
  if (/timeout|timed out/i.test(String(error?.message || '')))
    return { code: 'ETIMEDOUT', ...known.ETIMEDOUT };
  const safeMessages = [
    'Passwords do not match; no account was created.',
    'Bootstrap cancelled.',
    'Administrator password must contain at least 11 characters (maximum 1024).',
    'Username admin already exists but is disabled or lacks Admin access. Nothing changed; ask the current administrator to review it.',
    'Interactive terminal required. Use Bootstrap.ps1 or set ADMIN_PASSWORD securely.',
  ];
  return {
    code: 'CLI_FAILED',
    message: safeMessages.includes(error?.message)
      ? error.message
      : 'The command failed before it could complete.',
    hint: 'Check the Node.js version, npm ci, npm run build, database setup and file permissions. No password or data was overwritten.',
  };
}

export function requireDatabaseConfiguration(command: string) {
  const value =
    command === 'migrate'
      ? process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
      : process.env.DATABASE_URL;
  if (!value)
    throw Object.assign(new Error('Database configuration missing'), { code: 'CONFIG_REQUIRED' });
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1) ||
      url.password.includes('REPLACE_WITH')
    )
      throw Error();
  } catch {
    throw Object.assign(new Error('Invalid database configuration'), { code: 'CONFIG_INVALID' });
  }
}
