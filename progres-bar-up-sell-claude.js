!(function () {
    if (window.__fotoUslugiCrossSellApplied) return;
    window.__fotoUslugiCrossSellApplied = true;

    const POS_THRESHOLD = 99.0;
    const UPSELL_HIGH_REMAINING_THRESHOLD = 70.0;
    const PHOTO_SKUS = [
        7924, 7930, 7918, 7932, 7926, 7934, 7928, 7936, 7925, 7931, 7933, 7935, 7929,
        7937, 7927, 7919,
    ];
    let currentShippingType = null;
    let hasPhotosInCart = false;
    let currentCartTotal = undefined;

    function toInt(value) {
        const n = typeof value === "number" ? value : parseInt(String(value), 10);
        return Number.isFinite(n) ? n : undefined;
    }

    function calcCartTotalFromTransactionProducts(transactionProducts) {
        if (!Array.isArray(transactionProducts)) return undefined;
        console.log("Processing transactionProducts:", transactionProducts);
        let sumGrosze = 0;
        for (const p of transactionProducts) {
            if (!p) continue;
            const basePrice = toInt(p.basePrice);
            if (typeof basePrice !== "number") continue;
            const qty = toInt(p.quantity) ?? 1;
            const calculatedProductPrice = (basePrice * Math.max(1, qty)) / 100;
            console.log(`Product: ${p.title || 'Unknown'}, basePrice (grosze): ${basePrice}, quantity: ${qty}, calculated: ${calculatedProductPrice} PLN`);
            sumGrosze += basePrice * Math.max(1, qty);
        }
        const total = sumGrosze / 100;
        console.log("Total from products (DataLayer):", total);
        return total;
    }

    function applyTransactionProducts(transactionProducts) {
        if (!Array.isArray(transactionProducts)) return;

        const total = calcCartTotalFromTransactionProducts(transactionProducts);
        if (typeof total === "number") currentCartTotal = total;

        const skus = [];
        for (const p of transactionProducts) {
            if (!p) continue;
            skus.push(...skuValuesFromField(p.sku ?? p.SKU));
        }
        const photoSkuSet = new Set(PHOTO_SKUS);
        hasPhotosInCart = skus.some((s) => photoSkuSet.has(s));
    }

    function toSkuNumber(value) {
        const n = typeof value === "number" ? value : parseInt(String(value), 10);
        return Number.isFinite(n) ? n : undefined;
    }

    /** `sku` w danych może być liczbą albo tablicą (np. [7918]) — bierzemy wszystkie wartości liczbowe. */
    function skuValuesFromField(raw) {
        if (raw == null) return [];
        if (Array.isArray(raw)) {
            const out = [];
            for (const x of raw) {
                const n = toSkuNumber(x);
                if (typeof n === "number") out.push(n);
            }
            return out;
        }
        const n = toSkuNumber(raw);
        return typeof n === "number" ? [n] : [];
    }


    let rafId = null;
    function scheduleUpdate() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            update();
            rafId = null;
        });
    }

    function handleDataLayerEvent(event) {
        const payload = event?.payLoad ?? event?.payload ?? {};

        if (Array.isArray(payload.transactionProducts)) {
            applyTransactionProducts(payload.transactionProducts);
            scheduleUpdate();
        }

        if (event.action === "SC_INIT") {
            const shipping = payload.transactionShipping;
            if (shipping) currentShippingType = shipping;
            scheduleUpdate();
            return;
        }

        if (event.action === "SC_CHANGE_QUANTITY" || event.action === "SC_DELETE_ITEMS") {
            scheduleUpdate();
            return;
        }

        if (event.action === "SC_CHANGE_SHIPPING") {
            const shipping = payload.transactionShipping;
            if (shipping) {
                currentShippingType = shipping;
            }
            scheduleUpdate();
        }
    }

    function initDataLayer() {
        const handle = (event) => {
            if (event && (event.action || event.payLoad)) {
                handleDataLayerEvent(event);
            }
        };

        if (Array.isArray(window.ceweDataLayer)) {
            window.ceweDataLayer.forEach(handle);
        }

        const originalPush = window.ceweDataLayer?.push;
        if (typeof originalPush === "function") {
            window.ceweDataLayer.push = function (...args) {
                args.forEach(handle);
                return originalPush.apply(this, args);
            };
        }

        const onTracking = (e) => {
            if (e.detail) handle(e.detail);
        };

        window.addEventListener("cw_tracking", onTracking);
        document.addEventListener("cw_tracking", onTracking);
    }

    function startTotalSumObserver() {
        const selector = ".total-sum-price";

        const attach = (el) => {
            const read = () => {
                const raw = el.innerText || el.textContent;
                const v = parsePlnFromText(raw);
                console.log("DOM total raw text:", raw, "parsed value:", v);
                if (typeof v === "number" && v > 0) {
                    currentCartTotal = v;
                    scheduleUpdate();
                }
            };

            read();
            // Obserwujemy zmiany w samym elemencie ceny
            const mo = new MutationObserver(read);
            mo.observe(el, { characterData: true, childList: true, subtree: true });
        };

        // Szukamy elementu regularnie, dopóki go nie znajdziemy
        const findElement = () => {
            const el = document.querySelector(selector);
            if (el) {
                attach(el);
                return true;
            }
            return false;
        };

        if (!findElement()) {
            const mo = new MutationObserver(() => {
                if (findElement()) {
                    mo.disconnect();
                }
            });
            mo.observe(document.body, { childList: true, subtree: true });
        }
    }

    function startBootstrapRetry() {
        const startedAt = Date.now();
        const iv = setInterval(() => {
            scheduleUpdate();

            const widgetExists = !!document.querySelector(
                "[data-it-name='free-delivery-progress-upsell']"
            );
            const hasTotal = typeof currentCartTotal === "number";
            const hasShipping = typeof currentShippingType === "string";

            if (widgetExists && hasShipping && hasTotal) {
                clearInterval(iv);
                return;
            }
            if (Date.now() - startedAt > 20000) {
                clearInterval(iv);
            }
        }, 250);
    }

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function parsePlnFromText(text) {
        if (!text) return undefined;
        // Usuwamy spacje (w tym &nbsp; / \u00A0), waluty i inne znaki niebędące cyframi, przecinkiem lub kropką
        // FIX #1: używamy /,/g zamiast "," żeby zastąpić WSZYSTKIE przecinki (nie tylko pierwszy)
        const normalized = String(text)
            .replace(/\s/g, "")
            .replace(/\u00A0/g, "")
            .replace(/[^\d,.\-]/g, "")
            .replace(/,/g, ".");

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
        const raw = el?.innerText || el?.textContent;
        const fromDom = parsePlnFromText(raw);

        if (typeof fromDom === "number" && fromDom > 0) {
            return fromDom;
        }

        return currentCartTotal;
    }

    function ensureStyles() {
        if (document.getElementById("fotouslugi-cross-sell-style")) return;
        const style = document.createElement("style");
        style.id = "fotouslugi-cross-sell-style";
        style.textContent = `
      .cewe-free-delivery {
        max-width: 75%;
        margin: 10px 0 14px auto;
        padding: 12px 14px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: #fff;
        font-family: Arial, sans-serif;
        display: none;
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
      .cewe-free-delivery__upsell {
        display: none;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: #fdf2f2;
        border-radius: 6px;
        margin-bottom: 12px;
        border: 1px dashed #d91c1c;
      }
      .cewe-free-delivery__upsell.is-active {
        display: flex;
      }
      .cewe-free-delivery__upsell-icon {
        width: 20px;
        height: 20px;
        flex: 0 0 auto;
        fill: #d91c1c;
      }
      .cewe-free-delivery__upsell-text {
        font-size: 13px;
        color: #d91c1c;
        line-height: 1.3;
      }
      .cewe-free-delivery__upsell-link {
        color: #d91c1c;
        text-decoration: underline;
        font-weight: 700;
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

        const existing = root.querySelector("[data-it-name='free-delivery-progress-upsell']");
        if (existing) return existing;

        const widget = document.createElement("div");
        widget.className = "cewe-free-delivery";
        widget.setAttribute("data-it-name", "free-delivery-progress-upsell");
        widget.innerHTML = `
      <div class="cewe-free-delivery__upsell" data-role="upsell">
        <svg class="cewe-free-delivery__upsell-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2"/>
          <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
        </svg>
        <div class="cewe-free-delivery__upsell-text" data-role="upsell-text"></div>
      </div>
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

        const total = getCartTotal();
        const shipping = currentShippingType;

        const upsell = widget.querySelector("[data-role='upsell']");
        const upsellText = widget.querySelector("[data-role='upsell-text']");
        const bar = widget.querySelector("[data-role='bar']");
        const thumb = widget.querySelector("[data-role='thumb']");

        // Show only for POS
        const shouldBeVisible = shipping === "pos";
        if (widget.classList.contains("is-visible") !== shouldBeVisible) {
            widget.classList.toggle("is-visible", shouldBeVisible);
        }

        if (!shouldBeVisible) return;

        const title = widget.querySelector("[data-role='title']");

        // FIX #3: jeśli total jeszcze nieznany — czekamy na dane, nie renderujemy NaN%
        if (total == null) return;

        const remaining = Math.max(0, POS_THRESHOLD - total);
        const progressPercent = clamp((total / POS_THRESHOLD) * 100, 0, 100);
        const isComplete = total >= POS_THRESHOLD;

        console.log("update() - total:", total, "remaining:", remaining, "isComplete:", isComplete);

        let newTitleHtml = "";
        if (isComplete) {
            newTitleHtml = `Gratulacje! Masz <strong>darmowy odbiór w drogerii</strong>.`;
        } else {
            const remainingText = `${formatPln(remaining)} zł`;
            console.log("Formatted remainingText:", remainingText);
            newTitleHtml = `Brakuje Ci <strong>${remainingText}</strong> do darmowego odbioru w drogerii.`;
        }

        if (title) {
            // Normalizujemy tekst do porównania (usuwamy &nbsp; i zbędne spacje)
            const currentHtml = title.innerHTML.replace(/&nbsp;|\s/g, " ");
            const normalizedNewHtml = newTitleHtml.replace(/&nbsp;|\s/g, " ");

            const isTitleEmpty = title.textContent.trim() === "";

            if (currentHtml !== normalizedNewHtml || isTitleEmpty) {
                console.log("Updating title to:", newTitleHtml);
                title.innerHTML = newTitleHtml;
            }
        }

        if (bar) {
            const barComplete = bar.classList.contains("is-complete");
            if (barComplete !== isComplete) bar.classList.toggle("is-complete", isComplete);
            const newWidth = `${progressPercent}%`;
            if (bar.style.width !== newWidth) bar.style.width = newWidth;
        }

        if (thumb) {
            const thumbComplete = thumb.classList.contains("is-complete");
            if (thumbComplete !== isComplete) thumb.classList.toggle("is-complete", isComplete);
            const newLeft = `${progressPercent}%`;
            if (thumb.style.left !== newLeft) thumb.style.left = newLeft;
        }

        if (upsell) {
            const shouldUpsellActive = !isComplete && remaining > 0;
            if (upsell.classList.contains("is-active") !== shouldUpsellActive) {
                upsell.classList.toggle("is-active", shouldUpsellActive);
            }

            if (shouldUpsellActive && upsellText) {
                let newUpsellHtml = "";
                const remainingText = `${formatPln(remaining)}&nbsp;zł`;
                if (remaining >= UPSELL_HIGH_REMAINING_THRESHOLD) {
                    newUpsellHtml = `
              Do darmowej dostawy brakuje Ci <strong>${remainingText}</strong>.
              Dobierz
              <a href="https://www.fotouslugi.pl/fotoprezenty/kula-ze-zdjeciem.html" class="cewe-free-delivery__upsell-link">kulę ze zdjęciem</a>
              lub
              <a href="https://www.fotouslugi.pl/zdjecia/zdjecie-w-ramce.html" class="cewe-free-delivery__upsell-link">zdjęcie w ramce</a>
              i odbierz zamówienie za darmo w drogerii.
            `;
                } else {
                    if (hasPhotosInCart) {
                        newUpsellHtml = `
                Do darmowej dostawy brakuje Ci <strong>${remainingText}</strong>.
                Dobierz
                <a href="https://www.fotouslugi.pl/dodatki-do-fotoproduktow.html#dodatki-do-zdjec" class="cewe-free-delivery__upsell-link">dodatki do zdjęć</a>
                i odbierz zamówienie za darmo w drogerii.
              `;
                    } else {
                        newUpsellHtml =
                            `Do darmowej dostawy brakuje Ci <strong>${remainingText}</strong>. ` +
                            `Dobierz <a href="https://www.fotouslugi.pl/zdjecia/standard.html" class="cewe-free-delivery__upsell-link">zdjęcia</a> ` +
                            `i odbierz zamówienie za darmo w drogerii.`;
                    }
                }
                // FIX #2: normalizujemy whitespace przed porównaniem — template literal z wcięciami
                // różni się od innerHTML ustawionego przez przeglądarkę, co powoduje ciągłe nadpisywanie
                const normalizedNew = newUpsellHtml.replace(/\s+/g, " ").trim();
                const normalizedCurrent = upsellText.innerHTML.replace(/\s+/g, " ").trim();
                if (normalizedCurrent !== normalizedNew) {
                    upsellText.innerHTML = newUpsellHtml;
                }
            }
        }
    }

    const observer = new MutationObserver((mutations) => {
        const isOwnMutation = mutations.every(m => {
            const target = m.target;
            return target.closest && target.closest("[data-it-name='free-delivery-progress-upsell']");
        });
        if (!isOwnMutation) {
            scheduleUpdate();
        }
    });

    function startObserving() {
        const target = document.body;
        observer.observe(target, { childList: true, characterData: true, subtree: true });
    }

    initDataLayer();
    startTotalSumObserver();
    startObserving();
    startBootstrapRetry();
    scheduleUpdate();

    // Fallback
    setInterval(scheduleUpdate, 2000);

})();