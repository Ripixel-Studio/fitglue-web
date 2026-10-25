import { client } from '../../shared/api/client';
import type { components } from '../../shared/api/schema-client';

// PendingInput is a Firestore document — typed from the proto-generated TS type.
export type { PendingInput } from '../../types/pb/models/pipeline/pending_input';

type SubmitInputRequest = components['schemas']['SubmitInputGatewayRequest'];

export interface InputResolutionRequest {
  activityId: string;
  inputData?: Record<string, string>;
}

export interface IInputsService {
  resolveInput(request: InputResolutionRequest): Promise<boolean>;
  dismissInput(activityId: string): Promise<boolean>;
  cancelPipeline(pendingInputId: string): Promise<boolean>;
  cancelPipelineRun(runId: string): Promise<boolean>;
}

export const InputsService: IInputsService = {
  async resolveInput(request) {
    const body: SubmitInputRequest = {
      inputId: request.activityId,
      inputData: request.inputData ?? {},
    };
    await client.POST('/users/me/pending-inputs/{inputId}/submit', {
      params: { path: { inputId: request.activityId } },
      body,
    });
    return true;
  },

  async dismissInput(activityId: string) {
    const body: SubmitInputRequest = {
      inputId: activityId,
      inputData: {},
    };
    await client.POST('/users/me/pending-inputs/{inputId}/submit', {
      params: { path: { inputId: activityId } },
      body,
    });
    return true;
  },

  async cancelPipeline(pendingInputId: string) {
    await client.POST('/users/me/pending-inputs/{inputId}/cancel', {
      params: { path: { inputId: pendingInputId } },
      body: { inputId: pendingInputId },
    });
    return true;
  },

  async cancelPipelineRun(runId: string) {
    await client.POST('/users/me/pipeline-runs/{runId}/cancel', {
      params: { path: { runId } },
      body: { runId },
    });
    return true;
  },
};
