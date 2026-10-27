/**
 * 图提取 · 电商图片下载
 * content.js —— 注入「获取图片」按钮 + 扫描页面图片
 * 仅在淘宝 / 京东 / 拼多多商家版的「商品详情页」生效，其他页面不显示按钮。
 */
(() => {
  'use strict';

  // 已经注入过就不再重复注入（防止 SPA 反复执行）
  if (window.__IMAGE_GRAB_INJECTED__) return;
  window.__IMAGE_GRAB_INJECTED__ = true;

  /* ---------------- 1. 商品详情页判定 ---------------- */

  // 三家平台的详情页 URL 特征
  const DETAIL_PATTERNS = [
    /item\.taobao\.com\/item\.htm/i,
    /detail\.tmall\.com\/item\.htm/i,
    /[a-z]+\.tmall\.com\/item\.htm/i,
    /item\.jd\.com\/\d+\.html/i,
    /item\.jd\.hk\/\d+\.html/i,
    /yangkeduo\.com\/goods/i,
    /pinduoduo\.com\/goods/i,
    /pinduoduo\.com\/mall/i,
    /mms\.pinduoduo\.com\/(goods|mall)/i
  ];

  // 兜底：有些详情页做了新域名，用页面里的商品标记辅助判断
  const hasProductMarkup = () =>
    !!document.querySelector('meta[property="og:type"][content="product"], .tb-main-pic, #spec-img, .thumbnails, [class*="gallery"]');

  function isDetailPage() {
    const href = location.href;
    if (DETAIL_PATTERNS.some((re) => re.test(href))) return true;
    return hasProductMarkup() && document.querySelectorAll('img').length >= 5;
  }

  /* ---------------- 2. 悬浮按钮 ---------------- */

  let fab = null;

  function mountButton() {
    if (fab || !isDetailPage()) return;
    if (!document.body) return;

    fab = document.createElement('button');
    fab.id = 'ig-fab';
    fab.type = 'button';
    fab.innerHTML = '<span class="ig-fab__icon">🖼</span><span>获取图片</span>';
    fab.title = '提取本页所有商品图片';
    fab.addEventListener('click', onFabClick);
    document.body.appendChild(fab);
  }

  function unmountButton() {
    if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
    fab = null;
  }

  // 价格条、弹层之类的页面也能动态出现，用定时检查兼顾 SPA 路由切换
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      unmountButton();
    }
    if (isDetailPage()) {
      if (!document.getElementById('ig-fab')) {
        fab = null;
        mountButton();
      }
    } else if (fab) {
      unmountButton();
    }
  }, 1500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton, { once: true });
  } else {
    mountButton();
  }

  /* ---------------- 3. 提示气泡 ---------------- */

  let toastTimer = null;

  function toast(text, isError = false, duration = 3600) {
    let box = document.getElementById('ig-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ig-toast';
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.className = 'is-show' + (isError ? ' is-error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.className = '';
    }, duration);
  }

  /* ---------------- 4. 图片采集 ---------------- */

  const MIN_SIZE = 100; // 小于 100x100 的图视为图标 / 占位图
  const MAX_IMAGES = 300;

  // 明显不是商品图的地址关键字
  const BLOCK_WORDS = [
    'logo', 'icon', 'sprite', 'blank', 'placeholder', 'loading', 'lazyload',
    'avatar', 'qrcode', 'qr_', 'erweima', 'favicon', 'spacer', 'transparent',
    'default_', 'nopic', 'no-pic', 'bg.png', 'bg.jpg'
  ];

  // 命中 50x50 / 80x80 这类缩略图后缀的直接跳过
  const SMALL_SUFFIX = /[_\-@](\d{1,3})x(\d{1,3})\.(jpg|jpeg|png|webp)/i;

  function normalize(raw) {
    if (!raw) return '';
    let url = String(raw).trim().replace(/^["']|["']$/g, '');
    if (!url || url.startsWith('data:') || url.startsWith('chrome-extension:')) return '';
    if (url.startsWith('//')) url = location.protocol + url;
    try {
      const abs = new URL(url, location.href);
      if (!/^https?:$/.test(abs.protocol)) return '';
      return abs.href;
    } catch (e) {
      return '';
    }
  }

  function isBlocked(url) {
    const lower = url.toLowerCase();
    if (BLOCK_WORDS.some((w) => lower.includes(w))) return true;
    const m = lower.match(SMALL_SUFFIX);
    if (m) {
      const w = parseInt(m[1], 10);
      const h = parseInt(m[2], 10);
      if (w < MIN_SIZE || h < MIN_SIZE) return true;
    }
    return false;
  }

  // 从 srcset 里挑最大的一张
  function pickFromSrcset(value) {
    if (!value) return '';
    const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
    let best = '';
    let bestWidth = -1;
    parts.forEach((p) => {
      const seg = p.split(/\s+/);
      const u = seg[0];
      const desc = seg[1] || '';
      let w = 0;
      if (/^\d+w$/.test(desc)) w = parseInt(desc, 10);
      else if (/^\d+(\.\d+)?x$/.test(desc)) w = parseFloat(desc) * 1000;
      if (w > bestWidth) {
        bestWidth = w;
        best = u;
      }
    });
    return best;
  }

  function collect() {
    const map = new Map(); // url -> { url, w, h, from }

    function add(rawUrl, w = 0, h = 0, from = 'img') {
      const url = normalize(rawUrl);
      if (!url) return;
      if (isBlocked(url)) return;
      if (w && h && (w < MIN_SIZE || h < MIN_SIZE)) return;
      if (!map.has(url)) map.set(url, { url, w: w || 0, h: h || 0, from });
    }

    // 4.1 <img>：src / currentSrc / 各种懒加载属性 / srcset
    document.querySelectorAll('img').forEach((img) => {
      const rect = img.getBoundingClientRect();
      const w = img.naturalWidth || rect.width;
      const h = img.naturalHeight || rect.height;
      add(img.currentSrc, w, h);
      add(img.getAttribute('src'), w, h);
      ['data-src', 'data-lazy-src', 'data-lazy-img', 'data-actualsrc', 'data-img-src',
        'data-ks-lazyload', 'data-original', 'data-real-src', 'data-lazy', 'data-url', 'data-img'].forEach((attr) => {
        add(img.getAttribute(attr), w, h);
      });
      add(pickFromSrcset(img.getAttribute('srcset')), w, h);
      add(pickFromSrcset(img.getAttribute('data-srcset')), w, h);
    });

    // 4.2 <picture><source srcset>
    document.querySelectorAll('picture source').forEach((s) => {
      add(pickFromSrcset(s.getAttribute('srcset')), 0, 0, 'source');
      add(pickFromSrcset(s.getAttribute('data-srcset')), 0, 0, 'source');
    });

    // 4.3 背景图 background-image（只看面积够大的元素，避免把整页样式类全扫一遍）
    const candidates = document.querySelectorAll('div, section, li, a, span, figure');
    let scanned = 0;
    for (const el of candidates) {
      if (scanned++ > 4000) break;
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === 'none' || !bg.includes('url(')) continue;
      const found = bg.match(/url\((['"]?)(.*?)\1\)/g) || [];
      found.forEach((item) => {
        const inner = item.replace(/^url\((['"]?)/, '').replace(/(['"]?)\)$/, '');
        add(inner, rect.width, rect.height, 'background');
      });
    }

    // 4.4 页面自带的分享大图 / 主图
    const og = document.querySelector('meta[property="og:image"]');
    if (og) add(og.getAttribute('content'), 0, 0, 'og');

    // 面积大的排前面，商品主图更靠前
    return Array.from(map.values())
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, MAX_IMAGES);
  }

  /* ---------------- 5. 点击事件 ---------------- */

  async function onFabClick() {
    if (!fab) return;
    const label = fab.innerHTML;
    fab.disabled = true;
    fab.innerHTML = '<span class="ig-fab__icon">⏳</span><span>提取中…</span>';

    try {
      // 先把页面滚到底，触发懒加载
      const scrollTop = window.scrollY;
      const step = Math.max(window.innerHeight, 600);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, scrollTop);
      await new Promise((r) => setTimeout(r, 350));

      const images = collect();
      if (!images.length) {
        toast('没有提取到符合条件的图片，请把商品主图滚动到可视区域后重试', true);
        return;
      }

      const res = await chrome.runtime.sendMessage({
        type: 'IG_OPEN_GALLERY',
        images,
        meta: { pageUrl: location.href, pageTitle: document.title, at: Date.now() }
      });

      if (res && res.ok) {
        toast(`已提取 ${images.length} 张图片，即将在新标签页打开`);
      } else {
        toast('打开预览页失败，请重试', true);
      }
    } catch (err) {
      console.error('[图提取] 提取失败：', err);
      toast('提取失败：' + (err && err.message ? err.message : '未知错误'), true);
    } finally {
      if (fab) {
        fab.disabled = false;
        fab.innerHTML = label;
      }
    }
  }
})();
