import http from "k6/http";
import { check, fail, sleep } from "k6";

export const options = {
  setupTimeout: "45s",
  scenarios: {
    authenticated_api: {
      executor: "per-vu-iterations",
      vus: 50,
      iterations: 5,
      maxDuration: "30s",
    },
  },
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"],
    "http_req_duration{endpoint:authenticated-households}": ["p(95)<400"],
  },
};

const apiUrl = requiredEnvironment("K6_API_URL");
const appOrigin = requiredEnvironment("K6_APP_ORIGIN");
const mailpitUrl = requiredEnvironment("K6_MAILPIT_URL");

export function setup() {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const email = `k6-${runId}@example.test`;
  const password = `k6 local performance password ${runId}`;
  const signup = jsonRequest("POST", `${apiUrl}/api/auth/sign-up/email`, {
    name: "K6 Local Performance User",
    email,
    password,
  });
  requireCheck(signup, "signup", 200);

  const verificationUrl = awaitVerificationUrl(email);
  const verification = http.get(
    verificationUrl.replace(/^https?:\/\/[^/]+/u, apiUrl),
    { redirects: 0, headers: { origin: appOrigin } },
  );
  if (![200, 302].includes(verification.status))
    fail(`verification returned ${verification.status}`);

  const signIn = jsonRequest("POST", `${apiUrl}/api/auth/sign-in/email`, {
    email,
    password,
  });
  requireCheck(signIn, "sign-in", 200);
  const cookie = cookieHeader(signIn);
  if (!cookie) fail("sign-in did not return a server-side session cookie");

  const household = jsonRequest(
    "POST",
    `${apiUrl}/v1/households`,
    {
      organizationName: "K6 Local Organization",
      householdName: "K6 Local Household",
      ownerDisplayName: "K6 Local Owner",
    },
    {
      cookie,
      "idempotency-key": `k6-household-${runId}`,
      "if-match": "0",
    },
  );
  requireCheck(household, "household creation", 201);
  return { cookie };
}

export default function (data) {
  const response = http.get(`${apiUrl}/v1/households`, {
    headers: { accept: "application/json", cookie: data.cookie },
    tags: { endpoint: "authenticated-households" },
  });
  check(response, {
    "authenticated household list returns 200": (result) =>
      result.status === 200,
    "authenticated response is non-cacheable": (result) =>
      result.headers["Cache-Control"] === "no-store",
    "authenticated response contains one household": (result) => {
      try {
        return JSON.parse(result.body).households.length === 1;
      } catch {
        return false;
      }
    },
  });
  sleep(0.05);
}

function awaitVerificationUrl(email) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = http.get(`${mailpitUrl}/api/v1/messages`);
    if (response.status === 200) {
      const messages = JSON.parse(response.body).messages || [];
      const message = messages.find((candidate) =>
        (candidate.To || []).some((recipient) => recipient.Address === email),
      );
      if (message) {
        const body = http.get(`${mailpitUrl}/view/${message.ID}.txt`);
        const match = body.body.match(
          /https?:\/\/[^\s<]+\/api\/auth\/verify-email\?[^\s<]+/u,
        );
        if (match) return match[0].replace(/&amp;/gu, "&");
      }
    }
    sleep(0.25);
  }
  fail("verification email was not captured within five seconds");
}

function jsonRequest(method, url, body, additionalHeaders = {}) {
  return http.request(method, url, JSON.stringify(body), {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: appOrigin,
      ...additionalHeaders,
    },
  });
}

function cookieHeader(response) {
  return Object.keys(response.cookies)
    .sort()
    .map((name) => `${name}=${response.cookies[name][0].value}`)
    .join("; ");
}

function requireCheck(response, label, expectedStatus) {
  if (response.status !== expectedStatus)
    fail(`${label} returned ${response.status}`);
}

function requiredEnvironment(name) {
  const value = __ENV[name];
  if (!value) fail(`${name} is required`);
  return value.replace(/\/$/u, "");
}
