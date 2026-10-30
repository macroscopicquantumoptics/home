// Sun/moon toggle in the lower right. The page follows the system setting until someone flips it.
(function () {
  var root = document.documentElement;
  var toggle = document.querySelector(".theme-switch");
  if (!toggle) return;
  var system = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    return root.dataset.theme || (system.matches ? "dark" : "light");
  }
  function mark() {
    toggle.setAttribute("aria-checked", String(current() === "dark"));
  }

  toggle.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    mark();
  });
  system.addEventListener("change", mark);
  mark();
})();

// Home page without WebGL: the dark-trap video plays, or shows its first frame with reduced motion.
(function () {
  var video = document.querySelector(".hero-media video");
  if (!video) return;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  function motion() {
    if (video.parentNode.classList.contains("live")) return; // the 3D model has taken over
    if (still.matches) video.pause();
    else video.play().catch(function () {});
  }
  still.addEventListener("change", motion);
  motion();
})();
