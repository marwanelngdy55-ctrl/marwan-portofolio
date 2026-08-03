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
    account: document.getElementById('view-account'),
  };
  const navButtons = document.querySelectorAll('.sidebar-nav button[data-view]');

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
    navButtons.forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
    sidebarNav.classList.remove('is-open');
    if (name === 'articles') loadArticles();
    if (name === 'team') loadTeam();
    if (name === 'content') { loadContent(); loadContentImages(); }
    if (name === 'account') loadAccount();
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
      const accountEmailEl = document.getElementById('account-email');
      if (accountEmailEl) accountEmailEl.value = session.user.email;
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
  const contentEditor = document.getElementById('article-content');
  const coverFileInput = document.getElementById('cover-file');
  const coverPreview = document.getElementById('cover-preview');
  const coverAltInput = document.getElementById('cover-alt');
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
    contentEditor.innerHTML = '';
    coverAltInput.value = '';
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
        contentEditor.innerHTML = data.content || '';
        coverAltInput.value = data.cover_image_alt || '';
        currentCoverUrl = data.cover_image_url || null;
        if (currentCoverUrl) coverPreview.innerHTML = `<img src="${escapeAttr(currentCoverUrl)}" alt="${escapeAttr(data.cover_image_alt || '')}">`;
        slugManuallyEdited = true;
      }
    } else {
      editorTitleEl.textContent = 'مقال جديد';
    }
    showView('editor');
  }

  /* ----- محرر المحتوى الغني (WYSIWYG) — من غير كود، بس أزرار عادية ----- */
  const blockFormatSelect = document.getElementById('block-format');

  function focusEditor() { contentEditor.focus(); }

  document.querySelectorAll('#editor-toolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      focusEditor();
      document.execCommand(btn.dataset.cmd, false, null);
    });
  });

  blockFormatSelect?.addEventListener('change', () => {
    focusEditor();
    document.execCommand('formatBlock', false, `<${blockFormatSelect.value}>`);
  });

  document.getElementById('link-btn')?.addEventListener('click', () => {
    const url = prompt('حط رابط الصفحة (لازم يبدأ بـ https://):', 'https://');
    if (!url) return;
    focusEditor();
    document.execCommand('createLink', false, url);
  });

  document.getElementById('image-btn')?.addEventListener('click', () => {
    document.getElementById('inline-image-input')?.remove();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.id = 'inline-image-input';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const altText = prompt('اكتب Alt text يوصف الصورة (مهم لمحركات البحث وذوي الإعاقة البصرية):', '') || '';
      const path = `${Date.now()}-${slugify(file.name)}`;
      const { error: uploadError } = await sb.storage.from('article-images').upload(path, file, { upsert: true });
      if (uploadError) {
        alert('فشل رفع الصورة: ' + uploadError.message);
        return;
      }
      const { data } = sb.storage.from('article-images').getPublicUrl(path);
      focusEditor();
      document.execCommand('insertHTML', false, `<img src="${escapeAttr(data.publicUrl)}" alt="${escapeAttr(altText)}">`);
      input.remove();
    });
    input.click();
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
    coverPreview.innerHTML = `<img src="${escapeAttr(currentCoverUrl)}" alt="${escapeAttr(coverAltInput.value || '')}">`;
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
      content: contentEditor.innerHTML,
      cover_image_url: currentCoverUrl,
      cover_image_alt: coverAltInput.value.trim(),
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
  const invitePasswordInput = document.getElementById('invite-password');
  const genPwBtn = document.getElementById('gen-pw-btn');

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
    let pw = '';
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
  }
  genPwBtn?.addEventListener('click', () => {
    invitePasswordInput.value = generatePassword();
    invitePasswordInput.type = 'text';
  });

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
    const password = invitePasswordInput.value;
    if (!password || password.length < 6) {
      inviteMsg.textContent = 'كلمة المرور لازم تكون 6 حروف/أرقام على الأقل.';
      inviteMsg.classList.add('msg--error');
      inviteBtn.disabled = false;
      return;
    }
    const { data, error } = await sb.functions.invoke('invite-admin', { body: { email, full_name, password } });
    inviteBtn.disabled = false;
    if (error || data?.error) {
      inviteMsg.textContent = 'تعذر إضافة العضو: ' + (data?.error || error.message);
      inviteMsg.classList.add('msg--error');
      return;
    }
    inviteMsg.textContent = `تم إضافة ${email} ✅ — ابعتله الإيميل وكلمة المرور اللي حطيتها عشان يدخل.`;
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
    { key: 'process_eyebrow', label: 'عنوان صغير - قسم منهجية العمل', type: 'input' },
    { key: 'process_title', label: 'عنوان - قسم منهجية العمل', type: 'input' },
    { key: 'process_subtitle', label: 'وصف - قسم منهجية العمل', type: 'textarea' },
    { key: 'skills_eyebrow', label: 'عنوان صغير - قسم المهارات', type: 'input' },
    { key: 'skills_title', label: 'عنوان - قسم المهارات', type: 'input' },
    { key: 'skills_subtitle', label: 'وصف - قسم المهارات', type: 'textarea' },
    { key: 'services_eyebrow', label: 'عنوان صغير - قسم الخدمات', type: 'input' },
    { key: 'services_title', label: 'عنوان - قسم الخدمات', type: 'input' },
    { key: 'services_subtitle', label: 'وصف - قسم الخدمات', type: 'textarea' },
    { key: 'projects_eyebrow', label: 'عنوان صغير - قسم المشاريع', type: 'input' },
    { key: 'projects_title', label: 'عنوان - قسم المشاريع', type: 'input' },
    { key: 'projects_subtitle', label: 'وصف - قسم المشاريع', type: 'textarea' },
    { key: 'results_eyebrow', label: 'عنوان صغير - قسم النتائج', type: 'input' },
    { key: 'results_title', label: 'عنوان - قسم النتائج', type: 'input' },
    { key: 'results_subtitle', label: 'وصف - قسم النتائج', type: 'textarea' },
    { key: 'contact_eyebrow', label: 'عنوان صغير - قسم التواصل', type: 'input' },
    { key: 'contact_title', label: 'عنوان - قسم التواصل', type: 'input' },
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
     صور الموقع (زي صورة نبذة عني) — رفع وتعديل مباشر من اللوحة
  --------------------------------------------------------------------- */
  const CONTENT_IMAGES = [
    { key: 'about_photo', label: 'صورة قسم "نبذة عني"', altKey: 'about_photo_alt' },
  ];
  const contentImagesWrap = document.getElementById('content-images-wrap');

  async function loadContentImages() {
    if (!contentImagesWrap) return;
    contentImagesWrap.innerHTML = '<p class="empty-state">جارِ التحميل...</p>';
    const { data, error } = await sb.from('site_content').select('*');
    if (error) {
      contentImagesWrap.innerHTML = `<p class="empty-state">حصل خطأ: ${escapeHtml(error.message)}</p>`;
      return;
    }
    const values = {};
    (data || []).forEach(row => { values[row.key] = row.value; });

    contentImagesWrap.innerHTML = CONTENT_IMAGES.map(img => `
      <div class="content-image-field">
        <div class="content-image-preview" id="preview-${img.key}">
          ${values[img.key] ? `<img src="${escapeAttr(values[img.key])}" alt="">` : 'بدون صورة'}
        </div>
        <div class="content-image-body">
          <label style="display:block; font-size:13px; color:var(--text-muted); margin-bottom:7px;">${escapeHtml(img.label)}</label>
          <input type="file" accept="image/*" data-upload="${img.key}" style="margin-bottom:10px;">
          <div class="field">
            <label>Alt text (وصف الصورة)</label>
            <input type="text" data-alt="${img.altKey}" value="${escapeAttr(values[img.altKey] || '')}" placeholder="مثال: صورة شخصية لمروان الأنجدي">
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <button class="btn btn--primary btn--sm" data-save-img="${img.key}" data-alt-key="${img.altKey}">حفظ</button>
            <span class="msg" data-img-status="${img.key}"></span>
          </div>
        </div>
      </div>
    `).join('');

    let pendingUrls = {};
    contentImagesWrap.querySelectorAll('[data-upload]').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.upload;
        const file = input.files[0];
        if (!file) return;
        const preview = document.getElementById(`preview-${key}`);
        preview.innerHTML = 'جارِ الرفع...';
        const path = `${key}-${Date.now()}-${slugify(file.name)}`;
        const { error: uploadError } = await sb.storage.from('site-images').upload(path, file, { upsert: true });
        if (uploadError) {
          preview.innerHTML = 'فشل الرفع';
          return;
        }
        const { data: urlData } = sb.storage.from('site-images').getPublicUrl(path);
        pendingUrls[key] = urlData.publicUrl;
        preview.innerHTML = `<img src="${escapeAttr(urlData.publicUrl)}" alt="">`;
      });
    });

    contentImagesWrap.querySelectorAll('[data-save-img]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.saveImg;
        const altKey = btn.dataset.altKey;
        const statusEl = contentImagesWrap.querySelector(`[data-img-status="${key}"]`);
        const altInput = contentImagesWrap.querySelector(`[data-alt="${altKey}"]`);
        statusEl.textContent = '';
        statusEl.className = 'msg';
        const rows = [{ key: altKey, value: altInput.value }];
        if (pendingUrls[key]) rows.push({ key, value: pendingUrls[key] });
        const { error } = await sb.from('site_content').upsert(rows);
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
     حسابي — تغيير كلمة المرور
  --------------------------------------------------------------------- */
  const changePasswordBtn = document.getElementById('change-password-btn');
  const accountMsg = document.getElementById('account-msg');

  async function loadAccount() {
    const { data: { session } } = await sb.auth.getSession();
    const accountEmailEl = document.getElementById('account-email');
    if (accountEmailEl && session) accountEmailEl.value = session.user.email;
  }

  changePasswordBtn?.addEventListener('click', async () => {
    accountMsg.textContent = '';
    accountMsg.className = 'msg';
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('new-password-confirm').value;
    if (!newPassword || newPassword.length < 6) {
      accountMsg.textContent = 'كلمة المرور لازم تكون 6 حروف/أرقام على الأقل.';
      accountMsg.classList.add('msg--error');
      return;
    }
    if (newPassword !== confirmPassword) {
      accountMsg.textContent = 'كلمة المرور والتأكيد مش متطابقين.';
      accountMsg.classList.add('msg--error');
      return;
    }
    changePasswordBtn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: newPassword });
    changePasswordBtn.disabled = false;
    if (error) {
      accountMsg.textContent = 'تعذر تحديث كلمة المرور: ' + error.message;
      accountMsg.classList.add('msg--error');
      return;
    }
    accountMsg.textContent = 'تم تحديث كلمة المرور بنجاح ✅';
    accountMsg.classList.add('msg--ok');
    document.getElementById('new-password').value = '';
    document.getElementById('new-password-confirm').value = '';
  });

  /* ---------------------------------------------------------------------
     أدوات مساعدة
  --------------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  checkSession();
})();
