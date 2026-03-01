// src/games/coup/components/SimplePlayerArea.tsx
import React from "react";
import type { CoupPlayerExtended } from "../types/cards.types";

interface SimplePlayerAreaProps {
  player: CoupPlayerExtended;
  isCurrentPlayer: boolean;
  isActivePlayer: boolean;
}

export const SimplePlayerArea: React.FC<SimplePlayerAreaProps> = ({
  player,
  isActivePlayer,
}) => {
  const aliveInfluences = player.influences?.filter((c) => !c.isLost) || [];
  const isAlive = player.isAlive;

  return (
    <div
      className={`
        flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all duration-200 shadow-sm
        ${
          isActivePlayer
            ? "border-yellow-400 bg-yellow-900/30 ring-1 ring-yellow-400/50"
            : "border-slate-600/60 bg-slate-800/80"
        }
        ${!isAlive ? "opacity-40 grayscale" : ""}
      `}>
      {/* Player Name and Status */}
      <div className="flex flex-col overflow-hidden mr-2">
        <div className="truncate font-semibold text-sm text-gray-100 max-w-[80px] sm:max-w-[120px]">
          {player.name}
        </div>
        {!isAlive && (
          <span className="text-[10px] uppercase text-red-400 font-bold tracking-wider leading-none mt-0.5">Eliminated</span>
        )}
      </div>

      {/* Coins and Cards Count (Compact) */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded">
          <span className="text-yellow-400 text-xs">🪙</span>
          <span className="text-white font-mono text-sm leading-none">{player.coins}</span>
        </div>
        <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded">
          <span className="text-red-400 text-xs">❤️</span>
          <span className="text-white font-mono text-sm leading-none">{aliveInfluences.length}</span>
        </div>
      </div>
    </div>
  );
};
