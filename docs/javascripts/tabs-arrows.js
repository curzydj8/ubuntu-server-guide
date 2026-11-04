/* 顶部标签栏滚动箭头：标签太多、一屏放不下时，在栏两端加 ‹ › 按钮，
   点一下横向滚一屏；滚到头时对应按钮变灰；标签全部放得下时按钮隐藏。
   与 instant navigation 共存：换页后标签栏被重建时由 MutationObserver 补挂。 */
(function () {
  var observed = false;

  function init() {
    var tabs = document.querySelector(".md-tabs");
    if (!tabs) return;
    if (tabs.querySelector(".md-tabs__arrow")) return;
    var list = tabs.querySelector(".md-tabs__list");
    var grid = tabs.querySelector(".md-grid");
    if (!list || !grid) return;

    function makeBtn(dir, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "md-tabs__arrow";
      b.setAttribute("aria-label", label);
      b.textContent = dir < 0 ? "‹" : "›";
      b.addEventListener("click", function () {
        list.scrollBy({ left: dir * list.clientWidth * 0.8, behavior: "smooth" });
      });
      return b;
    }

    var prev = makeBtn(-1, "向左滚动标签");
    var next = makeBtn(1, "向右滚动标签");
    tabs.classList.add("tabs-arrows");
    tabs.insertBefore(prev, grid);
    tabs.appendChild(next);

    function update() {
      var max = list.scrollWidth - list.clientWidth;
      var overflow = max > 1;
      prev.style.display = overflow ? "" : "none";
      next.style.display = overflow ? "" : "none";
      prev.disabled = list.scrollLeft <= 0;
      next.disabled = list.scrollLeft >= max - 1;
    }

    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    if (!observed && document.body) {
      observed = true;
      new MutationObserver(function () {
        init();
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
