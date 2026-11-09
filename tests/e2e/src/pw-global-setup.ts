import { cleanup, snapshotCards, type CardSnapshot } from "./cleanup.js";
import { closeSql } from "./helpers.js";

let cards: CardSnapshot | undefined;

export default async function globalSetup() {
  cards = await snapshotCards();
  return async () => {
    await cleanup(cards).catch((e) => console.error("QA cleanup failed:", e.message));
    await closeSql();
  };
}
