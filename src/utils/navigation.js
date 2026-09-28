export const go = (path) => {
  window.location.hash = path;
};

export const formatDate = (value) => {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
};
