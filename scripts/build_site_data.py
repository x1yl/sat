"""
build_site_data.py

Takes the output of extract_questions.py (questions.json + the cropped
PNG images in WORK_DIR/images) and prepares it for the web site:

  1. Converts every cropped PNG to WebP (quality 82) -- roughly halves
     the total image payload with no visible quality loss for this kind
     of text/line-art content.
  2. Rewrites the image filenames in the question data to point at the
     new .webp files.
  3. Writes data.js -- a single JS file that assigns the question array
     to a global `QUESTIONS` const, which index.html includes directly
     via a <script> tag. (Using a script tag instead of fetch() means
     the site works when opened straight from the filesystem, e.g.
     double-clicking index.html, with no local server and no CORS
     issues.)

Usage:
    python3 extract_questions.py      # run this first
    python3 build_site_data.py

Requires: Pillow.
    pip install pillow --break-system-packages
"""

import json, os, glob
from PIL import Image

WORK_DIR = r"C:\Users\kevin\Downloads\sat\scripts"
SRC_IMG_DIR = os.path.join(WORK_DIR, "images")
SRC_JSON = os.path.join(WORK_DIR, "questions.json")

SITE_DIR = r"C:\Users\kevin\Downloads\sat"
DST_IMG_DIR = os.path.join(SITE_DIR, "images")
DST_DATA_JS = os.path.join(SITE_DIR, "data.js")

WEBP_QUALITY = 82


def convert_images_to_webp():
    os.makedirs(DST_IMG_DIR, exist_ok=True)
    # clear any stale images from a previous run
    for f in glob.glob(os.path.join(DST_IMG_DIR, "*")):
        os.remove(f)

    files = glob.glob(os.path.join(SRC_IMG_DIR, "*.png"))
    print(f"converting {len(files)} images to webp...")
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGB")
        name = os.path.splitext(os.path.basename(f))[0] + ".webp"
        im.save(os.path.join(DST_IMG_DIR, name), "WEBP", quality=WEBP_QUALITY, method=6)
        if i % 150 == 0:
            print(f"  {i}/{len(files)}")
    print("done converting images")


def write_data_js():
    with open(SRC_JSON) as f:
        questions = json.load(f)

    for q in questions:
        q["front_images"] = [f.replace(".png", ".webp") for f in q["front_images"]]
        q["back_images"] = [f.replace(".png", ".webp") for f in q["back_images"]]

    os.makedirs(SITE_DIR, exist_ok=True)
    with open(DST_DATA_JS, "w") as f:
        f.write("const QUESTIONS = ")
        json.dump(questions, f, separators=(",", ":"))
        f.write(";\n")

    print(
        f"wrote {DST_DATA_JS} ({os.path.getsize(DST_DATA_JS)} bytes, {len(questions)} questions)"
    )


if __name__ == "__main__":
    convert_images_to_webp()
    write_data_js()
