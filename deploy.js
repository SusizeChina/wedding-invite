#!/usr/bin/env node
/**
 * 一键部署脚本
 * 功能：压缩 HTML/CSS/JS → 复制资源 → 上传到服务器
 *
 * 使用方法：
 *   node deploy.js                    # 仅构建到 dist/
 *   node deploy.js --upload           # 构建并上传到服务器
 *   node deploy.js --serve            # 本地预览 dist/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 配置区域 ====================
const CONFIG = {
  // 源文件目录
  srcDir: __dirname,
  // 输出目录
  distDir: path.join(__dirname, 'dist'),
  // 需要复制的资源目录/文件（相对于项目根目录）
  assets: ['asset'],
  // HTML 入口文件
  htmlEntry: 'index-wed.html',
  // 部署配置（可选）
  deploy: {
    // 服务器地址
    remotePath: 'root@hunli.lihq.cn:/opt/nginx/hunli/',
    // rsync 额外参数
    rsyncOptions: '-avz --delete',
  },
};
// =================================================

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function log(msg) {
  console.log(msg);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    // 兼容旧版 Node.js（< 14.14）
    if (fs.rmSync) {
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      deleteFolderRecursive(dir);
    }
  }
  fs.mkdirSync(dir, { recursive: true });
}

function deleteFolderRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(function(file) {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return (stats.size / 1024).toFixed(2) + ' KB';
}

// ==================== 压缩器 ====================

function minifyHTML(content) {
  return content
    // 移除 HTML 注释 <!-- ... -->
    .replace(/<!--[\s\S]*?-->/g, '')
    // 移除多余空白行
    .replace(/\n\s*\n/g, '\n')
    // 标签之间只保留一个空格
    .replace(/>\s+</g, '><')
    // 移除标签内多余空格
    .replace(/\s{2,}/g, ' ')
    // 移除行首行尾空格
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

function minifyCSS(content) {
  return content
    // 移除 CSS 注释 /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 移除行尾注释（不安全，跳过）
    // 移除多余空白
    .replace(/\s{2,}/g, ' ')
    // 移除选择器后的空格
    .replace(/\s*\{\s*/g, '{')
    // 移除属性后的空格
    .replace(/;\s*\}/g, '}')
    .replace(/;\s*/g, ';')
    .replace(/,\s*/g, ',')
    .replace(/:\s*/g, ':')
    .replace(/\{\s*/g, '{')
    .replace(/\}\s*/g, '}')
    // 移除首尾空白
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

function minifyJS(content) {
  // 先保护字符串，避免注释正则误删字符串内容
  var strings = [];
  content = content.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, function(match) {
    strings.push(match);
    return '\0STR' + (strings.length - 1) + '\0';
  });

  content = content
    // 移除单行注释 //
    .replace(/\/\/.*$/gm, '')
    // 移除多行注释 /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 移除多余空白行
    .replace(/\n\s*\n/g, '\n')
    // 行首行尾空格
    .replace(/^\s+|\s+$/gm, '')
    .trim();

  // 恢复字符串
  content = content.replace(/\0STR(\d+)\0/g, function(match, idx) {
    return strings[parseInt(idx)];
  });

  return content;
}

// ==================== 构建流程 ====================

function build() {
  log(colors.cyan('🚀 开始构建...\n'));

  // 1. 清理并创建 dist
  cleanDir(CONFIG.distDir);
  log(colors.green('✓ 清理 dist/ 目录'));

  // 2. 复制资源文件
  for (const asset of CONFIG.assets) {
    const src = path.join(CONFIG.srcDir, asset);
    const dest = path.join(CONFIG.distDir, asset);
    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      log(colors.green(`✓ 复制资源: ${asset}/`));
    }
  }

  // 3. 处理 HTML
  const htmlPath = path.join(CONFIG.srcDir, CONFIG.htmlEntry);
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // 内联 CSS
    html = html.replace(
      /<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi,
      (match, cssPath) => {
        const cssFile = path.join(CONFIG.srcDir, cssPath.replace(/^\.\//, ''));
        if (fs.existsSync(cssFile)) {
          const css = minifyCSS(fs.readFileSync(cssFile, 'utf-8'));
          return `<style>${css}</style>`;
        }
        return match;
      }
    );

    // 内联 JS
    html = html.replace(
      /<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi,
      (match, jsPath) => {
        const jsFile = path.join(CONFIG.srcDir, jsPath.replace(/^\.\//, ''));
        if (fs.existsSync(jsFile)) {
          const js = minifyJS(fs.readFileSync(jsFile, 'utf-8'));
          return `<script>${js}</script>`;
        }
        return match;
      }
    );

    const minifiedHTML = minifyHTML(html);
    // 输出文件名与 Nginx index 配置保持一致
    const outputName = CONFIG.htmlEntry;
    const outputHtml = path.join(CONFIG.distDir, outputName);
    fs.writeFileSync(outputHtml, minifiedHTML, 'utf-8');

    const originalSize = fs.statSync(htmlPath).size;
    const newSize = fs.statSync(outputHtml).size;
    const saved = ((1 - newSize / originalSize) * 100).toFixed(1);
    log(colors.green(`✓ 构建 HTML: ${outputName} (节省 ${saved}%)`));
  }

  // 4. 统计
  log('\n' + colors.cyan('📦 构建完成！'));
  log(colors.yellow(`   输出目录: ${CONFIG.distDir}`));

  const distSize = getTotalSize(CONFIG.distDir);
  const sizeMB = (distSize / 1024 / 1024).toFixed(2);
  const sizeKB = (distSize / 1024).toFixed(2);
  log(colors.yellow(`   总大小: ${sizeMB} MB (${sizeKB} KB)`));
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function getTotalSize(dir) {
  let total = 0;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      total += getTotalSize(fullPath);
    } else {
      total += stat.size;
    }
  }
  return total;
}

// ==================== 部署流程 ====================

function upload() {
  if (!CONFIG.deploy.remotePath) {
    log(colors.red('❌ 错误: 请先在 deploy.js 中配置 deploy.remotePath'));
    log(colors.yellow('   例如: remotePath: "user@host:/var/www/html"'));
    process.exit(1);
  }

  log(colors.cyan('\n📤 开始上传...'));
  const cmd = `rsync ${CONFIG.deploy.rsyncOptions} ${CONFIG.distDir}/ ${CONFIG.deploy.remotePath}`;
  log(colors.yellow(`   执行: ${cmd}`));

  try {
    execSync(cmd, { stdio: 'inherit' });
    log(colors.green('\n✓ 上传成功！'));
  } catch (err) {
    log(colors.red('\n❌ 上传失败'));
    process.exit(1);
  }
}

function serve() {
  log(colors.cyan('\n🌐 启动本地预览...'));
  log(colors.yellow(`   访问: http://localhost:8080`));
  try {
    execSync(`npx serve ${CONFIG.distDir}`, { stdio: 'inherit' });
  } catch (err) {
    // 用户按 Ctrl+C 退出
  }
}

// ==================== 主入口 ====================

function main() {
  const args = process.argv.slice(2);

  build();

  if (args.includes('--upload')) {
    upload();
  } else if (args.includes('--serve')) {
    serve();
  } else {
    log(colors.yellow('\n💡 提示:'));
    log(colors.yellow('   node deploy.js --upload   构建并上传到服务器'));
    log(colors.yellow('   node deploy.js --serve    构建并在本地预览'));
  }
}

main();