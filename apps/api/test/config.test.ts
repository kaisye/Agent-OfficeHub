import { describe, expect, it } from "vitest";
import { assertSafeForProduction, DEFAULT_SESSION_SECRET } from "../src/config.js";

const strong = "x".repeat(48);

describe("SEC-06: production fails closed", () => {
  it("refuses dev login in production", () => {
    expect(() => assertSafeForProduction({ devLoginEnabled: true, sessionSecret: strong }, "production")).toThrow(/DEV_LOGIN_ENABLED/);
  });
  it("refuses the default or a short session secret in production", () => {
    expect(() => assertSafeForProduction({ devLoginEnabled: false, sessionSecret: DEFAULT_SESSION_SECRET }, "production")).toThrow(/SESSION_SECRET/);
    expect(() => assertSafeForProduction({ devLoginEnabled: false, sessionSecret: "short" }, "production")).toThrow(/SESSION_SECRET/);
  });
  it("accepts a safe production config, and anything outside production", () => {
    expect(() => assertSafeForProduction({ devLoginEnabled: false, sessionSecret: strong }, "production")).not.toThrow();
    expect(() => assertSafeForProduction({ devLoginEnabled: true, sessionSecret: DEFAULT_SESSION_SECRET }, "test")).not.toThrow();
  });
});
