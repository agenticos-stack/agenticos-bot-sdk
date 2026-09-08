#!/usr/bin/env node
import { checkGadgetPackage, initGadgetPackage, packGadgetPackage } from './index.js';

try {
  const [command, directory, ...args] = process.argv.slice(2);
  if (!directory || !['init', 'check', 'pack'].includes(command)) throw new Error('Usage: gadget-dev init <new-directory> --template <reviewed-directory> --name <name> | check <directory> --trust-source | pack <directory> --trust-source --output <new.gadget>');
  const options = {};
  const allowed = command === 'init' ? ['template', 'name'] : command === 'pack' ? ['trust-source', 'output'] : ['trust-source'];
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith('--') ? args[i].slice(2) : '';
    if (!allowed.includes(key)) throw new Error(`Unknown option: ${args[i]}`);
    const property = key === 'trust-source' ? 'trustSource' : key;
    if (Object.hasOwn(options, property)) throw new Error(`Duplicate option: --${key}`);
    if (key === 'trust-source') options.trustSource = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
      options[property] = value;
    }
  }
  const operation = command === 'init' ? initGadgetPackage : command === 'check' ? checkGadgetPackage : packGadgetPackage;
  console.log(JSON.stringify(await operation(directory, options)));
  console.log('Local tooling only: no publication, installation, host isolation, or permission authority is implied.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
