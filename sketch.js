let solData2D = [], solData3D = [];
let grid2D = [], grid3D = [];
let activePieces = [];
let chamferedCube2D = [], chamferedCube3D = [];

let rotX = -0.5, rotY = 0.5, zoom = 1.35;
const offset2D = -130, offset3D = 130;

const States = { WAIT_2D: 0, MOV_3D: 1, WAIT_3D: 2, MOV_2D: 3 };
let currentState = States.WAIT_2D;
let currentMovingIdx = 0;
let moveProgress = 0;
let lastStateTime = 0;
const waitDuration = 10000;

let speedMode = 0; // 0: Normal, 1: Slow, 2: Super Slow
const speedSteps = [0.05, 0.02, 0.008];
const speedLabels = ["Normal", "Slow", "Super Slow"];

function preload() {
    loadJSON('solutions.json', (data) => {
        let allData = Object.values(data);
        solData2D = allData.filter(s => s.mode.includes("2D"));
        solData3D = allData.filter(s => s.mode === "PYRAMID");
        console.log("2D Loaded:", solData2D.length, "3D Loaded:", solData3D.length);
    });
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    ortho(-width / 2, width / 2, -height / 2, height / 2, -5000, 5000);
    initGrids();
    initChamferedShapes(15.0);
    setTimeout(() => {
        if (solData2D.length > 0 && solData3D.length > 0) {
            loadNewSolutionPair();
            lastStateTime = millis();
        }
    }, 1000);
}

function draw() {
    background(235);
    
    // --- 仕上げ設定: フラットで明るいライト ---
    ambientLight(255, 255, 255);
    // pointLightは無効化（フラットな見た目のため）

    push();
    translate(0, 50, 0);
    scale(zoom);
    rotateX(rotX);
    rotateY(rotY);

    drawBases();
    updateAndDrawPieces();
    pop();
    
    updateUI();
}

function mouseDragged() {
    rotY += (mouseX - pmouseX) * 0.01;
    rotX -= (mouseY - pmouseY) * 0.01;
}

function mouseWheel(event) {
    zoom = constrain(zoom - event.delta * 0.001, 0.1, 5.0);
    return false;
}

function initGrids() {
    const spacing = 30.0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 7; c++) {
            let x = (c - 3.0) * spacing;
            if (r % 2 === 1) x -= spacing / 2.0;
            let z = (3.5 - r) * (spacing * 0.866);
            grid2D.push(createVector(x + offset2D + spacing/4, 0, z));
        }
    }
    for (let d = 0; d < 6; d++) {
        let sideLen = 6 - d;
        for (let r = 0; r < sideLen; r++) {
            for (let c = 0; c < sideLen - r; c++) {
                let x = (c + r * 0.5 - (sideLen - 1) * 0.5) * spacing;
                let z = (r * 0.866 - (sideLen - 1) * 0.288) * spacing;
                let y = -d * 0.816 * spacing;
                grid3D.push(createVector(x + offset3D, y, z));
            }
        }
    }
}

function loadNewSolutionPair() {
    if (solData2D.length === 0 || solData3D.length === 0) return;
    let s2 = random(solData2D);
    let s3 = random(solData3D);
    document.getElementById('file-2d-display').innerText = "2D: " + s2.fileName;
    document.getElementById('file-3d-display').innerText = "3D: " + s3.fileName;

    activePieces = [];
    let p2Map = parseToMap(s2.data);
    let p3Map = parseToMap(s3.data);

    for (let name in p3Map) {
        if (p2Map[name]) {
            let p = {
                name: name,
                color: getPieceColorImageTrainer(name),
                pts2D: getPointsFromMask(p2Map[name], grid2D),
                pts3D: getPointsFromMask(p3Map[name], grid3D),
                avgY3D: 0,
                isClumsy: random(1) < 0.05,
                clumsyTimer: 0,
                scatterSeed: random(TWO_PI)
            };
            if (p.pts3D.length === 4 && p.pts2D.length === 4) {
                let sumY = 0; p.pts3D.forEach(v => sumY += v.y);
                p.avgY3D = sumY / 4;
                activePieces.push(p);
            }
        }
    }
    activePieces.sort((a, b) => b.avgY3D - a.avgY3D);
}

function updateAndDrawPieces() {
    if (activePieces.length === 0) return;
    let now = millis();
    let elapsed = now - lastStateTime;

    if (currentState === States.WAIT_2D && elapsed > waitDuration) {
        currentState = States.MOV_3D; currentMovingIdx = 0; moveProgress = 0;
    } else if (currentState === States.WAIT_3D && elapsed > waitDuration) {
        currentState = States.MOV_2D; currentMovingIdx = activePieces.length - 1; moveProgress = 0;
    }

    activePieces.forEach((p, i) => {
        let t = (currentState === States.WAIT_2D || currentState === States.WAIT_3D) ? 1.0 : 0;
        if (currentState === States.MOV_3D) {
            if (i < currentMovingIdx) t = 1.0;
            else if (i === currentMovingIdx) {
                if (p.isClumsy && moveProgress > 0.6 && moveProgress < 0.8 && p.clumsyTimer < 1000) {
                    p.clumsyTimer += deltaTime;
                } else { moveProgress += speedSteps[speedMode]; }
                t = easeInOutCubic(moveProgress);
                if (moveProgress >= 1.0) { currentMovingIdx++; moveProgress = 0; if (currentMovingIdx >= activePieces.length) { currentState = States.WAIT_3D; lastStateTime = now; } }
            }
        } else if (currentState === States.MOV_2D) {
            if (i > currentMovingIdx) t = 1.0;
            else if (i === currentMovingIdx) {
                moveProgress += speedSteps[speedMode];
                t = easeInOutCubic(moveProgress);
                if (moveProgress >= 1.0) { currentMovingIdx--; moveProgress = 0; if (currentMovingIdx < 0) { currentState = States.WAIT_2D; lastStateTime = now; loadNewSolutionPair(); } }
            }
        }
        drawPiece(p, t);
    });
}

function drawPiece(p, t) {
    let startCog = createVector(0,0,0), endCog = createVector(0,0,0);
    let startPts, endPts, shapes;
    if (currentState === States.MOV_3D || currentState === States.WAIT_3D) {
        p.pts2D.forEach(v => startCog.add(v)); p.pts3D.forEach(v => endCog.add(v));
        startPts = p.pts2D; endPts = p.pts3D;
        shapes = [chamferedCube2D, chamferedCube3D];
    } else {
        p.pts3D.forEach(v => startCog.add(v)); p.pts2D.forEach(v => endCog.add(v));
        startPts = p.pts3D; endPts = p.pts2D;
        shapes = [chamferedCube3D, chamferedCube2D];
    }
    startCog.div(4); endCog.div(4);

    let curCog = p5.Vector.lerp(startCog, endCog, t);
    let scatter = 0;
    let spin = t * TWO_PI * 2.0;

    if (p.isClumsy && (currentState === States.MOV_3D)) {
        let dir = p5.Vector.sub(endCog, startCog).normalize();
        let overJump = p5.Vector.add(endCog, dir.mult(160));
        if (t < 0.5) {
            let t1 = map(t, 0, 0.5, 0, 1); curCog = p5.Vector.lerp(startCog, overJump, t1); curCog.y -= sin(PI * t1) * 350;
        } else if (t < 0.8) {
            curCog = overJump; curCog.y = 15; scatter = 50; spin = 0.4 * TWO_PI;
        } else {
            let t4 = map(t, 0.8, 1.0, 0, 1); curCog = p5.Vector.lerp(createVector(overJump.x, 15, overJump.z), endCog, t4);
            scatter = (1 - t4) * 50; spin = (0.4 + t4 * 1.6) * TWO_PI;
        }
    } else { if (t > 0 && t < 1) curCog.y -= sin(PI * t) * 300; }

    // --- 仕上げ設定: 太めの黒エッジ ---
    fill(p.color); 
    stroke(0); 
    strokeWeight(0.5);

    for (let j = 0; j < 4; j++) {
        let rStart = p5.Vector.sub(startPts[j], startCog);
        let rEnd = p5.Vector.sub(endPts[j], endCog);
        let curR = p5.Vector.lerp(rStart, rEnd, t);
        if (scatter > 0) {
            let ang = p.scatterSeed + j * HALF_PI;
            curR.x += cos(ang) * scatter; curR.z += sin(ang) * scatter;
        }
        push();
        translate(curCog.x, curCog.y, curCog.z);
        let rx = curR.x * cos(spin) - curR.z * sin(spin);
        let rz = curR.x * sin(spin) + curR.z * cos(spin);
        translate(rx, curR.y, rz);
        let targetFaces = (t < 0.5) ? shapes[0] : shapes[1];
        targetFaces.forEach(f => {
            beginShape(); f.forEach(v => vertex(v.x, v.y, v.z)); endShape(CLOSE);
        });
        pop();
    }
}

function drawBases() {
    push(); translate(offset2D, 22.5, 0); fill(215, 210, 195); noStroke(); box(240, 15, 260); pop();
    fill(120, 115, 100); noStroke();
    grid2D.forEach(p => { push(); translate(p.x, 14.8, p.z); rotateX(HALF_PI); ellipse(0, 0, 12, 12); pop(); });

    let side = 210, h_tri = side * 0.866, offZ = h_tri * 0.333;
    push(); translate(offset3D, 15, 0); fill(220, 215, 200); noStroke();
    beginShape(); vertex(-side/2, 0, -offZ); vertex(side/2, 0, -offZ); vertex(0, 0, h_tri - offZ); endShape(CLOSE);
    fill(180, 175, 160);
    beginShape(QUAD_STRIP);
    let vts = [[-side/2, -offZ], [side/2, -offZ], [0, h_tri - offZ], [-side/2, -offZ]];
    vts.forEach(v => { vertex(v[0], 0, v[1]); vertex(v[0], 15, v[1]); });
    endShape();
    pop();
    fill(120, 115, 100, 150);
    for(let i=0; i<21; i++){
        let p = grid3D[i]; push(); translate(p.x, 14.8, p.z); rotateX(HALF_PI); ellipse(0, 0, 12, 12); pop();
    }
}

function parseToMap(raw) {
    let res = {}; if (!raw) return res;
    let cleaned = raw.replace(/[^a-zA-Z0-9,;]/g, '');
    cleaned.split(';').forEach(p => {
        let parts = p.split(',');
        if (parts.length === 2 && parts[1].length > 0) {
            try { res[parts[0]] = BigInt(parts[1]); } catch(e) { console.error("BigInt error:", parts[1]); }
        }
    });
    return res;
}

function getPointsFromMask(mask, grid) {
    let pts = []; if (typeof mask !== 'bigint') return pts;
    for (let i = 0; i < 56; i++) { if ((mask >> BigInt(i)) & 1n) { if (grid[i]) pts.push(grid[i]); } }
    return pts;
}

function getPieceColorImageTrainer(name) {
    colorMode(HSB, 360, 100, 100);
    let br = (name.includes("2") || name.endsWith("R")) ? 0.7 : 1.0;
    let h = 0;
    if (name.startsWith("I")) h = 0;
    else if (name.startsWith("S")) h = 30;
    else if (name.startsWith("Z")) h = 55;
    else if (name.startsWith("C")) h = 90;
    else if (name.startsWith("J")) h = 140;
    else if (name.startsWith("P")) h = 180;
    else if (name.startsWith("T")) h = 210;
    else if (name.startsWith("Y")) h = 250;
    else if (name.startsWith("L")) h = 290;
    else if (name.startsWith("N")) h = 320;
    else if (name.startsWith("O")) h = 350;
    let c = color(h, 75, 90 * br);
    colorMode(RGB, 255);
    return c;
}

function updateUI() {
    let st = (currentState === States.WAIT_2D) ? "FINISHED (IN BOX)" : (currentState === States.WAIT_3D) ? "COMPLETED!" : "METAMORPHOSIS...";
    let el = document.getElementById('state-display');
    if(el) el.innerText = st;
    let timer = Math.max(0, Math.ceil((waitDuration - (millis() - lastStateTime))/1000));
    let tel = document.getElementById('timer-display');
    if(tel) tel.innerText = (st.includes("FINISHED") || st.includes("COMPLETED")) ? "Next in: " + timer + "s" : "";
}

function initChamferedShapes(r) {
    chamferedCube2D = generateChamfered(r, true);
    chamferedCube3D = generateChamfered(r, false);
}

function generateChamfered(r, is2D) {
    let a = r * (Math.sqrt(2.0) - 1.0), b = r, vJ = r / Math.sqrt(2.0);
    let vRaw = []; let signs = [1, -1];
    for (let sx of signs) for (let sy of signs) for (let sz of signs) {
        vRaw.push(createVector(sx*b, sy*a, sz*a), createVector(sx*a, sy*b, sz*a), createVector(sx*a, sy*a, sz*b), createVector(sx*vJ, sy*vJ, sz*vJ));
    }
    let normals = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],[0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1]];
    let az = QUARTER_PI, ax = Math.atan(1.0 / Math.sqrt(2.0)), ay = is2D ? PI : 0;
    return normals.map(n => {
        let nv = createVector(n[0], n[1], n[2]).normalize();
        let faceV = vRaw.filter(p => Math.abs(p.dot(nv) - r) < 0.1);
        if (faceV.length < 3) return [];
        let center = createVector(0,0,0); faceV.forEach(p => center.add(p)); center.div(faceV.length);
        let v1 = p5.Vector.sub(faceV[0], center).normalize(), v2 = p5.Vector.cross(nv, v1).normalize();
        faceV.sort((pA, pB) => Math.atan2(p5.Vector.sub(pB, center).dot(v2), p5.Vector.sub(pB, center).dot(v1)) - Math.atan2(p5.Vector.sub(pA, center).dot(v2), p5.Vector.sub(pA, center).dot(v1)));
        return faceV.map(p => {
            let rp = p.copy();
            let x1 = rp.x * cos(az) - rp.y * sin(az), y1 = rp.x * sin(az) + rp.y * cos(az); rp.x = x1; rp.y = y1;
            let y2 = rp.y * cos(ax) - rp.z * sin(ax), z2 = rp.y * sin(ax) + rp.z * cos(ax); rp.y = y2; rp.z = z2;
            if(is2D){ let x3 = rp.x * cos(ay) + rp.z * sin(ay), z3 = -rp.x * sin(ay) + rp.z * cos(ay); rp.x = x3; rp.z = z3; }
            return rp;
        });
    });
}

function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function keyPressed() {
    if (key === 's' || key === 'S') {
        speedMode = (speedMode + 1) % 3;
        let el = document.getElementById('speed-display');
        if(el) el.innerText = "SPEED: " + speedLabels[speedMode];
    }
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); ortho(-width / 2, width / 2, -height / 2, height / 2, -5000, 5000); }