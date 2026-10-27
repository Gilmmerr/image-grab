# 图提取 ImageGrab

Chrome 浏览器扩展：在**淘宝 / 天猫、京东、拼多多商家版**的商品详情页，一键提取页面内所有商品图片，在新标签页集中预览、勾选，批量下载为 **PNG**。

## 功能

- 详情页右下角悬浮「获取图片」按钮，仅在三家平台的商品详情页出现
- 自动扫描 `<img>`、`srcset`、`data-src` 等懒加载属性、CSS `background-image`、`og:image`
- 过滤图标、logo、占位图、小于 100×100 的小图，相对路径转绝对 URL 并去重
- 新标签页网格展示，显示尺寸、支持全选 / 反选 / 勾选
- 批量下载，经 Canvas 统一转为 PNG，文件名 `商品图_001.png` 自动补零
- 逐张进度反馈，单张失败不影响其他

## 文件结构

```
image-grab/
├── manifest.json      # 扩展清单（Manifest V3）
├── content.js         # 注入按钮 + 扫描页面图片
├── content.css        # 悬浮按钮与提示气泡样式
├── background.js      # Service Worker：接收列表、打开预览页
├── gallery.html       # 图片预览页
├── gallery.css
├── gallery.js         # 勾选、批量转 PNG 下载
├── icons/             # 16 / 48 / 128 图标
└── docs/              # 官方宣传网站（GitHub Pages 部署目录）
    ├── index.html
    ├── css/style.css
    └── js/main.js
```

## 安装

1. 解压到本地任意纯英文路径，例如 `D:\extensions\image-grab`
2. Chrome 地址栏打开 `chrome://extensions`
3. 打开右上角「开发者模式」
4. 点「加载已解压的扩展程序」，选择本项目文件夹（含 `manifest.json` 的那一层）

## 使用

打开任意商品详情页 → 点右下角「获取图片」→ 在新标签页勾选图片 → 点「下载选中」→ 文件保存在浏览器默认下载目录。

## 官网

`docs/index.html` 双击即可预览；线上部署见 GitHub 仓库 Settings → Pages，分支 `main`、目录 `/docs`。

## 技术要点

- Manifest V3，权限：`activeTab`、`scripting`、`downloads`、`storage`
- 跨域取图依赖 `host_permissions`（含平台 CDN：alicdn / 360buyimg / pddpic）
- 图片转 PNG 在预览页用 `createImageBitmap` + `OffscreenCanvas` 完成，不上传服务器
