// LoseCardModal.tsx
import { useState } from "react";

export default function LoseCardModal({
  cards,
  onSelect,
}: {
  cards: string[];
  onSelect: (card: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 p-4">
      <div className="bg-slate-800 border border-red-500/50 rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-scale-in">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🩸</div>
          <h2 className="text-xl text-white font-bold">Choose a card to lose</h2>
          <p className="text-sm text-gray-400 mt-1">You must sacrifice one of your influences.</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {cards.map((c) => (
            <button
              key={c}
              className={`w-full px-4 py-4 rounded-xl border-2 font-bold text-lg transition-all ${
                selected === c
                  ? "bg-red-600/20 text-red-400 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                  : "bg-slate-700/50 text-gray-300 border-slate-600 hover:bg-slate-700"
              }`}
              onClick={() => setSelected(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <button
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
              selected
                ? "bg-red-600 text-white hover:bg-red-500 hover:shadow-red-500/25"
                : "bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600"
            }`}>
            Confirm Sacrifice
          </button>
        </div>
      </div>
    </div>
  );
}
