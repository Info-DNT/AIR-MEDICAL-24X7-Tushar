// Blogs & comments are fetched from window.blogsSupabaseClient configured in js/config.js
const supabaseClient = window.blogsSupabaseClient;

/***************** GLOBAL STATE *****************/
let currentBlogId = null;

/***************** SLUG RESOLUTION *****************/
// Accept both entry forms. ?slug= is what the blog listing links to; /blogs/{slug} is the
// clean URL written into the address bar by history.replaceState below, so it is what
// anyone who copies, bookmarks or refreshes the page will arrive on.
function resolveSlug() {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q) return q;
  const m = window.location.pathname.match(/\/blogs\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}
const slug = resolveSlug();

// This script runs from two depths: blogs-detail.html at the site root, and the
// pre-rendered blogs/<slug>.html one level down. Sidebar links must resolve from both.
const sitePrefix = /\/blogs\/[^/]+\/?$/.test(window.location.pathname) ? "../" : "";

/***************** DOM *****************/
const titleEl = document.getElementById("blog-title");
const imageEl = document.getElementById("blog-image");
const contentEl = document.getElementById("blog-content");

/***************** INIT *****************/
document.addEventListener("DOMContentLoaded", () => {
  loadBlog();
  loadCategories();
  loadRecentPosts();
});

/***************** BLOG LOAD *****************/
async function loadBlog() {
  if (!slug) {
    titleEl.innerText = "Blogs not found";
    return;
  }

  const { data, error } = await supabaseClient
    .from("blogs")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !data) {
    console.error(error);
    titleEl.innerText = "Blogs not found";
    return;
  }

  const sanitizedTitle = window.sanitize24X7(data.title);
  titleEl.innerText = sanitizedTitle;

  imageEl.src = window.safeUrl(data.featured_image, "img/airmedicallogo.webp");
  imageEl.alt = sanitizedTitle;

  contentEl.innerHTML = window.sanitize24X7(data.content);

  document.title = window.sanitize24X7(data.meta_title || data.title);
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      "content",
      window.sanitize24X7(data.meta_description || data.excerpt || "")
    );

  // Rewrite to the clean URL. Uses the directory the page is served from, so it stays
  // correct at the domain root and under a project subpath.
  const basePath = window.location.pathname.replace(/\/[^/]*$/, "").replace(/\/blogs$/, "");
  const cleanUrl = `${basePath}/blogs/${slug}`;
  history.replaceState({ slug }, sanitizedTitle, cleanUrl);
  const canonicalEl = document.getElementById("page-canonical");
  if (canonicalEl) {
    canonicalEl.setAttribute("href", `https://airmedical24x7.com/blogs/${slug}`);
  }

  currentBlogId = data.id;

  updateViews(data.id, data.views || 0);
  loadComments(data.id);
}

/***************** VIEWS *****************/
async function updateViews(blogId, currentViews) {
  const newViews = currentViews + 1;

  await supabaseClient
    .from("blogs")
    .update({ views: newViews })
    .eq("id", blogId);

  const viewEl = document.getElementById("view-count");
  if (viewEl) viewEl.innerText = newViews;
}

/***************** COMMENTS + AIR MEDICAL 24X7 REPLY *****************/
async function loadComments(blogId) {
  const { data, error } = await supabaseClient
    .from("comments")
    .select("name, message, admin_reply, created_at")
    .eq("blog_id", blogId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = document.getElementById("comment-list");
  const heading = document.getElementById("comment-heading");
  const countEl = document.getElementById("comment-count");

  list.innerHTML = "";
  heading.innerText = `${data.length} Comments`;
  if (countEl) countEl.innerText = data.length;

  data.forEach(c => {
    const div = document.createElement("div");
    div.className = "mb-4";

    const name = window.sanitize24X7(c.name);
    const message = window.sanitize24X7(c.message);
    const adminReply = window.sanitize24X7(c.admin_reply);

    // Comment fields are visitor-supplied and are plain text. Building the markup
    // first and filling the values in with textContent means a comment containing
    // markup is displayed as written rather than executed — which is the whole
    // point, since anyone can submit one.
    div.innerHTML = `
      <div class="mb-1">
        <strong class="js-c-name"></strong>
        <small class="text-muted">
          • <span class="js-c-date"></span>
        </small>
      </div>

      <div class="mb-2 js-c-message"></div>
    `;

    div.querySelector(".js-c-name").textContent = name || "";
    div.querySelector(".js-c-date").textContent = new Date(c.created_at).toDateString();
    div.querySelector(".js-c-message").textContent = message || "";

    // Built only when a reply exists, not hidden with display:none. A hidden block is
    // still in the DOM and still read aloud by a screen reader, so leaving it there
    // would change the page for anyone not looking at it.
    if (adminReply) {
      const reply = document.createElement("div");
      reply.style.cssText =
        "margin-left:15px;padding:10px 12px;background:#f8f9fa;" +
        "border-left:3px solid #dc3545;font-size:14px;";
      const label = document.createElement("strong");
      label.textContent = "Air Medical 24X7:";
      const text = document.createElement("span");
      text.textContent = adminReply;
      reply.append(label, document.createElement("br"), text);
      div.appendChild(reply);
    }

    list.appendChild(div);
  });
}

/***************** COMMENT SUBMIT *****************/
document
  .getElementById("comment-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentBlogId) {
      alert("Blog not loaded");
      return;
    }

    const name = document.getElementById("comment-name").value.trim();
    const email = document.getElementById("comment-email").value.trim();
    const website = document.getElementById("comment-website").value.trim();
    const message = document.getElementById("comment-message").value.trim();

    if (!name || !message) {
      alert("Name and comment are required");
      return;
    }

    const { error } = await supabaseClient
      .from("comments")
      .insert({
        blog_id: currentBlogId,
        name,
        email,
        website,
        message,
        status: "pending"
      });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Comment submitted for approval 🚀");
    e.target.reset();
  });

/***************** CATEGORIES *****************/
async function loadCategories() {
  const { data } = await supabaseClient
    .from("blogs")
    .select("category")
    .eq("status", "published");

  const container = document.getElementById("category-list");
  if (!container) return;

  container.innerHTML = "";

  [...new Set(data.map(b => b.category))].forEach(category => {
    const a = document.createElement("a");
    a.className = "d-block mb-2";
    a.href = sitePrefix + "blogs?category=" + encodeURIComponent(category || "");
    a.textContent = category || "";
    container.appendChild(a);
  });
}

/***************** RECENT POSTS *****************/
async function loadRecentPosts() {
  const { data } = await supabaseClient
    .from("blogs")
    .select("title, slug")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(5);

  const container = document.getElementById("recent-posts");
  if (!container) return;

  container.innerHTML = "";

  data.forEach(post => {
    const title = window.sanitize24X7(post.title);
    const a = document.createElement("a");
    a.className = "d-block mb-2";
    a.href = window.safeUrl(
      sitePrefix + "blogs/" + encodeURIComponent(post.slug || ""),
      sitePrefix + "blogs"
    );
    a.textContent = title || "";
    container.appendChild(a);
  });
}

/* Tag cloud removed: the blogs table has no "tags" column — the query returned
   400 column blogs.tags does not exist on every post page — and blogs-detail.html
   has no #tag-cloud container for it to fill. Reinstate only if the column is added. */
