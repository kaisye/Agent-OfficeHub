import { closeAll } from "./client.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

await migrate();
const r = await seed({ reset: process.argv.includes("--reset") });
console.log(`seed source: ${r.source}`);
console.log(r.skipped ? `workspace "${r.slug}" already exists (use --reset to wipe and reseed)` : `seeded workspace "${r.slug}" (${r.workspaceId})`);
console.log("members:");
for (const [name, id] of Object.entries(r.memberIds)) console.log(`  ${name}: ${id}`);
for (const a of r.agentTokens) console.log(`dev agent token for ${a.owner} (${a.label}): ${a.token}`);
await closeAll();
