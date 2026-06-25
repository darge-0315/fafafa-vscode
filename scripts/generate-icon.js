const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/** 计算像素饱和度 */
function getSaturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) {
    return 0;
  }
  return (max - min) / max;
}

/** 判断像素是否为棋盘格或白底背景 */
function isCheckerboardPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = getSaturation(r, g, b);
  if (max >= 248 && sat < 0.03) {
    return true;
  }
  if (max >= 232 && sat < 0.06) {
    return true;
  }
  if (max >= 165 && max <= 250 && sat < 0.05 && max - min < 15) {
    return true;
  }
  return false;
}

/** 判断像素是否为外侧背景（白底、浅灰投影等，不含红色字与牌面） */
function isOuterBackground(r, g, b) {
  if (r > 120 && r > g * 1.15 && r > b * 1.15) {
    return false;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = getSaturation(r, g, b);
  if (max >= 232 && sat < 0.09) {
    return true;
  }
  if (max >= 140 && max <= 248 && sat < 0.12 && max - min < 30) {
    return true;
  }
  return false;
}

/** 判断像素是否属于 logo 前景（红色「发」字或米色描边） */
function isForegroundPixel(r, g, b) {
  if (r > 120 && r > g * 1.15 && r > b * 1.15) {
    return true;
  }
  if (r > 220 && g > 215 && b > 170 && r - b > 15) {
    return true;
  }
  return false;
}

/** 从种子点泛洪填充，将连通背景设为透明 */
function floodFillTransparent(data, width, height, seeds, isBackgroundFn) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (const seed of seeds) {
    const { x, y } = seed;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }
    const index = y * width + x;
    if (visited[index]) {
      continue;
    }
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (!isBackgroundFn(r, g, b)) {
      continue;
    }
    visited[index] = 1;
    queue.push(index);
  }

  while (queue.length > 0) {
    const index = queue.pop();
    const offset = index * 4;
    data[offset + 3] = 0;

    const x = index % width;
    const y = (index - x) / width;
    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
    ];

    for (const { nx, ny } of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const nextIndex = ny * width + nx;
      if (visited[nextIndex]) {
        continue;
      }
      const nextOffset = nextIndex * 4;
      const r = data[nextOffset];
      const g = data[nextOffset + 1];
      const b = data[nextOffset + 2];
      if (!isBackgroundFn(r, g, b)) {
        continue;
      }
      visited[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }
}

/** 生成边缘采样种子点 */
function buildEdgeSeeds(width, height) {
  const seeds = [];
  for (let x = 0; x < width; x++) {
    seeds.push({ x, y: 0 });
    seeds.push({ x, y: height - 1 });
  }
  for (let y = 0; y < height; y++) {
    seeds.push({ x: 0, y });
    seeds.push({ x: width - 1, y });
  }
  return seeds;
}

/** 计算前景主体边界，用于裁掉水印与多余留白 */
function getForegroundBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (!isForegroundPixel(r, g, b)) {
        continue;
      }
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width, height };
  }

  const pad = Math.round(Math.min(width, height) * 0.02);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(width - 1, maxX + pad);
  const bottom = Math.min(height - 1, maxY + pad);

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

/** 裁剪缓冲区到指定区域 */
function cropBuffer(data, width, height, bounds) {
  const { left, top, width: cropW, height: cropH } = bounds;
  const cropped = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((top + y) * width + (left + x)) * 4;
      const dst = (y * cropW + x) * 4;
      cropped[dst] = data[src];
      cropped[dst + 1] = data[src + 1];
      cropped[dst + 2] = data[src + 2];
      cropped[dst + 3] = data[src + 3];
    }
  }
  return { data: cropped, width: cropW, height: cropH };
}

/** 清理未被泛洪触及的残留背景与边缘噪点 */
function cleanupBackgroundPixels(data, width, height) {
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (isCheckerboardPixel(r, g, b)) {
      data[offset + 3] = 0;
      continue;
    }
    if (isForegroundPixel(r, g, b)) {
      continue;
    }
    const max = Math.max(r, g, b);
    const sat = getSaturation(r, g, b);
    if (max < 245 && sat < 0.08) {
      data[offset + 3] = 0;
    }
  }
}

/** 从中心保留与主体连通的像素，移除圆角外孤立米色噪点 */
function keepCenterConnectedForeground(data, width, height) {
  const keep = new Uint8Array(width * height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const startIndex = cy * width + cx;
  const startOffset = startIndex * 4;
  if (data[startOffset + 3] === 0) {
    return;
  }
  if (isOuterBackground(data[startOffset], data[startOffset + 1], data[startOffset + 2])) {
    return;
  }

  const queue = [startIndex];
  keep[startIndex] = 1;

  while (queue.length > 0) {
    const index = queue.pop();
    const x = index % width;
    const y = (index - x) / width;
    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
    ];

    for (const { nx, ny } of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const nextIndex = ny * width + nx;
      if (keep[nextIndex]) {
        continue;
      }
      const offset = nextIndex * 4;
      if (data[offset + 3] === 0) {
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (isOuterBackground(r, g, b)) {
        continue;
      }
      keep[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }

  for (let index = 0; index < width * height; index++) {
    if (keep[index]) {
      continue;
    }
    const offset = index * 4;
    data[offset + 3] = 0;
  }
}

/** 对图像缓冲区移除棋盘格/白底背景 */
function removeCheckerboardBackground(data, width, height) {
  const seeds = buildEdgeSeeds(width, height);
  floodFillTransparent(data, width, height, seeds, isCheckerboardPixel);
  cleanupBackgroundPixels(data, width, height);
}

/** 将抠图后的缓冲区转为 sharp 实例 */
function bufferToSharp(data, width, height) {
  return sharp(Buffer.from(data), {
    raw: {
      width,
      height,
      channels: 4,
    },
  });
}

/** 解析 logo 源文件路径（优先 logo.png） */
function resolveLogoInput(root) {
  const candidates = ['logo.png', 'logo.jpg'];
  for (const name of candidates) {
    const filePath = path.join(root, name);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  throw new Error('未找到 logo.png 或 logo.jpg');
}

/** 从 logo 源图生成透明背景 VS Code 扩展图标 */
async function generateIcon() {
  const root = path.join(__dirname, '..');
  const input = resolveLogoInput(root);
  const output128 = path.join(root, 'images', 'icon.png');
  const output256 = path.join(root, 'images', 'icon@2x.png');
  const outputPreview = path.join(root, 'images', 'icon-preview.png');

  const source = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const data = Buffer.from(source.data);
  removeCheckerboardBackground(data, source.info.width, source.info.height);
  keepCenterConnectedForeground(data, source.info.width, source.info.height);
  cleanupBackgroundPixels(data, source.info.width, source.info.height);

  const transparentBg = { r: 0, g: 0, b: 0, alpha: 0 };
  const transparent = bufferToSharp(data, source.info.width, source.info.height)
    .trim()
    .sharpen({ sigma: 0.35 })
    .modulate({ brightness: 1.02, saturation: 1.05 });

  await transparent.clone().resize(128, 128, { fit: 'contain', background: transparentBg })
    .png({ compressionLevel: 9 })
    .toFile(output128);
  await transparent.clone().resize(256, 256, { fit: 'contain', background: transparentBg })
    .png({ compressionLevel: 9 })
    .toFile(output256);
  await transparent.clone().resize(512, 512, { fit: 'contain', background: transparentBg })
    .png({ compressionLevel: 9 })
    .toFile(outputPreview);

  console.log('source:', input);
  console.log('generated:', output128, output256, outputPreview);
}

generateIcon().catch((err) => {
  console.error(err);
  process.exit(1);
});
