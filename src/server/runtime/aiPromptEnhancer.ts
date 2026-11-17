/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  AiSmartEnhanceResponse,
  StructuredVideoPrompt,
} from '../../types/nexus.ts';
import {
  compileStructuredPromptText,
  parseStructuredPromptFromText,
  scoreStructuredPromptCompleteness,
} from '../../utils/structuredVideoPrompt.ts';
import {
  AiGeneratedStructurePayload,
  buildAiEnhanceSystemInstruction,
  buildAiEnhanceUserPrompt,
  mergeAiEnhancedStructure,
  resolveSelectedStyleTag,
} from '../../utils/aiSmartEnhance.ts';

export class AiPromptEnhanceError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AiPromptEnhanceError';
    this.statusCode = statusCode;
  }
}

export interface AiPromptEnhanceParams {
  rawPrompt?: string;
  structuredPrompt?: StructuredVideoPrompt;
  selectedStyleTagId?: string;
  apiKeyOverride?: string;
  generateContentOverride?: (args: {
    model: string;
    contents: string;
    systemInstruction: string;
  }) => Promise<string>;
}

const GEMINI_MODEL = 'gemini-4-hydrogen';

export async function enhanceStructuredPromptWithGemini(
  params: AiPromptEnhanceParams
): Promise<AiSmartEnhanceResponse> {
  const rawInput =
    typeof params.rawPrompt === 'string' && params.rawPrompt.trim()
      ? params.rawPrompt.trim()
      : params.structuredPrompt?.rawPrompt?.trim() || '';

  if (!rawInput) {
    throw new AiPromptEnhanceError(
      400,
      'Zadejte prosím základní popis scény před spuštěním AI Smart Enhance.'
    );
  }

  const baseStructured: StructuredVideoPrompt = params.structuredPrompt
    ? {
        ...structuredClone(params.structuredPrompt),
        rawPrompt: rawInput,
      }
    : parseStructuredPromptFromText(rawInput);

  const styleInfo = resolveSelectedStyleTag(baseStructured, params.selectedStyleTagId);
  const systemInstruction = buildAiEnhanceSystemInstruction(styleInfo);
  const userPrompt = buildAiEnhanceUserPrompt(rawInput, baseStructured, styleInfo);

  let rawJsonText = '';

  if (params.generateContentOverride) {
    rawJsonText = await params.generateContentOverride({
      model: GEMINI_MODEL,
      contents: userPrompt,
      systemInstruction,
    });
  } else {
    const apiKey = params.apiKeyOverride ?? process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
      throw new AiPromptEnhanceError(
        503,
        'AI Smart Enhance vyžaduje nastavený GEMINI_API_KEY v Settings > Secrets. Pro okamžité offline rozšíření bez API použijte tlačítko "Chytře vylepšit (Lokálně)".'
      );
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              expandedRawPrompt: { type: Type.STRING },
              primarySubject: { type: Type.STRING },
              subjectAction: { type: Type.STRING },
              environment: { type: Type.STRING },
              composition: { type: Type.STRING },
              lighting: { type: Type.STRING },
              optics: { type: Type.STRING },
              atmosphere: { type: Type.STRING },
              cameraMotion: { type: Type.STRING },
              motionIntensity: { type: Type.INTEGER },
              cinematicNotes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              beats: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phase: { type: Type.STRING },
                    beatTitle: { type: Type.STRING },
                    sceneDescription: { type: Type.STRING },
                    subjectEvolution: { type: Type.STRING },
                    cameraKeyframe: { type: Type.STRING },
                    lightingShift: { type: Type.STRING },
                    transitionIn: { type: Type.STRING },
                    kineticCaption: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      rawJsonText = (response.text ?? '').trim();
    } catch (err: any) {
      const msg = String(err?.message || 'Komunikace s Gemini API selhala.');
      const status = Number(err?.status || err?.statusCode || 0);
      if (status === 400 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
        throw new AiPromptEnhanceError(
          status || 403,
          'Neplatný nebo neautorizovaný GEMINI_API_KEY. Zkontrolujte klíč v Settings > Secrets.'
        );
      }
      if (status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new AiPromptEnhanceError(
          429,
          'Kvóta Gemini API byla vyčerpána. Zkontrolujte fakturaci / limity v Settings > Secrets.'
        );
      }
      if (status === 404 || msg.includes('NOT_FOUND')) {
        throw new AiPromptEnhanceError(
          404,
          `Požadovaný Gemini model (${GEMINI_MODEL}) nebyl nalezen nebo není podporován.`
        );
      }
      throw new AiPromptEnhanceError(
        status >= 400 && status < 600 ? status : 502,
        `Chyba AI Smart Enhance (${GEMINI_MODEL}): ${msg}`
      );
    }
  }

  if (!rawJsonText) {
    throw new AiPromptEnhanceError(
      502,
      'Gemini API vrátilo prázdnou odpověď bez strukturovaného promptu.'
    );
  }

  let parsedPayload: AiGeneratedStructurePayload;
  try {
    parsedPayload = JSON.parse(rawJsonText) as AiGeneratedStructurePayload;
  } catch {
    throw new AiPromptEnhanceError(
      502,
      'Gemini API vrátilo nevalidní JSON formát při rozšiřování promptu.'
    );
  }

  const { structuredPrompt, cinematicNotes } = mergeAiEnhancedStructure(
    baseStructured,
    parsedPayload,
    styleInfo
  );

  const compiledText = compileStructuredPromptText(structuredPrompt);
  const score = scoreStructuredPromptCompleteness(structuredPrompt);

  return {
    engine: 'gemini-4-hydrogen',
    model: GEMINI_MODEL,
    selectedStyleTagLabel: styleInfo.tagLabel,
    expandedRawPrompt: structuredPrompt.rawPrompt,
    structuredPrompt,
    compiledText,
    cinematicNotes,
    score,
  };
}
