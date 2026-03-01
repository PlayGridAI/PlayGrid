import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Socket } from "socket.io-client";
import { useSocket } from "../hooks/useSocket";
import {
  gameStart,
  gameSelect,
  joinRoom,
  leaveRoom,
  reconnectToRoom,
} from "../services/socket";

const AVAILABLE_GAMES = [
  { id: "coup", name: "Coup" },
  { id: "monopoly", name: "Monopoly" },
  // more games later...
];

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [players, setPlayers] = useState<any[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<any>(
    (() => {
      const stored = localStorage.getItem("currentPlayer");
      return stored ? JSON.parse(stored) : "";
    })(),
  );
  const [room, setRoom] = useState(
    (() => {
      const stored = localStorage.getItem("currentRoom");
      return stored ? JSON.parse(stored) : null;
    })(),
  );
  const [error, setError] = useState("");
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [hostSelectedGame, setHostSelectedGame] = useState<{ gameId: string; hostName: string } | null>(null);

  const setupEvents = useCallback(
    (socket: Socket) => {
      console.log("Room component: setting up socket events", {
        socketId: socket.id,
        roomId,
      });

      socket.on("players:update", (data: any) => {
        console.log("Room component: players:update received", data);
        if (data.roomId === roomId) {
          setPlayers(data?.players);
        }
      });

      socket.on("game:started", (game: any) => {
        console.log("Room component: game:started event received:", game);
        console.log(
          "Room component: navigating to:",
          `/game/${game.id}/${roomId}`,
        );
        navigate(`/game/${game.id}/${roomId}`);
      });

      socket.on("game:rejoined", (data: any) => {
        console.log("Room component: game:rejoined event received:", data);
        console.log(
          "Room component: navigating to game after rejoin:",
          `/game/${data.gameId}/${data.roomId}`,
        );
        navigate(`/game/${data.gameId}/${data.roomId}`);
      });

      socket.on("room:joined", ({ room, player }) => {
        localStorage.setItem("roomId", room.roomId);
        localStorage.setItem("currentPlayer", JSON.stringify(player));
        localStorage.setItem("currentRoom", JSON.stringify(room));
        setCurrentPlayer(player);
        setRoom(room);
        setPlayers((prevPlayers) => [...prevPlayers, player]);
      });

      socket.on("rooms:update", (rooms) => {
        rooms.forEach((room: any) => {
          if (room.roomId === roomId) {
            localStorage.setItem("currentRoom", JSON.stringify(room));
            setPlayers(room.players);
          }
        });
      });

      socket.on("errorMessage", (msg) => {
        setError(msg);
      });

      socket.on("game:selected", (data: { gameId: string; hostName: string }) => {
        console.log("Room component: game:selected event received:", data);
        setHostSelectedGame(data);
      });
    },
    [roomId, navigate],
  );

  const socket = useSocket(setupEvents);

  useEffect(() => {
    console.log("Room component: socket and roomId changed", {
      socket: !!socket,
      roomId,
    });
    if (socket && roomId) {
      // Use the stored player name from currentPlayer if available, otherwise fallback to localStorage
      const savedName =
        currentPlayer?.name || localStorage.getItem("playerName") || "Guest";
      const alreadyJoined = localStorage.getItem("roomId") === roomId;
      const currentPlayerId = currentPlayer?.playerId;

      console.log("Room component: checking if already joined", {
        alreadyJoined,
        savedName,
        currentPlayerId,
      });

      // Check if we have a stored player ID and room ID - this indicates a potential rejoin scenario
      const storedPlayerId = localStorage.getItem("currentPlayer")
        ? JSON.parse(localStorage.getItem("currentPlayer")!).playerId
        : null;
      const storedRoomId = localStorage.getItem("roomId");

      // If we have a stored player ID and we're trying to join the same room, attempt rejoin
      // Note: We don't check if currentPlayerId === storedPlayerId because on reload,
      // currentPlayerId might be undefined but storedPlayerId will still be valid
      if (storedPlayerId && storedRoomId === roomId) {
        console.log("Room component: attempting to reconnect to room", {
          roomId,
          savedName,
          storedPlayerId,
          socketId: socket?.id,
        });
        reconnectToRoom(roomId, storedPlayerId, savedName, (hasActiveGame) => {
          console.log("Room component: reconnected to room", { hasActiveGame });
          if (hasActiveGame) {
            console.log(
              "Room component: active game detected, waiting for game:rejoined event",
            );
          }
        });
      } else if (!currentPlayerId || !alreadyJoined) {
        console.log("Room component: joining room", {
          roomId,
          savedName,
          currentPlayerId,
          socketId: socket?.id,
        });
        joinRoom(
          roomId,
          savedName,
          currentPlayerId,
          undefined,
          (joinedRoomId) => {
            console.log(
              "Room component: successfully joined room via callback",
              joinedRoomId,
            );
            // Navigation is handled by the room:joined event listener
          },
        );
      } else {
        console.log("Room component: already joined, skipping join", {
          currentPlayerId,
          alreadyJoined,
        });
      }
    }
  }, [socket, roomId, currentPlayer?.playerId]);

  const handleLeave = () => {
    if (socket && roomId) {
      leaveRoom(socket, roomId, currentPlayer.playerId, () => {
        console.log("Room component: successfully left room via callback");
        navigate("/lobby");
      });
    }
  };

  const handleStartGame = () => {
    if (!selectedGame || !socket || !roomId || !currentPlayer) return;
    gameStart(socket, roomId, selectedGame, setError);
  };

  const handleGameSelect = (gameId: string) => {
    setSelectedGame(gameId);
    if (socket && roomId && isHost) {
      gameSelect(socket, roomId, gameId, setError);
    }
  };

  const isHost = players?.find(
    (pl: any) => pl.playerId === currentPlayer?.playerId,
  )?.isHost;

  // Debug current player state
  console.log("Room component: current player state", {
    currentPlayer,
    players,
    isHost,
    roomId,
  });

  return (
    <div className="max-w-md mx-auto bg-gradient-to-b from-indigo-900 via-purple-900 to-black shadow-xl p-6 rounded-lg text-white">
      <h2 className="text-2xl font-bold mb-4">
        Room: <span className="text-purple-400">{room?.name || roomId}</span>
      </h2>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <h3 className="text-lg font-semibold mb-2">Players</h3>
      <ul className="space-y-2">
        {players?.map((p: any, i) => (
          <li
            key={i}
            className={`flex items-center justify-between p-2 rounded-lg ${
              p.isHost ? "bg-purple-800" : "bg-gray-700"
            }`}>
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-r from-purple-500 to-indigo-600 w-8 h-8 flex items-center justify-center rounded-full font-bold text-white">
                {p.name.charAt(0).toUpperCase()}
              </span>
              {p.isHost && <span className="text-yellow-300">⭐</span>}
              <span className="font-medium">{p.name}</span>
            </div>
            {p.isHost && (
              <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full">
                Host
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Game Selection Section - visible to all players */}
      <div className="mt-6 space-y-4">
        <div>
          <h4 className="text-lg font-semibold mb-2">Available Games</h4>
          <div className="flex gap-2 flex-wrap">
            {AVAILABLE_GAMES.map((game) => (
              <button
                key={game.id}
                onClick={() => isHost ? handleGameSelect(game.id) : undefined}
                disabled={!isHost}
                className={`px-4 py-2 rounded-lg border transition ${
                  (isHost ? selectedGame : hostSelectedGame?.gameId) === game.id
                    ? "bg-blue-500 text-white border-blue-400"
                    : "bg-gray-700 text-white border-gray-500"
                } ${!isHost ? "opacity-75 cursor-not-allowed" : ""}`}>
                {game.name}
                {hostSelectedGame?.gameId === game.id && !isHost && (
                  <span className="ml-2 text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
          {hostSelectedGame && !isHost && (
            <p className="text-sm text-gray-300 mt-2">
              Host has selected: <span className="text-blue-400 font-semibold">{AVAILABLE_GAMES.find(g => g.id === hostSelectedGame.gameId)?.name}</span>
            </p>
          )}
        </div>
        {isHost && (
          <div className="space-y-2">
            <button
              onClick={handleStartGame}
              disabled={!selectedGame || players.length < 2}
              className="w-full bg-green-500 text-black font-semibold px-4 py-2 rounded-lg hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition">
              Start Game
            </button>
            {players.length < 2 && (
              <p className="text-center text-xs text-yellow-300 animate-pulse">
                Waiting for at least 2 players to start...
              </p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleLeave}
        className="mt-6 w-full bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-400 active:scale-95 transition">
        Leave Room
      </button>
    </div>
  );
}
