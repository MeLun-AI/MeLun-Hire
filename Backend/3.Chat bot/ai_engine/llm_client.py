import openai
from config.settings import settings
from typing import Optional, Dict, List

class LLMClient:
    """Handles all LLM interactions"""

    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY is not configured. Set it in the environment "
                "or .env file before using LLMClient."
            )

        openai.api_key = settings.OPENAI_API_KEY
        self.model = settings.LLM_MODEL
        self.temperature = settings.LLM_TEMPERATURE
        self.max_tokens = settings.LLM_MAX_TOKENS

    def send_prompt(self, prompt: str, system_message: Optional[str] = None) -> str:
        messages = []

        if system_message:
            messages.append({"role": "system", "content": system_message})

        messages.append({"role": "user", "content": prompt})

        response = openai.ChatCompletion.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens
        )

        return response.choices[0].message["content"].strip()

    def send_json_prompt(self, prompt: str, system_message: Optional[str] = None) -> Dict:
        import json
        text = self.send_prompt(prompt, system_message)
        return json.loads(text)
