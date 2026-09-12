#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import {
  DEFAULT_API_ORIGIN, archiveDevWorkspace, clearCredential, completeSignIn, credentialsPath,
  defaultGadgetDevTitle, devSessionEnv, devSessionOrgWarnings, fetchSession, forgetDevSession,
  grantDevDoors, mintBanner, parseGrantKeys, readCredential, requestSignInCode, startDevSession,
  writeCredential
} from './session.mjs';

const PACKAGE_COMMANDS = ['init', 'check', 'pack'];
const SESSION_COMMANDS = ['login', 'logout', 'whoami'];
const DEV_COMMAND = 'dev';
const USAGE = [
  'Usage:',
  '  bot-dev login [--api <origin>] [--email <address>] [--org <id>]',
  '  bot-dev logout [--api <origin>]',
  '  bot-dev whoami [--api <origin>]',
  '  bot-dev dev --gadget <key> [--title <text>] [--grant <keys>] [--api <origin>] [--org <id>] [--fresh] -- <command...>',
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

/**
 * Mint a development session and run a gadget host with it.
 *
 * The host is handed a session token — one organization, one workspace, one
 * gadget key, eight hours — through the child's environment. The sign-in
 * credential stays in this process, and neither ever reaches stdout.
 */
async function dev(options, argv) {
  const separator = argv.indexOf('--');
  if (separator === -1 || separator === argv.length - 1) {
    throw new Error('Name the host command after `--`, for example: bot-dev dev --gadget social_localization --org <id> --title "Social Content (dev)" --grant metered_fetch -- pnpm preview');
  }
  const parsed = parseOptions(argv.slice(0, separator), ['api', 'org', 'gadget', 'title', 'grant', 'fresh'], ['fresh']);
  const [file, ...args] = argv.slice(separator + 1);
  const apiOrigin = parsed.api || DEFAULT_API_ORIGIN;
  const credential = await readCredential({ apiOrigin });
  if (!credential) throw new Error(`Not signed in to ${apiOrigin}. Run \`bot-dev login\` first.`);
  if (parsed.org) credential.orgId = parsed.org;
  const gadgetKey = parsed.gadget;
  const title = parsed.title || defaultGadgetDevTitle(gadgetKey);
  const grantKeys = parseGrantKeys(parsed.grant);

  const session = await startDevSession({
    apiOrigin, credential, gadgetKey, title, fresh: Boolean(parsed.fresh)
  });
  // The workspace id and Studio URL are a room somebody can open; the token
  // is a credential and is not printed.
  console.log(mintBanner(session));
  for (const warning of await devSessionOrgWarnings({
    apiOrigin, gadgetKey, credentialOrgId: credential.orgId, session
  })) {
    console.warn(`Warning: ${warning}`);
  }
  if (grantKeys.length) {
    const granted = await grantDevDoors({
      apiOrigin, credential, workspaceId: session.workspaceId, keys: grantKeys
    });
    console.log(`Granted ${granted.join(', ')}. Restart the host if it already resolved doors at startup.`);
  }

  const child = spawn(file, args, {
    stdio: 'inherit',
    env: { ...process.env, ...devSessionEnv(session) }
  });
  let finished = false;
  const settle = async (code) => {
    if (finished) return;
    finished = true;
    try {
      await archiveDevWorkspace({ apiOrigin, credential, workspaceId: session.workspaceId });
      await forgetDevSession({ apiOrigin, gadgetKey, orgId: credential.orgId });
      console.log(`Archived ${session.workspaceId}.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = code;
  };
  const code = await new Promise((resolveExit) => {
    const onSignal = () => {
      child.kill('SIGTERM');
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    child.on('error', (error) => { console.error(error.message); resolveExit(1); });
    child.on('close', (status, signal) => resolveExit(signal ? 1 : status ?? 0));
  });
  await settle(code);
}

try {
  const [command, ...rest] = process.argv.slice(2);

  if (command === DEV_COMMAND) {
    await dev({}, rest);
  } else if (SESSION_COMMANDS.includes(command)) {
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
