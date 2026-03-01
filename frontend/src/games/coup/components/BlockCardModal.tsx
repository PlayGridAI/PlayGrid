// BlockCardModal.tsx
import { useState } from "react";

export default function BlockCardModal({
  availableCards,
  actionToBlock,
  onSelect,
}: {
  availableCards: string[];
  actionToBlock: string;
  onSelect: (card: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const getCardDescription = (card: string) => {
    switch (card) {
      case "Duke": return "Block Foreign Aid";
      case "Contessa": return "Block Assassination";
      case "Ambassador": return "Block Steal (as Ambassador)";
      case "Captain": return "Block Steal (as Captain)";
      default: return "";
    }
  };

  const getActionDescription = (action: string) => {
    switch (action) {
      case "FOREIGN_AID": return "Foreign Aid";
      case "ASSASSINATE": return "Assassination";
      case "STEAL": return "Steal";
      default: return action;
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 p-4">
      <div className="bg-slate-800 border border-yellow-500/50 rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-scale-in">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🛡️</div>
          <h2 className="text-xl text-white font-bold">
            Block {getActionDescription(actionToBlock)}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Claim an influence to block this action. Players can challenge your claim.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-6">
          {availableCards.map((card) => (
            <button
              key={card}
              className={`w-full px-4 py-3 rounded-xl border-2 transition-all text-left ${
                selected === card
                  ? "bg-yellow-600/20 text-yellow-500 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                  : "bg-slate-700/50 text-gray-300 border-slate-600 hover:bg-slate-700"
              }`}
              onClick={() => setSelected(card)}>
              <div className="font-bold text-lg leading-none mb-1">{card}</div>
              <div className="text-xs font-medium opacity-75">
                {getCardDescription(card)}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <button
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
              selected
                ? "bg-yellow-600 text-white hover:bg-yellow-500 hover:shadow-yellow-500/25"
                : "bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600"
            }`}>
            Block with {selected || "..."}
          </button>
        </div>
      </div>
    </div>
  );
}