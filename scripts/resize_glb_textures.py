from __future__ import annotations

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def align_four(data: bytearray, fill: int = 0) -> None:
    while len(data) % 4:
        data.append(fill)


def resize_image(data: bytes, mime_type: str, max_size: int, jpeg_quality: int) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        if mime_type == "image/jpeg":
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            image.save(output, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)
        elif mime_type == "image/png":
            image.save(output, format="PNG", optimize=True, compress_level=9)
        else:
            return data
        return output.getvalue()


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or total_length != len(raw):
        raise ValueError(f"Unsupported GLB: {path}")

    offset = 12
    document: dict | None = None
    binary = b""
    while offset < len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
    if document is None:
        raise ValueError(f"Missing JSON chunk: {path}")
    return document, binary


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    json_data = bytearray(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    align_four(json_data, 0x20)
    bin_data = bytearray(binary)
    align_four(bin_data)
    total_length = 12 + 8 + len(json_data) + 8 + len(bin_data)
    output = bytearray(struct.pack("<III", 0x46546C67, 2, total_length))
    output.extend(struct.pack("<II", len(json_data), JSON_CHUNK))
    output.extend(json_data)
    output.extend(struct.pack("<II", len(bin_data), BIN_CHUNK))
    output.extend(bin_data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output)


def process(input_path: Path, output_path: Path, max_size: int, jpeg_quality: int) -> None:
    document, binary = read_glb(input_path)
    buffer_views = document.get("bufferViews", [])
    image_views = {
        image["bufferView"]: image.get("mimeType", "")
        for image in document.get("images", [])
        if "bufferView" in image
    }

    rebuilt = bytearray()
    resized_count = 0
    before_images = 0
    after_images = 0
    for index, view in enumerate(buffer_views):
        start = int(view.get("byteOffset", 0))
        end = start + int(view["byteLength"])
        payload = binary[start:end]
        mime_type = image_views.get(index)
        if mime_type:
            before_images += len(payload)
            payload = resize_image(payload, mime_type, max_size, jpeg_quality)
            after_images += len(payload)
            resized_count += 1
        align_four(rebuilt)
        view["byteOffset"] = len(rebuilt)
        view["byteLength"] = len(payload)
        rebuilt.extend(payload)

    align_four(rebuilt)
    document["buffers"][0]["byteLength"] = len(rebuilt)
    write_glb(output_path, document, bytes(rebuilt))
    print(
        f"{input_path.name}: {resized_count} textures, "
        f"{before_images / 1048576:.2f} MB -> {after_images / 1048576:.2f} MB, "
        f"output {output_path.stat().st_size / 1048576:.2f} MB"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-size", type=int, required=True)
    parser.add_argument("--jpeg-quality", type=int, default=78)
    args = parser.parse_args()
    process(args.input, args.output, args.max_size, args.jpeg_quality)


if __name__ == "__main__":
    main()
