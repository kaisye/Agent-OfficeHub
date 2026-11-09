// Copies the brand mascot images into public/mascots (served at /mascots/*). Runs before dev/build; output is git-ignored.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../../packages/brand/assets/mascots/", import.meta.url));
const to = fileURLToPath(new URL("../public/mascots/", import.meta.url));
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
