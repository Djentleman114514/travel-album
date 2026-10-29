#!/usr/bin/env python3
"""Create web-sized, metadata-free photo galleries from local originals."""
import concurrent.futures
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETS = [
    (Path('/Users/mochahemocha/Downloads/日本照片'), ROOT / 'japan/public/assets/originals'),
    (Path('/Users/mochahemocha/Downloads/新加坡相册'), ROOT / 'singapore/assets/originals'),
]

def convert(item):
    source, target, index = item
    for folder, size, quality in [('thumbs', 480, 5), ('photos', 2000, 4)]:
        output = target / folder / f'{index:03}.jpg'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-map_metadata', '-1',
                        '-vf', f'scale=w={size}:h={size}:force_original_aspect_ratio=decrease:force_divisible_by=2',
                        '-frames:v', '1', '-q:v', str(quality), str(output)], check=True)

for source, target in SETS:
    photos = sorted(p for p in source.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'})
    for folder in ['thumbs', 'photos']:
        (target / folder).mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(convert, [(p, target, i) for i, p in enumerate(photos, 1)]))
    (target / 'manifest.json').write_text(json.dumps([{'id': f'{i:03}', 'name': p.stem} for i, p in enumerate(photos, 1)], ensure_ascii=False), encoding='utf-8')
    print(f'{source.name}: {len(photos)} photos')
