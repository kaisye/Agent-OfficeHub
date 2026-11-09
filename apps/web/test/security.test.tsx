import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Markdown } from "@/components/markdown";

afterEach(cleanup);

describe("handoff Markdown (SEC-09)", () => {
  it("links http(s) only; other schemes become plain text", () => {
    const { container } = render(
      <Markdown source={"- [ok](https://github.com/x) and [bad](javascript:alert(1)) and [d](data:text/html,x)"} />,
    );
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("https://github.com/x");
    expect(container.textContent).toContain("bad");
  });
  it("never renders raw HTML", () => {
    const { container } = render(<Markdown source={"<img src=x onerror=alert(1)><script>alert(1)</script>\n- <b>x</b>"} />);
    expect(container.querySelector("img,script,b")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
});
