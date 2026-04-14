import { describe, expect, it } from "vitest";
import {
  getAdapterCompat,
  getAdapterCompatMessage,
} from "../src/adapter-compat.js";

describe("getAdapterCompat", () => {
  it("returns supported for claude_local", () => {
    expect(getAdapterCompat("claude_local")).toBe("supported");
  });

  it("returns supported for opencode_local", () => {
    expect(getAdapterCompat("opencode_local")).toBe("supported");
  });

  it("returns partial for process", () => {
    expect(getAdapterCompat("process")).toBe("partial");
  });

  it("returns unsupported for unknown adapters", () => {
    expect(getAdapterCompat("unknown_adapter")).toBe("unsupported");
    expect(getAdapterCompat("cursor")).toBe("unsupported");
  });
});

describe("getAdapterCompatMessage", () => {
  it("returns a supported message for claude_local", () => {
    expect(getAdapterCompatMessage("claude_local", "supported")).toContain(
      "natively supports GSD",
    );
  });

  it("returns a supported message for opencode_local", () => {
    expect(getAdapterCompatMessage("opencode_local", "supported")).toContain(
      "natively supports GSD",
    );
  });

  it("returns a partial message for process", () => {
    expect(getAdapterCompatMessage("process", "partial")).toContain(
      "may support GSD",
    );
  });

  it("returns an unsupported message for unknown adapters", () => {
    const msg = getAdapterCompatMessage("cursor", "unsupported");
    expect(msg).toContain("does not currently support GSD");
  });
});
