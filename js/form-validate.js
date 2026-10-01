/**
 * form-validate.js — Anti-junk validation + Location Autocomplete
 *
 * Features:
 *  1. Location autocomplete via OpenStreetMap Nominatim (free, no API key)
 *     - Live dropdown as user types (3+ chars, 350ms debounce)
 *     - Selecting a real place marks the field as "verified" (green ✓)
 *  2. On submit — if user typed manually without picking a suggestion:
 *     - Runs stricter text validation (no keyboard mash, no gibberish)
 *     - Requires at least one real-looking word of 3+ letters
 *  3. Name validation (keyboard mash, repeated chars, mostly numeric)
 *  4. Honeypot + timing check (bot protection)
 *  5. Inline red error messages — no alert() popups
 */
(function () {
  "use strict";

  var PAGE_LOAD_TIME = Date.now();

  /* ── Spam patterns ── */
  /* Keyboard mash — matched anywhere in the text. */
  var KEYBOARD_RUNS = [
    "qwerty","qwert","werty","asdfg","sdfgh","zxcvb","xcvbn",
    "qazwsx","asdfgh","zxcvbn","qwertyu","asdfghj","zxcvbnm",
    "abcde","bcdef","cdefg","defgh","efghi","fghij","ghijk",
    "aaaaa","bbbbb","ccccc","ddddd","eeeee","sssss","ttttt"
  ];
  /* Filler words — matched as whole words only, so "Celeste" (test) and
     "Simone Neal" (none) pass. */
  var JUNK_WORDS = [
    "test","demo","fake","null","none","unknown","asdf","junk","random",
    "xyz","abc","hello","world","sample"
  ];
  /* Placeholder entries — rejected only when they are the whole value, so
     "Kuwait City" and "Mexico City" pass. */
  var PLACEHOLDERS = ["location","place","city","country","name"];

  /* Keeps letters from any script, so Arabic or Devanagari names count as letters.
     Falls back to a–z in browsers without Unicode property escapes. */
  var NON_LETTER = (function(){ try { return new RegExp("[^\\p{L}]","gu"); } catch(e) { return /[^a-z]/g; } })();
  function stripToLetters(str) { return (str||"").toLowerCase().replace(NON_LETTER,""); }

  function uniqueRatio(str) {
    var c = stripToLetters(str); if (!c.length) return 0;
    var u={}; for(var i=0;i<c.length;i++) u[c[i]]=1;
    return Object.keys(u).length/c.length;
  }

  function hasKeyboardRun(str) {
    var l = stripToLetters(str);
    for(var i=0;i<KEYBOARD_RUNS.length;i++) if(l.indexOf(KEYBOARD_RUNS[i])!==-1) return true;
    var words = (str||"").toLowerCase().split(/[^a-z]+/);
    for(var j=0;j<words.length;j++) if(JUNK_WORDS.indexOf(words[j])!==-1) return true;
    return PLACEHOLDERS.indexOf(l)!==-1;
  }

  function hasLongRepeat(str) { return /(.)\1{3,}/.test((str||"").toLowerCase()); }
  function isMostlyNumeric(str) { var d=(str.match(/\d/g)||[]).length; return str.length>0&&d/str.length>0.6; }

  /* Longest word of only letters — real places have at least one word ≥ 3 letters */
  function longestWordLength(str) {
    var words = (str||"").split(/[\s,\-\.\/]+/);
    var max = 0;
    words.forEach(function(w){ var l=stripToLetters(w).length; if(l>max) max=l; });
    return max;
  }

  /* ── Validators ── */
  function validateName(v) {
    v=(v||"").trim();
    if(v.length<2)           return "Please enter your full name (at least 2 characters).";
    if(isMostlyNumeric(v))   return "Name cannot be mostly numbers. Please enter your real name.";
    var letters=stripToLetters(v);
    if(letters.length<2)     return "Please enter a name with at least 2 letters.";
    var u={}; letters.split("").forEach(function(c){u[c]=1;});
    if(Object.keys(u).length<2) return "Name looks invalid. Please enter your real name.";
    if(hasLongRepeat(v))     return "Name looks invalid. Please enter your real name.";
    if(hasKeyboardRun(v))    return "Name looks like a test entry. Please enter your real name.";
    if(uniqueRatio(v)<0.3&&letters.length>4) return "Name looks invalid. Please enter your real name.";
    return null;
  }

  function validateLocation(v, label, verified) {
    v=(v||"").trim();
    var lbl=label||"Location";
    if(v.length<3)           return lbl+" must be at least 3 characters.";
    if(isMostlyNumeric(v))   return lbl+": numbers alone are not a valid location. Enter a city or country name.";
    var letters=stripToLetters(v);
    if(letters.length<2)     return "Please enter a valid "+lbl.toLowerCase()+" (city, country, or hospital).";
    if(hasLongRepeat(v))     return lbl+" contains repeated characters. Please enter a real location.";
    if(hasKeyboardRun(v))    return lbl+" looks like a test entry. Please enter a real city, country or hospital.";
    if(uniqueRatio(v)<0.3&&letters.length>5) return lbl+" looks invalid. Please enter a real location.";
    /* Require at least one recognizable word of 3+ letters */
    if(longestWordLength(v)<3) return "Please enter a valid "+lbl.toLowerCase()+" with at least one recognizable word.";
    /* If not autocomplete-verified, show softer warning about using suggestions */
    /* (We don't hard-block manual entry that passes all checks above) */
    return null;
  }

  /* ── UI helpers ── */
  function showFieldError(input, msg) {
    clearFieldError(input);
    input.style.borderColor="#dc3545";
    input.style.boxShadow="0 0 0 3px rgba(220,53,69,0.15)";
    var err=document.createElement("small");
    err.className="pf-field-error";
    err.style.cssText="display:block;color:#dc3545;font-size:0.78rem;margin-top:3px;";
    err.textContent=msg;
    input.parentNode.insertBefore(err,input.nextSibling);
  }

  function clearFieldError(input) {
    input.style.borderColor="";
    input.style.boxShadow="";
    var s=input.nextSibling;
    while(s){ if(s.nodeType===1&&s.classList&&s.classList.contains("pf-field-error")){s.remove();break;} s=s.nextSibling; }
  }

  function setVerified(input, yes) {
    clearFieldError(input);
    /* Remove existing badge */
    var old=input.parentNode.querySelector(".pf-loc-badge");
    if(old) old.remove();
    if(yes){
      input.style.borderColor="#198754";
      input.style.boxShadow="0 0 0 3px rgba(25,135,84,0.15)";
      input.dataset.locVerified="true";
      var badge=document.createElement("small");
      badge.className="pf-loc-badge";
      badge.style.cssText="display:block;color:#198754;font-size:0.75rem;margin-top:3px;";
      badge.innerHTML="&#10003; Location verified";
      input.parentNode.insertBefore(badge,input.nextSibling);
    } else {
      input.style.borderColor="";
      input.style.boxShadow="";
      delete input.dataset.locVerified;
    }
  }

  function clearOnInput(input) {
    input.addEventListener("input",function(){ clearFieldError(this); },{once:false});
  }

  /* ── Escape HTML for dropdown ── */
  function esc(str) {
    return (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* ── Location Autocomplete (OpenStreetMap Nominatim — free, no key) ── */
  function attachLocationAutocomplete(input, fieldLabel) {
    var timer=null, activeXhr=null, dropEl=null;

    /* Create dropdown attached to body so it escapes any overflow:hidden parents */
    function getOrCreateDrop() {
      if(!dropEl) {
        dropEl=document.createElement("div");
        dropEl.className="pf-loc-drop";
        dropEl.style.cssText=
          "position:fixed;z-index:99999;background:#fff;border:1px solid #dee2e6;"+
          "border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.14);"+
          "min-width:240px;max-width:420px;max-height:260px;overflow-y:auto;display:none;";
        document.body.appendChild(dropEl);
      }
      return dropEl;
    }

    function positionDrop() {
      var rect=input.getBoundingClientRect();
      var drop=getOrCreateDrop();
      drop.style.top=(rect.bottom+4)+"px";
      drop.style.left=rect.left+"px";
      drop.style.width=rect.width+"px";
    }

    function closeDrop() {
      if(dropEl) dropEl.style.display="none";
    }

    function showSuggestions(results) {
      var drop=getOrCreateDrop();
      drop.innerHTML="";
      if(!results||!results.length){ closeDrop(); return; }
      var seen={};
      results.forEach(function(place) {
        /* "Place, Country" — e.g. "Delhi, India". The full OSM name lists every
           district and county in between, which reads like an address, not a city. */
        var parts=place.display_name.split(",").map(function(p){ return p.trim(); });
        var label=parts.length>1 ? parts[0]+", "+parts[parts.length-1] : parts[0];
        if(seen[label]) return;
        seen[label]=true;
        var item=document.createElement("div");
        item.style.cssText=
          "padding:10px 14px;cursor:pointer;font-size:0.84rem;border-bottom:1px solid #f2f2f2;";
        item.innerHTML=esc(label);
        item.addEventListener("mousedown",function(e){
          e.preventDefault(); /* stop blur from firing before click */
          var chosen=label;
          input.value=chosen;
          input.dataset.locVerified="true";
          setVerified(input,true);
          closeDrop();
          /* Fire change so any external listeners know */
          var ev=document.createEvent("Event"); ev.initEvent("change",true,true); input.dispatchEvent(ev);
        });
        item.addEventListener("mouseenter",function(){ this.style.background="#f8f9fa"; });
        item.addEventListener("mouseleave",function(){ this.style.background=""; });
        drop.appendChild(item);
      });
      positionDrop();
      drop.style.display="block";
    }

    function fetchSuggestions(q) {
      /* Nominatim usage policy: max 1 req/s, include a meaningful User-Agent */
      fetch(
        "https://nominatim.openstreetmap.org/search?format=json&q="+encodeURIComponent(q)+
        /* settlement = cities, towns, villages, states and countries only —
           without it OSM also returns rivers, mountain peaks and single houses */
        "&limit=8&featureType=settlement&addressdetails=0&accept-language=en",
        { headers:{"Accept":"application/json"} }
      )
      .then(function(r){ return r.json(); })
      .then(function(data){ showSuggestions(data); })
      .catch(function(){ closeDrop(); });
    }

    /* Wrap the field in a positioned container */
    (function addHint(){
      var wrap=input.parentNode;
      /* Only wrap if not already wrapped (for idempotency) */
      if(wrap.classList&&wrap.classList.contains("pf-loc-wrap")) return;
      var container=document.createElement("div");
      container.className="pf-loc-wrap";
      container.style.cssText="position:relative;display:block;";
      wrap.insertBefore(container,input);
      container.appendChild(input);
    })();

    /* Input event — debounce 350ms */
    input.addEventListener("input",function(){
      /* Mark as unverified when user edits */
      if(input.dataset.locVerified) {
        delete input.dataset.locVerified;
        setVerified(input,false);
      }
      clearTimeout(timer);
      var val=(input.value||"").trim();
      if(val.length<3){ closeDrop(); return; }
      timer=setTimeout(function(){ fetchSuggestions(val); },350);
    });

    input.addEventListener("blur",function(){
      setTimeout(closeDrop,200);
    });

    /* Reposition on scroll/resize */
    window.addEventListener("scroll",positionDrop,{passive:true});
    window.addEventListener("resize",positionDrop,{passive:true});

    /* Keyboard nav in dropdown */
    input.addEventListener("keydown",function(e){
      var drop=getOrCreateDrop();
      if(drop.style.display==="none") return;
      var items=drop.querySelectorAll("div");
      var active=drop.querySelector("div.pf-active");
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();
        var idx=-1;
        items.forEach(function(it,i){ if(it===active) idx=i; });
        if(e.key==="ArrowDown") idx=Math.min(idx+1,items.length-1);
        else idx=Math.max(idx-1,0);
        if(active) active.classList.remove("pf-active"), active.style.background="";
        if(items[idx]){ items[idx].classList.add("pf-active"); items[idx].style.background="#f0f4ff"; items[idx].scrollIntoView({block:"nearest"}); }
      } else if(e.key==="Enter"&&active){
        e.preventDefault(); active.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));
      } else if(e.key==="Escape"){ closeDrop(); }
    });
  }

  /* ── Honeypot ── */
  function addHoneypot(form) {
    var hp=document.createElement("input");
    hp.type="text"; hp.name="website"; hp.autocomplete="off"; hp.tabIndex=-1;
    hp.setAttribute("aria-hidden","true");
    hp.style.cssText="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    form.appendChild(hp);
    return hp;
  }

  /* ── Main validation gate ── */
  function validateForm(form) {
    var valid=true;

    /* Honeypot */
    var hp=form.querySelector('input[name="website"]');
    if(hp&&hp.value.trim()!==""){console.warn("[form-validate] Honeypot"); return false;}

    /* Timing */
    if((Date.now()-PAGE_LOAD_TIME)/1000<2){console.warn("[form-validate] Too fast"); return false;}

    /* Name */
    var nameEl=form.querySelector("#name,#cu-name,#headerName,#popupName,[name='name']");
    if(nameEl){ var ne=validateName(nameEl.value); if(ne){showFieldError(nameEl,ne);clearOnInput(nameEl);valid=false;} }

    /* Locations */
    var locs=[
      {sel:"[name='patientLocation'],#patientLocation,#cu-from,#headerPatientLocation,#popupPatientLocation",label:"Patient Location"},
      {sel:"[name='destination'],#destination,#cu-destination,#headerDestination,#popupDestination",label:"Destination"}
    ];
    locs.forEach(function(lc){
      var el=null;
      lc.sel.split(",").forEach(function(s){ if(!el) el=form.querySelector(s.trim()); });
      if(!el) return;
      var verified=el.dataset.locVerified==="true";
      var err=validateLocation(el.value,lc.label,verified);
      if(err){ showFieldError(el,err); clearOnInput(el); valid=false; }
      else if(!verified&&(el.value||"").trim().length>2){
        /* Soft hint if not autocomplete-verified but text passes basic checks */
        /* Don't block — just clear any old verified badge */
        setVerified(el,false);
      }
    });

    /* Email */
    var emailEl=form.querySelector("#email,#cu-email,#headerEmail,#popupEmail,[name='email']");
    if(emailEl&&emailEl.value.trim()!==""){
      var ev=emailEl.value.trim();
      var bad=[/^test@/i,/^admin@/i,/^fake@/i,/^null@/i,/^no@/i,/^a@/i,/^x@/i,/^[a-z]{1}@[a-z]{1}\.[a-z]{1,2}$/i];
      if(ev.length<6||ev.indexOf("@")<1||bad.some(function(p){return p.test(ev);})){
        showFieldError(emailEl,"Please enter a valid email address."); clearOnInput(emailEl); valid=false;
      }
    }

    if(!valid){ var fe=form.querySelector(".pf-field-error"); if(fe) fe.scrollIntoView({behavior:"smooth",block:"center"}); }
    return valid;
  }

  /* ── Inject autocomplete CSS once ── */
  function injectStyles() {
    if(document.getElementById("pf-validate-styles")) return;
    var s=document.createElement("style"); s.id="pf-validate-styles";
    s.textContent=
      ".pf-loc-wrap input{padding-right:30px!important;}"+
      ".pf-loc-drop div:last-child{border-bottom:none!important;}"+
      ".pf-loc-drop::-webkit-scrollbar{width:4px;}"+
      ".pf-loc-drop::-webkit-scrollbar-thumb{background:#ccc;border-radius:4px;}";
    document.head.appendChild(s);
  }

  /* ── Init ── */
  function init() {
    injectStyles();
    var formIds=["quoteForm","quoteFormPopup","quoteFormHeader","careerForm"];
    formIds.forEach(function(id){
      var form=document.getElementById(id);
      if(!form) return;
      addHoneypot(form);

      /* Attach autocomplete to location fields */
      var locSelectors=[
        {sel:"[name='patientLocation']",label:"Patient Location"},
        {sel:"[name='destination']",label:"Destination"}
      ];
      locSelectors.forEach(function(ls){
        var el=form.querySelector(ls.sel);
        if(el) attachLocationAutocomplete(el,ls.label);
      });

      /* Validate on submit */
      form.addEventListener("submit",function(e){
        if(!validateForm(form)){ e.preventDefault(); e.stopImmediatePropagation(); }
      },false);
    });
  }

  /* config.js submits the quote forms from a capture-phase listener that stops the
     listener above from running, so it calls this directly before sending. */
  window.validateQuoteForm=validateForm;
  window.formAgeMs=function(){ return Date.now()-PAGE_LOAD_TIME; };

  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded",init); }
  else { init(); }
})();