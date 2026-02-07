import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LandingPage from "./components/LandingPage";
import GamePage from "./components/GamePage";
import DailyPage from "./components/DailyPage";
import LeaderboardPage from "./components/LeaderboardPage";
import { LoginPage, RegisterPage } from "./components/AuthPages";
import UserPage from "./components/UserPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "game", element: <GamePage /> },
      { path: "daily", element: <DailyPage /> },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "profile", element: <UserPage /> },
    ],
  },
]);
