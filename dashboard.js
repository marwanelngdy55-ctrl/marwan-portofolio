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
  const teamNavBtn = document.querySelector('.sidebar-nav button[data-view="team"]');

  /* ---------------------------------------------------------------------
     الصلاحيات (Roles & Permissions)
     currentProfile: صف المستخدم الحالي من جدول profiles (الدور، الاسم، إلخ)
  --------------------------------------------------------------------- */
  let currentProfile = null;
  function isOwner() { return currentProfile?.role === 'owner'; }

  function showView(name) {
    // "الفريق" للمدير بس — أي محاولة وصول من عضو عادي بترجع لصفحة المقالات
    if (name === 'team' && !isOwner()) name = 'articles';
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
      const { data: profile, error: profileErr } = await sb
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      // لو الحساب موقوف (is_active = false)، منعه من الدخول حتى لو الجلسة صالحة
      if (profileErr || !profile || profile.is_active === false) {
        await sb.auth.signOut();
        loginScreen.classList.remove('hidden');
        app.classList.add('hidden');
        loginMsg.textContent = 'حسابك موقوف حاليًا. تواصل مع المدير.';
        loginMsg.classList.add('msg--error');
        return;
      }

      currentProfile = profile;
      loginScreen.classList.add('hidden');
      app.classList.remove('hidden');
      currentUserEmailEl.textContent = session.user.email;
      teamNavBtn?.classList.toggle('hidden', !isOwner());
      const accountEmailEl = document.getElementById('account-email');
      if (accountEmailEl) accountEmailEl.value = session.user.email;
      showView('articles');
    } else {
      currentProfile = null;
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
  const coverTitleInput = document.getElementById('cover-title');
  const editorMsg = document.getElementById('editor-msg');
  const saveDraftBtn = document.getElementById('save-draft-btn');
  const publishBtn = document.getElementById('publish-btn');
  const deleteArticleBtn = document.getElementById('delete-article-btn');

  let currentArticleId = null;
  let currentCoverUrl = null;
  let currentAuthorId = null;
  let currentAuthorName = '';
  let slugManuallyEdited = false;
  const showAuthorCheck = document.getElementById('show-author-check');
  const showDateCheck = document.getElementById('show-date-check');
  const editorAuthorNameEl = document.getElementById('editor-author-name');

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
    // العضو "العادي" يشوف مقالاته هو بس في اللوحة. المدير بس اللي يشوف مقالات الكل.
    let articlesQuery = sb.from('articles').select('*').order('created_at', { ascending: false });
    if (!isOwner() && currentProfile?.id) articlesQuery = articlesQuery.eq('author_id', currentProfile.id);
    const { data, error } = await articlesQuery;
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
        <td style="color:var(--text-muted); font-size:13.5px;">${escapeHtml(a.author_name || '—')}</td>
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
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>العنوان</th><th>الكاتب</th><th>الحالة</th><th>تاريخ الإنشاء</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
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
    currentAuthorId = null;
    currentAuthorName = '';
    slugManuallyEdited = false;
    editorMsg.textContent = '';
    titleInput.value = '';
    slugInput.value = '';
    excerptInput.value = '';
    contentEditor.innerHTML = '';
    coverAltInput.value = '';
    coverTitleInput.value = '';
    coverPreview.innerHTML = 'بدون صورة';
    if (showAuthorCheck) showAuthorCheck.checked = true;
    if (showDateCheck) showDateCheck.checked = true;
    if (editorAuthorNameEl) editorAuthorNameEl.textContent = '';
    deleteArticleBtn.classList.toggle('hidden', !articleId);

    if (articleId) {
      editorTitleEl.textContent = 'تعديل مقال';
      const { data, error } = await sb.from('articles').select('*').eq('id', articleId).single();
      if (error || !data) {
        editorMsg.textContent = 'تعذر تحميل المقال.';
        editorMsg.classList.add('msg--error');
      } else if (!isOwner() && data.author_id !== currentProfile?.id) {
        // حماية إضافية في الواجهة: عضو عادي مينفعش يفتح مقال عضو تاني حتى لو كان منشور
        alert('مينفعش تفتح أو تعدّل مقال عضو تاني.');
        showView('articles');
        return;
      } else {
        titleInput.value = data.title || '';
        slugInput.value = data.slug || '';
        excerptInput.value = data.excerpt || '';
        contentEditor.innerHTML = data.content || '';
        coverAltInput.value = data.cover_image_alt || '';
        coverTitleInput.value = data.cover_image_title || '';
        currentCoverUrl = data.cover_image_url || null;
        currentAuthorId = data.author_id || null;
        currentAuthorName = data.author_name || '';
        if (showAuthorCheck) showAuthorCheck.checked = data.show_author !== false;
        if (showDateCheck) showDateCheck.checked = data.show_date !== false;
        if (editorAuthorNameEl) editorAuthorNameEl.textContent = currentAuthorName ? `الكاتب: ${currentAuthorName}` : '';
        if (currentCoverUrl) coverPreview.innerHTML = `<img src="${escapeAttr(currentCoverUrl)}" alt="${escapeAttr(data.cover_image_alt || '')}" title="${escapeAttr(data.cover_image_title || '')}">`;
        slugManuallyEdited = true;
      }
    } else {
      editorTitleEl.textContent = 'مقال جديد';
      currentAuthorName = currentProfile?.full_name || currentProfile?.email || '';
      if (editorAuthorNameEl) editorAuthorNameEl.textContent = currentAuthorName ? `الكاتب: ${currentAuthorName}` : '';
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

  /* ----- نافذة إدخال Alt text و Title (بديل عن prompt() اللي ممكن ميشتغلش صح على كل المتصفحات/الموبايل) ----- */
  const altTextModal = document.getElementById('alt-text-modal');
  const altTextModalInput = document.getElementById('alt-text-modal-input');
  const titleTextModalInput = document.getElementById('title-text-modal-input');
  const altTextModalConfirm = document.getElementById('alt-text-modal-confirm');
  const altTextModalCancel = document.getElementById('alt-text-modal-cancel');

  function askForImageMeta() {
    return new Promise((resolve) => {
      if (!altTextModal) { resolve(null); return; }
      altTextModalInput.value = '';
      if (titleTextModalInput) titleTextModalInput.value = '';
      altTextModal.classList.remove('hidden');
      setTimeout(() => altTextModalInput.focus(), 30);

      function cleanup(result) {
        altTextModal.classList.add('hidden');
        altTextModalConfirm.removeEventListener('click', onConfirm);
        altTextModalCancel.removeEventListener('click', onCancel);
        altTextModal.removeEventListener('click', onOverlayClick);
        altTextModalInput.removeEventListener('keydown', onKeydown);
        titleTextModalInput?.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onConfirm() {
        cleanup({
          alt: altTextModalInput.value.trim(),
          title: titleTextModalInput ? titleTextModalInput.value.trim() : '',
        });
      }
      function onCancel() { cleanup(null); }
      function onOverlayClick(e) { if (e.target === altTextModal) onCancel(); }
      function onKeydown(e) {
        if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }
      altTextModalConfirm.addEventListener('click', onConfirm);
      altTextModalCancel.addEventListener('click', onCancel);
      altTextModal.addEventListener('click', onOverlayClick);
      altTextModalInput.addEventListener('keydown', onKeydown);
      titleTextModalInput?.addEventListener('keydown', onKeydown);
    });
  }

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
      const meta = await askForImageMeta();
      if (meta === null) { input.remove(); return; } // المستخدم لغى
      const path = `${Date.now()}-${slugify(file.name)}`;
      const { error: uploadError } = await sb.storage.from('article-images').upload(path, file, { upsert: true });
      if (uploadError) {
        alert('فشل رفع الصورة: ' + uploadError.message);
        input.remove();
        return;
      }
      const { data } = sb.storage.from('article-images').getPublicUrl(path);
      focusEditor();
      const titleAttr = meta.title ? ` title="${escapeAttr(meta.title)}"` : '';
      document.execCommand('insertHTML', false, `<img src="${escapeAttr(data.publicUrl)}" alt="${escapeAttr(meta.alt)}"${titleAttr}>`);
      input.remove();
    });
    input.click();
  });

  /* ----- تكبير/تصغير حجم الخط للنص المحدد ----- */
  const FONT_SIZE_MIN = 11, FONT_SIZE_MAX = 36;

  function applyFontSizeStep(direction) {
    focusEditor();
    // execCommand('fontSize') بيحط <font size="7">، وبعدين بنستبدلها بـ span بحجم px حقيقي
    // بنحسب الحجم الحالي المعروض عشان الزرار يشتغل صح حتى لو النص متكبر/متصغر قبل كده
    document.execCommand('fontSize', false, '7');
    contentEditor.querySelectorAll('font[size="7"]').forEach(fontEl => {
      const currentPx = parseFloat(window.getComputedStyle(fontEl).fontSize) || 17;
      let newPx = Math.round(currentPx * (direction > 0 ? 1.15 : 0.87));
      newPx = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, newPx));
      const span = document.createElement('span');
      span.style.fontSize = newPx + 'px';
      span.innerHTML = fontEl.innerHTML;
      fontEl.replaceWith(span);
    });
  }

  document.getElementById('font-size-up-btn')?.addEventListener('click', () => applyFontSizeStep(1));
  document.getElementById('font-size-down-btn')?.addEventListener('click', () => applyFontSizeStep(-1));

  /* ----- اختيار حجم خط محدد من القائمة (12، 14، 16...) ----- */
  function applyFontSizeExact(px) {
    focusEditor();
    document.execCommand('fontSize', false, '7');
    contentEditor.querySelectorAll('font[size="7"]').forEach(fontEl => {
      const span = document.createElement('span');
      span.style.fontSize = px + 'px';
      span.innerHTML = fontEl.innerHTML;
      fontEl.replaceWith(span);
    });
  }

  const fontSizeSelect = document.getElementById('font-size-select');
  fontSizeSelect?.addEventListener('change', () => {
    const px = parseInt(fontSizeSelect.value, 10);
    if (px) applyFontSizeExact(px);
    fontSizeSelect.value = ''; // يرجع للقيمة الافتراضية عشان يقدر يختار نفس الحجم تاني لنص تاني
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
    coverPreview.innerHTML = `<img src="${escapeAttr(currentCoverUrl)}" alt="${escapeAttr(coverAltInput.value || '')}" title="${escapeAttr(coverTitleInput.value || '')}">`;
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
    // مقال جديد: الكاتب هو المستخدم الحالي. مقال موجود: نحافظ على الكاتب الأصلي
    // (عشان لو المدير فتح مقال عضو تاني للتعديل، ميتغيرش الكاتب المسجل)
    const authorId = currentArticleId ? currentAuthorId : (session?.user?.id || null);
    const authorName = currentArticleId
      ? (currentAuthorName || '')
      : (currentProfile?.full_name || currentProfile?.email || session?.user?.email || '');
    const payload = {
      title,
      slug,
      excerpt: excerptInput.value.trim(),
      content: contentEditor.innerHTML,
      cover_image_url: currentCoverUrl,
      cover_image_alt: coverAltInput.value.trim(),
      cover_image_title: coverTitleInput.value.trim(),
      status,
      author_id: authorId,
      author_name: authorName,
      show_author: showAuthorCheck ? showAuthorCheck.checked : true,
      show_date: showDateCheck ? showDateCheck.checked : true,
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
    if (!isOwner()) {
      teamTableWrap.innerHTML = '<p class="empty-state">الصفحة دي للمدير فقط.</p>';
      return;
    }
    teamTableWrap.innerHTML = '<p class="empty-state">جارِ التحميل...</p>';
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) {
      teamTableWrap.innerHTML = `<p class="empty-state">حصل خطأ: ${escapeHtml(error.message)}</p>`;
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    const myId = session?.user?.id;

    const rows = (data || []).map(p => {
      const isSelf = p.id === myId;
      const roleControl = isSelf
        ? `<span class="pill ${p.role === 'owner' ? 'pill--owner' : 'pill--editor'}">${p.role === 'owner' ? 'مدير' : 'عضو'}</span>`
        : `<select class="role-select" data-role-for="${p.id}">
             <option value="editor" ${p.role !== 'owner' ? 'selected' : ''}>عضو</option>
             <option value="owner" ${p.role === 'owner' ? 'selected' : ''}>مدير</option>
           </select>`;
      const statusControl = isSelf
        ? `<span class="status-dot status-dot--active"></span>نشط (أنت)`
        : `<button class="btn btn--ghost btn--sm" data-toggle-active="${p.id}" data-current-active="${p.is_active !== false}">
             <span class="status-dot ${p.is_active !== false ? 'status-dot--active' : 'status-dot--inactive'}"></span>
             ${p.is_active !== false ? 'نشط — إيقاف' : 'موقوف — تفعيل'}
           </button>`;
      return `
      <tr>
        <td>${escapeHtml(p.full_name || p.email)}</td>
        <td style="color:var(--text-muted); font-size:13.5px;">${escapeHtml(p.email)}</td>
        <td>${roleControl}</td>
        <td>${statusControl}</td>
        <td style="color:var(--text-faint); font-size:13px;">${new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
      </tr>`;
    }).join('');
    teamTableWrap.innerHTML = data && data.length ? `
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الصلاحية</th><th>الحالة</th><th>انضم في</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="help-text" style="margin-top:12px;">غيّر الصلاحية أو الحالة فورًا بيتحفظ. مينفعش توقف أو تشيل صلاحية آخر مدير نشط في النظام.</p>`
      : '<p class="empty-state">مفيش أعضاء لسه.</p>';

    teamTableWrap.querySelectorAll('[data-role-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const id = select.dataset.roleFor;
        const { error: updateError } = await sb.from('profiles').update({ role: select.value }).eq('id', id);
        if (updateError) {
          alert('تعذر تغيير الصلاحية: ' + updateError.message);
          loadTeam();
          return;
        }
        loadTeam();
      });
    });

    teamTableWrap.querySelectorAll('[data-toggle-active]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.toggleActive;
        const currentlyActive = btn.dataset.currentActive === 'true';
        const { error: updateError } = await sb.from('profiles').update({ is_active: !currentlyActive }).eq('id', id);
        if (updateError) {
          alert('تعذر تحديث الحالة: ' + updateError.message);
          return;
        }
        loadTeam();
      });
    });
  }

  inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isOwner()) {
      inviteMsg.textContent = 'إضافة الأعضاء وتحديد صلاحياتهم للمدير فقط.';
      inviteMsg.classList.add('msg--error');
      return;
    }
    inviteBtn.disabled = true;
    inviteMsg.textContent = '';
    inviteMsg.className = 'msg';
    const email = document.getElementById('invite-email').value.trim();
    const full_name = document.getElementById('invite-name').value.trim();
    const role = document.getElementById('invite-role')?.value === 'owner' ? 'owner' : 'editor';
    const password = invitePasswordInput.value;
    if (!password || password.length < 6) {
      inviteMsg.textContent = 'كلمة المرور لازم تكون 6 حروف/أرقام على الأقل.';
      inviteMsg.classList.add('msg--error');
      inviteBtn.disabled = false;
      return;
    }
    const { data, error } = await sb.functions.invoke('invite-admin', { body: { email, full_name, password, role } });
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
    { key: 'about_photo', label: 'صورة قسم "نبذة عني"', altKey: 'about_photo_alt', titleKey: 'about_photo_title' },
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
            <input type="text" data-alt="${img.altKey}" value="${escapeAttr(values[img.altKey] || '')}" placeholder="مثال: صورة شخصية لمروان النجدي">
          </div>
          <div class="field">
            <label>Title (يظهر كتلميح عند تمرير الماوس، اختياري)</label>
            <input type="text" data-title="${img.titleKey}" value="${escapeAttr(values[img.titleKey] || '')}" placeholder="مثال: مروان النجدي - متخصص SEO">
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <button class="btn btn--primary btn--sm" data-save-img="${img.key}" data-alt-key="${img.altKey}" data-title-key="${img.titleKey}">حفظ</button>
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
        const titleKey = btn.dataset.titleKey;
        const statusEl = contentImagesWrap.querySelector(`[data-img-status="${key}"]`);
        const altInput = contentImagesWrap.querySelector(`[data-alt="${altKey}"]`);
        const titleInputEl = titleKey ? contentImagesWrap.querySelector(`[data-title="${titleKey}"]`) : null;
        statusEl.textContent = '';
        statusEl.className = 'msg';
        const rows = [{ key: altKey, value: altInput.value }];
        if (titleKey && titleInputEl) rows.push({ key: titleKey, value: titleInputEl.value });
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
