# Model Upgrade: Qwen2.5:7b

## What Changed
Upgraded from `llama3.2:3b` to `qwen2.5:7b` for dramatically better natural language understanding.

## Why Qwen2.5:7b?
- **Structured Output**: Excellent at JSON generation and instruction following
- **Natural Language Understanding**: Much better at interpreting user intent
- **Size**: 7b parameters vs 3b (more capable while still free)
- **Specialization**: Optimized for coding and structured tasks

## Setup Instructions
```bash
# Install the model
ollama pull qwen2.5:7b

# Update server/.env
OLLAMA_MODEL=qwen2.5:7b
```

## Expected Improvements
- "delete focus time" should work without requiring "delete all focus time"
- Better understanding of synonyms (focus = studying = 🎯)
- More accurate intent detection for calendar operations
- Fewer back-and-forth clarifications needed

## Performance
- Model size: ~4.7GB
- Inference speed: Similar to llama3.2:3b
- Memory usage: ~8GB RAM recommended