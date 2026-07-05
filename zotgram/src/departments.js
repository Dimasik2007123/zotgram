export const departments = [
  { id: "design", name: "Дизайн" },
  { id: "backend", name: "Бэкенд" },
  { id: "frontend", name: "Фронтенд" },
  { id: "management", name: "Менеджмент" },
  { id: "testing", name: "Тестирование" },
];

export const getDepartmentName = (id) => {
  const dept = departments.find((d) => d.id === id);
  return dept ? dept.name : "Не указан";
};

export default departments;
