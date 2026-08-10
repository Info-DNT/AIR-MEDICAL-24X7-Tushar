// Air Medical 24X7 - Supabase Configuration
const supabaseUrl = "https://dtiirdimtbmkvryvqten.supabase.co/";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aWlyZGltdGJta3ZyeXZxdGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDQ0MzksImV4cCI6MjA5MTcyMDQzOX0.MwOkE8tsM2itUhTxNJDDHPPPAxImjRS9Ch1ACWzdTmI";

const blogsSupabaseUrl = "https://dtiirdimtbmkvryvqten.supabase.co/";
const blogsSupabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aWlyZGltdGJta3ZyeXZxdGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDQ0MzksImV4cCI6MjA5MTcyMDQzOX0.MwOkE8tsM2itUhTxNJDDHPPPAxImjRS9Ch1ACWzdTmI";

// The SDK is only needed by pages that read the database (blogs, reviews, admin panel).
// The quote forms POST straight to the submit-main-page Edge Function with fetch(), so
// this file must keep working when the SDK is absent — otherwise a missing SDK would
// throw here and the form submit handlers below would never be registered.
function createSupabaseClients() {
  if (typeof supabase === "undefined") return false;
  window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  window.blogsSupabaseClient = supabase.createClient(blogsSupabaseUrl, blogsSupabaseKey);
  return true;
}
createSupabaseClients();

// Loads the SDK on demand and resolves with a ready client. Used by below-the-fold
// content so 54 KB of SDK stays off the critical path on pages that may never need it.
window.loadSupabase = function () {
  if (window.supabaseClient) return Promise.resolve(window.supabaseClient);
  if (window.__supabaseLoading) return window.__supabaseLoading;
  window.__supabaseLoading = new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = function () {
      createSupabaseClients();
      window.supabaseClient ? resolve(window.supabaseClient)
                            : reject(new Error("Supabase SDK loaded but no client"));
    };
    s.onerror = function () { reject(new Error("Supabase SDK failed to load")); };
    document.head.appendChild(s);
  });
  return window.__supabaseLoading;
};

// Automatically inject and handle Cloudflare Turnstile Captcha
const turnstileSiteKey = "0x4AAAAAADTA3gG7SVL4awln";

// Map to store widget IDs for each form
const turnstileWidgets = new Map();

// Global callback for Turnstile explicit rendering
window.onloadTurnstileCallback = function () {
  const forms = [
    document.getElementById("quoteForm"),
    document.getElementById("quoteFormPopup"),
    document.getElementById("quoteFormHeader"),
    document.getElementById("careerForm")
  ].filter(Boolean);

  // Dynamic sitekey selection for local environment bypass
  const activeSiteKey = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
    ? "1x00000000000000000000AA" 
    : turnstileSiteKey;

  forms.forEach(form => {
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    // Create a container placeholder
    const container = document.createElement("div");
    container.className = "cf-turnstile-container my-3";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.marginBottom = "15px";

    // Insert directly before the submit button
    submitBtn.parentNode.insertBefore(container, submitBtn);

    try {
      // Explicitly render Turnstile widget using activeSiteKey
      const widgetId = turnstile.render(container, {
        sitekey: activeSiteKey,
        theme: "light",
        callback: function (_token) {
          console.log(`[Turnstile] Challenge solved for ${form.id}`);
        },
        "error-callback": function (code) {
          console.error(`[Turnstile] Error in form ${form.id}:`, code);
        },
        "expired-callback": function () {
          console.warn(`[Turnstile] Token expired for ${form.id}, resetting...`);
          turnstile.reset(widgetId);
        }
      });

      // Keep track of the widget ID for this form
      turnstileWidgets.set(form, widgetId);
    } catch (err) {
      console.error("[Turnstile] Render failed:", err);
    }
  });
};

// HIGH-11 / BUG-02: Inline form notification — replaces alert() calls
function showFormMessage(form, message, type) {
  const existing = form.querySelector(".form-submit-msg");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.className = `alert alert-${type} mt-3 form-submit-msg`;
  div.style.cssText = "border-radius:8px;font-size:14px;padding:12px 16px;";
  div.textContent = message;
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.parentNode.insertBefore(div, btn);
  else form.appendChild(div);
  if (type === "success") setTimeout(() => div.remove(), 8000);
}

// Thank-you popup shown after successful quotation form submission
function showQuoteSuccessModal() {
  // Remove any existing instance
  const existing = document.getElementById("quoteSuccessModal");
  if (existing) existing.remove();

  const isRoot = !window.location.pathname.includes("/services/") &&
                 !window.location.pathname.includes("/countries/");
  const logoPath = isRoot ? "img/air-medical-logo.webp" : "../img/air-medical-logo.webp";

  const overlay = document.createElement("div");
  overlay.id = "quoteSuccessModal";
  overlay.style.cssText = [
    "position:fixed","inset:0","z-index:99999",
    "display:flex","align-items:center","justify-content:center",
    "background:rgba(0,0,0,0.55)","padding:16px"
  ].join(";");

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;max-width:360px;width:100%;
                padding:40px 32px 36px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);
                animation:quoteModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;">
      <img src="${logoPath}" alt="Air Medical 24X7" style="height:52px;object-fit:contain;margin-bottom:24px;">
      <h3 style="color:#1a2e5a;font-size:1.45rem;font-weight:700;margin-bottom:16px;line-height:1.3;">
        Quotation Request<br>Received
      </h3>
      <p style="color:#555;font-size:0.92rem;line-height:1.6;margin-bottom:10px;">
        Thank you for contacting Air Medical 24X7. We have received your quotation request
        and our team is currently reviewing the details.
      </p>
      <p style="color:#1a2e5a;font-size:0.92rem;font-weight:700;font-style:italic;margin-bottom:28px;">
        Our expert will get back to you shortly with your customized quote.
      </p>
      <a href="${isRoot ? 'index.html' : '../index.html'}"
         style="display:inline-block;background:#1a2e5a;color:#fff;font-weight:700;
                font-size:0.82rem;letter-spacing:0.08em;padding:13px 32px;border-radius:50px;
                text-decoration:none;transition:background 0.2s;">
        BACK TO HOMEPAGE
      </a>
    </div>
    <style>
      @keyframes quoteModalIn {
        from { opacity:0; transform:scale(0.8); }
        to   { opacity:1; transform:scale(1); }
      }
    </style>
  `;

  // Close on backdrop click
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

document.addEventListener("DOMContentLoaded", () => {
  const forms = [
    document.getElementById("quoteForm"),
    document.getElementById("quoteFormPopup"),
    document.getElementById("quoteFormHeader"),
    document.getElementById("careerForm")
  ].filter(Boolean);

  if (forms.length === 0) return;

  // Load the Turnstile API script dynamically specifying explicit rendering callback
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  // Intercept form submissions
  forms.forEach(form => {
    form.addEventListener("submit", async function (e) {
      // Route quotation forms to secure Edge Function instead of direct DB insertion
      if (form.id === "quoteForm" || form.id === "quoteFormPopup") {
        e.preventDefault();
        e.stopImmediatePropagation();

        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.setAttribute("data-orig-text", btn.textContent);
          btn.textContent = "Submitting...";
        }

        // Fetch Turnstile response, with fallback if Turnstile fails to load
        let response = "";
        let widgetId = null;
        if (typeof turnstile !== "undefined") {
          widgetId = turnstileWidgets.get(form);
          response = widgetId ? turnstile.getResponse(widgetId) : turnstile.getResponse();
        }

        // If no token, check if we are on localhost (bypass it) or prod (show inline message)
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (!response && !isLocal) {
          showFormMessage(form, "Please complete the security verification above.", "warning");
          if (btn) {
            btn.disabled = false;
            btn.textContent = btn.getAttribute("data-orig-text") || "REQUEST CALLBACK";
          }
          return;
        }

        try {
          const isPopup = form.id === "quoteFormPopup";
          const isHeader = form.id === "quoteFormHeader";
          const nameId = isPopup ? "popupName" : (isHeader ? "headerName" : "name");
          const emailId = isPopup ? "popupEmail" : (isHeader ? "headerEmail" : "email");
          const codeId = isPopup ? "popupCountryCode" : (isHeader ? "headerCountryCode" : "countryCode");
          const phoneId = isPopup ? "popupPhone" : (isHeader ? "headerPhone" : "phone");
          const serviceId = isPopup ? "popupService" : (isHeader ? "headerService" : "service");

          const rawCode = document.getElementById(codeId)?.value?.trim() || "";
          const phoneVal = document.getElementById(phoneId)?.value?.trim() || "";
          // BUG-09 FIX: Normalize country code to always include + prefix
          const codeVal = rawCode && !rawCode.startsWith("+") ? "+" + rawCode : rawCode;
          // BUG-02: Warn user if phone is empty (soft validation — field is optional per design)
          const fullPhone = phoneVal ? (codeVal + phoneVal) : "";

          // Combine transport radio option and service dropdown value
          const transportInput = form.querySelector('input[name="transport"]:checked');
          let serviceVal = document.getElementById(serviceId)?.value || "";
          
          if (transportInput) {
            if (serviceVal) {
              serviceVal = `${transportInput.value} (${serviceVal})`;
            } else {
              serviceVal = transportInput.value;
            }
          }

          const payload = {
            name: document.getElementById(nameId)?.value || "",
            email: document.getElementById(emailId)?.value || "",
            full_phone: fullPhone,
            service: serviceVal,
            token: response
          };

          // Capture new patient location and destination fields
          const patientLocEl = form.querySelector('[name="patientLocation"]') || document.getElementById(isHeader ? "headerPatientLocation" : "patientLocation");
          const destEl = form.querySelector('[name="destination"]') || document.getElementById(isHeader ? "headerDestination" : "destination");

          if (patientLocEl) {
            payload.patient_location = patientLocEl.value;
          }
          if (destEl) {
            payload.destination = destEl.value;
          }

          // Also keep transport inside payload if backend requires it
          if (transportInput) {
            payload.transport = transportInput.value;
          }

          const res = await fetch(
            'https://dtiirdimtbmkvryvqten.supabase.co/functions/v1/submit-main-page',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey
              },
              body: JSON.stringify(payload)
            }
          );

          const result = await res.json();

          if (result.success) {
            form.reset();
            if (btn) {
              btn.disabled = false;
              btn.textContent = btn.getAttribute("data-orig-text") || "REQUEST CALLBACK";
            }
            if (isPopup && typeof window.closeQuoteModal === "function") {
              window.closeQuoteModal();
            }
            showQuoteSuccessModal();
          } else {
            showFormMessage(form, "Submission failed. Please try again or contact us directly.", "danger");
            if (btn) {
              btn.disabled = false;
              btn.textContent = btn.getAttribute("data-orig-text") || "REQUEST CALLBACK";
            }
          }
        } catch (err) {
          console.error("Submission error:", err);
          showFormMessage(form, "Something went wrong. Please try again or WhatsApp us directly.", "danger");
          if (btn) {
            btn.disabled = false;
            btn.textContent = btn.getAttribute("data-orig-text") || "REQUEST CALLBACK";
          }
        } finally {
          // BUG-03 FIX: Always reset Turnstile — fall back to global reset if widgetId is null
          try {
            if (typeof turnstile !== "undefined") {
              if (widgetId != null) {
                turnstile.reset(widgetId);
              } else {
                turnstile.reset();
              }
            }
          } catch (e) { /* Turnstile may not have loaded — safe to ignore */ }
        }
      }
    }, true);
  });
});

// Sanitizer function to ensure "24X7" casing everywhere client-side
window.sanitize24X7 = function (text) {
  if (!text || typeof text !== "string") return text;
  try {
    const regex = new RegExp("(?<!airmedical)(?<!airmedical-)(?<!airmedical_)(24/7|24[xX]7)", "gi");
    return text.replace(regex, "24X7");
  } catch (e) {
    // Fallback if lookbehind is not supported: placeholder airmedical domains, replace, then restore
    let temp = text;
    const placeholders = [];
    temp = temp.replace(/airmedical[-_]?24[xX]7/gi, (match) => {
      placeholders.push(match);
      return `__AIRMED_PLACEHOLDER_${placeholders.length - 1}__`;
    });
    temp = temp.replace(/(24\/7|24[xX]7)/gi, "24X7");
    temp = temp.replace(/__AIRMED_PLACEHOLDER_(\d+)__/g, (match, idx) => {
      return placeholders[parseInt(idx)];
    });
    return temp;
  }
};

// Rebind blogsSupabaseClient with a service key entered at runtime via the admin settings panel.
// The service role key must NEVER be hardcoded here — paste it in the admin Settings tab after login.
window.rebindBlogsSupabaseClient = function (serviceKey) {
  if (serviceKey) {
    window.blogsSupabaseClient = supabase.createClient(blogsSupabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } else {
    window.blogsSupabaseClient = supabase.createClient(blogsSupabaseUrl, blogsSupabaseKey);
  }
};

