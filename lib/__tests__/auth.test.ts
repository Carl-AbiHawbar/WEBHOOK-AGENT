import { describe, it, expect } from "vitest";
import { authToken, safeEqual } from "../auth";

describe("authToken", () => {
  it("never contains the password itself", async () => {
    const token = await authToken("hunter2");
    expect(token).not.toContain("hunter2");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same password", async () => {
    expect(await authToken("abc")).toBe(await authToken("abc"));
  });

  it("differs for different passwords", async () => {
    expect(await authToken("abc")).not.toBe(await authToken("abd"));
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("rejects an empty candidate", () => {
    expect(safeEqual("", "secret")).toBe(false);
  });
});
