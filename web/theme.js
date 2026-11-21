try {
  if (localStorage.getItem("misaya-academy:theme") === "light") {
    document.documentElement.classList.remove("dark");
  }
} catch {
  // Keep the default theme when storage is disabled.
}
