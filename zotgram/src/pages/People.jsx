import statusText from "../utils/statusText";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useDirectory } from "../api/hooks";
import PersonCard from "../components/PersonCard";
import LoadMore from "../components/LoadMore";
import { useState } from "react";
import { openDirectChat } from "../api/chats";

function People() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const people = useDirectory(query);
  const { data, loading, error } = people;
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleMessage(userId) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      navigate(`/chats/${await openDirectChat(userId)}`);
    } catch (err) {
      setActionError(statusText(err.message));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="status-message status-message--page" role="status">Загрузка сотрудников</p>;
  if (error) return <p className="status-message status-message--page" role="alert">{error}</p>;
  const others = data.filter((person) => person.id !== user.id);

  return (
    <div className="people" aria-busy={busy}>
      {actionError && <p className="status-message" role="alert">{actionError}</p>}
      {[true, false].map((same) => (
        <div className="people__content" key={String(same)}>
          <div className="people__header">
            {same ? "Коллеги" : "Другие отделы"}
          </div>
          <div className="people__list">
            {others
              .filter(
                (person) => (person.department === user.department) === same,
              )
              .map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  onMessage={handleMessage}
                />
              ))}
          </div>
        </div>
      ))}
      {!others.length && !people.hasMore && <p className="status-message">Никого не найдено</p>}
      <LoadMore state={people} />
    </div>
  );
}

export default People;
