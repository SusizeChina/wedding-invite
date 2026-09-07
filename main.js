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
                audio.play().catch(function() {});
            } else {
                audio.pause();
            }
        });

        // 尝试自动播放
        var playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(function() {
                // 自动播放成功
                syncUI();
            }).catch(function() {
                // 自动播放被浏览器拦截，设置为暂停态
                syncUI();
                // 等唱片进入视口后再添加引导动画
                var hintObserver = new IntersectionObserver(function(entries) {
                    entries.forEach(function(entry) {
                        if (entry.isIntersecting) {
                            albumRing && albumRing.classList.add('album-ring-hint');
                            hintObserver.disconnect();
                        }
                    });
                }, { threshold: 0.5 });
                albumRing && hintObserver.observe(albumRing);
                // 监听首次用户交互后自动播放
                var resumePlay = function() {
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

    function closeSheet() {
        if (!mask || !sheet) return;
        mask.classList.remove('show');
        sheet.classList.remove('show');
        // 等过渡结束再隐藏
        setTimeout(function () {
            mask.style.display = 'none';
        }, 300);
    }

    // 触发入口：地图图片 + 导航按钮
    var mapImg = document.getElementById('map-nav-img');
    var navBtn = document.getElementById('nav-btn');
    mapImg && mapImg.addEventListener('click', openSheet);
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
})();

// ========== 机型判断 ==========
function getPhoneModel() {
    var ua = navigator.userAgent.toLowerCase();
    var isHarmonyOS = ua.indexOf('harmony') > -1;
    var isiOS = !!ua.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/);
    var isIphone = ua.indexOf('iphone') > -1;
    // HarmonyOS UA 里也含 Android，所以先判断鸿蒙
    var isAndroid = !isHarmonyOS && (ua.indexOf('android') > -1 || ua.indexOf('adr') > -1);
    if (isHarmonyOS) return 'hw';
    if (isiOS || isIphone) return 'ios';
    if (isAndroid) return 'android';
    return 'other';
}

// ========== 百度地图导航 ==========
var toBaiDuMap = function () {
    var name = encodeURIComponent('长沙洋湖小天鹅婚庆园');
    var model = getPhoneModel();
    if (model === 'ios') {
        window.location.href = 'baidumap://map/direction?destination=name:' + name + '&coord_type=gcj02&mode=driving&src=ios.hunli.invite';
    } else if (model === 'android') {
        window.location.href = 'bdapp://map/direction?destination=name:' + name + '&coord_type=gcj02&mode=driving&src=andr.hunli.invite';
    } else if (model === 'hw') {
        var uri = 'baidumap://map/direction?destination=name:' + name + '&coord_type=gcj02&mode=driving&src=hw.hunli.invite';
        window.ohosCallNative && window.ohosCallNative.callNative('BdMap', { uri: uri }, function () {});
    } else {
        window.open('https://api.map.baidu.com/geocoder?address=' + name + '&output=html&src=hunli.invite', '_blank');
        return;
    }
    setTimeout(function () {
        showToast('如未跳转，请先安装百度地图');
    }, 2000);
};

// ========== 高德地图导航 ==========
var toGDMap = function () {
    var name = encodeURIComponent('长沙洋湖小天鹅婚庆园');
    var model = getPhoneModel();
    if (model === 'ios') {
        window.location.href = 'iosamap://poi?sourceApplication=hunliInvite&name=' + name + '&dev=0&style=2';
    } else if (model === 'android') {
        window.location.href = 'androidamap://poi?sourceApplication=hunliInvite&keywords=' + name + '&dev=0&style=2';
    } else if (model === 'hw') {
        var uri = 'amapuri://poi?sourceApplication=hunliInvite&name=' + name + '&dev=0&style=2';
        window.ohosCallNative && window.ohosCallNative.callNative('GdMap', { uri: uri }, function () {});
    } else {
        window.open('https://uri.amap.com/search?keyword=' + name + '&city=changsha', '_blank');
        return;
    }
    setTimeout(function () {
        showToast('如未跳转，请先安装高德地图');
    }, 2000);
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
