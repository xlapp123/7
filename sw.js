// 云朵机 Service Worker
// 缓存核心资源，支持弱网/离线使用

const CACHE_NAME = 'yunduo-v1';
const CACHE_VERSION = 1;

// 需要缓存的核心资源
const CORE_ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako_inflate.min.js',
  'https://unpkg.com/dexie@3/dist/dexie.min.js',
];

// 安装：缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 逐个尝试缓存，部分外部资源失败不影响整体安装
      return Promise.allSettled(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] 缓存失败:', url, err.message))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先（核心资源），网络优先（API请求）
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // API 请求始终走网络，不缓存
  if (
    url.includes('/v1/chat/completions') ||
    url.includes('/ai/generate-image') ||
    url.includes('peerjs') ||
    url.includes('api.anthropic') ||
    url.includes('openai.com') ||
    event.request.method !== 'GET'
  ) {
    return; // 让浏览器正常处理
  }

  // 对 HTML 和 JS 核心资源使用 Stale-While-Revalidate 策略
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        // 缓存成功的响应
        if (response && response.status === 200 && response.type !== 'opaque') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => null);

      // 有缓存立即返回，后台更新；无缓存等待网络
      return cached || networkFetch;
    })
  );
});

// 接收主线程消息
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
