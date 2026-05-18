"""S3 / MinIO-backed `ArtifactStore` (aioboto3)."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import aioboto3

from app.config import (
    S3_ACCESS_KEY,
    S3_BUCKET,
    S3_ENDPOINT,
    S3_REGION,
    S3_SECRET_KEY,
)
from app.storage.base import ArtifactStore

logger = logging.getLogger(__name__)
_SKIP = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}


class S3ArtifactStore(ArtifactStore):
    def __init__(self) -> None:
        self.bucket = S3_BUCKET
        self.endpoint = S3_ENDPOINT
        self._session = aioboto3.Session(
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
        )
        self._ensured = False

    def _client(self):
        return self._session.client("s3", endpoint_url=self.endpoint or None)

    async def _ensure_bucket(self) -> None:
        if self._ensured:
            return
        try:
            async with self._client() as s3:
                try:
                    await s3.head_bucket(Bucket=self.bucket)
                except Exception:
                    await s3.create_bucket(Bucket=self.bucket)
            self._ensured = True
        except Exception as exc:
            logger.warning("S3 ensure-bucket failed (%s); will retry on next call", exc)

    async def put_object(self, key: str, data: bytes, content_type: Optional[str] = None) -> str:
        await self._ensure_bucket()
        async with self._client() as s3:
            extra = {"ContentType": content_type} if content_type else {}
            await s3.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
        return key

    async def get_object(self, key: str) -> bytes:
        async with self._client() as s3:
            resp = await s3.get_object(Bucket=self.bucket, Key=key)
            return await resp["Body"].read()

    async def delete_object(self, key: str) -> None:
        async with self._client() as s3:
            await s3.delete_object(Bucket=self.bucket, Key=key)

    async def list_objects(self, prefix: str) -> list[str]:
        out: list[str] = []
        async with self._client() as s3:
            paginator = s3.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    out.append(obj["Key"])
        return out

    async def put_directory(self, local_dir: str, key_prefix: str) -> int:
        await self._ensure_bucket()
        tasks: list[asyncio.Task] = []
        for root, dirs, files in os.walk(local_dir):
            dirs[:] = [d for d in dirs if d not in _SKIP]
            for f in files:
                src = os.path.join(root, f)
                rel = os.path.relpath(src, local_dir)
                key = f"{key_prefix.rstrip('/')}/{rel.replace(os.sep, '/')}"
                with open(src, "rb") as fh:
                    body = fh.read()
                tasks.append(asyncio.create_task(self.put_object(key, body)))
        if tasks:
            await asyncio.gather(*tasks)
        return len(tasks)

    async def fetch_directory(self, key_prefix: str, local_dir: str) -> None:
        os.makedirs(local_dir, exist_ok=True)
        keys = await self.list_objects(key_prefix)
        async with self._client() as s3:
            for key in keys:
                resp = await s3.get_object(Bucket=self.bucket, Key=key)
                body = await resp["Body"].read()
                rel = key[len(key_prefix.rstrip("/")) + 1 :]
                dst = os.path.join(local_dir, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(dst, "wb") as fh:
                    fh.write(body)

    async def signed_url(self, key: str, expires_seconds: int = 300) -> str:
        async with self._client() as s3:
            return await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_seconds,
            )
