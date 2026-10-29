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
