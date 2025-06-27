# LLM API Setup Guide: Vertex AI vs AI Studio

## 🔥 **Vertex AI Gemini 2.5 Flash (Recommended for Production)**

### Benefits of Vertex AI
- **2M token context window** (vs 1M for AI Studio)
- **Better rate limits** and enterprise SLA
- **Enhanced safety controls** and content filtering
- **Audit logging** and monitoring
- **VPC support** for secure deployments
- **Model versioning** and lifecycle management

### Setup Method 1: Access Token (Quickest)

```bash
# 1. Install Google Cloud CLI
# Download from: https://cloud.google.com/sdk/docs/install

# 2. Authenticate and set up
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Enable APIs
gcloud services enable aiplatform.googleapis.com

# 4. Get access token (valid for ~1 hour)
gcloud auth print-access-token

# 5. Set environment variables
export GOOGLE_CLOUD_PROJECT='your-project-id'
export VERTEX_PROJECT_ID='your-project-id'  
export GOOGLE_CLOUD_ACCESS_TOKEN='ya29.a0AfB_by...'  # Token from step 4
export VERTEX_LOCATION='us-central1'  # Optional, defaults to us-central1
```

### Setup Method 2: Service Account (Production)

```bash
# 1. Create service account
gcloud iam service-accounts create arbitrage-bot \
    --display-name="Arbitrage Bot Service Account"

# 2. Grant necessary permissions  
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:arbitrage-bot@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# 3. Create and download key
gcloud iam service-accounts keys create ~/arbitrage-bot-key.json \
    --iam-account=arbitrage-bot@YOUR_PROJECT_ID.iam.gserviceaccount.com

# 4. Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/arbitrage-bot-key.json"
export GOOGLE_CLOUD_PROJECT='your-project-id'
```

### Setup Method 3: Application Default Credentials (Local Development)

```bash
# For local development with your user account
gcloud auth application-default login

# Set project
export GOOGLE_CLOUD_PROJECT='your-project-id'
```

## 💡 **AI Studio API (Simpler Alternative)**

### Benefits of AI Studio
- **Simple API key setup** (no Google Cloud project needed)
- **Free tier available** for testing
- **Faster to get started** (5 minutes vs 15-20 minutes)
- **Good for prototyping** and small-scale usage

### Setup (Simple)

```bash
# 1. Get API key from: https://makersuite.google.com/app/apikey
# 2. Set environment variable
export GEMINI_API_KEY='AIzaSyBOTI02uM-...'  # Your actual API key
```

## 🚀 **Running the System**

### With Vertex AI
```bash
# Using access token method
export GOOGLE_CLOUD_PROJECT='your-project-id'
export GOOGLE_CLOUD_ACCESS_TOKEN='ya29.a0...'
node --import tsx/esm scripts/vertex-ai-arbitrage-matching.ts

# Using service account method  
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'
export GOOGLE_CLOUD_PROJECT='your-project-id'
node --import tsx/esm scripts/vertex-ai-arbitrage-matching.ts
```

### With AI Studio
```bash
export GEMINI_API_KEY='AIzaSy...'
node --import tsx/esm scripts/llm-arbitrage-matching.ts
```

### Fallback Demo (No API Required)
```bash
# Test the system without any API keys
node --import tsx/esm scripts/demo-llm-matching.ts
```

## 📊 **API Comparison**

| Feature | Vertex AI Gemini 2.5 Flash | AI Studio Gemini 1.5 Flash |
|---------|----------------------------|----------------------------|
| **Context Window** | 2M tokens | 1M tokens |
| **Rate Limits** | Higher (enterprise) | Standard |
| **Setup Complexity** | Medium-High | Low |
| **Cost** | Pay-per-use | Free tier + pay-per-use |
| **Enterprise Features** | Full | Limited |
| **Security** | VPC, audit logs | Basic |
| **Best For** | Production, scale | Prototyping, small scale |

## 🔧 **Testing Your Setup**

### Quick Authentication Test
```bash
# Test Vertex AI access
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/us-central1/publishers/google/models/gemini-2.5-flash-001"

# Test AI Studio access  
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

### Run System Check
```bash
# The system will automatically detect your authentication method
node --import tsx/esm scripts/vertex-ai-arbitrage-matching.ts
```

## 💰 **Cost Optimization**

### Vertex AI Pricing (Approximate)
- **Input tokens**: ~$0.125 per 1K tokens
- **Output tokens**: ~$0.375 per 1K tokens
- **Typical request**: ~1K input + 200 output = ~$0.20 per batch
- **50 market pairs**: ~$3-5 total cost

### AI Studio Pricing (Approximate)  
- **Free tier**: 15 requests per minute
- **Paid tier**: Similar to Vertex AI but with lower rate limits

### Cost Reduction Strategies
1. **Smart Pre-filtering**: We filter 90% of pairs before LLM evaluation
2. **Batch Processing**: 3-5 pairs per API call  
3. **Caching**: Avoid re-evaluating same pairs
4. **Confidence Thresholds**: Only process high-potential pairs

## 🎯 **Recommended Production Setup**

```bash
# 1. Set up Vertex AI with service account (most robust)
gcloud iam service-accounts create arbitrage-llm
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:arbitrage-llm@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"
gcloud iam service-accounts keys create ~/arbitrage-llm-key.json \
    --iam-account=arbitrage-llm@YOUR_PROJECT_ID.iam.gserviceaccount.com

# 2. Set production environment variables
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/arbitrage-llm-key.json"
export GOOGLE_CLOUD_PROJECT='your-production-project-id'
export VERTEX_LOCATION='us-central1'

# 3. Run production matching
node --import tsx/esm scripts/vertex-ai-arbitrage-matching.ts
```

## ⚠️ **Troubleshooting**

### Common Issues

**"Invalid authentication credentials"**
```bash
# Refresh your access token
gcloud auth print-access-token
export GOOGLE_CLOUD_ACCESS_TOKEN='new-token-here'
```

**"Project not found"**
```bash
# Verify project ID
gcloud config get-value project
gcloud projects list
```

**"API not enabled"**
```bash
# Enable required APIs
gcloud services enable aiplatform.googleapis.com
```

**"Permission denied"**
```bash
# Check IAM permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

### Getting Help
- **Vertex AI Documentation**: https://cloud.google.com/vertex-ai/docs
- **AI Studio Documentation**: https://ai.google.dev/docs
- **Our system will show detailed error messages and suggest fixes**

## 🚀 **Next Steps**

1. **Choose your authentication method** based on your needs
2. **Follow the setup steps** for your chosen method  
3. **Test with our system** - it will guide you through any issues
4. **Start with AI Studio** if you want to get running quickly
5. **Upgrade to Vertex AI** when you're ready for production scale

The system supports both APIs and will automatically detect which authentication method you have configured!