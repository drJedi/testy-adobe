!(function () {
  // Minimalny test dla Adobe Target / SPA:
  // - brak MutationObserver na cały DOM
  // - brak ciągłego odświeżania (tylko eventy + pojedynczy fallback)
  if (window.__ceweRossmannTestBarApplied) return;
  window.__ceweRossmannTestBarApplied = true;

  const POS_THRESHOLD = 99.0;

  let currentShippingType = null;
  let currentCartTotal = undefined;
  let isClosed = false;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function parsePlnFromText(text) {
    if (!text) return undefined;
    const normalized = String(text)
      .replace(/\u00A0/g, " ")
      .replace(/[^\d,.\-]/g, "")
      .replace(",", ".");
    const v = parseFloat(normalized);
    return Number.isNaN(v) ? undefined : v;
  }

  function formatPln(value) {
    try {
      return new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return Number(value).toFixed(2).replace(".", ",");
    }
  }

  function toInt(value) {
    const n = typeof value === "number" ? value : parseInt(String(value), 10);
    return Number.isFinite(n) ? n : undefined;
  }

  function calcCartTotalFromTransactionProducts(transactionProducts) {
    if (!Array.isArray(transactionProducts)) return undefined;
    let sumGrosze = 0;
    for (const p of transactionProducts) {
      if (!p) continue;
      const basePrice = toInt(p.basePrice);
      if (typeof basePrice !== "number") continue;
      const qty = toInt(p.quantity) ?? 1;
      sumGrosze += basePrice * Math.max(1, qty);
    }
    return sumGrosze / 100;
  }

  function ensureStyles() {
    if (document.getElementById("cewe-test-rossmann-style")) return;
    const style = document.createElement("style");
    style.id = "cewe-test-rossmann-style";
    style.textContent = `
      .cewe-test-rossmann-modal {
        position: fixed;
        z-index: 2147483646;
        width: min(520px, calc(100vw - 24px));
        padding: 12px 14px;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        background: #fff;
        font-family: Arial, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.14);
        left: 12px;
        bottom: 12px;
        right: auto;
        top: auto;
      }
      .cewe-test-rossmann-modal.is-hidden { display: none; }
      .cewe-test-rossmann-modal__top {
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
      }
      .cewe-test-rossmann-modal__close {
        appearance:none;
        border:0;
        background:transparent;
        color:#666;
        cursor:pointer;
        font-size:16px;
        line-height:1;
        padding:2px 4px;
      }
      @media (max-width: 767px) {
        .cewe-test-rossmann-modal { width: calc(100vw - 24px); }
      }
      .cewe-test-rossmann__title {
        font-size: 13px;
        color: #222;
        line-height: 1.25;
      }
      .cewe-test-rossmann__title strong { font-weight: 700; }
      .cewe-test-rossmann__track {
        position: relative;
        height: 12px;
        background: #eee;
        border-radius: 999px;
        margin: 12px 0 0 0;
      }
      .cewe-test-rossmann__bar {
        height: 100%;
        width: 0%;
        background: #d91c1c;
        border-radius: 999px;
        transition: width .25s ease;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureWidget() {
    ensureStyles();
    const existing = document.getElementById("cewe-test-rossmann-modal");
    if (existing) return existing;

    const el = document.createElement("div");
    el.id = "cewe-test-rossmann-modal";
    el.className = "cewe-test-rossmann-modal";
    el.innerHTML = `
      <div class="cewe-test-rossmann-modal__top">
        <div class="cewe-test-rossmann__title" data-role="title">Wczytuję…</div>
        <button type="button" class="cewe-test-rossmann-modal__close" aria-label="Zamknij" data-role="close">×</button>
      </div>
      <div class="cewe-test-rossmann__track" aria-label="Postęp do darmowej dostawy">
        <div class="cewe-test-rossmann__bar" data-role="bar"></div>
      </div>
    `;

    const closeBtn = el.querySelector("[data-role='close']");
    closeBtn?.addEventListener("click", () => {
      isClosed = true;
      el.classList.add("is-hidden");
    });

    // fixed modal – dokładamy do body żeby nie był usuwany przez re-render komponentów
    (document.body || document.documentElement).appendChild(el);

    return el;
  }

  let raf = 0;
  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      render();
    });
  }

  function render() {
    const widget = ensureWidget();
    const title = widget.querySelector("[data-role='title']");
    const bar = widget.querySelector("[data-role='bar']");

    const total = currentCartTotal;
    if (typeof total !== "number") {
      if (title) title.textContent = "Wczytuję kwotę koszyka…";
      if (bar) bar.style.width = "0%";
      return;
    }
    const kwota = document.querySelector(".total-sum-price").innerText;
    const remaining = Math.max(0, POS_THRESHOLD - total);
    const progress = clamp((total / POS_THRESHOLD) * 100, 0, 100);

    const shipping = currentShippingType;
    const shippingLabel = shipping === "pos" ? "odbioru w drogerii" : "dostawy";

    if (remaining <= 0) {
      if (title) {
        title.innerHTML = `OK: koszyk <strong>${formatPln(total)} zł</strong> — darmowy próg osiągnięty (${shippingLabel}).`;
      }
    } else {
      if (title) {
        title.innerHTML =
          `TEST: koszyk <strong>${formatPln(total)} zł</strong>. ` +
          `Brakuje <strong>${kwota} zł</strong> do darmowego ${shippingLabel}.`;
      }
    }

    if (bar) bar.style.width = `${progress}%`;
  }

  function handleTrackingEvent(event) {
    const payload = event?.payLoad ?? event?.payload ?? {};

    if (payload.transactionShipping) {
      currentShippingType = payload.transactionShipping;
    }

    if (Array.isArray(payload.transactionProducts)) {
      const total = calcCartTotalFromTransactionProducts(payload.transactionProducts);
      if (typeof total === "number") currentCartTotal = total;
    }

    scheduleRender();
  }

  function initDataLayer() {
    // historyczne eventy (mogły polecieć zanim Target się wstrzyknął)
    if (Array.isArray(window.ceweDataLayer)) {
      window.ceweDataLayer.forEach(handleTrackingEvent);
    }

    const onTracking = (e) => {
      if (e?.detail) handleTrackingEvent(e.detail);
    };
    window.addEventListener("cw_tracking", onTracking);
    document.addEventListener("cw_tracking", onTracking);
  }

  function oneDomFallbackRead() {
    // Jednorazowy fallback z DOM (bez stałego observera)
    const el = document.querySelector(".total-sum-price");
    const raw = el?.innerText || el?.textContent;
    const v = parsePlnFromText(raw);
    if (typeof v === "number" && v > 0) {
      currentCartTotal = v;
      scheduleRender();
    }
  }

  function start() {
    initDataLayer();
    scheduleRender();

    // Fallback po chwili (Angular może dopiero dorysować sumę)
    setTimeout(oneDomFallbackRead, 600);
    setTimeout(oneDomFallbackRead, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

