/**
 * phone-field.js — Air Medical 24X7
 * - Replaces countryCode text inputs with flag+code <select> dropdowns
 * - Auto-selects country from IP (ipapi.co -> ipwho.is fallback)
 * - Enforces numeric-only on phone inputs
 * - Shows dynamic hint: "Please enter a valid X-digit number after +XX."
 */
(function () {
  "use strict";

  /* ── Country data ─────────────────────────────────────────────────── */
  /* digits = typical subscriber number length (0 = variable / unknown) */
  var COUNTRIES = [
    { iso:"AF", name:"Afghanistan",           code:"+93",   flag:"🇦🇫", digits:9  },
    { iso:"AL", name:"Albania",               code:"+355",  flag:"🇦🇱", digits:9  },
    { iso:"DZ", name:"Algeria",               code:"+213",  flag:"🇩🇿", digits:9  },
    { iso:"AD", name:"Andorra",               code:"+376",  flag:"🇦🇩", digits:6  },
    { iso:"AO", name:"Angola",                code:"+244",  flag:"🇦🇴", digits:9  },
    { iso:"AG", name:"Antigua & Barbuda",     code:"+1268", flag:"🇦🇬", digits:7  },
    { iso:"AR", name:"Argentina",             code:"+54",   flag:"🇦🇷", digits:10 },
    { iso:"AM", name:"Armenia",               code:"+374",  flag:"🇦🇲", digits:8  },
    { iso:"AU", name:"Australia",             code:"+61",   flag:"🇦🇺", digits:9  },
    { iso:"AT", name:"Austria",               code:"+43",   flag:"🇦🇹", digits:10 },
    { iso:"AZ", name:"Azerbaijan",            code:"+994",  flag:"🇦🇿", digits:9  },
    { iso:"BS", name:"Bahamas",               code:"+1242", flag:"🇧🇸", digits:7  },
    { iso:"BH", name:"Bahrain",               code:"+973",  flag:"🇧🇭", digits:8  },
    { iso:"BD", name:"Bangladesh",            code:"+880",  flag:"🇧🇩", digits:10 },
    { iso:"BB", name:"Barbados",              code:"+1246", flag:"🇧🇧", digits:7  },
    { iso:"BY", name:"Belarus",               code:"+375",  flag:"🇧🇾", digits:9  },
    { iso:"BE", name:"Belgium",               code:"+32",   flag:"🇧🇪", digits:9  },
    { iso:"BZ", name:"Belize",                code:"+501",  flag:"🇧🇿", digits:7  },
    { iso:"BJ", name:"Benin",                 code:"+229",  flag:"🇧🇯", digits:8  },
    { iso:"BT", name:"Bhutan",                code:"+975",  flag:"🇧🇹", digits:8  },
    { iso:"BO", name:"Bolivia",               code:"+591",  flag:"🇧🇴", digits:8  },
    { iso:"BA", name:"Bosnia & Herzegovina",  code:"+387",  flag:"🇧🇦", digits:8  },
    { iso:"BW", name:"Botswana",              code:"+267",  flag:"🇧🇼", digits:8  },
    { iso:"BR", name:"Brazil",                code:"+55",   flag:"🇧🇷", digits:11 },
    { iso:"BN", name:"Brunei",                code:"+673",  flag:"🇧🇳", digits:7  },
    { iso:"BG", name:"Bulgaria",              code:"+359",  flag:"🇧🇬", digits:9  },
    { iso:"BF", name:"Burkina Faso",          code:"+226",  flag:"🇧🇫", digits:8  },
    { iso:"BI", name:"Burundi",               code:"+257",  flag:"🇧🇮", digits:8  },
    { iso:"KH", name:"Cambodia",              code:"+855",  flag:"🇰🇭", digits:9  },
    { iso:"CM", name:"Cameroon",              code:"+237",  flag:"🇨🇲", digits:9  },
    { iso:"CA", name:"Canada",                code:"+1",    flag:"🇨🇦", digits:10 },
    { iso:"CV", name:"Cape Verde",            code:"+238",  flag:"🇨🇻", digits:7  },
    { iso:"CF", name:"Central African Rep.",  code:"+236",  flag:"🇨🇫", digits:8  },
    { iso:"TD", name:"Chad",                  code:"+235",  flag:"🇹🇩", digits:8  },
    { iso:"CL", name:"Chile",                 code:"+56",   flag:"🇨🇱", digits:9  },
    { iso:"CN", name:"China",                 code:"+86",   flag:"🇨🇳", digits:11 },
    { iso:"CO", name:"Colombia",              code:"+57",   flag:"🇨🇴", digits:10 },
    { iso:"KM", name:"Comoros",               code:"+269",  flag:"🇰🇲", digits:7  },
    { iso:"CG", name:"Congo",                 code:"+242",  flag:"🇨🇬", digits:9  },
    { iso:"CD", name:"Congo (DRC)",           code:"+243",  flag:"🇨🇩", digits:9  },
    { iso:"CR", name:"Costa Rica",            code:"+506",  flag:"🇨🇷", digits:8  },
    { iso:"HR", name:"Croatia",               code:"+385",  flag:"🇭🇷", digits:9  },
    { iso:"CU", name:"Cuba",                  code:"+53",   flag:"🇨🇺", digits:8  },
    { iso:"CY", name:"Cyprus",                code:"+357",  flag:"🇨🇾", digits:8  },
    { iso:"CZ", name:"Czech Republic",        code:"+420",  flag:"🇨🇿", digits:9  },
    { iso:"DK", name:"Denmark",               code:"+45",   flag:"🇩🇰", digits:8  },
    { iso:"DJ", name:"Djibouti",              code:"+253",  flag:"🇩🇯", digits:8  },
    { iso:"DM", name:"Dominica",              code:"+1767", flag:"🇩🇲", digits:7  },
    { iso:"DO", name:"Dominican Republic",    code:"+1809", flag:"🇩🇴", digits:7  },
    { iso:"EC", name:"Ecuador",               code:"+593",  flag:"🇪🇨", digits:9  },
    { iso:"EG", name:"Egypt",                 code:"+20",   flag:"🇪🇬", digits:10 },
    { iso:"SV", name:"El Salvador",           code:"+503",  flag:"🇸🇻", digits:8  },
    { iso:"GQ", name:"Equatorial Guinea",     code:"+240",  flag:"🇬🇶", digits:9  },
    { iso:"ER", name:"Eritrea",               code:"+291",  flag:"🇪🇷", digits:7  },
    { iso:"EE", name:"Estonia",               code:"+372",  flag:"🇪🇪", digits:8  },
    { iso:"ET", name:"Ethiopia",              code:"+251",  flag:"🇪🇹", digits:9  },
    { iso:"FJ", name:"Fiji",                  code:"+679",  flag:"🇫🇯", digits:7  },
    { iso:"FI", name:"Finland",               code:"+358",  flag:"🇫🇮", digits:9  },
    { iso:"FR", name:"France",                code:"+33",   flag:"🇫🇷", digits:9  },
    { iso:"GA", name:"Gabon",                 code:"+241",  flag:"🇬🇦", digits:8  },
    { iso:"GM", name:"Gambia",                code:"+220",  flag:"🇬🇲", digits:7  },
    { iso:"GE", name:"Georgia",               code:"+995",  flag:"🇬🇪", digits:9  },
    { iso:"DE", name:"Germany",               code:"+49",   flag:"🇩🇪", digits:11 },
    { iso:"GH", name:"Ghana",                 code:"+233",  flag:"🇬🇭", digits:9  },
    { iso:"GR", name:"Greece",                code:"+30",   flag:"🇬🇷", digits:10 },
    { iso:"GD", name:"Grenada",               code:"+1473", flag:"🇬🇩", digits:7  },
    { iso:"GT", name:"Guatemala",             code:"+502",  flag:"🇬🇹", digits:8  },
    { iso:"GN", name:"Guinea",                code:"+224",  flag:"🇬🇳", digits:9  },
    { iso:"GW", name:"Guinea-Bissau",         code:"+245",  flag:"🇬🇼", digits:7  },
    { iso:"GY", name:"Guyana",                code:"+592",  flag:"🇬🇾", digits:7  },
    { iso:"HT", name:"Haiti",                 code:"+509",  flag:"🇭🇹", digits:8  },
    { iso:"HN", name:"Honduras",              code:"+504",  flag:"🇭🇳", digits:8  },
    { iso:"HK", name:"Hong Kong",             code:"+852",  flag:"🇭🇰", digits:8  },
    { iso:"HU", name:"Hungary",               code:"+36",   flag:"🇭🇺", digits:9  },
    { iso:"IS", name:"Iceland",               code:"+354",  flag:"🇮🇸", digits:7  },
    { iso:"IN", name:"India",                 code:"+91",   flag:"🇮🇳", digits:10 },
    { iso:"ID", name:"Indonesia",             code:"+62",   flag:"🇮🇩", digits:10 },
    { iso:"IR", name:"Iran",                  code:"+98",   flag:"🇮🇷", digits:10 },
    { iso:"IQ", name:"Iraq",                  code:"+964",  flag:"🇮🇶", digits:10 },
    { iso:"IE", name:"Ireland",               code:"+353",  flag:"🇮🇪", digits:9  },
    { iso:"IL", name:"Israel",                code:"+972",  flag:"🇮🇱", digits:9  },
    { iso:"IT", name:"Italy",                 code:"+39",   flag:"🇮🇹", digits:10 },
    { iso:"JM", name:"Jamaica",               code:"+1876", flag:"🇯🇲", digits:7  },
    { iso:"JP", name:"Japan",                 code:"+81",   flag:"🇯🇵", digits:10 },
    { iso:"JO", name:"Jordan",                code:"+962",  flag:"🇯🇴", digits:9  },
    { iso:"KZ", name:"Kazakhstan",            code:"+7",    flag:"🇰🇿", digits:10 },
    { iso:"KE", name:"Kenya",                 code:"+254",  flag:"🇰🇪", digits:9  },
    { iso:"KI", name:"Kiribati",              code:"+686",  flag:"🇰🇮", digits:8  },
    { iso:"KP", name:"North Korea",           code:"+850",  flag:"🇰🇵", digits:0  },
    { iso:"KR", name:"South Korea",           code:"+82",   flag:"🇰🇷", digits:10 },
    { iso:"KW", name:"Kuwait",                code:"+965",  flag:"🇰🇼", digits:8  },
    { iso:"KG", name:"Kyrgyzstan",            code:"+996",  flag:"🇰🇬", digits:9  },
    { iso:"LA", name:"Laos",                  code:"+856",  flag:"🇱🇦", digits:10 },
    { iso:"LV", name:"Latvia",                code:"+371",  flag:"🇱🇻", digits:8  },
    { iso:"LB", name:"Lebanon",               code:"+961",  flag:"🇱🇧", digits:8  },
    { iso:"LS", name:"Lesotho",               code:"+266",  flag:"🇱🇸", digits:8  },
    { iso:"LR", name:"Liberia",               code:"+231",  flag:"🇱🇷", digits:8  },
    { iso:"LY", name:"Libya",                 code:"+218",  flag:"🇱🇾", digits:9  },
    { iso:"LI", name:"Liechtenstein",         code:"+423",  flag:"🇱🇮", digits:7  },
    { iso:"LT", name:"Lithuania",             code:"+370",  flag:"🇱🇹", digits:8  },
    { iso:"LU", name:"Luxembourg",            code:"+352",  flag:"🇱🇺", digits:9  },
    { iso:"MO", name:"Macao",                 code:"+853",  flag:"🇲🇴", digits:8  },
    { iso:"MK", name:"North Macedonia",       code:"+389",  flag:"🇲🇰", digits:8  },
    { iso:"MG", name:"Madagascar",            code:"+261",  flag:"🇲🇬", digits:9  },
    { iso:"MW", name:"Malawi",                code:"+265",  flag:"🇲🇼", digits:9  },
    { iso:"MY", name:"Malaysia",              code:"+60",   flag:"🇲🇾", digits:9  },
    { iso:"MV", name:"Maldives",              code:"+960",  flag:"🇲🇻", digits:7  },
    { iso:"ML", name:"Mali",                  code:"+223",  flag:"🇲🇱", digits:8  },
    { iso:"MT", name:"Malta",                 code:"+356",  flag:"🇲🇹", digits:8  },
    { iso:"MH", name:"Marshall Islands",      code:"+692",  flag:"🇲🇭", digits:7  },
    { iso:"MR", name:"Mauritania",            code:"+222",  flag:"🇲🇷", digits:8  },
    { iso:"MU", name:"Mauritius",             code:"+230",  flag:"🇲🇺", digits:8  },
    { iso:"MX", name:"Mexico",                code:"+52",   flag:"🇲🇽", digits:10 },
    { iso:"FM", name:"Micronesia",            code:"+691",  flag:"🇫🇲", digits:7  },
    { iso:"MD", name:"Moldova",               code:"+373",  flag:"🇲🇩", digits:8  },
    { iso:"MC", name:"Monaco",                code:"+377",  flag:"🇲🇨", digits:8  },
    { iso:"MN", name:"Mongolia",              code:"+976",  flag:"🇲🇳", digits:8  },
    { iso:"ME", name:"Montenegro",            code:"+382",  flag:"🇲🇪", digits:8  },
    { iso:"MA", name:"Morocco",               code:"+212",  flag:"🇲🇦", digits:9  },
    { iso:"MZ", name:"Mozambique",            code:"+258",  flag:"🇲🇿", digits:9  },
    { iso:"MM", name:"Myanmar",               code:"+95",   flag:"🇲🇲", digits:9  },
    { iso:"NA", name:"Namibia",               code:"+264",  flag:"🇳🇦", digits:9  },
    { iso:"NR", name:"Nauru",                 code:"+674",  flag:"🇳🇷", digits:7  },
    { iso:"NP", name:"Nepal",                 code:"+977",  flag:"🇳🇵", digits:10 },
    { iso:"NL", name:"Netherlands",           code:"+31",   flag:"🇳🇱", digits:9  },
    { iso:"NZ", name:"New Zealand",           code:"+64",   flag:"🇳🇿", digits:9  },
    { iso:"NI", name:"Nicaragua",             code:"+505",  flag:"🇳🇮", digits:8  },
    { iso:"NE", name:"Niger",                 code:"+227",  flag:"🇳🇪", digits:8  },
    { iso:"NG", name:"Nigeria",               code:"+234",  flag:"🇳🇬", digits:10 },
    { iso:"NO", name:"Norway",                code:"+47",   flag:"🇳🇴", digits:8  },
    { iso:"OM", name:"Oman",                  code:"+968",  flag:"🇴🇲", digits:8  },
    { iso:"PK", name:"Pakistan",              code:"+92",   flag:"🇵🇰", digits:10 },
    { iso:"PW", name:"Palau",                 code:"+680",  flag:"🇵🇼", digits:7  },
    { iso:"PA", name:"Panama",                code:"+507",  flag:"🇵🇦", digits:8  },
    { iso:"PG", name:"Papua New Guinea",      code:"+675",  flag:"🇵🇬", digits:8  },
    { iso:"PY", name:"Paraguay",              code:"+595",  flag:"🇵🇾", digits:9  },
    { iso:"PE", name:"Peru",                  code:"+51",   flag:"🇵🇪", digits:9  },
    { iso:"PH", name:"Philippines",           code:"+63",   flag:"🇵🇭", digits:10 },
    { iso:"PL", name:"Poland",                code:"+48",   flag:"🇵🇱", digits:9  },
    { iso:"PT", name:"Portugal",              code:"+351",  flag:"🇵🇹", digits:9  },
    { iso:"QA", name:"Qatar",                 code:"+974",  flag:"🇶🇦", digits:8  },
    { iso:"RO", name:"Romania",               code:"+40",   flag:"🇷🇴", digits:9  },
    { iso:"RU", name:"Russia",                code:"+7",    flag:"🇷🇺", digits:10 },
    { iso:"RW", name:"Rwanda",                code:"+250",  flag:"🇷🇼", digits:9  },
    { iso:"KN", name:"Saint Kitts & Nevis",   code:"+1869", flag:"🇰🇳", digits:7  },
    { iso:"LC", name:"Saint Lucia",           code:"+1758", flag:"🇱🇨", digits:7  },
    { iso:"VC", name:"Saint Vincent",         code:"+1784", flag:"🇻🇨", digits:7  },
    { iso:"WS", name:"Samoa",                 code:"+685",  flag:"🇼🇸", digits:7  },
    { iso:"SM", name:"San Marino",            code:"+378",  flag:"🇸🇲", digits:10 },
    { iso:"ST", name:"Sao Tome & Principe",   code:"+239",  flag:"🇸🇹", digits:7  },
    { iso:"SA", name:"Saudi Arabia",          code:"+966",  flag:"🇸🇦", digits:9  },
    { iso:"SN", name:"Senegal",               code:"+221",  flag:"🇸🇳", digits:9  },
    { iso:"RS", name:"Serbia",                code:"+381",  flag:"🇷🇸", digits:9  },
    { iso:"SC", name:"Seychelles",            code:"+248",  flag:"🇸🇨", digits:7  },
    { iso:"SL", name:"Sierra Leone",          code:"+232",  flag:"🇸🇱", digits:8  },
    { iso:"SG", name:"Singapore",             code:"+65",   flag:"🇸🇬", digits:8  },
    { iso:"SK", name:"Slovakia",              code:"+421",  flag:"🇸🇰", digits:9  },
    { iso:"SI", name:"Slovenia",              code:"+386",  flag:"🇸🇮", digits:8  },
    { iso:"SB", name:"Solomon Islands",       code:"+677",  flag:"🇸🇧", digits:7  },
    { iso:"SO", name:"Somalia",               code:"+252",  flag:"🇸🇴", digits:8  },
    { iso:"ZA", name:"South Africa",          code:"+27",   flag:"🇿🇦", digits:9  },
    { iso:"SS", name:"South Sudan",           code:"+211",  flag:"🇸🇸", digits:9  },
    { iso:"ES", name:"Spain",                 code:"+34",   flag:"🇪🇸", digits:9  },
    { iso:"LK", name:"Sri Lanka",             code:"+94",   flag:"🇱🇰", digits:9  },
    { iso:"SD", name:"Sudan",                 code:"+249",  flag:"🇸🇩", digits:9  },
    { iso:"SR", name:"Suriname",              code:"+597",  flag:"🇸🇷", digits:7  },
    { iso:"SE", name:"Sweden",                code:"+46",   flag:"🇸🇪", digits:9  },
    { iso:"CH", name:"Switzerland",           code:"+41",   flag:"🇨🇭", digits:9  },
    { iso:"SY", name:"Syria",                 code:"+963",  flag:"🇸🇾", digits:9  },
    { iso:"TW", name:"Taiwan",                code:"+886",  flag:"🇹🇼", digits:9  },
    { iso:"TJ", name:"Tajikistan",            code:"+992",  flag:"🇹🇯", digits:9  },
    { iso:"TZ", name:"Tanzania",              code:"+255",  flag:"🇹🇿", digits:9  },
    { iso:"TH", name:"Thailand",              code:"+66",   flag:"🇹🇭", digits:9  },
    { iso:"TL", name:"Timor-Leste",           code:"+670",  flag:"🇹🇱", digits:8  },
    { iso:"TG", name:"Togo",                  code:"+228",  flag:"🇹🇬", digits:8  },
    { iso:"TO", name:"Tonga",                 code:"+676",  flag:"🇹🇴", digits:7  },
    { iso:"TT", name:"Trinidad & Tobago",     code:"+1868", flag:"🇹🇹", digits:7  },
    { iso:"TN", name:"Tunisia",               code:"+216",  flag:"🇹🇳", digits:8  },
    { iso:"TR", name:"Turkey",                code:"+90",   flag:"🇹🇷", digits:10 },
    { iso:"TM", name:"Turkmenistan",          code:"+993",  flag:"🇹🇲", digits:8  },
    { iso:"TV", name:"Tuvalu",                code:"+688",  flag:"🇹🇻", digits:6  },
    { iso:"UG", name:"Uganda",                code:"+256",  flag:"🇺🇬", digits:9  },
    { iso:"UA", name:"Ukraine",               code:"+380",  flag:"🇺🇦", digits:9  },
    { iso:"AE", name:"United Arab Emirates",  code:"+971",  flag:"🇦🇪", digits:9  },
    { iso:"GB", name:"United Kingdom",        code:"+44",   flag:"🇬🇧", digits:10 },
    { iso:"US", name:"United States",         code:"+1",    flag:"🇺🇸", digits:10 },
    { iso:"UY", name:"Uruguay",               code:"+598",  flag:"🇺🇾", digits:9  },
    { iso:"UZ", name:"Uzbekistan",            code:"+998",  flag:"🇺🇿", digits:9  },
    { iso:"VU", name:"Vanuatu",               code:"+678",  flag:"🇻🇺", digits:7  },
    { iso:"VE", name:"Venezuela",             code:"+58",   flag:"🇻🇪", digits:10 },
    { iso:"VN", name:"Vietnam",               code:"+84",   flag:"🇻🇳", digits:9  },
    { iso:"YE", name:"Yemen",                 code:"+967",  flag:"🇾🇪", digits:9  },
    { iso:"ZM", name:"Zambia",                code:"+260",  flag:"🇿🇲", digits:9  },
    { iso:"ZW", name:"Zimbabwe",              code:"+263",  flag:"🇿🇼", digits:9  }
  ];

  /* ── Build custom dropdown ──────────────────────────────────────────
   *  Trigger: shows only the dial code, e.g. "+91"
   *  Panel:   shows "Country Name (+code)" for every option
   * ─────────────────────────────────────────────────────────────────── */
  function buildDropdown(original) {
    var origId     = original.id;
    var origName   = original.name || "";
    var isHeader   = (origId === "headerCountryCode");

    /* ── Hidden native <select> (keeps form POST working) ── */
    var hiddenSel = document.createElement("select");
    hiddenSel.id    = origId;
    hiddenSel.name  = origName;
    hiddenSel.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:0;height:0;";
    hiddenSel.setAttribute("aria-hidden", "true");
    hiddenSel.tabIndex = -1; /* aria-hidden but still Tab-focusable is an a11y failure */
    COUNTRIES.forEach(function(c) {
      var opt = document.createElement("option");
      opt.value          = c.code;
      opt.dataset.iso    = c.iso;
      opt.dataset.digits = c.digits;
      opt.textContent    = c.name + " (" + c.code + ")";
      hiddenSel.appendChild(opt);
    });

    /* ── Wrapper ── */
    var wrapper = document.createElement("div");
    wrapper.className = "pf-cc-wrapper";
    wrapper.style.cssText = "position:relative;display:inline-flex;align-items:stretch;flex:0 0 auto;align-self:stretch;";

    /* ── Trigger button — shows only the code ── */
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "pf-cc-trigger form-control border-0 fw-bold";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    /* No aria-label: it replaced the visible "+91", so screen readers and voice
       control could not match the button to what is on screen. The name now comes
       from the code itself plus visually hidden text (see innerHTML below). */
    trigger.style.cssText =
      "height:100%;cursor:pointer;text-align:center;" +
      "padding:0 12px;font-size:0.88rem;white-space:nowrap;" +
      "width:auto;min-width:68px;" +
      "background:" + (isHeader ? "transparent" : "#EFF2F6") + ";" +
      "color:" + (isHeader ? "#1d2a4d" : "#1D2A4D") + ";font-weight:600;" +
      "border-radius:6px 0 0 6px;border:none;border-right:1px solid rgba(0,0,0,0.08);outline:none;" +
      "display:flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;";
    trigger.innerHTML = '<span class="pf-cc-code">+91</span>' +
      '<span class="visually-hidden"> country calling code</span>' +
      '<span aria-hidden="true" style="font-size:0.65rem;opacity:0.6;">▼</span>';

    /* ── Floating panel ── */
    var panel = document.createElement("div");
    panel.className = "pf-cc-panel";
    panel.setAttribute("role", "listbox");
    panel.style.cssText =
      "display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:9999;" +
      "background:#fff;border:1px solid #dee2e6;border-radius:8px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,0.12);" +
      "width:260px;max-height:280px;overflow-y:auto;";

    /* Search box inside panel */
    var searchWrap = document.createElement("div");
    searchWrap.style.cssText = "padding:8px 10px;border-bottom:1px solid #f0f0f0;position:sticky;top:0;background:#fff;z-index:1;";
    var searchBox = document.createElement("input");
    searchBox.type = "text";
    searchBox.placeholder = "Search country…";
    searchBox.style.cssText = "width:100%;border:1px solid #dee2e6;border-radius:6px;padding:5px 8px;font-size:0.82rem;outline:none;";
    searchWrap.appendChild(searchBox);
    panel.appendChild(searchWrap);

    /* List container */
    var list = document.createElement("div");
    list.setAttribute("role", "listbox");

    var _activeIso = "IN";
    var _activeDigits = 10;

    function renderList(filter) {
      list.innerHTML = "";
      var q = (filter || "").toLowerCase();
      COUNTRIES.forEach(function(c) {
        if (q && c.name.toLowerCase().indexOf(q) === -1 && c.code.indexOf(q) === -1) return;
        var item = document.createElement("div");
        item.setAttribute("role", "option");
        item.dataset.iso    = c.iso;
        item.dataset.code   = c.code;
        item.dataset.digits = c.digits;
        item.style.cssText =
          "padding:9px 14px;cursor:pointer;font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;" +
          (c.iso === _activeIso ? "background:#eef3ff;font-weight:600;" : "");
        var nameSpan = document.createElement("span");
        nameSpan.textContent = c.name;
        var codeSpan = document.createElement("span");
        codeSpan.textContent = c.code;
        codeSpan.style.cssText = "color:#666;font-size:0.8rem;";
        item.appendChild(nameSpan);
        item.appendChild(codeSpan);
        item.addEventListener("mouseenter", function() { this.style.background = c.iso === _activeIso ? "#eef3ff" : "#f8f9fa"; });
        item.addEventListener("mouseleave", function() { this.style.background = c.iso === _activeIso ? "#eef3ff" : ""; });
        item.addEventListener("click", function() {
          selectCountry(c);
          closePanel();
        });
        list.appendChild(item);
      });
    }

    panel.appendChild(list);
    renderList("");

    function selectCountry(c) {
      _activeIso    = c.iso;
      _activeDigits = c.digits;
      /* Update trigger to show only the code */
      trigger.querySelector(".pf-cc-code").textContent = c.code;
      /* Sync hidden select */
      var opts = hiddenSel.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].dataset.iso === c.iso) { hiddenSel.selectedIndex = i; break; }
      }
      /* Fire change on hidden select so hint updater works */
      var ev = document.createEvent("Event");
      ev.initEvent("change", true, true);
      hiddenSel.dispatchEvent(ev);
      renderList(searchBox.value);
    }

    function openPanel() {
      panel.style.display = "block";
      trigger.setAttribute("aria-expanded", "true");
      searchBox.value = "";
      renderList("");
      setTimeout(function() { searchBox.focus(); }, 50);
    }

    function closePanel() {
      panel.style.display = "none";
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", function(e) {
      e.stopPropagation();
      panel.style.display === "none" ? openPanel() : closePanel();
    });

    searchBox.addEventListener("input", function() { renderList(this.value); });
    searchBox.addEventListener("click", function(e) { e.stopPropagation(); });

    document.addEventListener("click", function() { closePanel(); });
    panel.addEventListener("click", function(e) { e.stopPropagation(); });

    wrapper.appendChild(hiddenSel);
    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);

    /* Public API */
    wrapper._selectByIso = function(iso) {
      var c = null;
      for (var i = 0; i < COUNTRIES.length; i++) {
        if (COUNTRIES[i].iso === iso) { c = COUNTRIES[i]; break; }
      }
      if (c) selectCountry(c);
    };
    wrapper._getHiddenSelect = function() { return hiddenSel; };
    wrapper._getDigits = function() { return _activeDigits; };

    return wrapper;
  }



  /* ── Dynamic hint text ────────────────────────────────────────────── */
  function buildHint(container) {
    var hint = document.createElement("small");
    hint.className = "pf-hint mt-1";
    hint.style.cssText = "font-size:0.78rem; display:none; color:#6c757d;";
    container.insertAdjacentElement("afterend", hint);
    return hint;
  }

  /* phoneEl = the <input type=tel>; isBlur = called from blur event */
  function updateHint(hint, sel, phoneEl, isBlur) {
    if (!hint || !sel) return;
    var opt    = sel.options[sel.selectedIndex];
    var code   = opt ? opt.value   : "";
    var digits = opt ? parseInt(opt.dataset.digits || "0", 10) : 0;
    if (!code) { hint.style.display = "none"; hint.textContent = ""; return; }

    var raw     = phoneEl ? phoneEl.value.replace(/[^0-9]/g, "") : "";
    var entered = raw.length;

    /* Stay hidden until the visitor reaches the phone field. Shown at page load, the
       hint (two lines on a phone) pushed the hero down after first paint — a layout
       shift — and it did so again when the IP lookup changed the country code. */
    var engaged = isBlur || entered > 0 ||
      (phoneEl && (phoneEl.dataset.pfTouched === "1" || document.activeElement === phoneEl));
    if (!engaged) { hint.style.display = "none"; return; }

    /* Hide once the user has typed the right number of digits */
    if (digits > 0 && entered === digits) {
      hint.style.display = "none";
      hint.textContent   = "";
      return;
    }

    var msg = digits > 0
      ? "Enter a " + digits + "-digit number after " + code + "."
      : "Enter a valid number after " + code + ".";

    hint.textContent   = msg;
    hint.style.display = "block";

    /* Red only after blur when user typed something wrong; gray otherwise */
    if (isBlur && entered > 0 && digits > 0 && entered !== digits) {
      hint.style.color = "#dc3545";
    } else {
      hint.style.color = "#6c757d";
    }
  }

  /* ── Numeric-only enforcement ─────────────────────────────────────── */
  function enforceNumeric(el) {
    if (!el) return;
    el.setAttribute("inputmode", "numeric");
    el.setAttribute("pattern", "[0-9\\s\\-\\(\\)]*");
    el.addEventListener("input", function() {
      var cleaned = this.value.replace(/[^0-9\s\-\(\)]/g, "");
      if (this.value !== cleaned) {
        var pos = this.selectionStart - (this.value.length - cleaned.length);
        this.value = cleaned;
        try { this.setSelectionRange(pos, pos); } catch(e) {}
      }
    });
    el.addEventListener("keydown", function(e) {
      var allowed = [8,9,13,27,35,36,37,38,39,40,46];
      if (allowed.indexOf(e.keyCode) !== -1) return;
      if ((e.ctrlKey||e.metaKey) && [65,67,86,88,90].indexOf(e.keyCode) !== -1) return;
      if (!/[0-9\s\-\(\)\+]/.test(e.key)) e.preventDefault();
    });
  }

  /* ── Inject CSS once ──────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("pf-styles")) return;
    var s = document.createElement("style");
    s.id = "pf-styles";
    s.textContent =
      ".pf-cc-wrapper{position:relative;display:inline-flex;align-items:stretch;flex:0 0 auto;align-self:stretch;}" +
      ".pf-cc-trigger{transition:background 0.15s;}" +
      ".pf-cc-trigger:hover{filter:brightness(0.95);}" +
      ".pf-cc-panel::-webkit-scrollbar{width:5px;}" +
      ".pf-cc-panel::-webkit-scrollbar-track{background:#f9f9f9;}" +
      ".pf-cc-panel::-webkit-scrollbar-thumb{background:#ccc;border-radius:4px;}" +
      ".pf-hint{margin-top:4px!important;line-height:1.3;}";
    document.head.appendChild(s);
  }

  /* ── Core upgrade ─────────────────────────────────────────────────── */
  function upgradePhoneFields() {
    var map = [
      { ccId:"countryCode",       phoneId:"phone"       },
      { ccId:"headerCountryCode", phoneId:"headerPhone" },
      { ccId:"popupCountryCode",  phoneId:"popupPhone"  }
    ];

    var widgets = []; /* { wrapper, phoneId } */

    map.forEach(function(pair) {
      var original = document.getElementById(pair.ccId);
      /* Skip if element missing or tagName is not INPUT (already replaced) */
      if (!original || original.tagName !== "INPUT") return;

      var wrapper = buildDropdown(original);
      /* Default selection: India */
      wrapper._selectByIso("IN");
      original.parentNode.replaceChild(wrapper, original);
      widgets.push({ wrapper: wrapper, phoneId: pair.phoneId });

      var phoneEl = document.getElementById(pair.phoneId);
      enforceNumeric(phoneEl);

      /* Attach hint below the input-group wrapper */
      var hiddenSel  = wrapper._getHiddenSelect();
      var inputGroup = wrapper.closest(".input-group") || wrapper.parentNode;
      var hint = buildHint(inputGroup);
      updateHint(hint, hiddenSel, phoneEl, false);

      /* Update hint on country change */
      hiddenSel.addEventListener("change", function() {
        updateHint(hint, hiddenSel, phoneEl, false);
      });

      /* Live update: hide hint once correct digits entered */
      if (phoneEl) {
        phoneEl.addEventListener("input", function() {
          updateHint(hint, hiddenSel, phoneEl, false);
        });
        /* Show red feedback only after leaving the field with wrong length */
        phoneEl.addEventListener("blur", function() {
          updateHint(hint, hiddenSel, phoneEl, true);
        });
        /* Clear red state when user re-focuses the field */
        phoneEl.addEventListener("focus", function() {
          phoneEl.dataset.pfTouched = "1";
          updateHint(hint, hiddenSel, phoneEl, false);
        });
      }
    });

    /* career.html — standalone phone input, no country code select */
    var sp = document.getElementById("phone");
    if (sp && sp.tagName === "INPUT") enforceNumeric(sp);

    if (!widgets.length) return;

    function apply(iso) {
      widgets.forEach(function(w) {
        w.wrapper._selectByIso(iso);
        /* Re-find and update the hint */
        var inputGroup = w.wrapper.closest(".input-group") || w.wrapper.parentNode;
        var hint = inputGroup ? inputGroup.parentNode.querySelector(".pf-hint") : null;
        var phoneEl2 = w.phoneId ? document.getElementById(w.phoneId) : null;
        updateHint(hint, w.wrapper._getHiddenSelect(), phoneEl2, false);
      });
    }

    /* IP detection */
    fetch("https://ipapi.co/json/")
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d && d.country_code) apply(d.country_code); })
      .catch(function() {
        fetch("https://ipwho.is/")
          .then(function(r) { return r.json(); })
          .then(function(d) { if (d && d.country_code) apply(d.country_code); })
          .catch(function() {});
      });
  }

  /* ── Boot ─────────────────────────────────────────────────────────── */
  injectStyles();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", upgradePhoneFields);
  } else {
    upgradePhoneFields();
  }
})();
