// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mascot, StatusBadge, requestDirectionLabel } from "./index.js";

describe("Mascot (Desk Buddies)", () => {
  it("renders an <img> with object-fit contain, mood badge and agent badge", () => {
    const { container } = render(<Mascot mascot={{ buddy: "blu" }} presence="blocked" agentBadge size={64} title="Phong" />);
    const img = screen.getByRole("img", { name: "Phong" }) as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.src).toContain("/mascots/blu-256.png");
    expect(img.style.objectFit).toBe("contain");
    expect(container.querySelector("[data-mood-badge='worried']")?.textContent).toBe("!");
    expect(container.querySelector("[data-agent-badge]")).toBeTruthy();
  });
  it("sleeping is desaturated and badges zzz", () => {
    const { container } = render(<Mascot mascot={{ buddy: "pip" }} presence="offline" size={64} />);
    expect((container.querySelector("img") as HTMLImageElement).style.filter).toContain("saturate");
    expect(container.querySelector("[data-mood-badge]")?.textContent).toBe("zzz");
  });
  it("StatusBadge has glyph and Vietnamese text", () => {
    render(<StatusBadge presence="working" />);
    expect(screen.getByText("Đang làm")).toBeTruthy();
  });
});

describe("requestDirectionLabel", () => {
  const base = { askerId: "A", receiverId: "B", messages: [] as never[] };
  it("is viewer-aware", () => {
    expect(requestDirectionLabel({ ...base, status: "sent" }, "A", "Trang", "Minh")).toBe("Bạn hỏi Minh");
    expect(requestDirectionLabel({ ...base, status: "sent" }, "B", "Trang", "Minh")).toBe("Trang hỏi bạn");
    expect(requestDirectionLabel({ ...base, status: "sent" }, "C", "Trang", "Minh")).toBe("Trang hỏi Minh");
    const draft = { ...base, status: "draft" as const, messages: [{ sentById: null, authoredBy: "agent" }] as never[] };
    expect(requestDirectionLabel(draft, "A", "Trang", "Minh")).toBe("Nháp agent của bạn · gửi Minh");
  });
});
