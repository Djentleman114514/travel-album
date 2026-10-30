#!/usr/bin/env python3
"""Export Q85 reading copies, preserving published originals and dimensions.

Requires Pillow. Run manually when artwork changes; committed reading copies
keep the normal Node-only deployment build independent of local source PNGs.
"""
import hashlib
import io
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
QUERY = """
import fs from 'node:fs'; import vm from 'node:vm';
import {books} from './japan/src/books.js';
const context = {window:{}};
vm.runInNewContext(fs.readFileSync('singapore/book-data.js','utf8'), context);
const b = context.window.PHOTOBOOK;
console.log(JSON.stringify({
  japan: books[0].pages.map(p => p.split('/').at(-1)),
  singapore: [b.frontCover.file, ...b.spreads.flatMap(s => [s.left.file, s.right.file]), b.backCover.file]
}));
"""


def main():
    albums = json.loads(subprocess.check_output(
        ['node', '--input-type=module', '-e', QUERY], cwd=ROOT, text=True))
    report = {}
    for album, names in albums.items():
        assets = ROOT / ('japan/public/assets' if album == 'japan' else 'singapore/assets')
        source_dir = ROOT / ('japan/source-assets/pages-png' if album == 'japan'
                             else '.local-workspace/legacy-root/albums/singapore/assets/pages')
        output = assets / 'pages-reader'
        output.mkdir(exist_ok=True)
        records = []
        for name in names:
            original = assets / 'pages' / name
            source = original
            image = Image.open(original).convert('RGB')
            candidate = source_dir / Path(name).with_suffix('.png')
            if candidate.exists():
                png = Image.open(candidate).convert('RGB')
                # Verify against the original Q92 export, so an older PNG with
                # a reused name cannot silently replace revised artwork.
                if png.size == image.size:
                    reference = io.BytesIO()
                    png.save(reference, format='WEBP', quality=92, method=6)
                    reconstructed = Image.open(io.BytesIO(reference.getvalue())).convert('RGB')
                    if ImageChops.difference(reconstructed, image).getbbox() is None:
                        image, source = png, candidate
            buffer = io.BytesIO()
            image.save(buffer, format='WEBP', quality=85, method=6)
            data = buffer.getvalue()
            if len(data) >= original.stat().st_size:
                data = original.read_bytes()
                source = original
            (output / name).write_bytes(data)
            records.append({'file': name, 'source': str(source.relative_to(ROOT)),
                            'original_bytes': original.stat().st_size, 'reader_bytes': len(data)})
        manifest = {
            r['file']: {
                'originalSha256': hashlib.sha256((assets / 'pages' / r['file']).read_bytes()).hexdigest(),
                'readerSha256': hashlib.sha256((output / r['file']).read_bytes()).hexdigest(),
            } for r in records
        }
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        report[album] = records
        before = sum(r['original_bytes'] for r in records)
        after = sum(r['reader_bytes'] for r in records)
        png_count = sum(r['source'].endswith('.png') for r in records)
        first = sum(r['reader_bytes'] for r in records[:5])
        print(f'{album}: {len(records)} pages, {png_count} PNG sources, '
              f'{before / 1048576:.2f} -> {after / 1048576:.2f} MiB '
              f'({1 - after / before:.1%} smaller); first 5 = {first / 1048576:.2f} MiB')
    report_path = ROOT / '.work/reader-assets-report.json'
    report_path.parent.mkdir(exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
