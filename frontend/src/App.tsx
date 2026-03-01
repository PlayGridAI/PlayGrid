import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import NotFound from "./pages/NotFound";
import GameLoader from "./pages/GameLoader";
import CoupUIDemo from "./games/coup/CoupUIDemo";

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/game/:gameId/:roomId" element={<GameLoader />} />
          <Route path="/coup-demo" element={<CoupUIDemo />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
