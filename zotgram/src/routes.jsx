// routes.jsx
import {
  createRoutesFromElements,
  createBrowserRouter,
  Route,
} from "react-router-dom";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import Feed from "./pages/Feed.jsx";
import Profile from "./pages/Profile.jsx";
import People from "./pages/People.jsx";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<App />}>
        <Route index={true} element={<Feed />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/people" element={<People />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<Login />} />
    </>,
  ),
);

export default router;
