import type {
  AiProvider,
  ProviderRequest,
  ProviderResult,
} from "../../../packages/ai-gateway/src/provider.js";

export class RecordingAiProvider implements AiProvider {
  readonly name = "recording-test-provider";
  readonly requests: ProviderRequest[] = [];
  constructor(private readonly result: ProviderResult) {}
  readiness() {
    return { configured: true };
  }
  async invoke(request: ProviderRequest): Promise<ProviderResult> {
    this.requests.push(request);
    return this.result;
  }
}
