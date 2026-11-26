const AUTO_DELAY = 5_000;
const MANUAL_DELAY = 10_000;

export function initHeroCarousel(hero) {
  const slides = [...hero.querySelectorAll(".hero-slide")];
  const dots = [...hero.querySelectorAll(".hero-dot")];
  const controls = hero.querySelector(".hero-controls");
  const status = hero.querySelector("#hero-slide-status");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let timer = null;
  let remaining = AUTO_DELAY;
  let deadline = 0;

  function showSlide(index, announce = false) {
    current = index;
    slides.forEach((slide, position) => {
      const active = position === current;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      dots[position].setAttribute("aria-pressed", String(active));
    });
    // Automatic transitions stay silent for screen readers.
    if (announce) status.textContent = `Fotografie ${current + 1} ze ${slides.length}`;
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = null;
    if (reducedMotion.matches || document.hidden) return;
    deadline = performance.now() + remaining;
    timer = window.setTimeout(() => {
      timer = null;
      showSlide((current + 1) % slides.length);
      remaining = AUTO_DELAY;
      schedule();
    }, remaining);
  }

  function stopTimer() {
    if (timer === null) return;
    remaining = Math.max(0, deadline - performance.now());
    window.clearTimeout(timer);
    timer = null;
  }

  function selectSlide(index) {
    showSlide(index, true);
    remaining = MANUAL_DELAY;
    schedule();
  }

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => selectSlide(index));
    dot.addEventListener("keydown", (event) => {
      let target;
      if (event.key === "ArrowRight") target = (index + 1) % dots.length;
      else if (event.key === "ArrowLeft") target = (index - 1 + dots.length) % dots.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = dots.length - 1;
      else return;
      event.preventDefault();
      selectSlide(target);
      dots[target].focus();
    });
  });

  // Preserve the remaining display time when the browser tab is in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else schedule();
  });
  window.addEventListener("pagehide", stopTimer);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) schedule();
  });
  reducedMotion.addEventListener("change", () => {
    stopTimer();
    schedule();
  });

  controls.hidden = false;
  showSlide(0);
  schedule();
}
