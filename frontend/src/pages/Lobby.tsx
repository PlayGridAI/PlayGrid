import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  connectSocket,
  createRoom,
  getRooms,
  joinRoom,
  onErrorMessage,
  onRoomJoined,
  onRoomsUpdate,
} from "../services/socket";
import Toast from "../components/Toast";

export default function Lobby() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState(
    localStorage.getItem("playerName") || "",
  );
  const [roomId, setRoomId] = useState(localStorage.getItem("roomId") || "");
  const [rooms, setRooms] = useState<any[]>([]);
  const [error, setError] = useState("");

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedRoomForPassword, setSelectedRoomForPassword] =
    useState<any>(null);
  const [passwordInput, setPasswordInput] = useState("");

  // New states
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"error" | "success" | "info">(
    "error",
  );

  const lastAutoRoomName = useRef("");

  // Auto-generate room name based on player name
  useEffect(() => {
    const trimmedPlayer = playerName.trim();
    if (!trimmedPlayer) {
      // If player clears their name and the room name was an auto-gen, clear it too
      if (roomName === lastAutoRoomName.current) {
        setRoomName("");
        lastAutoRoomName.current = "";
      }
      return;
    }

    const suggestedName = `${trimmedPlayer}'s Room`;
    
    // Only update if roomName is empty or matches the last auto-generated name
    if (!roomName.trim() || roomName === lastAutoRoomName.current) {
      setRoomName(suggestedName);
      lastAutoRoomName.current = suggestedName;
    }
  }, [playerName]);

  const showToast = (
    msg: string,
    type: "error" | "success" | "info" = "error",
  ) => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(""), 4000);
  };

  useEffect(() => {
    const s = connectSocket(
      import.meta.env.VITE_SOCKET_URL || "http://localhost:4000",
    );
    getRooms(setRooms);
    onRoomsUpdate(setRooms);
    onRoomJoined((data) => {
      setRoomId(data.roomId);
      localStorage.setItem("roomId", data.room.roomId);
      localStorage.setItem("currentPlayer", JSON.stringify(data.player));
      localStorage.setItem("currentRoom", JSON.stringify(data.room));
    });
    onErrorMessage(handleError);
    return () => {
      s.off("roomsUpdate");
      s.off("roomJoined");
      s.off("playersUpdate");
      s.off("errorMessage");
    };
  }, []);
  const handleError = (msg: any) => {
    console.log("Error received:", msg);
    if (msg.type === "error") {
      showToast(msg.message, "error");
    } else {
      console.error("Unknown error type:", msg);
    }
  };

  const handleCreate = () => {
    if (playerName.trim() && roomName.trim()) {
      localStorage.setItem("playerName", playerName);
      createRoom(
        playerName,
        roomName,
        isPrivate,
        password || undefined,
        (roomId) => {
          navigate(`/room/${roomId}`);
        },
      );
    } else {
      setError("Please enter a valid gamer tag and room name.");
    }
  };

  const handleDirectJoin = (room: any) => {
    if (playerName.trim()) {
      setRoomId(room.roomId);
      const alreadyJoined = localStorage.getItem("roomId") === roomId;
      if (!alreadyJoined) {
        if (room.isPrivate) {
          setSelectedRoomForPassword(room);
          setPasswordInput("");
          setPasswordModalOpen(true);
        } else {
          joinRoom(room.roomId, playerName, undefined, undefined, (roomId) => {
            navigate(`/room/${roomId}`);
          });
        }
      }
    } else {
      setError("Please enter a valid gamer tag.");
    }
  };

  const handlePasswordSubmit = () => {
    joinRoom(
      selectedRoomForPassword?.roomId,
      playerName,
      undefined,
      passwordInput,
      (roomId) => {
        navigate(`/room/${roomId}`);
      },
    );
    setPasswordModalOpen(false);
  };

  useEffect(() => {
    if (localStorage.getItem("currentRoom") && localStorage.getItem("roomId")) {
      navigate(`/room/${localStorage.getItem("roomId")}`);
    }
  }, [navigate]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-black text-white p-4 flex flex-col">
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage("")}
        />
      )}
      <h2 className="text-3xl font-extrabold text-center mb-6 tracking-wide drop-shadow-lg">
        🎮 Game Lobby
      </h2>

      {error && (
        <div className="bg-red-500/80 rounded p-2 text-center text-sm mb-3">
          {error}
        </div>
      )}

      {/* Player Name */}
      <input
        type="text"
        placeholder="Enter your gamer tag"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        className="bg-white/10 backdrop-blur-sm border border-white/20 p-3 rounded-lg w-full mb-4 focus:outline-none focus:ring-2 focus:ring-purple-400"
      />

      {/* Create Room Section */}
      <div className="bg-white/5 p-4 rounded-lg shadow-lg mb-6">
        <h3 className="font-bold text-lg mb-3">🛠 Create a Room</h3>
        <input
          type="text"
          placeholder="Room Name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          className="bg-white/10 border border-white/20 p-3 rounded-lg w-full mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />

        <div className="flex items-center mb-3">
          <label
            htmlFor="private-toggle"
            className="mr-3 text-sm font-medium text-gray-100">
            Private Room
          </label>
          <button
            id="private-toggle"
            type="button"
            role="switch"
            aria-checked={isPrivate}
            onClick={() => setIsPrivate(!isPrivate)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              isPrivate ? "bg-purple-600" : "bg-gray-300"
            }`}>
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPrivate ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {isPrivate && (
          <input
            type="password"
            placeholder="Room Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-white/10 border border-white/20 p-3 rounded-lg w-full mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        )}

        <button
          onClick={handleCreate}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 transition-all duration-200 text-white px-4 py-3 rounded-lg w-full font-semibold shadow-lg active:scale-95">
          🚀 Create Room
        </button>
      </div>

      {/* Available Rooms */}
      {rooms.length > 0 && (
        <div className="bg-white/5 p-4 rounded-lg shadow-lg flex-1 overflow-y-auto">
          <h3 className="font-bold text-lg mb-3">📜 Available Rooms</h3>
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li
                key={room.roomId}
                className="flex items-center justify-between bg-white/10 hover:bg-white/20 transition-all p-3 rounded-lg shadow">
                <span className="text-sm">
                  <span className="font-bold">{room.name}</span>{" "}
                  <span className="opacity-75">
                    ({room.players?.length}/{room.maxPlayers})
                  </span>
                  {room.isPrivate && " 🔒"}
                </span>
                <button
                  onClick={() => handleDirectJoin(room)}
                  className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 transition-all px-3 py-1.5 rounded-lg text-xs font-semibold shadow active:scale-95">
                  Join
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-gradient-to-r from-indigo-700 to-purple-700 transition-all p-3 rounded-lg shadow rounded p-6 w-80 shadow-lg">
            <h3 className="font-semibold mb-4">Enter Room Password</h3>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="bg-white/10 border border-white/20 p-3 rounded-lg w-full mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPasswordModalOpen(false)}
                className="px-4 py-2 rounded border">
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 transition-all text-white px-4 py-2 rounded">
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
