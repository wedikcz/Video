/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, ExternalLink, FileCode, Check } from 'lucide-react';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocsModal: React.FC<DocsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="relative flex h-[85vh] w-full max-w-5xl flex-col rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FileCode className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">OPENAPI 3.1 KONTRAKTOVÝ SPECIFIKÁTOR</h2>
              <p className="text-xs text-zinc-400 font-mono">
                Jediný zdroj pravdy pro nástroje, agentní registry a klientské SDK.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 transition"
            >
              <span>Otevřít Scalar Docs</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 px-3 py-1.5 text-xs font-mono hover:bg-amber-500/20 transition"
            >
              <span>/openapi.json</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Embedded Frame or Quick Inspector */}
        <div className="mt-4 flex-1 overflow-hidden rounded border border-zinc-800 bg-zinc-900/40">
          <iframe
            src="/docs"
            title="Scalar OpenAPI 3.1 Documentation"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
