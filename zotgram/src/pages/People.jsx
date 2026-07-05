import PersonCard from "../components/PersonCard";
import users from "../users";

function People() {
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const colleages = users.filter(
    (u) => u.department === currentUser.department && u.id !== currentUser.id,
  );
  const others = users.filter(
    (u) => u.department !== currentUser.department && u.id !== currentUser.id,
  );

  const handleMessage = (userId) => {
    console.log(`Начать чат с пользователем ${userId}`);
  };

  return (
    <div className="people">
      {colleages.length > 0 && (
        <div className="people__content">
          <div className="people__header">Коллеги</div>
          <div className="people__list">
            {colleages.map((colleage) => (
              <PersonCard
                key={colleage.id}
                person={colleage}
                onMessage={handleMessage}
              />
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className="people__content">
          <div className="people__header">Другие отделы</div>
          <div className="people__list">
            {others.map((other) => (
              <PersonCard
                key={other.id}
                person={other}
                onMessage={handleMessage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default People;
