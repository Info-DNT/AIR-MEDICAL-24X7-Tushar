// Air Medical 24X7 - Blog Admin Panel JS Controller
const getSupabaseClient = () => window.blogsSupabaseClient;

/***************** STATE MANAGEMENT *****************/
let currentSession = null;
let featuredImageBase64 = null;
let blogsList = [];
let deleteTargetId = null;

let reviewImageBase64 = null;
let reviewsList = [];
let reviewDeleteTargetId = null;

/***************** INITIALIZATION *****************/
document.addEventListener("DOMContentLoaded", async () => {
  // Setup DOM Listeners and editor immediately to prevent race conditions
  initListeners();
  initEditor();

  // Check active Supabase Auth session server-side using a clean anon client
  try {
    const authClient = supabase.createClient(blogsSupabaseUrl, blogsSupabaseKey);
    const { data: { session } } = await authClient.auth.getSession();
    if (session) {
      currentSession = { username: session.user.email, authType: 'supabase', userId: session.user.id };
      sessionStorage.setItem("admin_session", JSON.stringify(currentSession));
      
      // Restore any manually-entered service role key from this session after verifying auth
      const savedKey = sessionStorage.getItem("blogs_supabase_service_key");
      if (savedKey) {
        window.rebindBlogsSupabaseClient(savedKey);
        document.getElementById("settings-write-key").value = savedKey;
        document.getElementById("write-key-status").classList.remove("d-none");
      }
      
      showDashboard(session.user.email);
    } else {
      sessionStorage.removeItem("admin_session");
      showLogin();
    }
  } catch (e) {
    console.error("Auth check failed:", e);
    sessionStorage.removeItem("admin_session");
    showLogin();
  }
});


/***************** AUDIT LOGGING *****************/
async function logActivity(blogId, blogTitle, action) {
  const client = getSupabaseClient();
  const adminUser = currentSession ? currentSession.username : "unknown";
  try {
    await client
      .from("blog_audit_logs")
      .insert([{
        blog_id: blogId.toString(),
        blog_title: window.sanitize24X7(blogTitle),
        action: action,
        action_by: adminUser
      }]);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}


/***************** DOM LISTENERS *****************/
function initListeners() {
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logout-btn");

  // Handle Login Submit — uses Supabase Auth (server-side verification)
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailVal = document.getElementById("login-user").value.trim();
    const passVal = document.getElementById("login-password").value;
    const alertEl = document.getElementById("login-alert");
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    alertEl.classList.add("d-none");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Signing in..."; }

    try {
      const { data, error } = await window.blogsSupabaseClient.auth.signInWithPassword({
        email: emailVal,
        password: passVal
      });
      if (error) throw error;
      currentSession = { username: data.user.email, authType: 'supabase', userId: data.user.id };
      sessionStorage.setItem("admin_session", JSON.stringify(currentSession));
      showDashboard(data.user.email);
    } catch (err) {
      alertEl.innerText = "Invalid credentials. Please check your email and password.";
      alertEl.classList.remove("d-none");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign In"; }
    }
  });

  // Logout Click
  logoutBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to sign out of the editor dashboard?")) {
      await window.blogsSupabaseClient.auth.signOut();
      sessionStorage.removeItem("admin_session");
      currentSession = null;
      showLogin();
    }
  });

  // Sidebar Tab Navigation
  const tabs = {
    'nav-create-btn': 'tab-create',
    'nav-manage-btn': 'tab-manage',
    'nav-create-review-btn': 'tab-create-review',
    'nav-manage-reviews-btn': 'tab-manage-reviews',
    'nav-settings-btn': 'tab-settings'
  };

  Object.entries(tabs).forEach(([btnId, tabId]) => {
    document.getElementById(btnId).addEventListener("click", (e) => {
      // Toggle sidebar active state
      Object.keys(tabs).forEach(bId => document.getElementById(bId).classList.remove("active"));
      document.getElementById(btnId).classList.add("active");

      // Toggle tab views
      Object.values(tabs).forEach(tId => document.getElementById(tId).classList.add("d-none-admin"));
      document.getElementById(tabId).classList.remove("d-none-admin");

      // If switching to manage, refresh table list
      if (tabId === 'tab-manage') {
        loadBlogsTable();
      } else if (tabId === 'tab-manage-reviews') {
        loadReviewsTable();
      } else if (tabId === 'tab-create-review') {
        const editReviewId = document.getElementById("edit-review-id").value;
        if (!editReviewId) {
          clearReviewEditorForm();
        }
      }
    });
  });

  // Database Write Key Settings Save
  document.getElementById("btn-save-write-key").addEventListener("click", () => {
    const key = document.getElementById("settings-write-key").value.trim();
    if (!key) {
      alert("Please enter a valid Service Role JWT key.");
      return;
    }
    sessionStorage.setItem("blogs_supabase_service_key", key);
    window.rebindBlogsSupabaseClient(key);
    document.getElementById("write-key-status").classList.remove("d-none");
    alert("Supabase client successfully re-bound with the provided Service Role key for this session!");
  });

  document.getElementById("btn-clear-write-key").addEventListener("click", () => {
    sessionStorage.removeItem("blogs_supabase_service_key");
    document.getElementById("settings-write-key").value = "";
    window.rebindBlogsSupabaseClient(null); // restore anon client
    document.getElementById("write-key-status").classList.add("d-none");
    alert("Service role key cleared. Restored default anon database credentials.");
  });

  // Auto-slug generation from Title
  const titleInput = document.getElementById("blog-title-input");
  const slugInput = document.getElementById("blog-slug-input");

  titleInput.addEventListener("input", () => {
    const editId = document.getElementById("edit-blog-id").value;
    // Only auto-generate if we are creating a new post (not editing)
    if (!editId) {
      slugInput.value = slugify(titleInput.value);
      updateLivePreview();
    }
  });

  document.getElementById("btn-regen-slug").addEventListener("click", () => {
    slugInput.value = slugify(titleInput.value);
  });

  // Featured Image: Drag & Drop Zone triggers file input selection
  const dropZone = document.getElementById("img-drop-zone");
  const fileInput = document.getElementById("blog-image-file");

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#1A346B";
    dropZone.style.background = "#e2e8f0";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "#cbd5e1";
    dropZone.style.background = "#f8fafc";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#cbd5e1";
    dropZone.style.background = "#f8fafc";
    
    if (e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleImageFile(e.target.files[0]);
    }
  });

  // Remove featured image button
  document.getElementById("btn-remove-image").addEventListener("click", () => {
    featuredImageBase64 = null;
    fileInput.value = "";
    document.getElementById("blog-image-url").value = "";
    document.getElementById("image-preview-container").classList.add("d-none");
    document.getElementById("preview-blog-image").style.display = "none";
  });

  // Image URL input field changes
  document.getElementById("blog-image-url").addEventListener("input", (e) => {
    const url = e.target.value.trim();
    const previewContainer = document.getElementById("image-preview-container");
    const previewThumb = document.getElementById("image-preview-thumb");
    const livePreviewImg = document.getElementById("preview-blog-image");

    if (url) {
      featuredImageBase64 = null; // clear base64 selection if URL is supplied
      previewThumb.src = url;
      previewContainer.classList.remove("d-none");
      livePreviewImg.src = url;
      livePreviewImg.style.display = "block";
    } else {
      previewContainer.classList.add("d-none");
      livePreviewImg.style.display = "none";
    }
  });

  // Form Fields binding to Live Preview
  const liveBindings = [
    { inputId: "blog-title-input", previewId: "preview-blog-title", defaultValue: "Blog Title Preview" },
    { inputId: "blog-author-input", previewId: "preview-blog-author", defaultValue: "Air Medical 24X7" },
    { inputId: "blog-category-input", previewId: "preview-blog-category", defaultValue: "General" }
  ];

  liveBindings.forEach(binding => {
    const el = document.getElementById(binding.inputId);
    el.addEventListener("input", () => {
      const val = el.value.trim();
      // Apply 24X7 casing standardizer
      const displayVal = val ? window.sanitize24X7(val) : binding.defaultValue;
      document.getElementById(binding.previewId).innerText = displayVal;
    });
  });

  // Draft & Publish buttons
  document.getElementById("btn-save-draft").addEventListener("click", () => submitBlogPost("draft"));
  document.getElementById("btn-publish").addEventListener("click", () => submitBlogPost("published"));

  // Search input on Manage Blogs tab
  const searchInput = document.getElementById("blog-search-input");
  searchInput.addEventListener("input", () => {
    filterBlogsTable(searchInput.value);
  });

  document.getElementById("btn-search-clear").addEventListener("click", () => {
    searchInput.value = "";
    filterBlogsTable("");
  });

  // Confirm delete button in modal
  document.getElementById("btn-confirm-delete").addEventListener("click", () => {
    if (deleteTargetId) {
      executeDelete(deleteTargetId);
    }
  });

  // --- REVIEW LISTENERS ---
  const reviewDropZone = document.getElementById("review-img-drop-zone");
  const reviewFileInput = document.getElementById("review-image-file");

  reviewDropZone.addEventListener("click", () => reviewFileInput.click());

  reviewDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    reviewDropZone.style.borderColor = "#1A346B";
    reviewDropZone.style.background = "#e2e8f0";
  });

  reviewDropZone.addEventListener("dragleave", () => {
    reviewDropZone.style.borderColor = "#cbd5e1";
    reviewDropZone.style.background = "#f8fafc";
  });

  reviewDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    reviewDropZone.style.borderColor = "#cbd5e1";
    reviewDropZone.style.background = "#f8fafc";
    if (e.dataTransfer.files.length > 0) {
      handleReviewImageFile(e.dataTransfer.files[0]);
    }
  });

  reviewFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleReviewImageFile(e.target.files[0]);
    }
  });

  document.getElementById("btn-remove-review-image").addEventListener("click", () => {
    reviewImageBase64 = null;
    reviewFileInput.value = "";
    document.getElementById("review-image-url").value = "";
    document.getElementById("review-image-preview-container").classList.add("d-none");
    updateReviewAvatarPreview();
  });

  document.getElementById("review-image-url").addEventListener("input", (e) => {
    const url = e.target.value.trim();
    const previewContainer = document.getElementById("review-image-preview-container");
    const previewThumb = document.getElementById("review-image-preview-thumb");

    if (url) {
      reviewImageBase64 = null; // clear base64 selection if URL is supplied
      previewThumb.src = url;
      previewContainer.classList.remove("d-none");
    } else {
      previewContainer.classList.add("d-none");
    }
    updateReviewAvatarPreview();
  });

  // Review bindings to live preview
  const reviewNameInput = document.getElementById("review-name-input");
  reviewNameInput.addEventListener("input", () => {
    const name = reviewNameInput.value.trim() || "Reviewer Name";
    document.getElementById("preview-review-name").innerText = window.sanitize24X7(name);
    updateReviewAvatarPreview();
  });

  const reviewRatingInput = document.getElementById("review-rating-input");
  reviewRatingInput.addEventListener("change", () => {
    const rating = parseInt(reviewRatingInput.value) || 5;
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      starsHtml += i <= rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    }
    document.getElementById("preview-review-stars").innerHTML = starsHtml;
  });

  const reviewContentInput = document.getElementById("review-content-input");
  reviewContentInput.addEventListener("input", () => {
    const content = reviewContentInput.value.trim() || "Enter the review text content to see how it renders here...";
    document.getElementById("preview-review-text").innerText = `"${window.sanitize24X7(content)}"`;
  });

  const reviewRouteInput = document.getElementById("review-route-input");
  reviewRouteInput.addEventListener("input", () => {
    const route = reviewRouteInput.value.trim() || "Route Location Preview";
    document.getElementById("preview-review-route").innerText = window.sanitize24X7(route);
  });

  const reviewServiceInput = document.getElementById("review-service-input");
  const reviewDateInput = document.getElementById("review-date-input");

  const updateReviewSubtitlePreview = () => {
    const service = reviewServiceInput.value.trim() || "Service Type";
    const date = reviewDateInput.value.trim() || "Jan 2026";
    document.getElementById("preview-review-subtitle").innerText = `${window.sanitize24X7(service)} | ${window.sanitize24X7(date)}`;
  };

  reviewServiceInput.addEventListener("input", updateReviewSubtitlePreview);
  reviewDateInput.addEventListener("input", updateReviewSubtitlePreview);

  // Draft & Publish buttons for reviews
  document.getElementById("btn-save-review-draft").addEventListener("click", () => submitReviewPost("draft"));
  document.getElementById("btn-publish-review").addEventListener("click", () => submitReviewPost("published"));

  // Search input on Manage Reviews tab
  const reviewSearchInput = document.getElementById("review-search-input");
  reviewSearchInput.addEventListener("input", () => {
    filterReviewsTable(reviewSearchInput.value);
  });

  document.getElementById("btn-review-search-clear").addEventListener("click", () => {
    reviewSearchInput.value = "";
    filterReviewsTable("");
  });

  // Confirm delete button in review delete modal
  document.getElementById("btn-confirm-review-delete").addEventListener("click", () => {
    if (reviewDeleteTargetId) {
      executeReviewDelete(reviewDeleteTargetId);
    }
  });
}

/***************** RICH EDITOR INITIALIZATION *****************/
let quillEditor = null;

function initEditor() {
  quillEditor = new Quill('#editor-quill', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'font': [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image', 'video'],
        ['blockquote', 'code-block'],
        ['clean']
      ]
    }
  });

  // quillEditor text changes feed the live preview in real time
  quillEditor.on('text-change', () => {
    updateLivePreview();
  });
}

function updateLivePreview() {
  const contentEl = document.getElementById("preview-blog-content");
  if (!quillEditor || !contentEl) return;

  const rawHtml = quillEditor.root.innerHTML;
  if (rawHtml === "<p><br></p>" || !quillEditor.getText().trim()) {
    contentEl.innerHTML = '<p class="text-muted">Start typing in the editor on the left to see the live rendering...</p>';
  } else {
    // Sanitize and ensure brand consistency
    contentEl.innerHTML = window.sanitize24X7(rawHtml);
  }
}

/***************** VIEW TOGGLING *****************/
function showLogin() {
  document.getElementById("login-view").classList.remove("d-none-admin");
  document.getElementById("dashboard-view").classList.add("d-none-admin");
  document.getElementById("dashboard-view").classList.remove("d-flex");
}

function showDashboard(username) {
  document.getElementById("login-view").classList.add("d-none-admin");
  document.getElementById("dashboard-view").classList.remove("d-none-admin");
  document.getElementById("dashboard-view").classList.add("d-flex");
  document.getElementById("logged-user-display").innerText = username;
  
  // Switch to default "Create" tab
  document.getElementById("nav-create-btn").click();
  clearEditorForm();
  clearReviewEditorForm();
  updateQuickStats();
}

/***************** FILE UPLOAD TO BASE64 *****************/
function handleImageFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Please select a valid image file (PNG, JPG, or JPEG).");
    return;
  }

  // Convert to Base64
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    featuredImageBase64 = reader.result;
    
    // Set preview details
    document.getElementById("blog-image-url").value = ""; // clear URL input
    document.getElementById("image-preview-thumb").src = reader.result;
    document.getElementById("image-preview-container").classList.remove("d-none");
    
    // Set live preview image
    const livePreviewImg = document.getElementById("preview-blog-image");
    livePreviewImg.src = reader.result;
    livePreviewImg.style.display = "block";
  };
  reader.onerror = (error) => {
    console.error("FileReader Error:", error);
    alert("Error reading file. Please try again.");
  };
}

/***************** SLUGIFY *****************/
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/***************** CLEAR EDITOR FORM *****************/
function clearEditorForm() {
  document.getElementById("edit-blog-id").value = "";
  document.getElementById("blog-title-input").value = "";
  document.getElementById("blog-slug-input").value = "";
  document.getElementById("blog-excerpt-input").value = "";
  document.getElementById("blog-category-input").value = "General";
  document.getElementById("blog-author-input").value = "Air Medical 24X7";
  document.getElementById("blog-image-url").value = "";
  document.getElementById("blog-image-file").value = "";
  document.getElementById("blog-meta-title").value = "";
  document.getElementById("blog-meta-desc").value = "";
  
  if (quillEditor) {
    quillEditor.setText("");
  }
  
  featuredImageBase64 = null;
  document.getElementById("image-preview-container").classList.add("d-none");
  document.getElementById("preview-blog-image").style.display = "none";
  
  document.getElementById("preview-blog-title").innerText = "Blog Title Preview";
  document.getElementById("preview-blog-author").innerText = "Air Medical 24X7";
  document.getElementById("preview-blog-category").innerText = "General";
  document.getElementById("preview-blog-content").innerHTML = '<p class="text-muted">Start typing in the editor on the left to see the live rendering...</p>';
  
  document.getElementById("editor-tab-title").innerText = "Create New Blog Post";
}

/***************** POST SUBMIT (INSERT / UPDATE) *****************/
async function submitBlogPost(status) {
  const title = document.getElementById("blog-title-input").value.trim();
  const slug = document.getElementById("blog-slug-input").value.trim();
  const excerpt = document.getElementById("blog-excerpt-input").value.trim();
  const category = document.getElementById("blog-category-input").value;
  const author = document.getElementById("blog-author-input").value.trim() || "Air Medical 24X7";
  const metaTitle = document.getElementById("blog-meta-title").value.trim();
  const metaDesc = document.getElementById("blog-meta-desc").value.trim();
  
  const content = quillEditor ? quillEditor.root.innerHTML : "";
  const textContent = quillEditor ? quillEditor.getText().trim() : "";

  // Validation
  if (!title) { alert("Blog Title is required!"); return; }
  if (!slug) { alert("URL Slug is required!"); return; }
  if (!excerpt) { alert("Excerpt is required!"); return; }
  if (!textContent || content === "<p><br></p>") { alert("Article content body is required!"); return; }

  // Check Featured Image (either uploaded base64 or raw URL)
  const imageUrl = document.getElementById("blog-image-url").value.trim();
  const featuredImage = featuredImageBase64 || imageUrl;
  
  if (!featuredImage) {
    alert("Please upload a featured image file or supply an image URL!");
    return;
  }

  // Compile payload and apply standardization function to preserve '24X7' brand casing in the database
  const payload = {
    title: window.sanitize24X7(title),
    slug: slugify(slug),
    excerpt: window.sanitize24X7(excerpt),
    content: window.sanitize24X7(content),
    featured_image: featuredImage,
    author: window.sanitize24X7(author),
    status: status,
    category: category,
    meta_title: window.sanitize24X7(metaTitle || title),
    meta_description: window.sanitize24X7(metaDesc || excerpt)
  };

  const editId = document.getElementById("edit-blog-id").value;
  const client = getSupabaseClient();
  
  // Disable buttons while submitting
  document.getElementById("btn-save-draft").disabled = true;
  document.getElementById("btn-publish").disabled = true;

  try {
    if (editId) {
      // Update
      const { error } = await client
        .from("blogs")
        .update(payload)
        .eq("id", editId);

      if (error) {
        throw new Error(error.message);
      }
      await logActivity(editId, payload.title, "updated");
      alert(`Success: Blog post "${payload.title}" updated successfully!`);
    } else {
      // Insert
      const { data, error } = await client
        .from("blogs")
        .insert([payload])
        .select();

      if (error) {
        throw new Error(error.message);
      }
      const insertedId = (data && data[0]) ? data[0].id : "new-post";
      await logActivity(insertedId, payload.title, "created");
      alert(`Success: Blog post "${payload.title}" published/saved successfully!`);
    }

    clearEditorForm();
    updateQuickStats();
    // Redirect to Manage tab
    document.getElementById("nav-manage-btn").click();
  } catch (err) {
    console.error("Submission failed:", err);
    alert(`Error: ${err.message || "Failed to publish blog post. Double check your settings and DB permissions (RLS Write Key)."}`);
  } finally {
    document.getElementById("btn-save-draft").disabled = false;
    document.getElementById("btn-publish").disabled = false;
  }
}

/***************** MANAGE TABLE LOAD *****************/
async function loadBlogsTable() {
  const tbody = document.getElementById("blogs-table-body");
  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center text-muted py-5">
        <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
        Loading blog list from Supabase...
      </td>
    </tr>
  `;

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from("blogs")
      .select("id, title, slug, excerpt, content, featured_image, author, status, category, created_at, meta_title, meta_description")
      .order("created_at", { ascending: false });

    if (error) throw error;

    blogsList = data || [];
    renderBlogsTable(blogsList);
  } catch (err) {
    console.error("Failed to load blogs:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger py-5">
          <i class="fas fa-exclamation-circle me-1"></i> Failed to retrieve blog list: ${err.message || "Unauthorized"}
        </td>
      </tr>
    `;
  }
}

function renderBlogsTable(list) {
  const tbody = document.getElementById("blogs-table-body");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">No blog posts found.</td>
      </tr>
    `;
    return;
  }

  list.forEach(blog => {
    const tr = document.createElement("tr");
    
    const statusClass = blog.status === 'published' ? 'status-badge-published' : 'status-badge-draft';
    const dateStr = new Date(blog.created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    tr.innerHTML = `
      <td>
        <img src="${blog.featured_image || 'img/airmedicallogo.webp'}" class="thumbnail-img" alt="Blog Featured Image">
      </td>
      <td>
        <div class="fw-bold text-dark">${window.sanitize24X7(blog.title)}</div>
        <div class="text-muted small">/${blog.slug}</div>
      </td>
      <td><span class="badge bg-light text-dark border px-2.5 py-1.5">${blog.category || 'General'}</span></td>
      <td><span class="status-badge ${statusClass}">${blog.status}</span></td>
      <td class="text-muted small">${dateStr}</td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-outline-primary btn-sm me-1 px-2.5 btn-edit-post" data-id="${blog.id}">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm px-2.5 btn-delete-post" data-id="${blog.id}">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Bind Actions on newly rendered buttons
  document.querySelectorAll(".btn-edit-post").forEach(btn => {
    btn.addEventListener("click", () => {
      const blogId = btn.getAttribute("data-id");
      loadPostToEditor(blogId);
    });
  });

  document.querySelectorAll(".btn-delete-post").forEach(btn => {
    btn.addEventListener("click", () => {
      const blogId = btn.getAttribute("data-id");
      showDeleteModal(blogId);
    });
  });
}

/***************** FILTER TABLE *****************/
function filterBlogsTable(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderBlogsTable(blogsList);
    return;
  }

  const filtered = blogsList.filter(blog => 
    blog.title.toLowerCase().includes(q) || 
    (blog.category && blog.category.toLowerCase().includes(q)) ||
    blog.slug.toLowerCase().includes(q)
  );

  renderBlogsTable(filtered);
}

/***************** LOAD POST TO EDITOR *****************/
function loadPostToEditor(blogId) {
  const blog = blogsList.find(b => b.id === blogId);
  if (!blog) return;

  // Populates edit fields
  document.getElementById("edit-blog-id").value = blog.id;
  document.getElementById("blog-title-input").value = blog.title;
  document.getElementById("blog-slug-input").value = blog.slug;
  document.getElementById("blog-excerpt-input").value = blog.excerpt;
  document.getElementById("blog-category-input").value = blog.category || "General";
  document.getElementById("blog-author-input").value = blog.author || "Air Medical 24X7";
  document.getElementById("blog-meta-title").value = blog.meta_title || "";
  document.getElementById("blog-meta-desc").value = blog.meta_description || "";

  // Image handling
  const previewContainer = document.getElementById("image-preview-container");
  const previewThumb = document.getElementById("image-preview-thumb");
  const livePreviewImg = document.getElementById("preview-blog-image");
  
  if (blog.featured_image) {
    if (blog.featured_image.startsWith("data:image/")) {
      featuredImageBase64 = blog.featured_image;
      document.getElementById("blog-image-url").value = "";
    } else {
      featuredImageBase64 = null;
      document.getElementById("blog-image-url").value = blog.featured_image;
    }
    previewThumb.src = blog.featured_image;
    previewContainer.classList.remove("d-none");
    livePreviewImg.src = blog.featured_image;
    livePreviewImg.style.display = "block";
  } else {
    featuredImageBase64 = null;
    document.getElementById("blog-image-url").value = "";
    previewContainer.classList.add("d-none");
    livePreviewImg.style.display = "none";
  }

  // Populate editor content
  if (quillEditor) {
    quillEditor.root.innerHTML = blog.content;
  }
  
  // Set tab header
  document.getElementById("editor-tab-title").innerText = `Edit Post: ${blog.title}`;

  // Switch to Create/Edit tab
  document.getElementById("nav-create-btn").click();
  updateLivePreview();
}

/***************** DELETE HANDLING *****************/
let bootstrapDeleteModal = null;

function showDeleteModal(blogId) {
  const blog = blogsList.find(b => b.id === blogId);
  if (!blog) return;

  deleteTargetId = blogId;
  document.getElementById("delete-blog-title").innerText = blog.title;

  if (!bootstrapDeleteModal) {
    bootstrapDeleteModal = new bootstrap.Modal(document.getElementById("deleteModal"));
  }
  bootstrapDeleteModal.show();
}

async function executeDelete(blogId) {
  const client = getSupabaseClient();
  const btn = document.getElementById("btn-confirm-delete");

  btn.disabled = true;
  btn.innerText = "Deleting...";

  const blog = blogsList.find(b => b.id === blogId);
  const blogTitle = blog ? blog.title : "Unknown Title";

  try {
    // Delete any comments associated with the blog post first to avoid orphans
    const { error: commentsError } = await client
      .from("comments")
      .delete()
      .eq("blog_id", blogId);

    if (commentsError) {
      console.warn("Could not delete associated comments:", commentsError.message);
    }

    const { error } = await client
      .from("blogs")
      .delete()
      .eq("id", blogId);

    if (error) throw error;

    await logActivity(blogId, blogTitle, "deleted");
    alert("Blog post successfully deleted from the system!");
    
    if (bootstrapDeleteModal) {
      bootstrapDeleteModal.hide();
    }
    
    // Refresh table and stats
    loadBlogsTable();
    updateQuickStats();
  } catch (err) {
    console.error("Delete failed:", err);
    alert(`Error: ${err.message || "Failed to delete blog post. Confirm DB settings/permissions."}`);
  } finally {
    btn.disabled = false;
    btn.innerText = "Delete Post";
    deleteTargetId = null;
  }
}

/***************** QUICK STATS WIDGET *****************/
async function updateQuickStats() {
  const client = getSupabaseClient();

  // Blog stats — isolated so a reviews table error cannot suppress blog counts
  try {
    const { data: blogsData, error: blogsError } = await client
      .from("blogs")
      .select("status");

    if (!blogsError && blogsData) {
      const total = blogsData.length;
      const published = blogsData.filter(b => b.status === "published").length;
      const drafts = total - published;

      document.getElementById("stat-total").innerText = total;
      document.getElementById("stat-published").innerText = published;
      document.getElementById("stat-drafts").innerText = drafts;
    }
  } catch (e) {
    console.warn("Blog stats update failed:", e);
  }

  // Reviews stats — isolated so a missing reviews table cannot affect blog stats
  try {
    const { data: reviewsData, error: reviewsError } = await client
      .from("reviews")
      .select("status");

    if (!reviewsError && reviewsData) {
      const totalReviews = reviewsData.length;
      const publishedReviews = reviewsData.filter(r => r.status === "published").length;
      const draftsReviews = totalReviews - publishedReviews;

      document.getElementById("stat-reviews-total").innerText = totalReviews;
      document.getElementById("stat-reviews-published").innerText = publishedReviews;
      document.getElementById("stat-reviews-drafts").innerText = draftsReviews;
    }
  } catch (e) {
    console.warn("Reviews stats update failed:", e);
  }
}

/***************** REVIEW AUDIT LOGGING *****************/
async function logReviewActivity(reviewId, reviewerName, action) {
  const client = getSupabaseClient();
  const adminUser = currentSession ? currentSession.username : "unknown";
  try {
    await client
      .from("blog_audit_logs")
      .insert([{
        blog_id: reviewId.toString(),
        blog_title: window.sanitize24X7(`Review: ${reviewerName}`),
        action: action,
        action_by: adminUser
      }]);
  } catch (err) {
    console.error("Failed to write audit log for review:", err);
  }
}

/***************** REVIEW UPLOAD TO BASE64 *****************/
function handleReviewImageFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Please select a valid image file (PNG, JPG, or JPEG).");
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    reviewImageBase64 = reader.result;
    document.getElementById("review-image-url").value = "";
    document.getElementById("review-image-preview-thumb").src = reader.result;
    document.getElementById("review-image-preview-container").classList.remove("d-none");
    updateReviewAvatarPreview();
  };
  reader.onerror = (error) => {
    console.error("FileReader Error:", error);
    alert("Error reading file. Please try again.");
  };
}

function updateReviewAvatarPreview() {
  const urlInput = document.getElementById("review-image-url").value.trim();
  const avatar = reviewImageBase64 || urlInput;
  const container = document.getElementById("preview-review-avatar-container");
  const name = document.getElementById("review-name-input").value.trim() || "Reviewer Name";

  if (avatar) {
    container.innerHTML = `<img class="testimonial-avatar" src="${avatar}" alt="${name}" style="object-fit: cover; width: 48px; height: 48px; border-radius: 14px;">`;
  } else {
    // Initials fallback
    const parts = name.split(/\s+/);
    const initials = parts.map(p => p[0]).join("").substring(0, 2).toUpperCase() || "AM";
    const colors = ["#0d1b2a", "#fb0f0c", "#354f8e", "#1d2a4d", "#1A346B", "#112246"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    container.innerHTML = `<div class="testimonial-avatar" style="background: ${color}; width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: #fff;">${initials}</div>`;
  }
}

/***************** CLEAR REVIEW EDITOR FORM *****************/
function clearReviewEditorForm() {
  document.getElementById("edit-review-id").value = "";
  document.getElementById("review-name-input").value = "";
  document.getElementById("review-rating-input").value = "5";
  document.getElementById("review-date-input").value = "";
  document.getElementById("review-route-input").value = "";
  document.getElementById("review-service-input").value = "";
  document.getElementById("review-image-url").value = "";
  document.getElementById("review-image-file").value = "";
  document.getElementById("review-content-input").value = "";

  reviewImageBase64 = null;
  document.getElementById("review-image-preview-container").classList.add("d-none");

  // Reset live previews
  document.getElementById("preview-review-stars").innerHTML = '<i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>';
  document.getElementById("preview-review-text").innerText = '"Enter the review text content to see how it renders here..."';
  document.getElementById("preview-review-name").innerText = "Reviewer Name";
  document.getElementById("preview-review-route").innerText = "Route Location Preview";
  document.getElementById("preview-review-subtitle").innerText = "Service Type | Jan 2026";
  
  updateReviewAvatarPreview();

  document.getElementById("review-editor-tab-title").innerText = "Add New Google Review";
}

/***************** REVIEW SUBMIT (INSERT / UPDATE) *****************/
async function submitReviewPost(status) {
  const reviewerName = document.getElementById("review-name-input").value.trim();
  const rating = parseInt(document.getElementById("review-rating-input").value) || 5;
  const reviewDate = document.getElementById("review-date-input").value.trim();
  const route = document.getElementById("review-route-input").value.trim();
  const serviceInfo = document.getElementById("review-service-input").value.trim();
  const reviewContent = document.getElementById("review-content-input").value.trim();

  // Validation
  if (!reviewerName) { alert("Reviewer Name is required!"); return; }
  if (!reviewDate) { alert("Review Date is required! (e.g. Jan 2026)"); return; }
  if (!reviewContent) { alert("Review content text is required!"); return; }

  // Check Profile Image (either uploaded base64 or raw URL)
  const imageUrl = document.getElementById("review-image-url").value.trim();
  const profileImage = reviewImageBase64 || imageUrl || null;

  const payload = {
    reviewer_name: window.sanitize24X7(reviewerName),
    rating: rating,
    review_content: window.sanitize24X7(reviewContent),
    review_date: window.sanitize24X7(reviewDate),
    route: route ? window.sanitize24X7(route) : null,
    service_info: serviceInfo ? window.sanitize24X7(serviceInfo) : null,
    profile_image: profileImage,
    status: status
  };

  const editId = document.getElementById("edit-review-id").value;
  const client = getSupabaseClient();

  // Disable buttons while submitting
  document.getElementById("btn-save-review-draft").disabled = true;
  document.getElementById("btn-publish-review").disabled = true;

  try {
    if (editId) {
      // Update
      const { error } = await client
        .from("reviews")
        .update(payload)
        .eq("id", editId);

      if (error) throw new Error(error.message);
      await logReviewActivity(editId, payload.reviewer_name, "updated");
      alert(`Success: Review for "${payload.reviewer_name}" updated successfully!`);
    } else {
      // Insert
      const { data, error } = await client
        .from("reviews")
        .insert([payload])
        .select();

      if (error) throw new Error(error.message);
      const insertedId = (data && data[0]) ? data[0].id : "new-review";
      await logReviewActivity(insertedId, payload.reviewer_name, "created");
      alert(`Success: Review for "${payload.reviewer_name}" published/saved successfully!`);
    }

    clearReviewEditorForm();
    updateQuickStats();
    // Redirect to Manage tab
    document.getElementById("nav-manage-reviews-btn").click();
  } catch (err) {
    console.error("Review submission failed:", err);
    alert(`Error: ${err.message || "Failed to save review. Double check your settings and DB permissions (RLS Write Key)."}`);
  } finally {
    document.getElementById("btn-save-review-draft").disabled = false;
    document.getElementById("btn-publish-review").disabled = false;
  }
}

/***************** MANAGE REVIEWS TABLE LOAD *****************/
async function loadReviewsTable() {
  const tbody = document.getElementById("reviews-table-body");
  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-muted py-5">
        <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
        Loading reviews list from Supabase...
      </td>
    </tr>
  `;

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    reviewsList = data || [];
    renderReviewsTable(reviewsList);
  } catch (err) {
    console.error("Failed to load reviews:", err);
    const isTableMissing = err.message && (err.message.includes("does not exist") || err.code === "PGRST200");
    const displayMsg = isTableMissing
      ? `The <strong>reviews</strong> table has not been created yet. Run the SQL migration in your Supabase dashboard first.`
      : `Failed to retrieve reviews: ${err.message || "Check your DB settings and write key."}`;
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-danger py-5">
          <i class="fas fa-exclamation-circle me-1"></i> ${displayMsg}
        </td>
      </tr>
    `;
  }
}

function renderReviewsTable(list) {
  const tbody = document.getElementById("reviews-table-body");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">No customer reviews found.</td>
      </tr>
    `;
    return;
  }

  list.forEach(review => {
    const tr = document.createElement("tr");
    
    const statusClass = review.status === 'published' ? 'status-badge-published' : 'status-badge-draft';
    
    // Avatar cell representation
    let avatarCell = "";
    if (review.profile_image) {
      avatarCell = `<img src="${review.profile_image}" class="thumbnail-img rounded-circle" style="width: 40px; height: 40px; object-fit: cover;" alt="Reviewer Avatar">`;
    } else {
      const parts = review.reviewer_name.trim().split(/\s+/);
      const initials = parts.map(p => p[0]).join("").substring(0, 2).toUpperCase() || "AM";
      avatarCell = `<div class="rounded-circle text-white d-flex align-items-center justify-content-center" style="background: #1A346B; width: 40px; height: 40px; font-weight: 700; font-size: 13px;">${initials}</div>`;
    }

    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      starsHtml += i <= review.rating ? '<i class="fas fa-star text-warning"></i>' : '<i class="far fa-star text-muted"></i>';
    }

    const routeText = review.route || "No Route Specified";
    const serviceText = review.service_info || "General Transfer";

    tr.innerHTML = `
      <td>${avatarCell}</td>
      <td>
        <div class="fw-bold text-dark">${window.sanitize24X7(review.reviewer_name)}</div>
      </td>
      <td>
        <div class="small fw-bold text-dark">${window.sanitize24X7(routeText)}</div>
        <div class="text-muted small">${window.sanitize24X7(serviceText)}</div>
      </td>
      <td>${starsHtml}</td>
      <td><span class="status-badge ${statusClass}">${review.status}</span></td>
      <td class="text-muted small">${window.sanitize24X7(review.review_date)}</td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-outline-primary btn-sm me-1 px-2.5 btn-edit-review" data-id="${review.id}">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm px-2.5 btn-delete-review" data-id="${review.id}">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Bind Actions on newly rendered buttons
  document.querySelectorAll(".btn-edit-review").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      loadReviewToEditor(id);
    });
  });

  document.querySelectorAll(".btn-delete-review").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      showReviewDeleteModal(id);
    });
  });
}

/***************** FILTER REVIEWS TABLE *****************/
function filterReviewsTable(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderReviewsTable(reviewsList);
    return;
  }

  const filtered = reviewsList.filter(review => 
    review.reviewer_name.toLowerCase().includes(q) || 
    (review.route && review.route.toLowerCase().includes(q)) ||
    (review.service_info && review.service_info.toLowerCase().includes(q))
  );

  renderReviewsTable(filtered);
}

/***************** LOAD REVIEW TO EDITOR *****************/
function loadReviewToEditor(id) {
  const review = reviewsList.find(r => r.id === id);
  if (!review) return;

  // Populates edit fields
  document.getElementById("edit-review-id").value = review.id;
  document.getElementById("review-name-input").value = review.reviewer_name;
  document.getElementById("review-rating-input").value = review.rating.toString();
  document.getElementById("review-date-input").value = review.review_date;
  document.getElementById("review-route-input").value = review.route || "";
  document.getElementById("review-service-input").value = review.service_info || "";
  document.getElementById("review-content-input").value = review.review_content;

  // Avatar Image handling
  const previewContainer = document.getElementById("review-image-preview-container");
  const previewThumb = document.getElementById("review-image-preview-thumb");
  
  if (review.profile_image) {
    if (review.profile_image.startsWith("data:image/")) {
      reviewImageBase64 = review.profile_image;
      document.getElementById("review-image-url").value = "";
    } else {
      reviewImageBase64 = null;
      document.getElementById("review-image-url").value = review.profile_image;
    }
    previewThumb.src = review.profile_image;
    previewContainer.classList.remove("d-none");
  } else {
    reviewImageBase64 = null;
    document.getElementById("review-image-url").value = "";
    previewContainer.classList.add("d-none");
  }

  // Set tab header
  document.getElementById("review-editor-tab-title").innerText = `Edit Review: ${review.reviewer_name}`;

  // Switch to Add Review tab
  document.getElementById("nav-create-review-btn").click();
  
  // Update Live Preview Pane
  document.getElementById("preview-review-text").innerText = `"${window.sanitize24X7(review.review_content)}"`;
  document.getElementById("preview-review-name").innerText = window.sanitize24X7(review.reviewer_name);
  document.getElementById("preview-review-route").innerText = window.sanitize24X7(review.route || "No Route Specified");
  
  const service = review.service_info || "General Transfer";
  const date = review.review_date;
  document.getElementById("preview-review-subtitle").innerText = `${window.sanitize24X7(service)} | ${window.sanitize24X7(date)}`;
  
  let starsHtml = "";
  for (let i = 1; i <= 5; i++) {
    starsHtml += i <= review.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
  }
  document.getElementById("preview-review-stars").innerHTML = starsHtml;

  updateReviewAvatarPreview();
}

/***************** REVIEW DELETE HANDLING *****************/
let bootstrapReviewDeleteModal = null;

function showReviewDeleteModal(id) {
  const review = reviewsList.find(r => r.id === id);
  if (!review) return;

  reviewDeleteTargetId = id;
  document.getElementById("delete-review-name").innerText = review.reviewer_name;

  if (!bootstrapReviewDeleteModal) {
    bootstrapReviewDeleteModal = new bootstrap.Modal(document.getElementById("deleteReviewModal"));
  }
  bootstrapReviewDeleteModal.show();
}

async function executeReviewDelete(id) {
  const client = getSupabaseClient();
  const btn = document.getElementById("btn-confirm-review-delete");

  btn.disabled = true;
  btn.innerText = "Deleting...";

  const review = reviewsList.find(r => r.id === id);
  const name = review ? review.reviewer_name : "Unknown Name";

  try {
    const { error } = await client
      .from("reviews")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await logReviewActivity(id, name, "deleted");
    alert("Customer review successfully deleted from the system!");
    
    if (bootstrapReviewDeleteModal) {
      bootstrapReviewDeleteModal.hide();
    }
    
    // Refresh table and stats
    loadReviewsTable();
    updateQuickStats();
  } catch (err) {
    console.error("Review delete failed:", err);
    alert(`Error: ${err.message || "Failed to delete review. Confirm DB settings/permissions."}`);
  } finally {
    btn.disabled = false;
    btn.innerText = "Delete Review";
    reviewDeleteTargetId = null;
  }
}
