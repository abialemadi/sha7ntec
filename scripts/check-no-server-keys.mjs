#!/usr/bin/env node
/**
 * Fails the build if a server-only secret is referenced from a client
 * ("use client") component or otherwise risks being bundled into the browser.
 *
 * Spec §12: "If any server-only key ever appears in client code, the build
 * should fail."
 *
 * Rules:
 *  - Server-only env vars (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
 *    OILPRICE_API_KEY) may only be read in files under src/app/api/**,
 *    files named *.server.ts, or src/lib/supabase/admin.ts.
 *  - Any file carrying the "use client" directive must not reference them
 *    at all, and must not import src/lib/supabase/admin.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const SERVER_ONLY_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OILPRICE_API_KEY',
];

// Paths where reading server-only secrets is legitimate.
const SERVER_ALLOWLIST = [
  /^src[\\/]app[\\/]api[\\/]/,
  /\.server\.ts$/,
  /^src[\\/]lib[\\/]supabase[\\/]admin\.ts$/,
  /^scripts[\\/]/,
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const content = readFileSync(file, 'utf8');
  const isClient = /^\s*['"]use client['"]/m.test(content);
  // `import 'server-only'` makes the build fail if the module reaches the
  // client bundle, so it is a valid server context for reading secrets.
  const hasServerOnly = /import\s+['"]server-only['"]/.test(content);
  const allowedServer = hasServerOnly || SERVER_ALLOWLIST.some((re) => re.test(rel));

  for (const key of SERVER_ONLY_KEYS) {
    if (content.includes(key)) {
      if (isClient) {
        violations.push(`${rel}: references server-only key ${key} in a "use client" file`);
      } else if (!allowedServer) {
        violations.push(
          `${rel}: references server-only key ${key} outside an allowed server path`,
        );
      }
    }
  }

  if (isClient && /supabase\/admin/.test(content)) {
    violations.push(`${rel}: "use client" file imports the service-role admin client`);
  }
}

if (violations.length > 0) {
  console.error('\n✗ Server-only secret leak check FAILED:\n');
  for (const v of violations) console.error('  - ' + v);
  console.error('\nServer-only keys must never reach the browser bundle.\n');
  process.exit(1);
}

console.log('✓ No server-only secrets leaked into client code.');
