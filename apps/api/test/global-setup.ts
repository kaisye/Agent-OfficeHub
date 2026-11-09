import { migrate } from "@officehub/db/testing";

export default async function setup() {
  await migrate();
}
