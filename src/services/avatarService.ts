/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AvatarGenerationResult {
  success: boolean;
  modelId: string;
  avatarUrl: string;
  prompt: string;
  error?: string;
}

const avatarCache = new Map<string, string>();

/**
 * Triggers the local media generation toolkit to generate a 3D animated portrait avatar
 * for the specified model (e.g. WAN-2.2 or LTX-2.5) and caches the resulting URL.
 */
export async function generateModelAvatar(
  modelName: string,
  customPrompt?: string,
  threadId: string = 'th-main-001'
): Promise<AvatarGenerationResult> {
  const cleanModelId = modelName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  
  try {
    const res = await fetch('/v1/multigen/avatars/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: cleanModelId,
        prompt: customPrompt || `Futuristic 3D animated cybernetic portrait avatar for ${modelName}, high-tech cinematic HUD, neon lighting, 8k resolution`,
        threadId,
      }),
    });

    const data = await res.json();
    if (res.ok && data?.avatarUrl) {
      avatarCache.set(cleanModelId, data.avatarUrl);
      return {
        success: true,
        modelId: cleanModelId,
        avatarUrl: data.avatarUrl,
        prompt: data.prompt || customPrompt || '',
      };
    } else {
      return {
        success: false,
        modelId: cleanModelId,
        avatarUrl: avatarCache.get(cleanModelId) || '',
        prompt: customPrompt || '',
        error: data?.error || 'Failed to generate model avatar via media toolkit',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      modelId: cleanModelId,
      avatarUrl: avatarCache.get(cleanModelId) || '',
      prompt: customPrompt || '',
      error: err?.message || 'Network error during avatar generation',
    };
  }
}

export function getCachedModelAvatar(modelName: string): string | undefined {
  return avatarCache.get(modelName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'));
}
