# NVIDIA NIM / NGC setup for ForgeOS

ForgeOS routes every LLM call through an OpenAI-compatible adapter. NVIDIA
NIM endpoints already speak that protocol, so plugging them in is just a
URL + API key flip — no application code changes.

There are two ways to use NIM:

## 1. Cloud (free credits) — `build.nvidia.com`

1. Sign in at <https://build.nvidia.com> and generate an `nvapi-*` key.
2. Drop it in `deploy/.env`:
   ```env
   FORGEOS_PROVIDER=nim
   FORGEOS_API_BASE=https://integrate.api.nvidia.com/v1
   NIM_API_KEY=nvapi-xxxxxxxxxxxxxxxx
   FORGEOS_MODEL=meta/llama-3.3-70b-instruct
   FORGEOS_CODE_MODEL=qwen/qwen2.5-coder-32b-instruct
   FORGEOS_LONGCTX_MODEL=zai-org/GLM-4.6
   ```
3. `make prod-up` (or `docker compose -f deploy/docker-compose.prod.yml up -d`).

ForgeOS will route each agent to the role-appropriate model:

| Role            | Default model                          |
|-----------------|-----------------------------------------|
| Planner         | `meta/llama-3.3-70b-instruct`           |
| Frontend coder  | `qwen/qwen2.5-coder-32b-instruct`       |
| Backend coder   | `qwen/qwen2.5-coder-32b-instruct`       |
| DevOps          | `qwen/qwen2.5-coder-32b-instruct`       |
| QA              | `qwen/qwen2.5-coder-32b-instruct`       |
| Long-context    | `zai-org/GLM-4.6` (via vLLM)            |
| Explanation     | `meta/llama-3.3-70b-instruct`           |
| Embedding       | `nvidia/nv-embedqa-e5-v5`               |

You can override any of these in **Settings → LLM** in the UI.

## 2. Self-hosted NIM containers (on your GPU)

1. Pull from NGC:
   ```bash
   docker login nvcr.io   # paste your $NGC_API_KEY
   docker pull nvcr.io/nim/meta/llama-3.3-70b-instruct:latest
   docker pull nvcr.io/nim/qwen/qwen2.5-coder-32b-instruct:latest
   ```
2. Uncomment the `nim-llama` block in `deploy/docker-compose.prod.yml`
   (or copy this directory's manifests under your orchestrator of choice).
3. Point ForgeOS at it:
   ```env
   FORGEOS_PROVIDER=nim
   FORGEOS_API_BASE=http://nim-llama:8000/v1
   NIM_API_KEY=ngc            # NIM containers ignore the key but the field is required
   ```

Application code is identical to the cloud path — the OpenAI-compatible
adapter in [backend/app/llm/provider.py](../../backend/app/llm/provider.py)
just sees a different base URL.

## 3. GLM 4.5 / 4.6 via vLLM

There's no first-party NIM for GLM yet, so serve it ourselves with
vLLM. The image is `vllm/vllm-openai`, and the API it exposes is also
OpenAI-compatible — drop in for the `vllm` provider in Settings.

```bash
docker run -d \
  --name vllm-glm \
  --gpus all \
  -p 8001:8000 \
  -e HUGGING_FACE_HUB_TOKEN=$HF_TOKEN \
  vllm/vllm-openai:latest \
  --model zai-org/GLM-4.6 \
  --served-model-name zai-org/GLM-4.6 \
  --gpu-memory-utilization 0.9
```

Then in ForgeOS:

```env
VLLM_API_BASE=http://vllm-glm:8000/v1
FORGEOS_LONGCTX_MODEL=zai-org/GLM-4.6
```

Or uncomment the `vllm` service in `docker-compose.prod.yml` to bundle it.

## 4. Verifying

Hit the health endpoint:

```bash
curl http://localhost:8000/api/health
```

You should see something like:

```json
{
  "status": "ok",
  "provider": "nim",
  "provider_connected": true,
  "demo_mode": false
}
```
