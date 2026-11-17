/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, RefreshCw, Eye, Wand2, ShieldCheck } from 'lucide-react';
import { getModelAvatar, ModelAvatarMeta } from '../utils/modelAvatars.ts';
import { generateModelAvatar } from '../services/avatarService.ts';

interface ModelAvatarViewProps {
  modelId: string;
  modelName: string;
  customAvatarUrl?: string;
  onAvatarUpdated?: (modelId: string, newUrl: string) => void;
  onInspectAvatar?: (modelId: string, modelName: string, url: string) => void;
}

export const ModelAvatarView: React.FC<ModelAvatarViewProps> = ({
  modelId,
  modelName,
  customAvatarUrl,
  onAvatarUpdated,
  onInspectAvatar,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | undefined>(customAvatarUrl);

  const avatarMeta: ModelAvatarMeta = getModelAvatar(modelId, localUrl);

  const handleRefreshAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const result = await generateModelAvatar(modelName || modelId);
      if (result.success && result.avatarUrl) {
        setLocalUrl(result.avatarUrl);
        onAvatarUpdated?.(modelId, result.avatarUrl);
      }
    } catch (err) {
      console.error('Failed to refresh avatar', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      data-testid={`model-avatar-view-${modelId}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2 transition-all duration-300 hover:border-emerald-500/50 hover:bg-zinc-900 shadow-sm"
    >
      {/* 3D Animated Avatar Thumbnail with subtle futuristic pulse and orbit loop on hover */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-zinc-700 bg-black">
        {avatarMeta.imageUrl ? (
          <img
            src={avatarMeta.imageUrl}
            alt={`Avatar pro ${modelName}`}
            className={`h-full w-full object-cover transition-transform duration-700 ${
              isHovered ? 'scale-110 rotate-1' : 'scale-100 rotate-0'
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-[10px] font-mono font-bold text-emerald-400">
            {avatarMeta.shortTag}
          </div>
        )}

        {/* Futuristic glowing cybernetic overlay ring on hover */}
        <div
          className={`absolute inset-0 border-2 border-emerald-400/80 rounded-md transition-opacity duration-300 pointer-events-none ${
            isHovered ? 'opacity-100 animate-pulse' : 'opacity-0'
          }`}
        />
      </div>

      {/* Model info & Tag */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="font-sans text-xs font-bold text-white truncate">{modelName}</span>
          <span className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[9px] text-emerald-400 font-semibold uppercase">
            {avatarMeta.shortTag}
          </span>
        </div>
        <p className="font-mono text-[10px] text-zinc-400 truncate mt-0.5">
          {isHovered ? '✨ 3D Neural Persona v2.5' : 'AI Generation Model'}
        </p>
      </div>

      {/* Actions: Inspect & Refresh Toolkit Button */}
      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-150 transition-opacity">
        <button
          type="button"
          aria-label={`Obnovit avatar pro ${modelName}`}
          title="Re-invoke local media toolkit to generate a fresh 3D animated avatar"
          disabled={isRefreshing}
          onClick={handleRefreshAvatar}
          className="rounded p-1 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {avatarMeta.imageUrl && onInspectAvatar && (
          <button
            type="button"
            aria-label={`Prohlédnout avatar ${modelName}`}
            onClick={(e) => {
              e.stopPropagation();
              onInspectAvatar(modelId, modelName, avatarMeta.imageUrl!);
            }}
            className="rounded p-1 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
