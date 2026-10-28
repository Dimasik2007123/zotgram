import { useNavigate } from "react-router-dom";
import getUserColor from "../utils/getUserColor";

function PersonCard({ person, onMessage }) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/profile/${person.id}`);
  };

  const handleMessageClick = (e) => {
    e.stopPropagation();
    onMessage(person.id);
  };

  return (
    <div className="person" onClick={() => handleCardClick(person.id)}>
      <div className="person__info">
        <div
          className="person__avatar"
          style={{ background: getUserColor(person) }}
        >
          {person.name && person.lastname
            ? person.name.charAt(0) + person.lastname.charAt(0)
            : "П"}
        </div>
        <div className="person__details">
          <div className="person__details-name">
            {person.name} {person.lastname}
          </div>
          <div className="person__details-email">{person.email}</div>
          <div className="person__details-department">
            {person.departmentName || "Отдел не указан"}
          </div>
        </div>
      </div>
      <button className="person__send-message-btn" onClick={handleMessageClick}>
        Сообщение
      </button>
    </div>
  );
}

export default PersonCard;
