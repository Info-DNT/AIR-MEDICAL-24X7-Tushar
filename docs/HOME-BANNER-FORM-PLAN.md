# Plan — put the quotation form in the home hero

**Requested:** change the home banner to the shared design — quotation form alongside the
hero copy on desktop, form **above** the copy on mobile, hero copy in a translucent card.

**Status:** plan only. Nothing executed. Nothing pushed.

---

## The good news: most of it already exists

The form in the screenshots is **already on the page**, with exactly the fields shown:

| Screenshot field | Existing element |
|---|---|
| Full Name | `#headerName` |
| Phone Number `+91` | `#headerCountryCode` + `#headerPhone` |
| Email Address | `#headerEmail` |
| From (Location) | `#headerPatientLocation` |
| To (Location) | `#headerDestination` |
| Required Air Ambulance Service | `#headerService` |
| Cloudflare Turnstile | injected by `js/config.js` |
| REQUEST CALLBACK | the form's submit button |

Nothing needs building. `<form id="quoteFormHeader">` is already wired to the Edge Function,
with Turnstile, validation and the success modal.

**It is simply hidden on desktop:**

```html
<!-- Mobile/Tablet Only Form (Shown at the bottom of Hero section) -->
<div class="d-block d-lg-none mt-4">
```

`d-lg-none` hides it at 992px and up. On desktop the hero is one `col-lg-5` of text and
**seven empty columns** of background image — the gap the desktop screenshot fills.

So this is a layout change, not a feature build.

---

## Current vs target

```
NOW                                TARGET
.row                               .row.align-items-center
  .col-lg-5                          .col-lg-6  order-2 order-lg-1   copy, in a card
    badge, h1, bullets, buttons      .col-lg-6  order-1 order-lg-2   the SAME form
    .d-block.d-lg-none  <- form
  (no second column)
```

### Desktop, 992px and up
Copy left, form right, vertically centred.

### Mobile, under 992px
**Form first, copy second — the reverse of today.** Both screenshots show the white form
card at the top of the hero and the dark copy card beneath it.

Bootstrap `order-*` handles this with no duplicated markup: source order stays
copy-then-form, and `order-1 order-lg-2` on the form flips it below the `lg` breakpoint.

---

## The one thing that would break it

**The form must be MOVED, not copied.**

`js/config.js` binds by id at lines 50, 187 and 236, and every field lookup is
`getElementById` — `headerName`, `headerEmail`, `headerPhone`, `headerService` and so on.

Two elements with `id="quoteFormHeader"` means `getElementById` returns only the first, so
one of them would silently submit nothing. A desktop copy alongside the existing mobile copy
is exactly that mistake.

One form, moved into a column visible at every width, with `order-*` controlling where it
appears. **No JavaScript change is needed, and none should be made.**

---

## Mobile already has a heavy overlay, and the card must account for it

At `max-width: 991.98px` the stylesheet paints a full-bleed gradient over the hero:

```css
.hero-header::before {
  background: linear-gradient(180deg, rgba(26, 52, 107, 0.9) 0%, ...);
}
```

That is **0.9 alpha navy, on all nine hero pages**. Putting another translucent dark card on
top stacks two dark layers: the copy loses contrast against the photo, the card stops
reading as a card, and the hero just looks muddy.

So the card needs **different alpha per breakpoint**:

```css
/* index.html only — .home-hero exists on no other page */
.home-hero .hero-copy {
  background: rgba(12, 22, 46, 0.38);   /* mobile: sits on the 0.9 overlay already there */
  border-radius: 16px;
  padding: 1.25rem;
}

@media (min-width: 992px) {
  .home-hero .hero-copy {
    background: rgba(12, 22, 46, 0.55);  /* desktop: no ::before overlay, needs more */
    backdrop-filter: blur(2px);
    padding: 2rem 2.25rem;
  }
}
```

Judge the exact alpha in the browser against the real photo — these are starting values, not
final ones.

---

## Blast radius

| Thing | Used by | Safe to touch? |
|---|---|---|
| `.home-hero` | **index.html only** | yes — scope every CSS change here |
| `.hero-header` | **9 pages** | no |
| `.hero-header::before` | **9 pages**, mobile | no — work with it |
| `.hero-btns` | shared | no |
| `#quoteFormHeader` | index.html only | yes — move, never duplicate |

Every new rule goes under `.home-hero`. That is a structural guarantee the other eight hero
pages cannot change, not a matter of being careful.

---

## Already correct — no work needed

- **Buttons stack full-width on mobile.** `.hero-btns` already does this at `max-width:
  576px`; the screenshot is 414px, so that is existing behaviour.
- **Bullets are left-aligned** — the `<ul>` already carries `text-start`.
- **Service dropdown** — the two removed services appear in no form on the site (checked).

---

## Steps

### 1. Restructure the hero row

Close `.col-lg-5` after the buttons, wrap the copy in `.hero-copy`, and give the form its
own column:

```html
<div class="row align-items-center">

  <div class="col-lg-6 order-2 order-lg-1">
    <div class="hero-copy">
      ...badge, h1, bullets, buttons — unchanged...
    </div>
  </div>

  <div class="col-lg-6 order-1 order-lg-2 mb-4 mb-lg-0">
    <div class="bg-white text-start rounded p-4 shadow text-dark">
      ...existing form markup, unchanged...
    </div>
  </div>

</div>
```

Drop `d-block d-lg-none` — that is the whole point. The form's own markup is **not edited**;
only its wrapper and position move.

### 2. Add the `.hero-copy` card CSS

As above, scoped to `.home-hero`, with the two alpha values.

### 3. Check the vertical rhythm on mobile

With the form first, the hero is taller on a phone. Confirm the copy card is still reachable
without excessive scrolling, and that the existing `min-height: 400px` at
`max-width: 991.98px` is not fighting the taller content.

---

## What must not regress

| Risk | Why it is controlled |
|---|---|
| **Duplicate form ids** | form is moved, not copied — verify exactly one `quoteFormHeader` |
| **Turnstile stops rendering** | `config.js` inserts the widget before the submit button, inside the moved markup, unchanged |
| **Form stops submitting** | no JS touched; verify a real submit reaches the Edge Function |
| **LCP regresses** | `img.hero-bg` keeps `fetchpriority="high"` and its `srcset`; the form is HTML and CSS, no new image |
| **CLS** | inputs already carry `height:48px`; the card adds no dynamic sizing |
| **Other hero pages change** | every rule scoped to `.home-hero`, which exists only on index.html |
| **Mobile contrast** | card alpha tuned separately because `::before` already paints 0.9 navy there |
| **Mobile hero too tall** | verify against the existing `min-height: 400px` rule |

---

## Verification

```bash
# exactly one form, no duplicate id
grep -c 'id="quoteFormHeader"' index.html      # expect 1
grep -c 'd-lg-none' index.html                 # expect one fewer than before

# order classes present on both columns
grep -c 'order-1 order-lg-2\|order-2 order-lg-1' index.html   # expect 2

# only the two intended files changed
git diff --name-only                           # expect index.html and css/style.css only
```

Then in a browser:

- **992px and up** — form beside the copy, both vertically centred, Turnstile renders, a
  test submit succeeds and the thank-you modal appears.
- **414px, iPhone XR** — form **above** the copy, copy card readable over the photo, buttons
  full width, no horizontal scroll.
- **768px, tablet** — still stacked, form first, nothing clipped.

---

## Effort

| Step | Effort | Risk |
|---|---|---|
| 1. Restructure the row, move the form, add order classes | 25 min | low — markup move, no JS |
| 2. `.hero-copy` card CSS, two breakpoints | 20 min | low — scoped to `.home-hero` |
| 3. Browser check at 414 / 768 / 1440 | 20 min | — |

**No JavaScript changes. No form-field changes. No changes to the other eight hero pages.**
