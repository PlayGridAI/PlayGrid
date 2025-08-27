// src/games/coup/components/ResponsiveActionPanel.tsx
import React from "react";
import type { CoupPlayerExtended } from "../types/cards.types";
import type { PendingAction } from "../types/coup.types";
import { ActionType } from "../types/coup.types";
import { InfluenceCard } from "./InfluenceCard";

interface ResponsiveActionPanelProps {
  myPlayerState: CoupPlayerExtended | null;
  isMyTurn: boolean;
  selectedTarget: string | null;
  aliveOpponents: CoupPlayerExtended[];
  pendingAction: PendingAction | null;
  setSelectedTarget: (target: string | null) => void;
  onActionClick: (type: string) => void;
  onBlock: () => void;
  onChallenge: () => void;
  onResolve: () => void;
  players: CoupPlayerExtended[];
  currentTurnPlayerId?: string;
}

export const ResponsiveActionPanel: React.FC<ResponsiveActionPanelProps> = ({
  myPlayerState,
  isMyTurn,
  selectedTarget,
  aliveOpponents,
  pendingAction,
  setSelectedTarget,
  onActionClick,
  onBlock,
  onChallenge,
  onResolve,
  players,
  currentTurnPlayerId,
}) => {
  const coins = myPlayerState?.coins || 0;
  const isAlive = myPlayerState?.isAlive || false;
  const canAct = isMyTurn && isAlive && !pendingAction;
  const myInfluences = myPlayerState?.influences || [];

  // Simplified single list of all actions
  const allActions = [
    {
      type: ActionType.INCOME,
      name: "Income",
      description: "Take 1 coin from the treasury",
      icon: "💰",
      cost: 0,
      color: "bg-blue-600 hover:bg-blue-500",
    },
    {
      type: ActionType.FOREIGN_AID,
      name: "Foreign Aid",
      description: "Take 2 coins (can be blocked by Duke)",
      icon: "🏛️",
      cost: 0,
      color: "bg-indigo-600 hover:bg-indigo-500",
    },
    {
      type: ActionType.TAX,
      name: "Tax",
      description: "Take 3 coins (Duke power)",
      icon: "👑",
      cost: 0,
      color: "bg-purple-600 hover:bg-purple-500",
      character: "DUKE",
    },
    {
      type: ActionType.STEAL,
      name: "Steal",
      description: "Take 2 coins from target (Captain)",
      icon: "🏴‍☠️",
      cost: 0,
      color: "bg-cyan-600 hover:bg-cyan-500",
      character: "CAPTAIN",
      needsTarget: true,
    },
    {
      type: ActionType.ASSASSINATE,
      name: "Assassinate",
      description: "Pay 3 to eliminate target (Assassin)",
      icon: "⚔️",
      cost: 3,
      color: "bg-red-600 hover:bg-red-500",
      character: "ASSASSIN",
      needsTarget: true,
    },
    {
      type: ActionType.EXCHANGE,
      name: "Exchange",
      description: "Swap cards with deck (Ambassador)",
      icon: "🔄",
      cost: 0,
      color: "bg-green-600 hover:bg-green-500",
      character: "AMBASSADOR",
    },
    {
      type: ActionType.COUP,
      name: "Coup",
      description: "Pay 7 to eliminate target (cannot be blocked)",
      icon: "⚔️",
      cost: 7,
      color: "bg-orange-600 hover:bg-orange-500",
      needsTarget: true,
    },
  ];

  const renderActionButton = (action: any) => {
    const disabled =
      !canAct || action.cost > coins || (action.needsTarget && !selectedTarget);

    return (
      <button
        key={action.type}
        onClick={() => onActionClick(action.type)}
        disabled={disabled}
        className={`
          relative p-2 sm:p-3 rounded-lg text-white font-medium text-sm
          transition-all duration-150
          ${
            disabled
              ? "opacity-40 cursor-not-allowed"
              : "hover:opacity-90 active:scale-95"
          }
          ${action.color}
          shadow-md
        `}
        title={
          action.description +
          (action.cost > 0 ? ` (Cost: ${action.cost} coins)` : "")
        }>
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="text-base sm:text-lg">{action.icon}</span>
          <div className="text-left">
            <div className="font-semibold text-xs sm:text-sm">
              {action.name}
            </div>
            {action.cost > 0 && (
              <div className="text-xs opacity-80">{action.cost}💰</div>
            )}
          </div>
        </div>

        {disabled && action.needsTarget && !selectedTarget && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
            <span className="text-xs text-red-300">Select Target</span>
          </div>
        )}
      </button>
    );
  };

  const showPendingAction = (pendingAction: PendingAction) => {
    const actionPerformedBy =
      pendingAction.blockedBy === undefined
        ? pendingAction.fromPlayerId
        : pendingAction.blockedBy;
    const responseGivenBy = pendingAction.respondedPlayers || [];
    return (
      actionPerformedBy !== myPlayerState?.playerId &&
      !responseGivenBy.includes(myPlayerState?.playerId || "")
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto bg-slate-900/95 lg:bg-slate-800 backdrop-blur-sm lg:backdrop-blur-none border-t lg:border lg:border-slate-600 rounded-t-2xl lg:rounded-2xl shadow-2xl z-10">
      <div className="p-3 sm:p-4 space-y-3">
        {/* Pending Action Response */}
        {pendingAction && showPendingAction(pendingAction) && (
          <div className="p-3 bg-gradient-to-r from-yellow-900/60 to-red-900/60 border border-yellow-500/40 rounded-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-bold text-yellow-300 text-sm">
                  ⏳ {pendingAction.type}
                  {pendingAction.blockedBy && " (BLOCKED)"}
                </div>
                <div className="text-xs text-gray-300">
                  by{" "}
                  {
                    players.find(
                      (p) => p.playerId === pendingAction.fromPlayerId,
                    )?.name
                  }
                  {pendingAction.blockedBy && (
                    <>
                      {" • blocked by "}
                      {
                        players.find(
                          (p) => p.playerId === pendingAction.blockedBy,
                        )?.name
                      }
                      {pendingAction.blockingCard &&
                        ` with ${pendingAction.blockingCard}`}
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {/* Block button - conditionally shown based on action type and target */}
                {!pendingAction.blockedBy &&
                  (() => {
                    const actionType = pendingAction.type;
                    // Show block button based on game rules
                    if (actionType === "FOREIGN_AID") {
                      // Anyone can block Foreign Aid with Duke
                      return (
                        <button
                          onClick={onBlock}
                          className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-semibold text-xs">
                          🛡️ Block
                        </button>
                      );
                    } else if (
                      actionType === "ASSASSINATE" &&
                      pendingAction.toPlayerId === myPlayerState?.playerId
                    ) {
                      // Only target can block Assassinate with Contessa
                      return (
                        <button
                          onClick={onBlock}
                          className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-semibold text-xs">
                          🛡️ Block
                        </button>
                      );
                    } else if (
                      actionType === "STEAL" &&
                      pendingAction.toPlayerId === myPlayerState?.playerId
                    ) {
                      // Only target can block Steal with Ambassador/Captain
                      return (
                        <button
                          onClick={onBlock}
                          className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-semibold text-xs">
                          🛡️ Block
                        </button>
                      );
                    }
                    // TAX and EXCHANGE cannot be blocked, so no block button
                    return null;
                  })()}

                {/* Challenge button - conditionally shown based on action type */}
                {(() => {
                  const actionType = pendingAction.type;
                  // Actions that can be challenged (require character cards)
                  const challengeableActions = [
                    "TAX",
                    "ASSASSINATE",
                    "STEAL",
                    "EXCHANGE",
                  ];

                  // If there's a block, show challenge button to challenge the block
                  if (pendingAction.blockedBy && pendingAction.blockingCard) {
                    return (
                      <button
                        onClick={onChallenge}
                        className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded font-semibold text-xs">
                        ⚔️ Challenge Block
                      </button>
                    );
                  }

                  // Otherwise, show challenge button for original action if challengeable
                  // Foreign Aid, Income, and Coup cannot be challenged
                  if (challengeableActions.includes(actionType)) {
                    return (
                      <button
                        onClick={onChallenge}
                        className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded font-semibold text-xs">
                        ⚔️ Challenge
                      </button>
                    );
                  }
                  return null;
                })()}

                <button
                  onClick={onResolve}
                  className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded font-semibold text-xs">
                  ✓ Resolve
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Player Status */}
        <div className="bg-slate-800/60 backdrop-blur-sm p-3 rounded-lg border border-slate-600/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-white text-sm">Your Status</h3>
            <div
              className={`px-2 py-1 rounded text-xs font-semibold ${
                isAlive ? "bg-green-600 text-white" : "bg-red-600 text-white"
              }`}>
              {isAlive ? "ALIVE" : "ELIMINATED"}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="text-yellow-400">🪙</span>
              <span className="text-lg font-bold text-white">{coins}</span>
              <span className="text-xs text-gray-400">coins</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-red-400">❤️</span>
              <span className="text-lg font-bold text-white">
                {myInfluences?.filter((c) => !c.isLost).length || 0}
              </span>
              <span className="text-xs text-gray-400">influences</span>
            </div>
          </div>
        </div>

        {/* display influences */}
        <div className="bg-slate-700/40 p-3 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            Your Influences
          </h4>
          <div className="flex gap-1">
            {myInfluences.map((influence) => (
              <InfluenceCard
                card={influence}
                isHidden={influence.isLost}
                isMyCard={true}
                size="large"
                rotation={360}
              />
            ))}
          </div>
        </div>

        {/* Target Selection */}
        {canAct && aliveOpponents.length > 0 && (
          <div className="bg-slate-700/40 p-3 rounded-lg">
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Target Player
            </label>
            <select
              value={selectedTarget || ""}
              onChange={(e) => setSelectedTarget(e.target.value || null)}
              className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white text-sm">
              <option value="">Select target...</option>
              {aliveOpponents.map((opponent) => (
                <option key={opponent.playerId} value={opponent.playerId}>
                  {opponent.name} ({opponent.coins}💰,{" "}
                  {opponent.influences?.filter((c) => !c.isLost).length || 0}❤️)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action Grid */}
        {canAct && (
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Available Actions
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-2">
              {allActions.map(renderActionButton)}
            </div>

            {/* Must Coup Warning */}
            {coins >= 10 && (
              <div className="mt-2 p-2 bg-red-900/50 border border-red-500/50 rounded text-center">
                <div className="text-red-300 font-semibold text-xs">
                  ⚠️ You must Coup! (10+ coins)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Turn Indicator */}
        {!isMyTurn && (
          <div className="text-center p-2 bg-slate-700/40 rounded-lg">
            <div className="text-sm text-gray-300">
              Waiting for{" "}
              {players.find((p) => p.playerId === currentTurnPlayerId)?.name ||
                "opponent"}
              's turn
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
