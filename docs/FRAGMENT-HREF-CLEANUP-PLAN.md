# Plan — remove placeholder `#` hrefs from the navigation

**Reported:** hovering "Our Services" shows `https://airmedical24x7.com/air-ambulance#`

**Status:** plan only. Nothing executed.

---

## 1. Cause

The dropdown toggle is an anchor whose destination is a bare fragment:

```html
<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown">Our Services</a>
```

`href="#"` resolves against the current page, so on `/air-ambulance` the browser reports
`/air-ambulance#`. It is not a separate URL — it is the same page plus an empty fragment.

---

## 2. Full inventory

Every placeholder href on the site, from the markup:

| Count | Markup | Verdict |
|---:|---|---|
| **62** | `<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown">` | 🔴 fix — the reported issue |
| **62** | `<a href="#!" class="btn … back-to-top" aria-label="Back to top">` | 🔴 fix — same defect, also shows `#!` |
| **1** | `<a href="#" class="nav-item nav-link">Career</a>` in `countries.html:323` | 🔴 **broken navigation** — see §3 |
| 14 | `href="#quoteForm"` across 13 pages | ✅ **leave alone** — real same-page anchors |
| 2 | `<a href="#!" class="country-card">` (Botswana, Brazil) | ⚪ dead markup, already inside HTML comments |

Verified: all 13 pages linking to `#quoteForm` **do** contain `id="quoteForm"`, so none of
those anchors are broken. They are legitimate and must not be touched.

---

## 3. A real bug found while inventorying

`countries.html` line 323:

```html
<a href="#" class="nav-item nav-link">Career</a>
```

On the countries page the **Career link in the main navigation goes nowhere**. Every other
page links it correctly to `career`. This is a genuine navigation break, not cosmetic, and
is worth fixing regardless of what is decided about the rest of this plan.

---

## 4. How much does this actually matter?

Stated honestly, because the SEO framing is usually overstated:

- **Duplicate content: not a risk.** Google discards the fragment when canonicalising, so
  `/air-ambulance#` is never indexed separately from `/air-ambulance`. Nothing is being
  split or diluted today.
- **Accessibility: this is the strongest argument.** An `<a>` that navigates nowhere is
  announced to screen readers as a link. The element is a control that opens a menu, so
  its correct role is **button** (WCAG 4.1.2 Name, Role, Value).
- **UX: minor but real.** The status bar shows a meaningless destination, and clicking the
  toggle appends `#` to the address bar.
- **Internal linking: the genuine SEO gap.** "Our Services" is a top-level navigation item
  that points at nothing, and **no services hub page exists**. Thirteen service pages are
  reachable only through a dropdown. This mirrors the countries problem from the original
  audit, where the hub exists but nothing in the nav links to it.

So: fix it, but for correctness and accessibility. Do not expect a ranking change.

---

## 5. The fix

### 5a. Dropdown toggle → `<button>` ✅ recommended

```html
<!-- from -->
<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown">Our Services</a>

<!-- to -->
<button type="button" class="nav-link dropdown-toggle" data-bs-toggle="dropdown"
        aria-expanded="false">Our Services</button>
```

Bootstrap 5 supports `<button>` as a dropdown toggle directly. No `href`, so no URL is
ever shown or navigated to, and the element is keyboard-operable natively with the correct
role.

`type="button"` is not optional — a `<button>` inside a form defaults to `type="submit"`.

**Required CSS**, because a button carries user-agent defaults an anchor does not:

```css
.navbar-nav button.nav-link {
    background: none;
    border: 0;
    padding: 25px 0;      /* match .navbar-light .navbar-nav .nav-link */
    font: inherit;
    cursor: pointer;
    text-align: left;
}
```

### 5b. Back-to-top → `<button>`

```html
<button type="button" class="btn btn-lg btn-primary btn-lg-square back-to-top"
        aria-label="Back to top">…</button>
```

Same reasoning. `main.js` already binds it by class and calls `preventDefault()`, which
becomes unnecessary but harmless.

### 5c. Fix the broken Career link

`countries.html:323` → `href="career"`.

### 5d. Delete the two commented-out country cards

Botswana and Brazil — dead markup referencing images that do not exist.

---

## 6. Optional, and worth considering separately

**Create a `/services` hub page** and point the toggle at it instead of using a button.
That would fix the `#`, give the 13 service pages a crawlable parent, and match the
existing `countries.html` pattern. It is a content decision, not a code one, so it is
listed as an option rather than folded into this plan.

If that page is created, 5a becomes `<a href="services" class="nav-link dropdown-toggle">`
— which keeps the dropdown *and* gives the item a real destination. This is the better
long-term answer; the button is the correct fix in the meantime.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Button UA styles break navbar alignment | **High** if 5a's CSS is skipped | Ship the CSS in the same change; check desktop and mobile |
| A `<button>` inside a form submits it | Low | `type="button"` on every converted element |
| `main.js` active-state logic skips buttons | Certain, and harmless | It iterates `.navbar-nav a` and already skips `href="#"`; the toggle was never highlighted |
| Mobile menu collapse behaviour changes | Low | The toggle is driven by `data-bs-toggle`, which is element-agnostic |

---

## 8. Verification

```bash
# no placeholder hrefs left except the legitimate #quoteForm anchors
grep -rhoE 'href="#[^"]*"' --include=*.html . | sort | uniq -c
# expect: only href="#quoteForm"

# every dropdown toggle is now a button with an explicit type
grep -rc '<button type="button" class="nav-link dropdown-toggle"' --include=*.html .

# no button lacks type=
grep -rhoE '<button(?![^>]*type=)[^>]*>' --include=*.html .
# expect: no output
```

Then visually confirm on desktop and mobile: the Our Services dropdown opens on hover and
click, the navbar item is still aligned with its siblings, and the back-to-top button
still appears past 100 px of scroll and returns to the top.

---

## 9. Estimate

| Step | Effort |
|---|---|
| 5a + CSS across 62 pages | 45 min |
| 5b across 62 pages | 20 min |
| 5c, 5d | 5 min |
| Verification + visual check | 30 min |
| **Total** | **~1.5 h** |

Small, mechanical, and safe — but it touches the navigation on every page, so it wants the
visual check before deploying.
