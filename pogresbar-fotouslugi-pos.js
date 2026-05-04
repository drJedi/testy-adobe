!(function () {
  if (window.__fotoUslugiFreeDeliveryApplied) return;
  window.__fotoUslugiFreeDeliveryApplied = true;

  console.log("pogresbar-fotouslugi-pos.js");

  const POS_THRESHOLD = 99.0;
  let currentShippingType = null;
  let currentCartTotal = undefined;

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

  function handleDataLayerEvent(event) {
    if (event.action === "SC_INIT" || event.action === "SC_CHANGE_SHIPPING") {
      const shipping = event.payLoad?.transactionShipping;
      if (shipping) {
        currentShippingType = shipping;
        update();
      }
    }

    // W SPA zdarza się, że zmiany ilości idą inną akcją (np. SC_CHANGE_SHIPPING),
    // ale payload i tak niesie aktualne `transactionProducts`.
    const products = event.payLoad?.transactionProducts;
    if (Array.isArray(products)) {
      const total = calcCartTotalFromTransactionProducts(products);
      if (typeof total === "number") {
        currentCartTotal = total;
        update();
      }
    }
  }

  function initDataLayer() {
    if (Array.isArray(window.ceweDataLayer)) {
      window.ceweDataLayer.forEach(handleDataLayerEvent);
    }
    window.addEventListener("cw_tracking", (e) => {
      if (e.detail) handleDataLayerEvent(e.detail);
    });
  }

  function startTotalSumObserver() {
    const selector = ".total-sum-price";

    const attach = (el) => {
      const read = () => {
        const raw = el.innerText;
        const v = parsePlnFromText(raw);
        if (typeof v === "number") {
          currentCartTotal = v;
          update();
        }
      };

      read();
      const mo = new MutationObserver(read);
      mo.observe(el, { characterData: true, childList: true, subtree: true });
    };

    const existing = document.querySelector(selector);
    if (existing) {
      attach(existing);
      return;
    }

    const mo = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        mo.disconnect();
        attach(el);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

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
    if (typeof currentCartTotal === "number") return currentCartTotal;
    const el = document.querySelector(".total-sum-price");
    const raw = el?.innerText;
    return parsePlnFromText(raw);
  }

  function ensureStyles() {
    if (document.getElementById("fotouslugi-free-delivery-style")) return;
    const style = document.createElement("style");
    style.id = "fotouslugi-free-delivery-style";
    style.textContent = `
      .cewe-free-delivery {
        max-width: 75%;
        margin: 10px 0 14px auto;
        padding: 12px 14px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: #fff;
        font-family: Arial, sans-serif;
        display: none; /* Hidden by default */
      }
      .cewe-free-delivery.is-visible {
        display: block;
      }
      @media (max-width: 767px) {
        .cewe-free-delivery {
          max-width: none;
          margin: 10px 12px 14px 12px;
        }
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
        margin: 12px 0;
      }
      .cewe-free-delivery__bar {
        height: 100%;
        width: 0%;
        background: #d91c1c;
        border-radius: 999px;
        transition: width .35s ease, background-color .35s ease;
      }
      .cewe-free-delivery__bar.is-complete {
        background: #4FBB02;
      }
      .cewe-free-delivery__thumb {
        position: absolute;
        top: 50%;
        left: 0%;
        transform: translate(-50%, -50%);
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border-radius: 25%;
        background: #fff;
        border: 2px solid #d91c1c;
        box-shadow: 0 2px 4px rgba(0,0,0,.1);
        pointer-events: none;
        transition: left .35s ease, border-color .35s ease;
        z-index: 2;
      }
      .cewe-free-delivery__thumb.is-complete {
        border-color: #4FBB02;
      }
      .cewe-free-delivery__truck {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .cewe-free-delivery__truck svg {
        width: 100%;
        height: 100%;
        display: block;
        fill: #d91c1c;
        transition: fill .35s ease;
      }
      .cewe-free-delivery__thumb.is-complete svg {
        fill: #4FBB02;
      }
    `;
    document.head.appendChild(style);
  }

  function getItemsTableRoot() {
    return document.querySelector("cw-items-table");
  }

  function ensureWidget() {
    ensureStyles();
    const root = getItemsTableRoot();
    if (!root) return null;

    const existing = root.querySelector("[data-it-name='free-delivery-progress']");
    if (existing) return existing;

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
            <svg viewBox="0 0 297 297">
              <path d="M242.309,210.424c-14.535,0-26.359,11.84-26.359,26.398c0,14.564,11.824,26.412,26.359,26.412 c14.541,0,26.362-11.848,26.362-26.412C268.671,222.264,256.85,210.424,242.309,210.424z"/>
              <path d="M64.565,210.424c-14.542,0-26.366,11.84-26.366,26.398c0,14.564,11.824,26.412,26.366,26.412 c14.534,0,26.358-11.848,26.358-26.412C90.924,222.264,79.1,210.424,64.565,210.424z"/>
              <path d="M257.182,99.523c-1.391-4.191-5.313-7.023-9.732-7.023H234.99v43.828h34.384L257.182,99.523z"/>
              <path d="M290.21,152.73h-55.22v41.928c2.379-0.408,4.825-0.637,7.318-0.637c22.033,0,40.225,16.77,42.515,38.225h1.93 c5.657,0,10.247-4.59,10.247-10.254v-59.623C297,157.92,294.164,154.152,290.21,152.73z"/>
              <path d="M218.199,44.02c0-5.664-4.59-10.254-10.248-10.254H10.247C4.59,33.766,0,38.355,0,44.02v177.973 c0,5.664,4.59,10.254,10.247,10.254h11.8c2.291-21.455,20.482-38.225,42.519-38.225c22.029,0,40.217,16.77,42.508,38.225h80.925 h11.8c1.38-12.918,8.521-24.123,18.796-31.008L218.199,44.02z"/>
            </svg>
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

    // Show only for POS
    if (currentShippingType === "pos") {
      widget.classList.add("is-visible");
    } else {
      widget.classList.remove("is-visible");
      return;
    }

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

    const remaining = Math.max(0, POS_THRESHOLD - total);
    const progressPercent = clamp((total / POS_THRESHOLD) * 100, 0, 100);
    const isComplete = total >= POS_THRESHOLD;

    if (isComplete) {
      if (title) title.innerHTML = `Gratulacje! Masz <strong>darmowy odbiór w drogerii</strong>.`;
      bar?.classList.add("is-complete");
      thumb?.classList.add("is-complete");
    } else {
      if (title) {
        title.innerHTML = `Brakuje Ci <strong>${formatPln(remaining)}&nbsp;zł</strong> do darmowego odbioru w drogerii.`;
      }
      bar?.classList.remove("is-complete");
      thumb?.classList.remove("is-complete");
    }

    if (bar) bar.style.width = `${progressPercent}%`;
    if (thumb) thumb.style.left = `${progressPercent}%`;
  }

  // Monitor changes in cart total
  const observer = new MutationObserver(() => {
    update();
  });

  function startObserving() {
    const target = document.querySelector(".total-sum-price") || document.body;
    observer.observe(target, { childList: true, characterData: true, subtree: true });
  }

  initDataLayer();
  startTotalSumObserver();
  startObserving();
  update();

})();
