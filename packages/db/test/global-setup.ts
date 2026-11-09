import { migrate } from "../src/migrate.js";

export default async function setup() {
  await migrate();
}
