"""
Architect Engine -- LLM Inference Layer

Supports two modes:
  - Local: Ollama (codellama, deepseek-coder)
  - API: Anthropic Claude via REST

Selected via ARCHITECT_LLM_MODE environment variable.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Dict, Optional, Any

from .. import config

logger = logging.getLogger(__name__)


class LLMInferenceError(Exception):
    """Raised when LLM inference fails."""
    pass


class LLMClient:
    """
    Unified LLM client supporting local (Ollama) and API (Anthropic) modes.
    """

    def __init__(self, mode: Optional[str] = None):
        self.mode = mode or config.LLM_MODE

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> Dict[str, Any]:
        """
        Generate a response from the LLM.

        Returns dict with:
            text: str            -- generated text
            model: str           -- model used
            prompt_tokens: int   -- input token estimate
            output_tokens: int   -- output token estimate
            latency_ms: int      -- inference time
            output_hash: str     -- SHA256 of output for dedup
        """
        start = time.time()

        if self.mode == "local":
            result = self._generate_local(system_prompt, user_prompt, max_tokens, temperature)
        elif self.mode == "api":
            result = self._generate_api(system_prompt, user_prompt, max_tokens, temperature)
        else:
            raise LLMInferenceError(f"Unknown LLM mode: {self.mode}")

        elapsed_ms = int((time.time() - start) * 1000)
        result["latency_ms"] = elapsed_ms
        result["output_hash"] = hashlib.sha256(result["text"].encode()).hexdigest()

        logger.info(
            "LLM [%s] generated %d tokens in %dms",
            result["model"], result["output_tokens"], elapsed_ms,
        )
        return result

    def _generate_local(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> Dict[str, Any]:
        """Generate via Ollama REST API (localhost:11434)."""
        import httpx

        model = config.LOCAL_MODEL
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }

        try:
            resp = httpx.post(
                "http://localhost:11434/api/chat",
                json=payload,
                timeout=120.0,
            )
            resp.raise_for_status()
            data = resp.json()

            text = data.get("message", {}).get("content", "")
            return {
                "text": text,
                "model": model,
                "prompt_tokens": data.get("prompt_eval_count", 0),
                "output_tokens": data.get("eval_count", 0),
            }
        except httpx.ConnectError:
            raise LLMInferenceError(
                "Cannot connect to Ollama at localhost:11434. "
                "Is Ollama running? Try: ollama serve"
            )
        except Exception as e:
            raise LLMInferenceError(f"Ollama error: {e}")

    def _generate_api(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> Dict[str, Any]:
        """Generate via Anthropic Claude API."""
        import httpx

        api_key = config.ANTHROPIC_API_KEY
        if not api_key:
            raise LLMInferenceError(
                "ANTHROPIC_API_KEY not set. Either:\n"
                "  1. Set ANTHROPIC_API_KEY environment variable\n"
                "  2. Switch to local mode: ARCHITECT_LLM_MODE=local"
            )

        model = config.API_MODEL
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt},
            ],
        }

        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()

            # Extract text from content blocks
            text_parts = []
            for block in data.get("content", []):
                if block.get("type") == "text":
                    text_parts.append(block["text"])

            text = "\n".join(text_parts)
            usage = data.get("usage", {})

            return {
                "text": text,
                "model": model,
                "prompt_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
            }
        except httpx.HTTPStatusError as e:
            raise LLMInferenceError(f"Anthropic API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise LLMInferenceError(f"Anthropic error: {e}")
