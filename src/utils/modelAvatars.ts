/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import wan22AvatarUrl from '../assets/images/wan_2_2_avatar_1794947623065.jpg';
import ltx25AvatarUrl from '../assets/images/ltx_2_5_avatar_1794947623389.jpg';

export interface ModelAvatarMeta {
  imageUrl?: string;
  shortTag: string;
  accentClass: string;
}

export const MODEL_AVATAR_MAP: Record<string, ModelAvatarMeta> = {
  'wan-2-2': {
    imageUrl: wan22AvatarUrl,
    shortTag: 'WAN 2.2',
    accentClass: 'from-cyan-500/25 to-violet-500/25 border-cyan-400/50',
  },
  'ltx-2-5': {
    imageUrl: ltx25AvatarUrl,
    shortTag: 'LTX 2.5',
    accentClass: 'from-amber-400/25 to-emerald-500/25 border-amber-400/50',
  },
  'nexus-local-director': {
    shortTag: 'NEO LOCAL',
    accentClass: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40',
  },
  'veo-3-1': {
    shortTag: 'VEO 3.1',
    accentClass: 'from-sky-500/20 to-indigo-500/20 border-sky-400/40',
  },
  'flux-2-pro': {
    shortTag: 'FLUX 2',
    accentClass: 'from-fuchsia-500/20 to-purple-500/20 border-fuchsia-400/40',
  },
};

export const DEFAULT_AVATAR_PROMPTS: Record<string, string> = {
  'wan-2-2':
    'Futuristický kybernetický avatar WAN-2.2: holografický android s neonově azurovým vizorem, kvantovými obvody a fialovými laserovými částicemi',
  'ltx-2-5':
    'Futuristický kybernetický avatar LTX-2.5: zlatý cinematický AI režisér s optickým senzorem, smaragdovou aurou a kruhovým HUD zaměřovačem',
  'nexus-local-director':
    'Futuristický kybernetický avatar NEO: smaragdový operační mozek s holografickými krystalickými linkami',
};

export function getModelAvatar(modelId: string, customUrl?: string): ModelAvatarMeta {
  const base =
    MODEL_AVATAR_MAP[modelId] || {
      shortTag: modelId.toUpperCase().slice(0, 8),
      accentClass: 'from-zinc-800 to-zinc-900 border-zinc-700',
    };

  if (customUrl) {
    return {
      ...base,
      imageUrl: customUrl,
    };
  }
  return base;
}
