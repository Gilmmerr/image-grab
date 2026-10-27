/**
 * 图提取 · 电商图片下载
 * background.js —— Service Worker：接收图片列表、缓存、打开预览页
 */

const STORE_KEY = 'igImages';
const META_KEY = 'igMeta';

// MV3 的 storage.session 在部分旧版本不可用，统一做兜底
const store = chrome.storage.session || chrome.storage.local;

async function saveImages(images, meta) {
  await store.set({ [STORE_KEY]: images, [META_KEY]: meta || {} });
}

// content.js 点击「获取图片」后发消息过来
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'IG_OPEN_GALLERY') return;

  saveImages(msg.images, msg.meta)
    .then(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
      sendResponse({ ok: true, count: msg.images.length });
    })
    .catch((err) => {
      console.error('[图提取] 保存图片列表失败：', err);
      sendResponse({ ok: false, error: String(err) });
    });

  // 异步返回，必须显式声明
  return true;
});

// 点击工具栏图标：直接打开上次提取的结果
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
});
