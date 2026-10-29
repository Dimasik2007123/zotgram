export default function statusText(text) {
  return String(text ?? "").trimEnd().replace(/[.…]+$/u, "");
}
