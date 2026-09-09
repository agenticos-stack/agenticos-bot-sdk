#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  DEFAULT_API_ORIGIN, clearCredential, completeSignIn, credentialsPath,
  fetchSession, readCredential, requestSignInCode, writeCredential
} from './session.mjs';

const PACKAGE_COMMANDS = ['init', 'check', 'pack'];
const SESSION_COMMANDS = ['login', 'logout', 'whoami'];
const USAGE = [
  'Usage:',
  '  bot-dev login [--api <origin>] [--email <address>] [--org <id>]',
  '  bot-dev logout [--api <origin>]',
  '  bot-dev whoami [--api <origin>]',
  '  bot-dev init <new-directory> --template <reviewed-directory> --name <name>',
  '  bot-dev check <directory> --trust-source',
  '  bot-dev pack <directory> --trust-source --output <new.gadget>'
].join('\n');

/** Parse `--key value` and `--flag` pairs against an explicit allowlist. */
function parseOptions(args, allowed, flags = []) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (!allowed.includes(key)) throw new Error(`Unknown option: ${args[i]}`);
    const property = key === 'trust-source' ? 'trustSource' : key;
    if (Object.hasOwn(options, property)) throw new Error(`Duplicate option: --${key}`);
    if (flags.includes(key)) options[property] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
      options[property] = value;
    }
  }
  return options;
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(question)).trim(); }
  finally { rl.close(); }
}

async function login(options) {
  const apiOrigin = options.api || DEFAULT_API_ORIGIN;
  const email = options.email || await ask('Email: ');
  await requestSignInCode({ apiOrigin, email });
  console.log(`A sign-in code is on its way to ${email}.`);
  const otp = await ask('Code:  ');
  const { token } = await completeSignIn({ apiOrigin, email, otp });
  // The token never reaches stdout — only where it was written, so somebody
  // can find it, delete it, or check its mode.
  const origin = await writeCredential({ apiOrigin, token, email, orgId: options.org });
  console.log(`Signed in to ${origin}. Credential stored in ${credentialsPath()} (0600).`);
  if (options.org) console.log(`Acting in organization ${options.org}.`);
  else console.log('Acting in your last active organization. Pass --org to pin a different one.');
}

async function logout(options) {
  const apiOrigin = options.api || DEFAULT_API_ORIGIN;
  const removed = await clearCredential({ apiOrigin });
  console.log(removed ? `Signed out of ${apiOrigin}.` : `No stored credential for ${apiOrigin}.`);
}

async function whoami(options) {
  const apiOrigin = options.api || DEFAULT_API_ORIGIN;
  const credential = await readCredential({ apiOrigin });
  if (!credential) { console.log(`Not signed in to ${apiOrigin}.`); return; }
  // Asked of the server, not read off the file: a stored token can have been
  // revoked, and a file that still exists is not a session that still works.
  const session = await fetchSession({ apiOrigin, credential });
  if (!session) { console.log(`Stored credential for ${apiOrigin} is no longer valid. Run \`bot-dev login\`.`); process.exitCode = 1; return; }
  console.log(`${session.email} on ${apiOrigin}${credential.orgId ? ` (organization ${credential.orgId})` : ''}.`);
}

try {
  const [command, ...rest] = process.argv.slice(2);

  if (SESSION_COMMANDS.includes(command)) {
    const options = parseOptions(rest, ['api', 'email', 'org']);
    if (command === 'login') await login(options);
    else if (command === 'logout') await logout(options);
    else await whoami(options);
  } else if (PACKAGE_COMMANDS.includes(command)) {
    const [directory, ...args] = rest;
    if (!directory) throw new Error(USAGE);
    const allowed = command === 'init' ? ['template', 'name'] : command === 'pack' ? ['trust-source', 'output'] : ['trust-source'];
    const options = parseOptions(args, allowed, ['trust-source']);
    // Loaded here rather than at module scope: signing in has nothing to do
    // with archives, and `bot-dev login` should not fail because the packaging
    // dependencies are missing.
    const { checkGadgetPackage, initGadgetPackage, packGadgetPackage } = await import('./index.js');
    const operation = command === 'init' ? initGadgetPackage : command === 'check' ? checkGadgetPackage : packGadgetPackage;
    console.log(JSON.stringify(await operation(directory, options)));
    // Scoped to the packaging commands: it describes what `init`/`check`/`pack`
    // do, and saying it after `login` would be false.
    console.log('Local tooling only: no publication, installation, host isolation, or permission authority is implied.');
  } else {
    throw new Error(USAGE);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
