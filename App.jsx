import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';


// Landmark indices for face parts
const LM = {
    leftEye: [33, 133, 159, 145, 153, 144],
    rightEye: [362, 263, 386, 374, 380, 373],
    leftInner: 133, rightInner: 362,
    leftOuter: 33, rightOuter: 263,
    noseBridgeTop: 168, noseTip: 1, noseLeft: 97, noseRight: 326,
    chin: 152, faceLeft: 234, faceRight: 454,
    browLeftMid: 55, browRightMid: 285
};

// Utility functions
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function meanPoint(points) { const n = points.length; const s = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]); return [s[0] / n, s[1] / n]; }
function getPts(landmarks, idxs) { return idxs.map(i => [landmarks[i].x, landmarks[i].y]); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function scoreFromError(err, tolerance = 0.1) { return clamp(100 * Math.exp(-(err * err) / (2 * tolerance * tolerance)), 0, 100); }

// Compute face metrics
function computeMetrics(landmarks) {
    const pts = landmarks.map(p => [p.x, p.y]);
    const leftEyePts = getPts(landmarks, LM.leftEye);
    const rightEyePts = getPts(landmarks, LM.rightEye);
    const leftEyeCenter = meanPoint(leftEyePts);
    const rightEyeCenter = meanPoint(rightEyePts);
    const eyeCenterMid = [(leftEyeCenter[0] + rightEyeCenter[0]) / 2, (leftEyeCenter[1] + rightEyeCenter[1]) / 2];
    const faceLeft = [landmarks[LM.faceLeft].x, landmarks[LM.faceLeft].y];
    const faceRight = [landmarks[LM.faceRight].x, landmarks[LM.faceRight].y];
    const faceWidth = dist(faceLeft, faceRight);
    const chin = [landmarks[LM.chin].x, landmarks[LM.chin].y];
    const noseBridgeTop = [landmarks[LM.noseBridgeTop].x, landmarks[LM.noseBridgeTop].y];
    const faceLength = dist(noseBridgeTop, chin) * 1.4;
    const midlineX = eyeCenterMid[0];

    // Symmetry
    const pairs = [[LM.leftOuter, LM.rightOuter], [LM.leftInner, LM.rightInner], [LM.browLeftMid, LM.browRightMid], [LM.noseLeft, LM.noseRight]];
    const symErrs = pairs.map(([l, r]) => {
        const L = [landmarks[l].x, landmarks[l].y];
        const R = [landmarks[r].x, landmarks[r].y];
        const Rm = [2 * midlineX - R[0], R[1]];
        return dist(L, Rm);
    });
    const symmetryErr = symErrs.reduce((a, b) => a + b, 0) / symErrs.length;
    const symmetryNorm = symmetryErr / (faceWidth || 1e-6);
    const symmetryScore = scoreFromError(symmetryNorm, 0.04);

    // Golden ratio
    const lw = faceLength / (faceWidth || 1e-6);
    const goldenTarget = 1.618;
    const goldenErr = Math.abs(lw - goldenTarget) / goldenTarget;
    const goldenScore = scoreFromError(goldenErr, 0.15);

    // Rule of Fifths
    const leftEyeW = dist([landmarks[LM.leftOuter].x, landmarks[LM.leftInner].y], [landmarks[LM.leftInner].x, landmarks[LM.leftInner].y]);
    const rightEyeW = dist([landmarks[LM.rightInner].x, landmarks[LM.rightOuter].y], [landmarks[LM.rightOuter].x, landmarks[LM.rightOuter].y]);
    const eyeW = (leftEyeW + rightEyeW) / 2;
    const fifths = (faceWidth || 1e-6) / (eyeW || 1e-6);
    const fifthsErr = Math.abs(fifths - 5) / 5;
    const fifthsScore = scoreFromError(fifthsErr, 0.18);

    // Eye gap
    const innerGap = dist([landmarks[LM.leftInner].x, landmarks[LM.leftInner].y], [landmarks[LM.rightInner].x, landmarks[LM.rightInner].y]);
    const eyeGapRatio = innerGap / (eyeW || 1e-6);
    const eyeGapErr = Math.abs(eyeGapRatio - 1);
    const eyeGapScore = scoreFromError(eyeGapErr, 0.25);

    return { symmetryScore, goldenScore, fifthsScore, eyeGapScore, raw: { lw, fifths, eyeGapRatio, symmetryNorm } };
}

function weightedScore(metrics, weights) {
    const { symmetryScore, goldenScore, fifthsScore, eyeGapScore } = metrics;
    const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    return (symmetryScore * weights.symmetry + goldenScore * weights.golden + fifthsScore * weights.fifths + eyeGapScore * weights.eyeGap) / wSum;
}

export default function App() {
    const [model, setModel] = useState(null);
    const [loading, setLoading] = useState(false);
    const [imgSrc, setImgSrc] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [score, setScore] = useState(null);
    const [weights] = useState({ symmetry: 40, golden: 25, fifths: 20, eyeGap: 15 });
    const canvasRef = useRef(null);
    const imgRef = useRef(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            await tf.setBackend('webgl');
            const m = await faceLandmarksDetection.load(faceLandmarksDetection.SupportedPackages.mediapipeFacemesh, { maxFaces: 1, shouldLoadIrisModel: true });
            if (mounted) setModel(m);
            setLoading(false);
        })();
        return () => { mounted = false };
    }, []);

    const handleFile = (file) => {
        if (!file) return;
        setImgSrc(URL.createObjectURL(file));
        setMetrics(null);
        setScore(null);
    };

    const analyze = async () => {
        if (!model || !imgRef.current) return;
        setLoading(true);
        try {
            const preds = await model.estimateFaces({ input: imgRef.current, predictIrises: true, flipHorizontal: false });
            if (!preds || !preds[0]) { setMetrics(null); setScore(null); setLoading(false); return; }
            const lm = preds[0].scaledMesh.map(([x, y]) => ({ x, y }));
            const m = computeMetrics(lm);
            const s = weightedScore(m, weights);
            setMetrics(m);
            setScore(s);
            draw(lm);
        } finally { setLoading(false); }
    };

    const draw = (landmarks) => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        // Draw key points
        ctx.fillStyle = '#22c55e';
        const idxs = [...LM.leftEye, ...LM.rightEye, LM.leftInner, LM.rightInner, LM.leftOuter, LM.rightOuter, LM.noseTip, LM.noseLeft, LM.noseRight, LM.noseBridgeTop, LM.faceLeft, LM.faceRight, LM.chin, LM.browLeftMid, LM.browRightMid];
        for (const i of idxs) { const p = landmarks[i]; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); }
    };

    return (
        <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
            <h2>Face Geometry & Beauty Score — Desktop</h2>
            <input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} />
            <div style={{ marginTop: 8 }}>
                {imgSrc ? (
                    <div style={{ position: 'relative', maxHeight: '70vh', overflow: 'auto' }}>
                        <img ref={imgRef} src={imgSrc} alt="face" style={{ display: 'block', maxWidth: '100%' }} />
                        <canvas ref={canvasRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />
                    </div>
                ) : (<div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Upload an image to begin</div>)}
            </div>
            <div style={{ marginTop: 12 }}>
                <button onClick={analyze} disabled={!imgSrc || loading}>{loading ? 'Loading...' : 'Analyze'}</button>
                <button onClick={() => { setImgSrc(null); setMetrics(null); setScore(null); }}>Reset</button>
            </div>
            <div style={{ marginTop: 12 }}>
                <div><strong>Score:</strong> {score ? score.toFixed(1) : '—'}</div>
                {metrics && (
                    <ul>
                        <li>Symmetry: {metrics.symmetryScore.toFixed(1)}</li>
                        <li>Length:Width: {metrics.goldenScore.toFixed(1)} (actual {metrics.raw.lw.toFixed(2)})</li>
                        <li>Rule of Fifths: {metrics.fifthsScore.toFixed(1)} (actual {metrics.raw.fifths.toFixed(2)})</li>
                        <li>Eye Gap: {metrics.eyeGapScore.toFixed(1)} (actual {metrics.raw.eyeGapRatio.toFixed(2)})</li>
                    </ul>
                )}
            </div>
        </div>
    );
}
