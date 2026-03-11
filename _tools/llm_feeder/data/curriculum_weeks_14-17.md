# Advanced Data Science Curriculum: Weeks 14-17
## Production MLOps & Advanced ML Paradigms (2026 Standards)

---

## 📋 Course Overview

This final phase transforms ML practitioners into production-ready ML Engineers and MLOps specialists. Building on foundational ML/DL knowledge from Weeks 1-13, students will master modern deployment pipelines, operational excellence, optimization techniques, and cutting-edge AI paradigms.

**Prerequisites:** Completion of Weeks 1-13 (Python, Statistics, ML, Deep Learning, Transfer Learning)

---

# WEEK 14: Production Model Deployment

**Theme:** Building Production-Ready ML APIs with Modern Serialization & Containerization

**Learning Objectives:**
- Deploy ML models using FastAPI with production-grade patterns
- Serialize models using ONNX for cross-framework compatibility
- Containerize ML applications with Docker
- Implement API versioning, health checks, and logging

---

## Day 1: FastAPI Fundamentals for ML Services

### Key Concepts
- **REST API Design Principles**: Stateless communication, resource-based routing, HTTP methods
- **FastAPI Architecture**: ASGI framework, async/await patterns, automatic OpenAPI documentation
- **Pydantic Models**: Type validation, request/response schemas, data serialization
- **Dependency Injection**: Reusable components, model loading patterns
- **Path Operations**: GET, POST endpoints for predictions

### Practical Exercise
**Project: Build Your First ML API**
```python
# Create a FastAPI service for a scikit-learn model
# - Load a pre-trained classification model (e.g., iris classifier)
# - Define Pydantic schemas for input/output validation
# - Implement /predict endpoint with proper error handling
# - Add /health endpoint for service monitoring
# - Test with FastAPI's interactive docs (Swagger UI)
```

**Deliverable:** `app.py` with functional FastAPI service serving predictions

---

## Day 2: Advanced FastAPI Patterns & ONNX Introduction

### Key Concepts
- **Async Request Handling**: Non-blocking I/O for concurrent requests
- **Background Tasks**: Long-running processes without blocking responses
- **API Versioning**: URL-based versioning (/v1/predict, /v2/predict)
- **ONNX Format**: Open Neural Network Exchange, cross-framework model representation
- **Model Serialization Comparison**: Pickle vs. Joblib vs. ONNX (portability, security, performance)

### Practical Exercise
**Project: Multi-Version API with ONNX**
```python
# Extend Day 1 API:
# - Convert scikit-learn model to ONNX format using skl2onnx
# - Load ONNX model with onnxruntime
# - Create /v1/predict (original pickle) and /v2/predict (ONNX)
# - Benchmark inference latency between versions
# - Add request logging with timestamps
```

**Deliverable:** Multi-version API with ONNX runtime integration and performance comparison report

---

## Day 3: Docker Fundamentals for ML Applications

### Key Concepts
- **Containerization Benefits**: Environment consistency, reproducibility, isolation
- **Dockerfile Anatomy**: Base images, layer caching, multi-stage builds
- **Python Base Images**: python:3.11-slim vs. nvidia/cuda for GPU workloads
- **Dependency Management**: requirements.txt vs. Poetry for production
- **Docker Compose**: Multi-container orchestration (API + Redis cache)

### Practical Exercise
**Project: Containerize Your FastAPI ML Service**
```dockerfile
# Create production Dockerfile:
# - Use multi-stage build (builder + runtime)
# - Install dependencies in builder stage
# - Copy only necessary artifacts to runtime
# - Use non-root user for security
# - Expose port 8000
# - Build and run container locally
# - Test API inside container
```

**Deliverable:** Dockerfile, docker-compose.yml, and running containerized ML API

---

## Day 4: Multi-Model Serving & Model Registry Patterns

### Key Concepts
- **Model Registry**: Centralized model storage with versioning (filesystem-based)
- **Lazy Loading**: Load models on-demand to reduce memory footprint
- **Model Caching**: In-memory cache for frequently-used models
- **A/B Testing Infrastructure**: Route requests to different model versions
- **Request Routing**: Query parameters or headers for model selection

### Practical Exercise
**Project: Multi-Model Serving API**
```python
# Build API serving multiple models:
# - Create models/ directory with 3 different ONNX models
# - Implement model registry class with lazy loading
# - Add /predict endpoint accepting model_id parameter
# - Implement LRU cache for loaded models (functools.lru_cache)
# - Add /models endpoint listing available models with metadata
# - Test with concurrent requests to different models
```

**Deliverable:** Multi-model API with registry pattern and performance metrics

---

## Day 5: Production Logging, Monitoring & Error Handling

### Key Concepts
- **Structured Logging**: JSON logs with contextual information (request_id, model_version)
- **Python Logging Best Practices**: Logger hierarchy, log levels, handlers
- **Error Handling**: Try-except patterns, custom exceptions, user-friendly error messages
- **Health Checks**: Liveness (service running) vs. Readiness (service ready to handle traffic)
- **Metrics Instrumentation**: Request latency, throughput, error rates

### Practical Exercise
**Project: Production-Grade Logging & Monitoring**
```python
# Enhance your API with:
# - Structured logging using python-json-logger
# - Request middleware to log all incoming requests
# - Custom exception handlers for validation errors, inference errors
# - /health/live and /health/ready endpoints
# - Prometheus metrics endpoint (/metrics) using prometheus-client
# - Track: request_count, inference_latency_seconds, error_count
```

**Deliverable:** API with comprehensive logging and metrics collection

---

## Day 6: API Security & Rate Limiting

### Key Concepts
- **API Authentication**: API keys, JWT tokens, OAuth2 flows
- **Rate Limiting**: Token bucket algorithm, per-user quotas
- **Input Validation**: Schema validation, range checks, anomaly detection
- **CORS Configuration**: Cross-Origin Resource Sharing for web clients
- **Security Headers**: HTTPS enforcement, content security policy

### Practical Exercise
**Project: Secure Your ML API**
```python
# Add security layers:
# - Implement API key authentication using FastAPI Security utilities
# - Add slowapi for rate limiting (10 requests/minute per client)
# - Configure CORS for specific origins
# - Add input validation (value ranges, required fields)
# - Implement request sanitization
# - Test with invalid API keys and rate limit violations
```

**Deliverable:** Secured API with authentication, rate limiting, and validation

---

## Day 7: Deployment Capstone Project

### Project: End-to-End ML Deployment Pipeline

**Scenario:** Deploy a sentiment analysis model as a production-ready service

**Requirements:**
1. **Model Preparation**
   - Train/fine-tune a sentiment classifier (BERT or DistilBERT)
   - Export to ONNX format with quantization

2. **API Development**
   - FastAPI service with /predict and /batch-predict endpoints
   - Pydantic models for request/response validation
   - Async batch processing for multiple texts

3. **Containerization**
   - Multi-stage Dockerfile optimized for size
   - Docker Compose with API + Nginx reverse proxy

4. **Production Features**
   - Structured logging with request tracing
   - Health checks and metrics endpoints
   - API key authentication
   - Rate limiting (100 requests/hour)

5. **Documentation**
   - README with setup instructions
   - API documentation (auto-generated Swagger)
   - Performance benchmarks (latency, throughput)

**Deliverable:** Complete GitHub repository with deployable ML service

---

# WEEK 15: MLOps Engineering & Pipeline Automation

**Theme:** Experiment Tracking, Model Monitoring, and CI/CD for ML Systems

**Learning Objectives:**
- Track experiments and manage model lifecycle with MLflow
- Detect data drift and model degradation with EvidentlyAI
- Build CI/CD pipelines for ML with GitHub Actions
- Implement automated testing for ML systems

---

## Day 1: MLflow Fundamentals - Experiment Tracking

### Key Concepts
- **MLOps Lifecycle**: Data → Training → Validation → Deployment → Monitoring
- **Experiment Tracking**: Parameters, metrics, artifacts, reproducibility
- **MLflow Components**: Tracking, Projects, Models, Registry
- **MLflow Tracking API**: log_param, log_metric, log_artifact, log_model
- **MLflow UI**: Comparing runs, visualizing metrics, searching experiments

### Practical Exercise
**Project: Track Model Experiments with MLflow**
```python
# Set up MLflow tracking:
# - Install MLflow and start tracking server
# - Train 5+ variations of a classification model (varying hyperparameters)
# - Log parameters (learning_rate, n_estimators, max_depth)
# - Log metrics (accuracy, f1_score, training_time)
# - Log artifacts (confusion matrix plot, feature importance)
# - Log trained model with mlflow.sklearn.log_model()
# - Use MLflow UI to identify best model
```

**Deliverable:** MLflow experiment with 5+ tracked runs and analysis report

---

## Day 2: MLflow Model Registry & Model Versioning

### Key Concepts
- **Model Registry**: Centralized repository for versioned models
- **Model Stages**: None → Staging → Production → Archived
- **Model Versioning**: Automatic versioning on registration
- **Model Lineage**: Track experiment runs that produced models
- **Model Serving**: Load models from registry for inference

### Practical Exercise
**Project: Build Model Registry Workflow**
```python
# Create model lifecycle:
# - Register best model from Day 1 to MLflow Registry
# - Transition model through stages (Staging → Production)
# - Add model descriptions and tags
# - Load model from registry using model URI (models:/model-name/Production)
# - Create FastAPI endpoint that serves production model from registry
# - Implement model version comparison endpoint
```

**Deliverable:** FastAPI service loading models from MLflow Registry

---

## Day 3: Data Drift Detection with EvidentlyAI

### Key Concepts
- **Data Drift**: Distribution changes in input features over time
- **Concept Drift**: Changes in relationship between features and target
- **Drift Detection Methods**: Statistical tests (KS test, PSI), distance metrics
- **EvidentlyAI Reports**: Data drift, data quality, target drift
- **Monitoring Triggers**: Automated alerts when drift exceeds thresholds

### Practical Exercise
**Project: Implement Drift Detection Pipeline**
```python
# Build drift monitoring:
# - Load reference dataset (training data)
# - Generate simulated production data with drift (shift feature distributions)
# - Create Evidently Data Drift Report comparing reference vs. current
# - Generate HTML report with visualizations
# - Extract drift metrics programmatically
# - Set alert thresholds (e.g., >30% features drifted)
# - Create Python script for automated monitoring
```

**Deliverable:** Drift detection pipeline with alerting logic and sample reports

---

## Day 4: Model Performance Monitoring with EvidentlyAI

### Key Concepts
- **Model Monitoring Metrics**: Accuracy, precision, recall over time
- **Prediction Drift**: Changes in model output distributions
- **Model Quality Reports**: Classification/regression performance
- **Test Suites**: Automated tests for data quality and model performance
- **Real-time Monitoring**: Batch vs. streaming monitoring patterns

### Practical Exercise
**Project: Build Model Monitoring Dashboard**
```python
# Create monitoring system:
# - Simulate weekly batches of predictions with labels
# - Calculate performance metrics per batch (accuracy, F1)
# - Create Evidently Classification Performance Report
# - Build test suite checking:
#   - Accuracy > 0.85
#   - No feature drift > 0.3
#   - No missing values
# - Generate time-series visualization of metrics
# - Integrate with MLflow (log monitoring metrics)
```

**Deliverable:** Automated monitoring pipeline with pass/fail test suite

---

## Day 5: CI/CD Fundamentals with GitHub Actions

### Key Concepts
- **Continuous Integration (CI)**: Automated testing on code changes
- **Continuous Deployment (CD)**: Automated deployment to staging/production
- **GitHub Actions Workflow**: YAML syntax, triggers, jobs, steps
- **ML-Specific Testing**: Data validation, model tests, API tests
- **Secrets Management**: Storing API keys, credentials securely

### Practical Exercise
**Project: Build ML CI Pipeline**
```yaml
# Create .github/workflows/ci.yml:
# - Trigger on push to main and pull requests
# - Set up Python environment
# - Install dependencies
# - Run linting (flake8, black)
# - Run unit tests (pytest)
# - Run data validation tests
# - Run model training test (quick sanity check)
# - Upload test coverage report
```

**Deliverable:** Working CI pipeline with test automation

---

## Day 6: CD Pipeline - Automated Model Deployment

### Key Concepts
- **CD for ML Systems**: Model training → Testing → Registration → Deployment
- **Deployment Strategies**: Blue-green, canary, shadow deployments
- **Container Registries**: Docker Hub, GitHub Container Registry
- **Automated Testing Gates**: Model accuracy thresholds, drift checks
- **Rollback Strategies**: Reverting to previous model versions

### Practical Exercise
**Project: Build Complete CI/CD Pipeline**
```yaml
# Extend CI with CD workflow:
# 1. CI Job (on PR):
#    - Run tests and validation
# 
# 2. CD Job (on merge to main):
#    - Train model with MLflow tracking
#    - Validate model performance (accuracy > baseline)
#    - Register model to MLflow Registry if validation passes
#    - Build Docker image with new model
#    - Push to GitHub Container Registry
#    - Deploy container to staging environment (docker-compose)
#    - Run smoke tests against staging
#    - Tag as production-ready if tests pass
```

**Deliverable:** Full CI/CD pipeline with automated deployment

---

## Day 7: MLOps Integration Capstone

### Project: Production MLOps Platform

**Scenario:** Build an end-to-end MLOps system for a fraud detection model

**Requirements:**

1. **Experiment Management**
   - Train 10+ model variants with different algorithms and hyperparameters
   - Track all experiments in MLflow
   - Register best model to production stage

2. **Automated Deployment**
   - GitHub Actions pipeline triggered on model improvements
   - Automated validation: accuracy > 0.90, F1 > 0.85
   - Auto-deploy to Docker container if validation passes

3. **Monitoring System**
   - EvidentlyAI drift detection running weekly
   - Model performance monitoring with alerts
   - Integration: Log monitoring results to MLflow

4. **API Service**
   - FastAPI serving production model from MLflow Registry
   - Logging all predictions to database (SQLite)
   - /monitoring endpoint showing drift status

5. **Documentation**
   - MLOps architecture diagram
   - Runbook for model updates
   - Monitoring alert playbook

**Deliverable:** Complete MLOps platform with automated workflows

---

# WEEK 16: Model Optimization & Edge Deployment

**Theme:** Quantization, Mobile/Edge AI, and High-Performance Inference

**Learning Objectives:**
- Apply quantization techniques to reduce model size and latency
- Convert models to TensorFlow Lite for edge devices
- Optimize inference with ONNX Runtime
- Deploy models on resource-constrained environments

---

## Day 1: Introduction to Model Optimization

### Key Concepts
- **Optimization Objectives**: Latency, throughput, memory, energy consumption
- **Model Compression Techniques**: Quantization, pruning, knowledge distillation
- **Quantization Types**: Post-training quantization vs. quantization-aware training
- **Precision Formats**: FP32 → FP16 → INT8 (trade-offs)
- **Hardware Considerations**: CPU, GPU, TPU, mobile processors

### Practical Exercise
**Project: Benchmark Model Performance**
```python
# Create performance baseline:
# - Load a pre-trained image classification model (ResNet50 or MobileNetV2)
# - Measure inference metrics:
#   - Latency (ms per image)
#   - Throughput (images/second)
#   - Model size (MB)
#   - Memory usage (RAM)
# - Profile with different batch sizes (1, 8, 32)
# - Create baseline report for optimization comparison
```

**Deliverable:** Performance benchmark report for unoptimized model

---

## Day 2: Post-Training Quantization (PTQ)

### Key Concepts
- **Dynamic Quantization**: Weights quantized, activations remain FP32
- **Static Quantization**: Weights and activations both quantized to INT8
- **Calibration**: Using representative data to determine quantization parameters
- **Quantization Granularity**: Per-tensor vs. per-channel
- **Accuracy vs. Speed Trade-off**: Measuring accuracy degradation

### Practical Exercise
**Project: Apply INT8 Quantization**
```python
# Quantize model using multiple approaches:
# 
# 1. PyTorch Dynamic Quantization:
#    - Apply torch.quantization.quantize_dynamic
#    - Benchmark latency improvement
# 
# 2. ONNX Quantization:
#    - Convert model to ONNX
#    - Apply onnxruntime.quantization.quantize_dynamic
#    - Compare INT8 vs. FP32 inference
# 
# 3. TensorFlow Quantization:
#    - Use tf.lite.TFLiteConverter with optimization
# 
# Compare results:
# - Model size reduction (%)
# - Latency improvement (%)
# - Accuracy drop (%)
```

**Deliverable:** Quantized models with comprehensive comparison report

---

## Day 3: TensorFlow Lite for Edge Deployment

### Key Concepts
- **TFLite Architecture**: Interpreter, delegates, operators
- **Mobile ML Use Cases**: On-device inference, privacy, offline operation
- **TFLite Conversion**: SavedModel → TFLite FlatBuffer
- **Optimization Options**: Weight quantization, full integer quantization
- **TFLite Delegates**: GPU, NNAPI for hardware acceleration

### Practical Exercise
**Project: Convert Model to TFLite**
```python
# Build TFLite deployment pipeline:
# - Train/load a small classification model (MobileNetV2 on CIFAR-10)
# - Convert to TFLite with post-training quantization
# - Generate representative dataset for calibration
# - Export optimized .tflite model
# - Test inference with TFLite interpreter
# - Measure latency on CPU
# - Compare vs. original TensorFlow model
# - Create metadata for model card (input/output specs)
```

**Deliverable:** Optimized TFLite model with inference script and benchmarks

---

## Day 4: ONNX Runtime Optimization

### Key Concepts
- **ONNX Runtime**: High-performance inference engine for ONNX models
- **Execution Providers**: CPU (OpenMP), CUDA, TensorRT, CoreML
- **Graph Optimizations**: Constant folding, operator fusion, layout optimization
- **Optimization Levels**: Basic, extended, all optimizations
- **Session Options**: Intra/inter-op parallelism, memory patterns

### Practical Exercise
**Project: Optimize with ONNX Runtime**
```python
# Apply ONNX Runtime optimizations:
# - Convert PyTorch/TensorFlow model to ONNX
# - Create InferenceSession with different optimization levels
# - Apply graph optimizations (SessionOptions.graph_optimization_level)
# - Test execution providers (CPUExecutionProvider, CUDAExecutionProvider if available)
# - Benchmark with different thread counts
# - Enable profiling to identify bottlenecks
# - Compare optimized vs. baseline ONNX inference
```

**Deliverable:** Optimized ONNX model with configuration tuning report

---

## Day 5: Real-Time Inference Patterns

### Key Concepts
- **Batching Strategies**: Dynamic batching, adaptive batching
- **Model Serving Frameworks**: NVIDIA Triton, TorchServe, TF Serving
- **Request Queue Management**: Priority queues, timeout handling
- **Caching**: Feature caching, prediction caching for repeated requests
- **Async Inference**: Non-blocking inference with asyncio

### Practical Exercise
**Project: Build High-Throughput Inference Service**
```python
# Create optimized inference API:
# - Use ONNX Runtime with optimized model from Day 4
# - Implement dynamic batching (collect requests for 50ms, then batch inference)
# - Add LRU cache for predictions (functools.lru_cache on feature hash)
# - Use async FastAPI endpoints
# - Load-test with locust or wrk
#   - Measure throughput (requests/second)
#   - Measure p50, p95, p99 latency
# - Compare batched vs. single-request performance
```

**Deliverable:** High-performance API with load testing results

---

## Day 6: Edge Deployment & Mobile Integration

### Key Concepts
- **Edge Computing**: Processing at data source vs. cloud
- **Mobile Frameworks**: TFLite (Android/iOS), Core ML (iOS), PyTorch Mobile
- **Model Deployment**: Embedding models in apps, over-the-air updates
- **Resource Constraints**: Battery, memory, storage limitations
- **Federated Learning**: Training on edge devices without data centralization

### Practical Exercise
**Project: Simulate Edge Deployment**
```python
# Create edge inference simulation:
# - Use TFLite model from Day 3
# - Build Python script simulating edge device constraints:
#   - Limit CPU threads to 2
#   - Simulate memory constraints
#   - Measure battery impact (CPU time * power coefficient)
# - Implement model update mechanism (download new .tflite file)
# - Add fallback logic (if inference fails, use simple rule-based system)
# - Create performance report for edge deployment
```

**Deliverable:** Edge deployment simulation with resource usage analysis

---

## Day 7: Optimization Capstone Project

### Project: Deploy Optimized Model to Production

**Scenario:** Optimize and deploy a real-time object detection model

**Requirements:**

1. **Model Selection & Training**
   - Use YOLO or MobileNet-SSD
   - Train on custom dataset (or use pre-trained)

2. **Optimization Pipeline**
   - Apply INT8 quantization
   - Convert to ONNX and TFLite
   - Benchmark all variants (FP32, FP16, INT8)

3. **Multi-Platform Deployment**
   - Cloud API: ONNX Runtime with FastAPI
   - Edge Simulation: TFLite with resource constraints
   - Comparison table (latency, size, accuracy)

4. **Production Features**
   - Dynamic batching for cloud API
   - Model versioning (serve multiple optimized variants)
   - Automatic format selection based on client capability

5. **Performance Report**
   - Benchmark methodology
   - Optimization impact analysis
   - Deployment recommendations

**Deliverable:** Multi-format deployment with optimization comparison

---

# WEEK 17: Advanced ML Paradigms

**Theme:** Generative AI and Reinforcement Learning

**Learning Objectives:**
- Understand and implement Generative Adversarial Networks (GANs)
- Explore Diffusion Models for image generation
- Master Reinforcement Learning fundamentals (Q-Learning, DQN)
- Deploy advanced models to production

---

## Day 1: Generative Adversarial Networks (GANs) - Fundamentals

### Key Concepts
- **GAN Architecture**: Generator vs. Discriminator (adversarial training)
- **Training Dynamics**: Minimax game, Nash equilibrium
- **Loss Functions**: Binary cross-entropy, Wasserstein loss
- **Mode Collapse**: When generator produces limited variety
- **Training Tricks**: Label smoothing, gradient penalty, spectral normalization

### Practical Exercise
**Project: Build Your First GAN**
```python
# Implement DCGAN (Deep Convolutional GAN):
# - Generator: Transform noise → images
#   - Input: 100-dim random noise
#   - Architecture: Dense → ConvTranspose layers → Tanh
# - Discriminator: Classify real vs. fake
#   - Architecture: Conv layers → Dense → Sigmoid
# - Train on MNIST or Fashion-MNIST
# - Track losses (generator_loss, discriminator_loss)
# - Generate samples every epoch
# - Create GIF showing training progression
```

**Deliverable:** Working DCGAN with generated samples and training analysis

---

## Day 2: Advanced GANs & Conditional Generation

### Key Concepts
- **Conditional GANs (cGAN)**: Controlled generation with class labels
- **StyleGAN**: Style-based architecture for high-quality images
- **CycleGAN**: Unpaired image-to-image translation
- **Progressive Growing**: Training GANs at increasing resolutions
- **Evaluation Metrics**: Inception Score (IS), Fréchet Inception Distance (FID)

### Practical Exercise
**Project: Implement Conditional GAN**
```python
# Build cGAN for controlled generation:
# - Extend Day 1 GAN to accept class labels
# - Generator: Concatenate label embedding with noise
# - Discriminator: Concatenate label with image
# - Train on CIFAR-10 (10 classes)
# - Generate specific classes on demand
# - Calculate FID score comparing real vs. generated
# - Create grid visualization (generate all 10 classes)
```

**Deliverable:** Conditional GAN with class-specific generation capability

---

## Day 3: Diffusion Models - Theory & Implementation

### Key Concepts
- **Diffusion Process**: Forward (add noise) vs. Reverse (denoise)
- **Denoising Diffusion Probabilistic Models (DDPM)**: Markov chain of diffusion steps
- **U-Net Architecture**: Encoder-decoder with skip connections for denoising
- **Noise Scheduling**: Linear vs. cosine schedules
- **Sampling**: Iterative denoising from random noise to image

### Practical Exercise
**Project: Build Simple Diffusion Model**
```python
# Implement DDPM basics:
# - Define forward diffusion process (add Gaussian noise over T steps)
# - Build U-Net denoising model
# - Train on MNIST or small image dataset
# - Implement reverse diffusion sampling
# - Generate images with different sampling steps (T=50, T=100, T=1000)
# - Visualize diffusion process (original → noisy → reconstructed)
# - Compare generation quality vs. GAN
```

**Deliverable:** Working diffusion model with sampling visualization

---

## Day 4: Reinforcement Learning Fundamentals

### Key Concepts
- **RL Framework**: Agent, environment, state, action, reward
- **Markov Decision Process (MDP)**: States, actions, transitions, rewards
- **Value Functions**: State-value V(s), action-value Q(s,a)
- **Bellman Equation**: Recursive relationship for optimal values
- **Exploration vs. Exploitation**: ε-greedy, softmax strategies

### Practical Exercise
**Project: Solve GridWorld with Q-Learning**
```python
# Implement tabular Q-Learning:
# - Create simple GridWorld environment (5x5 grid)
#   - Agent starts at (0,0), goal at (4,4)
#   - Actions: up, down, left, right
#   - Rewards: +100 for goal, -1 per step, -10 for walls
# - Implement Q-table (state-action values)
# - Q-Learning update rule:
#   Q(s,a) ← Q(s,a) + α[r + γ max Q(s',a') - Q(s,a)]
# - Train for 1000 episodes
# - Visualize learned policy (arrows showing best action)
# - Plot cumulative reward over episodes
```

**Deliverable:** Q-Learning agent with visualization of learned policy

---

## Day 5: Deep Q-Networks (DQN)

### Key Concepts
- **Function Approximation**: Neural networks replacing Q-tables
- **Experience Replay**: Store transitions, sample mini-batches
- **Target Network**: Separate network for stable Q-value targets
- **DQN Algorithm**: Q-network training with replay buffer
- **Double DQN**: Reducing overestimation bias

### Practical Exercise
**Project: Implement DQN for CartPole**
```python
# Build DQN agent:
# - Use OpenAI Gym CartPole-v1 environment
# - Q-Network architecture:
#   - Input: 4 state values (position, velocity, angle, angular velocity)
#   - Hidden: 2 layers (128 units each) with ReLU
#   - Output: 2 Q-values (left, right)
# - Implement experience replay buffer (10,000 transitions)
# - Implement target network (soft updates every 100 steps)
# - Train with ε-greedy exploration (ε decay from 1.0 to 0.01)
# - Plot training progress (episode rewards, avg Q-values)
# - Test trained agent (render environment)
```

**Deliverable:** DQN agent solving CartPole with training curves

---

## Day 6: Production Deployment of Advanced Models

### Key Concepts
- **Serving Generative Models**: Streaming generation, batching, caching
- **RL Model Serving**: Policy deployment, online learning integration
- **Model Size Challenges**: GANs/Diffusion models can be large (optimize with ONNX)
- **Latency Considerations**: Diffusion sampling is slow (distillation techniques)
- **API Design**: Async generation, progress callbacks, result caching

### Practical Exercise
**Project: Deploy Generative Model API**
```python
# Build production API for conditional GAN:
# - Convert cGAN generator to ONNX
# - Create FastAPI service:
#   - POST /generate: Generate image for class label
#   - POST /batch-generate: Generate multiple images
#   - GET /samples: Return cached samples
# - Implement async generation with background tasks
# - Add image caching (Redis or filesystem)
# - Return images as base64 or URLs
# - Add generation progress tracking (for diffusion models)
# - Containerize with Docker
```

**Deliverable:** Deployed generative model API with caching

---

## Day 7: Final Capstone Project

### Project: End-to-End AI System with Advanced Paradigms

**Scenario:** Build an AI-powered creative assistant combining all Week 17 concepts

**Option A: Image Generation Platform**
1. **Model Training**
   - Train conditional GAN or small diffusion model on custom dataset
   - Implement multiple generation modes (GAN, Diffusion)

2. **Optimization**
   - Quantize models to INT8
   - Benchmark generation latency

3. **Deployment**
   - FastAPI with /generate endpoint
   - MLflow tracking for generation experiments
   - Frontend UI (simple HTML/JS) for interaction

4. **MLOps Integration**
   - CI/CD pipeline for model updates
   - Monitoring generation quality with FID scores
   - A/B testing different model versions

**Option B: RL-Powered Recommendation System**
1. **RL Environment**
   - Create custom recommendation environment
   - User simulator with preferences
   - Rewards based on user engagement

2. **Agent Training**
   - Implement DQN or policy gradient agent
   - Train with experience replay
   - Track learning progress in MLflow

3. **Deployment**
   - FastAPI serving trained policy
   - Real-time recommendation endpoint
   - A/B testing RL vs. traditional recommendations

4. **Monitoring**
   - Track reward metrics in production
   - Detect policy degradation
   - Automated retraining triggers

**Requirements for Both:**
- Complete documentation
- Performance benchmarks
- Deployment guide
- Video demo or presentation

**Deliverable:** Production-ready advanced AI system with full MLOps pipeline

---

## 🎓 Course Completion

Upon finishing Week 17, students will have:

✅ **Production Deployment Skills**: FastAPI, Docker, ONNX, multi-model serving  
✅ **MLOps Expertise**: MLflow, EvidentlyAI, GitHub Actions CI/CD  
✅ **Optimization Mastery**: Quantization, TFLite, edge deployment  
✅ **Advanced AI Knowledge**: GANs, Diffusion Models, Reinforcement Learning  
✅ **Portfolio Projects**: 4 major capstones + daily exercises  
✅ **Industry-Ready Skills**: 2026 MLOps standards compliance  

**Next Steps:**
- Contribute to open-source ML projects
- Build personal AI portfolio
- Apply to ML Engineer / MLOps Engineer roles
- Continue learning: MLOps certifications, advanced RL, LLMs

---

## 📚 Recommended Tools & Technologies

### Week 14 (Deployment)
- FastAPI, Pydantic, Uvicorn
- ONNX, ONNXRuntime, skl2onnx, tf2onnx
- Docker, Docker Compose
- Prometheus, python-json-logger

### Week 15 (MLOps)
- MLflow (tracking, registry)
- EvidentlyAI
- GitHub Actions
- Pytest, pytest-cov

### Week 16 (Optimization)
- ONNX Runtime
- TensorFlow Lite
- PyTorch Quantization
- Locust (load testing)

### Week 17 (Advanced ML)
- PyTorch / TensorFlow
- OpenAI Gym
- Stable-Baselines3 (reference implementations)
- Diffusers library (Hugging Face)

---

*Curriculum designed for 2026 industry standards | Focus on practical, production-ready skills*
