!(function () {
  if (window.__ceweFreeDeliveryProgressApplied) return;
  window.__ceweFreeDeliveryProgressApplied = true;

  console.log("pogresbar-1s-test.js");

  const DEFAULT_THRESHOLD = 249.0;
  const threshold =
    typeof window.__ceweFreeDeliveryThreshold === "number"
      ? window.__ceweFreeDeliveryThreshold
      : DEFAULT_THRESHOLD;

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
      return value.toFixed(2).replace(".", ",");
    }
  }

  function getCartTotal() {
    const el = document.querySelector(".total-sum-price");
    const raw = el?.innerText;
    return parsePlnFromText(raw);
  }

  function ensureStyles() {
    if (document.getElementById("cewe-free-delivery-style")) return;
    const style = document.createElement("style");
    style.id = "cewe-free-delivery-style";
    style.textContent = `
      .cewe-free-delivery {
        margin: 10px 0 14px;
        padding: 12px 14px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: #fff;
        font-family: Arial, sans-serif;
      }
      .cewe-free-delivery__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .cewe-free-delivery__title {
        font-size: 13px;
        color: #222;
        line-height: 1.25;
      }
      .cewe-free-delivery__title strong { font-weight: 700; }
      .cewe-free-delivery__track {
        position: relative;
        height: 12px;
        background: #eee;
        border-radius: 999px;
        overflow: hidden;
      }
      .cewe-free-delivery__bar {
        height: 100%;
        width: 0%;
        background: #d91c1c;
        border-radius: 999px;
        transition: width .35s ease;
      }
      .cewe-free-delivery__thumb {
        position: absolute;
        top: 50%;
        left: 0%;
        transform: translate(-50%, -50%);
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: #fff;
        border: 2px solid #d91c1c;
        box-shadow: 0 2px 8px rgba(0,0,0,.12);
        pointer-events: none;
      }
        .cewe-truck-icon {
  width: 16px;
  height: 16px;
  fill: #d91c1c; 
  border: 1px solid #d91c1c; 
  border-radius: 4px; 
  background-color: #fff; 
  padding: 2px; 
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); /* Cień */
  position: relative;
  z-index: 10; /
}
      .cewe-free-delivery__truck {
        width: 16px;
        height: 16px;
        display: grid;
        place-items: center;
        border: 1px solid #d91c1c;
        border-radius: 4px;
        background: #fff;
      }
      .cewe-free-delivery__truck svg {
        width: 12px;
        height: 12px;
        display: block;
        fill: #d91c1c;
      }
    `;
    document.head.appendChild(style);
  }

  function getItemsTableRoot() {
    // Target: cw-items-table (Angular component)
    return document.querySelector("cw-items-table");
  }

  function ensureWidget() {
    ensureStyles();
    const root = getItemsTableRoot();
    if (!root) return null;

    const existing = root.querySelector("[data-it-name='free-delivery-progress']");
    if (existing) return existing;

    // Insert as the first element inside cw-items-table, above .items
    const widget = document.createElement("div");
    widget.className = "cewe-free-delivery";
    widget.setAttribute("data-it-name", "free-delivery-progress");
    widget.innerHTML = `
      <div class="cewe-free-delivery__row">
        <div class="cewe-free-delivery__title" data-role="title"></div>
      </div>
      <div class="cewe-free-delivery__track" aria-label="Postęp do darmowej dostawy">
        <div class="cewe-free-delivery__bar" data-role="bar"></div>
        <div class="cewe-free-delivery__thumb" data-role="thumb" aria-hidden="true">
          <span class="cewe-free-delivery__truck" aria-hidden="true" data-role="thumb-icon">
           <img src="https://cdn.cewe.pl/other/local_shipping.svg" alt="Truck Icon" class="cewe-truck-icon" width="12" height="12" />
          </span>
        </div>
      </div>
    `;

    const items = root.querySelector(".items");
    if (items && items.parentElement === root) {
      root.insertBefore(widget, items);
    } else {
      root.insertBefore(widget, root.firstChild);
    }

    return widget;
  }

  function update() {
    const widget = ensureWidget();
    if (!widget) return;

    const title = widget.querySelector("[data-role='title']");
    const bar = widget.querySelector("[data-role='bar']");
    const thumb = widget.querySelector("[data-role='thumb']");

    const total = getCartTotal();
    if (typeof total !== "number") {
      if (title) title.innerHTML = `Wczytuję kwotę koszyka…`;
      if (bar) bar.style.width = "0%";
      if (thumb) thumb.style.left = "0%";
      return;
    }

    const missing = Math.max(0, threshold - total);
    const progress = clamp((total / threshold) * 100, 0, 100);

    if (missing <= 0) {
      if (title)
        title.innerHTML = `Udało się! Zyskujesz <strong>darmową wysyłkę</strong>.`;
    } else {
      if (title)
        title.innerHTML = `Brakuje Ci <strong>${formatPln(missing)}&nbsp;zł</strong> do darmowej wysyłki.`;
    }

    if (bar) bar.style.width = `${progress}%`;
    if (thumb) thumb.style.left = `${progress}%`;
  }

  function startObservers() {
    update();

    const target = document.body;
    if (!target) return;

    const mo = new MutationObserver(() => {
      // throttle via rAF
      if (startObservers._raf) return;
      startObservers._raf = requestAnimationFrame(() => {
        startObservers._raf = 0;
        update();
      });
    });

    mo.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    // Fallback (np. gdy zmiana innerText nie triggeruje characterData w danym miejscu)
    setInterval(update, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObservers, { once: true });
  } else {
    startObservers();
  }
})();