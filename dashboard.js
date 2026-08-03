(() => {
  'use strict';

  const sb = window.getSupabaseClient();

  /* ---------------------------------------------------------------------
     عناصر عامة
  --------------------------------------------------------------------- */
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const loginMsg = document.getElementById('login-msg');
  const logoutBtn = document.getElementById('logout-btn');
  const currentUserEmailEl = document.getElementById('current-user-email');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebarNav = document.getElementById('sidebar-nav');

  const views = {
    articles: document.getElementById('view-articles'),
    editor: document.getElementById('view-editor'),
    team: document.getElementById('view-team'),
    content: document.getElementById('view-content'),
  };
  const navButtons = document.querySelectorAll('.sidebar-nav button[data-view]');

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
    navButtons.forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
    sidebarNav.classList.remove('is-open');
    if (name === 'articles') loadArticles();
    if (name === 'team') loadTeam();
    if (name === 'content') loadContent();
  }
  navButtons.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

  mobileMenuBtn?.addEventListener('click', () => sidebarNav.classList.toggle('is-open'));

  /* ---------------------------------------------------------------------
     تسجيل الدخول / الخروج
  --------------------------------------------------------------------- */
  async function checkSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      loginScreen.classList.add('hidden');
      app.classList.remove('hidden');
      currentUserEmailEl.textContent = session.user.email;
      showView('articles');
    } else {
      loginScreen.classList.remove('hidden');
      app.classList.add('hidden');
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginMsg.textContent = '';
    loginMsg.className = 'msg';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    loginBtn.disabled = false;
    if (error) {
      loginMsg.textContent = 'بيانات الدخول غير صحيحة أو الحساب غير موجود.';
      loginMsg.classList.add('msg--error');
      return;
    }
    checkSession();
  });

  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
    checkSession();
  });

  /* ---------------------------------------------------------------------
     المقالات
  --------------------------------------------------------------------- */
  const articlesTableWrap = document.getElementById('articles-table-wrap');
  const newArticleBtn = document.getElementById('new-article-btn');
  const backToArticlesBtn = document.getElementById('back-to-articles-btn');
  const editorTitleEl = document.getElementById('editor-title');
  const titleInput = document.getElementById('article-title');
  const slugInput = document.getElementById('article-slug');
  const excerptInput = document.getElementById('article-excerpt');
  const contentInput = document.getElementById('article-content');
  const coverFileInput = document.getElementById('cover-file');
  const coverPreview = document.getElementById('cover-preview');
  const editorMsg = document.getElementById('editor-msg');
  const saveDraftBtn = document.getElementById('save-draft-btn');
  const publishBtn = document.getElementById('publish-btn');
  const deleteArticleBtn = document.getElementById('delete-article-btn');

  let currentArticleId = null;
  let currentCoverUrl = null;
  let slugManuallyEdited = false;

  function slugify(text) {
    return text
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  titleInput?.addEventListener('input', () => {
    if (!slugManuallyEdited) slugInput.value = slugify(titleInput.value);
  });
  slugInput?.addEventListener('input', () => { slugManuallyEdited = true; });

  async function loadArticles() {
    articlesTableWrap.innerHTML = '<p class="empty-state">جارِ التحميل...</p>';
    const { data, error } = await sb.from('articles').select('*').order('created_at', { ascending: false });
    if (error) {
      articlesTableWrap.innerHTML = `<p class="empty-state">حصل خطأ: ${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      articlesTableWrap.innerHTML = '<p class="empty-state">مفيش مقالات لسه. اضغط "مقال جديد" عشان تبدأ.</p>';
      return;
    }
    const rows = data.map(a => `
      <tr>
        <td>${escapeHtml(a.title)}</td>
        <td><span class="pill ${a.status === 'published' ? 'pill--published' : 'pill--draft'}">${a.status === 'published' ? 'منشور' : 'مسودة'}</span></td>
        <td style="color:var(--text-faint); font-size:13px;">${new Date(a.created_at).toLocaleDateString('ar-EG')}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn--ghost btn--sm" data-edit="${a.id}">تعديل</button>
          </div>
        </td>
      </tr>
    `).join('');
    articlesTableWrap.innerHTML = `
      <table class="table">
        <thead><tr><th>العنوان</th><th>الحالة</th><th>تاريخ الإنشاء</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    articlesTableWrap.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditor(btn.dataset.edit));
    });
  }

  newArticleBtn.addEventListener('click', () => openEditor(null));
  backToArticlesBtn.addEventListener('click', () => showView('articles'));

  async function openEditor(articleId) {
    currentArticleId = articleId;
    currentCoverUrl = null;
    slugManuallyEdited = false;
    editorMsg.textContent = '';
    titleInput.value = '';
    slugInput.value = '';
    excerptInput.value = '';
    contentInput.value = '';
    coverPreview.innerHTML = 'بدون صورة';
    deleteArticleBtn.classList.toggle('hidden', !articleId);

    if (articleId) {
      editorTitleEl.textContent = 'تعديل مقال';
      const { data, error } = await sb.from('articles').select('*').eq('id', articleId).single();
      if (error || !data) {
        editorMsg.textContent = 'تعذر تحميل المقال.';
        editorMsg.classList.add('msg--error');
      } else {
        titleInput.value = data.title || '';
        slugInput.value = data.slug || '';
        excerptInput.value = data.excerpt || '';
        contentInput.value = data.content || '';
        currentCoverUrl = data.cover_image_url || null;
        if (currentCoverUrl) coverPreview.innerHTML = `<img src="${escapeAttr(currentCoverUrl)}" alt="">`;
        slugManuallyEdited = true;
      }
    } else {
      editorTitleEl.textContent = 'مقال جديد';
    }
    showView('editor');
  }

  document.querySelectorAll('.toolbar [data-wrap]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [before, after] = btn.dataset.wrap.split('|');
      const start = contentInput.selectionStart;
      const end = contentInput.selectionEnd;
      const selected = contentInput.value.slice(start, end);
      const newText = contentInput.value.slice(0, start) + before + selected + after + contentInput.value.slice(end);
      contentInput.value = newText;
      contentInput.focus();
      contentInput.selectionStart = start + before.length;
      contentInput.selectionEnd = start + before.length + selected.length;
    });
  });

  coverFileInput.addEventListener('change', async () => {
    const file = coverFileInput.files[0];
    if (!file) return;
    coverPreview.innerHTML = 'جارِ الرفع...';
    const path = `${Date.now()}-${slugify(file.name)}`;
    const { error: uploadError } = await sb.storage.from('article-images').upload(path, file, { upsert: true });
    if (uploadError) {
      coverPreview.innerHTML = 'فشل رفع الصورة';
      return;
    }
    const { data } = sb.storage.from('article-images').getPublicUrl(path);
    currentCoverUrl = data.publicUrl;
    coverPreview.innerHTML = `<img src="${escapeAttr(currentCoverUrl)}" alt="">`;
  });

  async function saveArticle(status) {
    editorMsg.textContent = '';
    editorMsg.className = 'msg';
    const title = titleInput.value.trim();
    const slug = slugInput.value.trim() || slugify(title);
    if (!title || !slug) {
      editorMsg.textContent = 'من فضلك اكتب عنوان للمقال.';
      editorMsg.classList.add('msg--error');
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    const payload = {
      title,
      slug,
      excerpt: excerptInput.value.trim(),
      content: contentInput.value,
      cover_image_url: currentCoverUrl,
      status,
      author_id: session?.user?.id || null,
    };
    if (status === 'published') payload.published_at = new Date().toISOString();

    let result;
    if (currentArticleId) {
      result = await sb.from('articles').update(payload).eq('id', currentArticleId).select().single();
    } else {
      result = await sb.from('articles').insert(payload).select().single();
    }
    if (result.error) {
      editorMsg.textContent = 'حصل خطأ: ' + result.error.message;
      editorMsg.classList.add('msg--error');
      return;
    }
    currentArticleId = result.data.id;
    editorMsg.textContent = status === 'published' ? 'تم النشر بنجاح ✅' : 'تم حفظ المسودة ✅';
    editorMsg.classList.add('msg--ok');
  }

  saveDraftBtn.addEventListener('click', () => saveArticle('draft'));
  publishBtn.addEventListener('click', () => saveArticle('published'));

  deleteArticleBtn.addEventListener('click', async () => {
    if (!currentArticleId) return;
    if (!confirm('متأكد إنك عايز تحذف المقال ده؟')) return;
    const { error } = await sb.from('articles').delete().eq('id', currentArticleId);
    if (error) {
      editorMsg.textContent = 'تعذر الحذف: ' + error.message;
      editorMsg.classList.add('msg--error');
      return;
    }
    showView('articles');
  });

  /* ---------------------------------------------------------------------
     الفريق
  --------------------------------------------------------------------- */
  const teamTableWrap = document.getElementById('team-table-wrap');
  const inviteForm = document.getElementById('invite-form');
  const inviteBtn = document.getElementById('invite-btn');
  const inviteMsg = document.getElementById('invite-msg');

  async function loadTeam() {
    teamTableWrap.innerHTML = '<p class="empty-state">جارِ التحميل...</p>';
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) {
      teamTableWrap.innerHTML = `<p class="empty-state">حصل خطأ: ${escapeHtml(error.message)}</p>`;
      return;
    }
    const rows = (data || []).map(p => `
      <tr>
        <td>${escapeHtml(p.full_name || p.email)}</td>
        <td style="color:var(--text-muted); font-size:13.5px;">${escapeHtml(p.email)}</td>
        <td><span class="pill ${p.role === 'owner' ? 'pill--owner' : 'pill--editor'}">${p.role === 'owner' ? 'مالك' : 'عضو'}</span></td>
        <td style="color:var(--text-faint); font-size:13px;">${new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
      </tr>
    `).join('');
    teamTableWrap.innerHTML = data && data.length ? `
      <table class="table">
        <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>انضم في</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<p class="empty-state">مفيش أعضاء لسه.</p>';
  }

  inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    inviteBtn.disabled = true;
    inviteMsg.textContent = '';
    inviteMsg.className = 'msg';
    const email = document.getElementById('invite-email').value.trim();
    const full_name = document.getElementById('invite-name').value.trim();
    const { data, error } = await sb.functions.invoke('invite-admin', { body: { email, full_name } });
    inviteBtn.disabled = false;
    if (error || data?.error) {
      inviteMsg.textContent = 'تعذر إرسال الدعوة: ' + (data?.error || error.message);
      inviteMsg.classList.add('msg--error');
      return;
    }
    inviteMsg.textContent = `تم إرسال دعوة إلى ${email} ✅ (هيوصله إيميل لتعيين كلمة مرور)`;
    inviteMsg.classList.add('msg--ok');
    inviteForm.reset();
    loadTeam();
  });

  /* ---------------------------------------------------------------------
     محتوى الموقع
  --------------------------------------------------------------------- */
  const CONTENT_FIELDS = [
    { key: 'hero_name', label: 'الاسم في الصفحة الرئيسية', type: 'input' },
    { key: 'hero_headline', label: 'المسمى الوظيفي (تحت الاسم)', type: 'input' },
    { key: 'hero_intro', label: 'الجملة التعريفية الرئيسية', type: 'textarea' },
    { key: 'hero_support', label: 'الجملة الداعمة تحتها', type: 'textarea' },
    { key: 'about_text_1', label: 'الفقرة الأولى - نبذة عني', type: 'textarea' },
    { key: 'about_text_2', label: 'الفقرة الثانية - نبذة عني', type: 'textarea' },
    { key: 'footer_statement', label: 'جملة الفوتر', type: 'textarea' },
  ];

  const contentFieldsWrap = document.getElementById('content-fields-wrap');

  async function loadContent() {
    contentFieldsWrap.innerHTML = '<p class="empty-state">جارِ التحميل...</p>';
    const { data, error } = await sb.from('site_content').select('*');
    if (error) {
      contentFieldsWrap.innerHTML = `<p class="empty-state">حصل خطأ: ${escapeHtml(error.message)}</p>`;
      return;
    }
    const values = {};
    (data || []).forEach(row => { values[row.key] = row.value; });

    contentFieldsWrap.innerHTML = CONTENT_FIELDS.map(f => `
      <div class="field" style="margin-bottom:20px;">
        <label>${escapeHtml(f.label)}</label>
        ${f.type === 'textarea'
          ? `<textarea rows="3" data-key="${f.key}">${escapeHtml(values[f.key] || '')}</textarea>`
          : `<input type="text" data-key="${f.key}" value="${escapeAttr(values[f.key] || '')}">`}
        <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
          <button class="btn btn--primary btn--sm" data-save="${f.key}">حفظ</button>
          <span class="msg" data-status="${f.key}"></span>
        </div>
      </div>
    `).join('');

    contentFieldsWrap.querySelectorAll('[data-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.save;
        const input = contentFieldsWrap.querySelector(`[data-key="${key}"]`);
        const statusEl = contentFieldsWrap.querySelector(`[data-status="${key}"]`);
        statusEl.textContent = '';
        statusEl.className = 'msg';
        const { error } = await sb.from('site_content').upsert({ key, value: input.value });
        if (error) {
          statusEl.textContent = 'حصل خطأ';
          statusEl.classList.add('msg--error');
        } else {
          statusEl.textContent = 'تم الحفظ ✅';
          statusEl.classList.add('msg--ok');
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     أدوات مساعدة
  --------------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  checkSession();
})();
