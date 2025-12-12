let handpose, video, predictions = [];
let ellipses = [];
let ellipseX, ellipseY, ellipseWidth, ellipseHeight, ellipseAngle;
let textIndex = 0;

let paragraph = '';
let textArray;

let waveAmount = 4;
let blurAmount = 0;
let fontSize = 18;
let alphaFill = 220;
let tracking = 1.2;
let yOffset = 0;

let mirrorEnabled = true;
let layoutMode = 'spread';

let previewGrid, galleryGrid;
let mainCanvas;

let canvasHost;

const $ = (s) => document.querySelector(s);

window.addEventListener('DOMContentLoaded', () => {
    const fontSlider = $('#fontSlider');
    const waveSlider = $('#waveSlider');
    const blurSlider = $('#blurSlider');
    const saveBtn = $('#saveBtn');
    const downloadBtn = $('#downloadBtn');
    const resetBtn = $('#resetBtn');
    const mirrorBtn = $('#mirrorBtn');
    const publishLink = document.querySelector('.publish');
    const galleryLink = $('#galleryLink');
    const textInput = $('#textInput');
    const titleInput = $('#titleInput');
    const dateInput = $('#dateInput');
    const galleryPage = $('#galleryPage');
    const frame = document.querySelector('.frame');
    const backFromGallery = $('#backFromGallery');

    previewGrid = document.getElementById('previewGrid');
    galleryGrid = document.getElementById('galleryGrid');

    // 默认 date = 今天
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // Layout buttons
    const layoutButtons = document.querySelectorAll('.layout-btn');
    layoutButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            layoutMode = btn.dataset.layout || 'spread';
            layoutButtons.forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    if (fontSlider) {
        fontSlider.addEventListener('input', e => {
            fontSize = parseInt(e.target.value, 10);
            try { textSize(fontSize); } catch (_) { }
        });
    }

    if (waveSlider) {
        waveSlider.addEventListener('input', e => {
            waveAmount = parseInt(e.target.value, 10);
        });
    }

    if (blurSlider) {
        blurSlider.addEventListener('input', e => {
            blurAmount = parseInt(e.target.value, 10);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveCurrentEllipse();
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            saveCanvas('ink-' + Date.now(), 'png');
            addThumbnail(previewGrid);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            ellipses = [];
            textIndex = 0;
        });
    }

    if (mirrorBtn) {
        mirrorBtn.addEventListener('click', () => {
            mirrorEnabled = !mirrorEnabled;
            mirrorBtn.textContent = mirrorEnabled ? 'Mirror: On' : 'Mirror: Off';
        });
    }

    // Gallery 全屏视图开关
    if (galleryLink && galleryPage && frame && backFromGallery) {
        galleryLink.addEventListener('click', (e) => {
            e.preventDefault();
            frame.style.display = 'none';
            galleryPage.classList.remove('hidden');
        });

        backFromGallery.addEventListener('click', () => {
            galleryPage.classList.add('hidden');
            frame.style.display = '';
        });
    }

    // Publish -> 加入 Gallery
    if (publishLink) {
        publishLink.addEventListener('click', (e) => {
            e.preventDefault();
            addGalleryItem(titleInput?.value || 'Untitled', dateInput?.value || '', paragraph || '');
        });
    }

    // 文本驱动画布文字
    if (textInput) {
        paragraph = textInput.value || '';
        textArray = paragraph.split('');

        textInput.addEventListener('input', (e) => {
            paragraph = e.target.value || '';
            textArray = paragraph.split('');
            ellipses = [];
            textIndex = 0;
        });
    } else {
        paragraph = paragraph || '';
        textArray = paragraph.split('');
    }
});

function setup() {
    canvasHost = document.getElementById('canvasHost');

    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    const cnv = createCanvas(w, h);
    cnv.parent(canvasHost);
    mainCanvas = cnv;

    pixelDensity(window.devicePixelRatio || 1);

    textFont('Courier New');
    textSize(fontSize);
    textAlign(CENTER, CENTER);

    video = createCapture(VIDEO, () => { });
    video.size(width, height);
    video.hide();

    handpose = ml5.handpose(video, () => console.log('Handpose ready'));
    handpose.on('predict', r => { predictions = r; });

    if (!textArray) {
        textArray = (paragraph || '').split('');
    }
}

function windowResized() {
    if (!canvasHost) return;
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    resizeCanvas(w, h);
    if (video) video.size(width, height);
}

function draw() {
    clear();
    background(255);

    const time = millis() / 2000;
    const time2 = time + 5;

    if (predictions.length > 0) {
        updateControlledEllipse();
        drawControlledEllipse(time, time2);

        if (mirrorEnabled) {
            drawMirroredEllipse(time, time2);
        }
    }

    drawAllEllipses(time, time2);

    // ----- DEBUG: 画出画布的边框看看 -----
    //stroke(255, 0, 0);
    //noFill();
    //rect(0, 0, width - 1, height - 1);
}

// X 布局映射：spread / left / right
function mapLayoutX(x) {
    if (layoutMode === 'left') return x * 0.5;
    if (layoutMode === 'right') return x * 0.5 + width / 2;
    return x;
}

function updateControlledEllipse() {
    const lm = predictions[0]?.landmarks;
    if (!lm || !lm.length) return;

    let sumX = 0, sumY = 0;
    for (let i = 0; i < lm.length; i++) {
        sumX += lm[i][0];
        sumY += lm[i][1];
    }
    let cx = sumX / lm.length;
    let cy = sumY / lm.length;

    cx = mapLayoutX(cx);

    // ===== CHANGED START =====
    // 保留你喜欢的原始“手感映射”（30%~70%）
    const topActive = height * 0.3;
    const bottomActive = height * 0.7;

    let cyMapped = map(cy, topActive, bottomActive, -height * 0.15, height * 1.3);

    // 1) 围绕中心做伸缩：保持你原本“中段手感”
    const yReach = 1.28;   // 想更容易到底：1.28~1.38；想更稳：1.15~1.22
    cyMapped = (cyMapped - height / 2) * yReach + height / 2;

    // 2) 关键补齐：轻微向下平移，让“触底”真的发生（不改变中段比例）
    const yBias = height * 0.20; // 可调：0.08~0.20（越大越容易到底）
    cyMapped = cyMapped + yBias;

    cyMapped = constrain(cyMapped, 0, height);
    // ===== CHANGED END =====

    ellipseX = lerp(ellipseX ?? cx, cx, 0.2);
    ellipseY = lerp(ellipseY ?? (cyMapped + yOffset), cyMapped + yOffset, 0.2);

    let maxX = 0, maxY = 0;
    for (let i = 0; i < lm.length; i++) {
        for (let j = i + 1; j < lm.length; j++) {
            maxX = Math.max(maxX, Math.abs(lm[i][0] - lm[j][0]));
            maxY = Math.max(maxY, Math.abs(lm[i][1] - lm[j][1]));
        }
    }
    ellipseWidth = lerp(ellipseWidth ?? 100, maxX, 0.2);
    ellipseHeight = lerp(ellipseHeight ?? 100, maxY, 0.2);

    if (lm[4] && lm[8]) {
        const dx = lm[4][0] - lm[8][0];
        const dy = lm[4][1] - lm[8][1];
        const angle = Math.atan2(dy, dx);
        ellipseAngle = lerp(ellipseAngle ?? angle, angle, 0.2);
    }
}

function drawControlledEllipse(t1, t2) {
    drawEllipseWithText(
        ellipseX,
        ellipseY,
        ellipseWidth,
        ellipseHeight,
        ellipseAngle,
        textIndex,
        false,
        t1,
        t2
    );
}

function drawMirroredEllipse(t1, t2) {
    drawEllipseWithText(
        width - (ellipseX ?? 0),
        ellipseY,
        ellipseWidth,
        ellipseHeight,
        Math.PI - (ellipseAngle ?? 0),
        textIndex,
        true,
        t1,
        t2
    );
}

function drawAllEllipses(t1, t2) {
    for (let e of ellipses) {
        if (e.fade && e.opacity > 0) {
            e.opacity = Math.max(0, e.opacity - 2);
        }

        drawFixedTextEllipse(
            e.x, e.y, e.w, e.h, e.angle,
            e.text,
            false,
            e.opacity,
            t1, t2
        );

        if (mirrorEnabled) {
            drawFixedTextEllipse(
                width - e.x, e.y, e.w, e.h,
                Math.PI - e.angle,
                e.text,
                true,
                e.opacity,
                t1, t2
            );
        }
    }
}

function drawEllipseWithText(cx, cy, w, h, angle, startIndex, mirrored, t1, t2) {
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
    if (!textArray || textArray.length === 0) return;

    push();
    translate(cx, cy);
    rotate(angle);
    noFill();
    noStroke();
    ellipse(0, 0, w, h);

    const perim = Math.PI * ((w + h) / 2);
    const baseSteps = Math.max(1, Math.floor(perim / Math.max(8, fontSize)));
    const steps = Math.max(1, Math.floor(baseSteps / tracking));
    const count = Math.min(textArray.length - startIndex, steps);
    const step = TWO_PI / steps;

    for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        let a = -PI / 2 + i * step;
        if (mirrored) a *= -1;

        const x = (w / 2) * Math.cos(a);
        const y = (h / 2) * Math.sin(a);

        const yOff = noise(x / 100, y / 100, t1) * waveAmount - waveAmount / 2;
        const angleOff = noise(x / 50 + 5, y / 50 + 5, t2) * waveAmount / 30 - waveAmount / 60;

        push();
        translate(x, y + yOff);
        const tangent = a + HALF_PI + angleOff;
        rotate(tangent);

        fill(0, alphaFill);
        noStroke();
        drawingContext.shadowColor = 'black';
        drawingContext.shadowBlur = blurAmount;
        text(textArray[idx], 0, 0);
        pop();
    }

    pop();
}

function drawFixedTextEllipse(cx, cy, w, h, angle, fixedText, mirrored, opacity = 255, t1, t2) {
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
    if (!fixedText || fixedText.length === 0) return;

    push();
    translate(cx, cy);
    rotate(angle);
    noFill();
    noStroke();
    ellipse(0, 0, w, h);

    const perim = Math.PI * ((w + h) / 2);
    const baseSteps = Math.max(1, Math.floor(perim / Math.max(8, fontSize)));
    const steps = Math.max(1, Math.floor(baseSteps / tracking));
    const count = Math.min(fixedText.length, steps);
    const step = TWO_PI / steps;

    for (let i = 0; i < count; i++) {
        let a = -PI / 2 + i * step;
        if (mirrored) a *= -1;

        const x = (w / 2) * Math.cos(a);
        const y = (h / 2) * Math.sin(a);

        const yOff = noise(x / 100, y / 100, t1) * waveAmount - waveAmount / 2;
        const angleOff = noise(x / 50 + 5, y / 50 + 5, t2) * waveAmount / 30 - waveAmount / 60;

        push();
        translate(x, y + yOff);
        const tangent = a + HALF_PI + angleOff;
        rotate(tangent);

        fill(0, opacity);
        noStroke();
        drawingContext.shadowColor = 'black';
        drawingContext.shadowBlur = blurAmount;
        text(fixedText[i], 0, 0);
        pop();
    }

    pop();
}

function saveCurrentEllipse() {
    if (!textArray || textArray.length === 0) return;

    const denom = Math.max(8, fontSize);
    const perim = Math.PI * ((ellipseWidth ?? 0) + (ellipseHeight ?? 0)) / 2;
    const base = Math.max(1, Math.floor(perim / denom));
    const charsPerCircle = Math.max(1, Math.floor(base / tracking));
    const end = Math.min(textIndex + charsPerCircle, textArray.length);

    const slice = textArray.slice(textIndex, end);
    ellipses.push({
        x: ellipseX ?? width / 2,
        y: ellipseY ?? height / 2,
        w: ellipseWidth ?? 100,
        h: ellipseHeight ?? 100,
        angle: ellipseAngle ?? 0,
        text: slice,
        fade: false,
        opacity: 255
    });

    textIndex = end;
}

function addThumbnail(target) {
    if (!mainCanvas || !target) return;
    try {
        const img = new Image();
        img.src = mainCanvas.elt.toDataURL('image/png');
        img.className = 'thumb';
        target.appendChild(img);
    } catch (e) {
        console.error('Failed to create thumbnail', e);
    }
}

function addGalleryItem(title, dateStr, textSnippet) {
    if (!mainCanvas || !galleryGrid) return;
    try {
        const dataUrl = mainCanvas.elt.toDataURL('image/png');

        const item = document.createElement('article');
        item.className = 'gallery-item';

        const img = document.createElement('img');
        img.className = 'gallery-item-thumb';
        img.src = dataUrl;
        item.appendChild(img);

        const meta = document.createElement('div');
        meta.className = 'gallery-item-meta';
        const titleLine = document.createElement('div');
        titleLine.textContent = title || 'Untitled';
        const dateLine = document.createElement('div');
        dateLine.textContent = dateStr || '';
        const textLine = document.createElement('div');
        textLine.textContent = (textSnippet || '').slice(0, 80) + (textSnippet && textSnippet.length > 80 ? '…' : '');
        meta.appendChild(titleLine);
        if (dateStr) meta.appendChild(dateLine);
        if (textSnippet) meta.appendChild(textLine);

        item.appendChild(meta);
        galleryGrid.appendChild(item);
    } catch (e) {
        console.error('Failed to create gallery item', e);
    }
}

function keyPressed() {
    if (key === 'a' || key === 'A') {
        saveCurrentEllipse();
    }

    if (key === 'm' || key === 'M') {
        mirrorEnabled = !mirrorEnabled;
        const mirrorBtn = document.querySelector('#mirrorBtn');
        if (mirrorBtn) {
            mirrorBtn.textContent = mirrorEnabled ? 'Mirror: On' : 'Mirror: Off';
        }
    }
}
