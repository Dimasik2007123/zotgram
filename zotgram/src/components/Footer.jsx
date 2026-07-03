import { useNavigate } from "react-router";
import house from "../assets/images/house.svg";
import message from "../assets/images/message.svg";
import people from "../assets/images/people.svg";
import plus from "../assets/images/plus.svg";

function Footer({ onOpenModal }) {
  const navigate = useNavigate();

  return (
    <footer className="footer">
      <button className="footer__button" onClick={() => navigate("/")}>
        <img src={house} alt="Посты" className="footer__image" />
        Посты
      </button>
      <button className="footer__button" onClick={() => navigate("/")}>
        <img src={message} alt="Сообщения" className="footer__image" />
        Сообщения
      </button>
      <button className="footer__button" onClick={() => navigate("/")}>
        <img src={people} alt="Друзья" className="footer__image" />
        Друзья
      </button>
      <button className="footer__button" onClick={onOpenModal}>
        <img
          src={plus}
          alt="Создать пост"
          className="footer__image"
          style={{ filter: "invert(0.8)" }}
        />
        Создать пост
      </button>
    </footer>
  );
}

export default Footer;
