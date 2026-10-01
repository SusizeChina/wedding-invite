#!/usr/bin/env node
/**
 * 一键部署脚本
 * 功能：压缩 HTML/CSS/JS → 复制资源 → 上传到服务器
 *
 * 使用方法：
 *   node deploy.js                    # 仅构建到 dist/
 *   node deploy.js --upload           # 构建并上传到生产服务器
 *   node deploy.js --upload prod      # 显式部署生产环境
 *   node deploy.js --upload dev       # 构建并上传到测试服务器
 *   node deploy.js --upload --dev     # 构建并上传到测试服务器
 *   node deploy.js --serve            # 本地预览 dist/
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync, execFileSync } = require('child_process');

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
    // 生产环境服务器地址
    prod: {
      remotePath: 'root@hunli.lihq.cn:/opt/nginx/hunli/',
    },
    // 测试环境服务器地址
    dev: {
      remotePath: 'root@dev.lihq.chat:/opt/nginx/hunli/',
    },
    // Linux/macOS 使用 rsync；Windows 使用 OpenSSH 的 ssh/scp（覆盖同名文件，保留远端其他文件）
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
  // 原样保护脚本、样式和保留空白的元素，避免破坏 JS 自动分号插入及字符串。
  const preserved = [];
  const prefix = 'HTML_PRESERVED_' + require('crypto').randomBytes(16).toString('hex') + '_';
  content = content.replace(/<(script|style|pre|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, match => {
    preserved.push(match);
    return prefix + (preserved.length - 1) + '_END';
  });
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
    .trim()
    .replace(new RegExp(prefix + '(\\d+)_END', 'g'), (match, index) => preserved[Number(index)]);
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

function minifyJS(content, keepConsole) {
  // 没有语法解析器时不使用正则压缩 JS：换行参与自动分号插入，
  // 注释、正则表达式和模板字符串也不能通过简单替换安全区分。
  // 保留诊断日志，方便排查云开发连接或权限问题。
  return content.trim();
}

// ==================== 构建流程 ====================

function build(keepConsole) {
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
          const js = minifyJS(fs.readFileSync(jsFile, 'utf-8'), keepConsole);
          // 构建时检查语法，避免上传浏览器无法执行的脚本。
          new vm.Script(js, { filename: jsFile });
          return `<script>${js}</script>`;
        }
        return match;
      }
    );

    const minifiedHTML = minifyHTML(html);
    const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptPattern.exec(minifiedHTML)) !== null) {
      if (match[1].trim()) {
        new vm.Script(match[1], { filename: CONFIG.htmlEntry });
      }
    }
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

function quoteRemotePath(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function uploadWindows(remotePath) {
  // 使用参数数组和相对源路径，避免 Windows 盘符被 scp 当成远端主机。
  const match = /^([^\s:]+):([^\r\n]+)$/.exec(remotePath);
  if (!match || match[1].startsWith('-') || !match[2].startsWith('/') || match[2] === '/') {
    throw new Error('Windows 部署地址必须为 user@host:/绝对目录/，且不能使用根目录');
  }
  const host = match[1];
  const remoteDir = match[2];

  for (const command of ['ssh', 'scp']) {
    try {
      // Windows 自带 OpenSSH 客户端；where.exe 不通过 shell 执行。
      execFileSync('where.exe', [command], { stdio: 'ignore' });
    } catch (err) {
      throw new Error(`找不到 ${command}，请在 Windows“可选功能”中安装 OpenSSH 客户端后重试`);
    }
  }

  log(colors.yellow('   使用 Windows OpenSSH 上传（覆盖同名文件，保留远端其他文件）'));
  execFileSync('ssh', [host, `mkdir -p -- ${quoteRemotePath(remoteDir)}`], { stdio: 'inherit' });
  // cwd 指向 dist，上传其全部内容（包含隐藏文件），不额外创建 dist 子目录。
  execFileSync('scp', ['-r', '.', `${host}:${remoteDir}`], {
    cwd: CONFIG.distDir,
    stdio: 'inherit',
  });
}

function upload(isDev) {
  const envKey = isDev ? 'dev' : 'prod';
  const envConfig = CONFIG.deploy[envKey];

  if (!envConfig || !envConfig.remotePath) {
    log(colors.red(`❌ 错误: 请先在 deploy.js 中配置 deploy.${envKey}.remotePath`));
    log(colors.yellow('   例如: remotePath: "user@host:/var/www/html"'));
    process.exit(1);
  }

  const envLabel = isDev ? '测试' : '生产';
  log(colors.cyan(`\n📤 开始上传到${envLabel}环境...`));
  log(colors.yellow(`   目标地址: ${envConfig.remotePath}`));

  try {
    if (process.platform === 'win32') {
      uploadWindows(envConfig.remotePath);
    } else {
      const args = CONFIG.deploy.rsyncOptions.trim().split(/\s+/);
      args.push(CONFIG.distDir + '/', envConfig.remotePath);
      execFileSync('rsync', args, { stdio: 'inherit' });
    }
    log(colors.green('\n✓ 上传成功！'));
  } catch (err) {
    log(colors.red(`\n❌ 上传失败: ${err.message}`));
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

function parseArgs(args) {
  const allowed = ['--upload', '--serve', '--dev', '--prod', 'dev', 'prod'];
  const unknown = args.filter(arg => !allowed.includes(arg));
  if (unknown.length) {
    throw new Error(`无法识别参数: ${unknown.join(' ')}。测试部署用 --upload dev，生产部署用 --upload prod`);
  }
  const isDev = args.includes('--dev') || args.includes('dev');
  const isProd = args.includes('--prod') || args.includes('prod');
  if (isDev && isProd) {
    throw new Error('不能同时指定测试环境 dev 和生产环境 prod');
  }
  if (args.includes('--upload') && args.includes('--serve')) {
    throw new Error('不能同时指定上传 --upload 和本地预览 --serve');
  }
  return { isDev, shouldUpload: args.includes('--upload'), shouldServe: args.includes('--serve') };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    log(colors.red(`❌ ${err.message}`));
    process.exitCode = 1;
    return;
  }
  const { isDev, shouldUpload, shouldServe } = options;

  build(isDev);

  if (shouldUpload) {
    upload(isDev);
  } else if (shouldServe) {
    serve();
  } else {
    log(colors.yellow('\n💡 提示:'));
    log(colors.yellow('   node deploy.js --upload         构建并上传到生产服务器'));
    log(colors.yellow('   node deploy.js --upload prod    构建并上传到生产服务器（显式指定）'));
    log(colors.yellow('   node deploy.js --upload dev     构建并上传到测试服务器（也支持 --upload --dev）'));
    log(colors.yellow('   node deploy.js --serve          构建并在本地预览'));
  }
}

main();
