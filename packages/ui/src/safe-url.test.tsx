import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TaskChip, safeExternalHref } from "./index.js";

afterEach(cleanup);

describe("safeExternalHref (SEC-09)", () => {
  it("accepts http and https", () => {
    expect(safeExternalHref("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
    expect(safeExternalHref("  HTTP://example.com/a b ")).toBe("http://example.com/a%20b");
  });
  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:x",
    "file:///etc/passwd",
    "//evil.com",
    "/relative",
    "https://",
    "ftp://x.com",
    "",
    "not a url",
  ])("rejects %j", (v) => {
    expect(safeExternalHref(v)).toBeNull();
  });
  it("rejects non-strings", () => {
    expect(safeExternalHref(null)).toBeNull();
    expect(safeExternalHref(undefined)).toBeNull();
    expect(safeExternalHref(42)).toBeNull();
  });
});

describe("TaskChip href", () => {
  const base = { source: "github_pr" as const, externalKey: "PR-1", title: "Sửa lỗi", state: "open" as const };
  it("renders a link for https", () => {
    render(<TaskChip task={{ ...base, externalUrl: "https://github.com/o/r/pull/1" }} />);
    expect(document.querySelector("a")?.getAttribute("href")).toBe("https://github.com/o/r/pull/1");
  });
  it("renders plain text for javascript:", () => {
    render(<TaskChip task={{ ...base, externalUrl: "javascript:alert(1)" }} />);
    expect(document.querySelector("a")).toBeNull();
    expect(screen.getAllByText("Sửa lỗi").length).toBeGreaterThan(0);
  });
});
