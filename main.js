(function() {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('H5页面已加载');

        var audio = document.getElementById('audio-player');
        var btnPlay = document.getElementById('btn-play');
        var albumRing = document.querySelector('.album-ring');
        var albumBtn = document.querySelector('.album-btn');

        if (!audio || !btnPlay) return;

        var rotation = 0;
        var lastTime = 0;
        var rafId = null;

        function animate(time) {
            if (!lastTime) lastTime = time;
            var delta = time - lastTime;
            lastTime = time;
            rotation += (delta / 1000) * 18; // 20s per 360deg => 18 deg/s
            albumRing.style.transform = 'rotate(' + rotation + 'deg)';
            rafId = requestAnimationFrame(animate);
        }

        function startRotation() {
            if (rafId) return;
            lastTime = 0;
            rafId = requestAnimationFrame(animate);
        }

        function stopRotation() {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }

        // 同步UI状态的核心函数
        function syncUI() {
            if (audio.paused) {
                stopRotation();
                albumBtn && albumBtn.classList.remove('album-btn-rotate');
            } else {
                startRotation();
                albumBtn && albumBtn.classList.add('album-btn-rotate');
            }
        }

        // 监听 audio 原生事件来同步状态
        audio.addEventListener('play', syncUI);
        audio.addEventListener('pause', syncUI);
        audio.addEventListener('ended', syncUI);

        // 播放/暂停按钮点击
        btnPlay.addEventListener('click', function() {
            if (audio.paused) {
                // preload=none 时需要先触发加载
                if (audio.readyState === 0) { audio.load(); }
                audio.play().catch(function() {});
            } else {
                audio.pause();
            }
        });

        // 尝试自动播放（preload=none，浏览器通常会拦截，走 catch 分支）
        var tryAutoPlay = function() {
            if (audio.readyState === 0) { audio.load(); }
            var playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(function() {
                    syncUI();
                }).catch(function() {
                    syncUI();
                    var hintObserver = new IntersectionObserver(function(entries) {
                        entries.forEach(function(entry) {
                            if (entry.isIntersecting) {
                                albumRing && albumRing.classList.add('album-ring-hint');
                                hintObserver.disconnect();
                            }
                        });
                    }, { threshold: 0.5 });
                    albumRing && hintObserver.observe(albumRing);
                    var resumePlay = function() {
                        if (audio.readyState === 0) { audio.load(); }
                        audio.play().then(function() {
                            syncUI();
                        }).catch(function() {});
                        albumRing && albumRing.classList.remove('album-ring-hint');
                        document.removeEventListener('touchstart', resumePlay);
                        document.removeEventListener('click', resumePlay);
                    };
                    document.addEventListener('touchstart', resumePlay, { once: true });
                    document.addEventListener('click', resumePlay, { once: true });
                });
            }
        };

        tryAutoPlay();


        // 初始同步
        syncUI();

        // --- 初始化日历 ---
        function initCalendar() {
            var grid = document.getElementById('calendar-grid');
            if (!grid) return;

            // 2026年10月，1号是星期四，由于表头是"一 二 三 四 五 六 日"，所以前面需要3个空格
            var emptyDays = 3;
            var totalDays = 31;
            var highlightDay = 23;

            var html = '<div class="calendar-watermark">2026</div>';

            // 填充前置空格
            for (var i = 0; i < emptyDays; i++) {
                html += '<div class="calendar-day"></div>';
            }

            // 填充日期
            for (var d = 1; d <= totalDays; d++) {
                var className = (d === highlightDay) ? 'calendar-day highlight' : 'calendar-day';
                html += '<div class="' + className + '"><div class="day-inner">' + d + '</div></div>';
            }

            grid.innerHTML = html;
        }

        initCalendar();

        // --- 初始化图片懒加载 ---
        function initLazyLoad() {
            var lazyImages = document.querySelectorAll('img.lazy-img[data-src]');

            if ('IntersectionObserver' in window) {
                // IntersectionObserver 规范仅支持 px 和 % 单位，使用 window.innerHeight 动态计算 1 个屏幕高度的像素值
                var marginPx = window.innerHeight || document.documentElement.clientHeight || 800;
                var imageObserver = new IntersectionObserver(function(entries, observer) {
                    entries.forEach(function(entry) {
                        if (entry.isIntersecting) {
                            var img = entry.target;
                            var src = img.getAttribute('data-src');
                            if (src) {
                                img.src = src;
                                img.removeAttribute('data-src');
                            }
                            img.classList.add('loaded');
                            observer.unobserve(img);
                        }
                    });
                }, {
                    root: null,
                    rootMargin: marginPx + 'px 0px ' + marginPx + 'px 0px',
                    threshold: 0
                });

                lazyImages.forEach(function(img) {
                    // 如果图片已经有 src 且为真实路径（如首屏第一张），直接加 loaded 类
                    if (img.complete && img.src && !img.src.startsWith('data:image')) {
                        img.classList.add('loaded');
                    }
                    imageObserver.observe(img);
                });
            } else {
                // 降级处理：直接全部加载
                lazyImages.forEach(function(img) {
                    var src = img.getAttribute('data-src');
                    if (src) {
                        img.src = src;
                    }
                    img.classList.add('loaded');
                });
            }
        }

        initLazyLoad();
    });
})();


// ========== Action Sheet 导航弹层 ==========
(function () {
    var DEST_NAME = encodeURIComponent('长沙洋湖小天鹅婚庆园');
    var DEST_NAME_RAW = '长沙洋湖小天鹅婚庆园';

    var mask = document.getElementById('action-sheet-mask');
    var sheet = document.getElementById('action-sheet');

    function openSheet() {
        if (!mask || !sheet) return;
        // 先显示 display:block，然后下一帧加 show 触发过渡动画
        mask.style.display = 'block';
        requestAnimationFrame(function () {
            mask.classList.add('show');
            sheet.classList.add('show');
        });
    }
    window.openNavSheet = openSheet;

    function closeSheet() {
        if (!mask || !sheet) return;
        mask.classList.remove('show');
        sheet.classList.remove('show');
        // 等过渡结束再隐藏
        setTimeout(function () {
            mask.style.display = 'none';
        }, 300);
    }

    // 触发入口：地图容器/图片 + 导航按钮
    var navBtn = document.getElementById('nav-btn');
    navBtn && navBtn.addEventListener('click', openSheet);

    // 点遮罩关闭
    mask && mask.addEventListener('click', closeSheet);

    // 取消按钮
    var cancelBtn = document.getElementById('btn-cancel');
    cancelBtn && cancelBtn.addEventListener('click', closeSheet);

    // 高德地图
    var gaodeBtn = document.getElementById('btn-gaode');
    gaodeBtn && gaodeBtn.addEventListener('click', function () {
        closeSheet();
        toGDMap();
    });

    // 百度地图
    var baiduBtn = document.getElementById('btn-baidu');
    baiduBtn && baiduBtn.addEventListener('click', function () {
        closeSheet();
        toBaiDuMap();
    });

    // 腾讯地图
    var tencentBtn = document.getElementById('btn-tencent');
    tencentBtn && tencentBtn.addEventListener('click', function () {
        closeSheet();
        toTencentMap();
    });
})();

// ========== 腾讯地图导航（微信内最直接，不需要 Key）==========
var toTencentMap = function () {
    // 精确坐标（GCJ-02），tocoord 格式为 纬度,经度
    var lat = 28.120722, lng = 112.944023;
    var name = encodeURIComponent('长沙洋湖小天鹅婚庆园');
    var url = 'https://apis.map.qq.com/uri/v1/routeplan'
        + '?type=drive'
        + '&to=' + name
        + '&tocoord=' + lat + ',' + lng
        + '&policy=0'
        + '&referer=hunli';
    window.location.href = url;
};

// ========== 环境检测 ==========
function isWechat() {
    return /micromessenger/i.test(navigator.userAgent);
}

function getPhoneModel() {
    var ua = navigator.userAgent.toLowerCase();
    var isHarmonyOS = ua.indexOf('harmony') > -1;
    var isiOS = !!ua.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/);
    var isIphone = ua.indexOf('iphone') > -1;
    var isAndroid = !isHarmonyOS && (ua.indexOf('android') > -1 || ua.indexOf('adr') > -1);
    if (isHarmonyOS) return 'hw';
    if (isiOS || isIphone) return 'ios';
    if (isAndroid) return 'android';
    return 'other';
}

// ========== 百度地图导航 ==========
var toBaiDuMap = function () {
    var nameRaw = '长沙洋湖小天鹅婚庆园';
    var name = encodeURIComponent(nameRaw);

    if (isWechat()) {
        // 微信内：用 H5 web 页（百度地图 H5 搜索，可引导跳 App）
        window.location.href = 'https://api.map.baidu.com/geocoder?address=' + name + '&output=html&src=hunli.invite';
        showToast('若无法跳转，请点右上角「在浏览器中打开」');
        return;
    }

    var model = getPhoneModel();
    var schemeUrl = '';
    if (model === 'ios') {
        schemeUrl = 'baidumap://map/direction?destination=name:' + name + '&coord_type=gcj02&mode=driving&src=ios.hunli.invite';
    } else if (model === 'android' || model === 'hw') {
        schemeUrl = 'bdapp://map/direction?destination=name:' + name + '&coord_type=gcj02&mode=driving&src=andr.hunli.invite';
    }

    if (schemeUrl) {
        // 先跳 scheme，2s 后若页面仍活跃说明 App 未安装，降级到 web
        var fallback = setTimeout(function () {
            window.location.href = 'https://api.map.baidu.com/geocoder?address=' + name + '&output=html&src=hunli.invite';
        }, 2000);
        document.addEventListener('visibilitychange', function onHide() {
            if (document.hidden) { clearTimeout(fallback); }
            document.removeEventListener('visibilitychange', onHide);
        });
        window.location.href = schemeUrl;
    } else {
        window.location.href = 'https://api.map.baidu.com/geocoder?address=' + name + '&output=html&src=hunli.invite';
    }
};

// ========== 高德地图导航 ==========
var toGDMap = function () {
    var nameRaw = '长沙洋湖小天鹅婚庆园';
    var name = encodeURIComponent(nameRaw);

    if (isWechat()) {
        // 微信内：用高德通用 web 链接（支持唤起 App 或 H5 导航）
        window.location.href = 'https://uri.amap.com/search?keyword=' + name + '&city=%E9%95%BF%E6%B2%99';
        showToast('若无法跳转，请点右上角「在浏览器中打开」');
        return;
    }

    var model = getPhoneModel();
    var schemeUrl = '';
    if (model === 'ios') {
        schemeUrl = 'iosamap://poi?sourceApplication=hunliInvite&name=' + name + '&dev=0&style=2';
    } else if (model === 'android' || model === 'hw') {
        schemeUrl = 'androidamap://poi?sourceApplication=hunliInvite&keywords=' + name + '&dev=0&style=2';
    }

    if (schemeUrl) {
        var fallback = setTimeout(function () {
            window.location.href = 'https://uri.amap.com/search?keyword=' + name + '&city=%E9%95%BF%E6%B2%99';
        }, 2000);
        document.addEventListener('visibilitychange', function onHide() {
            if (document.hidden) { clearTimeout(fallback); }
            document.removeEventListener('visibilitychange', onHide);
        });
        window.location.href = schemeUrl;
    } else {
        window.location.href = 'https://uri.amap.com/search?keyword=' + name + '&city=%E9%95%BF%E6%B2%99';
    }
};

// ========== Toast 提示 ==========
function showToast(message) {
    var existing = document.getElementById('__toast__');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = '__toast__';
    toast.textContent = message;
    toast.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.72)',
        'color:#fff',
        'padding:10px 20px',
        'border-radius:24px',
        'font-size:14px',
        'z-index:9999',
        'white-space:nowrap',
        'pointer-events:none',
        'transition:opacity 0.3s'
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
}

// ========== 高德地图接入与视口懒加载（零首屏阻塞）==========
(function () {
    var MAP_CENTER = [112.944023, 28.120722];
    var AMAP_KEY = 'bf5634859f1a955e35ea0aa2ba27f8bb';
    var AMAP_SECURITY_CODE = '9eee55e247117eb4715ef677d151402d';

    window._AMapSecurityConfig = {
        securityJsCode: AMAP_SECURITY_CODE,
    };

    var isLoaded = false;

    function loadAMapSDK(callback) {
        if (window.AMapLoader) {
            callback();
            return;
        }
        var script = document.createElement('script');
        script.src = 'https://webapi.amap.com/loader.js';
        script.async = true;
        script.onload = function () {
            callback();
        };
        script.onerror = function () {
            console.error('Failed to load AMap loader script');
            var loadingEl = document.querySelector('.map-container .map-loading');
            if (loadingEl) {
                loadingEl.innerHTML = '<span>地图加载失败，请点击下方导航</span>';
            }
        };
        document.head.appendChild(script);
    }

    function initMap() {
        if (isLoaded) return;
        isLoaded = true;

        var container = document.getElementById('map-container');
        if (!container) return;

        loadAMapSDK(function () {
            window.AMapLoader.load({
                key: AMAP_KEY,
                version: '2.0',
            }).then(function (AMap) {
                var map = new AMap.Map('map-container', {
                    center: MAP_CENTER,
                    zoom: 17,
                    dragEnable: true,
                    zoomEnable: true,
                });

                var marker = new AMap.Marker({
                    position: MAP_CENTER,
                    title: '洋湖小天鹅婚庆园',
                });
                map.add(marker);

                // 点击标记点联动唤起导航选择
                marker.on('click', function () {
                    if (window.openNavSheet) {
                        window.openNavSheet();
                    }
                });

                var loadingEl = document.querySelector('.map-container .map-loading');
                if (loadingEl) {
                    loadingEl.classList.add('hide');
                    setTimeout(function () {
                        loadingEl.remove();
                    }, 400);
                }
            }).catch(function (e) {
                console.error('AMap initialization error:', e);
                var loadingEl = document.querySelector('.map-container .map-loading');
                if (loadingEl) {
                    loadingEl.innerHTML = '<span>地图加载失败，请点击下方导航</span>';
                }
            });
        });
    }

    // 视口距离检测：滑到接近地图（距离 400px）才开始动态载入，完全不占用首屏带宽与执行时间
    function setupMapObserver() {
        var container = document.getElementById('map-container');
        if (!container) return;

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        initMap();
                        observer.disconnect();
                    }
                });
            }, {
                rootMargin: '400px 0px 400px 0px'
            });
            observer.observe(container);
        } else {
            // 降级策略：在页面完全加载后再等待 2.5 秒触发
            if (document.readyState === 'complete') {
                setTimeout(initMap, 2500);
            } else {
                window.addEventListener('load', function () {
                    setTimeout(initMap, 2500);
                });
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMapObserver);
    } else {
        setupMapObserver();
    }
})();

