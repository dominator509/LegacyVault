import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  currentPersonId,
} from "../../apps/web/app/_lib/api-client.js";

function browserState(selectedHousehold?: string) {
  const values = new Map<string, string>();
  if (selectedHousehold)
    values.set("legacy-vault.household-id", selectedHousehold);
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  vi.stubGlobal("window", { localStorage });
  return values;
}

function householdResponse() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        households: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        ],
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("authenticated client self identity", () => {
  it("uses the caller's membership for the active household", async () => {
    browserState("22222222-2222-4222-8222-222222222222");
    householdResponse();
    await expect(currentPersonId()).resolves.toBe(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
  });

  it("selects the first accessible household when local state is absent", async () => {
    const values = browserState();
    householdResponse();
    await expect(currentPersonId()).resolves.toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(values.get("legacy-vault.household-id")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("selects once before a tenant request and forwards the household header", async () => {
    const values = browserState();
    const fetchDouble = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          households: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ facts: [] }));
    vi.stubGlobal("fetch", fetchDouble);
    await expect(apiRequest("/v1/facts")).resolves.toEqual({ facts: [] });
    const secondRequest = fetchDouble.mock.calls[1];
    expect(secondRequest?.[0]).toBe("/v1/facts");
    expect(new Headers(secondRequest?.[1]?.headers).get("x-household-id")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(values.get("legacy-vault.household-id")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});
