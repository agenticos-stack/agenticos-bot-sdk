import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const sdk = fileURLToPath(new URL("../packages/sdk/", import.meta.url));
const compiler = fileURLToPath(new URL("../node_modules/.bin/tsc", import.meta.url));

test("an empty consumer installs and imports only the packed SDK, offline", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "gadget-sdk-consumer-"));
  try {
    const consumer = join(scratch, "consumer");
    await mkdir(consumer);
    const config = join(scratch, "empty.npmrc");
    const globalConfig = join(scratch, "global.npmrc");
    await writeFile(config, "");
    await writeFile(globalConfig, "");
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: scratch };
    const npm = args => execFileSync("npm", [
      "--userconfig", config, "--globalconfig", globalConfig,
      "--cache", join(scratch, "cache"), ...args
    ], { cwd: consumer, env, encoding: "utf8", timeout: 60_000 });
    const packed = JSON.parse(npm(["pack", sdk, "--ignore-scripts", "--offline", "--json", "--pack-destination", scratch]))[0];
    assert.deepEqual(packed.files.map(file => file.path).sort(), ["README.md", "index.d.ts", "index.js", "package.json"]);
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "isolated-consumer", private: true, type: "module" }));
    npm(["install", join(scratch, packed.filename), "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const installed = JSON.parse(await readFile(join(consumer, "node_modules/@agenticos/gadget-sdk/package.json"), "utf8"));
    assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
    const lock = JSON.parse(await readFile(join(consumer, "package-lock.json"), "utf8"));
    assert.deepEqual(Object.keys(lock.packages).sort(), ["", "node_modules/@agenticos/gadget-sdk"]);
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import {createFixtureTransport, createFixtureChatAdapter, GADGET_TRANSPORT_PROTOCOL} from '@agenticos/gadget-sdk';
      const transport = createFixtureTransport({handlers:{read:()=>({ok:true,value:'fixture'})}});
      assert.equal(transport.mode, 'fixture');
      const call = method => transport.call({protocolVersion:GADGET_TRANSPORT_PROTOCOL,method});
      assert.deepEqual(await call('read'), {ok:true,value:'fixture'});
      assert.equal((await call('publish')).code, 'unknown_method');
      transport.close();
      assert.equal((await call('read')).code, 'transport_closed');
      const chat = createFixtureChatAdapter({context:{workspaceId:'fixture',conversationId:'chat'}});
      assert.equal((await chat.send({text:'Hello'})).code, 'unknown_method');
      chat.close();
      console.log('isolated package import passed');
    `], { cwd: consumer, env, encoding: "utf8", timeout: 10_000 });
    assert.match(output, /isolated package import passed/);
    await writeFile(join(consumer, "consumer.mts"), await readFile(new URL("./consumer-types.mts", import.meta.url), "utf8"));
    await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
        strict: true, noEmit: true, types: [], skipLibCheck: false
      },
      files: ["consumer.mts"]
    }));
    execFileSync(compiler, ["--project", join(consumer, "tsconfig.json")], {
      cwd: consumer, env, encoding: "utf8", timeout: 30_000
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
