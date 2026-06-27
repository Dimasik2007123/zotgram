import { Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import LeftBar from "./LeftBar";

function Content() {
  const [isLeftBar, setIsLeftBar] = useState(window.innerWidth >= 1150);

  useEffect(() => {
    const handleResize = () => {
      setIsLeftBar(window.innerWidth >= 1150);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="content">
      {isLeftBar && <LeftBar />}
      <div className="content__main">
        <Outlet />
      </div>
    </div>
  );
}

export default Content;
