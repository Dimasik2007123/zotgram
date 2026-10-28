import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useQuery } from "../api/hooks";
import { allPages } from "../api/client";
import PersonCard from "../components/PersonCard";
import { useState } from "react";
import { openDirectChat } from "../api/chats";

function People() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const { data, loading, error } = useQuery(
    () => allPages(`/api/core/users/?q=${encodeURIComponent(query)}`),
    query,
    "profiles",
  );
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleMessage(userId) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      navigate(`/chats/${await openDirectChat(userId)}`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Загрузка сотрудников…</p>;
  if (error) return <p role="alert">{error}</p>;
  const others = data.filter((person) => person.id !== user.id);

  return (
    <div className="people" aria-busy={busy}>
      {actionError && <p role="alert">{actionError}</p>}
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
      {!others.length && <p>Никого не найдено.</p>}
    </div>
  );
}

export default People;
