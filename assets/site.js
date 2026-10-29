// Light/dark switch in the lower right. The page follows the system setting until someone picks a side.
(function () {
  var root = document.documentElement;
  var buttons = document.querySelectorAll("[data-theme-choice]");
  if (!buttons.length) return;
  var system = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    return root.dataset.theme || (system.matches ? "dark" : "light");
  }
  function mark() {
    var theme = current();
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.themeChoice === theme)); });
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      root.dataset.theme = b.dataset.themeChoice;
      try { localStorage.setItem("theme", b.dataset.themeChoice); } catch (e) {}
      mark();
    });
  });
  system.addEventListener("change", mark);
  mark();
})();

// Home page: a laser spot that trails the cursor inside the intro frame.
(function () {
  var frame = document.querySelector(".beam");
  var spot = frame && frame.querySelector(".laser");
  if (!spot || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var x = 0, y = 0, tx = 0, ty = 0, running = false;

  function draw() {
    // ease towards the cursor, like a steering mirror catching up
    x += (tx - x) * (still ? 1 : 0.18);
    y += (ty - y) * (still ? 1 : 0.18);
    spot.style.transform = "translate(" + x + "px," + y + "px)";
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) requestAnimationFrame(draw);
    else running = false;
  }

  frame.addEventListener("pointermove", function (e) {
    var box = frame.getBoundingClientRect();
    tx = e.clientX - box.left;
    ty = e.clientY - box.top;
    if (!frame.classList.contains("lit")) { x = tx; y = ty; frame.classList.add("lit"); }
    if (!running) { running = true; requestAnimationFrame(draw); }
  });
  frame.addEventListener("pointerleave", function () { frame.classList.remove("lit"); });
})();
