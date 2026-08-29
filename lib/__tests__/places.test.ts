import { describe, it, expect, vi } from "vitest";
import { textSearch, PlacesApiError, FIELD_MASK } from "../places";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const baseArgs = { query: "plumbers in Austin", apiKey: "test-key", maxPages: 3 };

describe("textSearch", () => {
  it("sends the key and field mask as headers, never in the body", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ places: [] }));
    await textSearch({ ...baseArgs, fetchImpl });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe(FIELD_MASK);
    expect(init.body).not.toContain("test-key");
  });

  it("requests websiteUri, without which no lead can be identified", () => {
    expect(FIELD_MASK).toContain("places.websiteUri");
  });

  it("stops after one request when there is no next page", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ places: [{ id: "a" }] }));
    const result = await textSearch({ ...baseArgs, fetchImpl });

    expect(result.requestsUsed).toBe(1);
    expect(result.places).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it("follows nextPageToken and accumulates every page", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ places: [{ id: "a" }], nextPageToken: "t1" }))
      .mockResolvedValueOnce(jsonResponse({ places: [{ id: "b" }], nextPageToken: "t2" }))
      .mockResolvedValueOnce(jsonResponse({ places: [{ id: "c" }] }));

    const result = await textSearch({ ...baseArgs, fetchImpl });

    expect(result.places.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(result.requestsUsed).toBe(3);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).pageToken).toBe("t1");
  });

  it("honours maxPages as a cost ceiling and reports truncation", async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ places: [{ id: "a" }], nextPageToken: "more" }));

    const result = await textSearch({ ...baseArgs, maxPages: 1, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.truncated).toBe(true);
  });

  it("never exceeds Google's 3-page limit even if asked to", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ places: [], nextPageToken: "more" }));

    await textSearch({ ...baseArgs, maxPages: 99, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("explains a rejected key rather than leaking the raw body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "API key not valid" } }, 403));

    await expect(textSearch({ ...baseArgs, fetchImpl })).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("API key not valid"),
    });
  });

  it("flags quota exhaustion distinctly so it can be retried later", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "quota" } }, 429));

    const error = await textSearch({ ...baseArgs, fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(PlacesApiError);
    expect(error.status).toBe(429);
    expect(error.hint).toContain("Quotas");
  });

  it("surfaces a field mask rejection with a usable hint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "Invalid field mask" } }, 400));

    const error = await textSearch({ ...baseArgs, fetchImpl }).catch((e) => e);
    expect(error.hint).toContain("field mask");
  });

  it("copes with a non-JSON error body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("upstream exploded", { status: 500 }));

    const error = await textSearch({ ...baseArgs, fetchImpl }).catch((e) => e);
    expect(error.message).toContain("upstream exploded");
  });

  it("treats a response with no places array as empty, not a crash", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await textSearch({ ...baseArgs, fetchImpl });
    expect(result.places).toEqual([]);
  });
});
