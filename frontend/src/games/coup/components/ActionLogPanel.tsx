import { useEffect, useRef } from "react";

interface ActionLogEntry {
  id: string;
  timestamp: number;
  playerName: string;
  action: string;
  target?: string;
  outcome: string;
  turnNumber: number;
}

interface ActionLogPanelProps {
  logs: ActionLogEntry[];
  className?: string;
}

export function ActionLogPanel({ logs, className = "" }: ActionLogPanelProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest entry
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatLogEntry = (log: ActionLogEntry): string => {
    if (log.action === "TURN_END") {
      return log.outcome;
    }

    let message = `${log.playerName} `;
    
    switch (log.action) {
      case "Income":
        message += "performed Income";
        break;
      case "Foreign Aid":
        message += "performed Foreign Aid";
        break;
      case "Tax":
        message += "performed Tax";
        break;
      case "Coup":
        message += `couped ${log.target}`;
        break;
      case "Assassinate":
        message += `assassinated ${log.target}`;
        break;
      case "Steal":
        message += `stole from ${log.target}`;
        break;
      case "Exchange":
        message += "performed Exchange";
        break;
      case "Block":
        message += "blocked";
        break;
      case "Challenge":
        message += `challenged ${log.target}`;
        break;
      default:
        message += log.action.toLowerCase();
        break;
    }

    if (log.outcome) {
      message += ` - ${log.outcome}`;
    }

    return message;
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour12: false, timeStyle: 'medium' });
  };

  return (
    <div className={`flex flex-col bg-black/20 backdrop-blur-sm border border-white/10 rounded-lg ${className}`}>
      <div className="p-3 border-b border-white/10 flex-none">
        <h3 className="text-white font-semibold text-sm">Game Log</h3>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent min-h-[16rem]"
      >
        {logs.length === 0 ? (
          <div className="text-gray-400 text-sm italic">
            Game actions will appear here...
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`text-sm p-2 rounded ${
                log.action === "TURN_END" 
                  ? "bg-blue-500/10 border border-blue-500/20 text-blue-300 text-center font-medium"
                  : "bg-white/5 border border-white/10 text-gray-200"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="flex-1">
                  {formatLogEntry(log)}
                </span>
                {log.action !== "TURN_END" && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {formatTime(log.timestamp)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}