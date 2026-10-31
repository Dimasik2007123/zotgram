import { memo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { submitMessage } from "../api/serverApi";
import attach from "../assets/images/file.svg";
import send from "../assets/images/send.svg";

function ChatComposer({ chatId }) {
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const input = useRef(null);
  const submitting = useRef(false);
  const clearFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    if (submitting.current || (!text.trim() && !file)) return;
    submitting.current = true;
    void dispatch(submitMessage({ chatId, text, file, attemptId: crypto.randomUUID() }));
    setText("");
    clearFile();
    input.current?.focus();
    queueMicrotask(() => { submitting.current = false; });
  };
  return (
    <form className="chat__input-form" onSubmit={handleSubmit}>
      <div className="chat__input-wrapper">
        <button type="button" className="chat__input-attach" onClick={() => fileInput.current?.click()}>
          <img src={attach} alt="Прикрепить файл" />
        </button>
        <input type="file" ref={fileInput} onChange={(event) => setFile(event.target.files[0] || null)} style={{ display: "none" }} />
        <input type="text" ref={input} className="chat__input-field" placeholder="Введите сообщение..." maxLength={10000}
          value={text} onChange={(event) => setText(event.target.value)} />
        {file && <div className="chat__input-file-preview">
          <img src={attach} alt="" />
          <span className="chat__input-file-name">{file.name}</span>
          <button type="button" className="chat__input-file-remove" onClick={clearFile}>✕</button>
        </div>}
        <button type="submit" className="chat__input-send" disabled={!text.trim() && !file}>
          <img src={send} alt="Отправить" />
        </button>
      </div>
    </form>
  );
}

export default memo(ChatComposer);
