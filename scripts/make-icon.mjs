#!/usr/bin/env node
/**
 * Генерация webview2/icon.ico из фотографии webview2/icon-source.png.
 *
 * Иконка приложения — та же, что у ярлыка на рабочем столе, в трее, на
 * панели задач и в диспетчере задач: Windows берёт её из exe, а exe — из
 * этого файла. Источник — обычная PNG-картинка, поэтому иконку можно
 * заменить, просто переложив файл: внешние библиотеки и Photoshop не нужны.
 *
 * Скрипт не тянет зависимостей: PNG читается и пишется на встроенном zlib
 * (это уже было условием для прежней рисованной иконки).
 *
 * Чёрные углы убираются сами: если исходник непрозрачный, всё чёрное,
 * что связано с краями картинки, становится прозрачным с мягким краем —
 * на ярлыке, в трее и на панели задач не будет чёрных уголков.
 *
 * Запуск: node scripts/make-icon.mjs
 */
import { deflateSync, inflateSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Размеры в ICO: от значка в трее до крупной плитки в проводнике. */
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SOURCE = "webview2/icon-source.png";
const OUT = "webview2/icon.ico";

/* ---------- чтение PNG ---------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Разбор PNG в RGBA-пиксели (8 бит на канал, без черезстрочного режима). */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("это не PNG-файл");

  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let palette = null;
  let alphaTable = null;
  const idat = [];

  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length; // данные + CRC

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("черезстрочный (interlaced) PNG не поддерживается");
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      alphaTable = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) throw new Error("в PNG нет заголовка IHDR");
  if (bitDepth !== 8) throw new Error(`поддерживается только 8 бит на канал (в файле ${bitDepth})`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`неизвестный тип цвета PNG: ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const filterBpp = channels;

  // Обратный ход фильтров PNG — построчно.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = pixels.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= filterBpp ? row[x - filterBpp] : 0; // слева
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0; // сверху
      const c = x >= filterBpp && y > 0 ? pixels[(y - 1) * stride + x - filterBpp] : 0; // слева-сверху
      const v = src[x];

      let value;
      switch (filter) {
        case 0:
          value = v;
          break;
        case 1:
          value = v + a;
          break;
        case 2:
          value = v + b;
          break;
        case 3:
          value = v + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a),
            pb = Math.abs(p - b),
            pc = Math.abs(p - c);
          value = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`неизвестный фильтр строки PNG: ${filter}`);
      }
      row[x] = value & 0xff;
    }
  }

  // Приводим к RGBA — дальше всё считается по четырём каналам.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    let r, g, b, a;
    switch (colorType) {
      case 0:
        r = g = b = pixels[i];
        a = 255;
        break;
      case 4:
        r = g = b = pixels[i * 2];
        a = pixels[i * 2 + 1];
        break;
      case 2:
        r = pixels[i * 3];
        g = pixels[i * 3 + 1];
        b = pixels[i * 3 + 2];
        a = 255;
        break;
      case 6:
        r = pixels[i * 4];
        g = pixels[i * 4 + 1];
        b = pixels[i * 4 + 2];
        a = pixels[i * 4 + 3];
        break;
      default: {
        // палитра
        const idx = pixels[i];
        r = palette?.[idx * 3] ?? 0;
        g = palette?.[idx * 3 + 1] ?? 0;
        b = palette?.[idx * 3 + 2] ?? 0;
        a = alphaTable && idx < alphaTable.length ? alphaTable[idx] : 255;
      }
    }
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }

  return { width, height, rgba };
}

/* ---------- прозрачные углы ---------- */

/**
 * Убирает чёрные углы и кромку у непрозрачного исходника.
 *
 * Нейросети и фоторедакторы обычно отдают картинку без прозрачности:
 * скруглённый значок лежит на чёрном квадрате, и этот квадрат потом
 * виден на ярлыке, в трее и на панели задач как чёрные уголки.
 *
 * Чинится заливкой от краёв: всё чёрное, что связано с краем картинки,
 * становится прозрачным, а на границе с рисунком делается мягкий
 * переход в 1–2 пикселя, чтобы край не выглядел лесенкой.
 * Тёмные детали внутри рисунка не трогаем: заливка идёт только через
 * соседние тёмные пиксели и не уходит дальше 120 пикселей от края —
 * яркое неоновое кольцо вокруг рисунка её надёжно останавливает.
 *
 * Если у исходника уже есть прозрачность — ничего не делаем.
 * Возвращает, сколько пикселей стали прозрачными или полупрозрачными.
 */
function knockOutEdgeBlack(rgba, width, height) {
  // Исходник уже с прозрачностью — оставляем как есть.
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) return 0;
  }

  const T0 = 12; // тусклее — полностью прозрачный
  const T1 = 64; // ярче — полностью непрозрачный, между — мягкий край
  const MAX_DIST = 120; // дальше от края не заходим (страховка от протечек внутрь)

  const seen = new Uint8Array(width * height);
  const stack = [];
  const bright = (x, y) => {
    const i = (y * width + x) * 4;
    return Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
  };

  // Сеем заливку по всей рамке картинки.
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      if (bright(x, y) < T1) {
        seen[y * width + x] = 1;
        stack.push(x, y);
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const n = y * width + x;
      if (!seen[n] && bright(x, y) < T1) {
        seen[n] = 1;
        stack.push(x, y);
      }
    }
  }

  let knocked = 0;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const b = bright(x, y);
    rgba[(y * width + x) * 4 + 3] = b <= T0 ? 0 : Math.round((255 * (b - T0)) / (T1 - T0));
    knocked++;

    const next = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      // Вглубь дальше MAX_DIST от края не идём.
      if (nx > MAX_DIST && nx < width - 1 - MAX_DIST && ny > MAX_DIST && ny < height - 1 - MAX_DIST) continue;
      const n = ny * width + nx;
      if (seen[n] || bright(nx, ny) >= T1) continue;
      seen[n] = 1;
      stack.push(nx, ny);
    }
  }
  return knocked;
}

/* ---------- уменьшение ---------- */

/**
 * Квадратное уменьшение усреднением по площади: для иконок это даёт
 * ровную картинку без «звона» (фотография не мылится и не темнеет).
 */
function resizeSquare(src, srcW, srcH, size, crop) {
  // crop — квадратная область источника, которую показываем целиком
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    const sy0 = crop.y + (y * crop.size) / size;
    const sy1 = crop.y + ((y + 1) * crop.size) / size;
    for (let x = 0; x < size; x++) {
      const sx0 = crop.x + (x * crop.size) / size;
      const sx1 = crop.x + ((x + 1) * crop.size) / size;

      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        wsum = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const y0 = Math.max(sy, sy0);
        const y1 = Math.min(sy + 1, sy1);
        if (y1 <= y0) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const x0 = Math.max(sx, sx0);
          const x1 = Math.min(sx + 1, sx1);
          if (x1 <= x0) continue;

          const w = (y1 - y0) * (x1 - x0);
          const i = (Math.min(sy, srcH - 1) * srcW + Math.min(sx, srcW - 1)) * 4;
          // Прозрачность взвешиваем: иначе прозрачные пиксели «подкрашивают» край
          const alpha = src[i + 3] / 255;
          r += src[i] * alpha * w;
          g += src[i + 1] * alpha * w;
          b += src[i + 2] * alpha * w;
          a += src[i + 3] * w;
          wsum += w;
        }
      }

      const o = (y * size + x) * 4;
      const alphaSum = a / (wsum || 1);
      const norm = alphaSum > 0 ? 255 / alphaSum : 0;
      out[o] = Math.min(255, Math.round((r / (wsum || 1)) * norm));
      out[o + 1] = Math.min(255, Math.round((g / (wsum || 1)) * norm));
      out[o + 2] = Math.min(255, Math.round((b / (wsum || 1)) * norm));
      out[o + 3] = Math.round(alphaSum);
    }
  }
  return out;
}

/** Обрезка до квадрата по центру: фотография не растягивается. */
function squareCrop(width, height) {
  const size = Math.min(width, height);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

/* ---------- запись PNG и ICO ---------- */

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // фильтр строки — без обработки
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // зарезервировано
  header.writeUInt16LE(1, 2); // тип: иконка
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((img, i) => {
    const e = i * 16;
    directory[e] = img.size >= 256 ? 0 : img.size; // 0 означает 256
    directory[e + 1] = img.size >= 256 ? 0 : img.size;
    directory[e + 2] = 0; // цветов в палитре нет
    directory[e + 3] = 0;
    directory.writeUInt16LE(1, e + 4); // плоскостей
    directory.writeUInt16LE(32, e + 6); // бит на пиксель
    directory.writeUInt32LE(img.png.length, e + 8);
    directory.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

/* ---------- сборка ---------- */

if (!existsSync(SOURCE)) {
  throw new Error(
    `Не найден ${SOURCE} — исходная картинка иконки.\n` +
      "Положите её рядом с webview2/icon.ico и запустите скрипт снова.",
  );
}

const source = decodePng(readFileSync(SOURCE));
const knocked = knockOutEdgeBlack(source.rgba, source.width, source.height);
if (knocked > 0) {
  const pct = ((100 * knocked) / (source.width * source.height)).toFixed(1);
  console.log(`Углы: ${knocked} тёмных пикселей у краёв стали прозрачными (${pct}% картинки)`);
}
const crop = squareCrop(source.width, source.height);
const images = SIZES.map((size) => ({
  size,
  png: encodePng(resizeSquare(source.rgba, source.width, source.height, size, crop), size),
}));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buildIco(images));

const kb = (Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(1);
console.log(
  `Иконка: ${SOURCE} (${source.width}×${source.height}) → ${OUT} ` + `(${SIZES.length} размеров, ${kb} КБ)`,
);
