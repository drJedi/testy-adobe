!(function () {
  // Unikamy wielokrotnego nakładania skryptu
  if (window.__ceweFreeDeliveryUnifiedApplied) return;
  window.__ceweFreeDeliveryUnifiedApplied = true;

  console.log("cewe-free-delivery-unified.js started");

  // --- Konfiguracja ---
  const CONFIG = {
    thresholds: {
      pos: 99.0,
      mail: 249.0
    },
    upsell: {
      highThreshold: 70.0,
      photoSkus: [
        7924, 7930, 7918, 7932, 7926, 7934, 7928, 7936, 7925, 7931, 7933, 7935, 7929,
        7937, 7927, 7919,
      ]
    },
    selectors: {
      totalPrice: ".total-sum-price",
      itemsTable: "cw-items-table",
      itemsContainer: ".items"
    }
  };

  // --- Stan aplikacji ---
  let state = {
    shippingType: "mail", // domyślnie mail
    cartTotal: 0,
    hasPhotos: false,
    isInitialized: false
  };

  // --- Narzędzia ---
  function parsePln(text) {
    if (!text) return 0;
    const normalized = String(text)
      .replace(/\u00A0/g, " ")
      .replace(/[^\d,.\-]/g, "")
      .replace(",", ".");
    const v = parseFloat(normalized);
    return isFinite(v) ? v : 0;
  }

  function formatPln(value) {
    return new Intl.NumberFormat("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  // --- Logika biznesowa ---
  function updateStateFromDataLayer(event) {
    const payload = event?.payLoad ?? event?.payload ?? {};
    
    // Typ dostawy
    if (payload.transactionShipping) {
      state.shippingType = payload.transactionShipping === "pos" ? "pos" : "mail";
    }

    // Produkty i suma (opcjonalnie z payloadu)
    if (Array.isArray(payload.transactionProducts)) {
      let sumGrosze = 0;
      let photoFound = false;
      const photoSkuSet = new Set(CONFIG.upsell.photoSkus);

      payload.transactionProducts.forEach(p => {
        if (!p) return;
        const price = parseInt(p.basePrice, 10) || 0;
        const qty = parseInt(p.quantity, 10) || 1;
        sumGrosze += price * Math.max(1, qty);

        // Sprawdzenie SKU pod kątem zdjęć
        const skuRaw = p.sku ?? p.SKU;
        const skus = Array.isArray(skuRaw) ? skuRaw : [skuRaw];
        skus.forEach(s => {
          if (photoSkuSet.has(parseInt(s, 10))) photoFound = true;
        });
      });

      state.cartTotal = sumGrosze / 100;
      state.hasPhotos = photoFound;
    }
    
    render();
  }

  // --- DOM ---
  function ensureStyles() {
    if (document.getElementById("cewe-unified-style")) return;
    const style = document.createElement("style");
    style.id = "cewe-unified-style";
    style.textContent = `
      .cewe-fd-widget {
        max-width: 75%;
        margin: 10px 0 14px auto;
        padding: 12px 14px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: #fff;
        font-family: Arial, sans-serif;
        box-sizing: border-box;
      }
      @media (max-width: 767px) {
        .cewe-fd-widget { max-width: none; margin: 10px 12px 14px 12px; }
      }
      .cewe-fd__upsell {
        display: none; align-items: center; gap: 8px; padding: 8px 10px;
        background: #fdf2f2; border-radius: 6px; margin-bottom: 12px;
        border: 1px dashed #d91c1c;
      }
      .cewe-fd__upsell.is-active { display: flex; }
      .cewe-fd__upsell-icon { width: 20px; height: 20px; flex: 0 0 auto; fill: #d91c1c; }
      .cewe-fd__upsell-text { font-size: 13px; color: #d91c1c; line-height: 1.3; }
      .cewe-fd__upsell-link { color: #d91c1c; text-decoration: underline; font-weight: 700; }
      
      .cewe-fd__title { font-size: 13px; color: #222; line-height: 1.25; margin-bottom: 8px; }
      .cewe-fd__title strong { font-weight: 700; }
      
      .cewe-fd__track { position: relative; height: 12px; background: #eee; border-radius: 999px; margin: 12px 0; }
      .cewe-fd__bar { height: 100%; width: 0%; background: #d91c1c; border-radius: 999px; transition: width .35s ease; }
      .cewe-fd__bar.is-complete { background: #4FBB02; }
      
      .cewe-fd__thumb {
        position: absolute; top: 50%; left: 0%; transform: translate(-50%, -50%);
        width: 28px; height: 28px; display: grid; place-items: center;
        border-radius: 25%; background: #fff; border: 2px solid #d91c1c;
        box-shadow: 0 2px 4px rgba(0,0,0,.1); transition: left .35s ease; z-index: 2;
      }
      .cewe-fd__thumb.is-complete { border-color: #4FBB02; }
      .cewe-fd__truck { width: 18px; height: 18px; fill: #d91c1c; }
      .cewe-fd__thumb.is-complete .cewe-fd__truck { fill: #4FBB02; }
    `;
    document.head.appendChild(style);
  }

  function render() {
    const root = document.querySelector(CONFIG.selectors.itemsTable);
    if (!root) return;

    ensureStyles();
    let widget = root.querySelector(".cewe-fd-widget");
    if (!widget) {
      widget = document.createElement("div");
      widget.className = "cewe-fd-widget";
      widget.innerHTML = `
        <div class="cewe-fd__upsell" data-role="upsell">
          <svg class="cewe-fd__upsell-icon" viewBox="0 0 24 24"><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
          <div class="cewe-fd__upsell-text" data-role="upsell-text"></div>
        </div>
        <div class="cewe-fd__title" data-role="title"></div>
        <div class="cewe-fd__track">
          <div class="cewe-fd__bar" data-role="bar"></div>
          <div class="cewe-fd__thumb" data-role="thumb">
            <svg class="cewe-fd__truck" viewBox="0 0 297 297">
              <path d="M242.309,210.424c-14.535,0-26.359,11.84-26.359,26.398c0,14.564,11.824,26.412,26.359,26.412 c14.541,0,26.362-11.848,26.362-26.412C268.671,222.264,256.85,210.424,242.309,210.424z"/>
              <path d="M64.565,210.424c-14.542,0-26.366,11.84-26.366,26.398c0,14.564,11.824,26.412,26.366,26.412 c14.534,0,26.358-11.848,26.358-26.412C90.924,222.264,79.1,210.424,64.565,210.424z"/>
              <path d="M257.182,99.523c-1.391-4.191-5.313-7.023-9.732-7.023H234.99v43.828h34.384L257.182,99.523z"/>
              <path d="M290.21,152.73h-55.22v41.928c2.379-0.408,4.825-0.637,7.318-0.637c22.033,0,40.225,16.77,42.515,38.225h1.93 c5.657,0,10.247-4.59,10.247-10.254v-59.623C297,157.92,294.164,154.152,290.21,152.73z"/>
              <path d="M218.199,44.02c0-5.664-4.59-10.254-10.248-10.254H10.247C4.59,33.766,0,38.355,0,44.02v177.973 c0,5.664,4.59,10.254,10.247,10.254h11.8c2.291-21.455,20.482-38.225,42.519-38.225c22.029,0,40.217,16.77,42.508,38.225h80.925 h11.8c1.38-12.918,8.521-24.123,18.796-31.008L218.199,44.02z"/>
            </svg>
          </div>
        </div>
      `;
      const container = root.querySelector(CONFIG.selectors.itemsContainer);
      if (container) root.insertBefore(widget, container);
      else root.prepend(widget);
    }

    // Pobranie sumy z DOM jako fallback/dodatkowe źródło
    const domPriceEl = document.querySelector(CONFIG.selectors.totalPrice);
    if (domPriceEl) {
      const domTotal = parsePln(domPriceEl.innerText);
      if (domTotal > 0) state.cartTotal = domTotal;
    }

    const threshold = CONFIG.thresholds[state.shippingType] || CONFIG.thresholds.mail;
    const remaining = Math.max(0, threshold - state.cartTotal);
    const progress = Math.min(100, (state.cartTotal / threshold) * 100);
    const isComplete = remaining <= 0;

    // UI: Tytuł
    const titleEl = widget.querySelector("[data-role='title']");
    const deliveryName = state.shippingType === "pos" ? "odbiór w drogerii" : "wysyłkę";
    if (isComplete) {
      titleEl.innerHTML = `Gratulacje! Masz <strong>darmową ${deliveryName}</strong>.`;
    } else {
      titleEl.innerHTML = `Brakuje Ci <strong>${formatPln(remaining)}&nbsp;zł</strong> do darmowej ${deliveryName}.`;
    }

    // UI: Pasek i Truck
    const barEl = widget.querySelector("[data-role='bar']");
    const thumbEl = widget.querySelector("[data-role='thumb']");
    barEl.style.width = `${progress}%`;
    thumbEl.style.left = `${progress}%`;
    barEl.classList.toggle("is-complete", isComplete);
    thumbEl.classList.toggle("is-complete", isComplete);

    // UI: Upsell (tylko dla POS i jeśli brakuje)
    const upsellEl = widget.querySelector("[data-role='upsell']");
    const upsellTextEl = widget.querySelector("[data-role='upsell-text']");
    if (state.shippingType === "pos" && !isComplete) {
      upsellEl.classList.add("is-active");
      const remText = `${formatPln(remaining)}&nbsp;zł`;
      if (remaining >= CONFIG.upsell.highThreshold) {
        upsellTextEl.innerHTML = `Brakuje Ci <strong>${remText}</strong>. Dobierz <a href="/fotoprezenty/kula-ze-zdjeciem.html" class="cewe-fd__upsell-link">kulę</a> lub <a href="/zdjecia/zdjecie-w-ramce.html" class="cewe-fd__upsell-link">zdjęcie w ramce</a> i odbierz za darmo.`;
      } else {
        const link = state.hasPhotos ? 
          { url: "/dodatki-do-fotoproduktow.html", text: "dodatki do zdjęć" } : 
          { url: "/zdjecia/standard.html", text: "zdjęcia" };
        upsellTextEl.innerHTML = `Brakuje Ci <strong>${remText}</strong>. Dobierz <a href="${link.url}" class="cewe-fd__upsell-link">${link.text}</a> i odbierz za darmo.`;
      }
    } else {
      upsellEl.classList.remove("is-active");
    }
  }

  // --- Inicjalizacja ---
  function init() {
    if (state.isInitialized) return;
    state.isInitialized = true;

    // 1. DataLayer
    const handleEvent = (e) => {
      const data = e.detail || e;
      if (data && (data.action || data.payLoad)) updateStateFromDataLayer(data);
    };

    if (Array.isArray(window.ceweDataLayer)) {
      window.ceweDataLayer.forEach(handleEvent);
    }
    window.addEventListener("cw_tracking", handleEvent);
    document.addEventListener("cw_tracking", handleEvent);

    // 2. MutationObserver na BODY (z throttlingiem)
    let rafId = null;
    const observer = new MutationObserver(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        render();
        rafId = null;
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Initial render
    render();
    
    // Safety fallback
    setInterval(render, 2000);
  }

  // Czekamy na gotowość DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
