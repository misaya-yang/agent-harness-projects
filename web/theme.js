try {
  if (localStorage.getItem("misaya-academy:theme") === "light") {
    document.documentElement.classList.remove("dark");
  }
} catch {
  // Keep the default theme when storage is disabled.
}

if (document.documentElement.dataset.routeKind === "home") {
  let paused = false;
  try { paused = localStorage.getItem("misaya-academy:sky-paused") === "true"; } catch {}
  if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData) {
    document.documentElement.setAttribute("data-static-rose", "");
    const poster = document.createElement("link");
    poster.rel = "preload";
    poster.as = "image";
    poster.href = document.documentElement.classList.contains("dark") ? "/assets/rose-night.webp" : "/assets/rose-day.webp";
    document.head.append(poster);
  }
}
