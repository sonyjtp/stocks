import json
import os
from typing import Any, Optional

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6380")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)


def get_cached(key: str) -> Optional[Any]:
    try:
        value = redis_client.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        print(f"Cache get error: {e}")
    return None


def set_cached(key: str, value: Any, ttl: int = 300) -> bool:
    try:
        redis_client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        print(f"Cache set error: {e}")
        return False


def invalidate_cache(pattern: str = "*") -> None:
    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
    except Exception as e:
        print(f"Cache invalidate error: {e}")
