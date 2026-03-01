import React, { useState } from "react";
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
  pendingCardLoss?: { playerId: string } | null;
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
  pendingCardLoss,
  setSelectedTarget,
  onActionClick,
  onBlock,
  onChallenge,
  onResolve,
  players,
  currentTurnPlayerId,
}) => {
  const [showInfluenceModal, setShowInfluenceModal] = useState(false);
  const coins = myPlayerState?.coins || 0;
  const isAlive = myPlayerState?.isAlive || false;
  // Players cannot start new actions if ANY pending action or card loss is active
  const canAct = isMyTurn && isAlive && !pendingAction && !pendingCardLoss;
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
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/80 rounded-t-[20px] shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.6)] z-40 pb-safe pb-4 transition-transform duration-300">
      <div className="px-3 pt-3 pb-2 space-y-3">
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

        {/* Compact Player Status & Influences */}
        <div className="flex flex-col items-center bg-slate-800/80 rounded-xl p-2 border border-slate-600/50 shadow-inner relative">
          {/* Status Badge (Top Right) */}
          <div className="absolute top-1.5 right-2 flex flex-col items-end">
             <div
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${
                isAlive ? "bg-green-600/80 text-green-100" : "bg-red-600/80 text-red-100"
              }`}>
              {isAlive ? "Alive" : "Dead"}
            </div>
          </div>

          {/* Centered Coins, Cards, & Viewer Button */}
          <div className="flex items-center gap-4 justify-center w-full mt-1">
            
            {/* Coin Count */}
            <div className="flex flex-col items-center bg-black/30 rounded-lg px-4 py-1.5 border border-slate-700/50">
              <span className="text-yellow-400 text-sm leading-none mb-0.5">🪙</span>
              <span className="text-xl font-bold text-white leading-none">{coins}</span>
            </div>

            {/* Card Count */}
            <div className="flex flex-col items-center bg-black/30 rounded-lg px-4 py-1.5 border border-slate-700/50">
               <span className="text-red-400 text-sm leading-none mb-0.5">❤️</span>
               <span className="text-xl font-bold text-white leading-none">
                  {myInfluences.filter(c => !c.isLost).length}
               </span>
            </div>
            
            {/* Show Hand Button */}
            <button
               onClick={() => setShowInfluenceModal(true)}
               className="flex items-center gap-2 bg-blue-900/40 hover:bg-blue-800/60 active:scale-95 transition-all text-white rounded-lg px-3 py-1.5 border border-blue-500/50 shadow"
            >
               <span className="text-lg">👁️</span>
               <span className="text-[10px] font-bold tracking-wide uppercase">Hand</span>
            </button>
          </div>
        </div>

        {/* Show Influence Modal Override */}
        {showInfluenceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-scale-in" onClick={() => setShowInfluenceModal(false)}>
             <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-bold text-white">Your Hand</h3>
                   <button onClick={() => setShowInfluenceModal(false)} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
                </div>
                <div className="flex justify-center gap-4">
                  {myInfluences.length > 0 ? (
                    myInfluences.map((influence) => (
                      <div key={influence.id} className="relative transform hover:scale-105 transition-transform duration-200">
                        <InfluenceCard
                          card={influence}
                          isHidden={influence.isLost}
                          isMyCard={true}
                          size="large"
                          rotation={360}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400 text-sm italic py-8">No cards left</div>
                  )}
                </div>
                <button 
                  onClick={() => setShowInfluenceModal(false)}
                  className="w-full mt-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-bold transition-colors"
                >
                  Close
                </button>
             </div>
          </div>
        )}

        {/* Action Area */}
        {canAct && (
          <div className="space-y-3 mt-1">
            {/* Target Selection */}
            {aliveOpponents.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-700/40 p-2 rounded-lg border border-slate-600/30">
                <span className="text-lg">🎯</span>
                <select
                  value={selectedTarget || ""}
                  onChange={(e) => setSelectedTarget(e.target.value || null)}
                  className="flex-1 bg-slate-800 border border-slate-500 rounded-md py-1.5 px-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Select a target...</option>
                  {aliveOpponents.map((opponent) => (
                    <option key={opponent.playerId} value={opponent.playerId}>
                      {opponent.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Buttons (Scrollable Row) */}
            <div className="overflow-x-auto pb-2 -mx-2 px-2 snap-x hide-scrollbar">
              <div className="flex gap-2 w-max">
                {allActions.map(action => {
                   const disabled = !canAct || action.cost > coins || (action.needsTarget && !selectedTarget);
                   return (
                    <button
                      key={action.type}
                      onClick={() => onActionClick(action.type)}
                      disabled={disabled}
                      className={`
                        snap-start relative flex-shrink-0 w-[110px] p-2.5 rounded-xl text-white font-medium text-sm
                        transition-all duration-200 flex flex-col items-center justify-center gap-1
                        ${disabled ? "opacity-40 cursor-not-allowed saturate-50" : "hover:opacity-90 active:scale-95 shadow-lg"}
                        ${action.color}
                      `}
                    >
                      <span className="text-2xl drop-shadow-md mb-0.5">{action.icon}</span>
                      <span className="text-[11px] font-bold text-center leading-tight drop-shadow-sm">{action.name}</span>
                      {action.cost > 0 && (
                        <div className="absolute top-1 right-1.5 text-[10px] font-bold bg-black/30 px-1 rounded">
                          {action.cost}🪙
                        </div>
                      )}
                      {disabled && action.needsTarget && !selectedTarget && (
                        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center backdrop-blur-[1px]">
                          <span className="text-[10px] text-red-300 font-bold bg-black/50 px-1.5 py-0.5 rounded">Target?</span>
                        </div>
                      )}
                    </button>
                   );
                })}
              </div>
            </div>

            {/* Must Coup Warning */}
            {coins >= 10 && (
              <div className="p-2 bg-red-900/80 border border-red-500 rounded-lg text-center shadow-lg animate-pulse">
                <div className="text-red-100 font-bold text-sm tracking-wide">
                  ⚠️ YOU MUST COUP! (10+ Coins)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Turn Indicator (When not active) */}
        {!isMyTurn && isAlive && (
          <div className="flex items-center justify-center gap-2 p-2.5 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
            <div className="text-sm text-gray-300 font-medium tracking-wide">
              Waiting for <span className="text-white font-bold">{players.find((p) => p.playerId === currentTurnPlayerId)?.name || "opponent"}</span>
            </div>
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "0.2s"}} />
          </div>
        )}
      </div>
    </div>
  );
};
