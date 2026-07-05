import { useNavigate } from "react-router-dom";
import { getDepartmentName } from "../departments";
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
    <div onClick={handleCardClick} className="person">
      <div className="person__info">
        <div
          className="person__avatar"
          style={{ background: getUserColor(person.id) }}
        >
          {person.name && person.lastname
            ? person.name.charAt(0) + person.lastname.charAt(0)
            : "П"}
        </div>
        <div className="person__details">
          <div
            className="person__details-name"
            title={person.name + " " + person.lastname}
          >
            {person.name || "Пользователь"} {person.lastname || ""}
          </div>
          <div className="person__details-email" title={person.email || ""}>
            {person.email || ""}
          </div>
          <div
            className="person__details-department"
            title={getDepartmentName(person.department) || ""}
          >
            {getDepartmentName(person.department)}
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
