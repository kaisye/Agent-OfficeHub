import { migrate } from "./migrate.js";

const applied = await migrate((s) => console.log(s));
console.log(applied.length ? `done (${applied.length} applied)` : "up to date");
