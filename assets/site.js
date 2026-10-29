// Light/dark toggle. The page follows the system setting until someone presses the button.
(function () {
  var root = document.documentElement;
  var button = document.querySelector(".theme");
  if (!button) return;

  function current() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function label() {
    button.textContent = current() === "dark" ? "Light mode" : "Dark mode";
  }

  button.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    label();
  });
  label();
})();
