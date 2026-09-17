/**
 * wx_cloud.js
 * 微信云开发：点赞功能
 * - 动态加载 SDK，不阻塞页面
 * - 初始化时读取 total 显示点赞数
 * - localStorage 记录是否点过，进页面默认显示红/灰心
 * - 节流：每 800ms 最多写一次数据库（批量累计本地 +N 一次性写入）
 * - 每次点击触发一个爱心往上飘的动画
 */

(function () {
  var WX_RESOURCE_APPID = 'wxed4c70ad9783154d'
  var WX_RESOURCE_ENVID = 'cloud1-d1g3j2yfxa7019d32'
  var LS_KEY = 'hunli_liked'            // localStorage key
  var COLLECTION = 'numLikes'
  var DOC_FILTER = {}                   // .where({}) 取第一条

  // ---------- DOM 引用 ----------
  var btn = document.getElementById('like-btn')
  var countEl = document.getElementById('like-count')
  var heartsWrap = document.getElementById('like-hearts-wrap')

  // ---------- 状态 ----------
  var dbReady = false          // SDK + db 初始化完成
  var db = null                // 数据库实例
  var docId = null             // 目标文档 id
  var localCount = 0           // 本地展示用的缓存计数
  var pendingLikes = 0         // 待写入数据库的点赞数（批量节流）
  var throttleTimer = null     // 节流定时器

  // ---------- 1. 初始化：读取缓存，渲染心状态 ----------
  function initLikeUI() {
    var liked = localStorage.getItem(LS_KEY) === '1'
    if (liked) {
      btn && btn.classList.add('liked')
    }
  }

  // ---------- 2. 动态加载 SDK ----------
  function loadCloudSDK() {
    return new Promise(function (resolve, reject) {
      if (typeof cloud !== 'undefined') { resolve(); return }
      var s = document.createElement('script')
      s.src = 'https://res.wx.qq.com/open/js/cloudbase/1.1.0/cloud.js'
      s.onload = resolve
      s.onerror = function () { reject(new Error('SDK 加载失败')) }
      document.head.appendChild(s)
    })
  }

  // ---------- 3. 初始化云开发，拉取点赞数 ----------
  async function initCloud() {
    try {
      await loadCloudSDK()

      var c = new cloud.Cloud({
        identityless: true,
        resourceAppid: WX_RESOURCE_APPID,
        resourceEnv: WX_RESOURCE_ENVID,
      })
      await c.init()
      db = c.database()

      // 读取当前 total
      var res = await db.collection(COLLECTION).where(DOC_FILTER).limit(1).get()
      if (res.data && res.data.length > 0) {
        docId = res.data[0]._id
        localCount = res.data[0].total || 0
        renderCount(localCount)
      }

      dbReady = true
      console.log('[wx_cloud] 云开发初始化成功，total =', localCount)
    } catch (e) {
      console.error('[wx_cloud] 初始化失败:', e)
    }
  }

  // ---------- 4. 更新显示数字 ----------
  function renderCount(n) {
    if (!countEl) return
    countEl.textContent = n >= 10000
      ? (n / 10000).toFixed(1) + 'w'
      : String(n)
  }

  // ---------- 5. 节流写库（每 800ms 批量写一次） ----------
  function flushLikesToDB() {
    if (!dbReady || !db || !docId || pendingLikes <= 0) return
    var toWrite = pendingLikes
    pendingLikes = 0
    db.collection(COLLECTION).doc(docId).update({
      data: {
        total: db.command.inc(toWrite)
      }
    }).catch(function (e) {
      console.error('[wx_cloud] 写入失败:', e)
    })
  }

  // ---------- 6. 触发一个飘动爱心动画 ----------
  function spawnHeart() {
    if (!heartsWrap) return
    var el = document.createElement('span')
    el.className = 'floating-heart'
    el.textContent = '❤'

    // 随机横向漂移 & 旋转，营造自然感
    var dx  = (Math.random() - 0.5) * 40   // 起始横移
    var dx2 = (Math.random() - 0.5) * 60   // 终止横移
    var r   = (Math.random() - 0.5) * 20 + 'deg'
    var r2  = (Math.random() - 0.5) * 35 + 'deg'
    var size = 16 + Math.random() * 12      // 16~28px，大小各异

    el.style.setProperty('--dx',  dx + 'px')
    el.style.setProperty('--dx2', dx2 + 'px')
    el.style.setProperty('--r',   r)
    el.style.setProperty('--r2',  r2)
    el.style.fontSize = size + 'px'

    heartsWrap.appendChild(el)
    // 动画结束后移除 DOM
    el.addEventListener('animationend', function () { el.remove() }, { once: true })
  }

  // ---------- 7. 按钮点击处理 ----------
  function handleLike() {
    // 按钮弹跳动画
    if (btn) {
      btn.classList.remove('pop')
      // 触发重绘以重新播放动画
      void btn.offsetWidth
      btn.classList.add('pop')
      btn.addEventListener('animationend', function () {
        btn.classList.remove('pop')
      }, { once: true })
    }

    // 切换红心状态
    if (btn) btn.classList.add('liked')
    localStorage.setItem(LS_KEY, '1')

    // 本地数字即时 +1，体验更流畅
    localCount++
    renderCount(localCount)

    // 飘动爱心
    spawnHeart()

    // 节流：累计待写数量，800ms 后批量写入
    pendingLikes++
    clearTimeout(throttleTimer)
    throttleTimer = setTimeout(flushLikesToDB, 800)
  }

  // ---------- 8. 页面可见时才懒初始化云开发 ----------
  function setupObserver() {
    var section = document.getElementById('like-section')
    if (!section) return

    if ('IntersectionObserver' in window) {
      var once = false
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !once) {
            once = true
            initCloud()
            obs.disconnect()
          }
        })
      }, { rootMargin: '300px 0px 300px 0px' })
      obs.observe(section)
    } else {
      // 降级：直接初始化
      initCloud()
    }
  }

  // ---------- 启动 ----------
  initLikeUI()

  if (btn) {
    btn.addEventListener('click', handleLike)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObserver)
  } else {
    setupObserver()
  }
})()