import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronRequest } from "../cron-auth";

const req = (authorization?: string) =>
  new NextRequest("http://localhost/api/cron/reminders", { headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("isCronRequest", () => {
  it("accepts the exact bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect(isCronRequest(req("Bearer s3cret-value"))).toBe(true);
  });
  it("refuses wrong, partial, same-length and missing credentials", () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect(isCronRequest(req())).toBe(false);
    expect(isCronRequest(req("Bearer nope"))).toBe(false);
    expect(isCronRequest(req("s3cret-value"))).toBe(false);
    expect(isCronRequest(req("Bearer s3cret-valuX"))).toBe(false);
    // (Headers trims surrounding whitespace itself, so a trailing space can't be tested here.)
    expect(isCronRequest(req("Bearer s3cret-value-extra"))).toBe(false);
  });
  it("refuses everything when CRON_SECRET is not configured", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest(req("Bearer "))).toBe(false);
    delete process.env.CRON_SECRET;
    expect(isCronRequest(req("Bearer undefined"))).toBe(false);
  });
});
