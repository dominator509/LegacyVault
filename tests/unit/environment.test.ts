import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";

describe("environment", () => {
  it("permits explicit local engineering mode outside production", () => {
    expect(loadEnvironment({ LOCAL_ENGINEERING_MODE: "true" }).LOCAL_ENGINEERING_MODE).toBe(true);
  });

  it("fails closed when local engineering mode reaches production", () => {
    expect(() => loadEnvironment({ NODE_ENV: "production", LOCAL_ENGINEERING_MODE: "true" })).toThrow();
  });

  it("requires production database and session configuration", () => {
    expect(() => loadEnvironment({ NODE_ENV: "production" })).toThrow();
  });
});
