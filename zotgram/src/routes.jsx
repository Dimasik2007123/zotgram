import {
  createRoutesFromElements,
  createBrowserRouter,
  Route,
} from "react-router-dom";
import App from "./App.jsx";

const router = createBrowserRouter(
  createRoutesFromElements(<Route path="/" element={<App />}></Route>),
);

export default router;
