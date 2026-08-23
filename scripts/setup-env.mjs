import { copyFileSync, existsSync } from 'node:fs';

// .env is gitignored, so a fresh clone has none. This runs before pnpm install
// because the api's postinstall (prisma generate) reads DATABASE_URL from it
// and refuses to load its config without one.
for (const app of ['api', 'web']) {
  const target = `${app}/.env`;

  if (existsSync(target)) {
    console.log(`${target} exists, leaving it alone`);
    continue;
  }

  copyFileSync(`${app}/.env.example`, target);
  console.log(`created ${target}`);
}
