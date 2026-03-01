// ExchangeCardModal.tsx
import { useState } from "react";

export default function ExchangeCardModal({
  availableCards,
  cardsToKeep,
  onSelect,
}: {
  availableCards: string[];
  cardsToKeep: number;
  onSelect: (cards: string[]) => void;
}) {
  const [selected, setSelected] = useState<{ card: string; index: number }[]>(
    [],
  );

  const handleCardClick = (card: string, index: number) => {
    const selectedIndex = selected.findIndex((c) => c.index === index);

    if (selectedIndex !== -1) {
      // Already selected → remove it
      const newSelected = [...selected];
      newSelected.splice(selectedIndex, 1);
      setSelected(newSelected);
    } else if (selected.length < cardsToKeep) {
      // Not selected yet → add it
      setSelected([...selected, { card, index }]);
    }
  };

  const handleSubmit = () => {
    const selectedCards = selected.map((c) => c.card);
    onSelect(selectedCards);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 p-4">
      <div className="bg-slate-800 border border-blue-500/50 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-scale-in">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔄</div>
          <h2 className="text-xl text-white font-bold">
            Choose {cardsToKeep} card{cardsToKeep > 1 ? "s" : ""} to keep
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Tap to select the cards you want permanently in your hand.
          </p>
          <div className="mt-2 text-blue-300 font-semibold bg-blue-900/30 inline-block px-3 py-1 rounded-full border border-blue-500/30">
            Selected: {selected.length} / {cardsToKeep}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {availableCards.map((card, index) => {
            const isSelected = selected.some((c) => c.index === index);

            return (
              <button
                key={index}
                onClick={() => handleCardClick(card, index)}
                className={`py-4 px-2 border-2 rounded-xl text-center font-bold text-lg transition-all ${
                  isSelected
                    ? "bg-blue-600/20 text-blue-400 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                    : "bg-slate-700/50 text-gray-300 border-slate-600 hover:bg-slate-700"
                }`}
              >
                {card}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <button
            disabled={selected.length !== cardsToKeep}
            onClick={() => selected.length === cardsToKeep && handleSubmit()}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${
              selected.length === cardsToKeep
                ? "bg-blue-600 text-white hover:bg-blue-500 hover:shadow-blue-500/25"
                : "bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600"
            }`}>
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
