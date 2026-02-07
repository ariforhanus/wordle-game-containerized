import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LandingPage from "./components/LandingPage";
import GamePage from "./components/GamePage";
import DailyPage from "./components/DailyPage";
import LeaderboardPage from "./components/LeaderboardPage";
import { LoginPage, RegisterPage } from "./components/AuthPages";
import UserPage from "./components/UserPage";
import ThemeSelectPage from "./components/ThemeSelectPage";
import ThemedGamePage from "./components/ThemedGamePage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./components/admin/AdminDashboard";
import AdminUsers from "./components/admin/AdminUsers";
import AdminWords from "./components/admin/AdminWords";

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
      { path: "themes", element: <ThemeSelectPage /> },
      { path: "themes/:themeId", element: <ThemedGamePage /> },
    ],
  },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "users", element: <AdminUsers /> },
      { path: "words", element: <AdminWords /> },
    ],
  },
]);
