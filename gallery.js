/**
 * 图提取 · 电商图片下载
 * gallery.js —— 网格展示、勾选、批量转 PNG 下载
 */
(() => {
  'use strict';

  const STORE_KEY = 'igImages';
  const META_KEY = 'igMeta';
  const store = chrome.storage.session || chrome.storage.local;

  const $ = (id) => document.getElementById(id);
  const gridEl = $('grid');
  const emptyEl = $('empty');
  const metaEl = $('meta');
  const selCountEl = $('selCount');
  const totalCountEl = $('totalCount');
  const downloadBtn = $('btnDownload');
  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  const progressText = $('progressText');

  let images = [];
  const selected = new Set(); // 已选中的索引
  let busy = false;

  /* ---------------- 工具函数 ---------------- */

  function toast(text, duration = 2600) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-show'), duration);
  }

  function pad(n, len = 3) {
    return String(n).padStart(len, '0');
  }

  function setProgress(done, total, label) {
    if (!total) return;
    progressWrap.hidden = false;
    const pct = Math.round((done / total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = label || `下载中 ${done}/${total}（${pct}%）`;
  }

  function hideProgress(delay = 1200) {
    setTimeout(() => {
      progressWrap.hidden = true;
      progressFill.style.width = '0';
    }, delay);
  }

  /* ---------------- 读取数据并渲染 ---------------- */

  async function load() {
    const data = await store.get([STORE_KEY, META_KEY]);
    images = Array.isArray(data[STORE_KEY]) ? data[STORE_KEY] : [];
    const meta = data[META_KEY] || {};

    totalCountEl.textContent = images.length;
    if (meta.pageTitle) {
      metaEl.textContent = `${meta.pageTitle} · 共 ${images.length} 张`;
      metaEl.title = meta.pageUrl || '';
    } else {
      metaEl.textContent = images.length ? `共 ${images.length} 张` : '暂无数据';
    }

    if (!images.length) {
      emptyEl.hidden = false;
      gridEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    gridEl.hidden = false;
    render();
  }

  function render() {
    const frag = document.createDocumentFragment();

    images.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.index = String(index);
      card.style.animation = `fadeIn .28s ease ${Math.min(index * 18, 400)}ms both`;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'card__check';
      check.checked = selected.has(index);
      check.title = '勾选后参与批量下载';
      check.addEventListener('change', () => {
        if (check.checked) selected.add(index);
        else selected.delete(index);
        card.classList.toggle('is-selected', check.checked);
        syncToolbar();
      });

      const img = document.createElement('img');
      img.className = 'card__thumb';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = item.url;
      img.alt = `商品图 ${index + 1}`;
      img.addEventListener('error', () => {
        img.style.opacity = '.25';
        img.alt = '图片加载失败（可能有防盗链）';
      });

      const zoom = document.createElement('button');
      zoom.type = 'button';
      zoom.className = 'card__zoom';
      zoom.textContent = '⤢';
      zoom.title = '新标签页查看原图';
      zoom.addEventListener('click', () => chrome.tabs.create({ url: item.url }));

      const foot = document.createElement('div');
      foot.className = 'card__foot';
      const sizeText = item.w && item.h ? `${Math.round(item.w)}×${Math.round(item.h)}` : '尺寸未知';
      foot.innerHTML = `<span>#${pad(index + 1)}</span><span>${sizeText}</span><span class="card__state"></span>`;

      card.append(check, zoom, img, foot);
      frag.appendChild(card);
    });

    gridEl.innerHTML = '';
    gridEl.appendChild(frag);
    syncToolbar();
  }

  function syncToolbar() {
    selCountEl.textContent = selected.size;
    downloadBtn.disabled = selected.size === 0 || busy;
  }

  /* ---------------- 转 PNG 并下载 ---------------- */

  async function toPngBlob(url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();

    // 已经是 png 也走一遍 canvas，顺便去掉透明通道问题
    const bitmap = await createImageBitmap(blob);

    let pngBlob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('转码失败'))), 'image/png');
      });
    }

    if (bitmap.close) bitmap.close();
    return pngBlob;
  }

  async function downloadOne(index) {
    const item = images[index];
    const pngBlob = await toPngBlob(item.url);
    const blobUrl = URL.createObjectURL(pngBlob);
    try {
      await chrome.downloads.download({
        url: blobUrl,
        filename: `商品图_${pad(index + 1)}.png`,
        conflictAction: 'uniquify',
        saveAs: false
      });
    } finally {
      // 交给下载器读取后再释放
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }
  }

  async function downloadSelected() {
    if (!images.length || selected.size === 0 || busy) return;

    busy = true;
    syncToolbar();

    const list = Array.from(selected).sort((a, b) => a - b);
    let done = 0;
    let failed = 0;

    document.querySelectorAll('.card__state').forEach((el) => {
      el.textContent = '';
      el.className = 'card__state';
    });

    for (const index of list) {
      const card = gridEl.querySelector(`.card[data-index="${index}"]`);
      const stateEl = card ? card.querySelector('.card__state') : null;
      if (stateEl) {
        stateEl.textContent = '处理中…';
        stateEl.className = 'card__state';
      }
      try {
        await downloadOne(index);
        done += 1;
        if (stateEl) {
          stateEl.textContent = '已下载';
          stateEl.className = 'card__state is-ok';
        }
      } catch (err) {
        failed += 1;
        console.warn('[图提取] 下载失败：', images[index].url, err);
        if (stateEl) {
          stateEl.textContent = '失败';
          stateEl.className = 'card__state is-fail';
          stateEl.title = err && err.message ? err.message : '下载失败';
        }
      }
      setProgress(done + failed, list.length, `下载中 ${done + failed}/${list.length}（成功 ${done}）`);
      // 稍微间隔，避免同时开太多请求被 CDN 拦
      await new Promise((r) => setTimeout(r, 120));
    }

    busy = false;
    syncToolbar();
    progressText.textContent = `完成：成功 ${done} 张${failed ? `，失败 ${failed} 张` : ''}`;
    hideProgress(2200);
    toast(failed ? `下载完成：成功 ${done} 张，失败 ${failed} 张` : `已下载 ${done} 张 PNG 图片`);
  }

  /* ---------------- 事件绑定 ---------------- */

  $('btnAll').addEventListener('click', () => {
    images.forEach((_, i) => selected.add(i));
    gridEl.querySelectorAll('.card').forEach((card) => {
      card.classList.add('is-selected');
      const c = card.querySelector('.card__check');
      if (c) c.checked = true;
    });
    syncToolbar();
  });

  $('btnInvert').addEventListener('click', () => {
    images.forEach((_, i) => {
      if (selected.has(i)) selected.delete(i);
      else selected.add(i);
    });
    gridEl.querySelectorAll('.card').forEach((card) => {
      const idx = Number(card.dataset.index);
      const on = selected.has(idx);
      card.classList.toggle('is-selected', on);
      const c = card.querySelector('.card__check');
      if (c) c.checked = on;
    });
    syncToolbar();
  });

  $('btnClear').addEventListener('click', () => {
    selected.clear();
    gridEl.querySelectorAll('.card').forEach((card) => {
      card.classList.remove('is-selected');
      const c = card.querySelector('.card__check');
      if (c) c.checked = false;
    });
    syncToolbar();
  });

  downloadBtn.addEventListener('click', downloadSelected);

  // 淡入动画（用 JS 注入 keyframes，避免额外文件）
  const style = document.createElement('style');
  style.textContent = '@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
  document.head.appendChild(style);

  load();
})();
