import logging
import os
import sys

_LOG_LEVEL = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

# Suppress noisy third-party loggers
logging.getLogger("yfinance").setLevel(logging.ERROR)
logging.getLogger("peewee").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)


class ColoredFormatter(logging.Formatter):
    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[92m",  # Bright green
        "WARNING": "\033[93m",  # Yellow
        "ERROR": "\033[91m",  # Bright red
        "CRITICAL": "\033[95m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelname, self.RESET)
        orig_level = record.levelname
        orig_msg = record.msg
        record.levelname = f"{color}{record.levelname:<8}{self.RESET}"
        record.msg = f"{color}{record.msg}{self.RESET}"
        out = super().format(record)
        record.levelname = orig_level
        record.msg = orig_msg
        return out


_formatter = ColoredFormatter(
    fmt="%(asctime)s  %(levelname)s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(_LOG_LEVEL)
        logger.propagate = False  # prevent double-logging via uvicorn root handler
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(_LOG_LEVEL)
        handler.setFormatter(_formatter)
        logger.addHandler(handler)
    return logger


def configure_uvicorn_logging() -> None:
    """Replace uvicorn's bare 'INFO:     ' handlers with our ColoredFormatter."""
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv = logging.getLogger(name)
        uv.handlers.clear()
        uv.propagate = False
        uv.setLevel(_LOG_LEVEL)
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(_LOG_LEVEL)
        handler.setFormatter(_formatter)
        uv.addHandler(handler)
