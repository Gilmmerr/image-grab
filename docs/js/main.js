/**
 * 图提取 ImageGrab · 官网交互
 * 1. 导航栏滚动吸顶阴影
 * 2. 移动端汉堡菜单
 * 3. 滚动进入视口淡入（IntersectionObserver）
 * 4. 滚动监听导航高亮
 */
(() => {
  'use strict';

  const navbar = document.getElementById('navbar');
  const nav = document.getElementById('nav');
  const hamburger = document.getElementById('hamburger');

  /* ---------- 1. 滚动阴影 ---------- */
  const onScroll = () => {
    navbar.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 2. 移动端菜单 ---------- */
  hamburger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    hamburger.classList.toggle('is-open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  });

  // 点击导航项后收起菜单
  nav.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      nav.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- 3. 滚动淡入 ---------- */
  const reveals = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 3, 2) * 70}ms`;
      io.observe(el);
    });
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- 4. 导航高亮 ---------- */
  const links = Array.from(nav.querySelectorAll('.nav__link[href^="#"]'));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = '#' + entry.target.id;
          links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === id));
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );
    sections.forEach((s) => spy.observe(s));
  }
})();
