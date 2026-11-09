import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildTailwindThemeCss, buildTokensCss } from "../src/tokens.js";

const dir = fileURLToPath(new URL("../src/", import.meta.url));
writeFileSync(dir + "tokens.css", buildTokensCss());
writeFileSync(dir + "tailwind-theme.css", buildTailwindThemeCss());
console.log("wrote tokens.css and tailwind-theme.css");
