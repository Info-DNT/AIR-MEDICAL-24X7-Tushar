// Blogs & comments are fetched from window.blogsSupabaseClient configured in js/config.js
const supabaseClient = window.blogsSupabaseClient;

/***************** STATE *****************/
const PAGE_SIZE = 9;
let page = 0;

/***************** FILTER *****************/
// The sidebar on a post links here as blogs?category=X and blogs?tag=X.
const urlParams = new URLSearchParams(window.location.search);
const filterCategory = urlParams.get("category");
const filterTag = urlParams.get("tag");

/***************** DOM *****************/
const blogList = document.getElementById("blog-list");
const loadMoreBtn = document.getElementById("load-more");

/***************** FILTER NOTICE *****************/
// Say what is being filtered and offer a way out, otherwise a filtered list is
// indistinguishable from a short one.
function showFilterNotice() {
  if (!blogList || (!filterCategory && !filterTag)) return;
  const label = filterCategory ? `Category: ${filterCategory}` : `Tag: ${filterTag}`;
  const bar = document.createElement("div");
  bar.className = "col-12 mb-4";
  bar.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2
                px-4 py-3 rounded" style="background:#EFF5F9;">
      <span class="fw-bold text-dark mb-0">Showing posts in
        <span class="text-primary"></span></span>
      <a href="blogs" class="btn btn-sm btn-outline-primary">Clear filter</a>
    </div>`;
  // textContent, not innerHTML — the value comes from the query string
  bar.querySelector(".text-primary").textContent = label;
  blogList.parentNode.insertBefore(bar, blogList);
}

/***************** LOAD BLOGS *****************/
async function loadBlogs(reset = false) {
  if (!blogList || !loadMoreBtn) return;

  if (reset) {
    blogList.innerHTML = "";
    page = 0;
    loadMoreBtn.innerText = "Load More";
  }

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabaseClient
    .from("blogs")
    .select("*")
    .eq("status", "published");

  if (filterCategory) query = query.eq("category", filterCategory);
  if (filterTag) query = query.contains("tags", [filterTag]);   // tags is an array column

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Supabase error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    loadMoreBtn.style.display = "none";
    if (page === 0) {
      blogList.innerHTML =
        '<div class="col-12 text-center text-muted py-5">No posts found.</div>';
    }
    return;
  }

  data.forEach(blog => {
    const blogCard = document.createElement("div");
    blogCard.className = "col-xl-4 col-lg-6";

    const title = window.sanitize24X7(blog.title);
    const excerpt = window.sanitize24X7(blog.excerpt || "");
    const author = window.sanitize24X7(blog.author || "Air Medical 24X7");

    blogCard.innerHTML = `
      <div class="premium-card p-0 overflow-hidden h-100">
        <a href="blogs-detail?slug=${blog.slug}" class="d-block">
          <img class="img-fluid w-100"
               src="${blog.featured_image || "img/airmedicallogo.webp"}"
               alt="${title}" style="height: 220px; object-fit: cover;">
        </a>
        <div class="p-4">
          <a class="h4 d-block mb-3 text-dark fw-bold"
             href="blogs-detail?slug=${blog.slug}" style="text-decoration: none; line-height: 1.4;">
            ${title}
          </a>
          <p class="m-0 text-muted" style="font-size: 14px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
            ${excerpt}
          </p>
        </div>
        <div class="mt-auto border-top p-4">
          <small class="text-primary fw-bold"><i class="far fa-user me-2"></i>${author}</small>
        </div>
      </div>
    `;

    blogList.appendChild(blogCard);
  });

  // A full page back means there may be more; a short page means this was the last.
  loadMoreBtn.style.display = data.length === PAGE_SIZE ? "inline-block" : "none";
}

/***************** BUTTON CLICK *****************/
// Appends the next page each time, rather than the old two-state toggle that could only
// ever reach page 2 and left every post past the 18th unreachable.
if (loadMoreBtn) {
  loadMoreBtn.addEventListener("click", () => {
    page++;
    loadBlogs();
  });
}

/***************** INIT *****************/
document.addEventListener("DOMContentLoaded", () => {
  showFilterNotice();
  loadBlogs(true);
});
