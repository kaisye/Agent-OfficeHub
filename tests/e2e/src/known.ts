import { it } from "vitest";

/**
 * A regression test for a CONFIRMED finding. While the finding is open the assertion fails, so we use it.fails
 * (the suite stays green but documents the hole). When the fix lands the test starts passing, vitest flags
 * "expected to fail" and someone must flip it to a normal `it`. Run with OH_QA_STRICT=1 to see the raw failures.
 */
export const known = (id: string, name: string, fn: () => Promise<void> | void) => (process.env.OH_QA_STRICT ? it : it.fails)(`[${id}] ${name}`, fn);

