#!/usr/bin/env node
/**
 * Allure 视频附件提升脚本
 *
 * 问题：allure-playwright reporter 将 video 附件挂载在深层步骤
 *   After Hooks → Fixture "page" → video
 * 而非用例顶层 attachments，导致 Allure 报告里视频不易被发现。
 *
 * 本脚本遍历 allure-results 下所有 result JSON：
 * 1. 将嵌套在步骤树中的 video / screenshot / trace 附件复制到用例顶层 attachments；
 * 2. 将 video 附件规范为 Allure 可内嵌预览的 video/webm；
 * 3. 如果视频附件文件缺少 .webm 后缀，复制一份 .webm 文件并更新 source；
 * 4. 额外生成 HTML 预览附件，使用 <video controls> 内嵌播放同一份 WebM。
 */
const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2] || 'artifacts/allure-results';
const VIDEO_CONTENT_TYPE = 'video/webm';
const HTML_CONTENT_TYPE = 'text/html';
const VIDEO_PREVIEW_NAME = 'video';

if (!fs.existsSync(resultsDir)) {
  console.error('[promote-videos] 结果目录不存在:', resultsDir);
  process.exit(0);
}

const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'));
let promoted = 0;
let modifiedResults = 0;
let normalized = 0;
let copiedVideoFiles = 0;
let previewAttachments = 0;
let previewFiles = 0;
let scanned = 0;

function lower(value) {
  return String(value || '').toLowerCase();
}

function isVideoAttachment(att) {
  const name = lower(att.name);
  const type = lower(att.type);
  const source = lower(att.source);
  if (type === HTML_CONTENT_TYPE) {
    return false;
  }
  return (
    name === 'video' ||
    name === 'video.webm' ||
    type.startsWith('video/') ||
    source.endsWith('.webm')
  );
}

function isPromotableAttachment(att) {
  const name = lower(att.name);
  const type = lower(att.type);
  return (
    isVideoAttachment(att) ||
    name === 'trace' ||
    name === 'screenshot' ||
    type === 'application/vnd.allure.playwright-trace' ||
    type.startsWith('image/')
  );
}

function uniqueSource(baseSource) {
  if (!fs.existsSync(path.join(resultsDir, baseSource))) {
    return baseSource;
  }

  const ext = path.extname(baseSource);
  const stem = baseSource.slice(0, baseSource.length - ext.length);
  for (let index = 1; index < 1000; index++) {
    const candidate = `${stem}-${index}${ext}`;
    if (!fs.existsSync(path.join(resultsDir, candidate))) {
      return candidate;
    }
  }
  throw new Error(`无法为视频附件生成唯一文件名: ${baseSource}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function videoPreviewSource(videoSource) {
  const ext = path.extname(videoSource);
  const stem = ext ? videoSource.slice(0, videoSource.length - ext.length) : videoSource;
  return `${stem}-preview.html`;
}

function buildVideoPreviewHtml(videoSource, videoBase64) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    video {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      background: transparent;
      border-radius: 8px;
      overflow: hidden;
      outline: none;
    }
  </style>
</head>
<body>
  <video controls preload="metadata" src="data:${VIDEO_CONTENT_TYPE};base64,${videoBase64}">
    当前浏览器无法播放 WebM 视频。
  </video>
</body>
</html>
`;
}

function ensureWebmSource(att) {
  const source = typeof att.source === 'string' ? att.source : '';
  if (!source || source.toLowerCase().endsWith('.webm')) {
    return false;
  }

  const originalPath = path.join(resultsDir, source);
  if (!fs.existsSync(originalPath)) {
    return false;
  }

  const webmSource = uniqueSource(`${source}.webm`);
  fs.copyFileSync(originalPath, path.join(resultsDir, webmSource));
  att.source = webmSource;
  copiedVideoFiles++;
  return true;
}

function normalizeAttachment(att) {
  if (!isVideoAttachment(att)) {
    return false;
  }

  let modified = false;
  if (att.name !== 'video.webm') {
    att.name = 'video.webm';
    modified = true;
  }
  if (att.type !== VIDEO_CONTENT_TYPE) {
    att.type = VIDEO_CONTENT_TYPE;
    modified = true;
  }
  if (ensureWebmSource(att)) {
    modified = true;
  }
  if (modified) {
    normalized++;
  }
  return modified;
}

function ensureVideoPreviewAttachment(data, videoAttachment) {
  const source = typeof videoAttachment.source === 'string' ? videoAttachment.source : '';
  if (!source) {
    return false;
  }

  const videoPath = path.join(resultsDir, source);
  if (!fs.existsSync(videoPath)) {
    return false;
  }

  const previewSource = videoPreviewSource(source);
  const previewPath = path.join(resultsDir, previewSource);
  const videoBase64 = fs.readFileSync(videoPath).toString('base64');
  const html = buildVideoPreviewHtml(source, videoBase64);
  const existingHtml = fs.existsSync(previewPath)
    ? fs.readFileSync(previewPath, 'utf8')
    : null;
  let modified = false;

  if (existingHtml !== html) {
    fs.writeFileSync(previewPath, html, 'utf8');
    previewFiles++;
    modified = true;
  }

  const exists = data.attachments.some(
    (attachment) =>
      attachment.name === VIDEO_PREVIEW_NAME &&
      attachment.source === previewSource,
  );
  if (!exists) {
    data.attachments.push({
      name: VIDEO_PREVIEW_NAME,
      type: HTML_CONTENT_TYPE,
      source: previewSource,
    });
    previewAttachments++;
    modified = true;
  }

  return modified;
}

function normalizeAttachments(node) {
  let modified = false;
  for (const att of node.attachments || []) {
    modified = normalizeAttachment(att) || modified;
  }
  for (const step of node.steps || []) {
    modified = normalizeAttachments(step) || modified;
  }
  return modified;
}

/** 递归收集步骤树中所有指定名称的附件并从步骤中移除 */
function promoteAndRemoveStepAttachments(steps) {
  const found = [];
  if (!steps) return found;
  for (const step of steps) {
    if (step.attachments) {
      const remaining = [];
      for (const att of step.attachments) {
        if (isPromotableAttachment(att)) {
          found.push({ attachment: att });
        } else {
          remaining.push(att);
        }
      }
      if (remaining.length !== step.attachments.length) {
        step.attachments = remaining;
      }
    }
    if (step.steps && step.steps.length > 0) {
      found.push(...promoteAndRemoveStepAttachments(step.steps));
    }
  }
  return found;
}

for (const file of files) {
  const filePath = path.join(resultsDir, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    continue;
  }
  scanned++;

  let modified = normalizeAttachments(data);

  const collected = promoteAndRemoveStepAttachments(data.steps);
  if (collected.length > 0) {
    modified = true;
  }
  const hadAttachments = Array.isArray(data.attachments);
  if (collected.length === 0 && !modified && !hadAttachments) continue;

  // 确保顶层 attachments 数组存在
  if (!data.attachments) data.attachments = [];

  // 清理并提取顶层可能存在的 raw 视频附件，以及清理旧版 "video 在线预览"
  const videoAttachmentsToProcess = [];
  const remainingAttachments = [];
  for (const a of data.attachments) {
    if (isVideoAttachment(a)) {
      videoAttachmentsToProcess.push(a);
      modified = true;
    } else if (a.name === 'video 在线预览') {
      modified = true;
    } else {
      remainingAttachments.push(a);
    }
  }
  data.attachments = remainingAttachments;

  // 1. 推广非视频附件（如 trace、screenshot）到顶层；收集视频附件用于后续预览生成
  for (const { attachment } of collected) {
    if (isVideoAttachment(attachment)) {
      videoAttachmentsToProcess.push(attachment);
      continue;
    }
    // 避免重复：顶层已有同名同源附件则跳过
    const exists = data.attachments.some(
      a => a.name === attachment.name && a.source === attachment.source,
    );
    if (!exists) {
      data.attachments.push({ ...attachment });
      modified = true;
      promoted++;
    }
  }

  // 2. 为所有收集到的视频附件生成 HTML 预览（命名为 'video'，并加入顶层），不推广原始 WebM 到顶层
  const processedVideoSources = new Set();
  for (const attachment of videoAttachmentsToProcess) {
    if (!attachment.source) {
      continue;
    }
    if (processedVideoSources.has(attachment.source)) {
      continue;
    }
    processedVideoSources.add(attachment.source);
    modified = ensureVideoPreviewAttachment(data, attachment) || modified;
  }

  if (modified) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    modifiedResults++;
  }
}

console.log(
  `[promote-videos] 扫描 ${scanned} 条结果，提升 ${promoted} 个附件到顶层，更新 ${modifiedResults} 条结果，规范 ${normalized} 个视频附件，补充 ${copiedVideoFiles} 个 .webm 文件，新增 ${previewAttachments} 个视频预览附件，写入 ${previewFiles} 个预览文件`,
);
