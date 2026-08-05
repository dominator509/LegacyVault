import { loadEnvironment } from "@legacy/contracts/environment";

const environment = loadEnvironment(process.env);
process.stdout.write(
  JSON.stringify({ service: "worker", environment: environment.NODE_ENV, status: "ready" }) + "\n",
);
