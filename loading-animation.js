// loading-animation.js
// 动画流程：
//   1. 整体从屏幕上方飞入，放大至全屏（GSAP）
//   2. 飞入完成后，打字机效果逐字打出 "INVITATION"
//   3. 打字完成后，以左边缘为轴向左翻开（rotateY 0 → -90°）
//      翻开多少 = 露出多少真实首页内容
//   4. 翻至 -90° 时封面完全消失，隐藏 loading 层

(function () {
  'use strict';

  function startLoading() {
    document.body.style.overflow = 'hidden';

    var vp           = { w: window.innerWidth, h: window.innerHeight };
    var flyWrap      = document.getElementById('loading-fly-wrap');
    var loadingLayer = document.getElementById('loading-layer');
    var shadow       = document.getElementById('flip-shadow');
    var typeEl       = document.getElementById('loading-typewriter');

    // 打字机：先把文字内容清空，等飞入后再逐字写入
    var fullText = typeEl ? typeEl.textContent.trim() : 'INVITATION';
    if (typeEl) typeEl.textContent = '';

    // 初始状态：缩小 + 屏幕上方 + 透明
    gsap.set(flyWrap, {
      y: -vp.h * 0.6,
      scale: 0.45,
      opacity: 0,
      transformOrigin: 'center center',
      rotationY: 0
    });
    gsap.set(shadow, { opacity: 0 });

    // ── 阶段一：飞入放大 ──────────────────────────────────
    gsap.to(flyWrap, {
      y: 0,
      scale: 1,
      opacity: 1,
      duration: 1.5,
      ease: 'power3.out',
      onComplete: startTypewriter   // 飞入完成 → 打字机
    });

    // ── 阶段二：打字机效果 ───────────────────────────────
    function startTypewriter() {
      if (!typeEl) {
        startFlip();
        return;
      }

      var chars      = fullText.split('');
      var charDelay  = 90;   // 每个字符间隔 ms，调大 = 慢，调小 = 快
      var pauseAfter = 400;  // 打完后停顿多久再翻页（ms）

      function typeNext(i) {
        if (i >= chars.length) {
          setTimeout(startFlip, pauseAfter);
          return;
        }
        typeEl.textContent += chars[i];
        setTimeout(function () { typeNext(i + 1); }, charDelay);
      }

      typeNext(0);
    }

    // ── 阶段三：翻页（左边缘为轴，带随动阴影）──────────────
    function startFlip() {
      // 背景透明，让真实首页内容透出来
      loadingLayer.style.background = 'transparent';
      // 切换旋转轴到左边缘
      gsap.set(flyWrap, { transformOrigin: 'left center' });

      gsap.delayedCall(0.15, function () {
        gsap.to(flyWrap, {
          rotationY: -90,
          duration: 0.85,
          ease: 'power2.in',    // 先慢后快，模拟纸张受重力加速
          onUpdate: function () {
            var p = this.progress();
            // sin 曲线：0% → 50% 最暗 → 100% 消失
            gsap.set(shadow, { opacity: Math.sin(p * Math.PI) * 0.55 });
          },
          onComplete: function () {
            gsap.set(shadow, { opacity: 0 });
            loadingLayer.style.display = 'none';
            document.body.style.overflow = '';
          }
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startLoading);
  } else {
    startLoading();
  }
})();
