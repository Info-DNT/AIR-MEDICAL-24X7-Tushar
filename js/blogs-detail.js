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

/***************** DOM *****************/
const titleEl = document.getElementById("blog-title");
const imageEl = document.getElementById("blog-image");
const contentEl = document.getElementById("blog-content");

/***************** INIT *****************/
document.addEventListener("DOMContentLoaded", () => {
  loadBlog();
  loadCategories();
  loadRecentPosts();
  loadTags();
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

  imageEl.src = data.featured_image || "img/airmedicallogo.webp";
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

    div.innerHTML = `
      <div class="mb-1">
        <strong>${name}</strong>
        <small class="text-muted">
          • ${new Date(c.created_at).toDateString()}
        </small>
      </div>

      <div class="mb-2">
        ${message}
      </div>

      ${
        adminReply
          ? `
          <div style="
            margin-left: 15px;
            padding: 10px 12px;
            background: #f8f9fa;
            border-left: 3px solid #dc3545;
            font-size: 14px;
          ">
            <strong>Air Medical 24X7:</strong><br>
            ${adminReply}
          </div>
        `
          : ""
      }
    `;

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
    container.innerHTML += `
      <a class="d-block mb-2"
         href="blogs?category=${encodeURIComponent(category)}">
        ${category}
      </a>
    `;
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
    container.innerHTML += `
      <a class="d-block mb-2"
         href="blogs-detail?slug=${post.slug}">
        ${title}
      </a>
    `;
  });
}

/***************** TAG CLOUD *****************/
async function loadTags() {
  const { data } = await supabaseClient
    .from("blogs")
    .select("tags")
    .eq("status", "published");

  const container = document.getElementById("tag-cloud");
  if (!container) return;

  const tags = [...new Set(data.flatMap(b => b.tags || []))];

  container.innerHTML = tags
    .map(tag => `
      <a href="blogs?tag=${encodeURIComponent(tag)}"
         class="btn btn-primary btn-sm m-1">
        ${tag}
      </a>
    `)
    .join("");
}
