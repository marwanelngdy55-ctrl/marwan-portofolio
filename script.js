(() => {
  'use strict';

  /* ============ THEME TOGGLE ============ */
  const root = document.body;
  const themeToggle = document.getElementById('theme-toggle');
  const THEME_KEY = 'marwan-portfolio-theme';

  function applyTheme(theme){
    root.setAttribute('data-theme', theme);
  }

  // Default theme is dark. We keep the preference in memory for this session only.
  let currentTheme = 'dark';
  try {
    const stored = window.__portfolioTheme;
    if (stored) currentTheme = stored;
  } catch (e) { /* no-op */ }
  applyTheme(currentTheme);

  themeToggle.addEventListener('click', () => {
    currentTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
    window.__portfolioTheme = currentTheme;
  });

  /* ============ STICKY NAV BACKGROUND ============ */
  const nav = document.getElementById('nav');
  const onScrollNav = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ============ MOBILE MENU ============ */
  const burger = document.getElementById('nav-burger');
  burger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    burger.classList.toggle('is-open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });

  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ============ ACTIVE SECTION INDICATOR ============ */
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const navLinks = Array.from(document.querySelectorAll('.nav__link[data-nav]'));

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = entry.target.getAttribute('id');
      const link = navLinks.find(l => l.getAttribute('href') === `#${id}`);
      if (!link) return;
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('is-active'));
        link.classList.add('is-active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  sections.forEach(sec => sectionObserver.observe(sec));

  /* ============ SCROLL REVEAL ============ */
  const revealEls = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
    revealObserver.observe(el);
  });

  /* ============ ANIMATED COUNTERS ============ */
  function animateCounter(el){
    const target = parseFloat(el.getAttribute('data-count'));
    const suffix = el.getAttribute('data-suffix') || '';
    const duration = 1400;
    const start = performance.now();

    function tick(now){
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      el.textContent = value.toLocaleString('en-US') + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const counterEls = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counterEls.forEach(el => counterObserver.observe(el));

  /* ============ SERP TYPEWRITER ============ */
  const typewriterEl = document.getElementById('serp-typewriter');
  const typewriterText = 'متخصص SEO بخبرة تتجاوز 5 سنوات في تنمية النمو العضوي لمتاجر إلكترونية في السعودية ومصر.';

  function typeWriter(el, text, speed = 28){
    let i = 0;
    el.textContent = '';
    function step(){
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(step, speed);
      }
    }
    step();
  }

  const heroVisual = document.querySelector('.hero__visual');
  if (typewriterEl && heroVisual) {
    const typeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          typeWriter(typewriterEl, typewriterText);
          typeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    typeObserver.observe(heroVisual);
  }

  /* ============ CONTACT FORM (no backend) ============ */
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.querySelector('#name').value.trim();

      if (!form.checkValidity()) {
        status.textContent = 'من فضلك املأ كل الحقول قبل الإرسال.';
        status.style.color = 'var(--danger)';
        return;
      }

      status.style.color = 'var(--accent)';
      status.textContent = `شكرًا${name ? ' ' + name.split(' ')[0] : ''} — تم تجهيز رسالتك. اربط الفورم بخدمة إرسال بريد لإتمام الإرسال فعليًا.`;
      form.reset();
    });
  }

  /* ============ SET FOOTER YEAR ============ */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ============ SCROLL PROGRESS BAR ============ */
  const progressBar = document.getElementById('scroll-progress');
  if (progressBar) {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = pct + '%';
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }

  /* ============ 3D TILT (SERP card + project cards) ============ */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function attachTilt(el, strength = 10){
    if (!el || prefersReducedMotion) return;
    let frame = null;

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.transform = `perspective(1000px) rotateY(${x * strength}deg) rotateX(${-y * strength}deg) translateY(-4px)`;
      });
    });

    el.addEventListener('mouseleave', () => {
      if (frame) cancelAnimationFrame(frame);
      el.style.transform = '';
    });
  }

  attachTilt(document.querySelector('[data-tilt]'), 8);
  document.querySelectorAll('[data-tilt-card]').forEach(card => attachTilt(card, 6));

  /* ============ MAGNETIC BUTTONS ============ */
  if (!prefersReducedMotion) {
    document.querySelectorAll('.btn').forEach(btn => {
      let frame = null;
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = (e.clientX - rect.left) - rect.width / 2;
        const y = (e.clientY - rect.top) - rect.height / 2;
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          btn.style.transform = `translate(${x * 0.18}px, ${y * 0.35}px)`;
        });
      });
      btn.addEventListener('mouseleave', () => {
        if (frame) cancelAnimationFrame(frame);
        btn.style.transform = '';
      });
    });
  }

})();
