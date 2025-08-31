import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import './App.css';

const App = () => {
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [detector, setDetector] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef(null);
    const canvasRef = useRef(null);
    const imageRef = useRef(null);

    // Initialize face detection model
    useEffect(() => {
        const loadModel = async () => {
            try {
                await tf.ready();
                const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
                const detectorConfig = {
                    runtime: 'tfjs',
                    refineLandmarks: true,
                    maxFaces: 1,
                };
                const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
                setDetector(detector);
                setIsModelLoaded(true);
            } catch (error) {
                console.error('Error loading model:', error);
                setErrorMessage('Failed to load face detection model. Please refresh the page.');
            }
        };
        loadModel();
    }, []);

    // Calculate facial proportions and symmetry
    const calculateFacialMetrics = (landmarks) => {
        // Key facial landmarks indices for MediaPipe Face Mesh
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const noseTip = landmarks[1];
        const leftMouth = landmarks[61];
        const rightMouth = landmarks[291];
        const chin = landmarks[152];
        const forehead = landmarks[10];
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];

        // Calculate distances
        const eyeDistance = Math.sqrt(
            Math.pow(rightEye.x - leftEye.x, 2) +
            Math.pow(rightEye.y - leftEye.y, 2)
        );

        const faceHeight = Math.sqrt(
            Math.pow(chin.x - forehead.x, 2) +
            Math.pow(chin.y - forehead.y, 2)
        );

        const faceWidth = Math.sqrt(
            Math.pow(rightCheek.x - leftCheek.x, 2) +
            Math.pow(rightCheek.y - leftCheek.y, 2)
        );

        const mouthWidth = Math.sqrt(
            Math.pow(rightMouth.x - leftMouth.x, 2) +
            Math.pow(rightMouth.y - leftMouth.y, 2)
        );

        // Golden ratio calculations
        const goldenRatio = 1.618;
        const faceRatio = faceHeight / faceWidth;
        const eyeToMouthRatio = eyeDistance / mouthWidth;

        // Symmetry calculations
        const leftEyeToNose = Math.sqrt(
            Math.pow(leftEye.x - noseTip.x, 2) +
            Math.pow(leftEye.y - noseTip.y, 2)
        );
        const rightEyeToNose = Math.sqrt(
            Math.pow(rightEye.x - noseTip.x, 2) +
            Math.pow(rightEye.y - noseTip.y, 2)
        );
        const symmetryScore = 1 - Math.abs(leftEyeToNose - rightEyeToNose) / Math.max(leftEyeToNose, rightEyeToNose);

        // Calculate individual scores
        const proportionScore = Math.max(0, 1 - Math.abs(faceRatio - goldenRatio) / goldenRatio) * 100;
        const symmetryPercentage = symmetryScore * 100;
        const harmonyScore = Math.max(0, 1 - Math.abs(eyeToMouthRatio - 1.5) / 1.5) * 100;

        // Calculate overall score (weighted average)
        const overallScore = (proportionScore * 0.4 + symmetryPercentage * 0.4 + harmonyScore * 0.2);

        return {
            overallScore: Math.min(95, Math.max(60, overallScore)), // Clamp between 60-95
            proportions: proportionScore,
            symmetry: symmetryPercentage,
            harmony: harmonyScore,
            faceShape: determineFaceShape(faceRatio),
            details: {
                faceRatio: faceRatio.toFixed(2),
                eyeDistance: eyeDistance.toFixed(0),
                faceWidth: faceWidth.toFixed(0),
                faceHeight: faceHeight.toFixed(0)
            }
        };
    };

    const determineFaceShape = (ratio) => {
        if (ratio < 1.3) return 'Round';
        if (ratio < 1.5) return 'Square';
        if (ratio < 1.7) return 'Heart';
        if (ratio < 1.9) return 'Oval';
        return 'Oblong';
    };

    const getScoreColor = (score) => {
        if (score >= 85) return '#4ade80';
        if (score >= 75) return '#84cc16';
        if (score >= 65) return '#facc15';
        return '#fb923c';
    };

    const getScoreDescription = (score) => {
        if (score >= 90) return 'Exceptional facial harmony';
        if (score >= 85) return 'Outstanding features';
        if (score >= 80) return 'Very attractive proportions';
        if (score >= 75) return 'Above average beauty';
        if (score >= 70) return 'Good facial balance';
        if (score >= 65) return 'Pleasant features';
        return 'Unique charm';
    };

    const drawFaceMesh = (landmarks, canvas, ctx) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw face mesh points
        ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
        landmarks.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw key feature connections
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
        ctx.lineWidth = 1;

        // Eye connections
        const eyeIndices = [[33, 133], [263, 362]];
        eyeIndices.forEach(([start, end]) => {
            ctx.beginPath();
            ctx.moveTo(landmarks[start].x, landmarks[start].y);
            ctx.lineTo(landmarks[end].x, landmarks[end].y);
            ctx.stroke();
        });
    };

    const analyzeImage = async () => {
        if (!selectedImage || !detector) return;

        setIsAnalyzing(true);
        setErrorMessage('');

        try {
            const img = imageRef.current;
            const faces = await detector.estimateFaces(img);

            if (faces.length === 0) {
                setErrorMessage('No face detected. Please upload a clear front-facing photo.');
                setIsAnalyzing(false);
                return;
            }

            const face = faces[0];
            const metrics = calculateFacialMetrics(face.keypoints);

            // Draw face mesh on canvas
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            drawFaceMesh(face.keypoints, canvas, ctx);

            setAnalysisResult(metrics);
        } catch (error) {
            console.error('Analysis error:', error);
            setErrorMessage('Failed to analyze image. Please try another photo.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setErrorMessage('Please upload an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setSelectedImage(e.target.result);
            setAnalysisResult(null);
            setErrorMessage('');
        };
        reader.readAsDataURL(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleImageUpload(e);
    };

    const resetAnalysis = () => {
        setSelectedImage(null);
        setAnalysisResult(null);
        setErrorMessage('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="app">
            <header className="header">
                <h1 className="title">
                    <span className="gradient-text">Face Beauty Analyzer</span>
                </h1>
                <p className="subtitle">
                    Advanced facial proportion and symmetry analysis using AI
                </p>
            </header>

            <main className="main-content">
                {!selectedImage ? (
                    <div
                        className={`upload-area ${isDragging ? 'dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div className="upload-content">
                            <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <polyline points="17 8 12 3 7 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <line x1="12" y1="3" x2="12" y2="15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <h2>Upload Your Photo</h2>
                            <p>Drag and drop an image here, or click to browse</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="file-input"
                            />
                            <button className="upload-button">
                                Choose Image
                            </button>
                        </div>
                        {!isModelLoaded && (
                            <div className="loading-model">
                                <div className="spinner"></div>
                                <p>Loading AI model...</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="analysis-container">
                        <div className="image-section">
                            <div className="image-wrapper">
                                <img
                                    ref={imageRef}
                                    src={selectedImage}
                                    alt="Face to analyze"
                                    onLoad={() => analyzeImage()}
                                />
                                <canvas
                                    ref={canvasRef}
                                    className="overlay-canvas"
                                />
                            </div>
                            <button onClick={resetAnalysis} className="new-photo-btn">
                                Upload New Photo
                            </button>
                        </div>

                        {isAnalyzing && (
                            <div className="analyzing">
                                <div className="spinner"></div>
                                <p>Analyzing facial features...</p>
                            </div>
                        )}

                        {analysisResult && !isAnalyzing && (
                            <div className="results-section">
                                <div className="score-card main-score">
                                    <div className="score-circle" style={{
                                        background: `conic-gradient(${getScoreColor(analysisResult.overallScore)} ${analysisResult.overallScore * 3.6}deg, #1f2937 0deg)`
                                    }}>
                                        <div className="score-inner">
                                            <span className="score-value">{Math.round(analysisResult.overallScore)}</span>
                                            <span className="score-label">Overall Score</span>
                                        </div>
                                    </div>
                                    <p className="score-description">{getScoreDescription(analysisResult.overallScore)}</p>
                                </div>

                                <div className="metrics-grid">
                                    <div className="metric-card">
                                        <h3>Proportions</h3>
                                        <div className="metric-value" style={{ color: getScoreColor(analysisResult.proportions) }}>
                                            {Math.round(analysisResult.proportions)}%
                                        </div>
                                        <p>Golden ratio alignment</p>
                                    </div>
                                    <div className="metric-card">
                                        <h3>Symmetry</h3>
                                        <div className="metric-value" style={{ color: getScoreColor(analysisResult.symmetry) }}>
                                            {Math.round(analysisResult.symmetry)}%
                                        </div>
                                        <p>Facial balance</p>
                                    </div>
                                    <div className="metric-card">
                                        <h3>Harmony</h3>
                                        <div className="metric-value" style={{ color: getScoreColor(analysisResult.harmony) }}>
                                            {Math.round(analysisResult.harmony)}%
                                        </div>
                                        <p>Feature coordination</p>
                                    </div>
                                </div>

                                <div className="details-card">
                                    <h3>Face Analysis Details</h3>
                                    <div className="detail-row">
                                        <span>Face Shape:</span>
                                        <span className="detail-value">{analysisResult.faceShape}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>Face Ratio:</span>
                                        <span className="detail-value">{analysisResult.details.faceRatio}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>Ideal Ratio:</span>
                                        <span className="detail-value">1.618 (Golden Ratio)</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {errorMessage && (
                            <div className="error-message">
                                <p>{errorMessage}</p>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <footer className="footer">
                <p>Powered by TensorFlow.js and MediaPipe Face Mesh</p>
                <p className="disclaimer">For entertainment purposes only. Beauty is subjective and diverse.</p>
            </footer>
        </div>
    );
};

export default App;