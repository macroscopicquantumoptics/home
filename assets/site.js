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

// Home page: the dark-trap rendering leans a little towards the cursor, like looking into the trap from a new angle.
(function () {
  var hero = document.querySelector(".hero");
  var media = hero && hero.querySelector(".hero-media");
  if (!media) return;
  var video = media.querySelector("video");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");

  // reduced motion: show the first frame only
  function motion() {
    if (!video) return;
    if (still.matches) video.pause();
    else video.play().catch(function () {});
  }
  still.addEventListener("change", motion);
  motion();

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  hero.addEventListener("pointermove", function (e) {
    if (still.matches) return;
    var box = hero.getBoundingClientRect();
    var dx = (e.clientX - box.left) / box.width - 0.5;
    var dy = (e.clientY - box.top) / box.height - 0.5;
    media.style.transform = "translate(" + (-dx * 2.4) + "%," + (-dy * 2.4) + "%) scale(1.03)";
  });
  hero.addEventListener("pointerleave", function () { media.style.transform = ""; });
})();
