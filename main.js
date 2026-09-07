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