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
// hero3d.js marks the picture "live" when the model has drawn, or sends "flat" when it cannot run. The
// module script sends "flat" too if it fails to load, and old browsers without modules run the nomodule
// script; as a last resort, if the module has not even started after 15 s, the video takes over.
(function () {
  var video = document.querySelector(".hero-media video");
  if (!video) return;
  var media = video.parentNode;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  function motion() {
    if (!media.classList.contains("flat")) return;
    if (still.matches) video.pause();
    else video.play().catch(function () {});
  }
  function flat() {
    if (media.classList.contains("live")) return;
    media.classList.add("flat");
    motion();
  }
  media.addEventListener("flat", flat);
  setTimeout(function () { if (!media.classList.contains("starting")) flat(); }, 15000);
  still.addEventListener("change", motion);
})();
