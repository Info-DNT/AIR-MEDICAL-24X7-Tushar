/* Air Medical 24X7 — site behaviour.
 *
 * Rewritten without jQuery. The previous version threw a TypeError on line 28 of every
 * page (it called a Tempus Dominus datepicker plugin that no page ever loaded), which
 * aborted the script and silently disabled the back-to-top button, the navbar active
 * state and every carousel. Those calls are gone; nothing here depends on a plugin.
 */
(function () {
  "use strict";

  /* ---------- Desktop dropdown on hover ---------- */
  // Toggles the class rather than synthesising a click, so Bootstrap's own click
  // handler can't immediately close what the hover just opened.
  function initHoverDropdowns() {
    var dropdowns = document.querySelectorAll(".navbar .dropdown");
    var enabled = null;

    function open(e) {
      e.currentTarget.classList.add("show");
      var menu = e.currentTarget.querySelector(".dropdown-menu");
      if (menu) menu.classList.add("show");
    }

    function close(el) {
      el.classList.remove("show");
      var menu = el.querySelector(".dropdown-menu");
      if (menu) menu.classList.remove("show");
    }

    function onOut(e) {
      close(e.currentTarget);
    }

    function apply() {
      var wide = window.innerWidth > 992;
      if (wide === enabled) return;
      enabled = wide;
      Array.prototype.forEach.call(dropdowns, function (d) {
        if (wide) {
          d.addEventListener("mouseover", open);
          d.addEventListener("mouseout", onOut);
        } else {
          d.removeEventListener("mouseover", open);
          d.removeEventListener("mouseout", onOut);
          close(d);
        }
      });
    }

    apply();
    window.addEventListener("resize", apply, { passive: true });
  }

  /* ---------- Back to top ---------- */
  function initBackToTop() {
    var btn = document.querySelector(".back-to-top");
    if (!btn) return;

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        btn.classList.toggle("is-visible", window.pageYOffset > 100);
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ---------- Navbar active state ---------- */
  // Exact segment matching, so /air-ambulance doesn't also light up /air-ambulance-charters.
  function initActiveNav() {
    var path = window.location.pathname;
    if (path === "" || path === "/index.html" || path === "/index") path = "/";
    if (path !== "/" && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);

    var links = document.querySelectorAll(".navbar-nav a");
    Array.prototype.forEach.call(links, function (a) {
      var href = a.getAttribute("href");
      if (!href || href === "#") return;

      var clean = href.replace(/^\.\.\//, "").replace(/\.html$/, "");
      if (clean === "index" || clean === "/index" || clean === "./") clean = "/";
      if (clean.charAt(0) !== "/") clean = "/" + clean;

      var match = clean === "/"
        ? path === "/"
        : (path === clean || path.indexOf(clean + "/") === 0);

      a.classList.toggle("active", match);
      if (match && a.closest) {
        var parent = a.closest(".dropdown");
        if (parent) {
          var toggle = parent.querySelector(".nav-link");
          if (toggle) toggle.classList.add("active");
        }
      }
    });
  }

  /* ---------- Country search (countries page) ---------- */
  window.filterCountries = function () {
    var input = document.getElementById("countrySearch");
    if (!input) return;
    var filter = input.value.toLowerCase().trim();
    var cards = document.querySelectorAll(".country-card");
    Array.prototype.forEach.call(cards, function (card) {
      var col = card.closest(".col-lg-3, .col-md-4, .col-sm-6");
      if (col) col.style.display = card.innerText.toLowerCase().indexOf(filter) !== -1 ? "" : "none";
    });
  };

  /* ---------- SOS panel ---------- */
  window.toggleSOS = function () {
    var popup = document.getElementById("sos-popup");
    if (!popup) return;
    popup.style.display = popup.style.display === "block" ? "none" : "block";
  };

  /* ---------- Boot ---------- */
  function init() {
    initHoverDropdowns();
    initBackToTop();
    initActiveNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* Local-development helper only: resolves extensionless URLs under Live Server. */
  if ("serviceWorker" in navigator &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("/sw.js").catch(function () { /* non-fatal */ });
  }
})();

/* NOTE — the fabricated "social proof" generator that used to live here has been left out
 * deliberately. It invented visitor names and cities ("Rah*** from Mumbai just requested a
 * free quotation") from a hardcoded list, with no data behind it. It never actually ran,
 * because the TypeError above aborted the script before it initialised, so removing it
 * changes nothing users have ever seen. Restoring it would mean publishing fabricated
 * activity claims — a consumer-protection risk in several operating markets — so that is a
 * decision for the site owner, not a side effect of a performance fix.
 * The original implementation is preserved in the pre-optimisation backup.
 */
