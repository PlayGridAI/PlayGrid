// src/games/coup/components/SimpleGameBoard.tsx
import React from "react";
import type { CoupPlayerExtended } from "../types/cards.types";
import { SimplePlayerArea } from "./SimplePlayerArea";

interface SimpleGameBoardProps {
  players: CoupPlayerExtended[];
  currentTurnPlayerId: string;
  currentPlayerId: string;
}

export const SimpleGameBoard: React.FC<SimpleGameBoardProps> = ({
  players,
  currentTurnPlayerId,
  currentPlayerId,
}) => {
  // Filter out the active user from the top arena grid
  const opponents = players.filter(p => p.playerId !== currentPlayerId);

  return (
    <div className="w-full">
      {/* Turn Indicator */}
      <div className="mb-3 flex justify-center">
        <div className="inline-flex items-center gap-2 bg-slate-800/90 backdrop-blur-sm rounded-full px-4 py-1.5 border border-slate-600 shadow-xl">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-gray-100 font-medium text-sm">
            {players.find(p => p.playerId === currentTurnPlayerId)?.name || "Unknown"}'s Turn
          </span>
        </div>
      </div>

      {/* Players Grid (Compact Pills) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-6xl mx-auto px-1">
        {opponents.map((player) => (
          <SimplePlayerArea
            key={player.playerId}
            player={player}
            isCurrentPlayer={false}
            isActivePlayer={player.playerId === currentTurnPlayerId}
          />
        ))}
      </div>
    </div>
  );
};